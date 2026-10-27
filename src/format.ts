import { DAY, HOUR, MINUTE } from './schedule.ts';

export function formatWait(ms: number): string {
  if (ms <= 0) return 'now';
  if (ms < HOUR) return `in ${Math.max(1, Math.round(ms / MINUTE))} min`;
  if (ms < DAY) return `in ${Math.round(ms / HOUR)} h`;
  const days = Math.round(ms / DAY);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

export const formatSeconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;
