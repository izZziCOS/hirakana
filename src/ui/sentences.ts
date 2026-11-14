import { spellingOf } from '../examples.ts';
import { isKanji, mainReading, statKey } from '../kana.ts';
import { itemsAt } from '../reader-words.ts';
import { levelOf, type Stats } from '../schedule.ts';
import { knowsKanji, type Segment, type Sentence } from '../sentences.ts';
import { neverSeen } from '../session.ts';
import { isSaved, setSaved } from '../state.ts';
import type { Store } from '../store.ts';
import type { KanaItem, State } from '../types.ts';
import { codePoints } from '../util.ts';
import { onDelegate } from './dom.ts';
import { html, type Html } from './html.ts';
import { LEVEL_LABEL } from './labels.ts';

// Readings over kanji: only over kanji not learned yet, over all of them, or none (a word can still be selected).
export type Furigana = 'new' | 'all' | 'none';

// Which words of a list of sentences the learner has tapped: those whose reading is the other way round from what
// the furigana setting shows, and the one selected, whose word can be saved to learn. Keys are "sentence:segment".
export interface WordPicks {
  flipped: Set<string>;
  selected: string | null;
}

export const newPicks = (): WordPicks => ({ flipped: new Set(), selected: null });

const isKnownKanji = (segment: Segment, stats: Stats): boolean =>
  codePoints(segment.text).every(char => !/\p{Script=Han}/u.test(char) || knowsKanji(stats, char));

export function segmentMarkup(
  segment: Segment,
  stats: Stats,
  furigana: Furigana,
  key?: string,
  picks?: WordPicks,
): Html | string {
  if (!segment.reading) return segment.text;
  const byDefault = furigana === 'all' || (furigana === 'new' && !isKnownKanji(segment, stats));
  const shown = key !== undefined && picks?.flipped.has(key) ? !byDefault : byDefault;
  const selected = key !== undefined && picks?.selected === key;
  return html`<button
    type="button"
    class="sentence-word${shown ? ' show-reading' : ''}${selected ? ' is-selected' : ''}"
    aria-pressed="${String(shown)}"
    ${key !== undefined && html`data-word="${key}"`}
    title="Show the reading and what it means"
  >
    <ruby>${segment.text}<rt>${segment.reading}</rt></ruby>
  </button>`;
}

function learnStatus(item: KanaItem, state: State): Html {
  if (isSaved(state, item.id)) {
    return html`<button
      type="button"
      class="ghost small is-saved"
      data-save="${item.id}"
      aria-pressed="true"
      title="Remove it from the words you saved"
    >
      ✓ Saved to learn
    </button>`;
  }
  if (!neverSeen(state.stats, item)) {
    const level = levelOf(state.stats[statKey(item, 'read')]);
    return html`<span class="pill level-${level}">${level === 'new' ? 'Started' : LEVEL_LABEL[level]}</span>`;
  }
  return html`<button type="button" class="primary small" data-save="${item.id}" aria-pressed="false">
    + Learn this
  </button>`;
}

// The word or kanji under a selected run of kanji, with a way to save it to learn and to open its details.
export function wordPanel(items: KanaItem[], state: State): Html {
  if (!items.length) {
    return html`<div class="word-pick muted small">This word isn’t in the app’s word list yet.</div>`;
  }
  return html`${items.map(
    item =>
      html`<div class="word-pick" role="group" aria-label="${spellingOf(item) ?? item.kana}">
        <span class="word-pick-text jp" lang="ja">${spellingOf(item) ?? item.kana}</span>
        <span class="word-pick-reading jp" lang="ja">${isKanji(item) ? mainReading(item) : item.kana}</span>
        <span class="word-pick-meaning">${item.meaning ?? item.meanings?.slice(0, 2).join(', ')}</span>
        <span class="word-pick-actions">
          ${learnStatus(item, state)}
          <button type="button" class="ghost small" data-open="${item.id}">Details</button>
        </span>
      </div>`,
  )}`;
}

interface SentenceOptions {
  stats: Stats;
  furigana: Furigana;
  // Whether the browser can read the sentence out.
  listen: boolean;
  // With these, words can be selected and saved to learn.
  picks?: WordPicks;
  state?: State;
}

export function sentenceItem(sentence: Sentence, index: number, options: SentenceOptions): Html {
  const { stats, furigana, listen, picks, state } = options;
  const selected = picks?.selected?.split(':');
  const segmentIndex = selected?.[0] === String(index) ? Number(selected[1]) : -1;
  return html`<li class="sentence">
    <p class="sentence-text jp" lang="ja">
      ${sentence.segments.map((segment, i) =>
        segmentMarkup(segment, stats, furigana, picks ? `${index}:${i}` : undefined, picks),
      )}
    </p>
    ${segmentIndex >= 0 && state && wordPanel(itemsAt(sentence.segments, segmentIndex), state)}
    <div class="sentence-actions">
      <details>
        <summary>Meaning</summary>
        <p>${sentence.english}</p>
      </details>
      ${
        listen &&
        html`<button type="button" class="ghost small" data-speak="${index}" aria-label="Listen to the sentence">
          ♪ Listen
        </button>`
      }
    </div>
  </li>`;
}

// Tapping a word selects it and shows its reading; tapping it again lets it go and hides the reading. The selected
// word's panel saves it to learn or opens its details.
export function bindWordPicks(
  container: HTMLElement,
  picks: () => WordPicks,
  data: Store<State>,
  render: () => void,
  open: (id: string) => void,
): void {
  onDelegate(container, '.sentence-word', word => {
    const key = word.dataset.word;
    if (key === undefined) {
      word.setAttribute('aria-pressed', String(word.classList.toggle('show-reading')));
      return;
    }
    const current = picks();
    if (!current.flipped.delete(key)) current.flipped.add(key);
    current.selected = current.selected === key ? null : key;
    render();
  });
  onDelegate(container, '[data-save]', button => {
    const id = button.dataset.save ?? '';
    data.update(state => setSaved(state, id, !isSaved(state, id)));
  });
  onDelegate(container, '[data-open]', element => open(element.dataset.open ?? ''));
}

export function readerSummary(readable: number, total: number): string {
  if (!readable) {
    return 'Sentences show up here once you know every kana and kanji in them. Start with the basic hiragana.';
  }
  return `You can read ${readable} of the ${total} sentences with the kana and kanji you know.`;
}
