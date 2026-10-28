import { answerOf } from '../../choices.ts';
import { formatWait } from '../../format.ts';
import { writingAnswer } from '../../handwriting.ts';
import { hasReadingStage, isKanji, isWord, normalizeAnswer, statKey } from '../../kana.ts';
import { milestonesOf } from '../../milestones.ts';
import {
  ADVANCE_DELAY,
  type AnswerResult,
  canForgiveTypo,
  chooseNext,
  effectiveMode,
  endDrill,
  feedbackNote,
  finishIntro,
  forgiveTypo,
  justReachedGoal,
  learnMore,
  markUntimed,
  practiseExtra,
  revealCard,
  showCard,
  startDrill,
  submitAnswer,
  undoAnswer,
} from '../../session.ts';
import { rowsSummary, updateSettings } from '../../state.ts';
import type { AppStores } from '../../store.ts';
import type { Card, KanaItem, Session } from '../../types.ts';
import { codePoints } from '../../util.ts';
import { bindInfoLinks, type KanaDialog } from '../dialog.ts';
import { $ } from '../dom.ts';
import { html, setHtml } from '../html.ts';
import { renderInfo } from '../info.ts';
import { DIRECTION_LABEL, KIND_BADGE } from '../labels.ts';
import { canSpeak, hasJapaneseVoice, onVoicesChanged, speak } from '../speech.ts';
import { mountStrokeOrder } from '../strokes.ts';
import { mountWritingPad } from '../writing.ts';
import {
  choiceButtons,
  introMarkup,
  placeholderFor,
  promptLabel,
  promptMarkup,
  resultMessage,
  typesKana,
  meaningPromptMarkup,
  writePromptMarkup,
} from './card.ts';
import { kanaPad } from './kana-pad.ts';
import { doneScreen, sessionBar } from './summary.ts';

export interface Practice {
  next(): void;
  focus(): void;
  drill(label: string, items: KanaItem[]): void;
}

const COMPOSITION_GRACE_MS = 80;
const NO_VOICE_MESSAGE =
  'Listening needs a Japanese voice, and this browser doesn’t have one. Install one in your system’s speech settings, or practise another direction.';

function practiceElements() {
  return {
    card: $('#card'),
    script: $('#card-script'),
    badge: $('#card-badge'),
    prompt: $('#kana'),
    intro: $('#card-intro'),
    learn: $('#learn-btn', HTMLButtonElement),
    done: $('#done'),
    form: $('#answer-form', HTMLFormElement),
    input: $('#answer-input', HTMLInputElement),
    check: $('#check-btn', HTMLButtonElement),
    padToggle: $('#pad-toggle', HTMLButtonElement),
    pad: $('#kana-pad'),
    choices: $('#choices'),
    writePad: $('#write-pad'),
    feedback: $('#feedback'),
    skip: $('#skip-btn', HTMLButtonElement),
    typo: $('#typo-btn', HTMLButtonElement),
    undo: $('#undo-btn', HTMLButtonElement),
    nextButton: $('#next-btn', HTMLButtonElement),
    speak: $('#speak-btn', HTMLButtonElement),
    info: $('#info', HTMLDetailsElement),
    infoHint: $('#info-hint'),
    infoBody: $('#info-body'),
    session: $('#session'),
    drillBanner: $('#drill-banner'),
    drillText: $('#drill-text'),
    context: $('#session-context'),
  };
}

export function createPractice({ data, session }: AppStores, isActive: () => boolean, dialog: KanaDialog): Practice {
  const els = practiceElements();
  let advanceTimer: number | undefined;
  let composing = false;
  let compositionEndedAt = -Infinity;

  const settings = () => data.get().settings;
  const modeOf = (card: Card) => effectiveMode(settings(), card.direction);

  function resetCard(): void {
    window.clearTimeout(advanceTimer);
    els.card.classList.remove('is-correct', 'is-wrong', 'is-empty');
    els.script.textContent = '';
    els.badge.hidden = true;
    const parts = [els.prompt, els.intro, els.done, els.form, els.pad, els.choices, els.writePad, els.skip, els.typo];
    [...parts, els.undo, els.nextButton, els.learn, els.speak, els.info].forEach(el => {
      el.hidden = true;
    });
    els.feedback.className = 'feedback';
    setHtml(els.feedback, html`&nbsp;`);
  }

  function renderEmpty(message: string): void {
    resetCard();
    els.card.classList.add('is-empty');
    els.feedback.textContent = message;
  }

  function sizePrompt(text: string, isRomaji: boolean, listening: boolean): void {
    const length = codePoints(text).length;
    els.prompt.lang = isRomaji ? 'en' : 'ja';
    els.prompt.classList.toggle('is-romaji', isRomaji);
    els.prompt.classList.toggle('is-listen', listening);
    els.prompt.classList.toggle('is-combo', !isRomaji && length === 2);
    els.prompt.classList.toggle('is-word', !isRomaji && length > 2);
    els.prompt.classList.remove('enter');
    els.prompt.getBoundingClientRect();
    els.prompt.classList.add('enter');
  }

  function renderPrompt(card: Card): void {
    const { direction } = card;
    const listening = direction === 'listen';
    const writing = direction === 'write';
    const writingKanji = writing && isKanji(card.item);
    const isRomaji = direction === 'recall' || writing;
    // A word is recalled from its meaning rather than its romaji.
    const fromMeaning = direction === 'recall' && isWord(card.item);
    const prompt = listening
      ? '♪'
      : fromMeaning
        ? (card.item.meaning ?? '')
        : isRomaji
          ? card.item.romaji
          : card.item.kana;
    const withKanji = !listening && !isRomaji && hasReadingStage(card.item);
    const kanjiOnly = withKanji && Boolean(data.get().stats[statKey(card.item, direction)]?.kanjiOnly);
    els.prompt.hidden = false;
    if (fromMeaning) setHtml(els.prompt, meaningPromptMarkup(card.item));
    else if (writingKanji) setHtml(els.prompt, writePromptMarkup(card.item));
    else if (withKanji) setHtml(els.prompt, promptMarkup(card.item, kanjiOnly));
    else els.prompt.textContent = prompt;
    els.prompt.classList.toggle('has-kanji', withKanji || writingKanji);
    sizePrompt(prompt, isRomaji, listening);
    els.prompt.classList.toggle('is-meaning', fromMeaning);

    const label = promptLabel(card.item, direction, modeOf(card), kanjiOnly);
    els.script.textContent = settings().direction === 'mixed' ? `${DIRECTION_LABEL[direction]} · ${label}` : label;
    els.badge.hidden = false;
    els.badge.textContent = KIND_BADGE[card.kind];
    els.badge.className = `badge badge-${card.kind}`;
    els.badge.title =
      card.kind === 'ahead'
        ? 'Nothing is due right now, so this is extra practice and won’t move it forward in your schedule.'
        : '';
    if (listening) {
      els.speak.hidden = false;
      if (isActive()) speak(card.item.kana);
    }
  }

  // A character met for the first time is shown with its reading, stroke order and example before it is tested.
  function renderIntro(card: Card): void {
    const { item } = card;
    els.prompt.hidden = false;
    setHtml(els.prompt, promptMarkup(item));
    els.prompt.classList.toggle('has-kanji', hasReadingStage(item));
    sizePrompt(item.kana, false, false);
    els.script.textContent = `New ${isKanji(item) ? 'kanji' : item.script} · have a look, then you’ll be tested`;
    els.badge.hidden = false;
    els.badge.textContent = KIND_BADGE.new;
    els.badge.className = 'badge badge-new';
    els.intro.hidden = false;
    setHtml(els.intro, introMarkup(item));
    els.learn.hidden = false;
    els.speak.hidden = !canSpeak;
    els.info.hidden = false;
    els.info.open = true;
    els.infoHint.hidden = true;
    setHtml(els.infoBody, renderInfo(item, data.get()));
    void mountStrokeOrder(els.infoBody.querySelector<HTMLElement>('.stroke-order'));
    if (isActive()) {
      if (canSpeak) speak(item.kana);
      els.learn.focus();
    }
  }

  function learn(): void {
    const learned = finishIntro(data.get(), session.get(), Date.now());
    if (!learned) return;
    session.update(() => learned.session);
    data.update(() => learned.state);
    next();
  }

  function renderPad(card: Card): void {
    const kanaTyping = typesKana(card.direction);
    const showPad = kanaTyping && settings().kanaPad;
    els.padToggle.hidden = !kanaTyping;
    els.padToggle.setAttribute('aria-pressed', String(showPad));
    els.pad.hidden = !showPad;
    if (showPad) setHtml(els.pad, kanaPad(card.item.script === 'katakana' ? 'katakana' : 'hiragana'));
    els.input.inputMode = showPad ? 'none' : kanaTyping ? 'text' : 'latin';
  }

  function renderAnswerArea(card: Card): void {
    const { direction } = card;
    const typing = modeOf(card) === 'type';
    els.skip.hidden = false;
    if (direction === 'write') {
      els.writePad.hidden = false;
      mountWritingPad(els.writePad, card.item.kana, {
        quiz: true,
        onDone: (mistakes, strokes) => submit(writingAnswer(mistakes, strokes)),
      });
      return;
    }
    els.form.hidden = !typing;
    els.choices.hidden = typing;
    if (typing) {
      els.input.value = '';
      els.input.lang = typesKana(direction) ? 'ja' : 'en';
      els.input.placeholder = placeholderFor(card.item, direction);
      els.check.hidden = false;
      renderPad(card);
      if (isActive()) els.input.focus();
    } else {
      const kanaOptions = direction !== 'read' && direction !== 'meaning';
      els.choices.classList.toggle('kana-choices', kanaOptions);
      setHtml(els.choices, choiceButtons(card.choices, kanaOptions));
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }
  }

  function renderInfoPanel(card: Card): void {
    els.info.hidden = false;
    els.info.open = false;
    els.infoHint.hidden = false;
    els.infoHint.textContent =
      card.kind === 'new' ? '· new, open this to learn it' : '· peeking moves it back two steps';
    setHtml(els.infoBody, renderInfo(card.item, data.get()));
  }

  function renderCard(card: Card): void {
    resetCard();
    if (card.intro && !card.answered) {
      renderIntro(card);
      return;
    }
    renderPrompt(card);
    renderAnswerArea(card);
    renderInfoPanel(card);
  }

  function renderResult(
    card: Card,
    result: AnswerResult,
    given: string | null,
    goalReached: boolean,
    milestones: string[],
  ): void {
    const state = data.get();
    const { direction } = card;
    const due = state.stats[statKey(card.item, direction)]?.due ?? Date.now();
    const note = feedbackNote({ ...result, nextReview: formatWait(due - Date.now()) });

    els.card.classList.remove('is-correct', 'is-wrong');
    els.card.classList.add(result.isCorrect ? 'is-correct' : 'is-wrong');
    els.feedback.className = `feedback ${result.isCorrect ? 'good' : 'bad'}`;
    setHtml(
      els.feedback,
      html`${resultMessage(card.item, direction, result.isCorrect, given)}
        <div class="feedback-note">${note}</div>
        ${goalReached && html`<div class="goal-note">Session goal reached: ${state.settings.goal} cards. Nice work!</div>`}
        ${milestones.map(milestone => html`<div class="goal-note milestone">${milestone}</div>`)}`,
    );

    const answer = answerOf(card.item, direction);
    els.choices.querySelectorAll<HTMLButtonElement>('.choice').forEach(button => {
      button.disabled = true;
      if (button.dataset.value === answer) button.classList.add('correct');
      else if (button.dataset.value === given) button.classList.add('wrong');
    });

    els.check.hidden = true;
    els.pad.hidden = true;
    els.skip.hidden = true;
    els.typo.hidden = !canForgiveTypo(state, session.get());
    els.undo.hidden = !session.get().undo;
    els.nextButton.hidden = false;
    els.speak.hidden = !canSpeak;
    els.infoHint.hidden = true;
    setHtml(els.infoBody, renderInfo(card.item, state));
    if (els.info.open) void mountStrokeOrder(els.infoBody.querySelector<HTMLElement>('.stroke-order'));
  }

  function renderChrome(): void {
    const { drill } = session.get();
    els.drillBanner.hidden = !drill;
    els.drillText.textContent = drill ? `Drilling ${drill.label}` : '';
    els.context.textContent = drill
      ? `Drill · ${drill.label}`
      : `${DIRECTION_LABEL[settings().direction]} · ${rowsSummary(data.get())}`;
    setHtml(els.session, sessionBar(data.get(), session.get(), Date.now()));
  }

  function next(): void {
    resetCard();
    if (settings().direction === 'listen' && !hasJapaneseVoice()) {
      session.update(s => (s.card ? { ...s, card: null } : s));
      renderEmpty(NO_VOICE_MESSAGE);
      renderChrome();
      return;
    }
    const step = chooseNext(data.get(), session.get(), { now: Date.now(), voice: hasJapaneseVoice() });
    session.update(s => showCard(s, step, performance.now(), document.hidden));
    const { card } = session.get();
    if (card) {
      renderCard(card);
    } else if (step.status === 'done') {
      els.done.hidden = false;
      setHtml(els.done, doneScreen(data.get(), Date.now()));
    } else if (step.status === 'empty') {
      renderEmpty(step.message);
    }
    renderChrome();
  }

  function apply(result: AnswerResult | null, before: Session): void {
    const card = result?.session.card;
    if (!result || !card) return;
    window.clearTimeout(advanceTimer);
    const milestones = milestonesOf(data.get().stats, result.state.stats, card.item, card.direction, settings().script);
    session.update(() => result.session);
    data.update(() => result.state);
    renderResult(card, result, card.given, justReachedGoal(settings(), before, result.session), milestones);
    const delay = ADVANCE_DELAY[result.outcome];
    if (delay !== undefined && !milestones.length) advanceTimer = window.setTimeout(next, delay);
  }

  function submit(given: string | null): void {
    const before = session.get();
    apply(submitAnswer(data.get(), before, given, { now: Date.now(), clock: performance.now() }), before);
  }

  function submitTyped(): void {
    const { card } = session.get();
    if (!card) return;
    if (card.answered) {
      next();
      return;
    }
    if (composing || performance.now() - compositionEndedAt < COMPOSITION_GRACE_MS) return;
    const given = card.direction === 'meaning' ? els.input.value.trim() : normalizeAnswer(els.input.value);
    if (given) submit(given);
    else els.input.focus();
  }

  els.form.addEventListener('submit', event => {
    event.preventDefault();
    submitTyped();
  });
  els.input.addEventListener('compositionstart', () => {
    composing = true;
  });
  els.input.addEventListener('compositionend', () => {
    composing = false;
    compositionEndedAt = performance.now();
  });

  els.padToggle.addEventListener('click', () => {
    data.update(state => updateSettings(state, { kanaPad: !state.settings.kanaPad }));
    const { card } = session.get();
    if (card && !card.answered) renderPad(card);
  });

  els.pad.addEventListener('click', event => {
    const key = (event.target as Element).closest<HTMLElement>('[data-key], [data-pad]');
    if (!key) return;
    if (key.dataset.key) els.input.value += key.dataset.key;
    else if (key.dataset.pad === 'backspace') els.input.value = codePoints(els.input.value).slice(0, -1).join('');
    else if (key.dataset.pad === 'submit') submitTyped();
  });

  els.choices.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('.choice');
    if (button?.dataset.value !== undefined) submit(button.dataset.value);
  });

  els.done.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLElement>('[data-done]');
    if (!button) return;
    session.update(button.dataset.done === 'more' ? learnMore : practiseExtra);
    next();
  });

  els.typo.addEventListener('click', () => {
    const before = session.get();
    apply(forgiveTypo(data.get(), before, Date.now()), before);
  });

  els.undo.addEventListener('click', () => {
    const restored = undoAnswer(session.get(), performance.now());
    if (!restored?.session.card) return;
    data.update(() => restored.state);
    session.update(() => restored.session);
    renderCard(restored.session.card);
  });

  els.prompt.addEventListener('click', () => {
    const { card } = session.get();
    if (card?.direction === 'listen' || card?.intro) speak(card.item.kana);
  });
  els.skip.addEventListener('click', () => submit(null));
  els.nextButton.addEventListener('click', next);
  els.learn.addEventListener('click', learn);
  els.speak.addEventListener('click', () => speak(session.get().card?.item.kana ?? ''));
  $('#drill-exit').addEventListener('click', () => {
    session.update(endDrill);
    next();
  });

  els.info.addEventListener('toggle', () => {
    if (!els.info.open) return;
    session.update(revealCard);
    void mountStrokeOrder(els.infoBody.querySelector<HTMLElement>('.stroke-order'));
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) session.update(markUntimed);
  });

  document.addEventListener('keydown', event => {
    const { card } = session.get();
    const target = event.target as Element;
    if (!card || !isActive() || target.matches('input, textarea') || document.querySelector('dialog[open]')) return;
    if (card.intro && !card.answered) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      learn();
    } else if (!card.answered && modeOf(card) === 'choose' && /^[1-4]$/.test(event.key)) {
      const choice = card.choices[Number(event.key) - 1];
      if (choice !== undefined) submit(choice);
    } else if (card.answered && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      next();
    }
  });

  onVoicesChanged(() => {
    if (settings().direction === 'listen' && !session.get().card) next();
  });

  data.subscribe(renderChrome);
  session.subscribe(renderChrome);

  function drill(label: string, items: KanaItem[]): void {
    session.update(s => startDrill(s, { label, items }));
    next();
  }

  bindInfoLinks(els.infoBody, kana => dialog.open(kana), drill);

  return {
    next,
    focus() {
      const { card } = session.get();
      if (!card || card.answered) return;
      if (card.intro) {
        els.learn.focus();
        return;
      }
      if (card.direction === 'listen') speak(card.item.kana);
      if (modeOf(card) === 'type') els.input.focus();
    },
    drill,
  };
}
