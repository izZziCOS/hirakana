import { registerDecks } from './decks.ts';
import { mergeStates } from './merge.ts';
import { newSession } from './session.ts';
import { defaultState, migrateState, STATE_VERSION } from './state.ts';
import { deviceId } from './sync.ts';
import type { Session, State } from './types.ts';
import { isObject, stableJson } from './util.ts';

import { LEGACY_STORAGE_KEYS, STORAGE_KEY } from './storage-key.ts';

export { STORAGE_KEY };

// A copy of saved progress that couldn't be read, kept until the learner has downloaded or deleted it.
export const UNREADABLE_KEY = 'kana-dojo-unreadable';

export interface KeyValueStorage extends Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  // For storage that writes in the background (IndexedDB): settles once the writes so far are done, with whether the
  // last one succeeded. localStorage writes at once, and throws if it can't.
  flushed?(): Promise<boolean>;
}

type Listener<T> = (value: T, previous: T) => void;

export interface Store<T> {
  get(): T;
  update(change: (value: T) => T): void;
  subscribe(listener: Listener<T>): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<Listener<T>>();
  return {
    get: () => value,
    update(change) {
      const previous = value;
      const next = change(previous);
      if (next === previous) return;
      value = next;
      listeners.forEach(listener => listener(value, previous));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// Whether progress was saved by a newer version of the app. This one wouldn't know what its new fields mean, so it must
// neither read the progress nor save over it. The version comes first in anything saved since version 2.
export function isNewerSave(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const prefix = /^\s*\{\s*"version"\s*:\s*(\d+)/.exec(raw)?.[1];
  if (prefix !== undefined) return Number(prefix) > STATE_VERSION;
  try {
    const saved: unknown = JSON.parse(raw);
    return isObject(saved) && typeof saved.version === 'number' && saved.version > STATE_VERSION;
  } catch {
    return false;
  }
}

// Reads a saved state string, or returns null if there is none, it can't be read or it comes from a newer version.
export function parseSaved(raw: string | null | undefined, now = Date.now()): State | null {
  if (raw === null || raw === undefined || isNewerSave(raw)) return null;
  try {
    return migrateState(JSON.parse(raw), now);
  } catch {
    return null;
  }
}

// The saved progress as stored, under the current key or an older one.
export function savedText(storage: KeyValueStorage | null): string | null {
  try {
    return (
      [STORAGE_KEY, ...LEGACY_STORAGE_KEYS].map(key => storage?.getItem(key) ?? null).find(value => value !== null) ??
      null
    );
  } catch {
    return null;
  }
}

export const loadState = (storage: KeyValueStorage | null, now = Date.now()): State =>
  parseSaved(savedText(storage), now) ?? defaultState();

// Whether the progress was saved: the browser may have no storage for the page, or refuse to store more.
export function saveState(storage: KeyValueStorage | null, state: State): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    LEGACY_STORAGE_KEYS.forEach(key => storage.removeItem(key));
    return true;
  } catch {
    return false;
  }
}

export function browserStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function unreadableSave(storage: KeyValueStorage | null): string | null {
  try {
    return storage?.getItem(UNREADABLE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function discardUnreadableSave(storage: KeyValueStorage | null): void {
  try {
    storage?.removeItem(UNREADABLE_KEY);
  } catch {
    return;
  }
}

function keepUnreadableSave(storage: KeyValueStorage | null, raw: string): boolean {
  try {
    storage?.setItem(UNREADABLE_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

export const SAVE_DELAY_MS = 400;

export interface Saver {
  schedule(state: State): void;
  flush(): void;
  cancel(): void;
}

export function createSaver(
  storage: KeyValueStorage | null,
  delay = SAVE_DELAY_MS,
  onSaved: (saved: boolean) => void = () => undefined,
  canSave: () => boolean = () => true,
): Saver {
  let pending: State | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    if (pending && canSave()) {
      const saved = saveState(storage, pending);
      if (saved && storage?.flushed) void storage.flushed().then(onSaved);
      else onSaved(saved);
    }
    pending = null;
  };
  return {
    schedule(state) {
      pending = state;
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    flush,
    cancel() {
      clearTimeout(timer);
      pending = null;
    },
  };
}

export interface AppStores {
  data: Store<State>;
  session: Store<Session>;
  saver: Saver;
  // Whether the last save failed, so the page can warn that progress isn't being kept.
  saveFailed: Store<boolean>;
  // Whether a newer version of the app has saved progress since this tab opened. This tab then stops saving, so it
  // can't overwrite that progress with an older copy, until it is reloaded.
  outdated: Store<boolean>;
  // Merges in progress saved by another tab, so the tabs don't overwrite each other's answers.
  receive(raw: string | null, now?: number): void;
}

export function createAppStores(storage: KeyValueStorage | null): AppStores {
  const saved = savedText(storage);
  const parsed = parseSaved(saved);
  const outdated = createStore(isNewerSave(saved));
  // Progress that can't be read must not be overwritten by the first answer. If no copy of it can be kept either, this
  // tab doesn't save at all, and says so.
  const unreadable = saved !== null && parsed === null && !outdated.get();
  const nothingKept = unreadable && !keepUnreadableSave(storage, saved);
  const data = createStore(parsed ?? defaultState());
  const session = createStore(newSession());
  const saveFailed = createStore(nothingKept);
  const canSave = () => {
    if (isNewerSave(savedText(storage))) outdated.update(() => true);
    return !outdated.get() && !nothingKept;
  };
  const saver = createSaver(storage, SAVE_DELAY_MS, wasSaved => saveFailed.update(() => !wasSaved), canSave);
  let receiving = false;
  // The cards of imported decks follow the saved decks.
  registerDecks(data.get().decks);
  data.subscribe(state => registerDecks(state.decks));
  data.subscribe(state => {
    if (!receiving) saver.schedule(state);
  });

  function receive(raw: string | null, now = Date.now()): void {
    if (isNewerSave(raw)) {
      saver.cancel();
      outdated.update(() => true);
      return;
    }
    const incoming = parseSaved(raw, now);
    if (!incoming) return;
    // Both tabs are this device, and answers this tab hasn't saved yet are merged in rather than lost.
    const device = deviceId(storage);
    const merged = mergeStates(data.get(), device, incoming, device);
    // This tab saves only what the other tab doesn't have yet, so the two don't keep answering each other's saves.
    const adds = stableJson(merged) !== stableJson(incoming);
    if (!adds) saver.cancel();
    receiving = !adds;
    try {
      data.update(() => merged);
    } finally {
      receiving = false;
    }
    // Undoing would bring back this tab's older copy of the progress.
    session.update(current => (current.undo ? { ...current, undo: null } : current));
  }

  return { data, session, saver, saveFailed, outdated, receive };
}
