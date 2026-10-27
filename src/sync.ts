import { mergeStates } from './merge.ts';
import { migrateState, STATE_VERSION } from './state.ts';
import type { KeyValueStorage } from './store.ts';
import type { State } from './types.ts';
import { isObject } from './util.ts';

// Progress is synced through a small server that only ever sees encrypted data. A sync code, shared between devices,
// gives both the place the data is kept (a hash of the code) and the key it is encrypted with.

export const SYNC_STORAGE_KEY = 'kana-dojo-sync';
// Kept even when sync is turned off: this device's day log is filed under it on the server.
export const DEVICE_STORAGE_KEY = 'kana-dojo-device';
export const MAX_ATTEMPTS = 3;
const CODE_BYTES = 15;
const CODE_GROUP = 4;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LOOKALIKES: Record<string, string> = { I: '1', L: '1', O: '0' };
const encoder = new TextEncoder();

export interface SyncConfig {
  code: string;
  lastSync: number;
}

export interface SyncKeys {
  id: string;
  key: CryptoKey;
}

interface SyncPayload {
  device: string;
  state: State;
}

export class SyncError extends Error {}

const hex = (bytes: Uint8Array): string => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');

function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  return out;
}

function fromBase32(text: string): Uint8Array<ArrayBuffer> | null {
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of text) {
    const digit = ALPHABET.indexOf(char);
    if (digit === -1) return null;
    value = ((value << 5) | digit) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

const group = (code: string): string => code.match(new RegExp(`.{1,${CODE_GROUP}}`, 'g'))?.join('-') ?? code;

export const newSyncCode = (): string => group(toBase32(crypto.getRandomValues(new Uint8Array(CODE_BYTES))));

export function deviceId(storage: KeyValueStorage | null): string {
  try {
    const saved = storage?.getItem(DEVICE_STORAGE_KEY);
    if (saved && /^[0-9a-f]{16}$/.test(saved)) return saved;
  } catch {
    // A new id is used below.
  }
  const id = hex(crypto.getRandomValues(new Uint8Array(8)));
  try {
    storage?.setItem(DEVICE_STORAGE_KEY, id);
  } catch {
    // Without storage the id lasts until the page is closed.
  }
  return id;
}

// Accepts a code typed with spaces, dashes, lower case or easily confused letters; returns it in its usual form.
export function parseSyncCode(text: string): string | null {
  const clean = text
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[ILO]/g, char => LOOKALIKES[char] ?? char);
  if (clean.length !== Math.ceil((CODE_BYTES * 8) / 5) || fromBase32(clean)?.length !== CODE_BYTES) return null;
  return group(clean);
}

export async function deriveKeys(code: string): Promise<SyncKeys> {
  const bytes = fromBase32(code.replace(/-/g, ''));
  if (!bytes) throw new SyncError('That sync code isn’t valid.');
  const secret = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveBits', 'deriveKey']);
  const params = (info: string) => ({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: new Uint8Array(),
    info: encoder.encode(info),
  });
  const id = new Uint8Array(await crypto.subtle.deriveBits(params('kana-dojo sync id'), secret, 256));
  const key = await crypto.subtle.deriveKey(
    params('kana-dojo sync key'),
    secret,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { id: hex(id), key };
}

const gzip = (bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<ArrayBuffer> =>
  new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer();

export async function seal(payload: SyncPayload, { id, key }: SyncKeys): Promise<Uint8Array<ArrayBuffer>> {
  const packed = await gzip(encoder.encode(JSON.stringify(payload)), new CompressionStream('gzip'));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(id) }, key, packed);
  const body = new Uint8Array(iv.length + sealed.byteLength);
  body.set(iv);
  body.set(new Uint8Array(sealed), iv.length);
  return body;
}

export async function open(
  body: Uint8Array<ArrayBuffer>,
  { id, key }: SyncKeys,
  now = Date.now(),
): Promise<SyncPayload> {
  let raw: unknown;
  try {
    const packed = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: body.slice(0, 12), additionalData: encoder.encode(id) },
      key,
      body.slice(12),
    );
    raw = JSON.parse(new TextDecoder().decode(await gzip(new Uint8Array(packed), new DecompressionStream('gzip'))));
  } catch {
    throw new SyncError('The synced progress couldn’t be read.');
  }
  if (!isObject(raw) || typeof raw.device !== 'string' || !isObject(raw.state)) {
    throw new SyncError('The synced progress couldn’t be read.');
  }
  if (typeof raw.state.version === 'number' && raw.state.version > STATE_VERSION) {
    throw new SyncError('Another device uses a newer version of Kana Dojo. Reload to update this one.');
  }
  return { device: raw.device, state: migrateState(raw.state, now) };
}

interface SyncOptions {
  server: string;
  keys: SyncKeys;
  device: string;
  state: State;
  fetch?: typeof fetch;
  now?: number;
}

// Downloads the synced copy, merges it with this device's progress and uploads the result. If another device uploads
// in between, the server turns the upload down and it starts again.
export async function syncOnce({
  server,
  keys,
  device,
  state,
  fetch: request = fetch,
  now = Date.now(),
}: SyncOptions): Promise<State> {
  const url = `${server.replace(/\/$/, '')}/v1/progress/${keys.id}`;
  const send = async (init?: RequestInit): Promise<Response> => {
    try {
      return await request(url, { cache: 'no-store', ...init });
    } catch {
      throw new SyncError('Couldn’t reach the sync server. Check your connection.');
    }
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const current = await send();
    if (!current.ok && current.status !== 404) throw new SyncError(`The sync server answered ${current.status}.`);
    const etag = current.ok ? current.headers.get('ETag') : null;
    const remote = current.ok ? await open(new Uint8Array(await current.arrayBuffer()), keys, now) : null;
    const merged = remote ? mergeStates(state, device, remote.state, remote.device) : state;

    const body = await seal({ device, state: merged }, keys);
    const saved = await send({
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        ...(etag ? { 'If-Match': etag } : { 'If-None-Match': '*' }),
      },
      body,
    });
    if (saved.ok) return merged;
    if (saved.status === 413) throw new SyncError('Your progress is too large for the sync server.');
    if (saved.status !== 412) throw new SyncError(`The sync server answered ${saved.status}.`);
  }
  throw new SyncError('Another device kept syncing at the same time. Try again in a moment.');
}

export function loadSyncConfig(storage: KeyValueStorage | null): SyncConfig | null {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(SYNC_STORAGE_KEY) ?? 'null');
    const code = isObject(raw) && typeof raw.code === 'string' ? parseSyncCode(raw.code) : null;
    if (!isObject(raw) || !code) return null;
    return { code, lastSync: typeof raw.lastSync === 'number' ? raw.lastSync : 0 };
  } catch {
    return null;
  }
}

export function saveSyncConfig(storage: KeyValueStorage | null, config: SyncConfig | null): void {
  try {
    if (config) storage?.setItem(SYNC_STORAGE_KEY, JSON.stringify(config));
    else storage?.removeItem(SYNC_STORAGE_KEY);
  } catch {
    return;
  }
}
