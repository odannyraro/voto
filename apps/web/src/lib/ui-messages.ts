import type { ErrorCode } from '@voto/shared';

const API_ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
  INVALID_CODE: 'Este código não é válido. Confira os caracteres e tente novamente.',
  VOTER_REVOKED: 'Este código foi revogado. Peça ajuda à administração da eleição.',
  INVALID_CREDENTIALS: 'Usuário ou senha incorretos.',
  INVALID_TOKEN: 'Sua sessão expirou. Entre novamente.',
  FORBIDDEN: 'Você não tem permissão para realizar esta ação.',
  VALIDATION_ERROR: 'Confira os dados informados e tente novamente.',
  RATE_LIMITED: 'Muitas tentativas em pouco tempo. Aguarde um momento e tente novamente.',
  ELECTION_NOT_FOUND: 'Esta eleição não foi encontrada.',
  INVALID_ELECTION_NAME: 'Informe um nome válido para a eleição.',
  INVALID_VOTING_DURATION:
    'A duração da votação deve ser um número inteiro entre 5 e 3.600 segundos.',
  ELECTION_NOT_DRAFT: 'Esta ação só está disponível antes de abrir a eleição.',
  ELECTION_NOT_OPEN: 'Esta ação só está disponível enquanto a eleição está aberta.',
  ELECTION_FINISHED: 'Esta eleição já foi encerrada.',
  NO_POSITIONS: 'Adicione ao menos um cargo antes de abrir a eleição.',
  POSITION_NOT_FOUND: 'Este cargo não foi encontrado.',
  INVALID_POSITION_TITLE: 'Informe um nome válido para o cargo.',
  DUPLICATE_POSITION_TITLE: 'Já existe um cargo com este nome nesta eleição.',
  INVALID_TIEBREAK_RULE: 'A regra de desempate selecionada não é válida.',
  POSITION_HAS_CANDIDATES: 'Remova as candidaturas deste cargo antes de removê-lo.',
  POSITION_NOT_PENDING: 'Este cargo não está aguardando votação.',
  POSITION_NOT_AWAITING_RUNOFF: 'Este cargo não está aguardando um segundo turno.',
  CONFIRMATION_MISMATCH: 'O texto de confirmação não corresponde ao nome do cargo.',
  INVALID_QUEUE_ORDER: 'A ordem dos cargos mudou. Atualize a página e tente novamente.',
  CANDIDATE_NOT_FOUND: 'Este candidato não foi encontrado.',
  INVALID_CANDIDATE_NAME: 'Informe um nome válido para a pessoa candidata.',
  INVALID_CANDIDATE_AGE: 'A idade informada para a pessoa candidata não é válida.',
  INVALID_REMAINING_MONTHS: 'O tempo restante na universidade não é válido.',
  INVALID_APPLICATIONS: 'Confira os cargos pretendidos pela pessoa candidata.',
  INVALID_FIRST_CHOICE: 'A primeira opção deve estar entre os cargos pretendidos.',
  CANDIDATE_ALREADY_ELECTED: 'Um candidato eleito não pode ser removido.',
  CANDIDATE_ON_BALLOT: 'A pessoa candidata não pode ser removida enquanto estiver em uma cédula.',
  INVALID_VOTER_COUNT: 'A quantidade de eleitores informada não é válida.',
  INVALID_VOTER_LABELS: 'Confira os rótulos informados para os eleitores.',
  DUPLICATE_VOTER_CODE: 'O código de acesso já está em uso. Gere novos códigos.',
  VOTER_NOT_FOUND: 'Este eleitor não foi encontrado.',
  NO_CREDENTIALED_VOTERS: 'Gere códigos de acesso antes de abrir a eleição.',
  NO_ELIGIBLE_CANDIDATES: 'Não há candidatos aptos para este cargo.',
  ROUND_IN_PROGRESS: 'Aguarde a rodada em andamento terminar.',
  RUNOFF_PENDING: 'Resolva o segundo turno pendente antes de continuar.',
  ROUND_NOT_FOUND: 'Esta rodada não foi encontrada.',
  ROUND_NOT_OPEN: 'Esta rodada não está aberta para votação.',
  ROUND_NOT_CLOSED: 'Esta ação só está disponível após o encerramento da rodada.',
  ROUND_NOT_LATEST: 'Esta ação só está disponível para a rodada mais recente.',
  ROUND_EXPIRED: 'O prazo desta votação terminou.',
  VOTER_NOT_ELIGIBLE: 'Seu código não está habilitado para esta rodada.',
  VOTER_ALREADY_VOTED: 'Seu voto nesta rodada já foi registrado.',
  INVALID_CHOICE: 'Esta opção não está disponível na cédula.',
  NOTHING_TO_UNDO: 'Não há nenhuma ação para desfazer.',
  NOT_FOUND: 'O recurso solicitado não foi encontrado.',
  INTERNAL_ERROR: 'Ocorreu um erro inesperado. Tente novamente.',
  VERSION_CONFLICT: 'A eleição foi atualizada em outra sessão. Atualize a página.',
};

/**
 * Traduz um erro da API para uma orientação que possa ser entendida pelo usuário.
 *
 * @param code - Código estruturado retornado pelo servidor.
 * @returns Mensagem em português ou uma orientação geral quando não há tradução específica.
 */
export function getApiErrorMessage(code: ErrorCode): string {
  return (
    API_ERROR_MESSAGES[code] ??
    'Não foi possível concluir a solicitação. Confira os dados e tente novamente.'
  );
}
