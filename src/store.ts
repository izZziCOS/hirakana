import { registerDecks } from './decks.ts';
import { mergeStates } from './merge.ts';
import { newSession } from './session.ts';
import { defaultState, migrateState } from './state.ts';
import { deviceId } from './sync.ts';
import type { Session, State } from './types.ts';
import { stableJson } from './util.ts';

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
): Saver {
  let pending: State | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    if (pending) onSaved(saveState(storage, pending));
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
  // Merges in progress saved by another tab, so the tabs don't overwrite each other's answers.
  receive(raw: string | null, now?: number): void;
}

export function createAppStores(storage: KeyValueStorage | null): AppStores {
  const data = createStore(loadState(storage));
  const session = createStore(newSession());
  const saveFailed = createStore(false);
  const saver = createSaver(storage, SAVE_DELAY_MS, saved => saveFailed.update(() => !saved));
  let receiving = false;
  // The cards of imported decks follow the saved decks.
  registerDecks(data.get().decks);
  data.subscribe(state => registerDecks(state.decks));
  data.subscribe(state => {
    if (!receiving) saver.schedule(state);
  });

  function receive(raw: string | null, now = Date.now()): void {
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

  return { data, session, saver, saveFailed, receive };
}
