import { codePoints } from '../util.ts';
import { html, type Html } from './html.ts';

type ElementType<T extends HTMLElement> = abstract new (...args: never[]) => T;

export function $(selector: string): HTMLElement;
export function $<T extends HTMLElement>(selector: string, type: ElementType<T>): T;
export function $(selector: string, type: ElementType<HTMLElement> = HTMLElement): HTMLElement {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`Expected ${type.name} at ${selector}`);
  return element;
}

export const jp = (text: string): Html => html`<span class="jp">${text}</span>`;

export const bigJp = (text: string): Html => html`<span class="jp big">${text}</span>`;

export function onSegmented(selector: string, handler: (value: string) => void): void {
  $(selector).addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-value]');
    if (button?.dataset.value !== undefined) handler(button.dataset.value);
  });
}

export function press(selector: string, value: string | number): void {
  document
    .querySelectorAll<HTMLButtonElement>(`${selector} button`)
    .forEach(button => button.setAttribute('aria-pressed', String(button.dataset.value === String(value))));
}

export function onDelegate(container: HTMLElement, selector: string, handler: (element: HTMLElement) => void): void {
  container.addEventListener('click', event => {
    const element = (event.target as Element).closest<HTMLElement>(selector);
    if (element && container.contains(element)) handler(element);
  });
}

export function sizeClass(kana: string): string {
  const length = codePoints(kana).length;
  if (length > 2) return 'is-word';
  return length === 2 ? 'is-combo' : '';
}
