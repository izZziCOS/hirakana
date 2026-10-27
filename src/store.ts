import { newSession } from './session.ts';
import { defaultState, migrateState } from './state.ts';
import type { Session, State } from './types.ts';

import { LEGACY_STORAGE_KEYS, STORAGE_KEY } from './storage-key.ts';

export { STORAGE_KEY };

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

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

// Reads a saved state string, or returns null if there is none or it can't be read.
export function parseSaved(raw: string | null | undefined, now = Date.now()): State | null {
  if (raw === null || raw === undefined) return null;
  try {
    return migrateState(JSON.parse(raw), now);
  } catch {
    return null;
  }
}

export function loadState(storage: KeyValueStorage | null, now = Date.now()): State {
  if (!storage) return defaultState();
  try {
    const raw = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS].map(key => storage.getItem(key)).find(value => value !== null);
    return parseSaved(raw, now) ?? defaultState();
  } catch {
    return defaultState();
  }
}

export function saveState(storage: KeyValueStorage | null, state: State): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    LEGACY_STORAGE_KEYS.forEach(key => storage.removeItem(key));
  } catch {
    return;
  }
}

export function browserStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const SAVE_DELAY_MS = 400;

export interface Saver {
  schedule(state: State): void;
  flush(): void;
  cancel(): void;
}

export function createSaver(storage: KeyValueStorage | null, delay = SAVE_DELAY_MS): Saver {
  let pending: State | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    if (pending) saveState(storage, pending);
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
  // Takes in progress saved by another tab, so the tabs don't overwrite each other's answers.
  receive(raw: string | null, now?: number): void;
}

export function createAppStores(storage: KeyValueStorage | null): AppStores {
  const data = createStore(loadState(storage));
  const session = createStore(newSession());
  const saver = createSaver(storage);
  let receiving = false;
  data.subscribe(state => {
    if (!receiving) saver.schedule(state);
  });

  function receive(raw: string | null, now = Date.now()): void {
    const state = parseSaved(raw, now);
    if (!state) return;
    saver.cancel();
    receiving = true;
    try {
      data.update(() => state);
    } finally {
      receiving = false;
    }
    // Undoing would bring back this tab's older copy of the progress.
    session.update(current => (current.undo ? { ...current, undo: null } : current));
  }

  return { data, session, saver, receive };
}
