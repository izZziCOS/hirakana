// The IndexedDB database progress is kept in, behind the small key-value interface progress-storage.ts uses.
import type { AsyncStorage, Channel } from './progress-storage.ts';

const DB_NAME = 'kana-dojo';
const STORE = 'progress';

const done = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });

// A write counts once its transaction has committed, not when its request succeeds.
const committed = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted'));
  });

function openDb(version?: number): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, version);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
  };
  return done(request);
}

export async function openIdb(): Promise<AsyncStorage> {
  let db = await openDb();
  // A database made without the store, such as by opening it in the browser's tools first, gets it in a new version.
  if (!db.objectStoreNames.contains(STORE)) {
    const version = db.version + 1;
    db.close();
    db = await openDb(version);
  }
  // A newer version of the app wanting to change the database gets it; this tab's next save then fails and says so.
  db.onversionchange = () => db.close();
  const store = (mode: IDBTransactionMode) => db.transaction(STORE, mode).objectStore(STORE);

  return {
    async getAll() {
      const objectStore = store('readonly');
      const [keys, values] = await Promise.all([done(objectStore.getAllKeys()), done(objectStore.getAll())]);
      return new Map(
        keys.flatMap((key, i) => {
          const value: unknown = values[i];
          return typeof key === 'string' && typeof value === 'string' ? [[key, value] as const] : [];
        }),
      );
    },
    async get(key) {
      const value: unknown = await done(store('readonly').get(key));
      return typeof value === 'string' ? value : null;
    },
    set(key, value) {
      const objectStore = store('readwrite');
      objectStore.put(value, key);
      return committed(objectStore.transaction);
    },
    remove(key) {
      const objectStore = store('readwrite');
      objectStore.delete(key);
      return committed(objectStore.transaction);
    },
  };
}

// Tabs of the app tell each other what they saved. Without BroadcastChannel each tab keeps to itself.
export function broadcastChannel(): Channel | undefined {
  if (typeof BroadcastChannel !== 'function') return undefined;
  const channel = new BroadcastChannel('kana-dojo-progress');
  return {
    post: key => channel.postMessage(key),
    listen: listener =>
      channel.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (typeof event.data === 'string') listener(event.data);
      }),
  };
}
