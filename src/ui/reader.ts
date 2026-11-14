import { kanjiLoaded } from '../kana.ts';
import { readableSentences, sentences, type Sentence } from '../sentences.ts';
import type { AppStores } from '../store.ts';
import { $, onDelegate, onSegmented, press } from './dom.ts';
import { setHtml } from './html.ts';
import { createPassages } from './passages.ts';
import type { KanaDialog } from './dialog.ts';
import { bindWordPicks, newPicks, readerSummary, sentenceItem, type Furigana } from './sentences.ts';
import { canSpeak, speak } from './speech.ts';

type ReaderShow = 'readable' | 'all';
type ReaderMode = 'sentences' | 'passages';

export interface ReaderView {
  render(): void;
}

export function createReader(stores: AppStores, isActive: () => boolean, dialog: KanaDialog): ReaderView {
  const { data } = stores;
  const els = {
    summary: $('#reader-summary'),
    list: $('#sentence-list'),
    showControl: $('#reader-show-control'),
    passages: $('#passage-view'),
  };
  let mode: ReaderMode = 'sentences';
  let show: ReaderShow = 'readable';
  let furigana: Furigana = 'new';
  let shown: Sentence[] = [];
  // Words tapped in the list; the list changes, and its numbering with it, when what it shows does.
  let picks = newPicks();
  const passages = createPassages(
    stores,
    els.passages,
    () => furigana,
    () => isActive() && mode === 'passages',
    dialog,
  );

  function render(): void {
    if (!isActive()) return;
    press('#reader-mode', mode);
    press('#reader-furigana', furigana);
    els.summary.hidden = mode !== 'sentences';
    els.list.hidden = mode !== 'sentences';
    els.showControl.hidden = mode !== 'sentences';
    els.passages.hidden = mode !== 'passages';
    if (mode === 'passages') {
      passages.render();
      return;
    }
    const state = data.get();
    const { stats } = state;
    const readable = readableSentences(stats);
    shown = show === 'readable' ? readable : sentences;
    press('#reader-show', show);
    els.summary.textContent = kanjiLoaded() ? readerSummary(readable.length, sentences.length) : 'Loading the kanji…';
    setHtml(
      els.list,
      shown.map((sentence, i) => sentenceItem(sentence, i, { stats, furigana, listen: canSpeak, picks, state })),
    );
  }

  onSegmented('#reader-mode', value => {
    mode = value as ReaderMode;
    render();
  });
  onSegmented('#reader-show', value => {
    show = value as ReaderShow;
    picks = newPicks();
    render();
  });
  onSegmented('#reader-furigana', value => {
    furigana = value as Furigana;
    picks.flipped.clear();
    render();
  });
  bindWordPicks(
    els.list,
    () => picks,
    data,
    render,
    id => dialog.open(id),
  );
  onDelegate(els.list, '[data-speak]', button => speak(shown[Number(button.dataset.speak)]?.text ?? ''));

  data.subscribe(render);
  return { render };
}
