export type Script = 'hiragana' | 'katakana';
export type ScriptSetting = Script | 'both';
export type Mode = 'type' | 'choose';
export type Direction = 'read' | 'recall' | 'match' | 'listen';
export type Theme = 'system' | 'light' | 'dark';
export type SpeedCheck = 'adaptive' | 'off';
export type GroupId = 'basic' | 'dakuten' | 'yoon' | 'sokuon' | 'extended' | 'words' | 'n5' | 'n4' | 'n3' | 'n2' | 'n1';
export type Outcome = 'correct' | 'slow' | 'wrong' | 'peeked';
export type CardKind = 'new' | 'review' | 'ahead' | 'drill';
export type Level = 'new' | 'weak' | 'learning' | 'mastered';

export interface Group {
  id: GroupId;
  label: string;
  hint: string;
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
}

export interface Mistake {
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
  direction: Direction;
  newPerDay: number;
  goal: number;
  speedCheck: SpeedCheck;
  theme: Theme;
  kanaPad: boolean;
}

export interface State {
  version: number;
  settings: Settings;
  stats: Record<string, Stat>;
  mistakes: Mistake[];
  days: Record<string, DayLog>;
  bestStreak: number;
}

export interface Drill {
  label: string;
  items: KanaItem[];
}

export interface Card {
  item: KanaItem;
  kind: CardKind;
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
}

export interface Pick {
  item: KanaItem;
  kind: CardKind;
}
