import { requireNotFinished } from '../election/guards';
import { findCandidate, findPosition, isElected, replaceCandidate } from '../election/lookup';
import type { Candidate, Election } from '../model';
import { fail, ok, type Result } from '../result';

/**
 * Lista quem pode estar na cédula de um cargo agora: concorre a ele e não foi eleito
 * para nenhum cargo (README: o eleito sai da disputa dos cargos seguintes).
 *
 * @param election - Eleição atual.
 * @param positionId - Id do cargo.
 * @returns Os candidatos aptos, na ordem de cadastro.
 */
export function eligibleCandidates(election: Election, positionId: string): Candidate[] {
  return election.candidates.filter(
    (candidate) =>
      candidate.applications.includes(positionId) && !isElected(election, candidate.id),
  );
}

/**
 * Lista os candidatos que podem ser anexados a um cargo sem concorrentes: ainda não
 * eleitos e que não concorrem a ele.
 *
 * @param election - Eleição atual.
 * @param positionId - Id do cargo.
 * @returns Os candidatos anexáveis, na ordem de cadastro.
 */
export function attachableCandidates(election: Election, positionId: string): Candidate[] {
  return election.candidates.filter(
    (candidate) =>
      !candidate.applications.includes(positionId) && !isElected(election, candidate.id),
  );
}

/**
 * Inclui um candidato já cadastrado na disputa de um cargo pendente. É uma das saídas
 * do README para cargos sem candidatos. A primeira opção do candidato não muda.
 *
 * @param election - Eleição atual.
 * @param positionId - Id do cargo que ganha o candidato.
 * @param candidateId - Id do candidato a anexar.
 * @returns A eleição alterada, ou `ELECTION_FINISHED`, `POSITION_NOT_FOUND`,
 *   `POSITION_NOT_PENDING`, `CANDIDATE_NOT_FOUND` ou `CANDIDATE_ALREADY_ELECTED`.
 */
export function attachExistingCandidate(
  election: Election,
  positionId: string,
  candidateId: string,
): Result<Election> {
  const finished = requireNotFinished(election);
  if (finished) return finished;

  const position = findPosition(election, positionId);
  if (!position) return fail('POSITION_NOT_FOUND', `Position ${positionId} does not exist`);
  if (position.status !== 'PENDING') {
    return fail('POSITION_NOT_PENDING', 'Candidates can only join positions waiting to be voted');
  }

  const candidate = findCandidate(election, candidateId);
  if (!candidate) return fail('CANDIDATE_NOT_FOUND', `Candidate ${candidateId} does not exist`);
  if (isElected(election, candidateId)) {
    return fail(
      'CANDIDATE_ALREADY_ELECTED',
      'An elected candidate cannot run for another position',
    );
  }
  if (candidate.applications.includes(positionId)) return ok(election);

  return ok(
    replaceCandidate(election, {
      ...candidate,
      applications: [...candidate.applications, positionId],
    }),
  );
}
