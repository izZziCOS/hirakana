import { RECORDINGS } from './audio-data.ts';
import type { KanaItem } from './types.ts';

// The recording of a card, if it has one: the name of its file in audio/, without the extension.
export const recordingOf = (item: KanaItem): string | undefined =>
  Object.hasOwn(RECORDINGS, item.id) ? RECORDINGS[item.id] : undefined;
