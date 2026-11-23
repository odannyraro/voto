import bcrypt from 'bcryptjs';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { HttpError } from '../http/errors';
import type { AdminRepository, Clock } from '../ports';

/** Dados do token de um administrador. */
export interface AdminClaims {
  readonly role: 'admin';
  readonly adminId: string;
}

/** Dados do token de um eleitor, presos a uma eleição. */
export interface VoterClaims {
  readonly role: 'voter';
  readonly electionId: string;
  readonly voterId: string;
}

/** Conteúdo verificado de um token. */
export type TokenClaims = AdminClaims | VoterClaims;

/** Dependências do `AuthService`. */
export interface AuthServiceDeps {
  readonly adminRepository: AdminRepository;
  /** Fonte da hora para emitir e verificar a validade dos tokens. */
  readonly clock: Clock;
  readonly jwtSecret: string;
  /** Custo do bcrypt (4 nos testes, 10 ou mais em produção). */
  readonly bcryptRounds: number;
  /** Gera o id do admin criado por `seedAdmin`. */
  readonly newId: () => string;
}

const SECONDS_PER_HOUR = 3600;
const ADMIN_TOKEN_TTL_SECONDS = 12 * SECONDS_PER_HOUR;
// architecture §6: o token do eleitor vale "enquanto a eleição durar"; sete dias cobre
// qualquer eleição realista e ainda limita o estrago de um token vazado.
const VOTER_TOKEN_TTL_SECONDS = 7 * 24 * SECONDS_PER_HOUR;
const JWT_ALGORITHM = 'HS256';
// Senha sem dono: serve só para o `login` gastar o mesmo tempo de bcrypt quando o usuário não existe.
const TIMING_DECOY_PASSWORD = 'timing-decoy-password';

// O `jwtVerify` só garante assinatura e validade; o formato das claims é conferido aqui.
const claimsSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('admin'), sub: z.string().min(1) }),
  z.object({
    role: z.literal('voter'),
    sub: z.string().min(1),
    electionId: z.string().min(1),
  }),
]);

/** Autenticação: senhas com bcrypt e tokens JWT (HS256) assinados com `JWT_SECRET`. */
export class AuthService {
  private readonly secretKey: Uint8Array;
  private decoyHash: Promise<string> | undefined;

  /**
   * @param deps - Repositório de admins, relógio, segredo do JWT, custo do bcrypt e gerador de ids.
   */
  constructor(private readonly deps: AuthServiceDeps) {
    this.secretKey = new TextEncoder().encode(deps.jwtSecret);
  }

  /**
   * Gera o hash bcrypt de uma senha, para guardá-la sem expor o texto original.
   *
   * @param password - Senha em texto puro.
   * @returns O hash (com sal embutido), diferente a cada chamada.
   */
  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.deps.bcryptRounds);
  }

  /**
   * Confere uma senha contra um hash guardado.
   *
   * @param password - Senha em texto puro informada pelo usuário.
   * @param hash - Hash produzido por `hashPassword`.
   * @returns `true` se a senha corresponde ao hash.
   */
  verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Emite o token de sessão de um administrador, válido por 12 horas.
   *
   * @param adminId - Id do admin autenticado.
   * @returns O JWT assinado.
   */
  issueAdminToken(adminId: string): Promise<string> {
    return this.sign({ role: 'admin' }, adminId, ADMIN_TOKEN_TTL_SECONDS);
  }

  /**
   * Emite o token de sessão de um eleitor, preso à sua eleição.
   *
   * @param claims - Eleição e eleitor autenticados pelo código de acesso.
   * @returns O JWT assinado.
   */
  issueVoterToken(claims: { electionId: string; voterId: string }): Promise<string> {
    return this.sign(
      { role: 'voter', electionId: claims.electionId },
      claims.voterId,
      VOTER_TOKEN_TTL_SECONDS,
    );
  }

  /**
   * Valida assinatura, validade (pelo `Clock` injetado) e formato de um token.
   *
   * @param token - JWT recebido no cabeçalho `Authorization`.
   * @returns As claims tipadas: admin ou eleitor.
   * @throws {HttpError} 401 `INVALID_TOKEN` se o token for malformado, adulterado, de outro
   *   segredo, expirado ou tiver claims fora do formato esperado.
   */
  async verifyToken(token: string): Promise<TokenClaims> {
    const claims = await this.decode(token);
    if (claims.role === 'admin') return { role: 'admin', adminId: claims.sub };
    return { role: 'voter', electionId: claims.electionId, voterId: claims.sub };
  }

  /**
   * Autentica um admin por usuário e senha.
   *
   * @param username - Nome de usuário.
   * @param password - Senha em texto puro.
   * @returns O token de sessão do admin.
   * @throws {HttpError} 401 `INVALID_CREDENTIALS`, com a mesma resposta para usuário
   *   inexistente e senha errada (não revela quais usuários existem).
   */
  async login(username: string, password: string): Promise<string> {
    const admin = await this.deps.adminRepository.findByUsername(username);
    // Sem admin, compara com um hash de isca: o tempo de resposta não denuncia usuário inexistente.
    const hash = admin?.passwordHash ?? (await this.getDecoyHash());
    const passwordMatches = await this.verifyPassword(password, hash);
    if (!admin || !passwordMatches) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
    }
    return this.issueAdminToken(admin.id);
  }

  /**
   * Cria o admin inicial (lido do ambiente no boot). Idempotente: se o usuário já existe,
   * não faz nada e mantém a senha atual.
   *
   * @param username - Nome de usuário do admin.
   * @param password - Senha em texto puro; só o hash é guardado.
   */
  async seedAdmin(username: string, password: string): Promise<void> {
    if (await this.deps.adminRepository.findByUsername(username)) return;
    const passwordHash = await this.hashPassword(password);
    await this.deps.adminRepository.create({ id: this.deps.newId(), username, passwordHash });
  }

  private sign(
    claims: Record<string, string>,
    subject: string,
    ttlSeconds: number,
  ): Promise<string> {
    const issuedAt = Math.floor(this.deps.clock.now().getTime() / 1000);
    return new SignJWT(claims)
      .setProtectedHeader({ alg: JWT_ALGORITHM })
      .setSubject(subject)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + ttlSeconds)
      .sign(this.secretKey);
  }

  private async decode(token: string): Promise<z.infer<typeof claimsSchema>> {
    try {
      const { payload } = await jwtVerify(token, this.secretKey, {
        algorithms: [JWT_ALGORITHM],
        currentDate: this.deps.clock.now(),
      });
      return claimsSchema.parse(payload);
    } catch {
      throw new HttpError(401, 'INVALID_TOKEN', 'Invalid or expired token');
    }
  }

  private getDecoyHash(): Promise<string> {
    this.decoyHash ??= this.hashPassword(TIMING_DECOY_PASSWORD);
    return this.decoyHash;
  }
}
