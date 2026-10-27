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
const PAGE = 'index.html';

worker.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(__PRECACHE__))
      .then(() => worker.skipWaiting()),
  );
});

worker.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key))),
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

async function fromCacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

worker.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== worker.location.origin) return;
  event.respondWith(request.mode === 'navigate' ? fromNetworkFirst(request) : fromCacheFirst(request));
});
