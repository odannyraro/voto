import type { Voter, VoterStateDTO } from '@voto/shared';
import { httpErrorFor } from '../http/errors';
import type { Clock, ElectionRepository } from '../ports';
import type { AuthService } from './auth';
import type { ElectionService } from './election-service';
import { toVoterStateDTO } from './presenters';

/** Dependências do `VoterService`. */
export interface VoterServiceDeps {
  readonly electionRepository: ElectionRepository;
  /** Aplica o prazo vencido (salva e notifica) antes de montar o estado do eleitor. */
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

/** Casos de uso do eleitor: entrar com o código e consultar o que a tela dele mostra. */
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
    const voter = record?.current.voters.find((candidate) => candidate.id === owner.voterId);
    // Só acontece se o índice de códigos e a eleição divergirem; para o eleitor é código inválido.
    if (!record || !voter) throw httpErrorFor('INVALID_CODE', 'Unknown voter code');
    assertNotRevoked(voter);

    const token = await this.deps.auth.issueVoterToken(owner);
    return { token, electionId: record.current.id, electionName: record.current.name };
  }

  /**
   * Diz o que a tela do eleitor deve mostrar agora. Se havia um prazo vencido que o timer
   * não fechou, fecha a rodada antes (salva e notifica).
   *
   * @param voterId - Eleitor autenticado (do token).
   * @param electionId - Eleição do token.
   * @returns O estado da tela do eleitor.
   * @throws {HttpError} 401 `INVALID_TOKEN` se a eleição ou o eleitor não existem mais; 403 `VOTER_REVOKED`.
   */
  async getState(voterId: string, electionId: string): Promise<VoterStateDTO> {
    const record = await this.deps.elections.settleDueRound(electionId);
    const voter = record?.current.voters.find((candidate) => candidate.id === voterId);
    // Token ainda válido, mas a eleição ou o eleitor sumiram: a sessão deixa de valer.
    if (!record || !voter) throw httpErrorFor('INVALID_TOKEN', 'Voter session is no longer valid');
    assertNotRevoked(voter);

    return toVoterStateDTO(record.current, voterId, this.deps.clock.now());
  }
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
