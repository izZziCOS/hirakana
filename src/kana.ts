import { ALT_KANA, ALT_ROMAJI, CHARACTER_ROWS, KANJI_LEVELS, LOOKALIKES, WORD_ROWS } from './data.ts';
import type {
  Direction,
  GroupId,
  KanaItem,
  KanaScript,
  KanjiEntry,
  KanjiGroupId,
  KanjiPart,
  RowInfo,
  Script,
  ScriptSetting,
  VocabEntry,
  Word,
} from './types.ts';
import { codePoints, unique } from './util.ts';

export const SCRIPTS: KanaScript[] = ['hiragana', 'katakana'];
export const DIRECTIONS: Direction[] = ['read', 'recall', 'match', 'listen', 'meaning', 'write'];
const WORD_GROUPS: GroupId[] = ['sokuon', 'words', 'n5', 'n4', 'n3', 'n2', 'n1', 'custom'];
const LONG_VOWELS: Record<string, string[]> = { ā: ['aa'], ī: ['ii'], ū: ['uu'], ē: ['ee'], ō: ['oo'] };
const MACRONS: Record<string, string> = { a: 'ā', i: 'ī', u: 'ū', e: 'ē', o: 'ō' };
const HIRAGANA_LONG_VOWELS: Record<string, string[]> = { ē: ['ei'], ō: ['ou'] };
export const KANJI_ROW_SIZE = 30;

export const otherScript = (script: Script): KanaScript => (script === 'hiragana' ? 'katakana' : 'hiragana');
export const rowIdOf = (row: { group: GroupId; label: string }): string => `${row.group}:${row.label}`;

export function longVowelSpellings(romaji: string, script: Script): string[] {
  return codePoints(romaji).reduce(
    (spellings, char) => {
      const options = LONG_VOWELS[char]
        ? [char, ...LONG_VOWELS[char], ...(script === 'hiragana' ? (HIRAGANA_LONG_VOWELS[char] ?? []) : [])]
        : [char];
      return spellings.flatMap(prefix => options.map(option => prefix + option));
    },
    [''],
  );
}

const characterItems: KanaItem[] = CHARACTER_ROWS.flatMap(row =>
  SCRIPTS.flatMap(script => {
    const chars = row[script];
    if (!chars) return [];
    const counterparts = row[otherScript(script)];
    const origins = script === 'hiragana' ? row.hiraganaOrigins : row.katakanaOrigins;
    return chars.map((kana, i) => {
      const romaji = row.romaji[i] ?? '';
      return {
        id: kana,
        kana,
        script,
        romaji,
        row: row.label,
        rowId: rowIdOf(row),
        group: row.group,
        rowNote: row.note,
        counterpart: counterparts?.[i],
        origin: origins?.[i],
        accepted: [romaji, ...(ALT_ROMAJI[romaji] ?? []), ...(ALT_KANA[kana] ?? [])],
      };
    });
  }),
);

interface ItemRow {
  label: string;
  group: GroupId;
  // Defaults to rowIdOf(row).
  id?: string;
}

// "to meet, to see" is two meanings; a comma inside brackets ("light (in weight, colour)") doesn't split one.
export const meaningList = (meaning: string): string[] =>
  meaning
    .split(/[,;](?![^(]*\))/)
    .map(part => part.trim())
    .filter(Boolean);

export function wordItem(word: Word & { id?: string }, row: ItemRow, script: Script): KanaItem {
  return {
    id: word.id ?? word.kana,
    kana: word.kana,
    script,
    romaji: word.romaji,
    meaning: word.meaning,
    meanings: meaningList(word.meaning),
    kanji: word.kanji,
    row: row.label,
    rowId: row.id ?? rowIdOf(row),
    group: row.group,
    accepted: unique([word.romaji, ...longVowelSpellings(word.romaji, script), ...(word.alternatives ?? [])]),
  };
}

const wordItems: KanaItem[] = WORD_ROWS.flatMap(row => row.words.map(word => wordItem(word, row, row.script)));

const SYLLABLES = new Map(characterItems.map(item => [item.kana, item.romaji]));
const SMALL_Y: Record<string, string> = { ゃ: 'a', ゅ: 'u', ょ: 'o', ャ: 'a', ュ: 'u', ョ: 'o' };
const SMALL_VOWELS: Record<string, string> = {
  ぁ: 'a',
  ぃ: 'i',
  ぅ: 'u',
  ぇ: 'e',
  ぉ: 'o',
  ァ: 'a',
  ィ: 'i',
  ゥ: 'u',
  ェ: 'e',
  ォ: 'o',
};

export function toRomaji(kana: string): string {
  const chars = codePoints(kana);
  let romaji = '';
  let double = false;
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i] ?? '';
    if (char === 'っ' || char === 'ッ') {
      double = true;
      continue;
    }
    const next = chars[i + 1] ?? '';
    const base = SYLLABLES.get(char) ?? char;
    let syllable = SYLLABLES.get(char + next);
    // Rare pairs such as ぢゅ: drop the i and add y (ni + ゅ → nyu), except after sh, ch and j (ji + ゅ → ju).
    if (!syllable && SMALL_Y[next] && base.endsWith('i')) {
      const stem = base.slice(0, -1);
      syllable = (/(sh|ch|j)$/.test(stem) ? stem : `${stem}y`) + SMALL_Y[next];
    }
    // Rare loanword pairs such as リェ: a small vowel replaces the vowel (rye), with a y after an i.
    if (!syllable && SMALL_VOWELS[next] && /[aiueo]$/.test(base)) {
      syllable = base.slice(0, -1) + (base.endsWith('i') && base.length > 1 ? 'y' : '') + SMALL_VOWELS[next];
    }
    if (syllable) i++;
    syllable ??= base;
    if (double) romaji += syllable.startsWith('ch') ? 't' : syllable.charAt(0);
    double = false;
    romaji += syllable;
  }
  return romaji
    .replace(/([aeiou])ー/g, (_, vowel: string) => MACRONS[vowel] ?? vowel)
    .replace(/o[ou]/g, 'ō')
    .replace(/uu/g, 'ū');
}

const BEFORE_VOWEL_N = /[んン](?=[あいうえおやゆよアイウエオヤユヨ])/g;

// Romaji for a word that has none written by hand. ん before a vowel or y can also be typed nn (kinen or kinnen).
export function wordRomaji(kana: string): { romaji: string; alternatives: string[] } {
  const romaji = toRomaji(kana);
  const doubled = kana.replace(BEFORE_VOWEL_N, '$&$&');
  return { romaji, alternatives: doubled === kana ? [] : [toRomaji(doubled)] };
}

// Okurigana follow a dot (あ.がる); long vowels never join across it, so お.う stays "ou".
export const readingRomaji = (reading: string): string => reading.split('.').map(toRomaji).join('');

export const kunreiSpelling = (romaji: string): string =>
  romaji
    .replace(/shi/g, 'si')
    .replace(/sh/g, 'sy')
    .replace(/chi/g, 'ti')
    .replace(/ch/g, 'ty')
    .replace(/tsu/g, 'tu')
    .replace(/fu/g, 'hu')
    .replace(/ji/g, 'zi')
    .replace(/j/g, 'zy');

// Any reading counts, typed in full (agaru) or as the part the kanji itself spells (a).
function readingAnswers(readings: string[]): string[] {
  const spellings = readings.flatMap(reading => [readingRomaji(reading), toRomaji(reading.split('.')[0] ?? '')]);
  return unique(
    spellings
      .flatMap(romaji => longVowelSpellings(romaji, 'hiragana'))
      .flatMap(romaji => [romaji, kunreiSpelling(romaji)]),
  );
}

const splitList = (list: string): string[] => (list ? list.split(' ') : []);

interface KanjiRow {
  label: string;
  group: KanjiGroupId;
  entries: KanjiEntry[];
}

const kanjiRowsOf = (data: KanjiEntry[]): KanjiRow[] =>
  KANJI_LEVELS.flatMap(level => {
    const entries = data.filter(entry => entry[1] === level);
    return Array.from({ length: Math.ceil(entries.length / KANJI_ROW_SIZE) }, (_, i) => {
      const rowEntries = entries.slice(i * KANJI_ROW_SIZE, (i + 1) * KANJI_ROW_SIZE);
      const label = `N${level} · ${i * KANJI_ROW_SIZE + 1}–${i * KANJI_ROW_SIZE + rowEntries.length}`;
      return { label, group: `k${level}` as KanjiGroupId, entries: rowEntries };
    });
  });

function kanjiItem([kanji, , strokes, on, kun, meanings]: KanjiEntry, row: KanjiRow): KanaItem {
  const readings = { on: splitList(on), kun: splitList(kun) };
  const all = [...readings.on, ...readings.kun];
  const meaningList = meanings.split('; ');
  return {
    id: kanji,
    kana: kanji,
    script: 'kanji',
    romaji: readingRomaji(all[0] ?? ''),
    row: row.label,
    rowId: rowIdOf(row),
    group: row.group,
    accepted: readingAnswers(all),
    meaning: meaningList.join(', '),
    meanings: meaningList,
    readings,
    strokes,
  };
}

// Kanji are added by registerKanji once src/kanji.ts has loaded (see src/kanji-loader.ts).
export const KANA: KanaItem[] = [...characterItems, ...wordItems];
const kanaIndex = new Map(KANA.map(item => [item.id, item]));

// Looks an item up by its id, which for every single character is the character itself.
export const findKana = (id: string | undefined): KanaItem | undefined =>
  id === undefined ? undefined : kanaIndex.get(id);

export function getKana(id: string): KanaItem {
  const item = kanaIndex.get(id);
  if (!item) throw new Error(`Unknown kana: ${id}`);
  return item;
}

const previewOf = (chars: string[] | undefined): string | undefined =>
  chars?.join(chars.every(kana => codePoints(kana).length === 1) ? '' : ' ');

export const ROW_INFO: RowInfo[] = [
  ...CHARACTER_ROWS.map(row => ({
    id: rowIdOf(row),
    label: row.label,
    group: row.group,
    preview: { hiragana: previewOf(row.hiragana), katakana: previewOf(row.katakana) },
  })),
  ...WORD_ROWS.map(row => ({
    id: rowIdOf(row),
    label: row.label,
    group: row.group,
    preview: { [row.script]: row.mark ?? row.label },
  })),
];

let kanjiRegistered = false;
export const kanjiLoaded = (): boolean => kanjiRegistered;

// Kanji by the parts they contain, keyed by the part's own kanji (水 for 氵).
const kanjiByPart = new Map<string, KanaItem[]>();

const partsFrom = (list: string | undefined): KanjiPart[] =>
  splitList(list ?? '').map(part => {
    const [shape = '', kanji] = part.split('=');
    return { shape, kanji: kanji ?? shape };
  });

// Adds the JLPT kanji to KANA and ROW_INFO. They are kept out of the main bundle so that people learning kana don't
// have to download them before the app starts.
export function registerKanji(data: KanjiEntry[], parts: Record<string, string> = {}): void {
  if (kanjiRegistered) return;
  kanjiRegistered = true;
  for (const row of kanjiRowsOf(data)) {
    for (const entry of row.entries) {
      const item = { ...kanjiItem(entry, row), parts: partsFrom(parts[entry[0]]) };
      KANA.push(item);
      kanaIndex.set(item.id, item);
      item.parts.forEach(part => kanjiByPart.set(part.kanji, [...(kanjiByPart.get(part.kanji) ?? []), item]));
    }
    ROW_INFO.push({
      id: rowIdOf(row),
      label: row.label,
      group: row.group,
      preview: {
        kanji: row.entries
          .slice(0, 4)
          .map(([kanji]) => kanji)
          .join(''),
      },
    });
  }
}

export const VOCAB_ROW_SIZE = 30;
const VOCAB_GROUPS: Record<number, GroupId> = { 5: 'n5', 4: 'n4', 3: 'n3', 2: 'n2', 1: 'n1' };

let vocabRegistered = false;
// Words in katakana only are katakana words; everything else, including words that mix the two, counts as hiragana.
export const scriptOf = (kana: string): KanaScript => (/^[ァ-ヺー]+$/.test(kana) ? 'katakana' : 'hiragana');

// Adds a word to the lists, so it can be found by id and by a typed answer.
export function addItem(item: KanaItem): void {
  KANA.push(item);
  kanaIndex.set(item.id, item);
  indexAnswers(item);
}

// Takes items out of the lists again (imported decks that were deleted or replaced).
export function removeItems(remove: (item: KanaItem) => boolean): void {
  for (let i = KANA.length - 1; i >= 0; i--) {
    const item = KANA[i];
    if (item && remove(item)) {
      KANA.splice(i, 1);
      kanaIndex.delete(item.id);
    }
  }
  answerIndex.forEach((item, key) => {
    if (remove(item)) answerIndex.delete(key);
  });
}

// Adds the full JLPT word list to KANA and ROW_INFO after the hand-written word rows of each level, in rows of 30 per
// script. It is loaded together with the kanji.
export function registerVocabulary(data: VocabEntry[]): void {
  if (vocabRegistered) return;
  vocabRegistered = true;
  for (const level of KANJI_LEVELS) {
    for (const script of SCRIPTS) {
      const entries = data.filter(([entryLevel, kana]) => entryLevel === level && scriptOf(kana) === script);
      for (let start = 0; start < entries.length; start += VOCAB_ROW_SIZE) {
        const rowEntries = entries.slice(start, start + VOCAB_ROW_SIZE);
        const last = start + rowEntries.length;
        const range = last === start + 1 ? String(last) : `${start + 1}–${last}`;
        const row = {
          label: `N${level}${script === 'katakana' ? ' katakana' : ''} · ${range}`,
          group: VOCAB_GROUPS[level] ?? 'n5',
        };
        for (const [, kana, kanji, meaning, id] of rowEntries) {
          addItem(wordItem({ id, kana, kanji: kanji || undefined, meaning, ...wordRomaji(kana) }, row, script));
        }
        ROW_INFO.push({
          id: rowIdOf(row),
          label: row.label,
          group: row.group,
          preview: { [script]: script === 'katakana' ? `カナ ${range}` : range },
        });
      }
    }
  }
}

export const isKanji = (item: KanaItem): boolean => item.script === 'kanji';

// Whether a card is practised with this script picked. Kanji and imported decks are practised whichever it is.
export const inScript = (item: KanaItem, script: ScriptSetting): boolean =>
  script === 'both' || item.script === script || isKanji(item) || item.group === 'custom';

// Other kanji built with one of this kanji's parts, or with this kanji as a part, most common first.
export function kanjiSharingParts(item: KanaItem, limit: number): KanaItem[] {
  const keys = [item.kana, ...(item.parts ?? []).map(part => part.kanji)];
  return unique(keys.flatMap(key => kanjiByPart.get(key) ?? []))
    .filter(other => other !== item)
    .slice(0, limit);
}

// The JLPT kanji a word is written with, and the words written with a kanji.
export const kanjiOfWord = (word: KanaItem): KanaItem[] =>
  unique(codePoints(word.kanji ?? '')).flatMap(char => {
    const item = findKana(char);
    return item && isKanji(item) ? [item] : [];
  });

export const wordsWithKanji = (kanji: KanaItem): KanaItem[] => KANA.filter(word => word.kanji?.includes(kanji.kana));

const KANJI_GROUPS = new Set<GroupId>(KANJI_LEVELS.map(level => `k${level}` as const));
export const isKanjiGroup = (group: GroupId): boolean => KANJI_GROUPS.has(group);

// Kanji and words written in kanji show a reading under the kanji until they are mastered (see applyKanjiStage).
export const hasReadingStage = (item: KanaItem): boolean => Boolean(item.kanji) || isKanji(item);

export const toKatakana = (hiragana: string): string =>
  hiragana.replace(/[ぁ-ゖ]/g, char => String.fromCharCode((char.codePointAt(0) ?? 0) + 0x60));

// The reading shown under a kanji: its first on reading in katakana, otherwise its first kun reading in hiragana.
export function mainReading(item: KanaItem): string {
  const [on] = item.readings?.on ?? [];
  return on ? toKatakana(on) : (item.readings?.kun[0] ?? '').replace('.', '');
}

// Kanji share readings too widely for a typed reading to point at one of them.
const answerIndex = new Map<string, KanaItem>();
function indexAnswers(item: KanaItem): void {
  item.accepted.forEach(answer => {
    const key = `${item.script}:${answer}`;
    if (!answerIndex.has(key)) answerIndex.set(key, item);
  });
}
KANA.filter(item => !isKanji(item)).forEach(indexAnswers);

export const kanaForAnswer = (given: string | null, script: Script): KanaItem | null =>
  given ? (answerIndex.get(`${script}:${given}`) ?? null) : null;

export const normalizeAnswer = (raw: string): string => raw.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');

export const isWord = (item: KanaItem): boolean => WORD_GROUPS.includes(item.group);

export function supportsDirection(item: KanaItem, direction: Direction): boolean {
  if (direction === 'write') return !isWord(item) && codePoints(item.kana).length === 1;
  if (isKanji(item)) return direction === 'read' || direction === 'meaning';
  // Words are given their meaning (Meaning) and recalled from it (Recall); single kana have no meaning.
  if (direction === 'meaning') return isWord(item);
  if (direction === 'recall') return true;
  if (direction === 'listen') return true;
  if (direction === 'match') return !isWord(item) && Boolean(item.counterpart);
  return true;
}

export const statKey = (item: KanaItem, direction: Direction = 'read'): string =>
  direction === 'read' ? item.id : `${direction}:${item.id}`;

export function parseStatKey(key: string): { direction: string; kana: string } {
  const separator = key.indexOf(':');
  return separator === -1
    ? { direction: 'read', kana: key }
    : { direction: key.slice(0, separator), kana: key.slice(separator + 1) };
}

export function lookalikesOf(item: KanaItem): KanaItem[] {
  const chars = new Set(LOOKALIKES.filter(group => group.includes(item.id)).flat());
  chars.delete(item.id);
  return [...chars].map(findKana).filter(other => other !== undefined);
}
