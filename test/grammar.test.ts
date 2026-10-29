import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChoices, isCorrectAnswer } from '../src/choices.ts';
import { GROUPS, TRACKS } from '../src/data.ts';
import { isKanaText } from '../src/decks.ts';
import { GRAMMAR_POINTS } from '../src/grammar-data.ts';
import { getKana, inScript, isGrammar, KANA, ROW_INFO, rowIdOf, statKey, supportsDirection } from '../src/kana.ts';
import { needsKanji } from '../src/kanji-loader.ts';
import { mixUpOf } from '../src/mistakes.ts';
import { baseThreshold } from '../src/schedule.ts';
import { chooseNext, drillDirection, emptyMessage, newSession, practiceEntries, startDrill } from '../src/session.ts';
import { defaultState, directionOfGroup, groupProgress, updateSettings } from '../src/state.ts';
import { parseSaved } from '../src/store.ts';
import type { Stat, State } from '../src/types.ts';
import { clozePromptMarkup, shortLabel } from '../src/ui/grammar.ts';
import { toMarkup } from '../src/ui/html.ts';
import { renderInfo } from '../src/ui/info.ts';
import { introMarkup, placeholderFor, promptLabel, resultMessage, typesKana } from '../src/ui/practice/card.ts';

const NOW = new Date(2026, 0, 10, 12).getTime();
const first = () => 0;
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const seen: Stat = { correct: 1, wrong: 0, streak: 1, box: 2, due: NOW + 3_600_000, last: NOW - 1000 };
const grammar = KANA.filter(isGrammar);
const topicRow = rowIdOf({ group: 'g5', label: 'は (topic)' });
const practising = (rows: string[], direction: State['settings']['direction'] = 'cloze') =>
  updateSettings(defaultState(), { rows, direction }, NOW);

test('every grammar point has a stable id, a level, an explanation and enough sentences', () => {
  const ids = GRAMMAR_POINTS.map(point => point.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(GRAMMAR_POINTS.map(point => point.label)).size, ids.length);
  GRAMMAR_POINTS.forEach(point => {
    assert.match(point.id, /^[a-z0-9-]+$/, point.id);
    assert.ok([4, 5].includes(point.level), point.id);
    assert.ok(point.pattern && point.meaning && point.note, point.id);
    assert.ok(point.sentences.length >= 4, point.id);
    assert.ok(point.options.every(isKanaText), point.id);
  });
  assert.ok(GRAMMAR_POINTS.filter(point => point.level === 5).length >= 15);
  assert.ok(GRAMMAR_POINTS.filter(point => point.level === 4).length >= 10);
});

test('every grammar sentence has one gap with answers in kana and readings in kana', () => {
  GRAMMAR_POINTS.flatMap(point => point.sentences).forEach(([markup, english]) => {
    assert.equal(markup.match(/\[/g)?.length, 1, markup);
    assert.equal(markup.match(/\]/g)?.length, 1, markup);
    assert.ok(english, markup);
    for (const [, reading] of markup.matchAll(/\{[^|}]+\|([^}]+)\}/g)) assert.ok(isKanaText(reading ?? ''), markup);
    assert.doesNotMatch(markup.replace(/\{[^}]*\}/g, ''), /[{}|]/, markup);
  });
  grammar.forEach(item => {
    assert.ok(item.cloze?.answers.every(isKanaText), item.id);
    assert.ok(isKanaText(item.cloze?.reading.replace(/[、。]/g, '') ?? ''), item.id);
  });
  const sentences = grammar.map(item => item.kana);
  assert.equal(new Set(sentences).size, sentences.length);
});

test('grammar has a track with an N5 and an N4 set, and a row for every point', () => {
  assert.deepEqual(TRACKS.find(track => track.id === 'grammar')?.groups, ['g5', 'g4']);
  assert.ok(GROUPS.some(group => group.id === 'g5') && GROUPS.some(group => group.id === 'g4'));
  const rows = ROW_INFO.filter(row => row.group === 'g5' || row.group === 'g4');
  assert.equal(rows.length, GRAMMAR_POINTS.length);
  assert.ok(rows.every(row => row.preview.hiragana === row.label && row.preview.katakana === row.label));
  assert.ok(grammar.every(item => rows.some(row => row.id === item.rowId)));
});

test('grammar cards are saved under the point and the sentence, and spell particles as they are read', () => {
  const topic = getKana('~wa-topic/1');
  assert.equal(topic.kana, '私は学生です。');
  assert.equal(topic.romaji, 'wa');
  assert.deepEqual(topic.accepted, ['は', 'wa', 'ha']);
  assert.equal(topic.cloze?.reading, 'わたしはがくせいです。');
  assert.equal(statKey(topic, 'cloze'), 'cloze:~wa-topic/1');

  assert.equal(getKana('~temo-ii-tewa-ikenai/2').romaji, 'waikemasen');
  assert.deepEqual(getKana('~ni-he-destination/1').cloze?.answers, ['に', 'へ']);
  assert.ok(getKana('~ni-he-destination/1').accepted.includes('e'));
  assert.ok(getKana('~wo-object/1').accepted.includes('o') && getKana('~wo-object/1').accepted.includes('wo'));
  assert.ok(getKana('~deshou-kamoshirenai/1').accepted.includes('deshou'));
});

test('grammar cards are only filled in, in any script, and nothing else is', () => {
  const topic = getKana('~wa-topic/1');
  assert.ok(supportsDirection(topic, 'cloze'));
  assert.ok(
    !(['read', 'recall', 'match', 'listen', 'meaning', 'write'] as const).some(d => supportsDirection(topic, d)),
  );
  assert.ok(!supportsDirection(getKana('あ'), 'cloze'));
  assert.ok(!supportsDirection(getKana('やま'), 'cloze'));
  assert.ok(inScript(topic, 'katakana'));
});

test('a gap is filled in kana or romaji, with any of its right answers', () => {
  const topic = getKana('~wa-topic/1');
  assert.ok(isCorrectAnswer(topic, 'cloze', 'は'));
  assert.ok(isCorrectAnswer(topic, 'cloze', ' WA '));
  assert.ok(!isCorrectAnswer(topic, 'cloze', 'が'));
  assert.ok(!isCorrectAnswer(topic, 'cloze', null));
  const destination = getKana('~ni-he-destination/2');
  assert.ok(isCorrectAnswer(destination, 'cloze', 'へ') && isCorrectAnswer(destination, 'cloze', 'ni'));
});

test('every grammar card offers four different choices, none of them another right answer', () => {
  grammar.forEach(item => {
    const choices = buildChoices(item, { direction: 'cloze', random: first });
    assert.equal(new Set(choices).size, 4, item.id);
    assert.ok(choices.includes(item.cloze?.answers[0] ?? ''), item.id);
    assert.equal(choices.filter(choice => item.cloze?.answers.includes(choice)).length, 1, item.id);
  });
});

test('a grammar point is introduced with its first sentence only', () => {
  const state = practising([topicRow]);
  const step = chooseNext(state, newSession(), { now: NOW, random: first });
  assert.ok(step.status === 'card' && step.direction === 'cloze' && step.kind === 'new' && step.intro);
  const met = { ...state, stats: { 'cloze:~wa-topic/1': seen } };
  const next = chooseNext(met, newSession(), { now: NOW, random: first });
  assert.ok(next.status === 'card' && next.item.id === '~wa-topic/2' && next.kind === 'new' && !next.intro);
});

test('mixed practice fills in grammar alongside reading kana', () => {
  const state = practising(['basic:Vowels', topicRow], 'mixed');
  const directions = new Set(practiceEntries(state).map(entry => entry.direction));
  assert.deepEqual([...directions].sort(), ['cloze', 'read']);
  const grammarOnly = practising([topicRow], 'mixed');
  const step = chooseNext(grammarOnly, newSession(), { now: NOW, random: first });
  assert.ok(step.status === 'card' && step.direction === 'cloze');
});

test('a drill of grammar is filled in whatever is practised', () => {
  const state = practising(['basic:Vowels'], 'read');
  const items = KANA.filter(item => item.rowId === topicRow);
  assert.equal(drillDirection(state.settings, { label: 'は', items }), 'cloze');
  assert.equal(drillDirection(state.settings, { label: 'mixed', items: [...items, getKana('あ')] }), 'read');
  const step = chooseNext(state, startDrill(newSession(), { label: 'は', items }), { now: NOW, random: first });
  assert.ok(step.status === 'card' && step.kind === 'drill' && step.direction === 'cloze');
});

test('Fill in without grammar rows says what it is for', () => {
  const state = practising(['basic:Vowels']);
  const step = chooseNext(state, newSession(), { now: NOW });
  assert.deepEqual(step, { status: 'empty', message: emptyMessage(state.settings, null) });
  assert.match(emptyMessage(state.settings, null), /grammar/);
});

test('grammar sets show their progress in Fill in, also when practice is mixed', () => {
  assert.equal(directionOfGroup('mixed', 'g5'), 'cloze');
  assert.equal(directionOfGroup('mixed', 'basic'), 'read');
  assert.equal(directionOfGroup('recall', 'g5'), 'recall');
  const state = { ...practising([topicRow], 'mixed'), stats: { 'cloze:~wa-topic/1': seen } };
  const n5 = grammar.filter(item => item.group === 'g5').length;
  assert.deepEqual(groupProgress(state, 'g5'), { mastered: 0, learning: 1, total: n5 });
});

test('progress on grammar is kept when saved, and doesn’t wait for the kanji to load', () => {
  const saved = JSON.stringify({
    ...practising([topicRow]),
    stats: { 'cloze:~wa-topic/1': seen, 'cloze:あ': seen, '~wa-topic/1': seen },
    mistakes: [{ kana: '~wa-topic/1', given: 'が', at: NOW, direction: 'cloze' }],
  });
  const state = parseSaved(saved, NOW);
  assert.ok(state);
  assert.deepEqual(Object.keys(state.stats), ['cloze:~wa-topic/1']);
  assert.equal(state.settings.direction, 'cloze');
  assert.deepEqual(state.settings.rows, [topicRow]);
  assert.equal(state.mistakes.length, 1);
  assert.equal(needsKanji(saved), false);
});

test('a wrong particle is not a mix-up with another card', () => {
  assert.equal(mixUpOf({ kana: '~wa-topic/1', given: 'が', at: NOW, direction: 'cloze' }), null);
});

test('a gap takes longer to answer than a single character', () => {
  const topic = getKana('~wa-topic/1');
  assert.equal(baseThreshold(topic, 'type', 'cloze'), 16000);
  assert.equal(baseThreshold(topic, 'choose', 'cloze'), 8000);
});

test('grammar cards render the gap, the meaning and the answer', () => {
  const topic = getKana('~wa-topic/1');
  const stats = defaultState().stats;
  const prompt = toMarkup(clozePromptMarkup(topic, stats));
  assert.match(prompt, /class="cloze-gap"/);
  assert.match(prompt, /<ruby>私<rt>わたし<\/rt><\/ruby>/);
  assert.equal(text(prompt), '私わたしgap学生がくせいです。I am a student.');
  assert.match(toMarkup(clozePromptMarkup(topic, stats, true)), /<mark class="cloze-answer">は<\/mark>/);

  assert.ok(typesKana('cloze'));
  assert.equal(promptLabel(topic, 'cloze', 'type'), 'Type the missing part · JLPT N5 grammar');
  assert.equal(placeholderFor(topic, 'cloze'), 'Type the missing part in kana or romaji…');
  assert.equal(text(toMarkup(introMarkup(topic))), 'は (topic) · as for A; marks what the sentence is about');
  assert.equal(text(toMarkup(resultMessage(topic, 'cloze', true, 'は'))), 'Correct! 私は学生です。 “I am a student.”');
  assert.equal(
    text(toMarkup(resultMessage(topic, 'cloze', false, 'が'))),
    '私は学生です。 “I am a student.” You answered が.',
  );
  assert.equal(text(toMarkup(resultMessage(topic, 'cloze', false, null))), '私は学生です。 “I am a student.”');
  assert.equal(shortLabel(topic), 'は');
  assert.equal(shortLabel(getKana('あ')), 'あ');
});

test('the info panel explains a grammar point with its other sentences', () => {
  const topic = getKana('~wa-topic/1');
  const info = text(toMarkup(renderInfo(topic, defaultState(), NOW)));
  assert.ok(info.includes('Pattern A は B です'));
  assert.ok(info.includes('As a particle it is read “wa”'));
  assert.ok(info.includes('Answer は wa'));
  assert.ok(info.includes('It’s hot today, isn’t it?'));
  assert.ok(info.includes('Drill this point'));
  assert.ok(info.includes('Grammar · は (topic) · JLPT N5 grammar'));
  assert.ok(info.includes('Not practised yet'));
  const destination = text(toMarkup(renderInfo(getKana('~ni-he-destination/1'), defaultState(), NOW)));
  assert.ok(destination.includes('Right answers に · へ'));
});
