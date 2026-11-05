import { kanjiLoaded } from '../kana.ts';
import { readableSentences, sentences, type Sentence } from '../sentences.ts';
import type { AppStores } from '../store.ts';
import { $, onDelegate, onSegmented, press } from './dom.ts';
import { setHtml } from './html.ts';
import { createPassages } from './passages.ts';
import { readerSummary, sentenceItem, type Furigana } from './sentences.ts';
import { canSpeak, speak } from './speech.ts';

type ReaderShow = 'readable' | 'all';
type ReaderMode = 'sentences' | 'passages';

export interface ReaderView {
  render(): void;
}

export function createReader(stores: AppStores, isActive: () => boolean): ReaderView {
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
  const passages = createPassages(
    stores,
    els.passages,
    () => furigana,
    () => isActive() && mode === 'passages',
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
    const { stats } = data.get();
    const readable = readableSentences(stats);
    shown = show === 'readable' ? readable : sentences;
    press('#reader-show', show);
    els.summary.textContent = kanjiLoaded() ? readerSummary(readable.length, sentences.length) : 'Loading the kanji…';
    setHtml(
      els.list,
      shown.map((sentence, i) => sentenceItem(sentence, i, { stats, furigana, listen: canSpeak })),
    );
  }

  onSegmented('#reader-mode', value => {
    mode = value as ReaderMode;
    render();
  });
  onSegmented('#reader-show', value => {
    show = value as ReaderShow;
    render();
  });
  onSegmented('#reader-furigana', value => {
    furigana = value as Furigana;
    render();
  });
  onDelegate(els.list, '.sentence-word', word => {
    const pressed = word.classList.toggle('show-reading');
    word.setAttribute('aria-pressed', String(pressed));
  });
  onDelegate(els.list, '[data-speak]', button => speak(shown[Number(button.dataset.speak)]?.text ?? ''));

  data.subscribe(render);
  return { render };
}
