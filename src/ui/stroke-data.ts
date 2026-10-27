import { KANJIVG_PATH, kanjivgFile } from './kanjivg.ts';

const FETCH_TIMEOUT_MS = 8000;

export interface StrokeData {
  paths: string[];
  numbers: { label: string; transform: string }[];
}

const strokeCache = new Map<string, Promise<StrokeData>>();

async function fetchStrokes(char: string): Promise<StrokeData> {
  const response = await fetch(`${KANJIVG_PATH}/${kanjivgFile(char)}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const doc = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
  return {
    paths: [...doc.querySelectorAll('[id^="kvg:StrokePaths"] path')].map(path => path.getAttribute('d') ?? ''),
    numbers: [...doc.querySelectorAll('[id^="kvg:StrokeNumbers"] text')].map(text => ({
      label: text.textContent,
      transform: text.getAttribute('transform') ?? '',
    })),
  };
}

export function loadStrokes(char: string): Promise<StrokeData> {
  let request = strokeCache.get(char);
  if (!request) {
    request = fetchStrokes(char);
    request.catch(() => strokeCache.delete(char));
    strokeCache.set(char, request);
  }
  return request;
}
