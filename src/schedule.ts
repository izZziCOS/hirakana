import { DECK_GROUP } from './decks.ts';
import { afterLapse, afterRecall, firstMemory, GOOD, HARD, type Memory } from './fsrs.ts';
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
// The furthest a card is left after a miss or a peek: the 1-hour step, one below a review.
export const LAPSE_BOX = 3;
export const MAX_TIMED_MS = 60 * 1000;
// The longest a review waits, however well a card is known.
export const MAX_INTERVAL = 365 * DAY;

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

// The step a gap has reached, which is what mastery, readiness and the kanji stages go by.
export function boxForInterval(interval: number): number {
  const box = INTERVALS.findLastIndex(step => step <= interval);
  return Math.max(box, REVIEW_BOX);
}

const inHundredths = (value: number): number => Math.round(value * 100) / 100;
const DIFFICULTY_PER_MISS = 14;

// A card's memory. A card past the learning steps with none saved has progress from before the app kept it: its gap so
// far is the best guess at its stability, and its share of misses at its difficulty.
export function memoryOf(stat: Omit<Stat, 'streak' | 'due' | 'last'>): Memory {
  if (stat.s && stat.d) return { stability: stat.s, difficulty: stat.d };
  const total = stat.correct + stat.wrong;
  const easiest = firstMemory(GOOD).difficulty;
  return {
    stability: Math.max(intervalFor(stat.box), DAY) / DAY,
    difficulty: inHundredths(Math.min(10, easiest + (total ? stat.wrong / total : 0) * DIFFICULTY_PER_MISS)),
  };
}

const withMemory = (stat: Stat, { stability, difficulty }: Memory): Stat => ({
  ...stat,
  s: inHundredths(stability),
  d: inHundredths(difficulty),
});

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

// Gaps of a day or more vary by up to this much, so cards learned together don't keep coming due together.
export const INTERVAL_FUZZ = 0.1;

const fuzzed = (interval: number, random: Random): number =>
  interval < DAY ? interval : Math.round(interval * (1 + INTERVAL_FUZZ * (2 * random() - 1)));

export const fuzzedInterval = (box: number, random: Random = Math.random): number => fuzzed(intervalFor(box), random);

// Schedules a card from its memory. Stability is the time until the chance of remembering falls to 90%, the retention
// aimed for, so it is also the gap.
function scheduleByMemory(stat: Stat, now: number, random: Random): Stat {
  const interval = Math.min(Math.max((stat.s ?? 0) * DAY, DAY), MAX_INTERVAL);
  return { ...stat, box: boxForInterval(interval), due: now + fuzzed(interval, random) };
}

export function applyAnswer(
  previous: Stat | undefined,
  outcome: Outcome,
  now: number,
  ms: number | null = null,
  random: Random = Math.random,
): Stat {
  const stat: Stat = { correct: 0, wrong: 0, streak: 0, box: 0, due: now, ...previous, last: now };
  delete stat.moved;
  const scheduled = stat.box <= 1 || stat.due <= now;
  const elapsedDays = previous ? (now - previous.last) / DAY : 0;
  const reviewed = stat.box >= REVIEW_BOX;

  if (outcome === 'correct' || outcome === 'slow') {
    stat.correct++;
    stat.streak++;
    if (ms !== null) stat.avgMs = Math.round(stat.avgMs ? stat.avgMs * 0.7 + ms * 0.3 : ms);
    if (!scheduled) return stat;
    if (reviewed) {
      const grade = outcome === 'correct' ? GOOD : HARD;
      return scheduleByMemory(withMemory(stat, afterRecall(memoryOf(stat), elapsedDays, grade)), now, random);
    }
    if (outcome === 'slow' || stat.box < REVIEW_BOX - 1) {
      stat.box = outcome === 'correct' ? (stat.box ? stat.box + 1 : 2) : Math.max(stat.box, 1);
      stat.due = now + intervalFor(stat.box);
      return stat;
    }
    // Past the learning steps. A card that has lapsed goes back to the gap its memory still supports; one meeting its
    // first review gets a day, and its memory starts from how the learning steps went.
    if (stat.s) return scheduleByMemory(stat, now, random);
    return {
      ...withMemory(stat, firstMemory(stat.wrong ? HARD : GOOD)),
      box: REVIEW_BOX,
      due: now + fuzzedInterval(REVIEW_BOX, random),
    };
  }

  // A miss or a peek moves the card back a few steps rather than to the start, so a long-known card isn't relearned from
  // scratch, but never leaves it past the 1-hour step: one right answer a minute later doesn't show it has been
  // remembered. Its memory drops only for a review, as the steps after a lapse are still part of the same lapse. Either
  // way it comes back a minute later to be answered.
  const lapsed = reviewed ? withMemory(stat, afterLapse(memoryOf(stat), elapsedDays)) : stat;
  lapsed.streak = 0;
  if (outcome === 'wrong') lapsed.wrong++;
  const penalty = outcome === 'wrong' ? MISS_PENALTY : PEEK_PENALTY;
  lapsed.box = Math.max(1, Math.min(lapsed.box - penalty, LAPSE_BOX));
  lapsed.due = now + intervalFor(1);
  return lapsed;
}

// A card that keeps being missed isn't helped by more of the same reviews: it needs a closer look, or a rest.
export const LEECH_MISSES = 8;
export const isLeech = (stat: Stat | undefined): boolean =>
  stat !== undefined &&
  stat.wrong >= LEECH_MISSES &&
  stat.box < MASTERED_BOX &&
  stat.wrong * 3 >= stat.correct + stat.wrong;

export const KANJI_ONLY_BOX = 2;

// Kanji and words with a kanji spelling are learned in two stages: first with the reading under the kanji, then, once
// mastered, from the kanji alone, starting back in learning. With the reading in view a right answer says little about
// remembering it, so the kanji alone starts with a new memory. A miss or a peek brings the reading back.
export function applyKanjiStage(stat: Stat, outcome: Outcome): Stat {
  if (stat.kanjiOnly) {
    if (outcome === 'correct' || outcome === 'slow') return stat;
    const shown = { ...stat };
    delete shown.kanjiOnly;
    return shown;
  }
  if (outcome !== 'correct' || stat.box < MASTERED_BOX) return stat;
  const promoted: Stat = {
    ...stat,
    kanjiOnly: true,
    box: KANJI_ONLY_BOX,
    due: stat.last + intervalFor(KANJI_ONLY_BOX),
  };
  delete promoted.s;
  delete promoted.d;
  return promoted;
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

// A conjugation card comes first once the word it conjugates is past its first step, read or understood.
export function knowsBaseWord(item: KanaItem, stats: Stats): boolean {
  const base = item.cloze?.baseId;
  return base !== undefined && Math.max(stats[base]?.box ?? 0, stats[`meaning:${base}`]?.box ?? 0) >= 2;
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

// A word met in one direction gives away the answer in another (水 read as mizu, then 水 for its meaning), so while one
// direction of it has been answered recently, the others wait. Cards still being learned can't wait that long, as their
// steps are short, but they stay a few minutes apart when anything else is due.
export const SIBLING_GAP = 12 * HOUR;
export const SIBLING_APART = 5 * MINUTE;

// How long ago another direction of an entry's item was answered. Only directions in `entries` count: someone who
// practises one direction on its own has chosen to.
export function sinceSibling(entries: Entry[], stats: Stats, now: number): (entry: Entry) => number {
  const byItem = new Map<KanaItem, Entry[]>();
  for (const entry of entries) {
    const siblings = byItem.get(entry.item);
    if (siblings) siblings.push(entry);
    else byItem.set(entry.item, [entry]);
  }
  return entry => {
    let latest = -Infinity;
    for (const other of byItem.get(entry.item) ?? []) {
      if (other.direction === entry.direction) continue;
      const last = stats[statKey(other.item, other.direction)]?.last;
      if (last !== undefined && last > latest) latest = last;
    }
    return now - latest;
  };
}

// Which entries wait for another direction of their item: reviews, and directions not started yet.
export function heldBySibling(entries: Entry[], stats: Stats, now: number): (entry: Entry) => boolean {
  const since = sinceSibling(entries, stats, now);
  return entry => {
    const stat = stats[statKey(entry.item, entry.direction)];
    return (!stat?.box || isReview(stat)) && since(entry) < SIBLING_GAP;
  };
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
  const since = sinceSibling(entries, stats, now);
  const held = heldBySibling(entries, stats, now);

  const due = others.filter(entry => isDue(stats, key(entry), now) && !held(entry));
  const apart = due.filter(entry => since(entry) >= SIBLING_APART);
  const review = randomFrom((apart.length ? apart : due).sort(byDue).slice(0, 3), random);
  if (review) return { ...review, kind: 'review' };

  const struggling = entries.filter(entry => stats[key(entry)]?.box === 1).length;
  const unseenEntries = others.filter(entry => !isSeen(stats, key(entry)) && canIntroduce(entry) && !held(entry));
  // Words whose kanji are known go first, but never ahead of an imported deck's words, which come first anyway.
  const first = unseenEntries[0];
  const inDeck = (entry: Entry) => entry.item.group === DECK_GROUP;
  const unseen =
    unseenEntries.find(
      entry =>
        inDeck(entry) === (first && inDeck(first)) &&
        (knowsKanjiOf(entry.item, stats) || knowsBaseWord(entry.item, stats)),
    ) ?? first;
  if (unseen && allowNew && struggling < LEARNING_LIMIT) return { ...unseen, kind: 'new' };

  // Extra practice leaves out what is waiting too, unless nothing else is left.
  const seen = others.filter(entry => isSeen(stats, key(entry)));
  const free = seen.filter(entry => !held(entry));
  const ahead = randomFrom((free.length ? free : seen).sort(byDue).slice(0, 4), random);
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
