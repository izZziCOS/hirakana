# Kana Dojo

A hiragana, katakana and JLPT kanji trainer that runs entirely in the browser. It uses spaced repetition, works offline once it has
loaded, and keeps progress in the browser with no backend.

- **Home screen:** a "Today" panel with the reviews due and new cards left and one Continue button, three tracks
  (Kana, Vocabulary, Kanji) whose sets and rows you switch on and off, and the practice modes grouped into Recognise,
  Produce and Compare. Daily limits, the session goal, the speed check and introductions live in a Settings dialog.
- **Six directions:** read (あ → ka, 水 → sui or mizu), recall (ka → あ, picked from four options or typed), match (あ ↔ ア),
  listen (hear a kana or a word, then pick or type it), meaning (水 → water, for kanji) and write (ka or "water" → draw
  it, checked stroke by stroke; up to one retried stroke in four still passes). Each has its own review schedule.
  Listening uses the browser's Japanese voice and is only offered when one exists. **Mixed** practice brings due
  cards from every direction you use into one session; new characters are learned by reading first, and the other
  directions open up once a character can be read.
- **Character sets:** basic kana, dakuten, combinations (きゃ), small っ and long ー, loanword katakana (ファ), ~90 everyday
  words, and JLPT vocabulary for every level (~90 N5 words, 50–65 each for N4–N1, shown with their kanji). Practise
  whole sets or individual rows.
- **Kanji:** all ~2,200 JLPT kanji (N5 79, N4 166, N3 367, N2 367, N1 1,232) in rows of 30, most frequent first. Read
  accepts any on or kun reading; the info panel lists the readings, meanings, stroke count, stroke order and the
  vocabulary words that use the kanji, which can be drilled together. It also shows the parts a kanji is built from
  (語 = 言 + 吾, from KanjiVG) and other kanji that share them. New words whose kanji you already know come first.
- **Two stages for kanji and words written in kanji:** the reading is shown under the kanji until it is mastered, then
  hidden; a miss or a peek brings it back. The card says when either happens.
- **Learning new characters:** a character seen for the first time is introduced with its reading, sound, stroke order
  and example before it is tested, a minute later (can be turned off in Settings). After a mix-up, both characters
  come back within the next few cards to tell them apart.
- **Spaced repetition** with 11 steps from 1 minute to 8 months. Slow answers don't advance a card; the time limit adapts
  to your own pace and can be switched off. Peeking moves a card back two steps. A daily limit on new characters leads to
  a "Done for today" screen.
- **Typing help:** an on-screen kana keyboard for recall and listening, "I made a typo" after a wrong typed answer, and
  undo for the last answer.
- **Info panel:** animated stroke order, handwriting practice that checks each stroke, origin kanji, example word,
  look-alikes and your own record.
- **Progress:** mastery grid, 7-day review forecast, activity calendar (select a day to see its mistakes), a weekly
  accuracy chart, the share of answers remembered per set, and the words you can already read with the kana you know.
  Milestones mark a whole set mastered and new numbers of readable words.
- **Mistakes:** history, most-missed characters and mixed-up pairs (シ ⇄ ツ), each of which can be drilled.
- **Sync:** optional, end-to-end encrypted sync between devices with a sync code or link, through a small server you
  deploy yourself (see [worker/README.md](worker/README.md)).
- **Other:** session goal, light/dark/system theme, export and import of progress with a backup reminder, installable
  as an app.

## Getting started

Requires **Node 22.18 or newer**; the scripts and tests run TypeScript directly with Node's type stripping.

```sh
npm install
npm run dev        # http://localhost:8000, rebuilds and reloads the page on every change
npm start          # production build, served at http://localhost:8000
```

The site is built from `index.html`, `styles/`, `src/`, `public/` and `vendor/` into `dist/`. Opening `index.html`
straight from disk doesn't work.

## Scripts

| Command                 | What it does                                                                     |
| ----------------------- | -------------------------------------------------------------------------------- |
| `npm run dev`           | Development build with live reload; no minification and no service worker        |
| `npm start`             | Production build, then a static server on `PORT` (default 8000)                  |
| `npm run build`         | Production build into `dist/`                                                    |
| `npm test`              | Unit tests (`node:test`, no browser)                                             |
| `npm run test:coverage` | Unit tests with coverage; fails below 95% lines, 90% branches, 95% functions     |
| `npm run test:e2e`      | Playwright tests on desktop and mobile Chrome, including axe accessibility scans |
| `npm run typecheck`     | `tsc` in strict mode, including `noUncheckedIndexedAccess`                       |
| `npm run lint`          | ESLint (strict, type-aware) and stylelint                                        |
| `npm run format`        | Prettier                                                                         |
| `npm run check`         | Type check, lint, formatting check and unit tests with coverage                  |

The first time you run the browser tests, install Chromium for Playwright with `npx playwright install chromium`.

## Project structure

```
index.html               Page template; the build fills in the hashed asset names
styles/                  One CSS file per screen; index.css imports them in order, tokens.css holds the colours
public/                  Copied as-is: web app manifest, icons and the two background photos
vendor/kanjivg/          Stroke data for every character the app uses (see its README)
src/
  data.ts                All kana, words, examples, notes and look-alike groups
  kanji-data.ts          Generated JLPT kanji list (readings, meanings); refresh with node scripts/fetch-kanji.ts
  kanji-parts.ts         Generated parts of each kanji from KanjiVG; refresh with node scripts/make-kanji-parts.ts
  kanji.ts               Adds the kanji to the item lists; loaded on demand through kanji-loader.ts
  reading.ts             Which words the learner can read with the characters they know
  milestones.ts          Recall rates per set and milestones after an answer
  kana.ts                Builds the kana, word and kanji items, romaji and answer lookups from the data
  schedule.ts            Spaced repetition and answer timing
  choices.ts             Multiple-choice options and answer checking
  days.ts                Daily log, streaks, forecast and chart data
  mistakes.ts            Most-missed, mixed-up pairs and per-day filtering
  handwriting.ts         Compares a drawn stroke with the expected one
  state.ts               Saved state: defaults, migrations, import/export, update functions
  merge.ts               Combines progress from two devices
  sync.ts                Sync codes, encryption and the download-merge-upload round trip
  session.ts             Per-visit state: current card, drills, undo, typos, goal, "done for today"
  store.ts               A small store with batched saving to localStorage
  boot.ts                Runs before the app: applies the saved theme and shows an error if loading fails
  sw.ts                  Service worker for offline use
  main.ts                Wires everything together
  ui/                    One module per screen or widget, plus the html`` template helper
scripts/                 site.ts (build), server.ts, the dev, build and serve entry points, and the data fetchers
test/                    Unit tests, including the HTML render functions
e2e/                     Playwright tests
docker/                  nginx configuration
worker/                  The optional sync server (Cloudflare Worker and D1)
```

Everything outside `src/ui/` is pure and has no DOM access. State changes go through pure update functions applied by
`store.update()`, and the UI reads from the stores and renders.

### Build

`scripts/site.ts` bundles and minifies the app with esbuild into content-hashed files. It also:

- copies only the Klee One font subsets that cover characters the app actually shows;
- copies the stroke data and the files in `public/`;
- splits the JLPT kanji (about 60% of the code) into a file of their own. People learning kana start without it and
  get it in the background; saved progress that involves kanji waits for it, because cleaning it up without the kanji
  would drop those cards. Tests that need kanji import `src/kanji.ts`;
- writes `dist/index.html`, with a `modulepreload` link for the code `main.js` shares with the kanji file;
- generates `sw.js`, which pre-caches every built file so the app works offline.

## Saved data

Progress is stored in `localStorage` under `kana-dojo`, so it only exists in the browser that created it. Use **Export
progress** to back it up or move it, or turn on sync. An import can be merged with the progress already there or
replace it. With sync on, `kana-dojo-sync` holds the sync code and
`kana-dojo-device` this device's id; neither is part of an export.

The saved object carries a `version` (currently 6). When the shape changes:

1. bump `STATE_VERSION` in `src/state.ts`;
2. add a step to `MIGRATIONS` that upgrades the previous version;
3. extend the sanitising code if there are new fields, and add a test;
4. decide how `mergeStates` in `src/merge.ts` should combine new fields from two devices.

Older saves, and imported files, are upgraded step by step and then sanitised, so unknown or malformed data is dropped
instead of breaking the app.

## Deployment

- **GitHub Pages:** `.github/workflows/pages.yml` runs `npm run check`, the browser tests and the build on every push to
  `main`, then publishes `dist/`. In the repository settings, set **Pages → Source** to **GitHub Actions**.
- **Docker:** `docker compose up -d --build` serves the site on http://localhost:8080. It uses an unprivileged nginx with
  compression, cache headers (hashed files are cached for a year; the page and service worker are always revalidated),
  security headers, a read-only file system and a `/healthz` health check.

The page sets a strict Content-Security-Policy in a `<meta>` tag. Only same-origin scripts, styles, fonts and data are
allowed, plus inline `style` attributes. A build with `SYNC_URL` also allows connecting to the sync server.

## Credits

- Stroke order data: [KanjiVG](https://kanjivg.tagaini.net) by Ulrich Apel, CC BY-SA 3.0, stored in `vendor/kanjivg/`.
- Kanji readings and meanings: [KANJIDIC](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) by the Electronic
  Dictionary Research and Development Group, CC BY-SA 4.0, via
  [kanji-data](https://github.com/davidluzgouveia/kanji-data) by David Gouveia (MIT). JLPT levels from
  [Jonathan Waller's JLPT resources](http://www.tanos.co.uk/jlpt/).
- Photos, under the [Unsplash License](https://unsplash.com/license): the Hakone torii on the home screen by
  [Tianshu Liu](https://unsplash.com/photos/torii-gate-japan-SBK40fdKbAg) and the Miyajima torii behind a practice
  session by [Manoa Angelo](https://unsplash.com/photos/a-red-torii-gate-stands-in-the-sea-7NNgxNXac0k), stored in
  `public/images/`.
- Kana font: [Klee One](https://fonts.google.com/specimen/Klee+One) by Fontworks, SIL Open Font License 1.1, from
  `@fontsource/klee-one`.
