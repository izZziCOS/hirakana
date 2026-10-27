// Kana Dojo sync server: a Cloudflare Worker that keeps one encrypted blob per sync code in D1. It never sees the code
// or the progress itself, only a hash of the code and data the browser has already encrypted.

export interface StoredProgress {
  version: number;
  data: Uint8Array<ArrayBuffer>;
}

export interface ProgressStore {
  get(id: string): Promise<StoredProgress | null>;
  // Saves only if the stored version is still `expected` (null: only if nothing is stored yet). Returns the new
  // version, or null if another device saved first.
  put(id: string, data: Uint8Array<ArrayBuffer>, expected: number | null, now: number): Promise<number | null>;
  deleteOlderThan(time: number): Promise<void>;
}

export interface SyncServerOptions {
  // Comma-separated origins allowed to call the server, or "*".
  allowedOrigin: string;
  maxBytes: number;
}

// D1 rows can be at most 2,000,000 bytes, so this leaves room for the id and the other columns.
export const MAX_BYTES = 1_900_000;
export const KEEP_UNUSED_MS = 400 * 24 * 60 * 60 * 1000;
const PATH = /^\/v1\/progress\/([0-9a-f]{64})$/;

function corsHeaders(request: Request, allowedOrigin: string): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = allowedOrigin.split(',').map(entry => entry.trim());
  const allow = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : '';
  if (!allow) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, If-Match, If-None-Match',
    'Access-Control-Expose-Headers': 'ETag',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const etagOf = (version: number): string => `"${version}"`;

function expectedVersion(request: Request): number | null | undefined {
  if (request.headers.get('If-None-Match') === '*') return null;
  const match = /^"(\d+)"$/.exec(request.headers.get('If-Match') ?? '');
  return match ? Number(match[1]) : undefined;
}

export async function handleRequest(
  request: Request,
  store: ProgressStore,
  { allowedOrigin, maxBytes }: SyncServerOptions,
  now = Date.now(),
): Promise<Response> {
  const cors = corsHeaders(request, allowedOrigin);
  const reply = (status: number, body: BodyInit | null = null, headers: Record<string, string> = {}) =>
    new Response(body, { status, headers: { ...cors, 'Cache-Control': 'no-store', ...headers } });

  if (request.method === 'OPTIONS') return reply(204);
  const id = PATH.exec(new URL(request.url).pathname)?.[1];
  if (!id) return reply(404);

  if (request.method === 'GET') {
    const saved = await store.get(id);
    if (!saved) return reply(404);
    return reply(200, saved.data, { 'Content-Type': 'application/octet-stream', ETag: etagOf(saved.version) });
  }

  if (request.method === 'PUT') {
    const expected = expectedVersion(request);
    if (expected === undefined) return reply(428);
    if (Number(request.headers.get('Content-Length') ?? 0) > maxBytes) return reply(413);
    const data = new Uint8Array(await request.arrayBuffer());
    if (data.byteLength > maxBytes) return reply(413);
    if (!data.byteLength) return reply(400);
    const version = await store.put(id, data, expected, now);
    return version === null ? reply(412) : reply(204, null, { ETag: etagOf(version) });
  }

  return reply(405, null, { Allow: 'GET, PUT, OPTIONS' });
}

export function memoryStore(): ProgressStore {
  const rows = new Map<string, StoredProgress & { updatedAt: number }>();
  return {
    get: id => {
      const row = rows.get(id);
      return Promise.resolve(row ? { version: row.version, data: row.data } : null);
    },
    put: (id, data, expected, now) => {
      const version = rows.get(id)?.version ?? null;
      if (version !== expected) return Promise.resolve(null);
      const next = (version ?? 0) + 1;
      rows.set(id, { version: next, data, updatedAt: now });
      return Promise.resolve(next);
    },
    deleteOlderThan: time => {
      rows.forEach((row, id) => {
        if (row.updatedAt < time) rows.delete(id);
      });
      return Promise.resolve();
    },
  };
}

// The parts of Cloudflare's D1 API this uses.
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface D1Database {
  prepare(query: string): D1Statement;
}

export function d1Store(db: D1Database): ProgressStore {
  return {
    async get(id) {
      const row = await db
        .prepare('SELECT version, data FROM progress WHERE id = ?')
        .bind(id)
        .first<{ version: number; data: ArrayBuffer | number[] }>();
      return row ? { version: row.version, data: new Uint8Array(row.data) } : null;
    },
    async put(id, data, expected, now) {
      const result =
        expected === null
          ? await db
              .prepare(
                'INSERT INTO progress (id, version, data, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT(id) DO NOTHING',
              )
              .bind(id, data, now)
              .run()
          : await db
              .prepare(
                'UPDATE progress SET version = version + 1, data = ?, updated_at = ? WHERE id = ? AND version = ?',
              )
              .bind(data, now, id, expected)
              .run();
      return result.meta.changes === 1 ? (expected ?? 0) + 1 : null;
    },
    async deleteOlderThan(time) {
      await db.prepare('DELETE FROM progress WHERE updated_at < ?').bind(time).run();
    },
  };
}

interface Env {
  DB: D1Database;
  ALLOWED_ORIGIN?: string;
}

export default {
  fetch: (request: Request, env: Env): Promise<Response> =>
    handleRequest(request, d1Store(env.DB), { allowedOrigin: env.ALLOWED_ORIGIN ?? '*', maxBytes: MAX_BYTES }),
  // Runs daily (see wrangler.toml) and removes progress no device has synced for over a year.
  scheduled: (_event: unknown, env: Env): Promise<void> => d1Store(env.DB).deleteOlderThan(Date.now() - KEEP_UNUSED_MS),
};
