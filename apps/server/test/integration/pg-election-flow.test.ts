import { describe, expect, it } from 'vitest';
import type { AppDeps } from '../../src/app';
import { PgAdminRepository } from '../../src/adapters/pg/pg-admin-repository';
import { PgElectionRepository } from '../../src/adapters/pg/pg-election-repository';
import type { SqlPool } from '../../src/adapters/pg/sql';
import { createMigratedPgMemPool } from '../doubles/pg-mem-pool';
import {
  adminView,
  appWithAdminAna,
  castVotes,
  createMayorRace,
  credentialVotersAndOpen,
  logIn,
  openRound,
  releaseResults,
  startVoterSessions,
  voterState,
} from '../support/http-election-steps';

const VOTER_CODES = ['ABCD2345', 'WXYZ6789', 'HJKM3456'] as const;

/**
 * Repositórios PostgreSQL sobre o banco em memória: dois apps com o mesmo pool enxergam os
 * mesmos dados, como o servidor antes e depois de um reinício.
 *
 * @param pool - Banco já migrado.
 * @returns As dependências que trocam a memória pelo PostgreSQL.
 */
function pgRepositories(pool: SqlPool): Partial<AppDeps> {
  return {
    electionRepository: new PgElectionRepository(pool),
    adminRepository: new PgAdminRepository(pool),
  };
}

describe('full election over HTTP with PostgreSQL repositories', () => {
  it('runs a single-position election from login to released results', async () => {
    const pool = await createMigratedPgMemPool();
    const test = await appWithAdminAna(VOTER_CODES, pgRepositories(pool));
    const admin = await logIn(test);
    const race = await createMayorRace(test, admin);
    await credentialVotersAndOpen(test, admin, {
      electionId: race.electionId,
      count: VOTER_CODES.length,
    });
    const [v1, v2, v3] = await startVoterSessions(test, VOTER_CODES);
    const roundId = await openRound(test, admin, race);

    await castVotes(test, roundId, [
      [v1, race.anaId],
      [v2, race.anaId],
      [v3, race.biaId],
    ]);
    await releaseResults(test, admin, { electionId: race.electionId, roundId });

    expect(await voterState(test, v3)).toMatchObject({
      phase: 'RESULTS',
      result: { outcome: 'ELECTED', electedCandidateId: race.anaId, validVotes: 3 },
    });
  });

  it('keeps the decided election after a restart on the same database', async () => {
    const pool = await createMigratedPgMemPool();
    const before = await appWithAdminAna(VOTER_CODES, pgRepositories(pool));
    const admin = await logIn(before);
    const race = await createMayorRace(before, admin);
    await credentialVotersAndOpen(before, admin, {
      electionId: race.electionId,
      count: VOTER_CODES.length,
    });
    const [v1, v2, v3] = await startVoterSessions(before, VOTER_CODES);
    const roundId = await openRound(before, admin, race);
    await castVotes(before, roundId, [
      [v1, race.anaId],
      [v2, race.anaId],
      [v3, race.biaId],
    ]);
    await before.app.close();

    // Novo processo: nenhum estado em memória, só o que ficou no banco.
    const after = await appWithAdminAna([], pgRepositories(pool));
    const adminAfterRestart = await logIn(after);
    const dto = await adminView(after, adminAfterRestart, race.electionId);

    expect(dto.lastResult).toMatchObject({
      outcome: 'ELECTED',
      electedCandidateId: race.anaId,
      validVotes: 3,
    });
  });
});
