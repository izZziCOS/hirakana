import { findKana } from '../kana.ts';
import type { Store } from '../store.ts';
import type { State } from '../types.ts';
import { codePoints } from '../util.ts';
import { $ } from './dom.ts';
import { setHtml } from './html.ts';
import { renderInfo } from './info.ts';
import { canSpeak, speak } from './speech.ts';
import { mountStrokeOrder } from './strokes.ts';

export interface KanaDialog {
  open(kana: string): void;
}

export function createDialog(data: Store<State>): KanaDialog {
  const dialog = $('#kana-dialog', HTMLDialogElement);
  const kanaLabel = $('#dialog-kana');
  const body = $('#dialog-body');
  const speakButton = $('#dialog-speak', HTMLButtonElement);
  let currentKana = '';

  $('#dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  speakButton.addEventListener('click', () => speak(currentKana));

  return {
    open(kana) {
      const item = findKana(kana);
      if (!item) return;
      currentKana = item.kana;
      kanaLabel.textContent = item.kana;
      kanaLabel.classList.toggle('is-word', codePoints(item.kana).length > 2);
      setHtml(body, renderInfo(item, data.get()));
      speakButton.hidden = !canSpeak;
      dialog.showModal();
      void mountStrokeOrder(body.querySelector<HTMLElement>('.stroke-order'));
    },
  };
}
