import { meaningKey } from './choices.ts';
import { KANA, readingRomaji, toKatakana } from './kana.ts';
import type { KanaItem } from './types.ts';

export const SEARCH_LIMIT = 50;

interface Fields {
  // What the item is written as.
  names: string[];
  // What it is read as, in kana and romaji.
  readings: string[];
  meanings: string[];
  // All of the above and any other text, for a match anywhere.
  text: string;
  // A grammar card's whole sentence, which mentions many words without being about them.
  sentence: string;
}

const toHiragana = (katakana: string): string =>
  katakana.replace(/[ァ-ヶ]/g, char => String.fromCharCode((char.codePointAt(0) ?? 0) - 0x60));

const clean = (text: string): string => text.normalize('NFKC').trim().toLowerCase();

const splitMeanings = (item: KanaItem): string[] =>
  item.meanings ?? (item.meaning ?? '').split(/[,;]/).map(meaning => meaning.trim());

function collectFields(item: KanaItem): Fields {
  const { cloze } = item;
  const names = (cloze ? [cloze.point.label] : [item.kana, item.kanji ?? '']).filter(Boolean).map(clean);
  const kanjiReadings = [...(item.readings?.on ?? []), ...(item.readings?.kun ?? [])];
  // A grammar card's answers are particles and endings, which say little about the card.
  const readings = cloze
    ? []
    : [
        ...item.accepted,
        ...kanjiReadings.map(reading => reading.replace('.', '')),
        ...kanjiReadings.map(readingRomaji),
      ].map(clean);
  const meanings = cloze ? [cloze.point.meaning] : splitMeanings(item);
  const text = [...names, ...readings, ...meanings, cloze?.point.pattern ?? '', cloze ? '' : (item.meaning ?? '')]
    .map(clean)
    .join(' ');
  const sentence = cloze ? clean(`${item.kana} ${item.meaning ?? ''}`) : '';
  return { names, readings, meanings: meanings.map(clean), text, sentence };
}

const fieldsOf = new WeakMap<KanaItem, Fields>();

function fields(item: KanaItem): Fields {
  let found = fieldsOf.get(item);
  if (!found) {
    found = collectFields(item);
    fieldsOf.set(item, found);
  }
  return found;
}

// How well an item matches, the lower the better; null if it doesn't. A query in either kana script matches both.
function rank(item: KanaItem, spellings: string[], key: string): number | null {
  const { names, readings, meanings, text, sentence } = fields(item);
  const isAny = (list: string[]) => list.some(value => spellings.includes(value));
  const startsAny = (list: string[]) => list.some(value => spellings.some(spelling => value.startsWith(spelling)));
  const contains = (value: string) => spellings.some(spelling => value.includes(spelling));
  // Exactly what was typed comes before the same thing in the other script.
  if (names.includes(spellings[0] ?? '')) return 0;
  if (isAny(names)) return 1;
  if (isAny(readings)) return 2;
  if (key && meanings.some(meaning => meaningKey(meaning) === key)) return 3;
  if (startsAny(names)) return 4;
  if (startsAny(readings)) return 5;
  if (key && meanings.some(meaning => meaningKey(meaning).startsWith(key))) return 6;
  if (contains(text)) return 7;
  return contains(sentence) ? 8 : null;
}

// Finds kana, words, kanji and grammar by how they are written, read or what they mean, the closest matches first. A
// grammar point has several cards, of which only the best match is listed.
export function searchItems(query: string, items: KanaItem[] = KANA, limit = SEARCH_LIMIT): KanaItem[] {
  const typed = clean(query);
  if (!typed) return [];
  const spellings = [...new Set([typed, toHiragana(typed), toKatakana(typed)])];
  const key = meaningKey(typed);
  const matches = items
    .flatMap((item, index) => {
      const score = rank(item, spellings, key);
      return score === null ? [] : [{ item, score, index }];
    })
    .sort((a, b) => a.score - b.score || a.index - b.index);
  const points = new Set<string>();
  const found: KanaItem[] = [];
  for (const { item } of matches) {
    if (found.length >= limit) break;
    if (item.cloze) {
      if (points.has(item.rowId)) continue;
      points.add(item.rowId);
    }
    found.push(item);
  }
  return found;
}
