import {
  findKana,
  hasReadingStage,
  isKanji,
  isWord,
  kanaForAnswer,
  mainReading,
  otherScript,
  readingRomaji,
} from '../../kana.ts';
import { parseWritingAnswer } from '../../handwriting.ts';
import type { Direction, KanaItem, Mode } from '../../types.ts';
import { unique } from '../../util.ts';
import { jp } from '../dom.ts';
import { html, type Html } from '../html.ts';
import { GROUP_LABEL, SCRIPT_LABEL } from '../labels.ts';

export const typesKana = (direction: Direction): boolean => direction === 'recall' || direction === 'listen';

// The line under a character being introduced: how it reads and, for words and kanji, what it means.
export function introMarkup(item: KanaItem): Html {
  if (isKanji(item)) return html`<strong>${item.meanings?.[0]}</strong> · ${readingSummary(item)}`;
  if (isWord(item)) return html`<strong>${item.romaji}</strong> · ${item.meaning}`;
  return html`<strong>${item.romaji}</strong>`;
}

export function promptLabel(item: KanaItem, direction: Direction, mode: Mode, kanjiOnly = false): string {
  if (kanjiOnly) return `${GROUP_LABEL[item.group]} · stage 2: kanji only`;
  const action = mode === 'type' ? 'Type' : 'Pick';
  if (direction === 'recall')
    return `${action} the ${isWord(item) ? 'word' : item.script} · ${GROUP_LABEL[item.group]}`;
  if (direction === 'listen') return `Listen, then ${action.toLowerCase()} the ${isWord(item) ? 'word' : item.script}`;
  if (direction === 'match') return `${SCRIPT_LABEL[item.script]} → ${otherScript(item.script)}`;
  if (direction === 'meaning') return `${action} the meaning · ${GROUP_LABEL[item.group]}`;
  if (direction === 'write') return `Write the ${isKanji(item) ? 'kanji' : item.script} · ${GROUP_LABEL[item.group]}`;
  return `${SCRIPT_LABEL[item.script]} · ${GROUP_LABEL[item.group]}`;
}

export function placeholderFor(item: KanaItem, direction: Direction): string {
  if (direction === 'recall' && isWord(item)) return `Type the word in ${item.script} or romaji…`;
  if (typesKana(direction)) return `Type it in ${item.script}…`;
  if (direction === 'meaning') return 'Type the meaning in English…';
  if (isKanji(item)) return 'Type any reading in romaji…';
  return isWord(item) ? 'Romaji (long vowels as oo, ii…)' : 'Type the romaji…';
}

const READINGS_SHOWN = 4;

export const readingSummary = (item: KanaItem): string =>
  unique([...(item.readings?.on ?? []), ...(item.readings?.kun ?? [])].map(readingRomaji))
    .slice(0, READINGS_SHOWN)
    .join(' · ');

export const choiceButtons = (choices: string[], kanaOptions: boolean): Html[] =>
  choices.map(
    (value, i) =>
      html`<button type="button" class="choice${kanaOptions ? ' jp' : ''}" data-value="${value}">
        <kbd>${i + 1}</kbd>${value}
      </button>`,
  );

export const promptMarkup = (item: KanaItem, kanjiOnly = false): Html =>
  hasReadingStage(item)
    ? html`<span class="prompt-kanji">${item.kanji ?? item.kana}</span>${
          !kanjiOnly && html`<span class="prompt-reading">${isKanji(item) ? mainReading(item) : item.kana}</span>`
        }`
    : html`${item.kana}`;

// Recalling a word starts from its meaning.
export const meaningPromptMarkup = (item: KanaItem): Html => html`<span class="prompt-meaning">${item.meaning}</span>`;

// Write mode names the character without showing it: romaji for kana, meaning and main reading for kanji.
export const writePromptMarkup = (item: KanaItem): Html =>
  isKanji(item)
    ? html`<span class="prompt-meaning">${item.meanings?.[0]}</span
        ><span class="prompt-reading jp">${mainReading(item)}</span>`
    : html`${item.romaji}`;

const spelled = (item: KanaItem): Html => (item.kanji ? html`${jp(item.kanji)} (${jp(item.kana)})` : jp(item.kana));

// What a listening card played: the kana and its romaji, and for a word its meaning too.
const heard = (item: KanaItem): Html =>
  isWord(item) ? html`${spelled(item)}, ${item.romaji} “${item.meaning}”` : html`${jp(item.kana)} (${item.romaji})`;

function picked(given: string): Html {
  const item = findKana(given);
  return html`${jp(given)}${item && ` (${item.romaji})`}`;
}

export function resultMessage(item: KanaItem, direction: Direction, isCorrect: boolean, given: string | null): Html {
  const yourPick = given === null ? '' : html` You answered ${picked(given)}.`;
  if (direction === 'recall' && isWord(item)) {
    return isCorrect
      ? html`<strong>Correct!</strong> “${item.meaning}” is ${spelled(item)}, ${item.romaji}.`
      : html`<strong>“${item.meaning}” is ${spelled(item)}, ${item.romaji}.</strong>${yourPick}`;
  }
  if (direction === 'recall') {
    return isCorrect
      ? html`<strong>Correct!</strong> ${item.romaji} = ${jp(item.kana)}`
      : html`<strong>${item.romaji} is ${jp(item.kana)}.</strong>${yourPick}`;
  }
  if (direction === 'listen') {
    return isCorrect
      ? html`<strong>Correct!</strong> That was ${heard(item)}.`
      : html`<strong>That was ${heard(item)}.</strong>${yourPick}`;
  }
  if (direction === 'match') {
    const counterpart = item.counterpart ?? '';
    return isCorrect
      ? html`<strong>Correct!</strong> ${jp(item.kana)} = ${jp(counterpart)}`
      : html`<strong>${jp(item.kana)} is ${jp(counterpart)} in ${otherScript(item.script)}.</strong>${yourPick}`;
  }
  if (direction === 'write') {
    const written = given === null ? null : parseWritingAnswer(given);
    const retried = written?.mistakes ? ` ${written.mistakes} of ${written.strokes} strokes needed another try.` : '';
    return isCorrect
      ? html`<strong>Correct!</strong> ${jp(item.kana)} (${item.romaji}).${retried}`
      : html`<strong>That was ${jp(item.kana)} (${item.romaji}).</strong>${retried}`;
  }
  if (direction === 'meaning') {
    const shown = isWord(item) ? spelled(item) : jp(item.kana);
    return isCorrect
      ? html`<strong>Correct!</strong> ${shown} means “${item.meaning}”.`
      : html`<strong>${shown} means “${item.meaning}”.</strong>${given === null ? '' : ` You answered “${given}”.`}`;
  }
  if (isKanji(item)) {
    return isCorrect
      ? html`<strong>Correct!</strong> ${jp(item.kana)} reads ${readingSummary(item)}.`
      : html`<strong>${jp(item.kana)} reads ${readingSummary(item)}.</strong
          >${given === null ? '' : ` You answered “${given}”.`}`;
  }
  if (isCorrect) return html`<strong>Correct!</strong> ${spelled(item)} = ${item.romaji}`;
  if (given === null) return html`<strong>${spelled(item)} is “${item.romaji}”.</strong>`;
  const confusedWith = kanaForAnswer(given, item.script);
  return html`<strong>${spelled(item)} is “${item.romaji}”.</strong> You answered
    “${given}”${confusedWith && html`, which is ${jp(confusedWith.kana)}`}.`;
}
