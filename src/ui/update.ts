import { $ } from './dom.ts';

const CHECK_EVERY_MS = 60 * 60 * 1000;
const READY_MESSAGE = 'A new version of Kana Dojo is ready.';

export interface UpdateNote {
  show(message?: string): void;
}

export function createUpdateNote(): UpdateNote {
  const note = $('#update-note');
  $('#update-reload').addEventListener('click', () => location.reload());
  return {
    show(message = READY_MESSAGE) {
      $('#update-text').textContent = message;
      note.hidden = false;
    },
  };
}

// Registers the service worker and says when a new version has taken over. This tab keeps running the code it opened
// with, whose lazily loaded files may be gone from the server, so it asks to reload rather than interrupt a session.
export function watchForUpdates(note: UpdateNote): void {
  if (__DEV__ || !('serviceWorker' in navigator)) return;
  const workers = navigator.serviceWorker;
  // The first service worker a page gets isn't an update.
  let controlled = Boolean(workers.controller);
  workers.addEventListener('controllerchange', () => {
    if (controlled) note.show();
    controlled = true;
  });
  workers
    .register('sw.js')
    .then(registration => {
      // An app that stays open is never navigated, which is when browsers usually look for updates.
      let checked = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.hidden || Date.now() - checked < CHECK_EVERY_MS) return;
        checked = Date.now();
        registration.update().catch(() => undefined);
      });
    })
    .catch(() => undefined);
}
