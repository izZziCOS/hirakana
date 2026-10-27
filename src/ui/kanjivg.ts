export const KANJIVG_VERSION = 'r20250816';
export const KANJIVG_PATH = 'kanjivg';

export const kanjivgFile = (char: string): string => `${(char.codePointAt(0) ?? 0).toString(16).padStart(5, '0')}.svg`;
