import { kanjiLoaded } from '../kana.ts';
import { kanjiLoadFailed } from '../kanji-loader.ts';
import { readableSentences, sentences, type Sentence } from '../sentences.ts';
import type { AppStores } from '../store.ts';
import { $, onDelegate, onSegmented, press } from './dom.ts';
import { html, setHtml } from './html.ts';
import { createPassages } from './passages.ts';
import type { KanaDialog } from './dialog.ts';
import { bindWordPicks, newPicks, readerSummary, sentenceItem, type Furigana } from './sentences.ts';
import { canSpeak, speak } from './speech.ts';

type ReaderShow = 'readable' | 'all';
type ReaderMode = 'sentences' | 'passages';

export interface ReaderView {
  render(): void;
}

export function createReader(
  stores: AppStores,
  isActive: () => boolean,
  dialog: KanaDialog,
  onStartLearning: () => void,
): ReaderView {
  const { data } = stores;
  const els = {
    summary: $('#reader-summary'),
    tip: $('#reader-tip'),
    list: $('#sentence-list'),
    showControl: $('#reader-show-control'),
    furiganaControl: $('#reader-furigana-control'),
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
    els.tip.hidden = mode !== 'sentences';
    els.furiganaControl.hidden = false;
    els.summary.classList.remove('empty-state');
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
    // Nothing is readable yet at the start, which would leave the list empty: say how to get there instead, and offer
    // the sentences with readings and the passages meanwhile.
    const empty = show === 'readable' && !readable.length && kanjiLoaded();
    els.summary.classList.toggle('empty-state', empty);
    els.furiganaControl.hidden = empty;
    els.tip.hidden = empty;
    if (empty) {
      setHtml(
        els.summary,
        html`<p>${readerSummary(0, sentences.length)}</p>
          <div class="empty-actions">
            <button type="button" class="primary" data-reader-learn>Start learning</button>
            <button type="button" class="ghost" data-reader-all>Show all sentences, with readings</button>
            <button type="button" class="ghost" data-reader-passages>Try a passage</button>
          </div>`,
      );
    } else {
      els.summary.textContent = kanjiLoaded()
        ? readerSummary(readable.length, sentences.length)
        : kanjiLoadFailed()
          ? 'The kanji couldn’t be loaded, so only sentences in kana are listed.'
          : 'Loading the kanji…';
    }
    setHtml(
      els.list,
      shown.map((sentence, i) => sentenceItem(sentence, i, { stats, furigana, listen: canSpeak, picks, state })),
    );
  }

  onDelegate(els.summary, '[data-reader-learn]', onStartLearning);
  onDelegate(els.summary, '[data-reader-all]', () => {
    show = 'all';
    picks = newPicks();
    render();
  });
  onDelegate(els.summary, '[data-reader-passages]', () => {
    mode = 'passages';
    render();
  });

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
