import { dayKey } from './days.ts';
import { sameDecks } from './decks.ts';
import { affectsPractice, endDrill, newSession, resetCard } from './session.ts';
import {
  backupStatus,
  clearMistakes,
  exportPayload,
  isSaved,
  markBackedUp,
  parseImport,
  resetProgress,
  updateSettings,
} from './state.ts';
import { kanjiLoaded } from './kana.ts';
import { loadKanji, needsKanji } from './kanji-loader.ts';
import { mergeStates } from './merge.ts';
import {
  browserStorage,
  createAppStores,
  discardUnreadableSave,
  isNewerSave,
  type KeyValueStorage,
  savedText,
  STORAGE_KEY,
  unreadableSave,
} from './store.ts';
import { broadcastChannel, openIdb } from './idb.ts';
import { isProgressStorage, openProgressStorage, THEME_KEY } from './progress-storage.ts';
import { deviceId } from './sync.ts';
import type { Theme } from './types.ts';
import { chooseAction, confirmAction } from './ui/confirm.ts';
import { createControls } from './ui/controls.ts';
import { createDialog, type StartDrill } from './ui/dialog.ts';
import { createHome } from './ui/home.ts';
import { $ } from './ui/dom.ts';
import { createMistakes } from './ui/mistakes.ts';
import { createMockTest } from './ui/mock-test.ts';
import { createOfflineStrokes } from './ui/offline.ts';
import { createPractice } from './ui/practice/index.ts';
import { createProgress } from './ui/progress.ts';
import { createReader } from './ui/reader.ts';
import { createSearch } from './ui/search.ts';
import { createSync } from './ui/sync.ts';
import { createUpdateNote, watchForUpdates } from './ui/update.ts';

type View = 'practice' | 'read' | 'progress' | 'mistakes';

const VIEWS: View[] = ['practice', 'read', 'progress', 'mistakes'];
const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_ICON: Record<Theme, string> = { system: '◐', light: '☀', dark: '☾' };
const THEME_LABEL: Record<Theme, string> = {
  system: 'Theme: same as your device',
  light: 'Theme: light',
  dark: 'Theme: dark',
};

function showError(error: unknown): void {
  const banner = document.getElementById('app-error');
  const detail = document.getElementById('app-error-detail');
  if (!banner || !detail) return;
  detail.textContent = error instanceof Error ? error.message : String(error);
  banner.hidden = false;
}

function applyTheme(theme: Theme): void {
  // Kept where boot.js can read it before the progress has loaded, so the page doesn't flash the other theme.
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Without localStorage the page takes on the theme a moment later.
  }
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  const toggle = $('#theme-toggle', HTMLButtonElement);
  toggle.setAttribute('aria-label', THEME_LABEL[theme]);
  toggle.title = THEME_LABEL[theme];
  $('#theme-icon').textContent = THEME_ICON[theme];
}

function download(name: string, text: string, type: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

// Asks the browser not to clear saved progress under storage pressure. Some browsers ask the user, so this waits until
// there is progress worth keeping.
function requestPersistentStorage(): void {
  if (!('storage' in navigator) || typeof navigator.storage.persist !== 'function') return;
  navigator.storage
    .persisted()
    .then(persisted => (persisted ? true : navigator.storage.persist()))
    .catch(() => undefined);
}

function start(storage: KeyValueStorage | null, recovered: string | null): void {
  const stores = createAppStores(storage);
  // What the last page didn't get to write is merged in, as another tab's progress would be.
  if (recovered !== null) stores.receive(recovered);
  const { data, session, saver } = stores;
  let activeView: View = 'practice';
  // The Learn tab is either the home screen or a practice session.
  let learning: 'home' | 'session' = 'home';
  const isActive = (view: View) => () => activeView === view;
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('.tab')];

  const startDrill: StartDrill = (label, items) => {
    search.close();
    mockTest.close();
    showView('practice');
    showLearn('session');
    practice.drill(label, items);
  };
  const dialog = createDialog(data, startDrill);
  const controls = createControls(data);
  const practice = createPractice(stores, () => activeView === 'practice' && learning === 'session', dialog);
  const home = createHome(
    stores,
    () => activeView === 'practice' && learning === 'home',
    () => exportProgress(),
  );

  function showLearn(mode: 'home' | 'session'): void {
    learning = mode;
    $('#learn-home').hidden = mode !== 'home';
    $('#learn-session').hidden = mode !== 'session';
    window.scrollTo(0, 0);
    if (mode === 'home') home.render();
    else practice.focus();
  }

  $('#continue-btn').addEventListener('click', () => showLearn('session'));
  $('#home-btn').addEventListener('click', () => showLearn('home'));

  const settingsDialog = $('#settings-dialog', HTMLDialogElement);
  $('#settings-btn').addEventListener('click', () => {
    syncView?.render();
    settingsDialog.showModal();
  });
  $('#settings-close').addEventListener('click', () => settingsDialog.close());
  settingsDialog.addEventListener('click', event => {
    if (event.target === settingsDialog) settingsDialog.close();
  });
  const mistakes = createMistakes(stores, dialog, startDrill, isActive('mistakes'));
  const search = createSearch(dialog);
  const mockTest = createMockTest(stores, dialog, startDrill, () => progress.render());
  const reader = createReader(stores, isActive('read'), dialog);
  const progress = createProgress(stores, {
    dialog,
    isActive: isActive('progress'),
    onSelectDay: day => {
      showView('mistakes');
      mistakes.showDay(day);
    },
    onMockTest: level => mockTest.open(level),
  });

  function showView(view: View, focusTab = false): void {
    activeView = view;
    tabs.forEach(tab => {
      const selected = tab.dataset.view === view;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focusTab) tab.focus();
    });
    document.querySelectorAll<HTMLElement>('.view').forEach(section => {
      section.hidden = section.id !== `view-${view}`;
    });
    if (view === 'progress') {
      progress.open();
      renderBackupStatus();
    }
    if (view === 'mistakes') mistakes.render();
    if (view === 'read') reader.render();
    if (view === 'practice' && learning === 'home') home.render();
    if (view === 'practice' && learning === 'session' && !focusTab) practice.focus();
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => showView(tab.dataset.view as View));
    tab.addEventListener('keydown', event => {
      const index = VIEWS.indexOf(tab.dataset.view as View);
      const targets: Record<string, number> = {
        ArrowRight: (index + 1) % VIEWS.length,
        ArrowLeft: (index - 1 + VIEWS.length) % VIEWS.length,
        Home: 0,
        End: VIEWS.length - 1,
      };
      const target = VIEWS[targets[event.key] ?? -1];
      if (!target) return;
      event.preventDefault();
      showView(target, true);
    });
  });

  $('#theme-toggle').addEventListener('click', () => {
    data.update(state => updateSettings(state, { theme: NEXT_THEME[state.settings.theme] }));
  });

  // A card or drill from a deleted deck can't stay on screen.
  data.subscribe((state, previous) => {
    if (sameDecks(state.decks, previous.decks)) return;
    session.update(current => resetCard(endDrill({ ...current, followUps: [] })));
    practice.next();
  });

  // A word saved from the Read tab is the next new card, so a new or extra card waiting unanswered makes way for it.
  data.subscribe((state, previous) => {
    const newlySaved = Object.keys(state.saved).some(id => isSaved(state, id) && !isSaved(previous, id));
    if (!newlySaved) return;
    const { card, drill } = session.get();
    if (drill || !card || card.answered || (card.kind !== 'new' && card.kind !== 'ahead')) return;
    session.update(resetCard);
    practice.next();
  });

  data.subscribe((state, previous) => {
    if (state.settings === previous.settings) return;
    controls.render();
    if (state.settings.theme !== previous.settings.theme) applyTheme(state.settings.theme);
    if (!affectsPractice(previous.settings, state.settings)) return;
    session.update(current => resetCard(endDrill(current)));
    practice.next();
  });

  const saveError = $('#save-error');
  stores.saveFailed.subscribe(failed => {
    saveError.hidden = !failed;
  });
  $('#save-error-export').addEventListener('click', () => exportProgress());

  const updateNote = createUpdateNote();
  stores.outdated.subscribe(outdated => {
    if (outdated) updateNote.show('A newer version of Kana Dojo saved your progress, so this tab has stopped saving.');
  });

  // Saved progress that couldn't be read is kept until the learner has decided what to do with it.
  const unreadableNote = $('#unreadable-note');
  unreadableNote.hidden = unreadableSave(storage) === null;
  $('#unreadable-download').addEventListener('click', () => {
    download('kana-dojo-unreadable-progress.txt', unreadableSave(storage) ?? '', 'text/plain');
  });
  $('#unreadable-discard').addEventListener('click', () => {
    discardUnreadableSave(storage);
    unreadableNote.hidden = true;
  });

  window.addEventListener('pagehide', () => saver.flush());
  // Another tab's progress may include kanji, which this tab can only read once they have loaded.
  const receive = () => void loadKanji().then(() => stores.receive(storage?.getItem(STORAGE_KEY) ?? null));
  if (isProgressStorage(storage)) {
    storage.onChange(key => {
      if (key === STORAGE_KEY) receive();
    });
  } else {
    window.addEventListener('storage', event => {
      if (event.key === STORAGE_KEY) receive();
    });
  }

  let askedPersistence = false;
  data.subscribe(state => {
    if (askedPersistence || !Object.keys(state.stats).length) return;
    askedPersistence = true;
    requestPersistentStorage();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saver.flush();
  });

  const transferStatus = $('#transfer-status');
  const backupStatusText = $('#backup-status');
  const renderBackupStatus = () => {
    backupStatusText.textContent = backupStatus(data.get(), Date.now());
  };
  data.subscribe(renderBackupStatus);
  const importFile = $('#import-file', HTMLInputElement);

  function exportProgress(): void {
    const now = Date.now();
    data.update(state => markBackedUp(state, now));
    saver.flush();
    const payload = exportPayload(data.get(), now, deviceId(storage));
    download(`kana-dojo-progress-${dayKey(now)}.json`, JSON.stringify(payload, null, 2), 'application/json');
    transferStatus.textContent = 'Progress downloaded.';
  }

  $('#export-progress').addEventListener('click', exportProgress);

  $('#import-progress').addEventListener('click', () => importFile.click());
  async function importProgress(file: File): Promise<void> {
    try {
      await loadKanji();
      const { state: imported, device: from } = parseImport(await file.text());
      const answers = Object.values(imported.stats).reduce((sum, s) => sum + s.correct + s.wrong, 0);
      const choice = await chooseAction({
        title: 'Import progress?',
        message:
          `The file has ${answers} answers and ${imported.mistakes.length} mistakes. ` +
          'Merge adds it to the progress here, keeping the latest review of each card. Replace discards the progress here.',
        confirmLabel: 'Merge',
        altLabel: 'Replace',
      });
      if (choice === 'cancel') return;
      session.update(newSession);
      if (choice === 'confirm') {
        const device = deviceId(storage);
        data.update(state => mergeStates(state, device, imported, from ?? device));
      } else {
        // The imported file is itself a copy of this progress.
        data.update(() => markBackedUp(imported, Date.now()));
      }
      saver.flush();
      applyTheme(data.get().settings.theme);
      practice.next();
      progress.render();
      transferStatus.textContent = choice === 'confirm' ? 'Progress merged.' : 'Progress imported.';
    } catch (error) {
      transferStatus.textContent = error instanceof Error ? error.message : 'Import failed.';
    } finally {
      importFile.value = '';
    }
  }

  importFile.addEventListener('change', () => {
    const file = importFile.files?.[0];
    if (file) void importProgress(file);
  });

  async function resetAll(): Promise<void> {
    const confirmed = await confirmAction({
      title: 'Reset all progress?',
      message: 'Your reviews, stats and mistake history will be deleted. This cannot be undone.',
      confirmLabel: 'Reset everything',
      danger: true,
    });
    if (!confirmed) return;
    session.update(newSession);
    data.update(resetProgress);
    saver.flush();
    practice.next();
    progress.render();
  }

  async function clearHistory(): Promise<void> {
    const confirmed = await confirmAction({
      title: 'Clear mistake history?',
      message: 'Your list of past mistakes will be deleted. Your progress and review schedule are kept.',
      confirmLabel: 'Clear history',
      danger: true,
    });
    if (!confirmed) return;
    data.update(clearMistakes);
    saver.flush();
    mistakes.render();
  }

  $('#reset-progress').addEventListener('click', () => void resetAll());
  $('#clear-mistakes').addEventListener('click', () => void clearHistory());

  applyTheme(data.get().settings.theme);
  renderBackupStatus();
  controls.render();
  practice.next();
  home.render();
  watchForUpdates(updateNote);
  createOfflineStrokes();
  const syncView = __SYNC_URL__ ? createSync(stores, storage, __SYNC_URL__) : null;

  if (!kanjiLoaded()) {
    const loadInBackground = () =>
      loadKanji().then(() => {
        home.render();
        progress.render();
        reader.render();
      });
    loadInBackground().catch(() => window.addEventListener('online', () => void loadInBackground(), { once: true }));
  }
}

// Kana learners start straight away and get the kanji and the full word list in the background. Saved progress that
// uses them waits for them, and if they can't be loaded the app stops with an error rather than drop those cards.
async function boot(): Promise<void> {
  const { storage, recovered } = await openProgressStorage({
    open: openIdb,
    local: browserStorage(),
    channel: broadcastChannel(),
  });
  // This version can't read that progress, and starting would save over it. A reload gets the newer version.
  if (isNewerSave(savedText(storage))) {
    throw new Error('Your progress was saved by a newer version of Kana Dojo. Reload to update this one.');
  }
  if (needsKanji(savedText(storage)) || needsKanji(recovered)) await loadKanji();
  start(storage, recovered);
}

window.addEventListener('error', event => showError(event.error ?? event.message));
window.addEventListener('unhandledrejection', event => showError(event.reason));

boot().then(() => {
  document.documentElement.dataset.ready = 'true';
}, showError);
