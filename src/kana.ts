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
} from './types.ts';
import { codePoints, unique } from './util.ts';

export const SCRIPTS: KanaScript[] = ['hiragana', 'katakana'];
export const DIRECTIONS: Direction[] = ['read', 'recall', 'match', 'listen', 'meaning', 'write'];
const WORD_GROUPS: GroupId[] = ['sokuon', 'words', 'n5', 'n4', 'n3', 'n2', 'n1'];
const LONG_VOWELS: Record<string, string[]> = { ā: ['aa'], ī: ['ii'], ū: ['uu'], ē: ['ee'], ō: ['oo'] };
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

const wordItems: KanaItem[] = WORD_ROWS.flatMap(row =>
  row.words.map(word => ({
    kana: word.kana,
    script: row.script,
    romaji: word.romaji,
    meaning: word.meaning,
    kanji: word.kanji,
    row: row.label,
    rowId: rowIdOf(row),
    group: row.group,
    accepted: unique([word.romaji, ...longVowelSpellings(word.romaji, row.script), ...(word.alternatives ?? [])]),
  })),
);

const SYLLABLES = new Map(characterItems.map(item => [item.kana, item.romaji]));
const SMALL_Y: Record<string, string> = { ゃ: 'a', ゅ: 'u', ょ: 'o', ャ: 'a', ュ: 'u', ョ: 'o' };

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
    if (syllable) i++;
    syllable ??= base;
    if (double) romaji += syllable.startsWith('ch') ? 't' : syllable.charAt(0);
    double = false;
    romaji += syllable;
  }
  return romaji.replace(/o[ou]/g, 'ō').replace(/uu/g, 'ū');
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
const kanaIndex = new Map(KANA.map(item => [item.kana, item]));

export const findKana = (kana: string | undefined): KanaItem | undefined =>
  kana === undefined ? undefined : kanaIndex.get(kana);

export function getKana(kana: string): KanaItem {
  const item = kanaIndex.get(kana);
  if (!item) throw new Error(`Unknown kana: ${kana}`);
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
      kanaIndex.set(item.kana, item);
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

export const isKanji = (item: KanaItem): boolean => item.script === 'kanji';

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
KANA.filter(item => !isKanji(item)).forEach(item =>
  item.accepted.forEach(answer => {
    const key = `${item.script}:${answer}`;
    if (!answerIndex.has(key)) answerIndex.set(key, item);
  }),
);

export const kanaForAnswer = (given: string | null, script: Script): KanaItem | null =>
  given ? (answerIndex.get(`${script}:${given}`) ?? null) : null;

export const normalizeAnswer = (raw: string): string => raw.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');

export const isWord = (item: KanaItem): boolean => WORD_GROUPS.includes(item.group);

export function supportsDirection(item: KanaItem, direction: Direction): boolean {
  if (direction === 'write') return !isWord(item) && codePoints(item.kana).length === 1;
  if (isKanji(item)) return direction === 'read' || direction === 'meaning';
  if (direction === 'meaning') return false;
  if (direction === 'recall') return !isWord(item);
  if (direction === 'listen') return true;
  if (direction === 'match') return !isWord(item) && Boolean(item.counterpart);
  return true;
}

export const statKey = (item: KanaItem, direction: Direction = 'read'): string =>
  direction === 'read' ? item.kana : `${direction}:${item.kana}`;

export function parseStatKey(key: string): { direction: string; kana: string } {
  const separator = key.indexOf(':');
  return separator === -1
    ? { direction: 'read', kana: key }
    : { direction: key.slice(0, separator), kana: key.slice(separator + 1) };
}

export function lookalikesOf(item: KanaItem): KanaItem[] {
  const chars = new Set(LOOKALIKES.filter(group => group.includes(item.kana)).flat());
  chars.delete(item.kana);
  return [...chars].map(findKana).filter(other => other !== undefined);
}
