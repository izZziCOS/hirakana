import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChoices, isCorrectAnswer } from '../src/choices.ts';
import {
  ADJECTIVE_FORMS,
  adjectiveNearMisses,
  conjugateAdjective,
  conjugateVerb,
  VERB_FORMS,
  type VerbClass,
  type VerbForm,
  verbNearMisses,
} from '../src/conjugate.ts';
import { furiganaOf, MAX_DISTRACTORS, registerConjugation } from '../src/conjugation.ts';
import { ADJECTIVE_FORM_INFO, ADJECTIVES, VERB_FORM_INFO, VERBS } from '../src/conjugation-data.ts';
import { TRACKS } from '../src/data.ts';
import { isKanaText } from '../src/decks.ts';
import { getKana, isGrammar, isGrammarGroup, KANA, ROW_INFO, statKey, supportsDirection } from '../src/kana.ts';
import '../src/kanji.ts';
import { knowsBaseWord } from '../src/schedule.ts';
import { chooseNext, newSession } from '../src/session.ts';
import { defaultState, directionOfGroup, migrateState, updateSettings } from '../src/state.ts';
import type { Stat } from '../src/types.ts';

const NOW = new Date(2026, 0, 10, 12).getTime();
const first = () => 0;
const cards = KANA.filter(item => item.group === 'cv' || item.group === 'ca');
const seen: Stat = { correct: 2, wrong: 0, streak: 2, box: 3, due: NOW + 3_600_000, last: NOW - 1000 };

// Each row: kana, kanji, class, then the nine forms in the order of VERB_FORMS.
const VERB_TABLE: [string, string, VerbClass, ...string[]][] = [
  [
    'たべる',
    '食べる',
    'ichidan',
    'たべます',
    'たべない',
    'たべた',
    'たべて',
    'たべられる',
    'たべよう',
    'たべれば',
    'たべられる',
    'たべさせる',
  ],
  [
    'かう',
    '買う',
    'godan',
    'かいます',
    'かわない',
    'かった',
    'かって',
    'かえる',
    'かおう',
    'かえば',
    'かわれる',
    'かわせる',
  ],
  [
    'かく',
    '書く',
    'godan',
    'かきます',
    'かかない',
    'かいた',
    'かいて',
    'かける',
    'かこう',
    'かけば',
    'かかれる',
    'かかせる',
  ],
  [
    'いく',
    '行く',
    'godan',
    'いきます',
    'いかない',
    'いった',
    'いって',
    'いける',
    'いこう',
    'いけば',
    'いかれる',
    'いかせる',
  ],
  [
    'およぐ',
    '泳ぐ',
    'godan',
    'およぎます',
    'およがない',
    'およいだ',
    'およいで',
    'およげる',
    'およごう',
    'およげば',
    'およがれる',
    'およがせる',
  ],
  [
    'はなす',
    '話す',
    'godan',
    'はなします',
    'はなさない',
    'はなした',
    'はなして',
    'はなせる',
    'はなそう',
    'はなせば',
    'はなされる',
    'はなさせる',
  ],
  [
    'まつ',
    '待つ',
    'godan',
    'まちます',
    'またない',
    'まった',
    'まって',
    'まてる',
    'まとう',
    'まてば',
    'またれる',
    'またせる',
  ],
  [
    'しぬ',
    '死ぬ',
    'godan',
    'しにます',
    'しなない',
    'しんだ',
    'しんで',
    'しねる',
    'しのう',
    'しねば',
    'しなれる',
    'しなせる',
  ],
  [
    'あそぶ',
    '遊ぶ',
    'godan',
    'あそびます',
    'あそばない',
    'あそんだ',
    'あそんで',
    'あそべる',
    'あそぼう',
    'あそべば',
    'あそばれる',
    'あそばせる',
  ],
  [
    'のむ',
    '飲む',
    'godan',
    'のみます',
    'のまない',
    'のんだ',
    'のんで',
    'のめる',
    'のもう',
    'のめば',
    'のまれる',
    'のませる',
  ],
  [
    'かえる',
    '帰る',
    'godan',
    'かえります',
    'かえらない',
    'かえった',
    'かえって',
    'かえれる',
    'かえろう',
    'かえれば',
    'かえられる',
    'かえらせる',
  ],
  ['する', '', 'suru', 'します', 'しない', 'した', 'して', 'できる', 'しよう', 'すれば', 'される', 'させる'],
  [
    'べんきょうする',
    '勉強する',
    'suru',
    'べんきょうします',
    'べんきょうしない',
    'べんきょうした',
    'べんきょうして',
    'べんきょうできる',
    'べんきょうしよう',
    'べんきょうすれば',
    'べんきょうされる',
    'べんきょうさせる',
  ],
  ['くる', '来る', 'kuru', 'きます', 'こない', 'きた', 'きて', 'こられる', 'こよう', 'くれば', 'こられる', 'こさせる'],
];

test('verbs of every class conjugate as a textbook says', () => {
  for (const [kana, kanji, verbClass, ...forms] of VERB_TABLE) {
    VERB_FORMS.forEach((form, i) => {
      assert.deepEqual(conjugateVerb(kana, kanji || kana, verbClass, form).kana, [forms[i]], `${kana} ${form}`);
    });
  }
});

test('the kanji are kept in the written form, and 来 keeps its kanji whatever its reading', () => {
  assert.deepEqual(conjugateVerb('たべる', '食べる', 'ichidan', 'te').kanji, ['食べて']);
  assert.deepEqual(conjugateVerb('かく', '書く', 'godan', 'past').kanji, ['書いた']);
  assert.deepEqual(conjugateVerb('べんきょうする', '勉強する', 'suru', 'negative').kanji, ['勉強しない']);
  assert.deepEqual(conjugateVerb('くる', '来る', 'kuru', 'negative').kanji, ['来ない']);
  assert.deepEqual(conjugateVerb('くる', '来る', 'kuru', 'conditional').kanji, ['来れば']);
});

test('a word that isn’t godan is refused rather than conjugated wrongly', () => {
  assert.throws(() => conjugateVerb('ねこ', '', 'godan', 'te'), /Not a godan ending/);
});

test('adjectives of both kinds conjugate, い and な, and いい takes its forms from よい', () => {
  const table: [string, 'i' | 'na', string[], string[], string[], string[], string[]][] = [
    ['たかい', 'i', ['たかくない'], ['たかかった'], ['たかくなかった'], ['たかくて'], ['たかく']],
    ['いい', 'i', ['よくない'], ['よかった'], ['よくなかった'], ['よくて'], ['よく']],
    [
      'しずか',
      'na',
      ['しずかじゃない', 'しずかではない'],
      ['しずかだった'],
      ['しずかじゃなかった', 'しずかではなかった'],
      ['しずかで'],
      ['しずかに'],
    ],
    // It ends in い, but isn't an い adjective.
    [
      'きれい',
      'na',
      ['きれいじゃない', 'きれいではない'],
      ['きれいだった'],
      ['きれいじゃなかった', 'きれいではなかった'],
      ['きれいで'],
      ['きれいに'],
    ],
  ];
  for (const [kana, adjectiveClass, ...forms] of table) {
    ADJECTIVE_FORMS.forEach((form, i) => {
      assert.deepEqual(conjugateAdjective(kana, kana, adjectiveClass, form).kana, forms[i], `${kana} ${form}`);
    });
  }
  assert.deepEqual(conjugateAdjective('たかい', '高い', 'i', 'past').kanji, ['高かった']);
  assert.deepEqual(conjugateAdjective('しずか', '静か', 'na', 'te').kanji, ['静かで']);
});

test('near misses are the mistakes people make', () => {
  assert.ok(verbNearMisses('かく', 'godan', 'te').includes('かきて'));
  assert.ok(verbNearMisses('かく', 'godan', 'past').includes('かった'));
  assert.ok(verbNearMisses('かえる', 'godan', 'negative').includes('かえない'));
  assert.ok(verbNearMisses('たべる', 'ichidan', 'negative').includes('たべらない'));
  assert.deepEqual(verbNearMisses('する', 'suru', 'te'), []);
  assert.deepEqual(adjectiveNearMisses('しずか', 'na', 'negative'), ['しずかくない']);
  assert.ok(adjectiveNearMisses('たかい', 'i', 'negative').includes('たかじゃない'));
  assert.ok(adjectiveNearMisses('いい', 'i', 'negative').includes('よじゃない'));
});

test('readings go over the kanji only', () => {
  assert.equal(furiganaOf('たべる', '食べる'), '{食|た}べる');
  assert.equal(furiganaOf('べんきょうする', '勉強する'), '{勉強|べんきょう}する');
  assert.equal(furiganaOf('おいしい', ''), 'おいしい');
  assert.equal(furiganaOf('げんき', '元気'), '{元気|げんき}');
});

test('the word lists are well formed', () => {
  const verbKeys = VERBS.map(verb => verb.kana + verb.kanji);
  assert.equal(new Set(verbKeys).size, verbKeys.length);
  const adjectiveKeys = ADJECTIVES.map(word => word.kana + word.kanji);
  assert.equal(new Set(adjectiveKeys).size, adjectiveKeys.length);
  [...VERBS, ...ADJECTIVES].forEach(word => {
    assert.ok(isKanaText(word.kana), word.kana);
    assert.ok(word.meaning, word.kana);
  });
  VERBS.filter(verb => verb.verbClass === 'ichidan').forEach(verb =>
    assert.match(verb.kana, /[いきぎしじちにひびみりえけげせぜてでねへべめれ]る$/),
  );
  ADJECTIVES.filter(word => word.adjectiveClass === 'i').forEach(word => assert.match(word.kana, /い$/));
  const ids = [...Object.values(VERB_FORM_INFO), ...Object.values(ADJECTIVE_FORM_INFO)].map(info => info.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('there is a card per word and form, in a track of its own', () => {
  assert.deepEqual(TRACKS.find(track => track.id === 'forms')?.groups, ['cv', 'ca']);
  assert.equal(ROW_INFO.filter(row => row.group === 'cv').length, VERB_FORMS.length);
  assert.equal(ROW_INFO.filter(row => row.group === 'ca').length, ADJECTIVE_FORMS.length);
  const expected = (entries: { skip?: string[] }[], forms: string[]) =>
    forms.reduce((sum, form) => sum + entries.filter(entry => !entry.skip?.includes(form)).length, 0);
  assert.equal(cards.length, expected(VERBS, VERB_FORMS) + expected(ADJECTIVES, ADJECTIVE_FORMS));
  const ids = cards.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(isGrammarGroup('cv') && isGrammarGroup('ca'));
  assert.equal(directionOfGroup('mixed', 'cv'), 'cloze');
  const before = KANA.length;
  registerConjugation();
  assert.equal(KANA.length, before);
});

test('forms a verb doesn’t have are left out', () => {
  assert.ok(!KANA.some(item => item.id === '~conj-potential/分かる'));
  assert.ok(KANA.some(item => item.id === '~conj-te/分かる'));
  assert.ok(!KANA.some(item => item.id === '~conj-adj-adverb/欲しい'));
});

test('a card shows the word and takes the form in kana, romaji or with its kanji', () => {
  const go = getKana('~conj-te/行く');
  assert.equal(go.kana, '行く → いって');
  assert.equal(go.romaji, 'itte');
  assert.equal(go.cloze?.english, 'to go · て form');
  assert.equal(go.cloze.reading, 'いく、いって');
  assert.ok(isGrammar(go) && supportsDirection(go, 'cloze') && !supportsDirection(go, 'read'));
  for (const answer of ['いって', 'itte', '行って']) assert.ok(isCorrectAnswer(go, 'cloze', answer), answer);
  for (const answer of ['いきて', 'ikite', '行きて']) assert.ok(!isCorrectAnswer(go, 'cloze', answer), answer);

  // は isn't a particle here, though the same kana is in a grammar card's answer.
  const speak = getKana('~conj-negative/話す');
  assert.equal(speak.romaji, 'hanasanai');
  assert.ok(isCorrectAnswer(speak, 'cloze', 'はなさない'));

  // Long vowels can be typed any of the usual ways.
  for (const answer of ['kaerou', 'kaeroo', 'かえろう']) {
    assert.ok(isCorrectAnswer(getKana('~conj-volitional/帰る'), 'cloze', answer), answer);
  }
  const quiet = getKana('~conj-adj-negative/静か');
  for (const answer of ['しずかじゃない', 'しずかではない', '静かじゃない', 'shizukajanai', 'shizukadewanai']) {
    assert.ok(isCorrectAnswer(quiet, 'cloze', answer), answer);
  }
});

test('two verbs with the same kana keep their own cards and forms', () => {
  assert.ok(isCorrectAnswer(getKana('~conj-te/切る'), 'cloze', 'きって'));
  assert.ok(!isCorrectAnswer(getKana('~conj-te/切る'), 'cloze', 'きて'));
  assert.ok(isCorrectAnswer(getKana('~conj-te/着る'), 'cloze', 'きて'));
  assert.ok(!isCorrectAnswer(getKana('~conj-te/着る'), 'cloze', 'きって'));
});

test('every card offers four different choices, one of them right', () => {
  cards.forEach(item => {
    const choices = buildChoices(item, { direction: 'cloze', random: first });
    assert.equal(new Set(choices).size, 4, item.id);
    assert.equal(choices.filter(choice => item.cloze?.answers.includes(choice)).length, 1, item.id);
    assert.ok((item.cloze?.distractors?.length ?? 0) <= MAX_DISTRACTORS, item.id);
    assert.ok(choices.every(isKanaText), item.id);
  });
});

test('words the learner knows are conjugated first', () => {
  const row = ROW_INFO.find(info => info.label === 'て form');
  assert.ok(row);
  const state = updateSettings(defaultState(), { rows: [row.id], direction: 'cloze', introduce: false }, NOW);
  const fresh = chooseNext(state, newSession(), { now: NOW, random: first });
  assert.ok(fresh.status === 'card' && fresh.item.id === '~conj-te/食べる');

  const swim = getKana('~conj-te/泳ぐ');
  const base = swim.cloze?.baseId ?? '';
  assert.ok(base);
  assert.ok(!knowsBaseWord(swim, {}));
  assert.ok(knowsBaseWord(swim, { [base]: seen }));
  assert.ok(knowsBaseWord(swim, { [`meaning:${base}`]: seen }));
  assert.ok(!knowsBaseWord(swim, { [base]: { ...seen, box: 1 } }));
  assert.ok(!knowsBaseWord(getKana('あ'), { あ: seen }));
  const known = { ...state, stats: { [base]: seen } };
  const step = chooseNext(known, newSession(), { now: NOW, random: first });
  assert.ok(step.status === 'card' && step.item.id === swim.id);
});

test('progress on a form survives a save', () => {
  const key = statKey(getKana('~conj-te/行く'), 'cloze');
  assert.equal(key, 'cloze:~conj-te/行く');
  const saved = { ...defaultState(), stats: { [key]: seen } };
  assert.deepEqual(Object.keys(migrateState(JSON.parse(JSON.stringify(saved)), NOW).stats), [key]);
});

test('every verb form names its rule, with the exceptions', () => {
  Object.values(VERB_FORM_INFO).forEach(info =>
    assert.ok(info.note.includes('る') || info.note.includes('た'), info.id),
  );
  assert.match(VERB_FORM_INFO.te.note, /いく is the exception/);
  assert.equal(new Set<VerbForm>(VERB_FORMS).size, 9);
});
