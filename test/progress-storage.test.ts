import assert from 'node:assert/strict';
import test from 'node:test';
import {
  type AsyncStorage,
  type Channel,
  createMirror,
  isProgressStorage,
  JOURNAL_KEY,
  MOVED_MARKER,
  openProgressStorage,
  THEME_KEY,
  withoutMarker,
} from '../src/progress-storage.ts';
import { createSaver, type KeyValueStorage, STORAGE_KEY, UNREADABLE_KEY } from '../src/store.ts';
import { defaultState } from '../src/state.ts';
import { DEVICE_STORAGE_KEY, SYNC_STORAGE_KEY } from '../src/sync.ts';

// IndexedDB stand-in: a map that answers later, and can be told to fail.
function fakeBackend(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const failing = { set: false, getAll: false, throwAtOnce: false };
  const backend: AsyncStorage = {
    getAll: () => (failing.getAll ? Promise.reject(new Error('no')) : Promise.resolve(new Map(data))),
    get: key => Promise.resolve(data.get(key) ?? null),
    set(key, value) {
      if (failing.throwAtOnce) throw new Error('at once');
      if (failing.set) return Promise.reject(new Error('full'));
      data.set(key, value);
      return Promise.resolve();
    },
    remove(key) {
      data.delete(key);
      return Promise.resolve();
    },
  };
  return { backend, data, failing };
}

function fakeLocal(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const local: KeyValueStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: key => void data.delete(key),
  };
  return { local, data };
}

// Two tabs' channels, joined: what one posts, the other hears.
function channels(): [Channel, Channel] {
  const listeners: [((key: string) => void)[], ((key: string) => void)[]] = [[], []];
  const end = (mine: 0 | 1): Channel => ({
    post: key => listeners[mine === 0 ? 1 : 0].forEach(listener => listener(key)),
    listen: listener => void listeners[mine].push(listener),
  });
  return [end(0), end(1)];
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const PROGRESS = JSON.stringify({ version: 12, bestStreak: 3 });

test('progress an earlier version kept in localStorage moves to IndexedDB, and a marker stays behind', async () => {
  const { backend, data } = fakeBackend();
  const { local, data: localData } = fakeLocal({
    'kana-dojo-v1': PROGRESS,
    [UNREADABLE_KEY]: 'broken',
    [SYNC_STORAGE_KEY]: 'CODE',
    [DEVICE_STORAGE_KEY]: 'device-1',
    [THEME_KEY]: 'dark',
  });
  const { storage, recovered } = await openProgressStorage({ open: () => Promise.resolve(backend), local });
  assert.ok(isProgressStorage(storage));
  assert.equal(recovered, null);
  assert.equal(storage.getItem(STORAGE_KEY), PROGRESS);
  assert.equal(storage.getItem(DEVICE_STORAGE_KEY), 'device-1');
  assert.deepEqual(Object.fromEntries(data), {
    [UNREADABLE_KEY]: 'broken',
    [SYNC_STORAGE_KEY]: 'CODE',
    [DEVICE_STORAGE_KEY]: 'device-1',
    [STORAGE_KEY]: PROGRESS,
  });
  assert.deepEqual(Object.fromEntries(localData), { [STORAGE_KEY]: MOVED_MARKER, [THEME_KEY]: 'dark' });

  // The next start finds it in IndexedDB and leaves localStorage alone.
  const again = await openProgressStorage({ open: () => Promise.resolve(backend), local });
  assert.equal(again.storage?.getItem(STORAGE_KEY), PROGRESS);
  assert.equal(localData.get(STORAGE_KEY), MOVED_MARKER);
});

test('nothing in localStorage leaves it untouched', async () => {
  const { backend, data } = fakeBackend();
  const { local, data: localData } = fakeLocal({ [THEME_KEY]: 'light' });
  const { storage } = await openProgressStorage({ open: () => Promise.resolve(backend), local });
  assert.equal(storage?.getItem(STORAGE_KEY), null);
  assert.equal(data.size, 0);
  assert.deepEqual(Object.fromEntries(localData), { [THEME_KEY]: 'light' });
});

test('progress from a newer version is read but neither moved nor touched', async () => {
  const newer = JSON.stringify({ version: 999 });
  const { backend, data } = fakeBackend();
  const { local, data: localData } = fakeLocal({ [STORAGE_KEY]: newer });
  const { storage } = await openProgressStorage({ open: () => Promise.resolve(backend), local });
  assert.equal(storage?.getItem(STORAGE_KEY), newer);
  assert.equal(data.size, 0);
  assert.equal(localData.get(STORAGE_KEY), newer);
});

test('without IndexedDB, or if moving fails, localStorage is used as before and nothing is lost', async () => {
  const { local, data: localData } = fakeLocal({ [STORAGE_KEY]: PROGRESS });
  const closed = await openProgressStorage({ open: () => Promise.reject(new Error('private window')), local });
  assert.ok(!isProgressStorage(closed.storage));
  assert.equal(closed.storage?.getItem(STORAGE_KEY), PROGRESS);

  const { backend, failing } = fakeBackend();
  failing.set = true;
  const failed = await openProgressStorage({ open: () => Promise.resolve(backend), local });
  assert.equal(failed.storage?.getItem(STORAGE_KEY), PROGRESS);
  assert.equal(localData.get(STORAGE_KEY), PROGRESS);

  const unreadable = fakeBackend();
  unreadable.failing.getAll = true;
  const fallback = await openProgressStorage({ open: () => Promise.resolve(unreadable.backend), local: null });
  assert.equal(fallback.storage, null);
});

test('in the localStorage fallback, the marker reads as no progress', () => {
  const { local, data } = fakeLocal({ [STORAGE_KEY]: MOVED_MARKER, other: 'x' });
  const storage = withoutMarker(local);
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.equal(storage.getItem('other'), 'x');
  storage.setItem(STORAGE_KEY, PROGRESS);
  assert.equal(storage.getItem(STORAGE_KEY), PROGRESS);
  storage.removeItem('other');
  assert.ok(!data.has('other'));
});

test('the mirror answers at once and writes in the background, in order', async () => {
  const { backend, data, failing } = fakeBackend({ a: '1' });
  const mirror = createMirror(backend, new Map([['a', '1']]));
  assert.equal(mirror.getItem('a'), '1');
  mirror.setItem('a', '2');
  mirror.setItem('b', '3');
  assert.equal(mirror.getItem('a'), '2');
  assert.equal(await mirror.flushed(), true);
  assert.deepEqual(Object.fromEntries(data), { a: '2', b: '3' });
  mirror.removeItem('b');
  mirror.removeItem('nothing');
  await mirror.flushed();
  assert.ok(!data.has('b'));

  failing.set = true;
  mirror.setItem('a', 'lost');
  assert.equal(await mirror.flushed(), false);
  failing.set = false;
  failing.throwAtOnce = true;
  mirror.setItem('a', 'lost too');
  assert.equal(await mirror.flushed(), false, 'a write that throws at once fails like any other');
  failing.throwAtOnce = false;
  mirror.setItem('a', '4');
  assert.equal(await mirror.flushed(), true, 'writes after a failed one still go through');
  assert.equal(data.get('a'), '4');
});

test('a write still on its way is kept in localStorage until it is done', async () => {
  const { backend } = fakeBackend();
  const { local, data } = fakeLocal();
  const mirror = createMirror(backend, new Map(), undefined, local);
  mirror.setItem(STORAGE_KEY, PROGRESS);
  assert.deepEqual(JSON.parse(data.get(JOURNAL_KEY) ?? '{}'), { [STORAGE_KEY]: PROGRESS });
  await mirror.flushed();
  assert.ok(!data.has(JOURNAL_KEY));
});

test('what a closing page didn’t write is put back at the next start, progress to be merged in', async () => {
  const { backend, data } = fakeBackend({ [STORAGE_KEY]: PROGRESS, gone: 'x' });
  const later = JSON.stringify({ version: 12, bestStreak: 4 });
  const { local, data: localData } = fakeLocal({
    [JOURNAL_KEY]: JSON.stringify({ [STORAGE_KEY]: later, [SYNC_STORAGE_KEY]: 'CODE', gone: null, odd: 5 }),
  });
  const { storage, recovered } = await openProgressStorage({ open: () => Promise.resolve(backend), local });
  assert.equal(recovered, later);
  assert.ok(storage);
  assert.equal(storage.getItem(STORAGE_KEY), PROGRESS, 'merged by the app, not written over');
  assert.equal(storage.getItem(SYNC_STORAGE_KEY), 'CODE');
  assert.equal(data.get(SYNC_STORAGE_KEY), 'CODE');
  assert.ok(!data.has('gone'));
  assert.ok(!localData.has(JOURNAL_KEY));

  // With nothing saved yet, the progress is simply put back.
  const empty = fakeBackend();
  const fresh = fakeLocal({ [JOURNAL_KEY]: JSON.stringify({ [STORAGE_KEY]: later }) });
  const reopened = await openProgressStorage({ open: () => Promise.resolve(empty.backend), local: fresh.local });
  assert.equal(reopened.recovered, null);
  assert.equal(reopened.storage?.getItem(STORAGE_KEY), later);

  // A journal that can't be read is let go.
  for (const broken of ['{', 'null']) {
    const { local: brokenLocal, data: brokenData } = fakeLocal({ [JOURNAL_KEY]: broken });
    const result = await openProgressStorage({
      open: () => Promise.resolve(fakeBackend().backend),
      local: brokenLocal,
    });
    assert.equal(result.recovered, null);
    assert.ok(!brokenData.has(JOURNAL_KEY));
  }
});

test('a tab hears what another tab saved, after its own writes', async () => {
  const { backend } = fakeBackend();
  const [one, two] = channels();
  const first = createMirror(backend, new Map(), one);
  const second = createMirror(backend, new Map(), two);
  const heard: string[] = [];
  second.onChange(key => heard.push(key));
  first.setItem(STORAGE_KEY, PROGRESS);
  await first.flushed();
  await settle();
  assert.deepEqual(heard, [STORAGE_KEY]);
  assert.equal(second.getItem(STORAGE_KEY), PROGRESS);

  first.removeItem(STORAGE_KEY);
  await first.flushed();
  await settle();
  assert.equal(second.getItem(STORAGE_KEY), null);
});

test('the saver reports a background write’s result once it is known', async () => {
  const { backend, failing } = fakeBackend();
  const mirror = createMirror(backend, new Map());
  const results: boolean[] = [];
  const saver = createSaver(mirror, 0, saved => results.push(saved));
  saver.schedule(defaultState());
  saver.flush();
  assert.deepEqual(results, [], 'not before the write is done');
  await mirror.flushed();
  await settle();
  failing.set = true;
  saver.schedule(defaultState());
  saver.flush();
  await mirror.flushed();
  await settle();
  assert.deepEqual(results, [true, false]);
});
