import { ALT_KANA, ALT_ROMAJI, CHARACTER_ROWS, LOOKALIKES, WORD_ROWS } from './data.ts';
import type { Direction, GroupId, KanaItem, RowInfo, Script } from './types.ts';
import { codePoints, unique } from './util.ts';

export const SCRIPTS: Script[] = ['hiragana', 'katakana'];
export const DIRECTIONS: Direction[] = ['read', 'recall', 'match', 'listen'];
const WORD_GROUPS: GroupId[] = ['sokuon', 'words'];
const LONG_VOWELS: Record<string, string[]> = { ā: ['aa'], ī: ['ii'], ū: ['uu'], ē: ['ee'], ō: ['oo'] };
const HIRAGANA_LONG_VOWELS: Record<string, string[]> = { ē: ['ei'], ō: ['ou'] };

export const otherScript = (script: Script): Script => (script === 'hiragana' ? 'katakana' : 'hiragana');
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
    row: row.label,
    rowId: rowIdOf(row),
    group: row.group,
    accepted: unique([word.romaji, ...longVowelSpellings(word.romaji, row.script), ...(word.alternatives ?? [])]),
  })),
);

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

const answerIndex = new Map<string, KanaItem>();
KANA.forEach(item =>
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
  if (direction === 'recall' || direction === 'listen') return !isWord(item);
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
