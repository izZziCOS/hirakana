import { escapeHtml } from '../util.ts';

const MARKUP = Symbol('markup');

export interface Html {
  readonly [MARKUP]: string;
}

export type HtmlValue = string | number | false | null | undefined | Html | HtmlValue[];

const isHtml = (value: unknown): value is Html => typeof value === 'object' && value !== null && MARKUP in value;

export const trusted = (markup: string): Html => ({ [MARKUP]: markup });

function render(value: HtmlValue): string {
  if (value === false || value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(render).join('');
  if (isHtml(value)) return value[MARKUP];
  return escapeHtml(value);
}

export function html(strings: TemplateStringsArray, ...values: HtmlValue[]): Html {
  return trusted(strings.reduce((markup, part, i) => markup + part + (i < values.length ? render(values[i]) : ''), ''));
}

export const toMarkup = (value: HtmlValue): string => render(value);

export function setHtml(element: Element, content: HtmlValue): void {
  element.innerHTML = render(content);
}
