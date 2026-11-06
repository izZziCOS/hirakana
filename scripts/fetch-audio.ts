// Fetches recorded pronunciations into vendor/audio and lists them in src/audio-data.ts. Run with
// `node scripts/fetch-audio.ts`; it needs ffmpeg and ffprobe, and network access only for what it hasn't downloaded yet.
// See vendor/audio/README.md for where the recordings come from and what is done to them.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { isGrammar, isKanji, isWord, KANA } from '../src/kana.ts';
import '../src/kanji.ts';
import type { KanaItem } from '../src/types.ts';
import { ROOT } from './site.ts';

const run = promisify(execFile);
const USER_AGENT = 'KanaDojoAudioFetch/1.0 (https://github.com/izZziCOS/hirakana)';
const CACHE = join(process.env.AUDIO_CACHE ?? tmpdir(), 'kana-dojo-audio');
const OUT = join(ROOT, 'vendor', 'audio');
const WORD_GROUPS = new Set(['words', 'sokuon', 'n5']);

const TOFUGU = 'tofugu/japanese-vocabulary-pronunciation-audio';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
// Lingua Libre speakers whose recordings are used; recordings by learners would teach the wrong sounds.
const SPEAKERS = ['Fukujinzuke', '葵心', 'CKali'];
const LICENCES = new Set(['CC0', 'CC BY 3.0', 'CC BY 4.0', 'CC BY-SA 3.0', 'CC BY-SA 4.0']);
const MIN_SECONDS = 0.1;
const MAX_SECONDS = 4;

interface Source {
  url: string;
  author: string;
  licence: string;
  page: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function get(url: string): Promise<Response> {
  for (let wait = 5000; ; wait *= 2) {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (response.ok) return response;
    if (response.status !== 429 && response.status < 500) throw new Error(`${response.status} for ${url}`);
    if (wait > 80_000) throw new Error(`${response.status} for ${url}`);
    await sleep(wait);
  }
}

const getJson = async <T>(url: string): Promise<T> => (await (await get(url)).json()) as T;

async function tofuguSources(): Promise<Map<string, Source>> {
  const tree = await getJson<{ tree: { path: string }[] }>(
    `https://api.github.com/repos/${TOFUGU}/git/trees/master?recursive=1`,
  );
  const sources = new Map<string, Source>();
  for (const { path } of tree.tree) {
    const match = /^lib\/mp3\/(.+)【(.+)】\.mp3$/.exec(path);
    if (!match) continue;
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    sources.set(`${match[1]}|${match[2]}`, {
      url: `https://raw.githubusercontent.com/${TOFUGU}/master/${encoded}`,
      author: 'Tofugu and WaniKani',
      licence: 'CC BY-SA 4.0',
      page: `https://github.com/${TOFUGU}`,
    });
  }
  return sources;
}

interface CommonsPages {
  continue?: { aicontinue: string };
  query: { allimages: { name: string }[] };
}

interface CommonsInfo {
  query: {
    pages: Record<
      string,
      {
        title: string;
        imageinfo?: { url: string; descriptionurl: string; extmetadata?: { LicenseShortName?: { value: string } } }[];
      }
    >;
  };
}

// Recordings by the chosen speakers, by what is said, the first listed speaker first.
async function linguaLibreNames(): Promise<Map<string, { title: string; speaker: string }>> {
  const names = new Map<string, { title: string; speaker: string }>();
  const found: { name: string; said: string; speaker: string }[] = [];
  let next = '';
  do {
    const page: CommonsPages = await getJson(
      `${COMMONS}?action=query&list=allimages&aiprefix=LL-Q5287_(jpn)-&ailimit=500&format=json${next}`,
    );
    for (const { name } of page.query.allimages) {
      const match = /^LL-Q5287_\(jpn\)-(.+)-([^-]+)\.wav$/.exec(name);
      if (match?.[1] && match[2] && SPEAKERS.includes(match[1])) {
        found.push({ name, speaker: match[1], said: match[2] });
      }
    }
    next = page.continue ? `&aicontinue=${encodeURIComponent(page.continue.aicontinue)}` : '';
    await sleep(1000);
  } while (next);
  found.sort((a, b) => SPEAKERS.indexOf(a.speaker) - SPEAKERS.indexOf(b.speaker));
  for (const { name, said, speaker } of found) {
    if (!names.has(said)) names.set(said, { title: `File:${name}`, speaker });
  }
  return names;
}

// Looks up the licence and address of each file. A file with any other licence isn't used.
async function commonsSources(
  wanted: { said: string; title: string; speaker: string }[],
): Promise<Map<string, Source>> {
  const sources = new Map<string, Source>();
  for (let i = 0; i < wanted.length; i += 40) {
    const batch = wanted.slice(i, i + 40);
    const titles = encodeURIComponent(batch.map(entry => entry.title).join('|'));
    const info: CommonsInfo = await getJson(
      `${COMMONS}?action=query&prop=imageinfo&iiprop=url|extmetadata&format=json&titles=${titles}`,
    );
    const byTitle = new Map(Object.values(info.query.pages).map(page => [page.title.replace(/_/g, ' '), page]));
    for (const { said, title, speaker } of batch) {
      const page = byTitle.get(title.replace(/_/g, ' '));
      const image = page?.imageinfo?.[0];
      const licence = image?.extmetadata?.LicenseShortName?.value ?? '';
      if (!image || !LICENCES.has(licence)) {
        console.warn(`Skipped ${title}: licence "${licence}"`);
        continue;
      }
      sources.set(said, { url: image.url, author: `${speaker} (Lingua Libre)`, licence, page: image.descriptionurl });
    }
    await sleep(1000);
  }
  return sources;
}

async function download(source: Source): Promise<string> {
  const stem = createHash('sha256').update(source.url).digest('hex').slice(0, 10);
  const file = join(CACHE, stem);
  if (existsSync(file)) return file;
  const response = await get(source.url);
  await writeFile(file, Buffer.from(await response.arrayBuffer()));
  await sleep(source.url.includes('wikimedia') ? 700 : 50);
  return file;
}

const seconds = async (file: string): Promise<number> => {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(stdout.trim());
};

const TRIM =
  'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,' +
  'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse';

// Trims silence, evens out the level, and makes a small mono file. Returns its name, or null if it isn't usable.
async function convert(input: string, stem: string): Promise<string | null> {
  const output = join(OUT, `${stem}.mp3`);
  const { stderr } = await run('ffmpeg', [
    '-hide_banner',
    '-i',
    input,
    '-af',
    `${TRIM},volumedetect`,
    '-f',
    'null',
    '-',
  ]);
  const peak = Number(/max_volume: (-?[\d.]+) dB/.exec(stderr)?.[1]);
  if (!Number.isFinite(peak) || peak < -40) return null;
  await run('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    input,
    '-af',
    `${TRIM},volume=${(-3 - peak).toFixed(1)}dB`,
    '-ac',
    '1',
    '-ar',
    '24000',
    '-b:a',
    '48k',
    '-map_metadata',
    '-1',
    '-id3v2_version',
    '0',
    output,
  ]);
  const length = await seconds(output);
  if (length < MIN_SECONDS || length > MAX_SECONDS) {
    await rm(output);
    return null;
  }
  return `${stem}.mp3`;
}

// Hiragana and katakana are read the same, so a kana's sound is looked up in hiragana.
const toHiragana = (kana: string): string =>
  kana.replace(/[ァ-ヶ]/g, char => String.fromCodePoint((char.codePointAt(0) ?? 0) - 0x60));

const isSingleKana = (item: KanaItem): boolean => !isWord(item) && !isKanji(item) && !isGrammar(item);

await mkdir(CACHE, { recursive: true });
await mkdir(OUT, { recursive: true });
for (const file of await readdir(OUT)) if (file.endsWith('.mp3')) await rm(join(OUT, file));

const tofugu = await tofuguSources();
const spoken = await linguaLibreNames();

const kanaItems = KANA.filter(isSingleKana);
const wordItems = KANA.filter(item => isWord(item) && WORD_GROUPS.has(item.group));
const wanted = new Map<string, { said: string; title: string; speaker: string }>();
const need = (said: string) => {
  const recording = spoken.get(said);
  if (recording) wanted.set(said, { said, ...recording });
};
kanaItems.forEach(item => {
  need(toHiragana(item.kana));
});
// Only words spelled in kana: a kanji spelling alone doesn't say which reading was recorded.
wordItems
  .filter(item => !item.kanji && !tofugu.has(`${item.kana}|${item.kana}`))
  .forEach(item => {
    need(item.kana);
  });
const commons = await commonsSources([...wanted.values()]);

const sourceOf = (item: KanaItem): Source | undefined => {
  if (isSingleKana(item)) return commons.get(toHiragana(item.kana));
  return tofugu.get(`${item.kanji ?? item.kana}|${item.kana}`) ?? (item.kanji ? undefined : commons.get(item.kana));
};

const recordings: Record<string, string> = {};
const converted = new Map<string, string | null>();
const rows: string[] = [];
const missing: string[] = [];
for (const item of [...kanaItems, ...wordItems]) {
  const source = sourceOf(item);
  if (!source) {
    missing.push(item.id);
    continue;
  }
  const stem = createHash('sha256').update(source.url).digest('hex').slice(0, 10);
  if (!converted.has(stem)) {
    const name = await convert(await download(source), stem);
    converted.set(stem, name);
    if (name) rows.push([name, source.author, source.licence, source.page, source.url].join('\t'));
    else console.warn(`Rejected ${source.url}`);
  }
  if (converted.get(stem)) recordings[item.id] = stem;
  else missing.push(item.id);
}

await writeFile(join(OUT, 'SOURCES.tsv'), `file\tauthor\tlicence\tpage\tsource\n${rows.sort().join('\n')}\n`);
const entries = Object.entries(recordings)
  .map(([id, stem]) => `  ${JSON.stringify(id)}: '${stem}',`)
  .join('\n');
await writeFile(
  join(ROOT, 'src', 'audio-data.ts'),
  `// Generated by scripts/fetch-audio.ts: the recording of each card that has one, by card id.\nexport const RECORDINGS: Record<string, string> = {\n${entries}\n};\n`,
);

const covered = (items: KanaItem[]) => `${items.filter(item => recordings[item.id]).length} of ${items.length}`;
console.log(`Files: ${String(rows.length)}`);
console.log(`Kana: ${covered(kanaItems)}`);
for (const group of WORD_GROUPS) console.log(`${group}: ${covered(wordItems.filter(item => item.group === group))}`);
console.log(`Without a recording: ${missing.join(' ')}`);
