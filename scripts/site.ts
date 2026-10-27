import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { build, type Metafile } from 'esbuild';

export const ROOT = resolve(import.meta.dirname, '..');
export const OUT = join(ROOT, 'dist');
export const WATCH_PATHS = ['src', 'styles', 'public', 'vendor', 'index.html'].map(path => join(ROOT, path));

const FONT_PACKAGE = join(ROOT, 'node_modules/@fontsource/klee-one');
const PLACEHOLDERS = {
  boot: 'src="boot.js"',
  script: 'src="main.js"',
  style: 'href="styles.css"',
  fonts: 'href="fonts.css"',
};

interface BuildOptions {
  dev?: boolean;
}

const shortHash = (content: string | Buffer): string =>
  createHash('sha256').update(content).digest('hex').slice(0, 8).toUpperCase();

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries.filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name));
}

function outputFor(metafile: Metafile | undefined, entry: string): string {
  const match = Object.entries(metafile?.outputs ?? {}).find(([, output]) => output.entryPoint === entry);
  if (!match) throw new Error(`No build output for ${entry}`);
  return basename(match[0]);
}

async function usedCodePoints(): Promise<Set<number>> {
  const sources = [join(ROOT, 'index.html'), ...(await listFiles(join(ROOT, 'src')))];
  const text = (await Promise.all(sources.map(file => readFile(file, 'utf8')))).join('');
  return new Set(Array.from(text, char => char.codePointAt(0) ?? 0).filter(point => point > 0x7f));
}

function parseUnicodeRange(range: string): [number, number][] {
  return range.split(',').map(part => {
    const [start = '0', end] = part.trim().replace(/^U\+/i, '').split('-');
    if (start.includes('?')) {
      return [parseInt(start.replace(/\?/g, '0'), 16), parseInt(start.replace(/\?/g, 'f'), 16)];
    }
    return [parseInt(start, 16), parseInt(end ?? start, 16)];
  });
}

async function buildFonts(): Promise<string> {
  const css = await readFile(join(FONT_PACKAGE, '600.css'), 'utf8');
  const needed = await usedCodePoints();
  const faces = css.match(/@font-face\s*{[^}]*}/g) ?? [];
  const kept = faces.flatMap(face => {
    const range = /unicode-range:\s*([^;]+);/.exec(face)?.[1];
    const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(face)?.[1];
    if (!range || !file) return [];
    const ranges = parseUnicodeRange(range);
    const covers = [...needed].some(point => ranges.some(([start, end]) => point >= start && point <= end));
    if (!covers) return [];
    return [{ file, range }];
  });

  await mkdir(join(OUT, 'fonts'), { recursive: true });
  await Promise.all(kept.map(({ file }) => cp(join(FONT_PACKAGE, 'files', file), join(OUT, 'fonts', file))));
  const output = kept
    .map(
      ({ file, range }) => `@font-face {
  font-family: 'Klee One';
  font-style: normal;
  font-display: swap;
  font-weight: 600;
  src: url('fonts/${file}') format('woff2');
  unicode-range: ${range};
}`,
    )
    .join('\n');
  const name = `fonts-${shortHash(output)}.css`;
  await writeFile(join(OUT, name), output);
  return name;
}

// Kana stroke files (U+30xx) are precached; the ~2,200 kanji files are cached the first time each is opened, in a
// cache of their own that survives app updates (see src/sw.ts).
const precached = (file: string): boolean =>
  !file.endsWith('.map') && (!file.startsWith('kanjivg/') || file.startsWith('kanjivg/030'));

// Progress sync is offered when the site is built with the URL of a sync server (see worker/README.md).
const SYNC_URL = process.env.SYNC_URL?.trim() ?? '';
if (SYNC_URL && !/^https?:\/\//.test(SYNC_URL)) throw new Error(`SYNC_URL must be an http(s) URL, not ${SYNC_URL}`);

async function buildServiceWorker(): Promise<void> {
  const files = (await listFiles(OUT))
    .map(file => relative(OUT, file).split('\\').join('/'))
    .filter(precached)
    .sort();
  const version = shortHash(files.join('\n') + (await readFile(join(OUT, 'index.html'), 'utf8')));
  await build({
    absWorkingDir: ROOT,
    entryPoints: ['src/sw.ts'],
    outfile: join(OUT, 'sw.js'),
    bundle: true,
    format: 'iife',
    target: 'es2022',
    minify: true,
    define: { __PRECACHE__: JSON.stringify(['./', ...files]), __VERSION__: JSON.stringify(version) },
    logLevel: 'warning',
  });
}

export async function buildSite({ dev = false }: BuildOptions = {}): Promise<string[]> {
  await rm(OUT, { recursive: true, force: true });

  const shared = {
    absWorkingDir: ROOT,
    outdir: OUT,
    entryNames: '[name]-[hash]',
    bundle: true,
    target: 'es2022',
    minify: !dev,
    sourcemap: true,
    metafile: true,
    logLevel: 'warning' as const,
    define: { __DEV__: JSON.stringify(dev), __SYNC_URL__: JSON.stringify(SYNC_URL) },
  };
  const app = await build({
    ...shared,
    entryPoints: { main: 'src/main.ts', styles: 'styles/index.css' },
    format: 'esm',
  });
  const boot = await build({ ...shared, entryPoints: { boot: 'src/boot.ts' }, format: 'iife' });
  const fonts = await buildFonts();

  await cp(join(ROOT, 'public'), OUT, { recursive: true });
  await cp(join(ROOT, 'vendor', 'kanjivg'), join(OUT, 'kanjivg'), {
    recursive: true,
    filter: source => !source.endsWith('.md'),
  });

  const assets = {
    boot: outputFor(boot.metafile, 'src/boot.ts'),
    script: outputFor(app.metafile, 'src/main.ts'),
    style: outputFor(app.metafile, 'styles/index.css'),
    fonts,
  };
  let page = await readFile(join(ROOT, 'index.html'), 'utf8');
  for (const [key, placeholder] of Object.entries(PLACEHOLDERS) as [keyof typeof PLACEHOLDERS, string][]) {
    if (!page.includes(placeholder)) throw new Error(`index.html is missing ${placeholder}`);
    page = page.replace(placeholder, placeholder.replace(/"[^"]+"/, `"${assets[key]}"`));
  }
  if (SYNC_URL) page = page.replace("connect-src 'self'", `connect-src 'self' ${new URL(SYNC_URL).origin}`);
  await writeFile(join(OUT, 'index.html'), page);

  if (!dev) await buildServiceWorker();
  return Object.values(assets);
}
