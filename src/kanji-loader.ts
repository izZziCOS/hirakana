import { isDeckItemId, isDeckRowId } from './decks.ts';
import { findKana, parseStatKey, ROW_INFO } from './kana.ts';
import { isObject } from './util.ts';

let loading: Promise<void> | undefined;

// Loads the JLPT kanji and the full JLPT word list (a separate file in the build) once; every later call gets the same
// promise.
export function loadKanji(): Promise<void> {
  loading ??= import('./kanji.ts').then(
    () => undefined,
    (error: unknown) => {
      loading = undefined;
      throw error;
    },
  );
  return loading;
}

// Saved progress that involves kanji or the full word list has to wait for them, or cleaning it up would drop those
// cards. It mentions them through kanji characters, or through cards and rows the main bundle doesn't have, such as
// the word あそこ or the row "k5:N5 · 1–30". Imported decks are part of the progress itself.
export function needsKanji(raw: string | null): boolean {
  if (raw === null) return false;
  if (/[㐀-鿿豈-﫿]/.test(raw)) return true;
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!isObject(saved)) return false;
  const ids = [
    ...(isObject(saved.stats) ? Object.keys(saved.stats).map(key => parseStatKey(key).kana) : []),
    ...(Array.isArray(saved.mistakes) ? saved.mistakes.map(mistake => (isObject(mistake) ? mistake.kana : null)) : []),
  ].filter((id): id is string => typeof id === 'string' && !isDeckItemId(id));
  const rows = (isObject(saved.settings) && Array.isArray(saved.settings.rows) ? saved.settings.rows : []).filter(
    (id): id is string => typeof id === 'string' && !isDeckRowId(id),
  );
  const knownRows = new Set(ROW_INFO.map(row => row.id));
  return ids.some(id => !findKana(id)) || rows.some(id => !knownRows.has(id));
}
