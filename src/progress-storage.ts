// Saved progress lives in IndexedDB, which takes far more than localStorage's few megabytes. The app reads and writes
// it synchronously, as it always has: everything is read into memory once at start, and writes go on to IndexedDB in
// the background, in order. Other tabs hear about them on a broadcast channel.
import { LEGACY_STORAGE_KEYS, STORAGE_KEY } from './storage-key.ts';
import { DEVICE_STORAGE_KEY, SYNC_STORAGE_KEY } from './sync.ts';
import { isNewerSave, type KeyValueStorage, savedText, UNREADABLE_KEY } from './store.ts';

// A key-value store that answers later, such as IndexedDB.
export interface AsyncStorage {
  getAll(): Promise<Map<string, string>>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

// How tabs tell each other that they saved something.
export interface Channel {
  post(key: string): void;
  listen(listener: (key: string) => void): void;
}

export interface ProgressStorage extends KeyValueStorage {
  // Settles once everything set so far has been written, with whether the last write was.
  flushed(): Promise<boolean>;
  // Called when another tab has saved under a key; getItem already has its new value.
  onChange(listener: (key: string) => void): void;
}

export const isProgressStorage = (storage: KeyValueStorage | null): storage is ProgressStorage =>
  storage !== null && 'flushed' in storage && 'onChange' in storage;

// What is left in localStorage once progress has moved. An older version of the app, still open in another tab or
// served from its cache, reads it as progress from a newer version: it stops saving rather than starting afresh.
export const MOVED_MARKER = JSON.stringify({ version: 1_000_000, movedTo: 'indexedDB' });

// The keys moved out of localStorage along with the progress.
const MOVED_KEYS = [UNREADABLE_KEY, SYNC_STORAGE_KEY, DEVICE_STORAGE_KEY];

// The theme, kept in localStorage too, so the page can take it on before the rest has loaded.
export const THEME_KEY = 'kana-dojo-theme';

// A browser gives up on IndexedDB writes still running when the page goes, which a reload right after an answer can
// cut short. While a write is on its way, what it writes is also kept here, in localStorage, which writes at once; it
// goes again once the write is done, and is read back at the next start if it never was.
export const JOURNAL_KEY = 'kana-dojo-journal';

function writeJournal(local: KeyValueStorage | null, unwritten: Map<string, string | null>): void {
  try {
    if (unwritten.size) local?.setItem(JOURNAL_KEY, JSON.stringify(Object.fromEntries(unwritten)));
    else local?.removeItem(JOURNAL_KEY);
  } catch {
    // Too big for localStorage, or none: only a reload in the next moment would lose anything.
  }
}

export function createMirror(
  backend: AsyncStorage,
  initial: Map<string, string>,
  channel?: Channel,
  local: KeyValueStorage | null = null,
): ProgressStorage {
  const values = new Map(initial);
  const listeners = new Set<(key: string) => void>();
  // What has been set or removed (null) but not written yet, by key.
  const unwritten = new Map<string, string | null>();
  let writes: Promise<boolean> = Promise.resolve(true);
  const write = (key: string, value: string | null, op: () => Promise<void>) => {
    unwritten.set(key, value);
    writeJournal(local, unwritten);
    // An op that throws at once counts as a failed write too, and the writes after it still run.
    writes = writes.then(() =>
      Promise.resolve()
        .then(op)
        .then(
          () => {
            if (unwritten.get(key) === value) unwritten.delete(key);
            writeJournal(local, unwritten);
            channel?.post(key);
            return true;
          },
          () => false,
        ),
    );
  };

  channel?.listen(key => {
    // Read after this tab's own writes, so a value it has just saved isn't overtaken by an older one.
    void writes
      .then(() => backend.get(key))
      .then(value => {
        if (value === null) values.delete(key);
        else values.set(key, value);
        listeners.forEach(listener => listener(key));
      })
      .catch(() => undefined);
  });

  return {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) {
      values.set(key, value);
      write(key, value, () => backend.set(key, value));
    },
    removeItem(key) {
      if (!values.delete(key)) return;
      write(key, null, () => backend.remove(key));
    },
    flushed: () => writes,
    onChange: listener => void listeners.add(listener),
  };
}

// localStorage without the marker progress leaves when it moves: for a browser where IndexedDB can't be opened.
export function withoutMarker(local: KeyValueStorage): KeyValueStorage {
  return {
    getItem: key => {
      const value = local.getItem(key);
      return key === STORAGE_KEY && value === MOVED_MARKER ? null : value;
    },
    setItem: (key, value) => local.setItem(key, value),
    removeItem: key => local.removeItem(key),
  };
}

function readLocal(local: KeyValueStorage, key: string): string | null {
  try {
    return local.getItem(key);
  } catch {
    return null;
  }
}

const tryLocal = (action: () => void): void => {
  try {
    action();
  } catch {
    return;
  }
};

// Moves progress kept in localStorage by earlier versions into IndexedDB, and leaves the marker in its place. Progress
// from a newer version isn't moved or touched: it is only read, so the app can stop and say so.
async function moveFromLocal(local: KeyValueStorage, backend: AsyncStorage, stored: Map<string, string>) {
  const raw = savedText(withoutMarker(local));
  if (raw !== null && isNewerSave(raw)) {
    stored.set(STORAGE_KEY, raw);
    return;
  }
  const moving = new Map<string, string>();
  for (const key of MOVED_KEYS) {
    const value = readLocal(local, key);
    if (value !== null && !stored.has(key)) moving.set(key, value);
  }
  // The progress goes last: once it is in IndexedDB, nothing is moved again.
  if (raw !== null) moving.set(STORAGE_KEY, raw);
  if (!moving.size) return;
  // Everything is written before anything is taken out of localStorage, so a failed write loses nothing.
  for (const [key, value] of moving) await backend.set(key, value);
  for (const [key, value] of moving) stored.set(key, value);
  tryLocal(() => {
    if (raw !== null) local.setItem(STORAGE_KEY, MOVED_MARKER);
    LEGACY_STORAGE_KEYS.forEach(key => local.removeItem(key));
    MOVED_KEYS.forEach(key => local.removeItem(key));
  });
}

interface OpenOptions {
  // Opens IndexedDB, or fails where the browser has none or won't open it (some private windows).
  open: () => Promise<AsyncStorage>;
  local: KeyValueStorage | null;
  channel?: Channel;
}

export interface OpenedStorage {
  storage: KeyValueStorage | null;
  // Progress whose write a closing page cut short. Another tab may have saved since, so it is merged into what was
  // saved, as another tab's progress is, rather than put in its place.
  recovered: string | null;
}

// Puts back what the last page set but didn't get to write: progress to be merged in, anything else as it was.
async function readJournal(local: KeyValueStorage, backend: AsyncStorage, stored: Map<string, string>) {
  const raw = readLocal(local, JOURNAL_KEY);
  if (raw === null) return null;
  let recovered: string | null = null;
  try {
    const entries: unknown = JSON.parse(raw);
    const list: [string, unknown][] = typeof entries === 'object' && entries !== null ? Object.entries(entries) : [];
    for (const [key, value] of list) {
      if (typeof value !== 'string' && value !== null) continue;
      if (key === STORAGE_KEY && value !== null && stored.has(key)) {
        recovered = value;
      } else if (value === null) {
        await backend.remove(key);
        stored.delete(key);
      } else {
        await backend.set(key, value);
        stored.set(key, value);
      }
    }
  } catch {
    // A journal that can't be read or written back is let go, as a failed write would be.
  }
  tryLocal(() => local.removeItem(JOURNAL_KEY));
  return recovered;
}

// Where this tab keeps progress: IndexedDB if it opens, with anything an earlier version left in localStorage moved
// into it, or else localStorage as before.
export async function openProgressStorage({ open, local, channel }: OpenOptions): Promise<OpenedStorage> {
  let backend: AsyncStorage;
  let stored: Map<string, string>;
  let recovered: string | null = null;
  try {
    backend = await open();
    stored = await backend.getAll();
    if (!stored.has(STORAGE_KEY) && local) await moveFromLocal(local, backend, stored);
    if (local) recovered = await readJournal(local, backend, stored);
  } catch {
    return { storage: local && withoutMarker(local), recovered: null };
  }
  return { storage: createMirror(backend, stored, channel, local), recovered };
}
