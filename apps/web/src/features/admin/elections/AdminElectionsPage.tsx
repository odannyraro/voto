import {
  createElectionBodySchema,
  type AdminElectionDTO,
  type ElectionSummaryDTO,
} from '@voto/shared';
import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../../../api/api-client';
import { adminApi } from '../../../api/admin-api';
import { ErrorMessage } from '../../../components/ErrorMessage';

const DEFAULT_VOTING_SECONDS = 60;

/** Propriedades para carregar e criar eleições do administrador autenticado. */
export interface AdminElectionsPageProps {
  readonly token: string;
}

/**
 * Traduz a situação da eleição para uma informação legível na lista.
 *
 * @param status - Estado oficial recebido no resumo do servidor.
 * @returns Situação apresentada em português.
 */
function getElectionStatusLabel(status: ElectionSummaryDTO['status']): string {
  switch (status) {
    case 'DRAFT':
      return 'Em preparação';
    case 'OPEN':
      return 'Aberta';
    case 'FINISHED':
      return 'Encerrada';
  }
}

/**
 * Mostra eleições existentes e permite criar uma nova eleição.
 *
 * @param props - Token administrativo validado pelo provider.
 * @returns Lista, estados de carregamento/erro e formulário de criação.
 */
export function AdminElectionsPage({ token }: AdminElectionsPageProps): ReactElement {
  const navigate = useNavigate();
  const [elections, setElections] = useState<readonly ElectionSummaryDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiError>();
  const [loadMessage, setLoadMessage] = useState<string>();

  useEffect(() => {
    let active = true;

    async function loadElections(): Promise<void> {
      try {
        const summaries = await adminApi.listElections(token);
        if (active) {
          setElections(summaries);
        }
      } catch (error: unknown) {
        if (!active) {
          return;
        }
        if (error instanceof ApiError) {
          setLoadError(error);
        } else {
          setLoadMessage(
            'Não foi possível carregar as eleições. Confira sua conexão e tente novamente.',
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadElections();
    return () => {
      active = false;
    };
  }, [token]);

  /**
   * Cria uma eleição e abre sua rota de configuração.
   *
   * @param election - Estado criado e devolvido pela API.
   */
  function handleCreated(election: AdminElectionDTO): void {
    navigate(`/admin/eleicoes/${encodeURIComponent(election.election.id)}/configurar`);
  }

  return (
    <section aria-labelledby="elections-heading">
      <h2 id="elections-heading">Suas eleições</h2>
      {isLoading && <p role="status">Carregando eleições...</p>}
      {loadError?.error !== undefined && <ErrorMessage error={{ error: loadError.error }} />}
      {(loadMessage !== undefined ||
        (loadError !== undefined && loadError.error === undefined)) && (
        <p role="alert">
          {loadMessage ??
            'Não foi possível carregar as eleições. Confira sua conexão e tente novamente.'}
        </p>
      )}
      {!isLoading && loadError === undefined && loadMessage === undefined && (
        <ElectionList elections={elections} />
      )}
      <CreateElectionForm token={token} onCreated={handleCreated} />
    </section>
  );
}

/**
 * Apresenta status e contagens devolvidos pela API sem derivar dados da eleição.
 *
 * @param props - Resumos recebidos do servidor.
 * @returns Lista acessível ou instrução para criar a primeira eleição.
 */
function ElectionList({
  elections,
}: {
  readonly elections: readonly ElectionSummaryDTO[];
}): ReactElement {
  if (elections.length === 0) {
    return <p>Nenhuma eleição criada ainda. Crie uma para começar.</p>;
  }

  return (
    <ul aria-label="Eleições">
      {elections.map((election) => (
        <li key={election.id}>
          <h3>
            <Link to={`/admin/eleicoes/${encodeURIComponent(election.id)}/configurar`}>
              {election.name}
            </Link>
          </h3>
          <p>Situação: {getElectionStatusLabel(election.status)}</p>
          <p>
            {election.positionCount} {election.positionCount === 1 ? 'cargo' : 'cargos'}
          </p>
          <p>
            {election.voterCount} {election.voterCount === 1 ? 'eleitor' : 'eleitores'}
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Valida e envia nome e duração padrão da nova eleição.
 *
 * @param props - Token administrativo e callback com o estado criado.
 * @returns Formulário de criação com feedback acessível.
 */
function CreateElectionForm({
  token,
  onCreated,
}: {
  readonly token: string;
  readonly onCreated: (election: AdminElectionDTO) => void;
}): ReactElement {
  const [name, setName] = useState('');
  const [duration, setDuration] = useState(DEFAULT_VOTING_SECONDS.toString());
  const [validationMessage, setValidationMessage] = useState<string>();
  const [apiError, setApiError] = useState<ApiError>();
  const [requestMessage, setRequestMessage] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Valida dados do formulário e solicita a criação pela API.
   *
   * @param event - Envio do formulário de criação.
   * @returns Resolve ao concluir a solicitação ou exibir validação local.
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setValidationMessage(undefined);
    setApiError(undefined);
    setRequestMessage(undefined);

    const parsedBody = createElectionBodySchema.safeParse({
      name,
      defaultVotingSeconds: Number(duration),
    });
    if (!parsedBody.success) {
      setValidationMessage(
        name.trim() === ''
          ? 'Informe o nome da eleição.'
          : 'A duração da votação deve ser um número inteiro entre 5 e 3.600 segundos.',
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const election = await adminApi.createElection(token, parsedBody.data);
      onCreated(election);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.error !== undefined) {
        setApiError(error);
      } else {
        setRequestMessage(
          'Não foi possível criar a eleição. Confira sua conexão e tente novamente.',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      <h3>Criar eleição</h3>
      <label htmlFor="election-name">Nome da eleição</label>
      <input
        id="election-name"
        type="text"
        required
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <label htmlFor="voting-duration">Duração padrão da votação (segundos)</label>
      <input
        id="voting-duration"
        type="number"
        min={5}
        max={3600}
        step={1}
        required
        value={duration}
        onChange={(event) => setDuration(event.currentTarget.value)}
      />
      {validationMessage !== undefined && <p role="alert">{validationMessage}</p>}
      {apiError?.error !== undefined && <ErrorMessage error={{ error: apiError.error }} />}
      {requestMessage !== undefined && <p role="alert">{requestMessage}</p>}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Criando...' : 'Criar eleição'}
      </button>
    </form>
  );
}
