import { expect, prompt, start, test } from './fixtures.ts';

test.use({ serviceWorkers: 'allow' });

test('the app keeps working offline once it has loaded', async ({ page, context }) => {
  await start(page);
  await expect(prompt(page)).toHaveText('あ');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise(resolve =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
    }
  });

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

test('the manifest makes the app installable', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as { name: string; display: string; icons: { sizes: string }[] };
  expect(manifest.name).toBe('Kana Dojo');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map(icon => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
});
