import {
  addCandidate,
  addPosition,
  applyOrder,
  attachExistingCandidate,
  closeRound,
  closeRoundIfDue,
  createElection,
  createHistory,
  credentialVoters,
  nextPositionStatus,
  ok,
  openElection,
  openRound,
  removeCandidate,
  removePosition,
  revokeVoter,
  suggestOrder,
  updateCandidate,
  updateElection,
  updatePosition,
  pushSnapshot,
  type AddCandidateInput,
  type AddPositionInput,
  type CreateElectionInput,
  type CredentialVotersInput,
  type DomainContext,
  type OpenRoundInput,
  type Result,
  type UpdateCandidateInput,
  type UpdateElectionInput,
  type UpdatePositionInput,
} from '@voto/domain';
import type { Election, ElectionSummaryDTO, NextPositionDTO } from '@voto/shared';
import { httpErrorFor } from '../http/errors';
import type {
  Clock,
  CodeGenerator,
  ElectionRecord,
  ElectionRepository,
  Notifier,
  Scheduler,
} from '../ports';
import { toAdminElectionDTO, toElectionSummaryDTO, toVoterStateDTO } from './presenters';

/** Dependências do `ElectionService`: portas e os ajustes da configuração que ele usa. */
export interface ElectionServiceDeps {
  readonly electionRepository: ElectionRepository;
  readonly clock: Clock;
  readonly scheduler: Scheduler;
  readonly notifier: Notifier;
  /** Fonte dos códigos de eleitor (a unicidade global é conferida pelo serviço). */
  readonly codeGenerator: CodeGenerator;
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
   * @returns Um resumo por eleição (vazio se ele ainda não criou nenhuma).
   */
  async listElections(adminId: string): Promise<ElectionSummaryDTO[]> {
    const records = await this.deps.electionRepository.listByAdmin(adminId);
    return records.map((record) => toElectionSummaryDTO(record.current));
  }

  /**
   * Lê a eleição para o painel. Se havia um prazo vencido que o timer não fechou (ex.:
   * reinício do servidor), fecha a rodada, salva e notifica; senão não grava nada.
   *
   * @param adminId - Admin autenticado; precisa ser o dono da eleição.
   * @param electionId - Eleição alvo.
   * @returns O registro atual, já com o prazo vencido aplicado.
   * @throws {HttpError} 404 `ELECTION_NOT_FOUND` ou 403 `FORBIDDEN`.
   */
  async getElection(adminId: string, electionId: string): Promise<ElectionRecord> {
    const record = await this.loadOwned(adminId, electionId);
    // `closeRoundIfDue` devolve a mesma instância quando nada vence: aí não há o que gravar.
    if (closeRoundIfDue(record.current, this.newContext()) === record.current) return record;
    return this.commit(record, (election) => ok(election));
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
    return nextPositionStatus(closeRoundIfDue(record.current, this.newContext()));
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
    const loaded = await this.loadOwned(adminId, electionId);
    const codes = await this.generateUniqueCodes(input.count);
    const record = await this.commit(loaded, (election, ctx) => {
      const result = credentialVoters(election, input, fixedCodes(codes), ctx);
      return result.ok ? ok(result.value.election) : result;
    });
    return { record, codes };
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
   * Fluxo único de todo comando do admin (§8.2): carrega, autoriza e aplica o comando.
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
    return this.commit(await this.loadOwned(adminId, electionId), command);
  }

  /**
   * Aplica um comando a um registro já carregado e autorizado. Se o domínio recusar, nada é
   * salvo nem notificado.
   *
   * @param record - Registro lido do repositório.
   * @param command - Comando do domínio a aplicar sobre a eleição atual.
   * @returns O registro salvo, com a versão incrementada e o estado anterior no histórico.
   * @throws {HttpError} 409 `VERSION_CONFLICT` se outro comando salvou antes.
   * @throws {DomainError} Erro de negócio devolvido pelo comando.
   */
  private async commit(record: ElectionRecord, command: ElectionCommand): Promise<ElectionRecord> {
    const ctx = this.newContext();

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
