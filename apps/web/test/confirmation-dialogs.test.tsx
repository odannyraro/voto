import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '../src/components/ConfirmDialog';
import { DoubleConfirmDialog } from '../src/components/DoubleConfirmDialog';
import { renderWithProviders } from './utils/render-with-providers';

describe('ConfirmDialog', () => {
  it('exposes an accessible dialog name and description', () => {
    renderWithProviders(
      <ConfirmDialog
        open
        title="Remover pessoa candidata?"
        description="Esta ação não pode ser desfeita."
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(
      screen.getByRole('dialog', {
        name: 'Remover pessoa candidata?',
        description: 'Esta ação não pode ser desfeita.',
      }),
    ).toBeInTheDocument();
  });

  it('confirms the requested action', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        open
        title="Remover pessoa candidata?"
        description="Esta ação não pode ser desfeita."
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect({ confirms: onConfirm.mock.calls.length, cancels: onCancel.mock.calls.length }).toEqual({
      confirms: 1,
      cancels: 0,
    });
  });

  it('cancels without confirming the requested action', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        open
        title="Remover pessoa candidata?"
        description="Esta ação não pode ser desfeita."
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));

    expect({ confirms: onConfirm.mock.calls.length, cancels: onCancel.mock.calls.length }).toEqual({
      confirms: 0,
      cancels: 1,
    });
  });

  it('does not render a closed dialog', () => {
    renderWithProviders(
      <ConfirmDialog
        open={false}
        title="Remover pessoa candidata?"
        description="Esta ação não pode ser desfeita."
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('DoubleConfirmDialog', () => {
  it.each(['', 'president', 'President '])(
    'keeps confirmation disabled unless the exact title is entered: %j',
    (typedTitle) => {
      renderWithProviders(
        <DoubleConfirmDialog
          open
          title="Cancelar cargo?"
          description="Digite exatamente o nome do cargo para cancelá-lo."
          confirmationTitle="President"
          onConfirm={() => undefined}
          inputLabel="Digite o nome do cargo para confirmar"
          onCancel={() => undefined}
        />,
      );
      fireEvent.change(
        screen.getByRole('textbox', { name: 'Digite o nome do cargo para confirmar' }),
        {
          target: { value: typedTitle },
        },
      );

      expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    },
  );

  it('confirms only after the exact title is entered', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(
      <DoubleConfirmDialog
        open
        title="Cancelar cargo?"
        description="Digite exatamente o nome do cargo para cancelá-lo."
        confirmationTitle="President"
        inputLabel="Digite o nome do cargo para confirmar"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Digite o nome do cargo para confirmar' }),
      {
        target: { value: 'President' },
      },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect({ confirms: onConfirm.mock.calls.length, cancels: onCancel.mock.calls.length }).toEqual({
      confirms: 1,
      cancels: 0,
    });
  });

  it('clears typed text when the expected title changes', () => {
    const { rerender } = renderWithProviders(
      <DoubleConfirmDialog
        open
        title="Cancelar cargo?"
        description="Digite exatamente o nome do cargo para cancelá-lo."
        confirmationTitle="President"
        inputLabel="Digite o nome do cargo para confirmar"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Digite o nome do cargo para confirmar' }),
      {
        target: { value: 'President' },
      },
    );

    rerender(
      <DoubleConfirmDialog
        open
        title="Cancelar cargo?"
        description="Digite exatamente o nome do cargo para cancelá-lo."
        confirmationTitle="Chancellor"
        inputLabel="Digite o nome do cargo para confirmar"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(
      screen.getByRole('textbox', { name: 'Digite o nome do cargo para confirmar' }),
    ).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  });

  it('cancels the double confirmation without invoking confirm', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(
      <DoubleConfirmDialog
        open
        title="Cancelar cargo?"
        description="Digite exatamente o nome do cargo para cancelá-lo."
        confirmationTitle="President"
        inputLabel="Digite o nome do cargo para confirmar"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));

    expect({ confirms: onConfirm.mock.calls.length, cancels: onCancel.mock.calls.length }).toEqual({
      confirms: 0,
      cancels: 1,
    });
  });
});
