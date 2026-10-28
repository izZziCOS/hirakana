import type { Stats } from '../schedule.ts';
import { knowsKanji, type Segment, type Sentence } from '../sentences.ts';
import { codePoints } from '../util.ts';
import { html, type Html } from './html.ts';

// Readings over kanji: only over kanji not learned yet, over all of them, or none (a word can still be selected).
export type Furigana = 'new' | 'all' | 'none';

function segmentMarkup(segment: Segment, stats: Stats, furigana: Furigana): Html | string {
  if (!segment.reading) return segment.text;
  const known = codePoints(segment.text).every(char => !/\p{Script=Han}/u.test(char) || knowsKanji(stats, char));
  const shown = furigana === 'all' || (furigana === 'new' && !known);
  return html`<button
    type="button"
    class="sentence-word${shown ? ' show-reading' : ''}"
    aria-pressed="${String(shown)}"
    title="Show or hide the reading"
  >
    <ruby>${segment.text}<rt>${segment.reading}</rt></ruby>
  </button>`;
}

interface SentenceOptions {
  stats: Stats;
  furigana: Furigana;
  // Whether the browser can read the sentence out.
  listen: boolean;
}

export function sentenceItem(sentence: Sentence, index: number, { stats, furigana, listen }: SentenceOptions): Html {
  return html`<li class="sentence">
    <p class="sentence-text jp" lang="ja">
      ${sentence.segments.map(segment => segmentMarkup(segment, stats, furigana))}
    </p>
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

export function readerSummary(readable: number, total: number): string {
  if (!readable) {
    return 'Sentences show up here once you know every kana and kanji in them. Start with the basic hiragana.';
  }
  return `You can read ${readable} of the ${total} sentences with the kana and kanji you know.`;
}
