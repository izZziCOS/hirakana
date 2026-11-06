import { recordingOf } from '../audio.ts';
import { spokenText } from '../kana.ts';
import type { KanaItem } from '../types.ts';

export const canSpeak = 'speechSynthesis' in window;

const japaneseVoice = (): SpeechSynthesisVoice | undefined =>
  canSpeak ? speechSynthesis.getVoices().find(voice => voice.lang.toLowerCase().startsWith('ja')) : undefined;

export const hasJapaneseVoice = (): boolean => japaneseVoice() !== undefined;

export function onVoicesChanged(callback: () => void): void {
  if (canSpeak) speechSynthesis.addEventListener('voiceschanged', callback);
}

let context: AudioContext | undefined;
let playing: AudioBufferSourceNode | undefined;
// Counts what has been asked for, so a recording still loading doesn't start over a later one.
let request = 0;
const loaded = new Map<string, Promise<AudioBuffer>>();

function stopRecording(): void {
  request++;
  try {
    playing?.stop();
  } catch {
    // It had already finished.
  }
  playing = undefined;
}

export function speak(text: string): void {
  stopRecording();
  if (!canSpeak || !text) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = 0.8;
  const voice = japaneseVoice();
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}

// Decoded through Web Audio rather than played by an <audio> element, which Safari won't load from a service worker's
// cache without range requests.
function load(audio: AudioContext, stem: string): Promise<AudioBuffer> {
  const known = loaded.get(stem);
  if (known) return known;
  const loading = fetch(`audio/${stem}.mp3`)
    .then(response => {
      if (!response.ok) throw new Error(`Recording ${stem}: ${String(response.status)}`);
      return response.arrayBuffer();
    })
    .then(bytes => audio.decodeAudioData(bytes));
  loaded.set(stem, loading);
  loading.catch(() => loaded.delete(stem));
  return loading;
}

async function playRecording(stem: string): Promise<void> {
  stopRecording();
  if (canSpeak) speechSynthesis.cancel();
  const asked = request;
  context ??= new AudioContext();
  const audio = context;
  if (audio.state === 'suspended') await audio.resume();
  const buffer = await load(audio, stem);
  if (asked !== request) return;
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.connect(audio.destination);
  source.start();
  playing = source;
}

// Whether a card can be heard: from its recording, or from the browser's voice.
export const canSay = (item: KanaItem): boolean => canSpeak || recordingOf(item) !== undefined;

// Says a card: its recording if it has one, otherwise, or if the recording can't be played, the browser's voice.
export function say(item: KanaItem): void {
  const stem = recordingOf(item);
  if (!stem || !('AudioContext' in window)) {
    speak(spokenText(item));
    return;
  }
  playRecording(stem).catch(() => {
    speak(spokenText(item));
  });
}
