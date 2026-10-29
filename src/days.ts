import { DAY, type Stats } from './schedule.ts';
import type { DayLog } from './types.ts';

export const DAY_HISTORY = 400;

export type Days = Record<string, DayLog>;

export interface WeekAccuracy {
  start: string;
  scored: number;
  correct: number;
  accuracy: number | null;
}

export function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(n => String(n).padStart(2, '0')).join('-');
}

export const dateOf = (key: string): Date => {
  const [year = 1970, month = 1, day = 1] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const shiftDay = (key: string, days: number): string => {
  const date = dateOf(key);
  date.setDate(date.getDate() + days);
  return dayKey(date.getTime());
};

export const startOfDay = (timestamp: number): number => new Date(timestamp).setHours(0, 0, 0, 0);

export const emptyDay = (): DayLog => ({ answers: 0, learned: 0, reviews: 0, scored: 0, correct: 0 });

// Adds up several day logs, for example those of different devices.
export function addDays(logs: Days[]): Days {
  const total: Days = {};
  for (const log of logs) {
    for (const [key, day] of Object.entries(log)) {
      const sum = total[key] ?? emptyDay();
      total[key] = {
        answers: sum.answers + day.answers,
        learned: sum.learned + day.learned,
        reviews: sum.reviews + day.reviews,
        scored: sum.scored + day.scored,
        correct: sum.correct + day.correct,
      };
    }
  }
  return total;
}

export function logDay(days: Days, now: number, entry: Partial<DayLog>): Days {
  const key = dayKey(now);
  const today = days[key] ?? emptyDay();
  const next: Days = {
    ...days,
    [key]: {
      answers: today.answers + (entry.answers ?? 0),
      learned: today.learned + (entry.learned ?? 0),
      reviews: today.reviews + (entry.reviews ?? 0),
      scored: today.scored + (entry.scored ?? 0),
      correct: today.correct + (entry.correct ?? 0),
    },
  };
  return Object.fromEntries(
    Object.entries(next)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-DAY_HISTORY),
  );
}

export function dayStreak(days: Days, now: number): number {
  let key = dayKey(now);
  if (!days[key]?.answers) key = shiftDay(key, -1);
  let streak = 0;
  while (days[key]?.answers) {
    streak++;
    key = shiftDay(key, -1);
  }
  return streak;
}

export function bestDayStreak(days: Days): number {
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  Object.keys(days)
    .filter(key => days[key]?.answers)
    .sort()
    .forEach(key => {
      run = previous && shiftDay(previous, 1) === key ? run + 1 : 1;
      best = Math.max(best, run);
      previous = key;
    });
  return best;
}

export function forecast(stats: Stats, keys: string[], now: number, length = 7): number[] {
  const counts = Array.from({ length }, () => 0);
  const today = startOfDay(now);
  keys.forEach(key => {
    const stat = stats[key];
    if (!stat?.box) return;
    const index = Math.max(0, Math.round((startOfDay(stat.due) - today) / DAY));
    if (index < length) counts[index] = (counts[index] ?? 0) + 1;
  });
  return counts;
}

export function weekStart(key: string): string {
  const mondayOffset = (dateOf(key).getDay() + 6) % 7;
  return shiftDay(key, -mondayOffset);
}

export function calendarWeeks(now: number, weeks: number): string[][] {
  const firstMonday = shiftDay(weekStart(dayKey(now)), -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => shiftDay(firstMonday, week * 7 + day)),
  );
}

export function heatThresholds(values: number[]): number[] {
  const active = values.filter(value => value > 0).sort((a, b) => a - b);
  const quantile = (q: number) => active[Math.min(active.length - 1, Math.floor(q * active.length))] ?? 0;
  return [0.25, 0.5, 0.75].reduce(
    (thresholds, q) => [...thresholds, Math.max(quantile(q), (thresholds.at(-1) ?? 0) + 1)],
    [1],
  );
}

export const heatLevel = (answers: number, thresholds: number[]): number =>
  thresholds.filter(threshold => answers >= threshold).length;

export function weeklyAccuracy(days: Days, now: number, weeks: number): WeekAccuracy[] {
  return calendarWeeks(now, weeks).map(week => {
    const scored = week.reduce((sum, key) => sum + (days[key]?.scored ?? 0), 0);
    const correct = week.reduce((sum, key) => sum + (days[key]?.correct ?? 0), 0);
    return { start: week[0] ?? '', scored, correct, accuracy: scored ? correct / scored : null };
  });
}
