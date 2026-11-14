import { spellingOf } from './examples.ts';
import type { Segment } from './furigana.ts';
import { findKana, isKanji, isWord, KANA } from './kana.ts';
import type { KanaItem } from './types.ts';
import { codePoints } from './util.ts';

const HAN = /\p{Script=Han}/u;
// What follows a verb's stem when it is conjugated: 行き(ます), 行っ(て), 食べ(た), 見(ない), 見(ながら)…
const CONJUGATED = /^.?(?:ま[すせしょ]|て|た|な[いかく]|ながら|れ|ろ|よう|ず|っ|ん)/;
// What follows an adjective's stem: 高(くて), 高(かった), 高(ければ), 高(さ), 高(そう)…
const ADJECTIVE = /^(?:く|かっ|けれ|さ|そう|すぎ)/;

interface Written {
  item: KanaItem;
  spelling: string;
}

// Words by the kanji they start with, and the ones the app only has in kana by their reading. Built again when the
// word list grows, as the JLPT words load with the kanji.
let byKanji = new Map<string, Written[]>();
let byKana = new Map<string, KanaItem[]>();
let indexedSize = -1;

function index(): void {
  if (indexedSize === KANA.length) return;
  indexedSize = KANA.length;
  byKanji = new Map();
  byKana = new Map();
  for (const item of KANA) {
    if (!isWord(item) || item.group === 'custom') continue;
    const spelling = spellingOf(item);
    const lead = spelling && /^\p{Script=Han}+/u.exec(spelling)?.[0];
    if (spelling && lead) byKanji.set(lead, [...(byKanji.get(lead) ?? []), { item, spelling }]);
    else if (!spelling) byKana.set(item.kana, [...(byKana.get(item.kana) ?? []), item]);
  }
}

const commonStart = (a: string, b: string): number => {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return i;
};

// How well a word written with okurigana fits the kana after the selected kanji. A verb fits when the text goes on
// from its stem as a conjugation would (行き|ます for 行く, 食べ|た for 食べる), an adjective likewise (高|くて for
// 高い), and any word by how much of its ending the text repeats (大|きい for 大きい rather than 大きな).
function fit(ending: string, after: string, meaning = ''): number {
  const stem = ending.slice(0, -1);
  const rest = after.startsWith(stem) ? after.slice(stem.length) : null;
  const verb = meaning.startsWith('to ') && rest !== null && CONJUGATED.test(rest) ? 2 : 0;
  const adjective = ending.endsWith('い') && rest !== null && ADJECTIVE.test(rest) ? 2 : 0;
  return commonStart(ending, after) + verb + adjective;
}

// The word a selected run of kanji belongs to, given its reading and the kana after it: 学生 read がくせい is 学生,
// 水 read みず is the word みず, and 行 read い before きます is the verb 行く. A word written with okurigana has to fit
// the text after it; when two do, the better fit wins, then the shorter. A する verb is the last resort: 計画 is 計画する
// only when the app has no 計画 on its own.
export function wordAt(segments: Segment[], index_: number): KanaItem | undefined {
  const segment = segments[index_];
  if (!segment?.reading) return undefined;
  index();
  const { text, reading } = segment;
  const candidates = byKanji.get(text) ?? [];
  const exact = candidates.find(({ spelling, item }) => spelling === text && item.kana === reading);
  if (exact) return exact.item;
  const next = segments[index_ + 1];
  const after = next && next.reading === undefined ? next.text : '';
  const inflected = candidates.filter(({ spelling, item }) => {
    const okurigana = spelling.slice(text.length);
    return /^[ぁ-ゖ]+$/.test(okurigana) && item.kana.startsWith(reading) && item.kana.endsWith(okurigana);
  });
  const best = inflected
    .map(({ item }) => {
      const ending = item.kana.slice(reading.length);
      return { item, score: fit(ending, after, item.meaning), length: ending.length };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.length - b.length)[0];
  return best?.item ?? byKana.get(reading)?.[0] ?? inflected.find(({ spelling }) => spelling === `${text}する`)?.item;
}

// What can be saved from a selected run of kanji: its word, or else each of its kanji.
export function itemsAt(segments: Segment[], index_: number): KanaItem[] {
  const word = wordAt(segments, index_);
  if (word) return [word];
  const text = segments[index_]?.text ?? '';
  return [...new Set(codePoints(text).filter(char => HAN.test(char)))]
    .map(char => findKana(char))
    .filter((item): item is KanaItem => item !== undefined && isKanji(item));
}
