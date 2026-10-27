import { $ } from './dom.ts';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  // A second way to go ahead, shown between Cancel and the main button.
  altLabel?: string;
}

export type Choice = 'confirm' | 'alt' | 'cancel';

export function chooseAction({
  title,
  message,
  confirmLabel,
  danger = false,
  altLabel,
}: ConfirmOptions): Promise<Choice> {
  const dialog = $('#confirm-dialog', HTMLDialogElement);
  const ok = $('#confirm-ok', HTMLButtonElement);
  const alt = $('#confirm-alt', HTMLButtonElement);
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  ok.textContent = confirmLabel;
  ok.classList.toggle('danger', danger);
  alt.hidden = !altLabel;
  alt.textContent = altLabel ?? '';
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise(resolve => {
    dialog.addEventListener(
      'close',
      () => resolve(dialog.returnValue === 'confirm' || dialog.returnValue === 'alt' ? dialog.returnValue : 'cancel'),
      { once: true },
    );
  });
}

export const confirmAction = async (options: Omit<ConfirmOptions, 'altLabel'>): Promise<boolean> =>
  (await chooseAction(options)) === 'confirm';
