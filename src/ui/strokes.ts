import { codePoints } from '../util.ts';
import { loadStrokes, type StrokeData } from './stroke-data.ts';
import { mountWritingPad } from './writing.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgElement(name: string, attributes: Record<string, string>): SVGElement {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function drawCharacter(strokes: StrokeData): SVGElement {
  const svg = svgElement('svg', { viewBox: '0 0 109 109', class: 'stroke-svg', 'aria-hidden': 'true' });
  const guide = svgElement('g', { class: 'stroke-guide' });
  const ink = svgElement('g', { class: 'stroke-ink' });
  const numbers = svgElement('g', { class: 'stroke-numbers' });
  strokes.paths.forEach(d => {
    guide.append(svgElement('path', { d }));
    ink.append(svgElement('path', { d }));
  });
  strokes.numbers.forEach(({ label, transform }) => {
    const text = svgElement('text', { transform });
    text.textContent = label;
    numbers.append(text);
  });
  svg.append(guide, ink, numbers);
  return svg;
}

function animateStrokes(stage: HTMLElement): void {
  let delay = 0.2;
  stage.querySelectorAll<SVGPathElement>('.stroke-ink path').forEach(path => {
    const length = path.getTotalLength();
    const duration = Math.max(0.3, length / 120);
    path.style.setProperty('--length', String(length));
    path.style.animation = 'none';
    void path.getBoundingClientRect();
    path.style.animation = `stroke-draw ${duration}s ease-in-out ${delay}s both`;
    delay += duration + 0.15;
  });
}

export async function mountStrokeOrder(container: HTMLElement | null): Promise<void> {
  if (!container || container.dataset.mounted) return;
  container.dataset.mounted = 'true';
  const stage = container.querySelector<HTMLElement>('.stroke-stage');
  const replay = container.querySelector<HTMLButtonElement>('.stroke-replay');
  const count = container.querySelector<HTMLElement>('.stroke-count');
  const writeToggle = container.querySelector<HTMLButtonElement>('.writing-toggle');
  const writing = container.querySelector<HTMLElement>('.writing');
  if (!stage || !replay || !count || !writeToggle || !writing) return;
  try {
    const characters = await Promise.all(codePoints(container.dataset.kana ?? '').map(loadStrokes));
    const counts = characters.map(character => character.paths.length);
    const total = counts.reduce((sum, n) => sum + n, 0);
    stage.replaceChildren(...characters.map(drawCharacter));
    count.textContent = `${counts.join(' + ')} stroke${total === 1 ? '' : 's'}`;
    replay.hidden = false;
    replay.addEventListener('click', () => animateStrokes(stage));
    writeToggle.hidden = false;
    writeToggle.addEventListener('click', () => {
      const opening = writing.hidden;
      writing.hidden = !opening;
      writeToggle.setAttribute('aria-expanded', String(opening));
      if (opening && !writing.childElementCount) mountWritingPad(writing, container.dataset.kana ?? '');
    });
    animateStrokes(stage);
  } catch {
    stage.textContent = 'Stroke order couldn’t be loaded.';
  }
}
