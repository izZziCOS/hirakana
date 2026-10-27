let loading: Promise<void> | undefined;

// Loads the JLPT kanji (a separate file in the build) once; every later call gets the same promise.
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

// Saved progress that involves kanji has to wait for them, or cleaning it up would drop every kanji card. It mentions
// them through kanji characters or kanji row ids such as "k5:N5 · 1–30".
export const mentionsKanji = (raw: string | null): boolean =>
  raw !== null && (/[㐀-鿿豈-﫿]/.test(raw) || /"k[1-5]:/.test(raw));
