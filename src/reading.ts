import { findKana, isWord, KANA, statKey } from './kana.ts';
import { knowsKanjiOf, type Stats } from './schedule.ts';
import type { KanaItem } from './types.ts';
import { codePoints } from './util.ts';

// A character counts as known once it is past its first step in Read.
export const KNOWN_BOX = 2;
const MARKS = new Set(['っ', 'ッ', 'ー']);

const knows = (stats: Stats, item: KanaItem): boolean => (stats[statKey(item, 'read')]?.box ?? 0) >= KNOWN_BOX;

// The small っ and the long ー have no cards of their own; they are learned with the words that use them.
const knowsMarks = (stats: Stats): boolean => KANA.some(item => item.group === 'sokuon' && knows(stats, item));

// Whether every kana in `text` is known, reading combinations such as きゃ or ファ as one.
export function canReadKana(text: string, stats: Stats, marksKnown = knowsMarks(stats)): boolean {
  const chars = codePoints(text);
  for (let i = 0; i < chars.length; i++) {
    const pair = findKana(`${chars[i] ?? ''}${chars[i + 1] ?? ''}`);
    if (pair && !isWord(pair) && chars[i + 1] !== undefined) {
      if (!knows(stats, pair)) return false;
      i++;
      continue;
    }
    const char = chars[i] ?? '';
    if (MARKS.has(char)) {
      if (!marksKnown) return false;
      continue;
    }
    const item = findKana(char);
    if (!item || !knows(stats, item)) return false;
  }
  return true;
}

export interface ReadableWord {
  item: KanaItem;
  // Shown in kanji when the kanji it is written with are known too.
  inKanji: boolean;
}

// Words the learner can read with the characters they know, the ones not practised yet first.
export function readableWords(stats: Stats): ReadableWord[] {
  const marksKnown = knowsMarks(stats);
  return KANA.filter(item => isWord(item) && canReadKana(item.kana, stats, marksKnown))
    .map(item => ({ item, inKanji: Boolean(item.kanji) && knowsKanjiOf(item, stats) }))
    .sort((a, b) => Number(Boolean(stats[statKey(a.item)])) - Number(Boolean(stats[statKey(b.item)])));
}
