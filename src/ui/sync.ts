import { formatAgo } from '../format.ts';
import { loadKanji } from '../kanji-loader.ts';
import { mergeStates } from '../merge.ts';
import type { AppStores, KeyValueStorage } from '../store.ts';
import {
  deriveKeys,
  deviceId,
  loadSyncConfig,
  newSyncCode,
  parseSyncCode,
  saveSyncConfig,
  type SyncConfig,
  SyncError,
  syncOnce,
  type SyncKeys,
} from '../sync.ts';
import { confirmAction } from './confirm.ts';
import { $ } from './dom.ts';

export interface SyncView {
  render(): void;
}

// Changes are uploaded this long after the last answer, or straight away when the page is hidden.
const SYNC_DELAY_MS = 15_000;
const LINK_PREFIX = '#sync=';

export function createSync({ data, session }: AppStores, storage: KeyValueStorage | null, server: string): SyncView {
  const els = {
    section: $('#sync-settings'),
    off: $('#sync-off'),
    on: $('#sync-on'),
    code: $('#sync-code'),
    input: $('#sync-code-input', HTMLInputElement),
    status: $('#sync-status'),
  };
  let config = loadSyncConfig(storage);
  let keys: { code: string; keys: Promise<SyncKeys> } | null = null;
  let running: Promise<void> | null = null;
  let again = false;
  let applying = false;
  let timer: number | undefined;
  let error: string | null = null;
  let note: string | null = null;

  function render(): void {
    els.section.hidden = false;
    els.off.hidden = Boolean(config);
    els.on.hidden = !config;
    els.code.textContent = config?.code ?? '';
    els.status.classList.toggle('is-error', Boolean(error));
    els.status.textContent =
      error ??
      note ??
      (!config
        ? ''
        : running
          ? 'Syncing…'
          : config.lastSync
            ? `Synced ${formatAgo(Date.now() - config.lastSync)}.`
            : '');
  }

  function setConfig(next: SyncConfig | null): void {
    config = next;
    saveSyncConfig(storage, next);
  }

  const keysFor = (code: string): Promise<SyncKeys> => {
    if (keys?.code !== code) keys = { code, keys: deriveKeys(code) };
    return keys.keys;
  };

  async function attempt(current: SyncConfig): Promise<void> {
    try {
      // Created on the first sync, so nothing is stored for people who never turn sync on.
      const device = deviceId(storage);
      await loadKanji();
      const merged = await syncOnce({ server, keys: await keysFor(current.code), device, state: data.get() });
      if (config?.code !== current.code) return;
      // Answers given while the sync was under way are merged in rather than lost.
      applying = true;
      try {
        data.update(state => mergeStates(state, device, merged, device));
      } finally {
        applying = false;
      }
      session.update(s => (s.undo ? { ...s, undo: null } : s));
      setConfig({ ...current, lastSync: Date.now() });
      error = null;
    } catch (failure) {
      error = failure instanceof SyncError ? failure.message : 'Syncing failed. It will try again later.';
    }
  }

  function sync(): Promise<void> {
    window.clearTimeout(timer);
    if (!config) return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    note = null;
    running = attempt(config).finally(() => {
      running = null;
      render();
      if (again) {
        again = false;
        void sync();
      }
    });
    render();
    return running;
  }

  function connect(code: string): void {
    error = null;
    setConfig({ code, lastSync: 0 });
    void sync();
  }

  $('#sync-start').addEventListener('click', () => connect(newSyncCode()));

  $('#sync-join').addEventListener('submit', event => {
    event.preventDefault();
    const code = parseSyncCode(els.input.value);
    if (!code) {
      error = 'That doesn’t look like a sync code. It has 24 letters and numbers.';
      render();
      return;
    }
    els.input.value = '';
    connect(code);
  });

  $('#sync-copy').addEventListener('click', () => {
    if (!config) return;
    const link = `${location.origin}${location.pathname}${LINK_PREFIX}${config.code}`;
    navigator.clipboard.writeText(link).then(
      () => {
        note = 'Link copied. Open it on your other device.';
        render();
      },
      () => {
        note = 'Couldn’t copy the link. Enter the code on your other device instead.';
        render();
      },
    );
  });

  $('#sync-now').addEventListener('click', () => void sync());

  $('#sync-stop').addEventListener('click', () => {
    void confirmAction({
      title: 'Turn off sync on this device?',
      message:
        'Your progress stays on this device and on your other devices. Enter the same code to turn sync back on.',
      confirmLabel: 'Turn off',
    }).then(confirmed => {
      if (!confirmed) return;
      setConfig(null);
      error = null;
      note = null;
      render();
    });
  });

  async function connectFromLink(): Promise<void> {
    if (!location.hash.startsWith(LINK_PREFIX)) return;
    const code = parseSyncCode(decodeURIComponent(location.hash.slice(LINK_PREFIX.length)));
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    if (!code || config?.code === code) return;
    const confirmed = await confirmAction({
      title: 'Sync this device?',
      message: config
        ? 'This device already syncs with another code. Its progress will be combined with the progress under the new code.'
        : 'The progress on this device will be combined with the progress on your other devices.',
      confirmLabel: 'Turn on sync',
    });
    if (confirmed) connect(code);
  }

  data.subscribe(() => {
    if (applying || !config) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void sync(), SYNC_DELAY_MS);
  });
  document.addEventListener('visibilitychange', () => void sync());
  window.addEventListener('online', () => void sync());

  render();
  void sync();
  void connectFromLink();
  return { render };
}
