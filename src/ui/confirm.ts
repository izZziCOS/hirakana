import { $ } from './dom.ts';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
}

export function confirmAction({ title, message, confirmLabel, danger = false }: ConfirmOptions): Promise<boolean> {
  const dialog = $('#confirm-dialog', HTMLDialogElement);
  const ok = $('#confirm-ok', HTMLButtonElement);
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  ok.textContent = confirmLabel;
  ok.classList.toggle('danger', danger);
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
  });
}
