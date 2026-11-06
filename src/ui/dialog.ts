import { findKana, KANA, wordsWithKanji } from '../kana.ts';
import { isSuspended, markKnown, setSuspended } from '../state.ts';
import type { Store } from '../store.ts';
import type { KanaItem, State } from '../types.ts';
import { codePoints } from '../util.ts';
import { $, onDelegate } from './dom.ts';
import { shortLabel } from './grammar.ts';
import { setHtml } from './html.ts';
import { renderInfo } from './info.ts';
import { canSay, say } from './speech.ts';
import { mountStrokeOrder } from './strokes.ts';

export interface KanaDialog {
  open(id: string): void;
}

export type StartDrill = (label: string, items: KanaItem[]) => void;

// Info panels link kanji and words to each other, and can drill a kanji together with its words or a grammar point.
export function bindInfoLinks(container: HTMLElement, open: (id: string) => void, drill: StartDrill): void {
  onDelegate(container, '[data-open]', element => open(element.dataset.open ?? ''));
  onDelegate(container, '[data-drill]', element => {
    const kanji = findKana(element.dataset.drill);
    if (kanji) drill(`${kanji.kana} and its words`, [kanji, ...wordsWithKanji(kanji)]);
  });
  onDelegate(container, '[data-drill-row]', element => {
    const items = KANA.filter(item => item.rowId === element.dataset.drillRow);
    const [first] = items;
    if (first) drill(first.row, items);
  });
}

// The buttons in an info panel, or next to a card missed again and again, that act on the card itself.
export function bindCardActions(container: HTMLElement, data: Store<State>, done: (id: string) => void): void {
  onDelegate(container, '[data-suspend]', element => {
    const id = element.dataset.suspend ?? '';
    data.update(state => setSuspended(state, id, !isSuspended(state, id)));
    done(id);
  });
  onDelegate(container, '[data-known]', element => {
    const item = findKana(element.dataset.known);
    if (!item) return;
    data.update(state => markKnown(state, item));
    done(item.id);
  });
}

export function createDialog(data: Store<State>, drill: StartDrill): KanaDialog {
  const dialog = $('#kana-dialog', HTMLDialogElement);
  const kanaLabel = $('#dialog-kana');
  const body = $('#dialog-body');
  const speakButton = $('#dialog-speak', HTMLButtonElement);
  let current: KanaItem | undefined;

  $('#dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  speakButton.addEventListener('click', () => {
    if (current) say(current);
  });

  function open(id: string): void {
    const item = findKana(id);
    if (!item) return;
    current = item;
    // A grammar card's sentence is in the panel itself; the title names its point.
    const label = item.cloze ? item.row : shortLabel(item);
    kanaLabel.textContent = label;
    kanaLabel.classList.toggle('is-word', codePoints(label).length > 2);
    setHtml(body, renderInfo(item, data.get()));
    speakButton.hidden = !canSay(item);
    if (!dialog.open) dialog.showModal();
    body.scrollTop = 0;
    void mountStrokeOrder(body.querySelector<HTMLElement>('.stroke-order'));
  }

  bindInfoLinks(body, open, (label, items) => {
    dialog.close();
    drill(label, items);
  });
  bindCardActions(body, data, open);

  return { open };
}
