import { access, mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { join, resolve } from 'node:path';
import { isWord, KANA } from '../src/kana.ts';
import { codePoints } from '../src/util.ts';
import { KANJIVG_VERSION, kanjivgFile } from '../src/ui/kanjivg.ts';

const OUT = resolve(import.meta.dirname, '..', 'vendor', 'kanjivg');
const BASE = `https://raw.githubusercontent.com/KanjiVG/kanjivg/${KANJIVG_VERSION}/kanji`;

const chars = [...new Set(KANA.filter(item => !isWord(item)).flatMap(item => codePoints(item.kana)))].sort();
await mkdir(OUT, { recursive: true });

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

async function download(char: string, file: string): Promise<string | null> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`${BASE}/${file}`);
    if (response.ok) return response.text();
    if (response.status === 404) return null;
    if (attempt === 5) throw new Error(`${char} (${file}): HTTP ${response.status}`);
    await sleep(attempt * 2000);
  }
}

const missing: string[] = [];
for (const char of chars) {
  const file = kanjivgFile(char);
  if (await exists(join(OUT, file))) continue;
  const svg = await download(char, file);
  if (svg === null) missing.push(char);
  else await writeFile(join(OUT, file), svg);
}

console.log(`Saved ${chars.length - missing.length} KanjiVG files from ${KANJIVG_VERSION} to vendor/kanjivg/`);
if (missing.length) console.log(`Not in KanjiVG: ${missing.join(' ')}`);
