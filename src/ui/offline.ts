import { isKanji, KANA } from '../kana.ts';
import { loadKanji } from '../kanji-loader.ts';
import { $ } from './dom.ts';
import { KANJIVG_PATH, kanjivgFile } from './kanjivg.ts';

const AT_A_TIME = 8;
const REPORT_EVERY = 100;

// Kanji stroke files are otherwise cached the first time each is opened. Fetching them all goes through the service
// worker, which keeps them in the same cache.
async function downloadStrokes(onProgress: (done: number, total: number) => void): Promise<number> {
  await loadKanji();
  const files = KANA.filter(isKanji).map(item => `${KANJIVG_PATH}/${kanjivgFile(item.kana)}`);
  let next = 0;
  let done = 0;
  let failed = 0;
  const worker = async () => {
    while (next < files.length) {
      const file = files[next++] ?? '';
      try {
        const response = await fetch(file);
        if (!response.ok) failed++;
        await response.body?.cancel();
      } catch {
        failed++;
      }
      done++;
      if (done % REPORT_EVERY === 0) onProgress(done, files.length);
    }
  };
  await Promise.all(Array.from({ length: AT_A_TIME }, worker));
  return failed;
}

// The setting only appears once there is a service worker to keep the files.
export function createOfflineStrokes(): void {
  if (__DEV__ || !('serviceWorker' in navigator)) return;
  const section = $('#offline-settings');
  const button = $('#offline-download', HTMLButtonElement);
  const status = $('#offline-status');
  void navigator.serviceWorker.ready.then(() => {
    section.hidden = false;
  });

  button.addEventListener('click', () => {
    if (!navigator.serviceWorker.controller) {
      status.textContent = 'The app is still being set up for offline use. Try again in a moment.';
      return;
    }
    button.disabled = true;
    status.textContent = 'Downloading…';
    downloadStrokes((done, total) => {
      status.textContent = `Downloading… ${done} of ${total}`;
    })
      .then(failed => {
        status.textContent = failed
          ? `${failed} files couldn’t be downloaded. Check your connection and try again.`
          : 'Stroke order for every kanji is saved on this device.';
      })
      .catch(() => {
        status.textContent = 'The kanji list couldn’t be loaded. Check your connection and try again.';
      })
      .finally(() => {
        button.disabled = false;
      });
  });
}
