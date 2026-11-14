# Kana Dojo

A hiragana, katakana and JLPT kanji trainer that runs entirely in the browser. It uses spaced repetition, works offline once it has
loaded, and keeps progress in the browser with no backend.

- **Home screen:** a "Today" panel with the reviews due and new cards left and one Continue button, five tracks
  (Kana, Vocabulary, Kanji, Grammar, Your decks) whose sets and rows you switch on and off, and the practice modes grouped into Recognise,
  Produce and Compare. Daily limits, the session goal, the speed check and introductions live in a Settings dialog.
- **Seven directions:** read (あ → ka, 水 → sui or mizu), recall (ka → あ, or cat → ねこ for words, picked from four options or typed), match (あ ↔ ア),
  listen (hear a kana or a word, then pick or type it), meaning (水 → water, ねこ → cat, for kanji and words), fill in (今日＿暑いですね → は, for grammar) and write (ka or "water" → draw
  it, checked stroke by stroke; up to one retried stroke in four still passes). Each has its own review schedule.
  **Mixed** practice brings due cards from every direction you use into one session; new characters are learned by
  reading first, and the other directions open up once a character can be read. So that one direction doesn't give away
  another, once a word has been answered its other directions wait 12 hours if they are reviews or not started yet;
  cards still being learned stay a few minutes apart when anything else is due.
- **Listening:** most kana (not combinations like きゃ, ぢ or ぺ) and most everyday and N5 words play a recording by a
  person, and everything else uses the browser's Japanese voice. Without a voice, Listen offers only the cards with
  recordings. Read-aloud sentences and passages always use the voice.
- **Character sets:** basic kana, dakuten, combinations (きゃ), small っ and long ー, loanword katakana (ファ), ~90 everyday
  words, and the full JLPT vocabulary lists (~7,700 words: about 590 N5, 600 N4, 2,100 N3, 1,650 N2 and 2,650 N1,
  shown with their kanji). Each level starts with hand-picked themed rows, then the rest in rows of 30, words whose
  kanji are taught earliest first. Practise whole sets or individual rows.
- **Conjugation:** a track of about 1,100 cards, one for each of 90 common verbs and 57 adjectives in each form: polite,
  negative, past, て, potential, volitional, conditional, passive and causative for verbs, and negative, past, past
  negative, linking and adverb for adjectives. Forms a verb doesn't have are left out. Words you already know come first.
  It is practised in Fill in, typed in kana, romaji or with the word's kanji, or picked from wrong forms of the same
  word, the likeliest mistakes first. A verb's class comes from `src/conjugation-data.ts`, as the word list doesn't record
  it and spelling can't tell (帰る is godan, 食べる ichidan).
- **Grammar:** 85 JLPT grammar points (19 N5, 14 N4, 21 N3, 18 N2 and 13 N1), from は and が to ～をよそに, one row each.
  Each point has an explanation and four or five sentences with a gap where it goes; a sentence is filled in by typing
  the missing part in kana or romaji (particles as they are read: wa, e, o) or by picking it from four options, with
  the English meaning to tell apart answers that would both be grammatical. A point is introduced with its first
  sentence, Mixed practice always includes Fill in, and the info panel lists the point's other sentences and can drill
  them.
- **Your own decks:** import a word list as CSV or tab-separated text, such as an Anki deck exported as "Notes in Plain
  Text" (HTML, `漢字[かんじ]` furigana and romaji columns are handled). Each line needs a kana word and a meaning; a
  kanji spelling is optional. Decks are practised in Read, Listen, Meaning and Recall, saved with your progress and synced. Importing a file
  with the name of a deck you already have updates that deck and keeps your progress on the words still in it. New
  words from your decks are introduced before other new cards.
- **Reading:** the Read tab lists short sentences (kana-only ones first, up to about N3) that use only the kana and
  kanji you know, or all of them with readings over the kanji you haven't learned. Select a word to show or hide its
  reading; each sentence has its meaning and can be read aloud. A selected word also shows what it means and can be
  saved to learn: words written in kanji are matched to the word list, conjugated or not (飲みます is 飲む), or else to
  their kanji. Saved words are practised whatever rows are picked, introduced before other new cards, and synced; each
  can be let go from its info panel.
- **Graded passages:** the Read tab also has 12 short passages from N5 to N1 written for the app, with readings on
  demand, the meaning of each paragraph, listening and three comprehension questions each.
- **JLPT readiness:** the Progress tab shows how much of each level's kanji, words and grammar you know, your next goal
  and a timed mock test: 30 questions from all of a level in 15 minutes, scored per section, with what you missed ready to
  drill. It doesn't change your reviews, and it is a practice check, not a prediction of an exam result.
- **Example sentences:** a word's or kanji's info panel shows up to three of the app's own reading and grammar sentences
  that use it, where there are any.
- **Kanji:** all ~2,230 JLPT kanji (N5 80, N4 166, N3 373, N2 367, N1 1,244) in rows of 30, most frequent first. Read
  accepts any on or kun reading; the info panel lists the readings, meanings, stroke count, stroke order and the
  vocabulary words that use the kanji, which can be drilled together. It also shows the parts a kanji is built from
  (語 = 言 + 吾, from KanjiVG) and other kanji that share them. New words whose kanji you already know come first.
- **Two stages for kanji and words written in kanji:** the reading is shown under the kanji until it is mastered, then
  hidden; a miss or a peek brings it back. The card says when either happens.
- **Learning new characters:** a character seen for the first time is introduced with its reading, sound, stroke order
  and example before it is tested, a minute later (can be turned off in Settings). After a mix-up, both characters
  come back within the next few cards to tell them apart.
- **Spaced repetition:** new cards go through steps of 1 minute, 10 minutes and 1 hour to a first review a day later.
  From then on [FSRS-6](https://github.com/open-spaced-repetition) with its default parameters sets each gap from how
  well that card has gone, aiming for a 90% chance of remembering it, up to a year. Hard cards come back sooner than easy
  ones, and a right answer after a long time away counts for more than one on time. Gaps vary by up to 10%, so cards
  learned together spread out. Slow answers grow a gap less; the time limit adapts to your own pace and can be switched
  off. A miss moves a card back three steps and a peek two, in both cases no further on than the 1-hour step, and asks it
  again a minute later, then the card returns to the shorter gap its memory still supports. A daily limit on new characters, and an
  optional one on reviews (cards whose last gap was a day or more; cards still being learned don’t count), lead to a
  "Done for today" screen that can ask for a few more of either. That screen also lists what was missed or peeked at
  in the session, each opening its info panel, with a button to drill them again.
- **Catching up after a break:** when more reviews are due than fit in a day (over the daily review limit, or over a
  hundred without one), the home screen offers to spread them over the next five days or so, the cards known least
  first. The moved reviews sync to other devices.
- **Typing help:** an on-screen kana keyboard for recall and listening, "I made a typo" after a wrong typed answer, and
  undo for the last answer.
- **Info panel:** animated stroke order, handwriting practice that checks each stroke, origin kanji, example word,
  look-alikes and your own record.
- **Progress:** mastery grid, 7-day review forecast, activity calendar (select a day to see its mistakes), a weekly
  accuracy chart, the share of answers remembered per set, and the words you can already read with the kana you know.
  Milestones mark a whole set mastered and new numbers of readable words.
- **Mistakes:** history, most-missed characters and mixed-up pairs (シ ⇄ ツ), each of which can be drilled.
- **Problem cards:** a card missed at least eight times, at least one answer in three, and not yet mastered is pointed out
  when it is missed again and listed on the Mistakes tab. Any card can be suspended (left out of practice until resumed)
  or marked "I know this" (moved to the 3-week step) from its info panel.
- **Search:** the search button or `/` finds kana, words, kanji and grammar by how they are written, read or what they
  mean, and opens their info panel.
- **Sync:** optional, end-to-end encrypted sync between devices with a sync code or link, through a small server you
  deploy yourself (see [worker/README.md](worker/README.md)). If syncing keeps failing while online, the page says so.
- **Other:** session goal, light/dark/system theme, export and import of progress with a backup reminder, installable
  as an app, and a message when a new version is ready to reload.

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

| Command                 | What it does                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run dev`           | Development build with live reload; no minification and no service worker                            |
| `npm start`             | Production build, then a static server on `PORT` (default 8000)                                      |
| `npm run build`         | Production build into `dist/`                                                                        |
| `npm test`              | Unit tests (`node:test`, no browser)                                                                 |
| `npm run test:coverage` | Unit tests with coverage of `src/` and `worker/`; fails below 95% lines, 90% branches, 95% functions |
| `npm run test:e2e`      | Playwright tests on desktop and mobile Chrome, including axe accessibility scans                     |
| `npm run typecheck`     | `tsc` in strict mode, including `noUncheckedIndexedAccess`                                           |
| `npm run lint`          | ESLint (strict, type-aware) and stylelint                                                            |
| `npm run format`        | Prettier                                                                                             |
| `npm run check`         | Type check, lint, formatting check and unit tests with coverage                                      |

The first time you run the browser tests, install Chromium for Playwright with `npx playwright install chromium`.

## Project structure

```
index.html               Page template; the build fills in the hashed asset names
styles/                  One CSS file per screen; index.css imports them in order, tokens.css holds the colours
public/                  Copied as-is: web app manifest, icons and the two background photos
vendor/kanjivg/          Stroke data for every character the app uses (see its README)
vendor/audio/            Recorded pronunciations, their sources and licences (see its README)
src/
  data.ts                All kana, words, examples, notes and look-alike groups
  kanji-data.ts          Generated JLPT kanji list (readings, meanings); refresh with node scripts/fetch-kanji.ts
  kanji-parts.ts         Generated parts of each kanji from KanjiVG; refresh with node scripts/make-kanji-parts.ts
  vocab-data.ts          Generated JLPT word list; refresh with node scripts/fetch-vocabulary.ts
  sentences.ts           Reading sentences with their furigana, and which ones the learner can read
  furigana.ts            Parses {漢字|かんじ} readings, shared by the sentences and the grammar cards
  grammar-data.ts        JLPT N5–N4 grammar points and their sentences with a gap; ids are saved with progress
  grammar-advanced-data.ts  JLPT N3–N1 grammar points, loaded on demand with the kanji
  conjugate.ts           Conjugates a verb or adjective from its dictionary form
  conjugation-data.ts    Verbs and adjectives with their class, and what each form is for
  conjugation.ts         Builds the conjugation cards; loaded on demand with the kanji
  examples.ts            Finds the app's sentences that use a word or kanji
  passages-data.ts       Graded passages and their questions; loaded when the Read tab first shows them
  readiness.ts           How much of each JLPT level is known
  mock-test.ts           Builds and scores a mock test
  search.ts              Finds items by how they are written, read or what they mean
  decks.ts               Imported word lists: parsing CSV and Anki exports, and their cards
  kanji.ts               Adds the kanji and the JLPT word list to the item lists; loaded on demand through kanji-loader.ts
  reading.ts             Which words the learner can read with the characters they know
  milestones.ts          Recall rates per set and milestones after an answer
  kana.ts                Builds the kana, word and kanji items, romaji and answer lookups from the data
  schedule.ts            Spaced repetition and answer timing
  fsrs.ts                The FSRS-6 memory model behind the review gaps
  audio.ts               Which cards have a recording
  audio-data.ts          Generated list of recordings; refresh with node scripts/fetch-audio.ts
  choices.ts             Multiple-choice options and answer checking
  days.ts                Daily log, streaks, forecast and chart data
  mistakes.ts            Most-missed, mixed-up pairs and per-day filtering
  handwriting.ts         Compares a drawn stroke with the expected one
  state.ts               Saved state: defaults, migrations, import/export, update functions
  merge.ts               Combines progress from two devices
  sync.ts                Sync codes, encryption and the download-merge-upload round trip
  session.ts             Per-visit state: current card, drills, undo, typos, goal, "done for today"
  store.ts               A small store with batched saving
  progress-storage.ts    Keeps progress in IndexedDB behind a synchronous interface, and moves it out of localStorage
  idb.ts                 The IndexedDB database and the channel tabs use to tell each other about saves
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
- splits the JLPT kanji, the full JLPT word list and the N3–N1 grammar (about 80% of the code) into a file of their own. People learning kana start without it and
  get it in the background; saved progress that involves kanji waits for it, because cleaning it up without the kanji
  would drop those cards. Tests that need kanji import `src/kanji.ts`;
- writes `dist/index.html`, with a `modulepreload` link for the code `main.js` shares with the kanji file;
- generates `sw.js`, which pre-caches the built files so the app works offline. Fonts (3.3 MB) and recordings (4 MB) go
  in caches of their own that last until they change, so an app update doesn't fetch them again. Kanji stroke
  files are cached as each is opened, or all at once with **Download all kanji** in Settings (about 9 MB).

## Saved data

Progress is stored in the browser's IndexedDB, in the `kana-dojo` database, under the key `kana-dojo`, so it only exists
in the browser that created it. Use **Export progress** to back it up or move it, or turn on sync. An import can be
merged with the progress already there or replace it. With sync on, `kana-dojo-sync` holds the sync code and
`kana-dojo-device` this device's id; neither is part of an export.

IndexedDB takes far more than localStorage's few megabytes, which progress across all ~40,000 cards would outgrow. The
app still reads and writes progress synchronously: `src/progress-storage.ts` reads everything into memory at start and
writes in the background, in order. Tabs tell each other about saves on a `BroadcastChannel` and merge each other's
progress. Two things stay in `localStorage`:

- `kana-dojo-theme`, so `boot.js` can apply the theme before the page draws;
- `kana-dojo-journal`, a copy of any write still on its way to IndexedDB, which a browser abandons if the page closes
  first. It is removed once the write is done; if it is still there at the next start, the progress in it is merged in.

Versions before IndexedDB kept progress in `localStorage`. The first start of this one moves it, along with the sync
code, device id and any unreadable copy, and leaves `{"version":1000000,"movedTo":"indexedDB"}` under `kana-dojo`. An
older version still open in another tab reads that as progress from a newer version, so it stops saving instead of
starting afresh. Where IndexedDB can't be opened, as in some private windows, the app keeps using `localStorage`.

The saved object carries a `version` (currently 12). When the shape changes:

1. bump `STATE_VERSION` in `src/state.ts`;
2. add a step to `MIGRATIONS` that upgrades the previous version;
3. extend the sanitising code if there are new fields, and add a test;
4. decide how `mergeStates` in `src/merge.ts` should combine new fields from two devices.

Older saves, and imported files, are upgraded step by step and then sanitised, so unknown or malformed data is dropped
instead of breaking the app.

Two kinds of save are never overwritten. Progress from a newer version stops the app with a message to reload, and a tab
left open from before stops saving as soon as it notices one. Progress that can't be read at all is copied to
`kana-dojo-unreadable`, and the page offers to download or delete the copy.

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
- JLPT vocabulary: [open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks) by Jamie Sinclair (MIT),
  based on Jonathan Waller's JLPT lists, stored in `src/vocab-data.ts`.
- Kanji readings and meanings: [KANJIDIC](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) by the Electronic
  Dictionary Research and Development Group, CC BY-SA 4.0, via
  [kanji-data](https://github.com/davidluzgouveia/kanji-data) by David Gouveia (MIT). JLPT levels from
  [Jonathan Waller's JLPT resources](http://www.tanos.co.uk/jlpt/); 19 kanji missing there (分 among them) take the
  level their pre-2010 JLPT level became (see `scripts/fetch-kanji.ts`).
- Photos, under the [Unsplash License](https://unsplash.com/license): the Hakone torii on the home screen by
  [Tianshu Liu](https://unsplash.com/photos/torii-gate-japan-SBK40fdKbAg) and the Miyajima torii behind a practice
  session by [Manoa Angelo](https://unsplash.com/photos/a-red-torii-gate-stands-in-the-sea-7NNgxNXac0k), stored in
  `public/images/`.
- Recordings: [Tofugu and WaniKani](https://github.com/tofugu/japanese-vocabulary-pronunciation-audio), CC BY-SA 4.0, and
  Lingua Libre speakers Fukujinzuke, 葵心 and CKali, CC BY 4.0 and CC0, trimmed, levelled and converted to small MP3s. Each
  file's source is listed in `vendor/audio/SOURCES.tsv`.
- Spaced repetition: [FSRS](https://github.com/open-spaced-repetition) by the Open Spaced Repetition project, MIT, with
  its published default parameters.
- Kana font: [Klee One](https://fonts.google.com/specimen/Klee+One) by Fontworks, SIL Open Font License 1.1, from
  `@fontsource/klee-one`.
