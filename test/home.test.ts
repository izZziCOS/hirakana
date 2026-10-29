import assert from 'node:assert/strict';
import test from 'node:test';
import '../src/kanji.ts';
import { GROUPS, TRACKS } from '../src/data.ts';
import { dayKey } from '../src/days.ts';
import { learnMore, newSession, todaySummary } from '../src/session.ts';
import { registerDecks } from '../src/decks.ts';
import { addDeck, defaultState, groupProgress, migrateState, updateSettings } from '../src/state.ts';
import { deckSummary, heroCopy, heroDetail, trackCard } from '../src/ui/home.ts';
import { toMarkup } from '../src/ui/html.ts';

const NOW = new Date(2026, 0, 10, 12).getTime();
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const kanaTrack = TRACKS[0];
const kanjiTrack = TRACKS[2];

test('the tracks cover every set exactly once', () => {
  const grouped = TRACKS.flatMap(track => track.groups);
  assert.deepEqual([...grouped].sort(), GROUPS.map(group => group.id).sort());
  assert.equal(new Set(grouped).size, grouped.length);
});

test('today’s summary counts due reviews and the new cards still allowed', () => {
  const due = { correct: 1, wrong: 0, streak: 1, box: 2, due: NOW - 1000, last: NOW - 1000 };
  const later = { ...due, due: NOW + 60_000 };
  const state = migrateState({
    version: 5,
    settings: { rows: ['basic:Vowels'], newPerDay: 5 },
    stats: { あ: due, い: later },
    days: { [dayKey(NOW)]: { answers: 2, learned: 2, reviews: 0, scored: 2, correct: 2 } },
  });
  assert.deepEqual(todaySummary(state, newSession(), NOW), { due: 1, newLeft: 3, held: 0 });
  assert.deepEqual(todaySummary(state, learnMore(newSession()), NOW), { due: 1, newLeft: 3, held: 0 }, 'only 3 unseen');
  const used = updateSettings(state, { newPerDay: 2 });
  assert.deepEqual(todaySummary(used, newSession(), NOW), { due: 1, newLeft: 0, held: 0 });
});

test('set progress counts mastered and learning cards in the current direction and script', () => {
  const mastered = { correct: 5, wrong: 0, streak: 5, box: 6, due: NOW, last: NOW };
  const learning = { correct: 1, wrong: 1, streak: 0, box: 1, due: NOW, last: NOW };
  const state = migrateState({ version: 5, stats: { あ: mastered, ア: mastered, い: learning } });
  assert.deepEqual(groupProgress(state, 'basic'), { mastered: 1, learning: 1, total: 46 });
  const katakana = updateSettings(state, { script: 'katakana' });
  assert.deepEqual(groupProgress(katakana, 'basic'), { mastered: 1, learning: 0, total: 46 });
  const both = updateSettings(state, { script: 'both' });
  assert.deepEqual(groupProgress(both, 'basic'), { mastered: 2, learning: 1, total: 92 });
  const recall = updateSettings(both, { direction: 'recall' });
  assert.deepEqual(groupProgress(recall, 'basic'), { mastered: 0, learning: 0, total: 92 });
  assert.deepEqual(groupProgress(recall, 'words'), { mastered: 0, learning: 0, total: 90 });
  const write = updateSettings(state, { direction: 'write' });
  assert.deepEqual(groupProgress(write, 'words'), { mastered: 0, learning: 0, total: 0 });
});

test('a set shows its progress from the first answer, before anything is mastered', () => {
  const learning = { correct: 1, wrong: 0, streak: 1, box: 2, due: NOW, last: NOW };
  const state = migrateState({ version: 7, stats: { あ: learning, い: learning } });
  assert.ok(kanaTrack);
  const markup = toMarkup(trackCard(kanaTrack, state));
  assert.match(text(markup), /Basic あ–ん 2 of 46 cards started/);
  // The track's bar and each set's bar show the cards being learned.
  assert.match(markup, /class="progress-bar track-bar"\s+role="img"\s+aria-label="0% mastered, 2% learning"/);
  assert.match(markup, /class="progress-bar set-bar"\s+role="img"\s+aria-label="0% mastered, 4% learning"/);
  assert.equal((markup.match(/progress-bar set-bar/g) ?? []).length, 4, 'loanword katakana is left out');
});

test('the hero says what Continue will bring up', () => {
  assert.deepEqual(heroCopy({ due: 24, newLeft: 8 }), { title: '24 reviews due, 8 new to learn', action: 'Continue' });
  assert.deepEqual(heroCopy({ due: 1, newLeft: 0 }), { title: '1 review due', action: 'Continue' });
  assert.deepEqual(heroCopy({ due: 0, newLeft: 3 }), { title: '3 new to learn', action: 'Continue' });
  assert.deepEqual(heroCopy({ due: 0, newLeft: 0 }), { title: 'All caught up for now', action: 'Practise anyway' });
  assert.equal(heroDetail(defaultState()), 'Read · Basic');
});

test('track cards show each set’s selection and progress', () => {
  assert.ok(kanaTrack && kanjiTrack);
  const mastered = { correct: 5, wrong: 0, streak: 5, box: 6, due: NOW, last: NOW };
  const vowels = Object.fromEntries(['あ', 'い', 'う', 'え', 'お'].map(kana => [kana, mastered]));
  const state = migrateState({ version: 5, settings: { rows: ['basic:Vowels', 'basic:K-row'] }, stats: vowels });
  const markup = toMarkup(trackCard(kanaTrack, state));
  assert.match(markup, /data-group="basic"\s+aria-pressed="mixed"/);
  assert.match(markup, /data-group="dakuten"\s+aria-pressed="false"/);
  assert.match(text(markup), /Basic あ–ん 11% mastered/);
  assert.match(text(markup), /Dakuten が・ぱ 25 cards/);
  assert.match(markup, /aria-label="4% mastered, 0% learning"/);
  assert.doesNotMatch(markup, /data-row=/, 'rows stay hidden until the track is opened');

  const open = toMarkup(trackCard(kanaTrack, state, true));
  assert.match(open, /data-row="basic:Vowels"\s+aria-pressed="true"/);
  assert.match(open, /Hide rows/);

  const kanji = toMarkup(trackCard(kanjiTrack, state, true, new Set(['k5'])));
  assert.match(kanji, /data-expand="k5"\s+aria-expanded="true"/);
  assert.match(kanji, /data-row="k5:N5 · 1–30"/);
  assert.doesNotMatch(kanji, /data-row="k4:/, 'closed kanji levels keep their rows hidden');

  const write = toMarkup(trackCard(TRACKS[1] ?? kanaTrack, updateSettings(state, { direction: 'write' })));
  assert.match(text(write), /Everyday words ねこ Not in Write/);
});

test('the decks card offers an import and lists the decks with a way to delete each', () => {
  const decksTrack = TRACKS.find(track => track.id === 'decks');
  assert.ok(decksTrack);
  const empty = toMarkup(trackCard(decksTrack, defaultState()));
  assert.match(empty, /data-import-deck/);
  assert.doesNotMatch(empty, /data-group=|track-bar|Choose rows/, 'nothing to pick without decks');

  const deck = {
    id: 'genki',
    name: 'Genki 3',
    words: [{ kana: 'ねこ', meaning: 'cat' }],
    addedAt: NOW,
    updatedAt: NOW,
  };
  const state = addDeck(defaultState(), deck, NOW);
  registerDecks(state.decks);
  const markup = toMarkup(trackCard(decksTrack, state, true, new Set(), 'Added “Genki 3” with 1 word.'));
  assert.match(markup, /data-group="custom"\s+aria-pressed="true"/);
  assert.match(markup, /data-row="custom:genki"/);
  assert.match(markup, /data-delete-deck="genki"/);
  assert.match(text(markup), /Genki 3 1 word · not started Delete/);
  assert.match(markup, /class="progress-bar deck-bar"\s+role="img"\s+aria-label="0% mastered, 0% learning"/);
  assert.match(text(markup), /Added “Genki 3” with 1 word\./);
  assert.match(text(markup), /Word lists you import · 1 card\b/);
  registerDecks([]);
});

test('sets with many rows keep them hidden until opened', () => {
  const vocabulary = TRACKS.find(track => track.id === 'vocabulary');
  assert.ok(vocabulary);
  const closed = toMarkup(trackCard(vocabulary, defaultState(), true));
  assert.match(closed, /data-expand="n5"\s+aria-expanded="false"/);
  assert.doesNotMatch(closed, /data-row="n5:/);
  assert.match(closed, /data-row="words:/, 'a small set shows its rows straight away');
  const open = toMarkup(trackCard(vocabulary, defaultState(), true, new Set(['n5'])));
  assert.match(open, /data-row="n5:N5 · 1–30"/);
});

test('a deck’s summary says how far along it is, and in which direction when that differs', () => {
  const progress = { direction: 'read', total: 40, mastered: 12, learning: 8, due: 3 } as const;
  assert.equal(deckSummary(progress, 'read'), '40 words · 12 mastered · 8 learning · 3 due');
  assert.equal(deckSummary({ ...progress, due: 0 }, 'read'), '40 words · 12 mastered · 8 learning');
  assert.equal(deckSummary(progress, 'write'), '40 words · 12 mastered · 8 learning · 3 due in Read');
  assert.equal(deckSummary({ ...progress, mastered: 0, learning: 0 }, 'recall'), '40 words · not started in Read');
});

test('the kana card follows the picked script: its text, its sets and its counts', () => {
  assert.ok(kanaTrack);
  const hiragana = text(toMarkup(trackCard(kanaTrack, defaultState())));
  assert.match(hiragana, /^あ Kana Hiragana · 115 cards/);
  assert.match(
    hiragana,
    /Basic あ–ん 46 cards Dakuten が・ぱ 25 cards Combinations きゃ 33 cards Small っ &amp; long ー きって 11 cards/,
  );
  assert.doesNotMatch(hiragana, /Loanword katakana/, 'it has no hiragana cards');

  const katakana = text(toMarkup(trackCard(kanaTrack, updateSettings(defaultState(), { script: 'katakana' }), true)));
  assert.match(katakana, /^ア Kana Katakana · 141 cards/);
  assert.match(katakana, /Basic ア–ン 46 cards Dakuten ガ・パ 25 cards Combinations キャ 33 cards/);
  assert.match(katakana, /Small ッ &amp; long ー キッテ 17 cards Loanword katakana ファ 20 cards/);
  assert.match(katakana, /Hide rows Basic .* Small ッ &amp; long ー/, 'the opened rows are headed in katakana too');

  const both = text(toMarkup(trackCard(kanaTrack, updateSettings(defaultState(), { script: 'both' }))));
  assert.match(both, /^あ Kana Hiragana &amp; katakana · 256 cards/);
  assert.match(both, /Loanword katakana ファ 20 cards/);
});
