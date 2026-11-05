import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { formatAgo } from '../src/format.ts';
import { getKana } from '../src/kana.ts';
import { defaultState, recordAnswer, STATE_VERSION } from '../src/state.ts';
import type { KeyValueStorage } from '../src/store.ts';
import {
  deleteSynced,
  DEVICE_STORAGE_KEY,
  deriveKeys,
  deviceId,
  loadSyncConfig,
  MAX_ATTEMPTS,
  newSyncCode,
  open,
  parseSyncCode,
  saveSyncConfig,
  seal,
  SYNC_STORAGE_KEY,
  SyncError,
  syncOnce,
} from '../src/sync.ts';
import type { State } from '../src/types.ts';
import {
  d1Store,
  type D1Database,
  handleRequest,
  KEEP_UNUSED_MS,
  MAX_BYTES,
  memoryStore,
  type ProgressStore,
} from '../worker/sync.ts';

const NOW = new Date(2026, 0, 10, 12).getTime();
const SERVER = 'https://sync.test';
const CODE = 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01';

const answer = (state: State, kana: string, now = NOW) =>
  recordAnswer(state, { item: getKana(kana), direction: 'read', outcome: 'correct', given: 'x', ms: 900, now, run: 1 });

function serverFetch(store: ProgressStore = memoryStore(), options = { allowedOrigin: '*', maxBytes: MAX_BYTES }) {
  return (input: RequestInfo | URL, init?: RequestInit) => handleRequest(new Request(input, init), store, options, NOW);
}

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: key => void data.delete(key),
  };
}

test('sync codes are random, grouped and forgiving to type', () => {
  const code = newSyncCode();
  assert.match(code, /^([0-9A-Z]{4}-){5}[0-9A-Z]{4}$/);
  assert.notEqual(code, newSyncCode());
  assert.equal(parseSyncCode(code), code);
  assert.equal(parseSyncCode(' abcd efgh jkmn pqrs tvwx yzol '), 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01');
  assert.equal(parseSyncCode('ABCD-EFGH'), null);
  assert.equal(parseSyncCode('ABCD-EFGH-JKMN-PQRS-TVWX-YZ0U'), null);
});

test('keys come from the code: the same code gives the same place, another code another', async () => {
  const a = await deriveKeys(CODE);
  assert.match(a.id, /^[0-9a-f]{64}$/);
  assert.equal((await deriveKeys(CODE)).id, a.id);
  assert.notEqual((await deriveKeys(newSyncCode())).id, a.id);
  await assert.rejects(deriveKeys('not a code!'), SyncError);
});

test('sealed progress opens only with the right key', async () => {
  const keys = await deriveKeys(CODE);
  const state = answer(defaultState(), 'あ');
  const body = await seal({ device: 'phone', state }, keys);
  assert.ok(!new TextDecoder().decode(body).includes('あ'));
  const opened = await open(body, keys, NOW);
  assert.equal(opened.device, 'phone');
  assert.deepEqual(opened.state, state);

  await assert.rejects(open(body, await deriveKeys(newSyncCode()), NOW), SyncError);
  await assert.rejects(open(body, { ...keys, id: '0'.repeat(64) }, NOW), SyncError);
  const newer = await seal({ device: 'phone', state: { ...state, version: STATE_VERSION + 1 } }, keys);
  await assert.rejects(open(newer, keys, NOW), /newer version/);
  const broken = await seal({ device: 5, state } as unknown as Parameters<typeof seal>[0], keys);
  await assert.rejects(open(broken, keys, NOW), SyncError);
});

test('two devices end up with each other’s progress', async () => {
  const keys = await deriveKeys(CODE);
  const fetch = serverFetch();
  const { state: phone } = await syncOnce({
    server: SERVER,
    keys,
    device: 'phone',
    state: answer(defaultState(), 'あ'),
    fetch,
  });
  assert.deepEqual(Object.keys(phone.stats), ['あ']);

  const { state: laptop } = await syncOnce({
    server: `${SERVER}/`,
    keys,
    device: 'laptop',
    state: answer(defaultState(), 'い'),
    fetch,
    now: NOW,
  });
  assert.deepEqual(Object.keys(laptop.stats).sort(), ['あ', 'い']);

  const { state: phoneAgain } = await syncOnce({ server: SERVER, keys, device: 'phone', state: phone, fetch });
  assert.deepEqual(Object.keys(phoneAgain.stats).sort(), ['あ', 'い']);
  assert.equal(phoneAgain.deviceDays.laptop !== undefined, true);
});

test('an upload that loses a race starts again from the newer copy', async () => {
  const keys = await deriveKeys(CODE);
  const server = serverFetch();
  await syncOnce({ server: SERVER, keys, device: 'tablet', state: defaultState(), fetch: server });

  let raced = false;
  const racing = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PUT' && !raced) {
      raced = true;
      await syncOnce({ server: SERVER, keys, device: 'laptop', state: answer(defaultState(), 'う'), fetch: server });
    }
    return server(input, init);
  };
  const { state: phone } = await syncOnce({
    server: SERVER,
    keys,
    device: 'phone',
    state: answer(defaultState(), 'え'),
    fetch: racing,
  });
  assert.deepEqual(Object.keys(phone.stats).sort(), ['う', 'え']);

  const alwaysTaken = async (input: RequestInfo | URL, init?: RequestInit) =>
    init?.method === 'PUT' ? new Response(null, { status: 412 }) : server(input, init);
  let calls = 0;
  const counting = (input: RequestInfo | URL, init?: RequestInit) => {
    calls++;
    return alwaysTaken(input, init);
  };
  await assert.rejects(
    syncOnce({ server: SERVER, keys, device: 'phone', state: answer(defaultState(), 'お'), fetch: counting }),
    /same time/,
  );
  assert.equal(calls, MAX_ATTEMPTS * 2);
});

test('a sync with nothing new uploads nothing, and one the server has seen downloads nothing', async () => {
  const keys = await deriveKeys(CODE);
  const server = serverFetch();
  const requests: string[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await server(input, init);
    requests.push(`${init?.method ?? 'GET'} ${response.status}`);
    return response;
  };
  const options = { server: SERVER, keys, device: 'phone', fetch };
  const first = await syncOnce({ ...options, state: answer(defaultState(), 'あ') });
  assert.deepEqual(requests.splice(0), ['GET 404', 'PUT 204']);
  assert.equal(first.etag, '"1"');

  // Without its ETag this device downloads the copy, but finds it adds nothing to send back.
  const again = await syncOnce({ ...options, state: first.state });
  assert.deepEqual(requests.splice(0), ['GET 200']);
  assert.equal(again.etag, '"1"');
  assert.deepEqual(Object.keys(again.state.stats), ['あ']);

  // With its ETag and no changes, the copy isn't even sent, and the progress is handed back as it was.
  const quiet = await syncOnce({ ...options, state: first.state, etag: first.etag, changed: false });
  assert.deepEqual(requests.splice(0), ['GET 304']);
  assert.equal(quiet.state, first.state);
  assert.equal(quiet.etag, '"1"');

  // A change here goes up without downloading what this device already has.
  const changedHere = answer(first.state, 'い');
  const uploaded = await syncOnce({ ...options, state: changedHere, etag: first.etag, changed: true });
  assert.deepEqual(requests.splice(0), ['GET 304', 'PUT 204']);
  assert.equal(uploaded.etag, '"2"');

  // Another device's upload arrives in full, although nothing changed here.
  await syncOnce({ server: SERVER, keys, device: 'laptop', state: answer(defaultState(), 'う'), fetch: server });
  const news = await syncOnce({ ...options, state: uploaded.state, etag: uploaded.etag, changed: false });
  assert.deepEqual(requests.splice(0), ['GET 200']);
  assert.deepEqual(Object.keys(news.state.stats).sort(), ['あ', 'い', 'う']);
});

test('two devices with the same progress don’t keep uploading to each other', async () => {
  const keys = await deriveKeys(CODE);
  const fetch = serverFetch();
  const phone = await syncOnce({ server: SERVER, keys, device: 'phone', state: answer(defaultState(), 'あ'), fetch });
  const laptop = await syncOnce({ server: SERVER, keys, device: 'laptop', state: defaultState(), fetch });
  const puts: string[] = [];
  const watching = (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PUT') puts.push('PUT');
    return fetch(input, init);
  };
  await syncOnce({ server: SERVER, keys, device: 'phone', state: phone.state, fetch: watching });
  await syncOnce({ server: SERVER, keys, device: 'laptop', state: laptop.state, fetch: watching });
  assert.deepEqual(puts, []);
});

test('the synced copy can be deleted', async () => {
  const keys = await deriveKeys(CODE);
  const store = memoryStore();
  const fetch = serverFetch(store);
  await syncOnce({ server: SERVER, keys, device: 'phone', state: answer(defaultState(), 'あ'), fetch });
  assert.ok(await store.get(keys.id));
  await deleteSynced({ server: SERVER, keys, fetch });
  assert.equal(await store.get(keys.id), null);
  // Deleting it again changes nothing.
  await deleteSynced({ server: SERVER, keys, fetch });
  const offline = () => Promise.reject(new TypeError('Failed to fetch'));
  await assert.rejects(deleteSynced({ server: SERVER, keys, fetch: offline }), /reach the sync server/);
  const down = () => Promise.resolve(new Response(null, { status: 500 }));
  await assert.rejects(deleteSynced({ server: SERVER, keys, fetch: down }), /answered 500/);
});

test('sync failures become readable messages', async () => {
  const keys = await deriveKeys(CODE);
  const state = defaultState();
  const offline = () => Promise.reject(new TypeError('Failed to fetch'));
  await assert.rejects(syncOnce({ server: SERVER, keys, device: 'd', state, fetch: offline }), /reach the sync server/);
  const down = () => Promise.resolve(new Response(null, { status: 503 }));
  await assert.rejects(syncOnce({ server: SERVER, keys, device: 'd', state, fetch: down }), /answered 503/);
  const answering = (status: number) => () => Promise.resolve(new Response(null, { status }));
  await assert.rejects(syncOnce({ server: SERVER, keys, device: 'd', state, fetch: answering(429) }), /busy/);
  const putStatus = (status: number) => (_input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(new Response(null, { status: init?.method === 'PUT' ? status : 404 }));
  await assert.rejects(syncOnce({ server: SERVER, keys, device: 'd', state, fetch: putStatus(413) }), /too large/);
  await assert.rejects(syncOnce({ server: SERVER, keys, device: 'd', state, fetch: putStatus(507) }), /full/);
  await assert.rejects(syncOnce({ server: SERVER, keys, device: 'd', state, fetch: putStatus(500) }), /answered 500/);
});

test('the sync code and this device’s id are kept in the browser', () => {
  const storage = memoryStorage();
  assert.equal(loadSyncConfig(storage), null);
  saveSyncConfig(storage, { code: CODE, lastSync: 5 });
  assert.deepEqual(loadSyncConfig(storage), { code: CODE, lastSync: 5 });
  storage.setItem(SYNC_STORAGE_KEY, JSON.stringify({ code: CODE.toLowerCase() }));
  assert.deepEqual(loadSyncConfig(storage), { code: CODE, lastSync: 0 });
  storage.setItem(SYNC_STORAGE_KEY, JSON.stringify({ code: 'nope' }));
  assert.equal(loadSyncConfig(storage), null);
  storage.setItem(SYNC_STORAGE_KEY, '{oops');
  assert.equal(loadSyncConfig(storage), null);
  saveSyncConfig(storage, null);
  assert.equal(storage.data.has(SYNC_STORAGE_KEY), false);
  assert.equal(loadSyncConfig(null), null);

  const id = deviceId(storage);
  assert.match(id, /^[0-9a-f]{16}$/);
  assert.equal(deviceId(storage), id);
  storage.setItem(DEVICE_STORAGE_KEY, 'bad');
  assert.notEqual(deviceId(storage), 'bad');
  const blocked: KeyValueStorage = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => undefined,
  };
  assert.match(deviceId(blocked), /^[0-9a-f]{16}$/);
  assert.doesNotThrow(() => saveSyncConfig(blocked, { code: CODE, lastSync: 0 }));
});

test('formatAgo describes how long ago something happened', () => {
  assert.equal(formatAgo(10_000), 'just now');
  assert.equal(formatAgo(5 * 60_000), '5 min ago');
  assert.equal(formatAgo(3 * 3_600_000), '3 h ago');
  assert.equal(formatAgo(86_400_000), '1 day ago');
  assert.equal(formatAgo(4 * 86_400_000), '4 days ago');
});

const ID = 'a'.repeat(64);
const url = `${SERVER}/v1/progress/${ID}`;

test('the sync server stores one blob per id and refuses stale uploads', async () => {
  const fetch = serverFetch();
  assert.equal((await fetch(url)).status, 404);
  assert.equal((await fetch(url, { method: 'PUT', body: 'x' })).status, 428);
  const first = await fetch(url, { method: 'PUT', body: 'one', headers: { 'If-None-Match': '*' } });
  assert.equal(first.status, 204);
  assert.equal(first.headers.get('ETag'), '"1"');
  assert.equal((await fetch(url, { method: 'PUT', body: 'two', headers: { 'If-None-Match': '*' } })).status, 412);
  assert.equal((await fetch(url, { method: 'PUT', body: 'two', headers: { 'If-Match': '"2"' } })).status, 412);
  assert.equal((await fetch(url, { method: 'PUT', body: 'two', headers: { 'If-Match': '"1"' } })).status, 204);
  const saved = await fetch(url);
  assert.equal(saved.headers.get('ETag'), '"2"');
  assert.equal(saved.headers.get('Cache-Control'), 'no-store');
  assert.equal(await saved.text(), 'two');

  const unchanged = await fetch(url, { headers: { 'If-None-Match': '"2"' } });
  assert.equal(unchanged.status, 304);
  assert.equal(unchanged.headers.get('ETag'), '"2"');
  assert.equal((await fetch(url, { headers: { 'If-None-Match': '"1"' } })).status, 200);

  assert.equal((await fetch(url, { method: 'DELETE' })).status, 204);
  assert.equal((await fetch(url)).status, 404);
});

test('the sync server checks paths, methods and sizes', async () => {
  const fetch = serverFetch(memoryStore(), { allowedOrigin: '*', maxBytes: 4 });
  assert.equal((await fetch(`${SERVER}/v1/progress/xyz`)).status, 404);
  assert.equal((await fetch(url, { method: 'POST', body: 'x' })).status, 405);
  const put = (body: string) => fetch(url, { method: 'PUT', body, headers: { 'If-None-Match': '*' } });
  assert.equal((await put('12345')).status, 413);
  assert.equal((await put('')).status, 400);
  const streamed = new Request(url, {
    method: 'PUT',
    body: new Blob(['123456']).stream(),
    headers: { 'If-None-Match': '*' },
    duplex: 'half',
  } as RequestInit);
  assert.equal((await handleRequest(streamed, memoryStore(), { allowedOrigin: '*', maxBytes: 4 })).status, 413);
});

test('the sync server answers CORS requests from allowed origins only', async () => {
  const fetch = serverFetch(memoryStore(), { allowedOrigin: 'https://a.test, https://b.test', maxBytes: MAX_BYTES });
  const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://b.test' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://b.test');
  assert.match(preflight.headers.get('Access-Control-Allow-Headers') ?? '', /If-Match/);
  assert.equal(preflight.headers.get('Access-Control-Expose-Headers'), 'ETag');
  assert.match(preflight.headers.get('Access-Control-Allow-Methods') ?? '', /DELETE/);
  const other = await fetch(url, { headers: { Origin: 'https://evil.test' } });
  assert.equal(other.status, 403);
  assert.equal(other.headers.get('Access-Control-Allow-Origin'), null);
  const put = await fetch(url, {
    method: 'PUT',
    body: 'x',
    headers: { Origin: 'https://evil.test', 'If-None-Match': '*' },
  });
  assert.equal(put.status, 403);
  assert.equal((await fetch(url)).status, 403);
  assert.equal((await fetch(url, { headers: { Origin: 'https://a.test' } })).status, 404);
  const any = await serverFetch()(url, { headers: { Origin: 'https://evil.test' } });
  assert.equal(any.headers.get('Access-Control-Allow-Origin'), '*');
});

test('the sync server limits how much anyone can ask of it', async () => {
  const create = (id: string) =>
    new Request(`${SERVER}/v1/progress/${id.repeat(64)}`, {
      method: 'PUT',
      body: 'x',
      headers: { 'If-None-Match': '*' },
    });
  const base = { allowedOrigin: '*', maxBytes: MAX_BYTES };

  const noRequests = await handleRequest(new Request(url), memoryStore(), {
    ...base,
    allow: kind => Promise.resolve(kind !== 'request'),
  });
  assert.equal(noRequests.status, 429);
  assert.equal(noRequests.headers.get('Retry-After'), '60');

  // Only starting a new sync code counts against the second limit; a device that has one carries on.
  const store = memoryStore();
  assert.equal((await handleRequest(create('a'), store, base)).status, 204);
  const noCreating = { ...base, allow: (kind: string) => Promise.resolve(kind !== 'create') };
  assert.equal((await handleRequest(create('b'), store, noCreating)).status, 429);
  const update = new Request(url, { method: 'PUT', body: 'y', headers: { 'If-Match': '"1"' } });
  assert.equal((await handleRequest(update, store, noCreating)).status, 204);

  // A full server turns new sync codes away, and existing ones keep working.
  const full = { ...base, maxBlobs: 1 };
  assert.equal((await handleRequest(create('b'), store, full)).status, 507);
  assert.equal(await store.count(), 1);
  const updateFull = new Request(url, { method: 'PUT', body: 'z', headers: { 'If-Match': '"2"' } });
  assert.equal((await handleRequest(updateFull, store, full)).status, 204);
});

// Runs the D1 queries against SQLite, which D1 is built on.
function sqliteD1(): D1Database {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../worker/schema.sql', import.meta.url), 'utf8'));
  const statement = (query: string, values: unknown[] = []) => ({
    bind: (...next: unknown[]) => statement(query, next),
    first: <T>() => Promise.resolve((db.prepare(query).get(...(values as never[])) ?? null) as T | null),
    run: () => Promise.resolve({ meta: { changes: Number(db.prepare(query).run(...(values as never[])).changes) } }),
  });
  return { prepare: query => statement(query) };
}

for (const [name, makeStore] of [
  ['memory', memoryStore],
  ['D1', () => d1Store(sqliteD1())],
] as const) {
  test(`the ${name} store saves only over the version it was given and forgets unused progress`, async () => {
    const store = makeStore();
    const bytes = (text: string) => new TextEncoder().encode(text);
    assert.equal(await store.get(ID), null);
    assert.equal(await store.put(ID, bytes('one'), null, 1), 1);
    assert.equal(await store.put(ID, bytes('two'), null, 2), null);
    assert.equal(await store.put(ID, bytes('two'), 5, 2), null);
    assert.equal(await store.put(ID, bytes('two'), 1, 2), 2);
    const saved = await store.get(ID);
    assert.ok(saved);
    assert.equal(saved.version, 2);
    assert.equal(new TextDecoder().decode(saved.data), 'two');

    await store.put('b'.repeat(64), bytes('old'), null, 0);
    await store.deleteOlderThan(1);
    assert.equal(await store.get('b'.repeat(64)), null);
    assert.equal((await store.get(ID))?.version, 2);
    assert.ok(KEEP_UNUSED_MS > 365 * 24 * 3_600_000);

    assert.equal(await store.count(), 1);
    await store.delete(ID);
    assert.equal(await store.get(ID), null);
    assert.equal(await store.count(), 0);
  });
}
