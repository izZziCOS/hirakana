import { dayKey } from './days.ts';
import { affectsPractice, endDrill, newSession, resetCard } from './session.ts';
import { clearMistakes, exportPayload, parseImport, resetProgress, updateSettings } from './state.ts';
import { browserStorage, createAppStores } from './store.ts';
import type { Theme } from './types.ts';
import { confirmAction } from './ui/confirm.ts';
import { createControls } from './ui/controls.ts';
import { createDialog, type StartDrill } from './ui/dialog.ts';
import { $ } from './ui/dom.ts';
import { createMistakes } from './ui/mistakes.ts';
import { createPractice } from './ui/practice/index.ts';
import { createProgress } from './ui/progress.ts';

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

function start(): void {
  const stores = createAppStores(browserStorage());
  const { data, session, saver } = stores;
  let activeView: View = 'practice';
  const isActive = (view: View) => () => activeView === view;
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('.tab')];

  const startDrill: StartDrill = (label, items) => {
    showView('practice');
    practice.drill(label, items);
  };
  const dialog = createDialog(data, startDrill);
  const controls = createControls(data);
  const practice = createPractice(stores, isActive('practice'), dialog);
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
    if (view === 'progress') progress.open();
    if (view === 'mistakes') mistakes.render();
    if (view === 'practice' && !focusTab) practice.focus();
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
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saver.flush();
  });

  const transferStatus = $('#transfer-status');
  const importFile = $('#import-file', HTMLInputElement);

  $('#export-progress').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(exportPayload(data.get()), null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `kana-dojo-progress-${dayKey(Date.now())}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    transferStatus.textContent = 'Progress downloaded.';
  });

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
      data.update(() => imported);
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
  controls.render();
  practice.next();
  registerServiceWorker();
}

window.addEventListener('error', event => showError(event.error ?? event.message));
window.addEventListener('unhandledrejection', event => showError(event.reason));

try {
  start();
  document.documentElement.dataset.ready = 'true';
} catch (error) {
  showError(error);
}
