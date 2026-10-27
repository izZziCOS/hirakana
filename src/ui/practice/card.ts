import { findKana, isWord, kanaForAnswer, otherScript } from '../../kana.ts';
import type { Direction, KanaItem, Mode } from '../../types.ts';
import { jp } from '../dom.ts';
import { html, type Html } from '../html.ts';
import { GROUP_LABEL, SCRIPT_LABEL } from '../labels.ts';

export const typesKana = (direction: Direction): boolean => direction === 'recall' || direction === 'listen';

export function promptLabel(item: KanaItem, direction: Direction, mode: Mode): string {
  const action = mode === 'type' ? 'Type' : 'Pick';
  if (direction === 'recall') return `${action} the ${item.script} · ${GROUP_LABEL[item.group]}`;
  if (direction === 'listen') return `Listen, then ${action.toLowerCase()} the ${item.script}`;
  if (direction === 'match') return `${SCRIPT_LABEL[item.script]} → ${otherScript(item.script)}`;
  return `${SCRIPT_LABEL[item.script]} · ${GROUP_LABEL[item.group]}`;
}

export function placeholderFor(item: KanaItem, direction: Direction): string {
  if (typesKana(direction)) return `Type it in ${item.script}…`;
  return isWord(item) ? 'Romaji (long vowels as oo, ii…)' : 'Type the romaji…';
}

export const choiceButtons = (choices: string[], kanaOptions: boolean): Html[] =>
  choices.map(
    (value, i) =>
      html`<button type="button" class="choice${kanaOptions ? ' jp' : ''}" data-value="${value}">
        <kbd>${i + 1}</kbd>${value}
      </button>`,
  );

export const promptMarkup = (item: KanaItem): Html =>
  item.kanji
    ? html`<span class="prompt-kanji">${item.kanji}</span><span class="prompt-reading">${item.kana}</span>`
    : html`${item.kana}`;

const spelled = (item: KanaItem): Html => (item.kanji ? html`${jp(item.kanji)} (${jp(item.kana)})` : jp(item.kana));

function picked(given: string): Html {
  const item = findKana(given);
  return html`${jp(given)}${item && ` (${item.romaji})`}`;
}

export function resultMessage(item: KanaItem, direction: Direction, isCorrect: boolean, given: string | null): Html {
  const yourPick = given === null ? '' : html` You answered ${picked(given)}.`;
  if (direction === 'recall') {
    return isCorrect
      ? html`<strong>Correct!</strong> ${item.romaji} = ${jp(item.kana)}`
      : html`<strong>${item.romaji} is ${jp(item.kana)}.</strong>${yourPick}`;
  }
  if (direction === 'listen') {
    return isCorrect
      ? html`<strong>Correct!</strong> That was ${jp(item.kana)} (${item.romaji}).`
      : html`<strong>That was ${jp(item.kana)} (${item.romaji}).</strong>${yourPick}`;
  }
  if (direction === 'match') {
    const counterpart = item.counterpart ?? '';
    return isCorrect
      ? html`<strong>Correct!</strong> ${jp(item.kana)} = ${jp(counterpart)}`
      : html`<strong>${jp(item.kana)} is ${jp(counterpart)} in ${otherScript(item.script)}.</strong>${yourPick}`;
  }
  if (isCorrect) return html`<strong>Correct!</strong> ${spelled(item)} = ${item.romaji}`;
  if (given === null) return html`<strong>${spelled(item)} is “${item.romaji}”.</strong>`;
  const confusedWith = kanaForAnswer(given, item.script);
  return html`<strong>${spelled(item)} is “${item.romaji}”.</strong> You answered
    “${given}”${confusedWith && html`, which is ${jp(confusedWith.kana)}`}.`;
}
