import assert from 'node:assert/strict';
import test from 'node:test';
import { dayKey } from '../src/days.ts';
import { getKana } from '../src/kana.ts';
import { newSession } from '../src/session.ts';
import { defaultState, updateSettings } from '../src/state.ts';
import type { State } from '../src/types.ts';
import { toMarkup } from '../src/ui/html.ts';
import { describeComposition, renderInfo } from '../src/ui/info.ts';
import { choiceButtons, placeholderFor, promptLabel, promptMarkup, resultMessage } from '../src/ui/practice/card.ts';
import { kanaPad } from '../src/ui/practice/kana-pad.ts';
import { doneScreen, sessionBar } from '../src/ui/practice/summary.ts';

const NOW = new Date(2026, 0, 10, 12).getTime();
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

test('result messages explain the answer in every direction', () => {
  const ka = getKana('か');
  assert.equal(text(toMarkup(resultMessage(ka, 'read', true, 'ka'))), 'Correct! か = ka');
  assert.equal(text(toMarkup(resultMessage(ka, 'read', false, 'ta'))), 'か is “ka”. You answered “ta”, which is た.');
  assert.equal(text(toMarkup(resultMessage(ka, 'read', false, null))), 'か is “ka”.');
  assert.equal(text(toMarkup(resultMessage(ka, 'recall', false, 'た'))), 'ka is か. You answered た (ta).');
  assert.equal(text(toMarkup(resultMessage(ka, 'listen', true, 'か'))), 'Correct! That was か (ka).');
  assert.equal(text(toMarkup(resultMessage(ka, 'match', false, 'タ'))), 'か is カ in katakana. You answered タ (ta).');
});

test('JLPT words show their kanji next to the kana', () => {
  const head = getKana('あたま');
  assert.equal(text(toMarkup(promptMarkup(head))), '頭あたま');
  assert.equal(text(toMarkup(promptMarkup(getKana('やま')))), 'やま');
  assert.equal(text(toMarkup(resultMessage(head, 'read', true, 'atama'))), 'Correct! 頭 (あたま) = atama');
  assert.equal(text(toMarkup(resultMessage(head, 'read', false, null))), '頭 (あたま) is “atama”.');
  assert.ok(text(toMarkup(renderInfo(head, defaultState(), NOW))).includes('In kanji 頭'));
});

test('result messages escape what the learner typed', () => {
  const markup = toMarkup(resultMessage(getKana('か'), 'read', false, '<img src=x>'));
  assert.ok(!markup.includes('<img'));
  assert.ok(markup.includes('&lt;img src=x&gt;'));
});

test('prompt labels and placeholders match the direction and mode', () => {
  const ka = getKana('か');
  assert.equal(promptLabel(ka, 'recall', 'type'), 'Type the hiragana · Basic');
  assert.equal(promptLabel(ka, 'listen', 'choose'), 'Listen, then pick the hiragana');
  assert.equal(promptLabel(ka, 'match', 'choose'), 'Hiragana → katakana');
  assert.equal(placeholderFor(ka, 'listen'), 'Type it in hiragana…');
  assert.equal(placeholderFor(getKana('やま'), 'read'), 'Romaji (long vowels as oo, ii…)');
});

test('the session bar shows due cards, the daily limit and the goal', () => {
  const state = updateSettings(defaultState(), { rows: ['basic:Vowels'], goal: 10 });
  const bar = text(toMarkup(sessionBar(state, { ...newSession(), answered: 4, correct: 3, streak: 2 }, NOW)));
  assert.match(bar, /Due 0/);
  assert.match(bar, /New today 0\/15/);
  assert.match(bar, /Session 3\/4 \(75%\)/);
  assert.match(bar, /Goal 4\/10/);
  const drilling = text(
    toMarkup(sessionBar(state, { ...newSession(), drill: { label: 'x', items: [getKana('あ')] } }, NOW)),
  );
  assert.doesNotMatch(drilling, /Due/);
});

test('the done screen offers more new characters only while some are left', () => {
  const state: State = {
    ...updateSettings(defaultState(), { rows: ['basic:Vowels', 'basic:K-row'] }),
    days: { [dayKey(NOW)]: { answers: 12, learned: 5, scored: 12, correct: 10 } },
  };
  const screen = text(toMarkup(doneScreen(state, NOW)));
  assert.match(screen, /You answered 12 cards today and learned 5 new ones/);
  assert.match(screen, /Learn 5 more/);
  const allSeen: State = {
    ...updateSettings(defaultState(), { rows: ['basic:N'] }),
    stats: { ん: { correct: 1, wrong: 0, streak: 1, box: 3, due: NOW + 1000, last: NOW } },
  };
  assert.doesNotMatch(text(toMarkup(doneScreen(allSeen, NOW))), /Learn/);
});

test('the info panel shows the details for a character', () => {
  const info = toMarkup(renderInfo(getKana('ぱ'), defaultState(), NOW));
  assert.match(text(info), /Reading pa/);
  assert.match(text(info), /Built from は \(ha\) \+ handakuten/);
  assert.match(info, /Practise writing/);
  assert.match(text(info), /Not practised yet/);
  const word = toMarkup(renderInfo(getKana('コーヒー'), defaultState(), NOW));
  assert.doesNotMatch(word, /stroke-order/);
  assert.match(text(word), /Meaning coffee/);
});

test('describeComposition covers dakuten, combinations and loanword katakana', () => {
  const describe = (kana: string) => text(toMarkup(describeComposition(getKana(kana)) ?? ''));
  assert.match(describe('が'), /か \(ka\) \+ dakuten/);
  assert.match(describe('きゃ'), /き \(ki\) \+ small ゃ, blended into one syllable/);
  assert.match(describe('ファ'), /フ \(fu\) \+ small ァ, used to write sounds from other languages/);
  assert.match(describe('ヴ'), /ウ \(u\) \+ dakuten/);
  assert.equal(describe('あ'), '');
});

test('the info panel adds your record, look-alikes, mix-ups and word explanations', () => {
  const state: State = {
    ...defaultState(),
    stats: {
      シ: { correct: 4, wrong: 1, streak: 2, box: 3, due: NOW + 60 * 60 * 1000, last: NOW, avgMs: 1800 },
      'recall:シ': { correct: 1, wrong: 0, streak: 1, box: 2, due: NOW, last: NOW },
    },
    mistakes: [{ kana: 'シ', given: 'tsu', at: NOW, direction: 'read' }],
  };
  const info = text(toMarkup(renderInfo(getKana('シ'), state, NOW)));
  assert.match(info, /Read: 4 right · 1 wrong · avg 1\.8 s · due in 1 h Learning/);
  assert.match(info, /Recall: 1 right/);
  assert.match(info, /Don’t confuse ツ tsu/);
  assert.match(info, /You mixed it up with ツ tsu ×1/);

  const word = text(toMarkup(renderInfo(getKana('がっこう'), defaultState(), NOW)));
  assert.match(word, /How it works The small っ doubles the next consonant/);
  assert.match(word, /extra vowel kana/);
  const long = text(toMarkup(renderInfo(getKana('コーヒー'), defaultState(), NOW)));
  assert.match(long, /ー stretches the vowel/);
});

test('choice buttons and the kana keyboard render escaped, numbered keys', () => {
  const buttons = toMarkup(choiceButtons(['a', '<b>'], false));
  assert.match(buttons, /data-value="a"/);
  assert.match(buttons, /&lt;b&gt;/);
  assert.match(toMarkup(choiceButtons(['か'], true)), /class="choice jp"/);
  const pad = toMarkup(kanaPad('katakana'));
  assert.match(pad, /data-key="ア"/);
  assert.match(pad, /data-key="ヴ"/);
  assert.match(pad, /data-pad="backspace"/);
});
