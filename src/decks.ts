import {
  addItem,
  kunreiSpelling,
  longVowelSpellings,
  normalizeAnswer,
  removeItems,
  ROW_INFO,
  scriptOf,
  wordItem,
  wordRomaji,
} from './kana.ts';
import type { Deck, DeckWord, KanaItem } from './types.ts';

// Word lists the learner imports, such as a textbook chapter exported from Anki. They are saved with the progress, so
// they are exported and synced with it, and each deck is one row of the "Your decks" set.

export const DECK_GROUP = 'custom';
export const MAX_DECKS = 20;
export const MAX_DECK_WORDS = 3000;
export const MAX_DECK_NAME = 60;
export const MAX_MEANING = 60;
const ITEM_PREFIX = '@';
const ROW_PREFIX = `${DECK_GROUP}:`;

export const isDeckItemId = (id: string): boolean => id.startsWith(ITEM_PREFIX);
export const isDeckRowId = (id: string): boolean => id.startsWith(ROW_PREFIX);
export const deckRowId = (deck: Pick<Deck, 'id'>): string => `${ROW_PREFIX}${deck.id}`;
// The deck an item id such as "@k3x9qa/ねこ/猫" belongs to.
export const deckOfItem = (id: string): string | null =>
  isDeckItemId(id) ? id.slice(ITEM_PREFIX.length).split('/')[0] || null : null;

const wordId = (deck: Deck, word: DeckWord): string =>
  `${ITEM_PREFIX}${deck.id}/${word.kana}${word.kanji ? `/${word.kanji}` : ''}`;

const KANA_TEXT = /^[ぁ-ゖァ-ヺー]+$/;
const KANJI_TEXT = /^[\p{Script=Han}ぁ-ゖァ-ヺー々〆ヶ]+$/u;
const HAN = /\p{Script=Han}/u;

export const isKanaText = (text: string): boolean => KANA_TEXT.test(text);
export const isKanjiSpelling = (text: string): boolean => KANJI_TEXT.test(text) && HAN.test(text);

// The cards of a deck, all words practised in Read and Listen.
export function deckItems(deck: Deck): KanaItem[] {
  const row = { label: deck.name, group: DECK_GROUP, id: deckRowId(deck) } as const;
  return deck.words.map(word =>
    wordItem({ ...word, id: wordId(deck, word), ...wordRomaji(word.kana) }, row, scriptOf(word.kana)),
  );
}

// A deck only changes when a new version of it is imported, which moves its updatedAt on.
export const sameDecks = (a: readonly Deck[], b: readonly Deck[]): boolean =>
  a.length === b.length && a.every((deck, i) => deck.id === b[i]?.id && deck.updatedAt === b[i].updatedAt);

let registered: readonly Deck[] = [];

// Makes KANA and ROW_INFO hold exactly these decks. Called whenever the saved state changes.
export function registerDecks(decks: readonly Deck[]): void {
  if (sameDecks(decks, registered)) return;
  registered = decks;
  removeItems(item => item.group === DECK_GROUP);
  for (let i = ROW_INFO.length - 1; i >= 0; i--) {
    if (ROW_INFO[i]?.group === DECK_GROUP) ROW_INFO.splice(i, 1);
  }
  for (const deck of decks) {
    deckItems(deck).forEach(addItem);
    ROW_INFO.push({
      id: deckRowId(deck),
      label: deck.name,
      group: DECK_GROUP,
      preview: { hiragana: deck.name, katakana: deck.name },
    });
  }
}

// Splits delimited text into rows of fields. Fields may be quoted and then contain the delimiter, line breaks or
// doubled quotes ("").
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i);
    if (quoted) {
      if (char !== '"') field += char;
      else if (text.charAt(i + 1) === '"') field += text.charAt(++i);
      else quoted = false;
    } else if (char === '"' && !field) {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text.charAt(i + 1) === '\n') i++;
      rows.push([...row, field]);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

// "いい; よい" and "しまった (かん)" keep their first spelling without the note.
export const firstSpelling = (text: string): string =>
  (text.split(/[;；、,]/)[0] ?? '').replace(/\s*[(（].*?[)）]\s*/g, '').trim();

// Splits at commas outside brackets: "use (same as A, B), application" → ["use (same as A, B)", "application"].
function commaParts(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let part = '';
  for (const char of text) {
    depth += char === '(' ? 1 : char === ')' ? -1 : 0;
    if (char === ',' && depth <= 0) {
      parts.push(part.trim());
      part = '';
    } else part += char;
  }
  return [...parts, part.trim()].filter(Boolean);
}

const withoutNotes = (text: string): string => {
  let plain = text;
  while (/\([^()]*\)/.test(plain)) plain = plain.replace(/\s*\([^()]*\)/g, '');
  return plain.trim() || text;
};

// The first sense, with as many of its comma-separated meanings as fit. If even the first doesn't, it loses its notes:
// "late afternoon (typically just before dinner time)" → "late afternoon".
export function shortMeaning(text: string, max = MAX_MEANING): string {
  const first = (text.replace(/\s*--.*?--\s*/g, ' ').split('; ')[0] ?? '').trim();
  // Grammar notes in front ("(abbr.) kilo") go, unless they are all there is ("(sigh)").
  const [head = '', ...rest] = commaParts(first.replace(/^\([^)]*\)\s*(?=\S)/, ''));
  let meaning = head.length <= max ? head : withoutNotes(head);
  for (const part of rest) {
    if (meaning.length + part.length + 2 > max) break;
    meaning += `, ${part}`;
  }
  return meaning.length <= max ? meaning : `${meaning.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// Anki fields can hold HTML, sound files and furigana written as 漢字[かんじ].
function cleanField(field: string): string {
  return field
    .replace(/\[sound:[^\]]*\]/g, '')
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|[a-z]+);/gi, (entity, name: string) =>
      name.startsWith('#') ? String.fromCodePoint(Number(name.slice(1))) : (ENTITIES[name.toLowerCase()] ?? entity),
    )
    .trim();
}

// 漢字[かんじ] gives both the reading and the spelling; a space before a bracketed part only separates words.
function fromFurigana(field: string): { kana: string; kanji: string } | null {
  if (!/\[[ぁ-ゖァ-ヺー]+\]/.test(field)) return null;
  const parts = field.replace(/\s+/g, '');
  const kana = parts.replace(/[\p{Script=Han}々〆ヶ]+\[([^\]]*)\]/gu, '$1');
  const kanji = parts.replace(/\[[^\]]*\]/g, '');
  return isKanaText(kana) && isKanjiSpelling(kanji) ? { kana, kanji } : null;
}

const LATIN = /[A-Za-z]/;

// A romaji column ("neko" next to ねこ) isn't the meaning.
function isRomajiOf(text: string, kana: string): boolean {
  const typed = normalizeAnswer(text).replace(/['’-]/g, '');
  const { romaji, alternatives } = wordRomaji(kana);
  return [romaji, ...alternatives].some(spelling =>
    longVowelSpellings(spelling, scriptOf(kana)).some(option => option === typed || kunreiSpelling(option) === typed),
  );
}

// Reads one line of a word list, whatever order its fields are in: the reading is the field in kana, the spelling the
// one with kanji and the meaning the first other one in Latin letters.
function wordFrom(fields: string[]): DeckWord | null {
  let kana = '';
  let kanji = '';
  const latin: string[] = [];
  for (const raw of fields.map(cleanField)) {
    const furigana = fromFurigana(raw);
    const text = firstSpelling(raw).replace(/[\s・]/g, '');
    if (furigana) {
      kana ||= furigana.kana;
      kanji ||= furigana.kanji;
    } else if (isKanaText(text)) {
      kana ||= text;
    } else if (isKanjiSpelling(text)) {
      kanji ||= text;
    } else if (LATIN.test(raw)) {
      latin.push(raw);
    }
  }
  const meaning = latin.find(text => !isRomajiOf(text, kana));
  return kana && meaning ? { kana, ...(kanji ? { kanji } : {}), meaning: shortMeaning(meaning) } : null;
}

// Anki's plain-text export starts with lines such as "#separator:tab"; otherwise tabs win, then semicolons when a
// line has no commas.
function delimiterOf(text: string): string {
  const declared = /^#separator:(\w+)/m.exec(text)?.[1]?.toLowerCase();
  const named: Record<string, string> = { tab: '\t', comma: ',', semicolon: ';', pipe: '|', space: ' ' };
  if (declared && named[declared]) return named[declared];
  const sample = text.split(/\r?\n/).find(line => line.trim() && !line.startsWith('#')) ?? '';
  if (sample.includes('\t')) return '\t';
  if (sample.includes(';') && !sample.includes(',')) return ';';
  return ',';
}

export interface ParsedDeck {
  words: DeckWord[];
  skipped: number;
}

export function parseDeck(text: string): ParsedDeck {
  // trimStart also drops the byte order mark some editors save at the start.
  const body = text.trimStart();
  const lines = parseDelimited(body, delimiterOf(body)).filter(
    fields => fields.some(field => field.trim()) && !fields[0]?.startsWith('#'),
  );
  const words: DeckWord[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const fields of lines) {
    const word = wordFrom(fields);
    const key = word && `${word.kana}/${word.kanji ?? ''}`;
    if (!word || !key) skipped++;
    else if (!seen.has(key) && words.length < MAX_DECK_WORDS) {
      seen.add(key);
      words.push(word);
    }
  }
  return { words, skipped };
}

// How many words a new version of a deck adds and removes; a word is the same word if its kana and kanji are.
export function deckChanges(before: DeckWord[], after: DeckWord[]): { added: number; removed: number } {
  const key = (word: DeckWord) => `${word.kana}/${word.kanji ?? ''}`;
  const old = new Set(before.map(key));
  const next = new Set(after.map(key));
  return { added: [...next].filter(k => !old.has(k)).length, removed: [...old].filter(k => !next.has(k)).length };
}

// "Genki 3.txt" → "Genki 3".
export const deckNameOf = (fileName: string): string =>
  fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_]+/g, ' ')
    .trim()
    .slice(0, MAX_DECK_NAME) || 'Imported deck';

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export const newDeckId = (random = Math.random): string =>
  Array.from({ length: 6 }, () => ID_ALPHABET.charAt(Math.floor(random() * ID_ALPHABET.length))).join('');

export const isDeckId = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9]{1,12}$/.test(id);

// Cleans decks read from saved progress, an import or another device.
export function sanitizeDecks(raw: unknown): Deck[] {
  const decks: Deck[] = [];
  for (const value of Array.isArray(raw) ? raw : []) {
    if (typeof value !== 'object' || value === null) continue;
    const deck = value as Record<string, unknown>;
    if (!isDeckId(deck.id) || decks.some(other => other.id === deck.id)) continue;
    const seen = new Set<string>();
    const words = (Array.isArray(deck.words) ? deck.words : []).flatMap((entry: unknown): DeckWord[] => {
      if (typeof entry !== 'object' || entry === null) return [];
      const word = entry as Record<string, unknown>;
      if (typeof word.kana !== 'string' || !isKanaText(word.kana)) return [];
      if (typeof word.meaning !== 'string' || !word.meaning.trim()) return [];
      const kanji = typeof word.kanji === 'string' && isKanjiSpelling(word.kanji) ? word.kanji : undefined;
      const key = `${word.kana}/${kanji ?? ''}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ kana: word.kana, ...(kanji ? { kanji } : {}), meaning: word.meaning.trim().slice(0, MAX_MEANING) }];
    });
    if (!words.length) continue;
    const name = typeof deck.name === 'string' && deck.name.trim() ? deck.name.trim() : 'Imported deck';
    const addedAt = typeof deck.addedAt === 'number' && Number.isFinite(deck.addedAt) ? Math.max(0, deck.addedAt) : 0;
    decks.push({
      id: deck.id,
      name: name.slice(0, MAX_DECK_NAME),
      words: words.slice(0, MAX_DECK_WORDS),
      addedAt,
      updatedAt:
        typeof deck.updatedAt === 'number' && Number.isFinite(deck.updatedAt)
          ? Math.max(addedAt, deck.updatedAt)
          : addedAt,
    });
    if (decks.length === MAX_DECKS) break;
  }
  return decks;
}
