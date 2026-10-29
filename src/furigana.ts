// Japanese text with readings over its kanji, written {漢字|かんじ}.

// A run of text, with its reading when it is written in kanji.
export interface Segment {
  text: string;
  reading?: string;
}

export function parseSentence(markup: string): Segment[] {
  const segments: Segment[] = [];
  const pattern = /\{([^|}]+)\|([^}]+)\}/g;
  let last = 0;
  for (const match of markup.matchAll(pattern)) {
    if (match.index > last) segments.push({ text: markup.slice(last, match.index) });
    segments.push({ text: match[1] ?? '', reading: match[2] ?? '' });
    last = match.index + match[0].length;
  }
  if (last < markup.length) segments.push({ text: markup.slice(last) });
  return segments;
}

export const plainText = (segments: Segment[]): string => segments.map(segment => segment.text).join('');

// The text in kana, as it is read aloud.
export const readingOf = (segments: Segment[]): string =>
  segments.map(segment => segment.reading ?? segment.text).join('');
