import { findKana, isWord, parseStatKey, statKey } from './kana.ts';
import type { Direction, KanaItem, Level, Mode, Outcome, Pick, Stat } from './types.ts';
import { randomFrom, type Random } from './util.ts';

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const INTERVALS = [0, MINUTE, 10 * MINUTE, HOUR, DAY, 3 * DAY, 7 * DAY, 21 * DAY, 60 * DAY];
export const MAX_BOX = INTERVALS.length - 1;
export const MASTERED_BOX = 5;
export const LEARNING_LIMIT = 5;
export const PEEK_PENALTY = 2;
export const MAX_TIMED_MS = 60 * 1000;

export type Stats = Record<string, Stat>;

export const isSeen = (stats: Stats, key: string): boolean => (stats[key]?.box ?? 0) > 0;
export function isDue(stats: Stats, key: string, now: number): boolean {
  const stat = stats[key];
  return stat !== undefined && stat.box > 0 && stat.due <= now;
}

export const intervalFor = (box: number): number => INTERVALS[box] ?? 0;

export function levelOf(stat: Stat | undefined): Level {
  if (!stat?.box) return 'new';
  if (stat.box >= MASTERED_BOX) return 'mastered';
  if (stat.box === 1) return 'weak';
  return 'learning';
}

export const PACE_SAMPLE_SIZE = 8;

export function baseThreshold(item: KanaItem, mode: Mode, direction: Direction = 'read'): number {
  const typed = direction === 'recall' || direction === 'listen' ? 8000 : 6000;
  const base = (mode === 'choose' ? 4000 : typed) + (direction === 'listen' ? 1000 : 0);
  return isWord(item) ? base * 1.5 : base;
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
  const personal = pace * 2 * (isWord(item) ? 1.5 : 1);
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
  } else {
    stat.wrong++;
    stat.box = 1;
  }
  stat.due = now + intervalFor(stat.box);
  return stat;
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

export function pickNext({
  pool,
  stats,
  direction = 'read',
  currentItem = null,
  now = Date.now(),
  allowNew = true,
  random = Math.random,
}: PickNextOptions): Pick | null {
  if (!pool.length) return null;
  const key = (item: KanaItem) => statKey(item, direction);
  const others = currentItem && pool.length > 1 ? pool.filter(item => item !== currentItem) : pool;
  const dueAt = (item: KanaItem) => stats[key(item)]?.due ?? 0;
  const byDue = (a: KanaItem, b: KanaItem) => dueAt(a) - dueAt(b);

  const review = randomFrom(
    others
      .filter(item => isDue(stats, key(item), now))
      .sort(byDue)
      .slice(0, 3),
    random,
  );
  if (review) return { item: review, kind: 'review' };

  const struggling = pool.filter(item => stats[key(item)]?.box === 1).length;
  const unseen = others.find(item => !isSeen(stats, key(item)));
  if (unseen && allowNew && struggling < LEARNING_LIMIT) return { item: unseen, kind: 'new' };

  const ahead = randomFrom(
    others
      .filter(item => isSeen(stats, key(item)))
      .sort(byDue)
      .slice(0, 4),
    random,
  );
  if (ahead) return { item: ahead, kind: 'ahead' };

  const fallback = unseen ?? others[0];
  return fallback ? { item: fallback, kind: 'new' } : null;
}
