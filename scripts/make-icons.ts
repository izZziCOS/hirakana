import { chromium } from '@playwright/test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'public', 'icons');
const FONT_CSS = pathToFileURL(join(ROOT, 'node_modules/@fontsource/klee-one/600.css')).href;
const ACCENT = '#c8402c';

const ICONS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
  { file: 'favicon-32.png', size: 32, maskable: false },
];

const page = (size: number, maskable: boolean) => `<!doctype html>
<link rel="stylesheet" href="${FONT_CSS}">
<style>
  html, body { margin: 0; background: transparent; }
  .icon {
    width: ${size}px; height: ${size}px; display: grid; place-items: center;
    background: ${ACCENT}; border-radius: ${maskable ? 0 : size * 0.22}px;
    color: #fff; font: 600 ${size * (maskable ? 0.3 : 0.38)}px 'Klee One'; letter-spacing: -0.04em;
  }
</style>
<div class="icon">かな</div>`;

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const tab = await browser.newPage({ deviceScaleFactor: 1 });
const scratch = join(tmpdir(), 'kana-dojo-icon.html');
for (const { file, size, maskable } of ICONS) {
  await writeFile(scratch, page(size, maskable));
  await tab.goto(pathToFileURL(scratch).href);
  await tab.evaluate(() => document.fonts.ready);
  await tab.locator('.icon').screenshot({ path: join(OUT, file), omitBackground: true });
}
await browser.close();
await rm(scratch);
console.log(`Wrote ${ICONS.length} icons to public/icons/`);
