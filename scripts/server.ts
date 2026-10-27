import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
const REVALIDATE = new Set(['.html', '.webmanifest']);
const RELOAD_SCRIPT = `new EventSource('/__dev/events').addEventListener('reload', () => location.reload());`;

export interface StaticServer {
  server: Server;
  reload(): void;
}

interface ServerOptions {
  root: string;
  port: number;
  liveReload?: boolean;
}

export function startServer({ root, port, liveReload = false }: ServerOptions): StaticServer {
  const listeners = new Set<ServerResponse>();

  function cacheControl(file: string): string {
    if (liveReload || REVALIDATE.has(extname(file)) || file.endsWith(`${sep}sw.js`)) return 'no-cache';
    return 'public, max-age=31536000, immutable';
  }

  async function serveFile(file: string, response: ServerResponse): Promise<void> {
    const headers = {
      'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': cacheControl(file),
    };
    if (liveReload && extname(file) === '.html') {
      const page = (await readFile(file, 'utf8')).replace('</body>', '<script src="/__dev/reload.js"></script></body>');
      response.writeHead(200, headers).end(page);
      return;
    }
    response.writeHead(200, headers);
    createReadStream(file).pipe(response);
  }

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    if (liveReload && pathname === '/__dev/reload.js') {
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.js'] ?? '' }).end(RELOAD_SCRIPT);
      return;
    }
    if (liveReload && pathname === '/__dev/events') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      listeners.add(response);
      request.on('close', () => listeners.delete(response));
      return;
    }
    const file = join(root, normalize(pathname.endsWith('/') ? `${pathname}index.html` : pathname));
    try {
      if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) throw new Error('Not found');
      await serveFile(file, response);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    }
  }

  const server = createServer((request, response) => {
    void handle(request, response);
  }).listen(port);

  return {
    server,
    reload() {
      listeners.forEach(listener => listener.write('event: reload\ndata: now\n\n'));
    },
  };
}
