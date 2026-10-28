import { DAY_HISTORY, dayKey, type Days } from './days.ts';
import { deckItems, deckOfItem, MAX_DECKS } from './decks.ts';
import { parseStatKey } from './kana.ts';
import { MAX_DELETED_DECKS, MAX_DEVICES, MAX_MISTAKES } from './state.ts';
import type { DayLog, Deck, Mistake, State, Stat } from './types.ts';

// Each device only ever adds to its own day log, so of two copies of the same log the larger numbers are the newer.
function newestDays(a: Days = {}, b: Days = {}): Days {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().slice(-DAY_HISTORY);
  return Object.fromEntries(
    keys.map(key => {
      const x = a[key];
      const y = b[key];
      const day: DayLog =
        x && y
          ? {
              answers: Math.max(x.answers, y.answers),
              learned: Math.max(x.learned, y.learned),
              scored: Math.max(x.scored, y.scored),
              correct: Math.max(x.correct, y.correct),
            }
          : ((x ?? y) as DayLog);
      return [key, day];
    }),
  );
}

const lastActive = (days: Days): string => Object.keys(days).sort().at(-1) ?? '';

// Drops what a reset on the other device has since wiped, so syncing doesn't bring it back.
function sinceReset(state: State, resetAt: number): State {
  if (state.resetAt >= resetAt) return state;
  const resetDay = dayKey(resetAt);
  const afterReset = (days: Days) => Object.fromEntries(Object.entries(days).filter(([key]) => key > resetDay));
  return {
    ...state,
    stats: Object.fromEntries(Object.entries(state.stats).filter(([, stat]) => stat.last > resetAt)),
    mistakes: state.mistakes.filter(mistake => mistake.at > resetAt),
    days: afterReset(state.days),
    deviceDays: Object.fromEntries(Object.entries(state.deviceDays).map(([id, days]) => [id, afterReset(days)])),
    bestStreak: 0,
  };
}

function mergeStats(a: Record<string, Stat>, b: Record<string, Stat>): Record<string, Stat> {
  const stats = { ...a };
  for (const [key, stat] of Object.entries(b)) {
    const mine = stats[key];
    if (!mine || stat.last > mine.last) stats[key] = stat;
  }
  return stats;
}

function mergeMistakes(a: Mistake[], b: Mistake[], clearedAt: number): Mistake[] {
  const byId = new Map<string, Mistake>();
  for (const mistake of [...a, ...b]) {
    if (mistake.at > clearedAt) byId.set(`${mistake.at}|${mistake.kana}|${mistake.direction}`, mistake);
  }
  return [...byId.values()].sort((x, y) => y.at - x.at).slice(0, MAX_MISTAKES);
}

interface MergedDecks {
  decks: Deck[];
  deletedDecks: Record<string, number>;
}

// The two lists are joined, keeping the newer version of a deck both have and leaving out any deck either side has
// deleted.
function mergeDecks(a: State, b: State): MergedDecks {
  const deleted: Record<string, number> = { ...a.deletedDecks };
  for (const [id, at] of Object.entries(b.deletedDecks)) deleted[id] = Math.max(deleted[id] ?? 0, at);
  const newer = (deck: Deck) => {
    const theirs = b.decks.find(other => other.id === deck.id);
    return theirs && theirs.updatedAt > deck.updatedAt ? theirs : deck;
  };
  const decks = [...a.decks.map(newer), ...b.decks.filter(deck => !a.decks.some(mine => mine.id === deck.id))]
    .filter(deck => deleted[deck.id] === undefined)
    .slice(0, MAX_DECKS);
  const deletedDecks = Object.fromEntries(
    Object.entries(deleted)
      .sort(([, x], [, y]) => y - x)
      .slice(0, MAX_DELETED_DECKS),
  );
  return { decks, deletedDecks };
}

// Cards and mistakes of a deck that is gone, or of a word a newer version of its deck left out.
function orphaned(decks: Deck[]): (id: string) => boolean {
  const cards = new Set(decks.flatMap(deckItems).map(item => item.id));
  return id => deckOfItem(id) !== null && !cards.has(id);
}

// Combines this device's progress with a copy saved by `remoteDevice`. Each card keeps its most recent review, day
// logs are kept per device and added up for display, mistakes and decks are combined and the most recent settings win.
export function mergeStates(local: State, localDevice: string, remote: State, remoteDevice: string): State {
  const resetAt = Math.max(local.resetAt, remote.resetAt);
  const mine = sinceReset(local, resetAt);
  const theirs = sinceReset(remote, resetAt);
  const remoteLogs: Record<string, Days> = { ...theirs.deviceDays, [remoteDevice]: theirs.days };

  const devices = new Set([...Object.keys(mine.deviceDays), ...Object.keys(remoteLogs)]);
  devices.delete(localDevice);
  const deviceDays = Object.fromEntries(
    [...devices]
      .map(id => [id, newestDays(mine.deviceDays[id], remoteLogs[id])] as const)
      .sort(([, x], [, y]) => lastActive(y).localeCompare(lastActive(x)))
      .slice(0, MAX_DEVICES),
  );

  const mistakesClearedAt = Math.max(mine.mistakesClearedAt, theirs.mistakesClearedAt);
  const remoteSettings = theirs.settingsChangedAt > mine.settingsChangedAt;
  const { decks, deletedDecks } = mergeDecks(mine, theirs);
  const gone = orphaned(decks);
  return {
    ...mine,
    settings: remoteSettings ? theirs.settings : mine.settings,
    settingsChangedAt: Math.max(mine.settingsChangedAt, theirs.settingsChangedAt),
    stats: Object.fromEntries(
      Object.entries(mergeStats(mine.stats, theirs.stats)).filter(([key]) => !gone(parseStatKey(key).kana)),
    ),
    mistakes: mergeMistakes(mine.mistakes, theirs.mistakes, mistakesClearedAt).filter(mistake => !gone(mistake.kana)),
    mistakesClearedAt,
    days: newestDays(mine.days, remoteLogs[localDevice]),
    deviceDays,
    bestStreak: Math.max(mine.bestStreak, theirs.bestStreak),
    lastBackup: Math.max(mine.lastBackup, theirs.lastBackup),
    resetAt,
    decks,
    deletedDecks,
  };
}
