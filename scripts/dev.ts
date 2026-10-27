import { watch } from 'node:fs';
import { startServer } from './server.ts';
import { buildSite, OUT, WATCH_PATHS } from './site.ts';

const port = Number(process.env.PORT ?? 8000);
const DEBOUNCE_MS = 80;

await buildSite({ dev: true });
const server = startServer({ root: OUT, port, liveReload: true });
console.log(`Kana Dojo dev server at http://localhost:${port} (rebuilds and reloads on change)`);

let timer: ReturnType<typeof setTimeout> | undefined;
let building = Promise.resolve();

function rebuild(): void {
  building = building.then(async () => {
    const started = performance.now();
    try {
      await buildSite({ dev: true });
      console.log(`Rebuilt in ${Math.round(performance.now() - started)} ms`);
      server.reload();
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  });
}

WATCH_PATHS.forEach(path => {
  watch(path, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, DEBOUNCE_MS);
  });
});
