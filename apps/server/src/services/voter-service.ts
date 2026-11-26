import type { CastVoteBody, Voter, VoterStateDTO } from '@voto/shared';
import { httpErrorFor, type HttpError } from '../http/errors';
import type { Clock, ElectionRecord, ElectionRepository } from '../ports';
import type { AuthService } from './auth';
import type { ElectionService } from './election-service';
import { toVoterStateDTO } from './presenters';

/** Dependências do `VoterService`. */
export interface VoterServiceDeps {
  readonly electionRepository: ElectionRepository;
  /** Aplica o prazo vencido e registra os votos (salva, reagenda e notifica). */
  readonly elections: ElectionService;
  /** Emite o token de sessão do eleitor. */
  readonly auth: AuthService;
  /** Fornece o `serverNow` do estado. */
  readonly clock: Clock;
}

/** Resposta de `POST /voter/session`. */
export interface VoterSession {
  readonly token: string;
  readonly electionId: string;
  readonly electionName: string;
}

/** Casos de uso do eleitor: entrar com o código, consultar a tela dele e votar. */
export class VoterService {
  /**
   * @param deps - Repositório, serviço de eleições, auth e relógio.
   */
  constructor(private readonly deps: VoterServiceDeps) {}

  /**
   * Abre a sessão de um eleitor a partir do código que o admin lhe entregou.
   *
   * @param code - Código de acesso, já em maiúsculas.
   * @returns O token do eleitor e a eleição a que ele pertence.
   * @throws {HttpError} 404 `INVALID_CODE` ou 403 `VOTER_REVOKED`.
   */
  async startSession(code: string): Promise<VoterSession> {
    const owner = await this.deps.electionRepository.findByVoterCode(code);
    if (!owner) throw httpErrorFor('INVALID_CODE', 'Unknown voter code');

    const record = await this.deps.electionRepository.get(owner.electionId);
    const voter = findVoter(record, owner.voterId);
    // Só acontece se o índice de códigos e a eleição divergirem; para o eleitor é código inválido.
    if (!record || !voter) throw httpErrorFor('INVALID_CODE', 'Unknown voter code');
    assertNotRevoked(voter);

    const token = await this.deps.auth.issueVoterToken(owner);
    return { token, electionId: record.current.id, electionName: record.current.name };
  }

  /**
   * Diz o que a tela do eleitor deve mostrar agora. Se uma rodada venceu (prazo mais a
   * tolerância do voto) e o timer não a fechou, fecha antes (salva e notifica).
   *
   * @param voterId - Eleitor autenticado (do token).
   * @param electionId - Eleição do token.
   * @returns O estado da tela do eleitor.
   * @throws {HttpError} 401 `INVALID_TOKEN` se a eleição ou o eleitor não existem mais; 403 `VOTER_REVOKED`.
   */
  async getState(voterId: string, electionId: string): Promise<VoterStateDTO> {
    const record = await this.deps.elections.settleDueRound(electionId);
    const voter = findVoter(record, voterId);
    // Token ainda válido, mas a eleição ou o eleitor sumiram: a sessão deixa de valer.
    if (!record || !voter) throw invalidSession();
    assertNotRevoked(voter);

    return toVoterStateDTO(record.current, voterId, this.deps.clock.now());
  }

  /**
   * Registra o voto do eleitor na rodada aberta. O voto é sigiloso: o domínio guarda quem votou
   * separado de em quem votou. Se este era o último eleitor apto, a rodada fecha na hora.
   *
   * @param voterId - Eleitor autenticado (do token).
   * @param electionId - Eleição do token.
   * @param vote - Rodada e escolha (id do candidato ou `BLANK`).
   * @throws {HttpError} 401 `INVALID_TOKEN` se a eleição não existe mais; 409 `VERSION_CONFLICT`
   *   se a disputa pela gravação persistir em todas as tentativas.
   * @throws {DomainError} `ROUND_NOT_FOUND` (inclusive rodada de outra eleição), `ROUND_NOT_OPEN`,
   *   `ROUND_EXPIRED`, `VOTER_NOT_ELIGIBLE`, `VOTER_REVOKED`, `VOTER_ALREADY_VOTED` ou `INVALID_CHOICE`.
   */
  async castVote(voterId: string, electionId: string, vote: CastVoteBody): Promise<void> {
    const record = await this.deps.elections.castVote(voterId, electionId, vote);
    // Token ainda válido, mas a eleição sumiu: a sessão deixa de valer.
    if (!record) throw invalidSession();
  }
}

/**
 * Procura o eleitor dentro da eleição guardada.
 *
 * @param record - Registro da eleição, ou `null` se ela não existe.
 * @param voterId - Eleitor procurado.
 * @returns O eleitor, ou `undefined` se a eleição ou o eleitor não existem.
 */
function findVoter(record: ElectionRecord | null, voterId: string): Voter | undefined {
  return record?.current.voters.find((voter) => voter.id === voterId);
}

/**
 * Erro de sessão de eleitor que deixou de valer: o token ainda é válido, mas a eleição ou o
 * eleitor dele não existem mais.
 *
 * @returns O erro 401 `INVALID_TOKEN`, pronto para ser lançado.
 */
function invalidSession(): HttpError {
  return httpErrorFor('INVALID_TOKEN', 'Voter session is no longer valid');
}

/**
 * Barra o eleitor cujo código foi revogado: ele não entra nem consulta o estado.
 *
 * @param voter - Eleitor da eleição.
 * @throws {HttpError} 403 `VOTER_REVOKED` se o código foi revogado.
 */
function assertNotRevoked(voter: Voter): void {
  if (voter.status === 'REVOKED') {
    throw httpErrorFor('VOTER_REVOKED', 'This voter code was revoked');
  }
}
