import { GROUPS } from './data.ts';
import { KANA, statKey, supportsDirection } from './kana.ts';
import { readableWords } from './reading.ts';
import { levelOf, type Stats } from './schedule.ts';
import type { Direction, GroupId, KanaItem } from './types.ts';

export const READABLE_STEPS = [10, 25, 50, 100, 200, 300, 400];
// Below this many answers a recall rate says more about luck than memory.
export const MIN_RECALL_ANSWERS = 10;

const groupItems = (groupId: GroupId, direction: Direction): KanaItem[] =>
  KANA.filter(item => item.group === groupId && supportsDirection(item, direction));

// Share of answers that were right across a set, or null with too few answers to tell.
export function recallRate(stats: Stats, items: KanaItem[], direction: Direction): number | null {
  let correct = 0;
  let answered = 0;
  for (const item of items) {
    const stat = stats[statKey(item, direction)];
    if (!stat) continue;
    correct += stat.correct;
    answered += stat.correct + stat.wrong;
  }
  return answered >= MIN_RECALL_ANSWERS ? Math.round((correct / answered) * 100) : null;
}

export const groupRecall = (stats: Stats, groupId: GroupId, direction: Direction): number | null =>
  recallRate(stats, groupItems(groupId, direction), direction);

const allMastered = (stats: Stats, items: KanaItem[], direction: Direction): boolean =>
  items.length > 0 && items.every(item => levelOf(stats[statKey(item, direction)]) === 'mastered');

// What an answer just achieved: a whole set mastered, or a new number of words the learner can read.
export function milestonesOf(before: Stats, after: Stats, item: KanaItem, direction: Direction): string[] {
  const notes: string[] = [];
  const group = GROUPS.find(candidate => candidate.id === item.group);
  const items = groupItems(item.group, direction);
  if (group && !allMastered(before, items, direction) && allMastered(after, items, direction)) {
    notes.push(`Milestone: every card in ${group.label} is mastered.`);
  }
  if (direction === 'read') {
    const was = readableWords(before).length;
    const is = readableWords(after).length;
    const step = READABLE_STEPS.filter(count => was < count && is >= count).at(-1);
    if (step) notes.push(`Milestone: you can now read ${is} words.`);
  }
  return notes;
}
