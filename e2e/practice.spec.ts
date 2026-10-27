import { answer, dayKey, expect, feedback, openApp, prompt, start, test } from './fixtures.ts';

test('the home screen sums up today and Continue starts practice', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('#hero-title')).toHaveText('15 new to learn');
  await expect(page.locator('#hero-detail')).toHaveText('Read · Basic');
  await expect(page.locator('#streak')).toBeHidden();
  await page.locator('#continue-btn').click();
  await expect(prompt(page)).toHaveText('あ');
  await expect(page.locator('#session-context')).toHaveText('Read · Basic');

  await answer(page, 'a');
  await expect(feedback(page)).toContainText('Correct!');
  await page.locator('#home-btn').click();
  await expect(page.locator('#hero-title')).toHaveText('14 new to learn');
  await expect(page.locator('#streak')).toHaveText('1-day streak');
});

test('starts with あ and moves on after a correct typed answer', async ({ page }) => {
  await start(page);
  await expect(prompt(page)).toHaveText('あ');
  await expect(page.locator('#card-badge')).toHaveText('New');
  await answer(page, 'a');
  await expect(feedback(page)).toContainText('Correct!');
  await expect(feedback(page)).toContainText('Next review in 10 min');
  await expect(prompt(page)).toHaveText('い');
  await expect(page.locator('#session')).toContainText('Session 1/1');
});

// A page wider than the screen makes mobile browsers shift every tap, which shows up as click timeouts elsewhere.
test('no view is wider than the screen', async ({ page }) => {
  await openApp(page);
  const screenWidth = page.viewportSize()?.width ?? 0;
  const pageWidth = () => page.evaluate(() => document.documentElement.scrollWidth);
  await page.locator('[data-track="kanji"]').click();
  await page.locator('[data-expand="k1"]').click();
  expect(await pageWidth(), 'home').toBeLessThanOrEqual(screenWidth);
  await page.locator('#continue-btn').click();
  expect(await pageWidth(), 'session').toBeLessThanOrEqual(screenWidth);
  for (const tab of ['Progress', 'Mistakes']) {
    await page.getByRole('tab', { name: tab }).click();
    expect(await pageWidth(), tab).toBeLessThanOrEqual(screenWidth);
  }
});

test('a wrong answer explains the mix-up and waits for Next', async ({ page }) => {
  await start(page);
  await answer(page, 'o');
  await expect(feedback(page)).toContainText('あ is “a”.');
  await expect(feedback(page)).toContainText('which is お');
  await expect(page.locator('#card')).toHaveClass(/is-wrong/);
  await page.getByRole('button', { name: /^Next/ }).click();
  // The kana picked by mistake comes straight back to tell the two apart.
  await expect(prompt(page)).toHaveText('お');
  await expect(page.locator('#card-badge')).toHaveText('Look-alike');
});

test('peeking at the info panel shows details and skips scoring', async ({ page }) => {
  await start(page);
  await page.locator('#info summary').click();
  await expect(page.locator('#info-body')).toContainText('Reading');
  await expect(page.locator('.stroke-count')).toHaveText('3 strokes');
  await answer(page, 'a');
  await expect(feedback(page)).toContainText('You peeked');
  await expect(page.locator('#session')).toContainText('Session 0/0');
});

test('multiple choice can be answered with the number keys', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Multiple choice' }).click();
  await page.locator('#continue-btn').click();
  const choices = page.locator('#choices .choice');
  await expect(choices).toHaveCount(4);
  const values = await choices.evaluateAll(buttons => buttons.map(button => (button as HTMLElement).dataset.value));
  await page.keyboard.press(String(values.indexOf('a') + 1));
  await expect(feedback(page)).toContainText('Correct!');
  await expect(page.locator('#choices .choice.correct')).toHaveCount(1);
});

test('recall accepts typed kana but not while the Japanese keyboard is still composing', async ({ page, seed }) => {
  await seed({ version: 4, settings: { direction: 'recall', mode: 'type', rows: ['basic:Vowels'] } });
  await start(page);
  await expect(prompt(page)).toHaveText('a');
  const input = page.locator('#answer-input');
  await expect(input).toHaveAttribute('placeholder', 'Type it in hiragana…');

  await input.fill('あ');
  await input.dispatchEvent('compositionstart');
  await input.press('Enter');
  await expect(feedback(page)).not.toContainText('Correct');

  await input.dispatchEvent('compositionend');
  await page.waitForTimeout(150);
  await input.press('Enter');
  await expect(feedback(page)).toContainText('Correct! a = あ');
});

test('matching shows the other script as choices', async ({ page, seed }) => {
  await seed({ version: 4, settings: { direction: 'match', rows: ['basic:Vowels'] } });
  await openApp(page);
  await expect(page.locator('#mode-select')).toBeHidden();
  await page.locator('#continue-btn').click();
  await expect(page.locator('#card-script')).toHaveText('Hiragana → katakana');
  await page.locator('#choices .choice[data-value="ア"]').click();
  await expect(feedback(page)).toContainText('Correct! あ = ア');
});

test('shows “Done for today” when nothing is due and the new limit is used up', async ({ page, seed }) => {
  const later = Date.now() + 10 * 60 * 1000;
  const stats = Object.fromEntries(
    ['あ', 'い', 'う', 'え', 'お'].map(kana => [kana, { correct: 1, wrong: 0, streak: 1, box: 2, due: later }]),
  );
  await seed({
    version: 4,
    settings: { rows: ['basic:Vowels', 'basic:K-row'], newPerDay: 5 },
    stats,
    days: { [dayKey()]: { answers: 5, learned: 5, scored: 5, correct: 5 } },
  });
  await openApp(page);
  await expect(page.locator('#hero-title')).toHaveText('All caught up for now');
  await expect(page.locator('#continue-btn')).toHaveText('Practise anyway');
  await page.locator('#continue-btn').click();
  await expect(page.getByRole('heading', { name: 'Done for today' })).toBeVisible();
  await expect(page.locator('#done')).toContainText('learned 5 new ones');

  await page.getByRole('button', { name: 'Learn 5 more' }).click();
  await expect(prompt(page)).toHaveText('か');
  await expect(page.locator('#session')).toContainText('New today 5/10');
});

test('the track cards choose what is practised', async ({ page }) => {
  await openApp(page);
  await page.locator('[data-track="kana"]').click();
  await page.locator('[data-row="dakuten:G-row"]').click();
  await page.locator('[data-group="basic"]').click();
  await expect(page.locator('[data-group="dakuten"]')).toHaveAttribute('aria-pressed', 'mixed');
  await expect(page.locator('#hero-detail')).toHaveText('Read · Dakuten 1/5');
  await page.locator('#continue-btn').click();
  await expect(prompt(page)).toHaveText('が');
});
