import { DECK_GROUP } from './decks.ts';
import { findKana, isWord, kanjiOfWord, parseStatKey, statKey } from './kana.ts';
import type { Direction, Entry, KanaItem, Level, Mode, Outcome, Pick, Stat } from './types.ts';
import { randomFrom, type Random } from './util.ts';

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const INTERVALS = [
  0,
  MINUTE,
  10 * MINUTE,
  HOUR,
  DAY,
  3 * DAY,
  7 * DAY,
  21 * DAY,
  60 * DAY,
  120 * DAY,
  240 * DAY,
];
export const MAX_BOX = INTERVALS.length - 1;
export const MASTERED_BOX = 5;
export const LEARNING_LIMIT = 5;
export const PEEK_PENALTY = 2;
export const MISS_PENALTY = 3;
export const MAX_TIMED_MS = 60 * 1000;

export type Stats = Record<string, Stat>;

export const isSeen = (stats: Stats, key: string): boolean => (stats[key]?.box ?? 0) > 0;
export function isDue(stats: Stats, key: string, now: number): boolean {
  const stat = stats[key];
  return stat !== undefined && stat.box > 0 && stat.due <= now;
}

export const intervalFor = (box: number): number => INTERVALS[box] ?? 0;

// A card whose last gap was a day or more is a review. The shorter steps before it, and a card just missed, are still
// being learned: the daily review limit and catch-up leave them alone, or the day's learning would be lost.
export const REVIEW_BOX = 4;
export const isReview = (stat: Stat | undefined): boolean => (stat?.box ?? 0) >= REVIEW_BOX;
export const isDueReview = (stats: Stats, key: string, now: number): boolean =>
  isReview(stats[key]) && isDue(stats, key, now);

export function levelOf(stat: Stat | undefined): Level {
  if (!stat?.box) return 'new';
  if (stat.box >= MASTERED_BOX) return 'mastered';
  if (stat.box === 1) return 'weak';
  return 'learning';
}

export const PACE_SAMPLE_SIZE = 8;

export function baseThreshold(item: KanaItem, mode: Mode, direction: Direction = 'read'): number {
  if (direction === 'write') return Infinity;
  const typed = direction === 'recall' || direction === 'listen' || direction === 'cloze' ? 8000 : 6000;
  const base = (mode === 'choose' ? 4000 : typed) + (direction === 'listen' ? 1000 : 0);
  // A gap in a sentence takes the whole sentence to read.
  if (direction === 'cloze') return base * 2;
  return isWord(item) || direction === 'meaning' ? base * 1.5 : base;
}

export function personalPace(stats: Stats, direction: Direction): number | null {
  const times = Object.entries(stats)
    .filter(([key]) => {
      const { direction: statDirection, kana } = parseStatKey(key);
      const item = findKana(kana);
      return statDirection === direction && item !== undefined && !isWord(item);
    })
    .flatMap(([, stat]) => (stat.avgMs ? [stat.avgMs] : []))
    .sort((a, b) => a - b);
  if (times.length < PACE_SAMPLE_SIZE) return null;
  return times[Math.floor(times.length / 2)] ?? null;
}

export function slowThreshold(
  item: KanaItem,
  mode: Mode,
  direction: Direction = 'read',
  pace: number | null = null,
): number {
  const base = baseThreshold(item, mode, direction);
  if (pace === null) return base;
  const personal = pace * 2 * (isWord(item) || direction === 'meaning' ? 1.5 : 1);
  return Math.min(base * 2, Math.max(base * 0.6, personal));
}

interface OutcomeInput {
  isCorrect: boolean;
  revealed: boolean;
  ms: number | null;
  threshold: number;
}

export function outcomeFor({ isCorrect, revealed, ms, threshold }: OutcomeInput): Outcome {
  if (revealed) return 'peeked';
  if (!isCorrect) return 'wrong';
  return ms !== null && ms > threshold ? 'slow' : 'correct';
}

export function applyAnswer(previous: Stat | undefined, outcome: Outcome, now: number, ms: number | null = null): Stat {
  const stat: Stat = { correct: 0, wrong: 0, streak: 0, box: 0, due: now, ...previous, last: now };
  delete stat.moved;
  const scheduled = stat.box <= 1 || stat.due <= now;

  if (outcome === 'correct' || outcome === 'slow') {
    stat.correct++;
    stat.streak++;
    if (ms !== null) stat.avgMs = Math.round(stat.avgMs ? stat.avgMs * 0.7 + ms * 0.3 : ms);
    if (scheduled) {
      stat.box = outcome === 'correct' ? (stat.box ? Math.min(stat.box + 1, MAX_BOX) : 2) : Math.max(stat.box, 1);
      stat.due = now + intervalFor(stat.box);
    }
    return stat;
  }

  stat.streak = 0;
  if (outcome === 'peeked') {
    stat.box = Math.max(1, stat.box - PEEK_PENALTY);
    stat.due = now + intervalFor(stat.box);
    return stat;
  }
  // A miss moves the card back a few steps rather than to the start, so a long-known card isn't relearned from
  // scratch, and brings it back a minute later to be answered right before the longer gaps resume.
  stat.wrong++;
  stat.box = Math.max(1, stat.box - MISS_PENALTY);
  stat.due = now + intervalFor(1);
  return stat;
}

export const KANJI_ONLY_BOX = 2;

// Kanji and words with a kanji spelling are learned in two stages: first with the reading under the kanji, then, once
// mastered, from the kanji alone, starting back in learning. A miss or a peek brings the reading back.
export function applyKanjiStage(stat: Stat, outcome: Outcome): Stat {
  if (stat.kanjiOnly) {
    if (outcome === 'correct' || outcome === 'slow') return stat;
    const shown = { ...stat };
    delete shown.kanjiOnly;
    return shown;
  }
  if (outcome !== 'correct' || stat.box < MASTERED_BOX) return stat;
  return { ...stat, kanjiOnly: true, box: KANJI_ONLY_BOX, due: stat.last + intervalFor(KANJI_ONLY_BOX) };
}

function weightOf(stats: Stats, key: string): number {
  const stat = stats[key];
  if (!stat) return 3;
  const total = stat.correct + stat.wrong;
  const missRate = total ? stat.wrong / total : 1;
  return 0.4 + missRate * 4 + Math.max(0, 3 - stat.streak) * 0.6;
}

interface WeightedPickOptions {
  direction?: Direction;
  random?: Random;
}

export function weightedPick(
  items: KanaItem[],
  stats: Stats,
  currentItem: KanaItem | null,
  { direction = 'read', random = Math.random }: WeightedPickOptions = {},
): KanaItem | undefined {
  const candidates = currentItem && items.length >= 4 ? items.filter(item => item !== currentItem) : items;
  const weighted = candidates.map(item => ({ item, weight: weightOf(stats, statKey(item, direction)) }));
  let roll = random() * weighted.reduce((sum, entry) => sum + entry.weight, 0);
  for (const { item, weight } of weighted) {
    roll -= weight;
    if (roll <= 0) return item;
  }
  return candidates.at(-1);
}

interface PickNextOptions {
  pool: KanaItem[];
  stats: Stats;
  direction?: Direction;
  currentItem?: KanaItem | null;
  now?: number;
  allowNew?: boolean;
  random?: Random;
}

// New words come first once every kanji they are written with is past its first step in Read.
export function knowsKanjiOf(word: KanaItem, stats: Stats): boolean {
  const kanji = kanjiOfWord(word);
  return kanji.length > 0 && kanji.every(item => (stats[statKey(item, 'read')]?.box ?? 0) >= 2);
}

export function pickNext({ pool, direction = 'read', ...options }: PickNextOptions): Pick | null {
  const pick = pickEntry({ ...options, entries: pool.map(item => ({ item, direction })) });
  return pick && { item: pick.item, kind: pick.kind };
}

interface PickEntryOptions extends Omit<PickNextOptions, 'pool' | 'direction'> {
  entries: Entry[];
  // Which unseen entries may be introduced now; mixed practice holds other directions back until a card can be read.
  canIntroduce?: (entry: Entry) => boolean;
  // Whether reviews may still be shown today; once the daily limit is reached, due reviews wait for tomorrow.
  reviewsLeft?: boolean;
}

// Reviews that are due come first, then new cards (up to the daily limit, and not while too many are struggling),
// then the reviews due soonest.
export function pickEntry({
  entries,
  stats,
  currentItem = null,
  now = Date.now(),
  allowNew = true,
  canIntroduce = () => true,
  reviewsLeft = true,
  random = Math.random,
}: PickEntryOptions): (Pick & Entry) | null {
  const key = (entry: Entry) => statKey(entry.item, entry.direction);
  // Reviews held back by the daily limit aren't shown at all today, not even as extra practice.
  const shown = reviewsLeft ? entries : entries.filter(entry => !isDueReview(stats, key(entry), now));
  if (!shown.length) return null;
  const others =
    currentItem && shown.some(entry => entry.item !== currentItem)
      ? shown.filter(entry => entry.item !== currentItem)
      : shown;
  const dueAt = (entry: Entry) => stats[key(entry)]?.due ?? 0;
  const byDue = (a: Entry, b: Entry) => dueAt(a) - dueAt(b);

  const review = randomFrom(
    others
      .filter(entry => isDue(stats, key(entry), now))
      .sort(byDue)
      .slice(0, 3),
    random,
  );
  if (review) return { ...review, kind: 'review' };

  const struggling = entries.filter(entry => stats[key(entry)]?.box === 1).length;
  const unseenEntries = others.filter(entry => !isSeen(stats, key(entry)) && canIntroduce(entry));
  // Words whose kanji are known go first, but never ahead of an imported deck's words, which come first anyway.
  const first = unseenEntries[0];
  const inDeck = (entry: Entry) => entry.item.group === DECK_GROUP;
  const unseen =
    unseenEntries.find(entry => inDeck(entry) === (first && inDeck(first)) && knowsKanjiOf(entry.item, stats)) ?? first;
  if (unseen && allowNew && struggling < LEARNING_LIMIT) return { ...unseen, kind: 'new' };

  const ahead = randomFrom(
    others
      .filter(entry => isSeen(stats, key(entry)))
      .sort(byDue)
      .slice(0, 4),
    random,
  );
  if (ahead) return { ...ahead, kind: 'ahead' };

  // With reviews held back for today there is nothing else to show; new cards keep to their own limit.
  if (shown.length < entries.length) return null;
  const fallback = unseen ?? others[0];
  return fallback ? { ...fallback, kind: 'new' } : null;
}

export const CATCH_UP_DAYS = 5;

// How many of `count` reviews catch-up leaves for each day, and over how many days that spreads them.
export function catchUpPlan(count: number, perDay = 0, days = CATCH_UP_DAYS): { daily: number; days: number } {
  const share = Math.ceil(count / days);
  const daily = perDay > 0 ? Math.min(perDay, share) : share;
  return { daily, days: daily ? Math.ceil(count / daily) : 0 };
}

// Catch-up after a break: the reviews due now are shared out over the next few days instead of all at once. The
// weakest cards, and of those the longest overdue, stay due today; the rest move to the start of a later day. With
// `perDay` (the daily review limit) no day gets more than that, which can take more days.
export function spreadReviews(
  stats: Stats,
  keys: string[],
  now: number,
  { days = CATCH_UP_DAYS, perDay = 0 }: { days?: number; perDay?: number } = {},
): Stats {
  const due = keys
    .filter(key => isDueReview(stats, key, now))
    .sort((a, b) => {
      const x = stats[a];
      const y = stats[b];
      return x && y ? x.box - y.box || x.due - y.due : 0;
    });
  const { daily } = catchUpPlan(due.length, perDay, days);
  if (!daily || due.length <= daily) return stats;
  const startOfDayAfter = (offset: number): number => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return date.setDate(date.getDate() + offset);
  };
  const moved = { ...stats };
  due.forEach((key, i) => {
    const day = Math.floor(i / daily);
    const stat = stats[key];
    if (day && stat) moved[key] = { ...stat, due: startOfDayAfter(day), moved: now };
  });
  return moved;
}
