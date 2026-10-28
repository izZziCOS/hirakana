export type KanaScript = 'hiragana' | 'katakana';
export type Script = KanaScript | 'kanji';
export type ScriptSetting = 'hiragana' | 'katakana' | 'both';
export type Mode = 'type' | 'choose';
export type Direction = 'read' | 'recall' | 'match' | 'listen' | 'meaning' | 'write';
// What is practised: one direction, or due cards from every direction in use.
export type PracticeDirection = Direction | 'mixed';
export type Theme = 'system' | 'light' | 'dark';
export type SpeedCheck = 'adaptive' | 'off';
export type GroupId =
  | 'basic'
  | 'dakuten'
  | 'yoon'
  | 'sokuon'
  | 'extended'
  | 'words'
  | 'n5'
  | 'n4'
  | 'n3'
  | 'n2'
  | 'n1'
  | KanjiGroupId
  // Imported decks.
  | 'custom';
export type KanjiGroupId = 'k5' | 'k4' | 'k3' | 'k2' | 'k1';
export type Outcome = 'correct' | 'slow' | 'wrong' | 'peeked';
export type CardKind = 'new' | 'review' | 'ahead' | 'drill' | 'contrast';
export type Level = 'new' | 'weak' | 'learning' | 'mastered';

export interface Group {
  id: GroupId;
  label: string;
  hint: string;
}

// The home screen groups the character sets into three tracks.
export interface Track {
  id: 'kana' | 'vocabulary' | 'kanji' | 'decks';
  label: string;
  glyph: string;
  summary: string;
  groups: GroupId[];
}

export interface CharacterRow {
  label: string;
  group: GroupId;
  romaji: string[];
  hiragana?: string[];
  katakana?: string[];
  hiraganaOrigins?: string[];
  katakanaOrigins?: string[];
  note?: string;
}

export interface Word {
  kana: string;
  kanji?: string;
  romaji: string;
  meaning: string;
  alternatives?: string[];
}

export interface WordRow {
  label: string;
  group: GroupId;
  script: Script;
  mark?: string;
  words: Word[];
}

export interface Example {
  word: string;
  reading: string;
  meaning: string;
}

export interface KanaItem {
  // What progress and mistakes are saved under: the kana or kanji itself, except for words that share their kana with
  // another item (はし for 橋 and 箸), which add their spelling (はし/箸).
  id: string;
  kana: string;
  script: Script;
  romaji: string;
  row: string;
  rowId: string;
  group: GroupId;
  accepted: string[];
  counterpart?: string;
  origin?: string;
  rowNote?: string;
  meaning?: string;
  kanji?: string;
  meanings?: string[];
  readings?: KanjiReadings;
  strokes?: number;
  parts?: KanjiPart[];
}

// A part a kanji is built from: its shape there (氵) and the kanji it comes from (水), which are often the same.
export interface KanjiPart {
  shape: string;
  kanji: string;
}

export interface KanjiReadings {
  on: string[];
  kun: string[];
}

export type KanjiEntry = [kanji: string, level: number, strokes: number, on: string, kun: string, meanings: string];

export type VocabEntry = [level: number, kana: string, kanji: string, meaning: string, id?: string];

// A word of an imported deck.
export interface DeckWord {
  kana: string;
  kanji?: string;
  meaning: string;
}

export interface Deck {
  // A few lower-case letters and digits; the deck's cards and row are saved under it.
  id: string;
  name: string;
  words: DeckWord[];
  addedAt: number;
  // When its words last changed: importing a new version of a deck replaces them.
  updatedAt: number;
}

export interface RowInfo {
  id: string;
  label: string;
  group: GroupId;
  preview: Partial<Record<Script, string>>;
}

export interface Stat {
  correct: number;
  wrong: number;
  streak: number;
  box: number;
  due: number;
  last: number;
  avgMs?: number;
  kanjiOnly?: boolean;
}

export interface Mistake {
  // The id of the item that was missed.
  kana: string;
  given: string;
  at: number;
  direction: Direction;
}

export interface DayLog {
  answers: number;
  learned: number;
  scored: number;
  correct: number;
}

export interface Settings {
  script: ScriptSetting;
  rows: string[];
  mode: Mode;
  direction: PracticeDirection;
  newPerDay: number;
  goal: number;
  speedCheck: SpeedCheck;
  theme: Theme;
  kanaPad: boolean;
  // Show a character before testing it the first time.
  introduce: boolean;
}

export interface State {
  version: number;
  settings: Settings;
  stats: Record<string, Stat>;
  mistakes: Mistake[];
  days: Record<string, DayLog>;
  bestStreak: number;
  lastBackup: number;
  // Day logs of the other devices this progress is synced with, by device id. `days` is this device's own log.
  deviceDays: Record<string, Record<string, DayLog>>;
  settingsChangedAt: number;
  resetAt: number;
  mistakesClearedAt: number;
  decks: Deck[];
  // When each deleted deck was deleted, so syncing doesn't bring it back from a device that still has it.
  deletedDecks: Record<string, number>;
}

export interface Drill {
  label: string;
  items: KanaItem[];
}

// A character practised in one direction.
export interface Entry {
  item: KanaItem;
  direction: Direction;
}

export interface Card {
  item: KanaItem;
  kind: CardKind;
  direction: Direction;
  // A character seen for the first time is introduced before it is tested.
  intro: boolean;
  choices: string[];
  answered: boolean;
  revealed: boolean;
  untimed: boolean;
  shownAt: number;
  outcome: Outcome | null;
  given: string | null;
}

export interface UndoPoint {
  state: State;
  session: Session;
  clock: number;
}

export interface Session {
  answered: number;
  correct: number;
  streak: number;
  extra: boolean;
  bonusNew: number;
  drill: Drill | null;
  card: Card | null;
  undo: UndoPoint | null;
  // Characters to bring back soon after a mix-up, the one picked by mistake first.
  followUps: Entry[];
}

export interface Pick {
  item: KanaItem;
  kind: CardKind;
}
