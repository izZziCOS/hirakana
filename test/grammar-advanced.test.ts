import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChoices, isCorrectAnswer } from '../src/choices.ts';
import { GROUPS } from '../src/data.ts';
import { isKanaText } from '../src/decks.ts';
import { GRAMMAR_POINTS } from '../src/grammar-data.ts';
import { GRAMMAR_ADVANCED } from '../src/grammar-advanced-data.ts';
import { getKana, isGrammar, isGrammarGroup, KANA, registerGrammar, ROW_INFO, statKey } from '../src/kana.ts';
import '../src/kanji.ts';
import { chooseNext, newSession } from '../src/session.ts';
import { defaultState, migrateState, updateSettings } from '../src/state.ts';

const NOW = new Date(2026, 0, 10, 12).getTime();
const first = () => 0;
const advanced = KANA.filter(item => isGrammar(item) && ['g3', 'g2', 'g1'].includes(item.group));

test('every point has a stable id of its own, an explanation and at least four sentences', () => {
  const all = [...GRAMMAR_POINTS, ...GRAMMAR_ADVANCED];
  assert.equal(new Set(all.map(point => point.id)).size, all.length);
  assert.equal(new Set(all.map(point => point.label)).size, all.length);
  GRAMMAR_ADVANCED.forEach(point => {
    assert.match(point.id, /^[a-z0-9-]+$/, point.id);
    assert.ok([1, 2, 3].includes(point.level), point.id);
    assert.ok(point.pattern && point.meaning && point.note, point.id);
    assert.ok(point.sentences.length >= 4, point.id);
    assert.ok(point.options.length >= 3 && point.options.every(isKanaText), point.id);
  });
  for (const [level, least] of [
    [3, 20],
    [2, 15],
    [1, 12],
  ] as const) {
    assert.ok(GRAMMAR_ADVANCED.filter(point => point.level === level).length >= least, `N${level}`);
  }
});

test('every sentence has one gap and gives every kanji its reading', () => {
  GRAMMAR_ADVANCED.flatMap(point => point.sentences).forEach(([markup, english]) => {
    assert.equal(markup.match(/\[/g)?.length, 1, markup);
    assert.equal(markup.match(/\]/g)?.length, 1, markup);
    assert.ok(english, markup);
    for (const [, reading] of markup.matchAll(/\{[^|}]+\|([^}]+)\}/g)) assert.ok(isKanaText(reading ?? ''), markup);
    assert.doesNotMatch(markup.replace(/\{[^}]*\}/g, ''), /[{}|\p{Script=Han}]/u, markup);
  });
  advanced.forEach(item => {
    assert.ok(item.cloze?.answers.every(isKanaText), item.id);
    assert.ok(isKanaText(item.cloze?.reading.replace(/[、。]/g, '') ?? ''), item.id);
  });
  const sentences = KANA.filter(isGrammar).map(item => item.kana);
  assert.equal(new Set(sentences).size, sentences.length);
});

test('every card offers four different choices, one of them right', () => {
  advanced.forEach(item => {
    const choices = buildChoices(item, { direction: 'cloze', random: first });
    assert.equal(new Set(choices).size, 4, item.id);
    assert.equal(choices.filter(choice => item.cloze?.answers.includes(choice)).length, 1, item.id);
  });
});

test('no option is a word used as the answer in the same point', () => {
  GRAMMAR_ADVANCED.forEach(point => {
    const answers = point.sentences.map(([markup]) => /\[([^\]]+)\]/.exec(markup)?.[1]);
    assert.ok(!answers.some(answer => answer && point.options.includes(answer)), point.id);
  });
});

test('romaji follows how an answer is read, in either spelling', () => {
  const hazu = getKana('~hazu/1');
  assert.equal(hazu.romaji, 'hazudesu');
  assert.ok(isCorrectAnswer(hazu, 'cloze', 'hazudesu'));
  assert.ok(isCorrectAnswer(hazu, 'cloze', 'はずです'));
  const ikanai = getKana('~wake-niwa-ikanai/1');
  assert.equal(ikanai.romaji, 'wakeniwaikanai');
  assert.ok(isCorrectAnswer(ikanai, 'cloze', 'wakenihaikanai'));
  assert.equal(getKana('~zaru-wo-enai/1').romaji, 'zaruoenai');
});

test('the new sets are groups and rows like the others', () => {
  ['g3', 'g2', 'g1'].forEach(id => {
    assert.ok(GROUPS.some(group => group.id === id));
    assert.ok(isGrammarGroup(id as 'g3'));
  });
  const rows = ROW_INFO.filter(row => ['g3', 'g2', 'g1'].includes(row.group));
  assert.equal(rows.length, GRAMMAR_ADVANCED.length);
  assert.ok(advanced.every(item => rows.some(row => row.id === item.rowId)));
  // Registering twice adds nothing.
  const before = KANA.length;
  registerGrammar(GRAMMAR_ADVANCED);
  assert.equal(KANA.length, before);
});

test('an N1 point is introduced and practised, and its progress survives a save', () => {
  const row = ROW_INFO.find(info => info.label === '～ならでは');
  assert.ok(row);
  const state = updateSettings(defaultState(), { rows: [row.id], direction: 'cloze' }, NOW);
  const step = chooseNext(state, newSession(), { now: NOW, random: first });
  assert.ok(step.status === 'card' && step.direction === 'cloze' && step.intro && step.item.id === '~naradewa/1');
  const key = statKey(step.item, 'cloze');
  const saved = { ...state, stats: { [key]: { correct: 1, wrong: 0, streak: 1, box: 2, due: NOW, last: NOW } } };
  const loaded = migrateState(JSON.parse(JSON.stringify(saved)), NOW);
  assert.deepEqual(Object.keys(loaded.stats), [key]);
  assert.deepEqual(loaded.settings.rows, [row.id]);
});
