import { STORAGE_KEY } from './storage-key.ts';

// Kept by the app next to the progress, which is in IndexedDB and can't be read before the page draws.
const THEME_KEY = 'kana-dojo-theme';

const LOAD_TIMEOUT_MS = 8000;

function savedTheme(): string | undefined {
  try {
    const theme = localStorage.getItem(THEME_KEY);
    if (theme !== null) return theme;
    // Saved by a version that kept progress in localStorage.
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as { settings?: { theme?: string } } | null;
    return saved?.settings?.theme;
  } catch {
    return undefined;
  }
}

const theme = savedTheme();
if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;

window.setTimeout(() => {
  if (!document.documentElement.dataset.ready) document.getElementById('app-error')?.removeAttribute('hidden');
}, LOAD_TIMEOUT_MS);
