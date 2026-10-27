import { compareStroke, type Point, STROKE_HINTS } from '../handwriting.ts';
import { codePoints } from '../util.ts';
import { html, setHtml } from './html.ts';
import { loadStrokes } from './stroke-data.ts';

const UNITS = 109;
const SAMPLES = 48;
const SVG_NS = 'http://www.w3.org/2000/svg';
const HINT_MS = 1400;

interface Palette {
  ink: string;
  guide: string;
  hint: string;
}

function samplePaths(paths: string[]): Point[][] {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  document.body.append(svg);
  const sampled = paths.map(d => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
    const length = path.getTotalLength();
    return Array.from({ length: SAMPLES }, (_, i) => {
      const point = path.getPointAtLength((length * i) / (SAMPLES - 1));
      return { x: point.x, y: point.y };
    });
  });
  svg.remove();
  return sampled;
}

function palette(canvas: HTMLCanvasElement): Palette {
  const style = getComputedStyle(canvas);
  return { ink: style.color, guide: style.borderTopColor, hint: style.outlineColor };
}

function drawLine(
  context: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  width: number,
  dash: number[] = [],
) {
  const [first, ...rest] = points;
  if (!first) return;
  context.strokeStyle = color;
  context.lineWidth = width;
  context.setLineDash(dash);
  context.beginPath();
  context.moveTo(first.x, first.y);
  rest.forEach(point => context.lineTo(point.x, point.y));
  context.stroke();
  context.setLineDash([]);
}

interface WritingOptions {
  // In Write mode the character is the answer: no guide, no title naming it, and retries keep counting.
  quiz?: boolean;
  onDone?: (mistakes: number, strokes: number) => void;
}

export function mountWritingPad(
  container: HTMLElement,
  kana: string,
  { quiz = false, onDone }: WritingOptions = {},
): void {
  const chars = codePoints(kana);
  let charIndex = 0;
  let expected: Point[][] = [];
  let accepted: Point[][] = [];
  let drawing: Point[] | null = null;
  let hint: Point[] | null = null;
  let mistakes = 0;
  let showGuide = !quiz;
  let hintTimer: number | undefined;

  setHtml(
    container,
    html`<div class="writing-head">
        <strong class="writing-title"></strong>
        <span class="muted small writing-progress"></span>
      </div>
      <canvas class="writing-canvas" width="440" height="440" role="img" aria-label="Writing area"></canvas>
      <p class="writing-status small" aria-live="polite"></p>
      <div class="writing-actions">
        <button type="button" class="ghost small" data-writing="guide" aria-pressed="true" ${quiz && html`hidden`}>
          Guide
        </button>
        <button type="button" class="ghost small" data-writing="clear">Start over</button>
        <button type="button" class="primary small" data-writing="next" hidden>Next character</button>
      </div>`,
  );

  const canvas = container.querySelector('canvas');
  const context = canvas?.getContext('2d');
  const title = container.querySelector('.writing-title');
  const progress = container.querySelector('.writing-progress');
  const status = container.querySelector('.writing-status');
  const nextButton = container.querySelector<HTMLButtonElement>('[data-writing="next"]');
  const guideButton = container.querySelector<HTMLButtonElement>('[data-writing="guide"]');
  if (!canvas || !context || !title || !progress || !status || !nextButton || !guideButton) return;

  function render(): void {
    if (!canvas || !context) return;
    const colors = palette(canvas);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(canvas.width / UNITS, 0, 0, canvas.height / UNITS, 0, 0);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    drawLine(
      context,
      [
        { x: UNITS / 2, y: 0 },
        { x: UNITS / 2, y: UNITS },
      ],
      colors.guide,
      0.4,
      [2, 2],
    );
    drawLine(
      context,
      [
        { x: 0, y: UNITS / 2 },
        { x: UNITS, y: UNITS / 2 },
      ],
      colors.guide,
      0.4,
      [2, 2],
    );
    if (showGuide) expected.forEach(stroke => drawLine(context, stroke, colors.guide, 5));
    accepted.forEach(stroke => drawLine(context, stroke, colors.ink, 4));
    if (hint) {
      drawLine(context, hint, colors.hint, 3, [4, 3]);
      const start = hint[0];
      if (start) {
        context.fillStyle = colors.hint;
        context.beginPath();
        context.arc(start.x, start.y, 3.5, 0, Math.PI * 2);
        context.fill();
      }
    }
    if (drawing) drawLine(context, drawing, colors.ink, 4);
  }

  function updateLabels(message = ''): void {
    if (!title || !progress || !status || !nextButton) return;
    const done = accepted.length === expected.length && expected.length > 0;
    title.textContent = quiz ? 'Write it from memory' : `Write ${chars[charIndex] ?? ''}`;
    progress.textContent = done ? 'Done' : `Stroke ${accepted.length + 1} of ${expected.length}`;
    if (done) {
      status.textContent =
        mistakes === 0
          ? 'Well written! Every stroke was right first time.'
          : `Done, with ${mistakes} stroke(s) retried.`;
    } else {
      status.textContent = message;
    }
    nextButton.hidden = !done || charIndex >= chars.length - 1;
  }

  async function loadCharacter(index: number): Promise<void> {
    charIndex = index;
    accepted = [];
    mistakes = 0;
    hint = null;
    const strokes = await loadStrokes(chars[index] ?? '');
    expected = samplePaths(strokes.paths);
    updateLabels('Draw the first stroke.');
    render();
  }

  const toUnits = (event: PointerEvent): Point => {
    const box = canvas.getBoundingClientRect();
    return { x: ((event.clientX - box.left) / box.width) * UNITS, y: ((event.clientY - box.top) / box.height) * UNITS };
  };

  canvas.addEventListener('pointerdown', event => {
    if (accepted.length === expected.length) return;
    if (event.isTrusted) canvas.setPointerCapture(event.pointerId);
    drawing = [toUnits(event)];
    hint = null;
    render();
  });
  canvas.addEventListener('pointermove', event => {
    if (!drawing) return;
    drawing.push(toUnits(event));
    render();
  });
  canvas.addEventListener('pointerup', () => {
    const stroke = drawing;
    drawing = null;
    const target = expected[accepted.length];
    if (!stroke || !target) return;
    const verdict = compareStroke(stroke, target);
    if (verdict === 'ok') {
      accepted.push(stroke);
      updateLabels(accepted.length < expected.length ? 'Good. Next stroke.' : '');
      if (accepted.length === expected.length && charIndex === chars.length - 1) onDone?.(mistakes, expected.length);
    } else {
      mistakes++;
      hint = target;
      updateLabels(STROKE_HINTS[verdict]);
      window.clearTimeout(hintTimer);
      hintTimer = window.setTimeout(() => {
        hint = null;
        render();
      }, HINT_MS);
    }
    render();
  });

  container.addEventListener('click', event => {
    const action = (event.target as Element).closest<HTMLElement>('[data-writing]')?.dataset.writing;
    if (action === 'guide') {
      showGuide = !showGuide;
      guideButton.setAttribute('aria-pressed', String(showGuide));
      render();
    } else if (action === 'clear') {
      accepted = [];
      if (!quiz) mistakes = 0;
      updateLabels('Draw the first stroke.');
      render();
    } else if (action === 'next') {
      void loadCharacter(charIndex + 1);
    }
  });

  void loadCharacter(0);
}
