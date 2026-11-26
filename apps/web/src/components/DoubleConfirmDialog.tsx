import { useEffect, useId, useState } from 'react';
import type { ReactElement } from 'react';

/** Propriedades do diálogo que exige a confirmação exata do título. */
export interface DoubleConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly confirmationTitle: string;
  readonly inputLabel?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * Apresenta uma confirmação que exige o título exato antes de continuar.
 *
 * @param props - Visibilidade, textos, título obrigatório, rótulos e callbacks das ações.
 * @returns O diálogo quando aberto; `null` quando fechado.
 */
export function DoubleConfirmDialog({
  open,
  title,
  description,
  confirmationTitle,
  inputLabel = 'Type the title to confirm',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: DoubleConfirmDialogProps): ReactElement | null {
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const [typedTitle, setTypedTitle] = useState('');

  useEffect(() => {
    setTypedTitle('');
  }, [open, confirmationTitle]);

  if (!open) {
    return null;
  }

  const canConfirm = confirmationTitle.length > 0 && typedTitle === confirmationTitle;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{description}</p>
      <label htmlFor={inputId}>{inputLabel}</label>
      <input
        id={inputId}
        type="text"
        autoComplete="off"
        value={typedTitle}
        onChange={(event) => setTypedTitle(event.currentTarget.value)}
      />
      <button type="button" onClick={onCancel}>
        {cancelLabel}
      </button>
      <button type="button" onClick={onConfirm} disabled={!canConfirm}>
        {confirmLabel}
      </button>
    </div>
  );
}
