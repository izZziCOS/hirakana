import { kanjiLoaded } from '../kana.ts';
import { readableSentences, sentences, type Sentence } from '../sentences.ts';
import type { AppStores } from '../store.ts';
import { $, onDelegate, onSegmented, press } from './dom.ts';
import { setHtml } from './html.ts';
import { readerSummary, sentenceItem, type Furigana } from './sentences.ts';
import { canSpeak, speak } from './speech.ts';

type ReaderShow = 'readable' | 'all';

export interface ReaderView {
  render(): void;
}

export function createReader({ data }: AppStores, isActive: () => boolean): ReaderView {
  const els = { summary: $('#reader-summary'), list: $('#sentence-list') };
  let show: ReaderShow = 'readable';
  let furigana: Furigana = 'new';
  let shown: Sentence[] = [];

  function render(): void {
    if (!isActive()) return;
    const { stats } = data.get();
    const readable = readableSentences(stats);
    shown = show === 'readable' ? readable : sentences;
    press('#reader-show', show);
    press('#reader-furigana', furigana);
    els.summary.textContent = kanjiLoaded() ? readerSummary(readable.length, sentences.length) : 'Loading the kanji…';
    setHtml(
      els.list,
      shown.map((sentence, i) => sentenceItem(sentence, i, { stats, furigana, listen: canSpeak })),
    );
  }

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
