import assert from 'node:assert/strict';
import test from 'node:test';
import '../src/kanji.ts';
import { answerOf, isCorrectAnswer } from '../src/choices.ts';
import { parseWritingAnswer, writingAnswer, writingPassed } from '../src/handwriting.ts';
import { getKana, supportsDirection } from '../src/kana.ts';
import { MASTERED_BOX, slowThreshold } from '../src/schedule.ts';
import { canForgiveTypo, chooseNext, emptyMessage, newSession, showCard, submitAnswer } from '../src/session.ts';
import { defaultState, migrateState, recordAnswer, updateSettings } from '../src/state.ts';
import { toMarkup } from '../src/ui/html.ts';
import { promptLabel, resultMessage, writePromptMarkup } from '../src/ui/practice/card.ts';

const NOW = new Date(2026, 0, 10, 12).getTime();
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

test('single kana and kanji can be written, words and combinations cannot', () => {
  ['あ', 'ア', 'が', 'ヴ', '水'].forEach(kana => assert.ok(supportsDirection(getKana(kana), 'write'), kana));
  ['きゃ', 'ファ', 'やま', 'あたま'].forEach(kana => assert.ok(!supportsDirection(getKana(kana), 'write'), kana));
});

test('a written answer passes with up to one retried stroke in four', () => {
  assert.equal(writingAnswer(1, 4), '1/4');
  assert.deepEqual(parseWritingAnswer('2/9'), { mistakes: 2, strokes: 9 });
  assert.equal(parseWritingAnswer('mizu'), null);
  assert.ok(writingPassed(0, 1));
  assert.ok(!writingPassed(1, 3));
  assert.ok(writingPassed(1, 4));
  assert.ok(!writingPassed(3, 9));
  const water = getKana('水');
  assert.ok(isCorrectAnswer(water, 'write', '1/4'));
  assert.ok(!isCorrectAnswer(water, 'write', '2/4'));
  assert.ok(!isCorrectAnswer(water, 'write', 'sui'));
  assert.equal(answerOf(water, 'write'), '水');
});

test('writing is untimed, has no choices and no typo button', () => {
  assert.equal(slowThreshold(getKana('水'), 'type', 'write', 2000), Infinity);
  const state = updateSettings(defaultState(), { direction: 'write', mode: 'choose' });
  const step = chooseNext(state, newSession(), { now: NOW, random: () => 0 });
  assert.ok(step.status === 'card');
  assert.deepEqual(step.choices, []);

  const typed = updateSettings(state, { mode: 'type' });
  const session = showCard(newSession(), step, 0);
  const result = submitAnswer(typed, session, '5/3', { now: NOW, clock: 1000 });
  assert.ok(result);
  assert.equal(result.outcome, 'wrong');
  assert.ok(!canForgiveTypo(result.state, result.session));

  const wordsOnly = updateSettings(state, { rows: ['words:Food'] });
  assert.match(emptyMessage(wordsOnly.settings, null), /Writing works with single kana and kanji/);
});

test('writing keeps its own record and never hides kanji readings', () => {
  const water = getKana('水');
  const mastered = { correct: 4, wrong: 0, streak: 4, box: MASTERED_BOX, due: NOW, last: NOW };
  let state = migrateState({ version: 5, stats: { 'write:水': mastered } });
  assert.equal(state.stats['write:水']?.box, MASTERED_BOX);
  state = recordAnswer(state, {
    item: water,
    direction: 'write',
    outcome: 'correct',
    given: '0/4',
    ms: null,
    now: NOW,
    run: 1,
  });
  assert.equal(state.stats['write:水']?.kanjiOnly, undefined);
});

test('write cards name the character without showing it', () => {
  const water = getKana('水');
  assert.equal(promptLabel(water, 'write', 'type'), 'Write the kanji · JLPT N5 kanji');
  assert.equal(promptLabel(getKana('あ'), 'write', 'type'), 'Write the hiragana · Basic');
  assert.equal(text(toMarkup(writePromptMarkup(water))), 'Waterスイ');
  assert.equal(text(toMarkup(writePromptMarkup(getKana('あ')))), 'a');
  assert.equal(text(toMarkup(resultMessage(water, 'write', true, '0/4'))), 'Correct! 水 (sui).');
  assert.equal(
    text(toMarkup(resultMessage(water, 'write', true, '1/4'))),
    'Correct! 水 (sui). 1 of 4 strokes needed another try.',
  );
  assert.equal(
    text(toMarkup(resultMessage(water, 'write', false, '3/4'))),
    'That was 水 (sui). 3 of 4 strokes needed another try.',
  );
  assert.equal(text(toMarkup(resultMessage(water, 'write', false, null))), 'That was 水 (sui).');
});
