import assert from 'node:assert/strict';
import test from 'node:test';
import '../src/kanji.ts';
import { parseSentence } from '../src/furigana.ts';
import { findKana, getKana } from '../src/kana.ts';
import { mergeStates } from '../src/merge.ts';
import { itemsAt, wordAt } from '../src/reader-words.ts';
import { sentences } from '../src/sentences.ts';
import {
  chooseNext,
  clearMissed,
  MAX_MISSED,
  newSession,
  practiceEntries,
  submitAnswer,
  undoAnswer,
} from '../src/session.ts';
import {
  defaultState,
  isSaved,
  itemsProgress,
  migrateState,
  resetProgress,
  savedItems,
  setSaved,
  updateSettings,
} from '../src/state.ts';
import type { Card, Session, State } from '../src/types.ts';
import { toMarkup } from '../src/ui/html.ts';
import { doneScreen, missedItems } from '../src/ui/practice/summary.ts';
import { newPicks, sentenceItem, wordPanel } from '../src/ui/sentences.ts';

const NOW = new Date(2026, 0, 10, 12).getTime();
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const vowels = (): State => updateSettings(defaultState(), { rows: ['basic:Vowels'] });

// The word under the first run of kanji in a sentence written with readings.
function wordIn(markup: string): string | undefined {
  const segments = parseSentence(markup);
  const word = wordAt(
    segments,
    segments.findIndex(segment => segment.reading),
  );
  return word && (word.kanji ?? word.kana);
}

test('a run of kanji is matched to its word, conjugated or not', () => {
  assert.equal(wordIn('{私|わたし}は{学生|がくせい}です。'), '私');
  assert.equal(wordIn('{学生|がくせい}です。'), '学生');
  // Kept in kana in the app, found by reading.
  assert.equal(wordIn('{水|みず}を{飲|の}みます。'), 'みず');
  // Verbs and adjectives in the middle of a sentence.
  assert.equal(wordIn('{飲|の}みます'), 'のむ');
  assert.equal(wordIn('{行|い}きます'), 'いく');
  assert.equal(wordIn('{見|み}ました'), 'みる');
  assert.equal(wordIn('テレビを{見|み}ながら'), 'みる');
  assert.equal(wordIn('{重|おも}くて'), '重い');
  assert.equal(wordIn('{大|おお}きい'), 'おおきい');
  assert.equal(wordIn('{曲|ま}がって'), '曲る');
  // A word with okurigana that doesn't fit the text after it isn't taken: 花 before が is 花, not 花びら.
  assert.equal(wordIn('{花|はな}が'), 'はな');
  assert.equal(wordAt(parseSentence('です'), 0), undefined);
});

test('a run of kanji with no word of its own offers its kanji', () => {
  const segments = parseSentence('{北海道|ほっかいどう}へ');
  assert.equal(wordAt(segments, 0), undefined);
  assert.deepEqual(
    itemsAt(segments, 0).map(item => item.kana),
    ['北', '海', '道'],
  );
});

test('most kanji in the reading sentences belong to a word the app knows', () => {
  let runs = 0;
  let found = 0;
  for (const sentence of sentences) {
    sentence.segments.forEach((segment, i) => {
      if (!segment.reading) return;
      runs++;
      if (wordAt(sentence.segments, i)) found++;
    });
  }
  assert.ok(found / runs > 0.9, `${found} of ${runs}`);
});

test('saved words are kept in order, survive a save, a reset and a sync, and unknown ones are dropped', () => {
  const state = setSaved(setSaved(vowels(), 'がくせい', true, NOW), 'のむ', true, NOW + 1);
  assert.ok(isSaved(state, 'がくせい'));
  assert.deepEqual(
    savedItems(state).map(item => item.id),
    ['のむ', 'がくせい'],
  );
  assert.deepEqual(
    savedItems(setSaved(state, 'のむ', false, NOW + 2)).map(item => item.id),
    ['がくせい'],
  );

  const raw = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
  const loaded = migrateState({ ...raw, saved: { ...(raw.saved as object), nope: { on: true, at: 1 } } });
  assert.deepEqual(Object.keys(loaded.saved).sort(), ['がくせい', 'のむ']);
  assert.deepEqual(migrateState({ version: 11 }).saved, {});
  assert.deepEqual(migrateState({ version: 12, saved: { がくせい: 'yes' } }).saved, {});
  assert.deepEqual(resetProgress(state, NOW + 5).saved, state.saved);

  const phone = setSaved(state, 'がくせい', false, NOW + 10);
  assert.ok(!isSaved(mergeStates(state, 'laptop', phone, 'phone'), 'がくせい'), 'the later choice wins');
  assert.ok(!isSaved(mergeStates(phone, 'phone', state, 'laptop'), 'がくせい'));
  assert.ok(isSaved(mergeStates(state, 'laptop', phone, 'phone'), 'のむ'));
});

test('saved words are practised whatever rows are picked, before other new cards', () => {
  const state = setSaved(vowels(), 'がくせい', true, NOW);
  const ids = practiceEntries(state).map(entry => entry.item.id);
  assert.equal(ids[0], 'がくせい');
  assert.ok(ids.includes('あ'));
  const step = chooseNext(state, newSession(), { now: NOW, random: () => 0 });
  assert.equal(step.status === 'card' && step.item.id, 'がくせい');
  assert.equal(itemsProgress(state, savedItems(state), NOW).total, 1);
});

function sessionWith(kana: string, changes: Partial<Card> = {}): Session {
  return {
    ...newSession(),
    card: {
      item: getKana(kana),
      kind: 'review',
      direction: 'read',
      intro: false,
      choices: [],
      answered: false,
      revealed: false,
      untimed: false,
      shownAt: 0,
      outcome: null,
      given: null,
      ...changes,
    },
  };
}

test('misses and peeks are remembered for the session, the latest first, and undone with the answer', () => {
  const state = vowels();
  const wrong = submitAnswer(state, sessionWith('あ'), 'o', { now: NOW, clock: 1 });
  assert.deepEqual(wrong?.session.missed, ['あ']);
  const right = submitAnswer(state, { ...sessionWith('い'), missed: ['あ'] }, 'i', { now: NOW, clock: 1 });
  assert.deepEqual(right?.session.missed, ['あ']);
  const peeked = submitAnswer(state, { ...sessionWith('あ', { revealed: true }), missed: ['う', 'あ'] }, 'a', {
    now: NOW,
    clock: 1,
  });
  assert.deepEqual(peeked?.session.missed, ['あ', 'う'], 'each item once, the latest first');
  assert.ok(wrong);
  assert.deepEqual(undoAnswer(wrong.session, 2)?.session.missed, []);
  assert.deepEqual(clearMissed({ ...newSession(), missed: ['あ'] }).missed, []);

  const many = Array.from({ length: MAX_MISSED }, (_, i) => `x${i}`);
  assert.equal(
    submitAnswer(state, { ...sessionWith('あ'), missed: many }, 'o', { now: NOW, clock: 1 })?.session.missed.length,
    MAX_MISSED,
  );
});

test('the done screen lists what was missed with a way to drill it', () => {
  const session = { ...newSession(), missed: ['あ', 'がくせい', 'gone'] };
  assert.deepEqual(
    missedItems(session).map(item => item.id),
    ['あ', 'がくせい'],
  );
  const markup = toMarkup(doneScreen(vowels(), session, NOW));
  assert.match(text(markup), /Missed this session あ 学生 Drill these 2 again/);
  assert.match(markup, /data-open="がくせい"/);
  assert.match(markup, /data-done="missed"/);
  assert.match(text(toMarkup(doneScreen(vowels(), { ...newSession(), missed: ['い'] }, NOW))), /Drill it again/);
  assert.doesNotMatch(toMarkup(doneScreen(vowels(), newSession(), NOW)), /Missed this session/);
});

test('the word panel offers to learn a word, shows when it is saved or already started', () => {
  const student = findKana('がくせい');
  assert.ok(student);
  const fresh = toMarkup(wordPanel([student], vowels()));
  assert.match(text(fresh), /学生 がくせい student \+ Learn this Details/);
  assert.match(fresh, /data-save="がくせい"\s+aria-pressed="false"/);
  const saved = setSaved(vowels(), 'がくせい', true, NOW);
  assert.match(text(toMarkup(wordPanel([student], saved))), /✓ Saved to learn/);
  const started = {
    ...vowels(),
    stats: { がくせい: { correct: 1, wrong: 0, streak: 1, box: 2, due: NOW, last: NOW } },
  };
  assert.doesNotMatch(text(toMarkup(wordPanel([student], started))), /Learn this/);
  assert.match(text(toMarkup(wordPanel([], vowels()))), /isn’t in the app’s word list/);

  // The selected word's panel shows under its sentence, and only there.
  const [sentence] = sentences.filter(candidate => candidate.text.includes('学生'));
  assert.ok(sentence);
  const index = sentence.segments.findIndex(segment => segment.text === '学生');
  const picks = { ...newPicks(), selected: `3:${index}` };
  const options = { stats: {}, furigana: 'new' as const, listen: false, picks, state: vowels() };
  assert.match(toMarkup(sentenceItem(sentence, 3, options)), /class="word-pick"/);
  assert.doesNotMatch(toMarkup(sentenceItem(sentence, 4, options)), /class="word-pick"/);
});
