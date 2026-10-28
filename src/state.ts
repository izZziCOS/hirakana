import { GROUPS } from './data.ts';
import {
  deckItems,
  deckOfItem,
  deckRowId,
  isDeckId,
  isDeckItemId,
  isDeckRowId,
  MAX_DECKS,
  sanitizeDecks,
} from './decks.ts';
import { addDays, DAY_HISTORY, dateOf, dayKey, type Days, logDay } from './days.ts';
import {
  DIRECTIONS,
  findKana,
  hasReadingStage,
  KANA,
  parseStatKey,
  ROW_INFO,
  statKey,
  supportsDirection,
} from './kana.ts';
import { applyAnswer, applyKanjiStage, DAY, isDue, levelOf, MAX_BOX } from './schedule.ts';
import type {
  DayLog,
  Deck,
  DeckWord,
  Direction,
  GroupId,
  KanaItem,
  Mistake,
  Mode,
  Outcome,
  ScriptSetting,
  Settings,
  SpeedCheck,
  Stat,
  State,
  Theme,
} from './types.ts';
import { isObject, nonNegative, unique } from './util.ts';

export const STATE_VERSION = 7;
export const EXPORT_APP = 'kana-dojo';
export const MAX_MISTAKES = 2000;
export const DEFAULT_NEW_PER_DAY = 15;
export const NEW_PER_DAY_OPTIONS = [5, 10, 15, 25, 50];
export const GOAL_OPTIONS = [0, 10, 25, 50, 100];
const SCRIPT_SETTINGS: ScriptSetting[] = ['hiragana', 'katakana', 'both'];
const MODES: Mode[] = ['type', 'choose'];
const THEMES: Theme[] = ['system', 'light', 'dark'];
const SPEED_CHECKS: SpeedCheck[] = ['adaptive', 'off'];

type RawData = Record<string, unknown>;

const includes = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value);

const defaultRows = (): string[] => ROW_INFO.filter(row => row.group === 'basic').map(row => row.id);

export const defaultState = (): State => ({
  version: STATE_VERSION,
  settings: {
    script: 'hiragana',
    rows: defaultRows(),
    mode: 'type',
    direction: 'read',
    newPerDay: DEFAULT_NEW_PER_DAY,
    goal: 0,
    speedCheck: 'adaptive',
    theme: 'system',
    kanaPad: false,
    introduce: true,
  },
  stats: {},
  mistakes: [],
  days: {},
  bestStreak: 0,
  lastBackup: 0,
  deviceDays: {},
  settingsChangedAt: 0,
  resetAt: 0,
  mistakesClearedAt: 0,
  decks: [],
  deletedDecks: {},
});

const entriesOf = (value: unknown): [string, unknown][] => (isObject(value) ? Object.entries(value) : []);

const MIGRATIONS: Record<number, (data: RawData, now: number) => RawData> = {
  1: (data, now) => {
    const settings: RawData = isObject(data.settings) ? { ...data.settings } : {};
    if (Array.isArray(settings.groups) && !settings.rows) {
      const groups = settings.groups;
      settings.rows = ROW_INFO.filter(row => groups.includes(row.group)).map(row => row.id);
    }
    delete settings.groups;
    const stats = Object.fromEntries(
      entriesOf(data.stats).map(([kana, stat]) => {
        const streak = nonNegative(isObject(stat) ? stat.streak : 0);
        return [kana, { ...(isObject(stat) ? stat : {}), box: streak >= 3 ? 3 : streak > 0 ? 2 : 1, due: now }];
      }),
    );
    return { ...data, version: 2, settings, stats };
  },
  2: data => {
    const days: Record<string, { answers: number; learned: number }> = {};
    entriesOf(data.stats).forEach(([, stat]) => {
      const last = nonNegative(isObject(stat) ? stat.last : 0);
      if (!last) return;
      const key = dayKey(last);
      days[key] = { answers: (days[key]?.answers ?? 0) + 1, learned: 0 };
    });
    return { ...data, version: 3, days };
  },
  3: data => ({ ...data, version: 4 }),
  4: data => ({ ...data, version: 5 }),
  5: data => ({ ...data, version: 6 }),
  // Imported decks; the sanitising below fills them in.
  6: data => ({ ...data, version: 7 }),
};

function sanitizeStat(stat: RawData): Stat {
  const clean: Stat = {
    correct: nonNegative(stat.correct),
    wrong: nonNegative(stat.wrong),
    streak: nonNegative(stat.streak),
    box: Math.min(Math.floor(nonNegative(stat.box)), MAX_BOX),
    due: nonNegative(stat.due),
    last: nonNegative(stat.last),
  };
  const avgMs = nonNegative(stat.avgMs);
  if (avgMs) clean.avgMs = Math.round(avgMs);
  if (stat.kanjiOnly === true) clean.kanjiOnly = true;
  return clean;
}

type FindItem = (id: string) => KanaItem | undefined;

const validStatEntry =
  (find: FindItem) =>
  ([key, stat]: [string, unknown]): boolean => {
    const { direction, kana } = parseStatKey(key);
    const item = find(kana);
    return (
      item !== undefined && includes(DIRECTIONS, direction) && supportsDirection(item, direction) && isObject(stat)
    );
  };

// Kanji and word rows are named by position ("k5:N5 · 61–79"), so a longer list renames the last rows of a level. A
// saved row that no longer exists becomes the row of the same set that now holds its first card.
const NUMBERED_ROW = /^(.+ · )(\d+)(?:–(\d+))?$/;

function currentRow(id: string): string | undefined {
  const [, name, first] = NUMBERED_ROW.exec(id) ?? [];
  if (!name || !first) return undefined;
  const start = Number(first);
  return ROW_INFO.find(row => {
    const [, rowName, rowFirst, rowLast = rowFirst] = NUMBERED_ROW.exec(row.id) ?? [];
    return rowName === name && Number(rowFirst) <= start && start <= Number(rowLast);
  })?.id;
}

function sanitizeSettings(raw: unknown, decks: Deck[]): Settings {
  const fresh = defaultState().settings;
  const settings = isObject(raw) ? raw : {};
  const knownRows = new Set([
    ...ROW_INFO.filter(row => !isDeckRowId(row.id)).map(row => row.id),
    ...decks.map(deckRowId),
  ]);
  const rows = unique(
    (Array.isArray(settings.rows) ? settings.rows : []).flatMap(id => {
      if (typeof id !== 'string') return [];
      const row = knownRows.has(id) ? id : currentRow(id);
      return row ? [row] : [];
    }),
  );
  return {
    script: includes(SCRIPT_SETTINGS, settings.script) ? settings.script : fresh.script,
    rows: rows.length ? rows : fresh.rows,
    mode: includes(MODES, settings.mode) ? settings.mode : fresh.mode,
    direction: includes([...DIRECTIONS, 'mixed'], settings.direction) ? settings.direction : fresh.direction,
    newPerDay:
      typeof settings.newPerDay === 'number' && NEW_PER_DAY_OPTIONS.includes(settings.newPerDay)
        ? settings.newPerDay
        : fresh.newPerDay,
    goal: typeof settings.goal === 'number' && GOAL_OPTIONS.includes(settings.goal) ? settings.goal : fresh.goal,
    speedCheck: includes(SPEED_CHECKS, settings.speedCheck) ? settings.speedCheck : fresh.speedCheck,
    theme: includes(THEMES, settings.theme) ? settings.theme : fresh.theme,
    kanaPad: typeof settings.kanaPad === 'boolean' ? settings.kanaPad : fresh.kanaPad,
    introduce: typeof settings.introduce === 'boolean' ? settings.introduce : fresh.introduce,
  };
}

function sanitizeMistakes(raw: unknown, find: FindItem): Mistake[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((m): m is RawData => isObject(m) && typeof m.kana === 'string' && Boolean(find(m.kana)))
    .filter(m => typeof m.at === 'number' && Number.isFinite(m.at))
    .map(m => ({
      kana: m.kana as string,
      given: typeof m.given === 'string' ? m.given : '',
      at: m.at as number,
      direction: includes(DIRECTIONS, m.direction) ? m.direction : 'read',
    }))
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_MISTAKES);
}

export const MAX_DEVICES = 20;

function sanitizeDays(raw: unknown): Record<string, DayLog> {
  return Object.fromEntries(
    entriesOf(raw)
      .filter((entry): entry is [string, RawData] => /^\d{4}-\d{2}-\d{2}$/.test(entry[0]) && isObject(entry[1]))
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-DAY_HISTORY)
      .map(([key, day]) => [
        key,
        {
          answers: nonNegative(day.answers),
          learned: nonNegative(day.learned),
          scored: nonNegative(day.scored),
          correct: nonNegative(day.correct),
        },
      ]),
  );
}

export const MAX_DELETED_DECKS = 200;

function sanitizeState(data: RawData): State {
  const decks = sanitizeDecks(data.decks);
  // Cards of imported decks are checked against the decks saved with them, not the ones this tab has open.
  const deckCards = new Map(decks.flatMap(deckItems).map(item => [item.id, item]));
  const find: FindItem = id => (isDeckItemId(id) ? deckCards.get(id) : findKana(id));
  return {
    version: STATE_VERSION,
    settings: sanitizeSettings(data.settings, decks),
    stats: Object.fromEntries(
      entriesOf(data.stats)
        .filter(validStatEntry(find))
        .map(([key, stat]) => [key, sanitizeStat(stat as RawData)]),
    ),
    mistakes: sanitizeMistakes(data.mistakes, find),
    days: sanitizeDays(data.days),
    bestStreak: nonNegative(data.bestStreak),
    lastBackup: nonNegative(data.lastBackup),
    deviceDays: Object.fromEntries(
      entriesOf(data.deviceDays)
        .slice(0, MAX_DEVICES)
        .map(([device, days]) => [device, sanitizeDays(days)]),
    ),
    settingsChangedAt: nonNegative(data.settingsChangedAt),
    resetAt: nonNegative(data.resetAt),
    mistakesClearedAt: nonNegative(data.mistakesClearedAt),
    decks,
    deletedDecks: Object.fromEntries(
      entriesOf(data.deletedDecks)
        .filter((entry): entry is [string, number] => isDeckId(entry[0]) && typeof entry[1] === 'number')
        .filter(([id]) => !decks.some(deck => deck.id === id))
        .sort(([, a], [, b]) => b - a)
        .slice(0, MAX_DELETED_DECKS)
        .map(([id, at]) => [id, nonNegative(at)]),
    ),
  };
}

export function migrateState(raw: unknown, now = Date.now()): State {
  if (!isObject(raw)) return defaultState();
  let data: RawData = structuredClone(raw);
  let version =
    typeof data.version === 'number' && Number.isInteger(data.version) && data.version > 0 ? data.version : 1;
  while (version < STATE_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) throw new Error(`No migration from version ${version}`);
    data = migrate(data, now);
    version++;
  }
  return sanitizeState(data);
}

// `device` lets an import on another device merge this device's day log without counting it twice.
export const exportPayload = (state: State, now = Date.now(), device?: string) => ({
  app: EXPORT_APP,
  exportedAt: new Date(now).toISOString(),
  ...(device ? { device } : {}),
  data: state,
});

export interface ImportedProgress {
  state: State;
  device: string | null;
}

export function parseImport(text: string, now = Date.now()): ImportedProgress {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t valid JSON.');
  }
  if (!isObject(payload) || payload.app !== EXPORT_APP || !isObject(payload.data)) {
    throw new Error('That file isn’t a Kana Dojo progress export.');
  }
  if (typeof payload.data.version === 'number' && payload.data.version > STATE_VERSION) {
    throw new Error('That file comes from a newer version of Kana Dojo.');
  }
  return {
    state: migrateState(payload.data, now),
    device: typeof payload.device === 'string' && payload.device ? payload.device : null,
  };
}

export interface AnswerEvent {
  item: KanaItem;
  direction: Direction;
  outcome: Outcome;
  given: string | null;
  ms: number | null;
  now: number;
  run: number;
}

export function recordAnswer(state: State, { item, direction, outcome, given, ms, now, run }: AnswerEvent): State {
  const key = statKey(item, direction);
  const previous = state.stats[key];
  const right = outcome === 'correct' || outcome === 'slow';
  const stat = applyAnswer(previous, outcome, now, ms);
  return {
    ...state,
    stats: {
      ...state.stats,
      // Writing and recalling a word start from its reading or meaning, so the kanji stage doesn't apply.
      [key]:
        hasReadingStage(item) && direction !== 'write' && direction !== 'recall'
          ? applyKanjiStage(stat, outcome)
          : stat,
    },
    days: logDay(state.days, now, {
      answers: 1,
      learned: previous?.box ? 0 : 1,
      scored: outcome === 'peeked' ? 0 : 1,
      correct: right ? 1 : 0,
    }),
    mistakes:
      outcome === 'wrong'
        ? [{ kana: item.id, given: given ?? '', at: now, direction }, ...state.mistakes].slice(0, MAX_MISTAKES)
        : state.mistakes,
    bestStreak: Math.max(state.bestStreak, run),
  };
}

export const updateSettings = (state: State, changes: Partial<Settings>, now = Date.now()): State => ({
  ...state,
  settings: { ...state.settings, ...changes },
  settingsChangedAt: now,
});

function withRows(state: State, selected: Set<string>): State {
  if (!selected.size) return state;
  return updateSettings(state, { rows: ROW_INFO.map(row => row.id).filter(id => selected.has(id)) });
}

export function toggleRow(state: State, rowId: string): State {
  const selected = new Set(state.settings.rows);
  if (selected.has(rowId)) selected.delete(rowId);
  else selected.add(rowId);
  return withRows(state, selected);
}

export function toggleGroup(state: State, groupId: GroupId): State {
  const ids = ROW_INFO.filter(row => row.group === groupId).map(row => row.id);
  const selected = new Set(state.settings.rows);
  const allSelected = ids.every(id => selected.has(id));
  ids.forEach(id => (allSelected ? selected.delete(id) : selected.add(id)));
  return withRows(state, selected);
}

// Mastered and total cards of a set in the current direction, for the track cards.
export function groupProgress(state: State, groupId: GroupId): { mastered: number; total: number } {
  const direction = state.settings.direction === 'mixed' ? 'read' : state.settings.direction;
  const items = KANA.filter(item => item.group === groupId && supportsDirection(item, direction));
  const mastered = items.filter(item => levelOf(state.stats[statKey(item, direction)]) === 'mastered').length;
  return { mastered, total: items.length };
}

export interface DeckProgress {
  // Write and Match don't take words, so a deck shows its Read progress then.
  direction: Direction;
  total: number;
  mastered: number;
  // Seen but not mastered yet, the ones that need work included.
  learning: number;
  due: number;
}

// Where the learner is with an imported deck, in the direction being practised.
export function deckProgress(state: State, deck: Deck, now = Date.now()): DeckProgress {
  const practised = state.settings.direction === 'mixed' ? 'read' : state.settings.direction;
  const items = deckItems(deck);
  const direction = items.every(item => supportsDirection(item, practised)) ? practised : 'read';
  const progress = { direction, total: items.length, mastered: 0, learning: 0, due: 0 };
  for (const item of items) {
    const key = statKey(item, direction);
    const level = levelOf(state.stats[key]);
    if (level === 'mastered') progress.mastered++;
    else if (level !== 'new') progress.learning++;
    if (isDue(state.stats, key, now)) progress.due++;
  }
  return progress;
}

export const groupSelection = (state: State, groupId: GroupId): 'all' | 'some' | 'none' => {
  const ids = ROW_INFO.filter(row => row.group === groupId).map(row => row.id);
  const count = ids.filter(id => state.settings.rows.includes(id)).length;
  return count === ids.length ? 'all' : count ? 'some' : 'none';
};

export const rowsSummary = (state: State): string =>
  GROUPS.map(group => {
    const ids = ROW_INFO.filter(row => row.group === group.id).map(row => row.id);
    const count = ids.filter(id => state.settings.rows.includes(id)).length;
    if (!count) return null;
    return count === ids.length ? group.label : `${group.label} ${count}/${ids.length}`;
  })
    .filter(Boolean)
    .join(', ');

export const BACKUP_EVERY = 30 * DAY;
export const FIRST_BACKUP_AFTER = 7 * DAY;

export const markBackedUp = (state: State, now: number): State => ({ ...state, lastBackup: now });

// Browsers may clear site storage, so after a week of practice, and then every month, the home screen asks for an export.
export function backupDue(state: State, now: number): boolean {
  if (state.lastBackup) return now - state.lastBackup >= BACKUP_EVERY;
  const firstDay = Object.keys(state.days).sort()[0];
  return firstDay !== undefined && now - dateOf(firstDay).getTime() >= FIRST_BACKUP_AFTER;
}

export function backupStatus(state: State, now: number): string {
  if (!state.lastBackup) return 'Not backed up yet.';
  const days = Math.floor((now - state.lastBackup) / DAY);
  if (days < 1) return 'Last backed up today.';
  return `Last backed up ${days} day${days === 1 ? '' : 's'} ago.`;
}

// Days from this device and every device it syncs with, added up.
const combined = new WeakMap<State, Days>();
export function combinedDays(state: State): Days {
  const logs = Object.values(state.deviceDays);
  if (!logs.length) return state.days;
  let days = combined.get(state);
  if (!days) {
    days = addDays([state.days, ...logs]);
    combined.set(state, days);
  }
  return days;
}

export const clearMistakes = (state: State, now = Date.now()): State => ({
  ...state,
  mistakes: [],
  mistakesClearedAt: now,
});

// Imported decks are kept: they are the material, not the progress.
export const resetProgress = (state: State, now = Date.now()): State => ({
  ...defaultState(),
  settings: state.settings,
  settingsChangedAt: state.settingsChangedAt,
  resetAt: now,
  decks: state.decks,
  deletedDecks: state.deletedDecks,
});

// Adds an imported deck and picks its row, so Continue practises it.
export function addDeck(state: State, deck: Deck, now = Date.now()): State {
  if (state.decks.length >= MAX_DECKS) throw new Error(`You can keep up to ${MAX_DECKS} decks. Delete one first.`);
  return {
    ...updateSettings(state, { rows: [...state.settings.rows, deckRowId(deck)] }, now),
    decks: [...state.decks, deck],
  };
}

// Replaces a deck's words with those of a new version of it. Words whose kana and kanji are unchanged keep their cards
// and progress; the cards and mistakes of words that are gone go too.
export function updateDeck(state: State, deckId: string, words: DeckWord[], now = Date.now()): State {
  const decks = state.decks.map(deck => (deck.id === deckId ? { ...deck, words, updatedAt: now } : deck));
  const updated = decks.find(deck => deck.id === deckId);
  if (!updated) return state;
  const cards = new Set(deckItems(updated).map(item => item.id));
  const gone = (id: string) => deckOfItem(id) === deckId && !cards.has(id);
  return {
    ...state,
    decks,
    stats: Object.fromEntries(Object.entries(state.stats).filter(([key]) => !gone(parseStatKey(key).kana))),
    mistakes: state.mistakes.filter(mistake => !gone(mistake.kana)),
  };
}

// Deletes a deck with its cards and mistakes. Without it no rows may be left, so the basic kana come back.
export function deleteDeck(state: State, deckId: string, now = Date.now()): State {
  const inDeck = (id: string) => deckOfItem(id) === deckId;
  const rows = state.settings.rows.filter(row => row !== deckRowId({ id: deckId }));
  const withoutRow =
    rows.length === state.settings.rows.length
      ? state
      : updateSettings(state, { rows: rows.length ? rows : defaultRows() }, now);
  return {
    ...withoutRow,
    decks: state.decks.filter(deck => deck.id !== deckId),
    deletedDecks: { ...state.deletedDecks, [deckId]: now },
    stats: Object.fromEntries(Object.entries(state.stats).filter(([key]) => !inDeck(parseStatKey(key).kana))),
    mistakes: state.mistakes.filter(mistake => !inDeck(mistake.kana)),
  };
}
