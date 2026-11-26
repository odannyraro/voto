import { type HttpError, httpErrorFor } from '../http/errors';

// Erros que toda implementação dos repositórios lança, escritos uma vez só para a memória e
// o Postgres não divergirem (a suíte de contrato exige o mesmo comportamento das duas).

/**
 * @param id - Id repetido.
 * @returns Erro de programação: o serviço criou duas eleições com o mesmo id.
 */
export function electionAlreadyExists(id: string): Error {
  return new Error(`Election ${id} already exists`);
}

/**
 * @returns Erro 404 `ELECTION_NOT_FOUND`: tentativa de gravar uma eleição que não existe.
 */
export function electionNotFound(): HttpError {
  return httpErrorFor('ELECTION_NOT_FOUND', 'Election does not exist');
}

/**
 * @returns Erro 409 `VERSION_CONFLICT`: a eleição mudou entre a leitura e a gravação.
 */
export function versionConflict(): HttpError {
  return httpErrorFor('VERSION_CONFLICT', 'Election was changed by someone else');
}

/**
 * @param id - Id repetido.
 * @returns Erro de programação: já há um admin com esse id.
 */
export function adminIdTaken(id: string): Error {
  return new Error(`Admin id ${id} already exists`);
}

/**
 * @param username - Nome de usuário repetido.
 * @returns Erro de um admin criado com um nome de usuário já usado.
 */
export function adminUsernameTaken(username: string): Error {
  return new Error(`Admin username ${username} already exists`);
}
