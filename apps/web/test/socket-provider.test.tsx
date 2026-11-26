import { act, fireEvent, screen } from '@testing-library/react';
import type { AdminElectionDTO, VoterStateDTO } from '@voto/shared';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { SocketProvider, useSocket } from '../src/api/socket-provider';
import { createFakeSocket } from './utils/fake-socket';
import { makeAdminElectionDTO, makeVoterStateDTO } from './utils/factories';
import { renderWithProviders } from './utils/render-with-providers';

const SESSION_TOKEN = 'session-token';
const ELECTION_ID = 'election-1';

/**
 * Exibe campos observáveis do contexto e permite solicitar o acompanhamento de uma eleição.
 *
 * @returns Controles acessíveis para observar o contexto Socket.IO.
 */
function SocketStateConsumer(): ReactElement {
  const { adminState, voterState, watchAdmin } = useSocket();

  return (
    <>
      <output aria-label="admin state">
        {adminState ? `${adminState.election.name}:${adminState.election.version}` : 'empty'}
      </output>
      <output aria-label="voter state">{voterState?.phase ?? 'empty'}</output>
      <button onClick={() => watchAdmin(ELECTION_ID)}>Watch election</button>
    </>
  );
}

describe('SocketProvider', () => {
  it('replaces the previous admin snapshot when the socket publishes a new one', () => {
    const socket = createFakeSocket();
    renderWithProviders(
      <SocketProvider token={SESSION_TOKEN} createClient={() => socket}>
        <SocketStateConsumer />
      </SocketProvider>,
    );
    const firstState = makeAdminElectionDTO({
      election: { ...makeAdminElectionDTO().election, name: 'Student Election', version: 1 },
    });
    const nextState: AdminElectionDTO = {
      ...firstState,
      election: { ...firstState.election, name: 'Updated Election', version: 2 },
    };

    act(() => {
      socket.emitAdminState(firstState);
      socket.emitAdminState(nextState);
    });

    expect(screen.getByLabelText('admin state')).toHaveTextContent('Updated Election:2');
  });

  it('replaces the previous voter phase when the socket publishes a new state', () => {
    const socket = createFakeSocket();
    renderWithProviders(
      <SocketProvider token={SESSION_TOKEN} createClient={() => socket}>
        <SocketStateConsumer />
      </SocketProvider>,
    );
    const firstState: VoterStateDTO = makeVoterStateDTO({ phase: 'WAITING' });
    const nextState: VoterStateDTO = makeVoterStateDTO({ phase: 'VOTING' });

    act(() => {
      socket.emitVoterState(firstState);
      socket.emitVoterState(nextState);
    });

    expect(screen.getByLabelText('voter state')).toHaveTextContent('VOTING');
  });

  it('does not create an unauthenticated socket without a session token', () => {
    let created = false;
    renderWithProviders(
      <SocketProvider
        token={null}
        createClient={() => {
          created = true;
          return createFakeSocket();
        }}
      >
        <SocketStateConsumer />
      </SocketProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Watch election' }));

    expect({
      created,
      adminState: screen.getByLabelText('admin state').textContent,
      voterState: screen.getByLabelText('voter state').textContent,
    }).toEqual({ created: false, adminState: 'empty', voterState: 'empty' });
  });

  it('forwards admin watch requests through the context', () => {
    const socket = createFakeSocket();
    renderWithProviders(
      <SocketProvider token={SESSION_TOKEN} createClient={() => socket}>
        <SocketStateConsumer />
      </SocketProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Watch election' }));

    expect(socket.watchedElections).toEqual([ELECTION_ID]);
  });

  it('disconnects the socket and stops updates when the provider unmounts', () => {
    const socket = createFakeSocket();
    const { unmount } = renderWithProviders(
      <SocketProvider token={SESSION_TOKEN} createClient={() => socket}>
        <SocketStateConsumer />
      </SocketProvider>,
    );

    unmount();

    expect(socket.connected).toBe(false);
  });
});
