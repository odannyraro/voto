import { z } from 'zod';

// Schemas Zod dos corpos de requisição da API (architecture.md §6.1 e §6.2). O servidor valida
// com eles e o frontend usa os tipos inferidos, então os dois lados concordam sobre o contrato.

const MIN_VOTING_SECONDS = 5;
const MAX_VOTING_SECONDS = 3600;
const MIN_CANDIDATE_AGE = 16;
const MAX_CANDIDATE_AGE = 120;
const MAX_VOTERS_PER_BATCH = 500;
const VOTER_CODE_LENGTH = 8;

/** Texto sem espaços nas pontas e não vazio. */
const trimmedText = z.string().trim().min(1);

/** Id de entidade (cargo, candidato, rodada), sempre não vazio. */
const entityId = trimmedText;

/** Duração de rodada em segundos: inteiro dentro dos limites do domínio. */
const votingSeconds = z.number().int().min(MIN_VOTING_SECONDS).max(MAX_VOTING_SECONDS);

const tiebreakRule = z.enum(['YOUNGEST', 'OLDEST', 'MOST_REMAINING_TIME']);

const candidateFields = {
  name: trimmedText,
  age: z.number().int().min(MIN_CANDIDATE_AGE).max(MAX_CANDIDATE_AGE),
  remainingMonths: z.number().int().min(0),
  applications: z.array(entityId).min(1),
  firstChoicePositionId: entityId,
};

/** Mensagem do erro quando a primeira opção não está entre as candidaturas. */
const FIRST_CHOICE_MESSAGE = 'firstChoicePositionId must be one of the applications';

/** Corpo de `POST /admin/login`. A senha não é "trimada": espaços podem fazer parte dela. */
export const loginBodySchema = z.object({
  username: trimmedText,
  password: z.string().min(1),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

/** Corpo de `POST /elections`. */
export const createElectionBodySchema = z.object({
  name: trimmedText,
  defaultVotingSeconds: votingSeconds.optional(),
});
export type CreateElectionBody = z.infer<typeof createElectionBodySchema>;

/** Corpo de `PATCH /elections/:id`: todos os campos são opcionais. */
export const updateElectionBodySchema = createElectionBodySchema.partial();
export type UpdateElectionBody = z.infer<typeof updateElectionBodySchema>;

/** Corpo de `POST /elections/:id/positions`. */
export const createPositionBodySchema = z.object({
  title: trimmedText,
  tiebreak: tiebreakRule,
});
export type CreatePositionBody = z.infer<typeof createPositionBodySchema>;

/** Corpo de `PATCH /elections/:id/positions/:pid`: todos os campos são opcionais. */
export const updatePositionBodySchema = createPositionBodySchema.partial();
export type UpdatePositionBody = z.infer<typeof updatePositionBodySchema>;

/** Corpo de `PUT /elections/:id/queue`: ids dos cargos na ordem de votação. */
export const queueBodySchema = z.object({
  positionIds: z.array(entityId),
});
export type QueueBody = z.infer<typeof queueBodySchema>;

/** Corpo de `POST /elections/:id/candidates`; a primeira opção precisa estar nas candidaturas. */
export const createCandidateBodySchema = z
  .object(candidateFields)
  .refine((body) => body.applications.includes(body.firstChoicePositionId), {
    message: FIRST_CHOICE_MESSAGE,
    path: ['firstChoicePositionId'],
  });
export type CreateCandidateBody = z.infer<typeof createCandidateBodySchema>;

/**
 * Corpo de `PATCH /elections/:id/candidates/:cid`: campos opcionais. A primeira opção só é
 * conferida quando `applications` e `firstChoicePositionId` chegam juntos; do contrário, quem
 * compara com o valor já guardado é o domínio.
 */
export const updateCandidateBodySchema = z
  .object(candidateFields)
  .partial()
  .refine(
    (body) =>
      body.applications === undefined ||
      body.firstChoicePositionId === undefined ||
      body.applications.includes(body.firstChoicePositionId),
    { message: FIRST_CHOICE_MESSAGE, path: ['firstChoicePositionId'] },
  );
export type UpdateCandidateBody = z.infer<typeof updateCandidateBodySchema>;

/** Corpo de `POST /elections/:id/voters`: quantos códigos gerar e rótulos opcionais. */
export const credentialVotersBodySchema = z.object({
  count: z.number().int().min(1).max(MAX_VOTERS_PER_BATCH),
  labels: z.array(trimmedText).optional(),
});
export type CredentialVotersBody = z.infer<typeof credentialVotersBodySchema>;

/** Corpo de `POST /elections/:id/rounds`. Sem `durationSeconds`, vale o padrão da eleição. */
export const openRoundBodySchema = z.object({
  positionId: entityId,
  durationSeconds: votingSeconds.optional(),
});
export type OpenRoundBody = z.infer<typeof openRoundBodySchema>;

/** Corpo de `POST /elections/:id/positions/:pid/runoff` (o cargo vem na rota). */
export const openRunoffBodySchema = z.object({
  durationSeconds: votingSeconds.optional(),
});
export type OpenRunoffBody = z.infer<typeof openRunoffBodySchema>;

/** Corpo de `POST /elections/:id/positions/:pid/cancel`: o título digitado confirma o cancelamento. */
export const cancelPositionBodySchema = z.object({
  confirmTitle: trimmedText,
});
export type CancelPositionBody = z.infer<typeof cancelPositionBodySchema>;

/** Corpo de `POST /voter/session`: o código é normalizado para maiúsculas, com 8 caracteres. */
export const voterSessionBodySchema = z.object({
  code: z.string().trim().toUpperCase().length(VOTER_CODE_LENGTH),
});
export type VoterSessionBody = z.infer<typeof voterSessionBodySchema>;

/** Corpo de `POST /voter/votes`: `choice` é o id de um candidato ou `BLANK`. */
export const castVoteBodySchema = z.object({
  roundId: entityId,
  choice: trimmedText,
});
export type CastVoteBody = z.infer<typeof castVoteBodySchema>;
