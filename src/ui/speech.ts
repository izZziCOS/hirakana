export const canSpeak = 'speechSynthesis' in window;

const japaneseVoice = (): SpeechSynthesisVoice | undefined =>
  canSpeak ? speechSynthesis.getVoices().find(voice => voice.lang.toLowerCase().startsWith('ja')) : undefined;

export const hasJapaneseVoice = (): boolean => japaneseVoice() !== undefined;

export function onVoicesChanged(callback: () => void): void {
  if (canSpeak) speechSynthesis.addEventListener('voiceschanged', callback);
}

export function speak(text: string): void {
  if (!canSpeak || !text) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = 0.8;
  const voice = japaneseVoice();
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}
