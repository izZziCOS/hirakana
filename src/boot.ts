import { STORAGE_KEY } from './storage-key.ts';

const LOAD_TIMEOUT_MS = 8000;

function savedTheme(): string | undefined {
  try {
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
