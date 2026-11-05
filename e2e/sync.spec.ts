import type { BrowserContext } from '@playwright/test';
import { handleRequest, MAX_BYTES, memoryStore, type ProgressStore } from '../worker/sync.ts';
import { answer, confirmDialog, expect, feedback, savedStatKeys, start, test } from './fixtures.ts';

// playwright.config.ts builds the site with this as its sync server; requests to it are answered by the worker's code.
const SYNC_SERVER = 'http://sync.test';

function serveSync(context: BrowserContext, store: ProgressStore): Promise<unknown> {
  return context.route(`${SYNC_SERVER}/**`, async route => {
    const request = route.request();
    const body = request.postDataBuffer();
    const response = await handleRequest(
      new Request(request.url(), {
        method: request.method(),
        headers: request.headers(),
        body: body ? Uint8Array.from(body) : undefined,
      }),
      store,
      { allowedOrigin: '*', maxBytes: MAX_BYTES },
    );
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
}

test('progress reaches another device through a sync link', async ({ page, context, browser }, testInfo) => {
  const store = memoryStore();
  await serveSync(context, store);
  await start(page);
  await answer(page, 'a');
  await expect(feedback(page)).toContainText('Correct!');

  await page.locator('#settings-btn').click();
  await page.getByRole('button', { name: 'Turn on sync' }).click();
  await expect(page.locator('#sync-status')).toHaveText('Synced just now.');
  const code = (await page.locator('#sync-code').textContent()) ?? '';
  expect(code).toMatch(/^([0-9A-Z]{4}-){5}[0-9A-Z]{4}$/);

  const laptop = await browser.newContext({ ...testInfo.project.use, serviceWorkers: 'block' });
  await serveSync(laptop, store);
  const other = await laptop.newPage();
  await other.goto(`/#sync=${code}`);
  await confirmDialog(other, 'Turn on sync');
  await expect.poll(() => savedStatKeys(other)).toEqual(['あ']);
  expect(new URL(other.url()).hash).toBe('');

  await other.locator('#settings-btn').click();
  await expect(other.locator('#sync-code')).toHaveText(code);
  await other.getByRole('button', { name: 'Turn off' }).click();
  await confirmDialog(other, 'Turn off');
  await expect(other.getByRole('button', { name: 'Turn on sync' })).toBeVisible();
  await laptop.close();
});

test('the synced copy can be deleted from the server', async ({ page, context }) => {
  const store = memoryStore();
  await serveSync(context, store);
  await start(page);
  await answer(page, 'a');
  await expect(feedback(page)).toContainText('Correct!');
  await page.locator('#settings-btn').click();
  await page.getByRole('button', { name: 'Turn on sync' }).click();
  await expect(page.locator('#sync-status')).toHaveText('Synced just now.');
  expect(await store.count()).toBe(1);

  await page.getByRole('button', { name: 'Delete synced copy' }).click();
  await confirmDialog(page, 'Delete');
  await expect(page.locator('#sync-status')).toHaveText('The synced copy was deleted.');
  await expect(page.getByRole('button', { name: 'Turn on sync' })).toBeVisible();
  expect(await store.count()).toBe(0);
  await expect.poll(() => savedStatKeys(page)).toEqual(['あ']);
});

test('switching tabs doesn’t upload progress that hasn’t changed', async ({ page, context }) => {
  const store = memoryStore();
  const requests: string[] = [];
  context.on('request', request => {
    if (request.url().startsWith(SYNC_SERVER)) requests.push(request.method());
  });
  await serveSync(context, store);
  await start(page);
  await answer(page, 'a');
  await expect(feedback(page)).toContainText('Correct!');
  await page.locator('#settings-btn').click();
  await page.getByRole('button', { name: 'Turn on sync' }).click();
  await expect(page.locator('#sync-status')).toHaveText('Synced just now.');
  requests.length = 0;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.locator('#sync-now').click();
  await expect(page.locator('#sync-status')).toHaveText('Synced just now.');
  expect(requests.filter(method => method === 'PUT')).toEqual([]);
});

test('sync failures show outside Settings from the second one on, and clear once it works', async ({
  page,
  context,
}) => {
  const store = memoryStore();
  await serveSync(context, store);
  await start(page);
  await answer(page, 'a');
  await expect(feedback(page)).toContainText('Correct!');
  await page.locator('#settings-btn').click();
  await page.getByRole('button', { name: 'Turn on sync' }).click();
  await expect(page.locator('#sync-status')).toHaveText('Synced just now.');

  await context.unroute(`${SYNC_SERVER}/**`);
  await context.route(`${SYNC_SERVER}/**`, route => route.fulfill({ status: 503 }));
  const banner = page.locator('#sync-note');
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.locator('#sync-status')).toHaveText('The sync server answered 503.');
  await expect(banner).toBeHidden();
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Your progress isn’t syncing. The sync server answered 503.');
  await page.locator('#settings-close').click();

  await context.unroute(`${SYNC_SERVER}/**`);
  await serveSync(context, store);
  await banner.getByRole('button', { name: 'Try again' }).click();
  await expect(banner).toBeHidden();
});

test('being offline doesn’t count as a sync failure on the page', async ({ page, context }) => {
  const store = memoryStore();
  await serveSync(context, store);
  await start(page);
  await page.locator('#settings-btn').click();
  await page.getByRole('button', { name: 'Turn on sync' }).click();
  await expect(page.locator('#sync-status')).toHaveText('Synced just now.');
  await context.unroute(`${SYNC_SERVER}/**`);
  await context.route(`${SYNC_SERVER}/**`, route => route.abort('internetdisconnected'));
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.locator('#sync-status')).toContainText('Couldn’t reach');
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.locator('#sync-status')).toContainText('Couldn’t reach');
  await expect(page.locator('#sync-note')).toBeHidden();
  await context.setOffline(false);
});

test('a mistyped sync code is explained', async ({ page }) => {
  await page.goto('/');
  await page.locator('#settings-btn').click();
  await page.locator('#sync-code-input').fill('hello');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.locator('#sync-status')).toContainText('doesn’t look like a sync code');
});
