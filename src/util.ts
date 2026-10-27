export type Random = () => number;

export const codePoints = (text: string): string[] => Array.from(text);

export const unique = <T>(list: T[]): T[] => [...new Set(list)];

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const nonNegative = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

export function shuffle<T>(list: T[], random: Random = Math.random): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const current = list[i] as T;
    list[i] = list[j] as T;
    list[j] = current;
  }
  return list;
}

export const randomFrom = <T>(list: T[], random: Random = Math.random): T | undefined =>
  list[Math.floor(random() * list.length)];

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (text: string | number): string =>
  String(text).replace(/[&<>"']/g, c => HTML_ESCAPES[c] ?? c);
