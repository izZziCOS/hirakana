import type { Page } from '@playwright/test';
import { expect, prompt, start, test } from './fixtures.ts';

test.use({ serviceWorkers: 'allow' });

const waitForWorker = (page: Page) =>
  page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise(resolve =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
    }
  });

test('the app keeps working offline once it has loaded', async ({ page, context }) => {
  await start(page);
  await expect(prompt(page)).toHaveText('あ');
  await waitForWorker(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#hero-title')).toHaveText('15 new to learn');
  await page.locator('#continue-btn').click();
  await expect(prompt(page)).toHaveText('あ');
  await page.locator('#info summary').click();
  await expect(page.locator('.stroke-count')).toHaveText('3 strokes');
  await page.getByRole('tab', { name: 'Progress' }).click();
  await page
    .locator('#progress-grids .cell[data-open="ゼ"]')
    .waitFor({ state: 'detached' })
    .catch(() => undefined);
  await context.setOffline(false);
});

test('a new version says it is ready, while the first service worker doesn’t', async ({ page }) => {
  await start(page);
  const note = page.locator('#update-note');
  await waitForWorker(page);
  await expect(note).toBeHidden();

  await page.reload();
  await waitForWorker(page);
  await expect(note).toBeHidden();
  // A new service worker taking over is what the browser reports after an update.
  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));
  await expect(note).toBeVisible();
  await expect(note).toContainText('A new version of Kana Dojo is ready.');
  await note.getByRole('button', { name: 'Reload' }).click();
  await expect(note).toBeHidden();
});

test('fonts keep a cache of their own, so an update doesn’t fetch them again', async ({ page }) => {
  await start(page);
  await waitForWorker(page);
  const caches_ = await page.evaluate(async () => {
    const keys = await caches.keys();
    const contents = await Promise.all(
      keys.map(async key => [key, (await (await caches.open(key)).keys()).map(request => request.url)] as const),
    );
    return Object.fromEntries(contents);
  });
  const names = Object.keys(caches_);
  const fonts = names.filter(name => name.startsWith('kana-dojo-fonts-'));
  expect(fonts).toHaveLength(1);
  const fontFiles = caches_[fonts[0] ?? ''] ?? [];
  expect(fontFiles.length).toBeGreaterThan(10);
  expect(fontFiles.every(url => url.endsWith('.woff2'))).toBe(true);
  for (const name of names.filter(other => !other.startsWith('kana-dojo-fonts-'))) {
    expect((caches_[name] ?? []).some(url => url.endsWith('.woff2'))).toBe(false);
  }
});

test('every kanji’s stroke order can be saved for offline use', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Once is enough for a download this size.');
  test.setTimeout(180_000);
  await start(page);
  await waitForWorker(page);
  await page.locator('#settings-btn').click();
  await page.locator('#offline-download').click();
  await expect(page.locator('#offline-status')).toHaveText('Stroke order for every kanji is saved on this device.', {
    timeout: 150_000,
  });
  await page.locator('#settings-close').click();

  await context.setOffline(true);
  await page.locator('#search-btn').click();
  await page.locator('#search-input').fill('麟');
  await page.locator('.search-result[data-open="麟"]').click();
  await expect(page.locator('#dialog-body .stroke-count')).toContainText('stroke');
  await context.setOffline(false);
});

test('the manifest makes the app installable', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as { name: string; display: string; icons: { sizes: string }[] };
  expect(manifest.name).toBe('Kana Dojo');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map(icon => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
});
