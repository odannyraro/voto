import { useId } from 'react';
import type { ReactElement } from 'react';

/** Propriedades do diálogo de confirmação controlado pela tela chamadora. */
export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * Apresenta uma confirmação acessível e delega a escolha à tela chamadora.
 *
 * @param props - Visibilidade, textos, rótulos dos botões e callbacks das ações.
 * @returns O diálogo quando aberto; `null` quando fechado.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps): ReactElement | null {
  const titleId = useId();
  const descriptionId = useId();
  if (!open) {
    return null;
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{description}</p>
      <button type="button" onClick={onCancel}>
        {cancelLabel}
      </button>
      <button type="button" onClick={onConfirm}>
        {confirmLabel}
      </button>
    </div>
  );
}
