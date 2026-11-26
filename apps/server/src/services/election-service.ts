import {
  addCandidate,
  addPosition,
  annulRound,
  applyOrder,
  attachExistingCandidate,
  cancelPosition,
  castVote,
  closeRound,
  closeRoundIfDue,
  createElection,
  createHistory,
  credentialVoters,
  deferPosition,
  finishElection,
  nextPositionStatus,
  ok,
  openElection,
  openRound,
  openRunoff,
  releaseResults,
  removeCandidate,
  removePosition,
  revokeVoter,
  suggestOrder,
  undo,
  updateCandidate,
  updateElection,
  updatePosition,
  pushSnapshot,
  type AddCandidateInput,
  type AddPositionInput,
  type CreateElectionInput,
  type CastVoteInput,
  type CredentialVotersInput,
  type DomainContext,
  type OpenRoundInput,
  type Result,
  type UpdateCandidateInput,
  type UpdateElectionInput,
  type UpdatePositionInput,
} from '@voto/domain';
import type { Election, ElectionSummaryDTO, NextPositionDTO } from '@voto/shared';
import { HttpError, httpErrorFor } from '../http/errors';
import type {
  Clock,
  CodeGenerator,
  ElectionRecord,
  ElectionRepository,
  Logger,
  Notifier,
  Scheduler,
} from '../ports';
import { KeyedQueue } from './keyed-queue';
import { toAdminElectionDTO, toElectionSummaryDTO, toVoterStateDTO } from './presenters';

/** Dependências do `ElectionService`: portas e os ajustes da configuração que ele usa. */
export interface ElectionServiceDeps {
  readonly electionRepository: ElectionRepository;
  readonly clock: Clock;
  readonly scheduler: Scheduler;
  readonly notifier: Notifier;
  /** Onde registrar falhas que não podem derrubar o processo (ex.: o fechamento por timer). */
  readonly logger: Logger;
  /** Fonte dos códigos de eleitor (a unicidade global é conferida pelo serviço). */
  readonly codeGenerator: CodeGenerator;
  /** Gera ids novos de entidades criadas pelos comandos. */
  readonly newId: () => string;
  /** Tolerância depois do prazo antes de fechar a rodada (compensa a latência do voto). */
  readonly voteGraceMs: number;
  /** Quantos estados anteriores o desfazer guarda. */
  readonly historyLimit: number;
}

/**
 * Quantas vezes um voto tenta ser gravado antes de o `VERSION_CONFLICT` subir. É uma rede de
 * segurança: as gravações de uma eleição já passam por uma fila, então só há conflito se
 * alguém gravar por fora dela (outra instância do servidor, por exemplo).
 */
const MAX_VOTE_ATTEMPTS = 50;

/** Quantas vezes o fechamento por prazo tenta gravar: a mesma rede de segurança do voto. */
const MAX_SETTLE_ATTEMPTS = MAX_VOTE_ATTEMPTS;

/** Tolerância usada pelo timer, que só dispara quando a tolerância do voto já passou. */
const NO_TOLERANCE_MS = 0;

/** Comando do domínio sobre a eleição, já com a entrada da rota embutida. */
type ElectionCommand = (election: Election, ctx: DomainContext) => Result<Election>;

/**
 * Casos de uso do admin sobre uma eleição. Todo comando passa pelo mesmo fluxo
 * (architecture.md §8.2): carregar, autorizar, fechar prazo vencido, aplicar, salvar,
 * reagendar e notificar. As gravações de uma mesma eleição (comandos, votos e fechamento por
 * prazo) esperam a vez numa fila, para cada uma partir do resultado da anterior. A fila é do
 * processo, e por isso precisa haver uma única instância deste serviço e do servidor.
 */
export class ElectionService {
  /** Uma fila de gravações por eleição, neste processo (o servidor roda em uma instância só). */
  private readonly writes = new KeyedQueue();

  /**
   * Cria o serviço; o domínio não é dependência porque é puro e importado direto.
   *
   * @param deps - Portas e configuração do serviço.
   */
  constructor(private readonly deps: ElectionServiceDeps) {}

  /**
   * Cria uma eleição em rascunho para o admin. Não há nada a carregar antes, então não
   * passa pelo fluxo `execute`.
   *
   * @param adminId - Admin autenticado; passa a ser o dono da eleição.
   * @param input - Nome e prazo padrão opcional das rodadas.
   * @returns O registro salvo (versão 0, sem histórico).
   * @throws {DomainError} `INVALID_ELECTION_NAME` ou `INVALID_VOTING_DURATION`.
   */
  async createElection(
    adminId: string,
    input: Omit<CreateElectionInput, 'adminId'>,
  ): Promise<ElectionRecord> {
    const ctx = this.newContext();
    const result = createElection({ ...input, adminId }, ctx);
    if (!result.ok) throw result.error;

    const record = createHistory(result.value);
    await this.deps.electionRepository.create(record);
    this.notifyAll(record, ctx.now);
    return record;
  }

  /**
   * Lista as eleições do admin, em formato resumido, para a tela inicial dele.
   *
   * @param adminId - Admin autenticado; só as eleições dele aparecem.
   * @returns Um resumo por eleição, na ordem de criação (vazio se ele ainda não criou nenhuma).
   */
  async listElections(adminId: string): Promise<ElectionSummaryDTO[]> {
    const records = await this.deps.electionRepository.listByAdmin(adminId);
    return records.map((record) => toElectionSummaryDTO(record.current));
  }

  /**
   * Lê a eleição para o painel. Se uma rodada venceu (prazo mais a tolerância do voto) e o
   * timer não a fechou (ex.: reinício do servidor), fecha, salva e notifica; senão não grava
   * nada.
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @returns O registro atual, já com o prazo vencido aplicado.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND`, 403 `FORBIDDEN` ou, se o fechamento perder
   *   a disputa pela gravação em todas as tentativas, 409 `VERSION_CONFLICT`.
   */
  async getElection(adminId: string, electionId: string): Promise<ElectionRecord> {
    const record = await this.loadOwned(adminId, electionId);
    return this.settleInTurn(record, this.deps.voteGraceMs);
  }

  /**
   * Lê a eleição para quem não é o dono (o eleitor), com o mesmo fechamento de prazo vencido
   * do `getElection`. Não confere dono: quem chama é responsável pela autorização.
   *
   * @param electionId - Eleição alvo.
   * @returns O registro atual já com o prazo vencido aplicado, ou `null` se a eleição não existir.
   * @throws {HttpError} 409 `VERSION_CONFLICT` se o fechamento perder a disputa pela
   *   gravação em todas as tentativas.
   */
  async settleDueRound(electionId: string): Promise<ElectionRecord | null> {
    return this.settleStored(electionId, this.deps.voteGraceMs);
  }

  /**
   * Callback do agendador: fecha a rodada cujo prazo venceu, salvando e notificando só se algo
   * mudou. Roda dentro de um timer, sem ninguém para receber o erro, então qualquer falha vai
   * para o log em vez de derrubar o processo. A rodada que ficar aberta por causa da falha
   * ainda é fechada na próxima leitura ou escrita (fechamento preguiçoso, §8.3).
   *
   * @param electionId - Eleição cujo prazo foi agendado.
   */
  async handleDeadline(electionId: string): Promise<void> {
    try {
      // Sem desconto: este é o horário que já inclui a tolerância, e o `setTimeout` pode
      // adiantar 1 ms, o que com o desconto deixaria a rodada aberta sem outro timer.
      await this.settleStored(electionId, NO_TOLERANCE_MS);
    } catch (err) {
      this.deps.logger.error({ electionId, err }, 'Failed to close the round at its deadline');
    }
  }

  /**
   * Retoma os prazos depois de um reinício: os timers morrem com o processo, então agenda o
   * fechamento de cada rodada que o repositório ainda guarda aberta, no prazo mais a tolerância
   * (§8.3). Um prazo que venceu com o servidor fora do ar dispara logo. Não grava nada.
   */
  async rescheduleOpenRounds(): Promise<void> {
    const records = await this.deps.electionRepository.listAll();
    for (const record of records) this.rescheduleClosing(record.current);
  }

  /**
   * Registra o voto de um eleitor. Salva, reagenda e notifica como os comandos do admin, mas
   * quem autoriza é o token do eleitor (não há dono a conferir), o prazo ganha a tolerância
   * `voteGraceMs`, que compensa a latência de rede, e o voto não é um passo do desfazer.
   *
   * Vários eleitores votam ao mesmo tempo na mesma eleição, então o voto espera a vez na fila
   * da eleição. O prazo é julgado pela chegada, não pela vez. Se ainda assim a gravação perder
   * a disputa (alguém gravou por fora da fila), o voto é reaplicado sobre a eleição relida (o
   * domínio volta a conferir as regras), até `MAX_VOTE_ATTEMPTS` tentativas. Os comandos do
   * admin não repetem: o 409 volta na hora.
   *
   * @param voterId - Eleitor autenticado (do token).
   * @param electionId - Eleição do token.
   * @param input - Rodada e escolha (id do candidato ou `BLANK`).
   * @returns O registro salvo (já fechado, se este foi o último voto), ou `null` se a eleição
   *   não existir mais.
   * @throws {HttpError} 409 `VERSION_CONFLICT` se todas as tentativas perderem a disputa.
   * @throws {DomainError} `ROUND_NOT_FOUND`, `ROUND_NOT_OPEN`, `ROUND_EXPIRED`,
   *   `VOTER_NOT_ELIGIBLE`, `VOTER_REVOKED`, `VOTER_ALREADY_VOTED` ou `INVALID_CHOICE`.
   */
  async castVote(
    voterId: string,
    electionId: string,
    input: Omit<CastVoteInput, 'voterId'>,
  ): Promise<ElectionRecord | null> {
    // Fixado antes de entrar na fila: esperar a vez não pode transformar em atrasado um voto
    // que chegou no prazo.
    const judgedAt = new Date(this.deps.clock.now().getTime() - this.deps.voteGraceMs);
    return this.writes.run(electionId, () =>
      retryOnVersionConflict(MAX_VOTE_ATTEMPTS, () =>
        this.applyVote(electionId, { ...input, voterId }, judgedAt),
      ),
    );
  }

  /**
   * Edita o nome e o prazo padrão da eleição.
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @param input - Campos a alterar; os omitidos ficam como estão.
   * @returns O registro salvo.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` ou 403 `FORBIDDEN`.
   * @throws {DomainError} `ELECTION_FINISHED`, `INVALID_ELECTION_NAME` ou `INVALID_VOTING_DURATION`.
   */
  async updateElection(
    adminId: string,
    electionId: string,
    input: UpdateElectionInput,
  ): Promise<ElectionRecord> {
    return this.execute(adminId, electionId, (election) => updateElection(election, input));
  }

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
   * Edita título ou regra de desempate de um cargo que ainda não foi votado.
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @param positionId - Cargo a editar.
   * @param input - Campos a alterar; os omitidos ficam como estão.
   * @returns O registro salvo, com o cargo alterado.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` ou 403 `FORBIDDEN`.
   * @throws {DomainError} Se o domínio recusar (ex.: `POSITION_NOT_FOUND`, `POSITION_NOT_PENDING`).
   */
  async updatePosition(
    adminId: string,
    electionId: string,
    positionId: string,
    input: UpdatePositionInput,
  ): Promise<ElectionRecord> {
    return this.execute(adminId, electionId, (election) =>
      updatePosition(election, positionId, input),
    );
  }

  /**
   * Remove um cargo da eleição e da fila (só em rascunho e sem candidatos).
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @param positionId - Cargo a remover.
   * @returns O registro salvo, sem o cargo.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` ou 403 `FORBIDDEN`.
   * @throws {DomainError} Se o domínio recusar (ex.: `ELECTION_NOT_DRAFT`, `POSITION_HAS_CANDIDATES`).
   */
  async removePosition(
    adminId: string,
    electionId: string,
    positionId: string,
  ): Promise<ElectionRecord> {
    return this.execute(adminId, electionId, (election) => removePosition(election, positionId));
  }

  /**
   * Aplica a ordem de votação escolhida pelo admin para os cargos da fila.
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @param positionIds - Os mesmos cargos da fila atual, na nova ordem.
   * @returns O registro salvo, com a fila nova.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` ou 403 `FORBIDDEN`.
   * @throws {DomainError} `ELECTION_FINISHED` ou `INVALID_QUEUE_ORDER`.
   */
  async applyQueueOrder(
    adminId: string,
    electionId: string,
    positionIds: readonly string[],
  ): Promise<ElectionRecord> {
    return this.execute(adminId, electionId, (election) => applyOrder(election, positionIds));
  }

  /**
   * Sugere uma ordem de votação. Só leitura: não salva, não agenda nem notifica; a sugestão
   * só vira fila quando o admin a confirma com `applyQueueOrder`.
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @returns Os ids dos cargos da fila na ordem sugerida.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` ou 403 `FORBIDDEN`.
   */
  async suggestQueueOrder(adminId: string, electionId: string): Promise<string[]> {
    const record = await this.loadOwned(adminId, electionId);
    return suggestOrder(record.current);
  }

  /**
   * Cadastra um candidato. Também vale com a eleição aberta, para o admin resolver um cargo
   * que ficou sem concorrentes.
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @param input - Dados pessoais e cargos a que o candidato concorre.
   * @returns O registro salvo, com o candidato novo.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` ou 403 `FORBIDDEN`.
   * @throws {DomainError} Se o domínio recusar (ex.: `POSITION_NOT_FOUND`, `INVALID_FIRST_CHOICE`).
   */
  async addCandidate(
    adminId: string,
    electionId: string,
    input: AddCandidateInput,
  ): Promise<ElectionRecord> {
    return this.execute(adminId, electionId, (election, ctx) => addCandidate(election, input, ctx));
  }

  /**
   * Edita os dados de um candidato que ainda não foi eleito.
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @param candidateId - Candidato a editar.
   * @param input - Campos a alterar; os omitidos ficam como estão.
   * @returns O registro salvo, com o candidato alterado.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` ou 403 `FORBIDDEN`.
   * @throws {DomainError} Se o domínio recusar (ex.: `CANDIDATE_NOT_FOUND`, `CANDIDATE_ALREADY_ELECTED`).
   */
  async updateCandidate(
    adminId: string,
    electionId: string,
    candidateId: string,
    input: UpdateCandidateInput,
  ): Promise<ElectionRecord> {
    return this.execute(adminId, electionId, (election) =>
      updateCandidate(election, candidateId, input),
    );
  }

  /**
   * Remove um candidato que não foi eleito e não está na cédula da rodada aberta.
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @param candidateId - Candidato a remover.
   * @returns O registro salvo, sem o candidato.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` ou 403 `FORBIDDEN`.
   * @throws {DomainError} Se o domínio recusar (ex.: `CANDIDATE_NOT_FOUND`, `CANDIDATE_ON_BALLOT`).
   */
  async removeCandidate(
    adminId: string,
    electionId: string,
    candidateId: string,
  ): Promise<ElectionRecord> {
    return this.execute(adminId, electionId, (election) => removeCandidate(election, candidateId));
  }

  /**
   * Inscreve um candidato já existente em mais um cargo ainda não votado (usado quando o
   * cargo do topo da fila tem candidatos insuficientes).
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @param positionId - Cargo que recebe o candidato.
   * @param candidateId - Candidato a anexar.
   * @returns O registro salvo, com o cargo em `applications` do candidato.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` ou 403 `FORBIDDEN`.
   * @throws {DomainError} Se o domínio recusar (ex.: `POSITION_NOT_FOUND`, `CANDIDATE_ALREADY_ELECTED`).
   */
  async attachCandidate(
    adminId: string,
    electionId: string,
    positionId: string,
    candidateId: string,
  ): Promise<ElectionRecord> {
    return this.execute(adminId, electionId, (election) =>
      attachExistingCandidate(election, positionId, candidateId),
    );
  }

  /**
   * Abre a eleição para votação: a partir daqui os eleitores entram com o código.
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @returns O registro salvo, com a eleição em `OPEN`.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` ou 403 `FORBIDDEN`.
   * @throws {DomainError} `ELECTION_NOT_DRAFT` ou `NO_POSITIONS`.
   */
  async openElection(adminId: string, electionId: string): Promise<ElectionRecord> {
    return this.execute(adminId, electionId, (election) => openElection(election));
  }

  /**
   * Diz o que o admin deve fazer a seguir (abrir o cargo do topo da fila, resolver candidatos
   * insuficientes, abrir o 2º turno...). Só leitura: não salva, não agenda nem notifica.
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @returns O próximo passo, já considerando um prazo vencido que ainda não foi gravado.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` ou 403 `FORBIDDEN`.
   */
  async nextPosition(adminId: string, electionId: string): Promise<NextPositionDTO> {
    const record = await this.loadOwned(adminId, electionId);
    // Fecha em memória o que o prazo já venceu, para a resposta bater com o que a próxima
    // escrita gravaria; a leitura em si não grava nada.
    const settled = closeOverdueRound(record.current, this.newContext(), this.deps.voteGraceMs);
    return nextPositionStatus(settled);
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
   * Fecha a rodada aberta antes do prazo, a pedido do admin, e cancela o fechamento agendado.
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @param roundId - Rodada a fechar.
   * @returns O registro salvo, com a rodada `CLOSED` e o cargo no estado decorrente do resultado.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` ou 403 `FORBIDDEN`.
   * @throws {DomainError} `ROUND_NOT_FOUND` ou `ROUND_NOT_OPEN`.
   */
  async closeRound(adminId: string, electionId: string, roundId: string): Promise<ElectionRecord> {
    return this.execute(adminId, electionId, (election) => closeRound(election, roundId));
  }

  /**
   * Abre o 2º turno de um cargo cujo 1º turno terminou sem maioria e agenda o fechamento
   * automático no prazo. Os finalistas vêm da apuração do 1º turno.
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @param input - Cargo e prazo opcional (padrão: o prazo da eleição).
   * @returns O registro salvo, com a rodada de 2º turno aberta.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` ou 403 `FORBIDDEN`.
   * @throws {DomainError} Se o domínio recusar (ex.: `POSITION_NOT_AWAITING_RUNOFF`, `ROUND_IN_PROGRESS`).
   */
  async openRunoff(
    adminId: string,
    electionId: string,
    input: OpenRoundInput,
  ): Promise<ElectionRecord> {
    return this.execute(adminId, electionId, (election, ctx) => openRunoff(election, input, ctx));
  }

  /**
   * Libera aos eleitores o resultado de uma rodada fechada; até aqui só o admin o via.
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @param roundId - Rodada cujo resultado será liberado.
   * @returns O registro salvo; cada eleitor credenciado recebe o resultado na notificação.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` ou 403 `FORBIDDEN`.
   * @throws {DomainError} `ROUND_NOT_FOUND` ou `ROUND_NOT_CLOSED`.
   */
  async releaseResults(
    adminId: string,
    electionId: string,
    roundId: string,
  ): Promise<ElectionRecord> {
    return this.execute(adminId, electionId, (election) => releaseResults(election, roundId));
  }

  /**
   * Adia um cargo: ele vai para o fim da fila de votação.
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @param positionId - Cargo a adiar.
   * @returns O registro salvo, com a fila reordenada.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` ou 403 `FORBIDDEN`.
   * @throws {DomainError} `ELECTION_FINISHED`, `POSITION_NOT_FOUND` ou `POSITION_NOT_PENDING`.
   */
  async deferPosition(
    adminId: string,
    electionId: string,
    positionId: string,
  ): Promise<ElectionRecord> {
    return this.execute(adminId, electionId, (election) => deferPosition(election, positionId));
  }

  /**
   * Cancela a votação de um cargo (último recurso). O título digitado é a confirmação extra.
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @param positionId - Cargo a cancelar.
   * @param confirmTitle - Título do cargo, digitado pelo admin.
   * @returns O registro salvo, com o cargo `CANCELLED` e fora da fila.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` ou 403 `FORBIDDEN`.
   * @throws {DomainError} `ELECTION_FINISHED`, `POSITION_NOT_FOUND`, `POSITION_NOT_PENDING` ou `CONFIRMATION_MISMATCH`.
   */
  async cancelPosition(
    adminId: string,
    electionId: string,
    positionId: string,
    confirmTitle: string,
  ): Promise<ElectionRecord> {
    return this.execute(adminId, electionId, (election) =>
      cancelPosition(election, positionId, confirmTitle),
    );
  }

  /**
   * Anula uma rodada (aberta ou fechada) e devolve o cargo ao início da fila; cancela o
   * fechamento agendado se ela estava aberta.
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @param roundId - Rodada a anular; precisa ser a última válida do cargo.
   * @returns O registro salvo, com a rodada `ANNULLED`.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` ou 403 `FORBIDDEN`.
   * @throws {DomainError} `ELECTION_FINISHED`, `ROUND_NOT_FOUND` ou `ROUND_NOT_LATEST`.
   */
  async annulRound(adminId: string, electionId: string, roundId: string): Promise<ElectionRecord> {
    return this.execute(adminId, electionId, (election) => annulRound(election, roundId));
  }

  /**
   * Encerra a eleição: depois disso nenhum comando altera mais nada.
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @returns O registro salvo, com a eleição em `FINISHED`.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` ou 403 `FORBIDDEN`.
   * @throws {DomainError} `ELECTION_NOT_OPEN` ou `ROUND_IN_PROGRESS`.
   */
  async finishElection(adminId: string, electionId: string): Promise<ElectionRecord> {
    return this.execute(adminId, electionId, (election) => finishElection(election));
  }

  /**
   * Desfaz o último passo do histórico, restaurando o estado anterior. Só os comandos do
   * admin são passos (votos e fechamentos por prazo não são): voltar um comando descarta
   * também o que aconteceu depois dele.
   * Não empilha um novo snapshot e grava o estado restaurado com a versão **seguinte** à
   * atual: se a versão voltasse no tempo, um cliente com dados velhos escreveria sem
   * `VERSION_CONFLICT`.
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @returns O registro salvo, com o estado restaurado e um estado a menos no histórico.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND`, 403 `FORBIDDEN` ou 409 `VERSION_CONFLICT`.
   * @throws {DomainError} `NOTHING_TO_UNDO` se o histórico estiver vazio.
   */
  async undo(adminId: string, electionId: string): Promise<ElectionRecord> {
    return this.writes.run(electionId, async () => {
      const record = await this.loadOwned(adminId, electionId);
      const result = undo(record);
      if (!result.ok) throw result.error;

      const expectedVersion = record.current.version;
      const restored = { ...result.value.current, version: expectedVersion + 1 };
      const undone = { ...result.value, current: restored };
      return this.persist(undone, expectedVersion, this.newContext());
    });
  }

  /**
   * Credencia eleitores novos. Os códigos são únicos em **todas** as eleições (o eleitor
   * entra só com o código), então o serviço gera e confere cada um antes de chamar o domínio.
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @param input - Quantidade (1 a 500) e rótulos opcionais, na ordem dos eleitores.
   * @returns O registro salvo e os códigos novos, para o admin distribuir (só aparecem aqui
   *   e no painel dele).
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` ou 403 `FORBIDDEN`.
   * @throws {DomainError} `ELECTION_FINISHED`, `INVALID_VOTER_COUNT` ou `INVALID_VOTER_LABELS`.
   */
  async credentialVoters(
    adminId: string,
    electionId: string,
    input: CredentialVotersInput,
  ): Promise<{ record: ElectionRecord; codes: readonly string[] }> {
    const arrivedAt = this.deps.clock.now();
    return this.writes.run(electionId, async () => {
      const loaded = await this.loadOwned(adminId, electionId);
      const codes = await this.generateUniqueCodes(input.count);
      const command: ElectionCommand = (election, ctx) => {
        const result = credentialVoters(election, input, fixedCodes(codes), ctx);
        return result.ok ? ok(result.value.election) : result;
      };
      const record = await this.commit(loaded, command, arrivedAt);
      return { record, codes };
    });
  }

  /**
   * Revoga o código de um eleitor: ele não entra mais nem vota nas próximas rodadas.
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @param voterId - Eleitor a revogar.
   * @returns O registro salvo, com o eleitor `REVOKED`.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` ou 403 `FORBIDDEN`.
   * @throws {DomainError} `ELECTION_FINISHED`, `VOTER_NOT_FOUND` ou `VOTER_REVOKED`.
   */
  async revokeVoter(adminId: string, electionId: string, voterId: string): Promise<ElectionRecord> {
    return this.execute(adminId, electionId, (election) => revokeVoter(election, voterId));
  }

  /**
   * Fluxo único de todo comando do admin (§8.2): na vez da eleição, carrega, autoriza e aplica.
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
    const arrivedAt = this.deps.clock.now();
    return this.writes.run(electionId, async () => {
      const record = await this.loadOwned(adminId, electionId);
      return this.commit(record, command, arrivedAt);
    });
  }

  /**
   * Carrega a eleição, sem conferir dono, e aplica o prazo vencido. Quem fecha por prazo só
   * precisa que a rodada fique fechada: se outro gravou antes, relê e devolve o estado atual.
   *
   * @param electionId - Eleição alvo.
   * @param toleranceMs - Quanto depois do prazo a rodada ainda é considerada aberta.
   * @returns O registro com o prazo aplicado, ou `null` se a eleição não existir.
   * @throws {HttpError} 409 `VERSION_CONFLICT` se todas as tentativas perderem a disputa.
   */
  private async settleStored(
    electionId: string,
    toleranceMs: number,
  ): Promise<ElectionRecord | null> {
    const seen = await this.deps.electionRepository.get(electionId);
    return seen && this.settleInTurn(seen, toleranceMs);
  }

  /**
   * Aplica o prazo vencido sobre uma eleição já lida. Sem nada vencido, devolve a própria
   * leitura, sem esperar ninguém. Havendo o que fechar, espera a vez na fila da eleição e relê,
   * porque quem estava na frente pode ter mudado a rodada (até já tê-la fechado). Se alguém
   * gravar por fora da fila no meio, relê e tenta de novo.
   *
   * @param seen - Registro recém-lido, ainda fora da fila.
   * @param toleranceMs - Quanto depois do prazo a rodada ainda é considerada aberta.
   * @returns O registro com o prazo aplicado.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` se a eleição sumir enquanto se espera; 409
   *   `VERSION_CONFLICT` se todas as tentativas perderem a disputa.
   */
  private async settleInTurn(seen: ElectionRecord, toleranceMs: number): Promise<ElectionRecord> {
    const nothingDue =
      closeOverdueRound(seen.current, this.newContext(), toleranceMs) === seen.current;
    if (nothingDue) return seen;

    const electionId = seen.current.id;
    return this.writes.run(electionId, () =>
      retryOnVersionConflict(MAX_SETTLE_ATTEMPTS, async () =>
        this.settle(await this.load(electionId), toleranceMs),
      ),
    );
  }

  /**
   * Aplica o prazo vencido ao registro: se uma rodada venceu, fecha, salva e notifica;
   * senão não grava nada. O fechamento não é um passo do desfazer.
   *
   * @param record - Registro lido do repositório.
   * @param toleranceMs - Quanto depois do prazo a rodada ainda é considerada aberta.
   * @returns O registro salvo, ou o mesmo registro se nenhum prazo venceu.
   * @throws {HttpError} 409 `VERSION_CONFLICT` se outro comando salvou antes.
   */
  private async settle(record: ElectionRecord, toleranceMs: number): Promise<ElectionRecord> {
    const ctx = this.newContext();
    const settled = closeOverdueRound(record.current, ctx, toleranceMs);
    // Sem nada vencido, a mesma instância volta e não há o que gravar.
    if (settled === record.current) return record;
    const next = nextElection(record, ok(settled));
    // Sem snapshot: com um, o desfazer reabriria a rodada vencida, o timer a fecharia de novo
    // e o admin nunca voltaria para antes dela.
    return this.persist({ ...record, current: next }, record.current.version, ctx);
  }

  /**
   * Aplica um comando a um registro já carregado e autorizado. Se o domínio recusar, nada é
   * salvo nem notificado.
   *
   * @param record - Registro lido do repositório.
   * @param command - Comando do domínio a aplicar sobre a eleição atual.
   * @param arrivedAt - Quando o comando chegou, antes de esperar a vez na fila.
   * @returns O registro salvo, com a versão incrementada e, no histórico, o estado sobre o
   *   qual o comando agiu (já com o prazo vencido aplicado).
   * @throws {HttpError} 409 `VERSION_CONFLICT` se alguém gravou por fora da fila.
   * @throws {DomainError} Erro de negócio devolvido pelo comando.
   */
  private async commit(
    record: ElectionRecord,
    command: ElectionCommand,
    arrivedAt: Date,
  ): Promise<ElectionRecord> {
    const ctx = this.newContext();

    // Fechamento preguiçoso (§8.3): um prazo vencido vale mesmo se o timer se perdeu. É julgado
    // pela chegada do comando: pela vez dele, a espera na fila fecharia a rodada na frente de
    // votos tolerados que chegaram depois e ainda aguardam.
    const arrival = { ...ctx, now: arrivedAt };
    const settled = closeOverdueRound(record.current, arrival, this.deps.voteGraceMs);
    const next = nextElection(record, command(settled, ctx));
    // O passo do desfazer é só o comando: o snapshot já leva a rodada vencida fechada.
    const beforeCommand = { ...record, current: settled };
    const withSnapshot = pushSnapshot(beforeCommand, next, this.deps.historyLimit);
    return this.persist(withSnapshot, record.current.version, ctx);
  }

  /**
   * Faz uma tentativa de voto: relê a eleição, aplica o voto pelo domínio e grava.
   *
   * @param electionId - Eleição do eleitor.
   * @param vote - Rodada, eleitor e escolha.
   * @param judgedAt - Instante comparado ao prazo (a chegada do voto menos a tolerância).
   * @returns O registro salvo, ou `null` se a eleição não existir.
   * @throws {HttpError} 409 `VERSION_CONFLICT` se outra gravação entrou entre a leitura e esta.
   * @throws {DomainError} A regra de votação violada.
   */
  private async applyVote(
    electionId: string,
    vote: CastVoteInput,
    judgedAt: Date,
  ): Promise<ElectionRecord | null> {
    const record = await this.deps.electionRepository.get(electionId);
    if (!record) return null;

    const ctx = this.newContext();
    // Sem fechar o prazo vencido antes: um voto atrasado acharia a rodada já fechada e
    // viraria `ROUND_NOT_OPEN` (409) em vez de `ROUND_EXPIRED` (410). O domínio compara o prazo.
    const next = nextElection(record, castVote(record.current, vote, { ...ctx, now: judgedAt }));
    // Sem snapshot: o desfazer é para os passos do admin. Um por voto expulsaria do histórico
    // (limitado) as decisões dele e faria cada voto regravar dezenas de cópias da eleição.
    return this.persist({ ...record, current: next }, record.current.version, ctx);
  }

  /**
   * Grava o registro novo e deixa o resto do sistema coerente com ele: reagenda o fechamento
   * e notifica admin e eleitores. Comum aos comandos, ao voto, ao fechamento por prazo e ao
   * desfazer.
   *
   * @param next - Registro a gravar, já com a versão incrementada.
   * @param expectedVersion - Versão lida antes do comando (concorrência otimista).
   * @param ctx - Contexto do comando; o instante vira a hora do servidor nas notificações.
   * @returns O mesmo registro, já salvo.
   * @throws {HttpError} 409 `VERSION_CONFLICT` se outro comando salvou antes.
   */
  private async persist(
    next: ElectionRecord,
    expectedVersion: number,
    ctx: DomainContext,
  ): Promise<ElectionRecord> {
    await this.deps.electionRepository.save(next, expectedVersion);

    this.rescheduleClosing(next.current);
    this.notifyAll(next, ctx.now);
    return next;
  }

  /**
   * Gera `count` códigos que não existem em nenhuma eleição nem se repetem na mesma leva;
   * os que colidem são descartados e sorteados de novo.
   *
   * @param count - Quantos códigos gerar.
   * @returns Os códigos, na ordem em que foram aceitos.
   */
  private async generateUniqueCodes(count: number): Promise<string[]> {
    const codes = new Set<string>();
    while (codes.size < count) {
      const code = this.deps.codeGenerator.generate();
      // Sequencial de propósito: cada código é conferido contra o repositório antes do próximo.
      if (!codes.has(code) && !(await this.deps.electionRepository.isCodeTaken(code))) {
        codes.add(code);
      }
    }
    return [...codes];
  }

  /**
   * Monta o contexto do domínio para um comando: relógio e gerador de ids das deps.
   *
   * @returns O contexto com o instante atual.
   */
  private newContext(): DomainContext {
    return { now: this.deps.clock.now(), newId: this.deps.newId };
  }

  /**
   * Carrega uma eleição que precisa existir.
   *
   * @param electionId - Eleição alvo.
   * @returns O registro guardado.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` se não existir.
   */
  private async load(electionId: string): Promise<ElectionRecord> {
    const record = await this.deps.electionRepository.get(electionId);
    if (!record) throw httpErrorFor('ELECTION_NOT_FOUND', `Election ${electionId} does not exist`);
    return record;
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
    const record = await this.load(electionId);
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
    this.deps.scheduler.schedule(closesAt, key, () => this.handleDeadline(election.id));
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

/**
 * Gerador que devolve, em ordem, códigos já escolhidos e conferidos. É a ponte entre a
 * geração assíncrona do serviço e o `credentialVoters` do domínio, que é síncrono.
 *
 * @param codes - Códigos já únicos; o domínio pede exatamente um por eleitor.
 * @returns Um `CodeGenerator` que entrega `codes` na ordem.
 */
function fixedCodes(codes: readonly string[]): CodeGenerator {
  const remaining = [...codes];
  return {
    generate: () => {
      const next = remaining.shift();
      if (next === undefined) throw new Error('More codes requested than were generated');
      return next;
    },
  };
}

/**
 * Prepara para gravação o estado que um comando do domínio produziu: recusa antes de qualquer
 * escrita o que o domínio recusou e dá ao estado a versão seguinte à lida.
 *
 * @param record - Registro lido do repositório, antes do comando.
 * @param result - Resultado do comando sobre a eleição atual.
 * @returns A eleição a gravar.
 * @throws {DomainError} O erro de negócio de `result`, se houver.
 */
function nextElection(record: ElectionRecord, result: Result<Election>): Election {
  if (!result.ok) throw result.error;
  return { ...result.value, version: record.current.version + 1 };
}

/**
 * Fecha a rodada aberta que venceu há mais que a tolerância (ou em que todos os aptos já
 * votaram). É a mesma folga dada ao voto: nenhum caminho fecha uma rodada que ainda o aceita.
 *
 * @param election - Eleição atual.
 * @param ctx - Contexto com o instante atual.
 * @param toleranceMs - Quanto depois do prazo a rodada ainda é considerada aberta.
 * @returns A eleição com a rodada fechada, ou a **mesma** instância se nada venceu.
 */
function closeOverdueRound(election: Election, ctx: DomainContext, toleranceMs: number): Election {
  const tolerantNow = new Date(ctx.now.getTime() - toleranceMs);
  return closeRoundIfDue(election, { ...ctx, now: tolerantNow });
}

/**
 * Repete uma operação enquanto ela perder a disputa pela gravação (concorrência otimista).
 * Só serve para operações que releem o estado a cada tentativa.
 *
 * @param maxAttempts - Total de tentativas, contando a primeira (ao menos 1).
 * @param operation - Operação a executar.
 * @returns O resultado da primeira tentativa que não conflitar.
 * @throws {HttpError} 409 `VERSION_CONFLICT` se a última tentativa também conflitar.
 * @throws {Error} Qualquer outra falha da operação, na hora, sem repetir.
 */
async function retryOnVersionConflict<T>(
  maxAttempts: number,
  operation: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt < maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isVersionConflict(error)) throw error;
    }
  }
  // Última tentativa fora do `try`: se conflitar de novo, o erro sobe para quem chamou.
  return operation();
}

/**
 * Diz se a falha é a de uma gravação que perdeu a disputa para outra.
 *
 * @param error - Valor lançado.
 * @returns `true` para o `HttpError` de código `VERSION_CONFLICT`.
 */
function isVersionConflict(error: unknown): boolean {
  return error instanceof HttpError && error.code === 'VERSION_CONFLICT';
}
