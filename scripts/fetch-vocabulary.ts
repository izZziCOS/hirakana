import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { firstSpelling, parseDelimited, shortMeaning } from '../src/decks.ts';
import { isWord, KANA } from '../src/kana.ts';
import { KANJI_DATA } from '../src/kanji-data.ts';

const VERSION = '1ad66734417aca9dbcca6b2d5ee440cb13ab3ba0';
const SOURCE = (level: number) =>
  `https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/${VERSION}/src/n${level}.csv`;
const OUT = join(resolve(import.meta.dirname, '..'), 'src', 'vocab-data.ts');
const LEVELS = [5, 4, 3, 2, 1];
const MAX_MEANING = 48;

// Strings as Prettier writes them, so a run that changes nothing leaves the file as it is.
function quote(text: string): string {
  const escaped = text.replace(/\\/g, '\\\\');
  const singles = text.split("'").length;
  const doubles = text.split('"').length;
  return singles > doubles ? `"${escaped.replace(/"/g, '\\"')}"` : `'${escaped.replace(/'/g, "\\'")}'`;
}

// Kana written around the kanji have to match the reading (お金持ち isn't かねもち).
function spellingMatches(kana: string, kanji: string): boolean {
  const before = /^[ぁ-ゖー]*/.exec(kanji)?.[0] ?? '';
  const after = /[ぁ-ゖー]*$/.exec(kanji)?.[0] ?? '';
  return kana.startsWith(before) && kana.endsWith(after);
}

const HIRAGANA = /^[ぁ-ゖー]+$/;
const KATAKANA = /^[ァ-ヺー]+$/;
const HAN = /\p{Script=Han}/u;

interface Word {
  level: number;
  kana: string;
  kanji: string;
  meaning: string;
  order: number;
}

const words: Word[] = [];
const seen = new Set<string>();
for (const level of LEVELS) {
  const response = await fetch(SOURCE(level));
  if (!response.ok) throw new Error(`HTTP ${response.status} for N${level}`);
  const [, ...rows] = parseDelimited(await response.text(), ',');
  for (const [expression = '', reading = '', meaning = ''] of rows) {
    const kana = firstSpelling(reading);
    const written = firstSpelling(expression);
    // Affixes such as ～円 can't be read on their own, and mixed-script readings fit neither script's rows.
    if (/[～〜]/.test(expression + reading) || !(HIRAGANA.test(kana) || KATAKANA.test(kana))) continue;
    // Verbs made with する are listed as 入学 read にゅうがくする.
    const spelled = kana.endsWith('する') && HAN.test(written.slice(-1)) ? `${written}する` : written;
    const kanji = HAN.test(spelled) ? spelled : '';
    if (kanji && !spellingMatches(kana, kanji)) continue;
    const key = `${kana}|${kanji}`;
    // A word listed at two levels is kept at the easier one.
    if (seen.has(key) || !shortMeaning(meaning, MAX_MEANING)) continue;
    seen.add(key);
    words.push({ level, kana, kanji, meaning: shortMeaning(meaning, MAX_MEANING), order: words.length });
  }
}

// Words already in the hand-written rows keep their cards there. A word without a kanji spelling counts as the same
// word as any spelling of it.
const handWritten = KANA.filter(isWord);
const isHandWritten = (word: Word) =>
  handWritten.some(item => item.kana === word.kana && (!item.kanji || !word.kanji || item.kanji === word.kanji));

// Within a level, words whose kanji are taught earliest come first, then the source's order (gojūon).
const kanjiRank = new Map(KANJI_DATA.map(([kanji], i) => [kanji, i]));
const difficulty = (word: Word) =>
  Math.max(
    -1,
    ...Array.from(word.kanji).map(char => (HAN.test(char) ? (kanjiRank.get(char) ?? KANJI_DATA.length) : -1)),
  );

// Progress is saved under these ids, so a word keeps the id the last run gave it, and an id once given never goes to
// another word, even after its own word has left the list.
const previous = await import('../src/vocab-data.ts').then(
  ({ VOCAB_DATA }) => new Map(VOCAB_DATA.map(([, kana, kanji, , id]) => [`${kana}|${kanji}`, id ?? kana])),
  () => new Map<string, string>(),
);
const keyOf = (word: Word) => `${word.kana}|${word.kanji}`;
const taken = new Set([...KANA.map(item => item.id), ...previous.values()]);

const sorted = words
  .filter(word => !isHandWritten(word))
  .sort((a, b) => b.level - a.level || difficulty(a) - difficulty(b) || a.order - b.order);
const ids = new Map<Word, string>();
for (const word of sorted) {
  const id = previous.get(keyOf(word));
  if (id !== undefined) ids.set(word, id);
}
for (const word of sorted) {
  if (ids.has(word)) continue;
  // Words with the same kana as another item are saved under their spelling too. One without a kanji spelling would
  // only repeat that card (じゃ the word and じゃ the combination).
  const id = taken.has(word.kana) ? `${word.kana}/${word.kanji}` : word.kana;
  if (taken.has(id) || (id !== word.kana && !word.kanji)) continue;
  taken.add(id);
  ids.set(word, id);
}

const lines = sorted.flatMap(word => {
  const id = ids.get(word);
  if (id === undefined) return [];
  const fields: (string | number)[] = [word.level, word.kana, word.kanji, word.meaning];
  if (id !== word.kana) fields.push(id);
  return [`  [${fields.map(field => (typeof field === 'number' ? field : quote(field))).join(', ')}],`];
});

await writeFile(
  OUT,
  `// Generated by scripts/fetch-vocabulary.ts. Do not edit by hand.
// JLPT vocabulary from open-anki-jlpt-decks by Jamie Sinclair (MIT), based on Jonathan Waller's lists, tanos.co.uk.
// Words already in the hand-written rows of src/data.ts are left out.
// [JLPT level, kana, kanji spelling or "", meaning, id when it isn't the kana]
import type { VocabEntry } from './types.ts';

export const VOCAB_DATA: VocabEntry[] = [
${lines.join('\n')}
];
`,
);
console.log(`Wrote ${lines.length} words to ${OUT}`);
