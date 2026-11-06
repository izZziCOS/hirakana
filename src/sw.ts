import { KANJIVG_PATH, KANJIVG_VERSION } from './ui/kanjivg.ts';

interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface FetchEvent extends ExtendableEvent {
  readonly request: Request;
  respondWith(response: Promise<Response>): void;
}

interface WorkerScope {
  addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEvent) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void;
  skipWaiting(): Promise<void>;
  readonly clients: { claim(): Promise<void> };
  readonly location: Location;
}

const worker = self as unknown as WorkerScope;
const CACHE_PREFIX = 'kana-dojo-';
const CACHE = `${CACHE_PREFIX}${__VERSION__}`;
// Kanji stroke files only change with the KanjiVG release, so they keep their own cache across app updates.
const STROKES = `${CACHE_PREFIX}strokes-${KANJIVG_VERSION}`;
const STROKES_URL = new URL(`${KANJIVG_PATH}/`, worker.location.href).href;
// Fonts rarely change and are most of the download, so an app update doesn't fetch them again.
const FONTS = `${CACHE_PREFIX}fonts-${__FONTS_VERSION__}`;
const FONTS_URL = new URL('fonts/', worker.location.href).href;
// So are the recordings, which are needed offline as soon as a card comes up.
const AUDIO = `${CACHE_PREFIX}audio-${__AUDIO_VERSION__}`;
const AUDIO_URL = new URL('audio/', worker.location.href).href;
const PAGE = 'index.html';

async function precacheKept(store: string, files: string[]): Promise<void> {
  const cache = await caches.open(store);
  const held = await Promise.all(files.map(file => cache.match(file)));
  await cache.addAll(files.filter((_, i) => !held[i]));
}

worker.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE).then(cache => cache.addAll(__PRECACHE__)),
      precacheKept(FONTS, __FONTS__),
      precacheKept(AUDIO, __AUDIO__),
    ]).then(() => worker.skipWaiting()),
  );
});

worker.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key.startsWith(CACHE_PREFIX) && ![CACHE, STROKES, FONTS, AUDIO].includes(key))
            .map(key => caches.delete(key)),
        ),
      )
      .then(() => worker.clients.claim()),
  );
});

async function fromNetworkFirst(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(PAGE, response.clone());
    return response;
  } catch {
    return (await cache.match(PAGE)) ?? Response.error();
  }
}

// Kana stroke files are precached in the app cache; everything else fetched later goes into `store`.
async function fromCacheFirst(request: Request, store: string): Promise<Response> {
  const cache = await caches.open(store);
  const cached =
    (await cache.match(request)) ??
    (store === CACHE ? undefined : await caches.open(CACHE).then(app => app.match(request)));
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

worker.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== worker.location.origin) return;
  if (request.mode === 'navigate') event.respondWith(fromNetworkFirst(request));
  else if (request.url.startsWith(FONTS_URL)) event.respondWith(fromCacheFirst(request, FONTS));
  else if (request.url.startsWith(AUDIO_URL)) event.respondWith(fromCacheFirst(request, AUDIO));
  else event.respondWith(fromCacheFirst(request, request.url.startsWith(STROKES_URL) ? STROKES : CACHE));
});
