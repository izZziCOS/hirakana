import assert from 'node:assert/strict';
import test from 'node:test';
import '../src/kanji.ts';
import { GROUPS, TRACKS } from '../src/data.ts';
import { dayKey } from '../src/days.ts';
import { learnMore, newSession, todaySummary } from '../src/session.ts';
import { defaultState, groupProgress, migrateState, updateSettings } from '../src/state.ts';
import { heroCopy, heroDetail, trackCard } from '../src/ui/home.ts';
import { toMarkup } from '../src/ui/html.ts';

const NOW = new Date(2026, 0, 10, 12).getTime();
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const kanaTrack = TRACKS[0];
const kanjiTrack = TRACKS[2];

test('the three tracks cover every set exactly once', () => {
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
    days: { [dayKey(NOW)]: { answers: 2, learned: 2, scored: 2, correct: 2 } },
  });
  assert.deepEqual(todaySummary(state, newSession(), NOW), { due: 1, newLeft: 3 });
  assert.deepEqual(todaySummary(state, learnMore(newSession()), NOW), { due: 1, newLeft: 3 }, 'only 3 unseen');
  const used = updateSettings(state, { newPerDay: 2 });
  assert.deepEqual(todaySummary(used, newSession(), NOW), { due: 1, newLeft: 0 });
});

test('set progress counts mastered cards in the current direction', () => {
  const mastered = { correct: 5, wrong: 0, streak: 5, box: 6, due: NOW, last: NOW };
  const state = migrateState({ version: 5, stats: { あ: mastered, ア: mastered } });
  assert.deepEqual(groupProgress(state, 'basic'), { mastered: 2, total: 92 });
  assert.deepEqual(groupProgress(updateSettings(state, { direction: 'recall' }), 'basic'), { mastered: 0, total: 92 });
  assert.deepEqual(groupProgress(updateSettings(state, { direction: 'recall' }), 'words'), { mastered: 0, total: 0 });
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
  assert.match(text(markup), /Basic あ–ん 5% mastered/);
  assert.match(text(markup), /Dakuten が・ぱ 50 cards/);
  assert.match(markup, /aria-label="2% mastered"/);
  assert.doesNotMatch(markup, /data-row=/, 'rows stay hidden until the track is opened');

  const open = toMarkup(trackCard(kanaTrack, state, true));
  assert.match(open, /data-row="basic:Vowels"\s+aria-pressed="true"/);
  assert.match(open, /Hide rows/);

  const kanji = toMarkup(trackCard(kanjiTrack, state, true, new Set(['k5'])));
  assert.match(kanji, /data-expand="k5"\s+aria-expanded="true"/);
  assert.match(kanji, /data-row="k5:N5 · 1–30"/);
  assert.doesNotMatch(kanji, /data-row="k4:/, 'closed kanji levels keep their rows hidden');

  const recall = toMarkup(trackCard(TRACKS[1] ?? kanaTrack, updateSettings(state, { direction: 'recall' })));
  assert.match(text(recall), /Everyday words ねこ Not in Recall/);
});
