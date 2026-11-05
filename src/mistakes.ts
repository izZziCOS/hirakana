import { dayKey } from './days.ts';
import { findKana, kanaForAnswer, parseStatKey } from './kana.ts';
import { isLeech } from './schedule.ts';
import type { KanaItem, Mistake, State } from './types.ts';

// Cards that keep being missed in some direction and aren't suspended, the most missed first.
export function problemCards(state: State): { item: KanaItem; wrong: number }[] {
  const found = new Map<KanaItem, number>();
  for (const [key, stat] of Object.entries(state.stats)) {
    const item = findKana(parseStatKey(key).kana);
    if (item && isLeech(stat) && state.suspensions[item.id]?.on !== true) {
      found.set(item, Math.max(found.get(item) ?? 0, stat.wrong));
    }
  }
  return [...found].map(([item, wrong]) => ({ item, wrong })).sort((a, b) => b.wrong - a.wrong);
}

export interface MixUpPair {
  items: [KanaItem, KanaItem];
  count: number;
}

export function mixUpOf(mistake: Mistake): [KanaItem, KanaItem] | null {
  const target = findKana(mistake.kana);
  // A wrong particle or ending isn't another card mixed up with this one.
  if (!target || !mistake.given || mistake.direction === 'cloze') return null;
  let answered: KanaItem | null | undefined;
  if (mistake.direction === 'recall' || mistake.direction === 'listen') answered = findKana(mistake.given);
  else if (mistake.direction === 'match') answered = findKana(findKana(mistake.given)?.counterpart);
  else answered = kanaForAnswer(mistake.given, target.script);
  return answered && answered !== target ? [target, answered] : null;
}

export function confusionPairs(mistakes: Mistake[], limit = 8): MixUpPair[] {
  const pairs = new Map<string, MixUpPair>();
  mistakes.forEach(mistake => {
    const mixUp = mixUpOf(mistake);
    if (!mixUp) return;
    const key = mixUp
      .map(item => item.id)
      .sort()
      .join('|');
    const pair = pairs.get(key) ?? { items: mixUp, count: 0 };
    pair.count++;
    pairs.set(key, pair);
  });
  return [...pairs.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export function mixUpsFor(item: KanaItem, mistakes: Mistake[]): { other: KanaItem; count: number }[] {
  const counts = new Map<KanaItem, number>();
  mistakes.forEach(mistake => {
    const mixUp = mixUpOf(mistake);
    if (!mixUp || !mixUp.includes(item)) return;
    const other = mixUp[0] === item ? mixUp[1] : mixUp[0];
    counts.set(other, (counts.get(other) ?? 0) + 1);
  });
  return [...counts].sort((a, b) => b[1] - a[1]).map(([other, count]) => ({ other, count }));
}

export function mostMissed(mistakes: Mistake[], limit: number): { item: KanaItem; count: number }[] {
  const counts = new Map<string, number>();
  mistakes.forEach(m => counts.set(m.kana, (counts.get(m.kana) ?? 0) + 1));
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .flatMap(([kana, count]) => {
      const item = findKana(kana);
      return item ? [{ item, count }] : [];
    });
}

export const mistakesOnDay = (mistakes: Mistake[], day: string): Mistake[] =>
  mistakes.filter(mistake => dayKey(mistake.at) === day);
