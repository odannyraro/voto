import {
  addPosition,
  closeRoundIfDue,
  openRound,
  pushSnapshot,
  type AddPositionInput,
  type DomainContext,
  type OpenRoundInput,
  type Result,
} from '@voto/domain';
import type { Election } from '@voto/shared';
import { httpErrorFor } from '../http/errors';
import type { Clock, ElectionRecord, ElectionRepository, Notifier, Scheduler } from '../ports';
import { toAdminElectionDTO, toVoterStateDTO } from './presenters';

/** Dependências do `ElectionService`: portas e os ajustes da configuração que ele usa. */
export interface ElectionServiceDeps {
  readonly electionRepository: ElectionRepository;
  readonly clock: Clock;
  readonly scheduler: Scheduler;
  readonly notifier: Notifier;
  /** Gera ids novos de entidades criadas pelos comandos. */
  readonly newId: () => string;
  /** Tolerância depois do prazo antes de fechar a rodada (compensa a latência do voto). */
  readonly voteGraceMs: number;
  /** Quantos estados anteriores o desfazer guarda. */
  readonly historyLimit: number;
}

/** Comando do domínio sobre a eleição, já com a entrada da rota embutida. */
type ElectionCommand = (election: Election, ctx: DomainContext) => Result<Election>;

/**
 * Casos de uso do admin sobre uma eleição. Todo comando passa pelo mesmo fluxo
 * (architecture.md §8.2): carregar, autorizar, fechar prazo vencido, aplicar, salvar,
 * reagendar e notificar.
 */
export class ElectionService {
  /**
   * Cria o serviço; o domínio não é dependência porque é puro e importado direto.
   *
   * @param deps - Portas e configuração do serviço.
   */
  constructor(private readonly deps: ElectionServiceDeps) {}

  /**
   * Cria um cargo no fim da fila de votação.
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @param input - Título e regra de desempate do cargo.
   * @returns O registro salvo, com o cargo novo.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` ou 403 `FORBIDDEN`.
   * @throws {DomainError} Se o domínio recusar (ex.: `INVALID_POSITION_TITLE`, `ELECTION_NOT_DRAFT`).
   */
  async addPosition(
    adminId: string,
    electionId: string,
    input: AddPositionInput,
  ): Promise<ElectionRecord> {
    return this.execute(adminId, electionId, (election, ctx) => addPosition(election, input, ctx));
  }

  /**
   * Abre o 1º turno de um cargo e agenda o fechamento automático no prazo.
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @param input - Cargo e prazo opcional (padrão: o prazo da eleição).
   * @returns O registro salvo, com a rodada aberta.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` ou 403 `FORBIDDEN`.
   * @throws {DomainError} Se o domínio recusar (ex.: `ROUND_IN_PROGRESS`, `POSITION_NOT_PENDING`).
   */
  async openRound(
    adminId: string,
    electionId: string,
    input: OpenRoundInput,
  ): Promise<ElectionRecord> {
    return this.execute(adminId, electionId, (election, ctx) => openRound(election, input, ctx));
  }

  /**
   * Fluxo único de todo comando do admin (§8.2). Se o domínio recusar, nada é salvo nem
   * notificado.
   *
   * @param adminId - Admin autenticado.
   * @param electionId - Eleição alvo.
   * @param command - Comando do domínio a aplicar sobre a eleição atual.
   * @returns O registro salvo, com a versão incrementada e o estado anterior no histórico.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND`, 403 `FORBIDDEN` ou 409 `VERSION_CONFLICT`.
   * @throws {DomainError} Erro de negócio devolvido pelo comando.
   */
  private async execute(
    adminId: string,
    electionId: string,
    command: ElectionCommand,
  ): Promise<ElectionRecord> {
    const record = await this.loadOwned(adminId, electionId);
    const ctx: DomainContext = { now: this.deps.clock.now(), newId: this.deps.newId };

    // Fechamento preguiçoso (§8.3): um prazo vencido vale mesmo se o timer se perdeu.
    const result = command(closeRoundIfDue(record.current, ctx), ctx);
    if (!result.ok) throw result.error;

    const expectedVersion = record.current.version;
    const next = pushSnapshot(
      record,
      { ...result.value, version: expectedVersion + 1 },
      this.deps.historyLimit,
    );
    await this.deps.electionRepository.save(next, expectedVersion);

    this.rescheduleClosing(next.current);
    this.notifyAll(next, ctx.now);
    return next;
  }

  /**
   * Carrega a eleição e confere se o admin é o dono.
   *
   * @param adminId - Admin autenticado.
   * @param electionId - Eleição alvo.
   * @returns O registro guardado.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` se não existir; 403 `FORBIDDEN` se for de outro admin.
   */
  private async loadOwned(adminId: string, electionId: string): Promise<ElectionRecord> {
    const record = await this.deps.electionRepository.get(electionId);
    if (!record) throw httpErrorFor('ELECTION_NOT_FOUND', `Election ${electionId} does not exist`);
    if (record.current.adminId !== adminId)
      throw httpErrorFor('FORBIDDEN', 'This election belongs to another admin');
    return record;
  }

  /**
   * Deixa o agendamento de fechamento coerente com a eleição salva: agenda para o prazo
   * (mais a tolerância) se há rodada aberta; senão cancela o que houver.
   *
   * @param election - Eleição recém-salva.
   */
  private rescheduleClosing(election: Election): void {
    const key = `round:${election.id}`;
    const open = election.rounds.find((round) => round.status === 'OPEN');
    if (!open) {
      this.deps.scheduler.cancel(key);
      return;
    }
    const closesAt = new Date(Date.parse(open.deadline) + this.deps.voteGraceMs);
    // Placeholder: a B14 troca por `handleDeadline`, que fecha a rodada vencida.
    this.deps.scheduler.schedule(closesAt, key, () => undefined);
  }

  /**
   * Empurra o novo estado: o painel completo ao admin e, a cada eleitor credenciado, o que a
   * tela dele deve mostrar. Eleitores revogados não recebem nada.
   *
   * @param record - Registro recém-salvo.
   * @param now - Instante do comando, enviado como hora do servidor.
   */
  private notifyAll(record: ElectionRecord, now: Date): void {
    const election = record.current;
    this.deps.notifier.adminState(election.id, toAdminElectionDTO(record, now));
    for (const voter of election.voters) {
      if (voter.status !== 'CREDENTIALED') continue;
      this.deps.notifier.voterState(voter.id, toVoterStateDTO(election, voter.id, now));
    }
  }
}
