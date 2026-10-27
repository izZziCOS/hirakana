# Kana Dojo

A hiragana and katakana trainer that runs entirely in the browser. It uses spaced repetition, works offline once it has
loaded, and keeps progress in the browser with no backend.

- **Four directions:** read (あ → ka), recall (ka → あ, picked from four options or typed), match (あ ↔ ア) and listen (hear it,
  then pick or type it). Each has its own review schedule. Listening uses the browser's Japanese voice and is only
  offered when one exists.
- **Character sets:** basic kana, dakuten, combinations (きゃ), small っ and long ー, loanword katakana (ファ) and ~90
  everyday words. Practise whole sets or individual rows.
- **Spaced repetition** with 9 steps from 1 minute to 2 months. Slow answers don't advance a card; the time limit adapts
  to your own pace and can be switched off. Peeking moves a card back two steps. A daily limit on new characters leads to
  a "Done for today" screen.
- **Typing help:** an on-screen kana keyboard for recall and listening, "I made a typo" after a wrong typed answer, and
  undo for the last answer.
- **Info panel:** animated stroke order, handwriting practice that checks each stroke, origin kanji, example word,
  look-alikes and your own record.
- **Progress:** mastery grid, 7-day review forecast, activity calendar (select a day to see its mistakes) and a weekly
  accuracy chart.
- **Mistakes:** history, most-missed characters and mixed-up pairs (シ ⇄ ツ), each of which can be drilled.
- **Other:** session goal, light/dark/system theme, export and import of progress, installable as an app.

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
public/                  Copied as-is: web app manifest and icons
vendor/kanjivg/          Stroke data for every character the app uses (see its README)
src/
  data.ts                All kana, words, examples, notes and look-alike groups
  kana.ts                Builds the kana list and answer lookups from the data
  schedule.ts            Spaced repetition and answer timing
  choices.ts             Multiple-choice options and answer checking
  days.ts                Daily log, streaks, forecast and chart data
  mistakes.ts            Most-missed, mixed-up pairs and per-day filtering
  handwriting.ts         Compares a drawn stroke with the expected one
  state.ts               Saved state: defaults, migrations, import/export, update functions
  session.ts             Per-visit state: current card, drills, undo, typos, goal, "done for today"
  store.ts               A small store with batched saving to localStorage
  boot.ts                Runs before the app: applies the saved theme and shows an error if loading fails
  sw.ts                  Service worker for offline use
  main.ts                Wires everything together
  ui/                    One module per screen or widget, plus the html`` template helper
scripts/                 site.ts (build), server.ts, and the dev, build and serve entry points
test/                    Unit tests, including the HTML render functions
e2e/                     Playwright tests
docker/                  nginx configuration
```

Everything outside `src/ui/` is pure and has no DOM access. State changes go through pure update functions applied by
`store.update()`, and the UI reads from the stores and renders.

### Build

`scripts/site.ts` bundles and minifies the app with esbuild into content-hashed files. It also:

- copies only the Klee One font subsets that cover characters the app actually shows;
- copies the stroke data and the files in `public/`;
- writes `dist/index.html`;
- generates `sw.js`, which pre-caches every built file so the app works offline.

## Saved data

Progress is stored in `localStorage` under `kana-dojo`, so it only exists in the browser that created it. Use **Export
progress** to back it up or move it.

The saved object carries a `version` (currently 5). When the shape changes:

1. bump `STATE_VERSION` in `src/state.ts`;
2. add a step to `MIGRATIONS` that upgrades the previous version;
3. extend the sanitising code if there are new fields, and add a test.

Older saves, and imported files, are upgraded step by step and then sanitised, so unknown or malformed data is dropped
instead of breaking the app.

## Deployment

- **GitHub Pages:** `.github/workflows/pages.yml` runs `npm run check`, the browser tests and the build on every push to
  `main`, then publishes `dist/`. In the repository settings, set **Pages → Source** to **GitHub Actions**.
- **Docker:** `docker compose up -d --build` serves the site on http://localhost:8080. It uses an unprivileged nginx with
  compression, cache headers (hashed files are cached for a year; the page and service worker are always revalidated),
  security headers, a read-only file system and a `/healthz` health check.

The page sets a strict Content-Security-Policy in a `<meta>` tag. Only same-origin scripts, styles, fonts and data are
allowed, plus inline `style` attributes.

## Credits

- Stroke order data: [KanjiVG](https://kanjivg.tagaini.net) by Ulrich Apel, CC BY-SA 3.0, stored in `vendor/kanjivg/`.
- Kana font: [Klee One](https://fonts.google.com/specimen/Klee+One) by Fontworks, SIL Open Font License 1.1, from
  `@fontsource/klee-one`.
