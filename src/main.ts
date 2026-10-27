import { dayKey } from './days.ts';
import { affectsPractice, endDrill, newSession, resetCard } from './session.ts';
import {
  backupStatus,
  clearMistakes,
  exportPayload,
  markBackedUp,
  parseImport,
  resetProgress,
  updateSettings,
} from './state.ts';
import { browserStorage, createAppStores, STORAGE_KEY } from './store.ts';
import type { Theme } from './types.ts';
import { confirmAction } from './ui/confirm.ts';
import { createControls } from './ui/controls.ts';
import { createDialog, type StartDrill } from './ui/dialog.ts';
import { createHome } from './ui/home.ts';
import { $ } from './ui/dom.ts';
import { createMistakes } from './ui/mistakes.ts';
import { createPractice } from './ui/practice/index.ts';
import { createProgress } from './ui/progress.ts';
import { createSync } from './ui/sync.ts';

type View = 'practice' | 'progress' | 'mistakes';

const VIEWS: View[] = ['practice', 'progress', 'mistakes'];
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
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  const toggle = $('#theme-toggle', HTMLButtonElement);
  toggle.setAttribute('aria-label', THEME_LABEL[theme]);
  toggle.title = THEME_LABEL[theme];
  $('#theme-icon').textContent = THEME_ICON[theme];
}

function registerServiceWorker(): void {
  if (__DEV__ || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch(() => undefined);
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

function start(): void {
  const storage = browserStorage();
  const stores = createAppStores(storage);
  const { data, session, saver } = stores;
  let activeView: View = 'practice';
  // The Learn tab is either the home screen or a practice session.
  let learning: 'home' | 'session' = 'home';
  const isActive = (view: View) => () => activeView === view;
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('.tab')];

  const startDrill: StartDrill = (label, items) => {
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
  const mistakes = createMistakes(stores, dialog, startDrill);
  const progress = createProgress(stores, {
    dialog,
    isActive: isActive('progress'),
    onSelectDay: day => {
      showView('mistakes');
      mistakes.showDay(day);
    },
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

  data.subscribe((state, previous) => {
    if (state.settings === previous.settings) return;
    controls.render();
    if (state.settings.theme !== previous.settings.theme) applyTheme(state.settings.theme);
    if (!affectsPractice(previous.settings, state.settings)) return;
    session.update(current => resetCard(endDrill(current)));
    practice.next();
  });

  window.addEventListener('pagehide', () => saver.flush());
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) stores.receive(event.newValue);
  });

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
    const blob = new Blob([JSON.stringify(exportPayload(data.get(), now), null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `kana-dojo-progress-${dayKey(now)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    transferStatus.textContent = 'Progress downloaded.';
  }

  $('#export-progress').addEventListener('click', exportProgress);

  $('#import-progress').addEventListener('click', () => importFile.click());
  async function importProgress(file: File): Promise<void> {
    try {
      const imported = parseImport(await file.text());
      const answers = Object.values(imported.stats).reduce((sum, s) => sum + s.correct + s.wrong, 0);
      const confirmed = await confirmAction({
        title: 'Replace your progress?',
        message: `The file has ${answers} answers and ${imported.mistakes.length} mistakes. Your current progress will be replaced.`,
        confirmLabel: 'Replace',
      });
      if (!confirmed) return;
      session.update(newSession);
      // The imported file is itself a copy of this progress.
      data.update(() => markBackedUp(imported, Date.now()));
      saver.flush();
      applyTheme(imported.settings.theme);
      practice.next();
      progress.render();
      transferStatus.textContent = 'Progress imported.';
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
  registerServiceWorker();
  const syncView = __SYNC_URL__ ? createSync(stores, storage, __SYNC_URL__) : null;
}

window.addEventListener('error', event => showError(event.error ?? event.message));
window.addEventListener('unhandledrejection', event => showError(event.reason));

try {
  start();
  document.documentElement.dataset.ready = 'true';
} catch (error) {
  showError(error);
}
