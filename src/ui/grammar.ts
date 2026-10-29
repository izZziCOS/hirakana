import type { Segment } from '../furigana.ts';
import { KANA } from '../kana.ts';
import type { Stats } from '../schedule.ts';
import { knowsKanji } from '../sentences.ts';
import type { KanaItem } from '../types.ts';
import { codePoints } from '../util.ts';
import { html, type Html } from './html.ts';

// Readings go over the kanji the learner hasn't learned yet; without stats, over none.
function segmentsMarkup(segments: Segment[], stats: Stats | null): (Html | string)[] {
  return segments.map(segment => {
    if (!segment.reading || !stats) return segment.text;
    const known = codePoints(segment.text).every(char => !/\p{Script=Han}/u.test(char) || knowsKanji(stats, char));
    return known ? segment.text : html`<ruby>${segment.text}<rt>${segment.reading}</rt></ruby>`;
  });
}

// A grammar card's sentence, with the gap left open or filled with the answer.
export function clozeMarkup(item: KanaItem, stats: Stats | null, filled: boolean): Html {
  const { cloze } = item;
  if (!cloze) return html`${item.kana}`;
  const gap = filled
    ? html`<mark class="cloze-answer">${cloze.answers[0]}</mark>`
    : html`<span class="cloze-gap"><span class="visually-hidden">gap</span></span>`;
  return html`<span class="cloze-sentence" lang="ja"
    >${segmentsMarkup(cloze.before, stats)}${gap}${segmentsMarkup(cloze.after, stats)}</span
  >`;
}

// The card's prompt: the sentence with its gap, and what it means.
export const clozePromptMarkup = (item: KanaItem, stats: Stats, filled = false): Html =>
  html`${clozeMarkup(item, stats, filled)}<span class="cloze-english" lang="en">${item.cloze?.english}</span>`;

// The cards of a grammar point, in their order.
export const pointItems = (item: KanaItem): KanaItem[] =>
  item.cloze ? KANA.filter(other => other.rowId === item.rowId) : [];

// Where a whole sentence doesn't fit, such as a grid cell or a list of mistakes, a grammar card shows its answer.
export const shortLabel = (item: KanaItem): string => item.cloze?.answers[0] ?? item.kana;
