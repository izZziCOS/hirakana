import { answer, dayKey, expect, feedback, prompt, test } from './fixtures.ts';

test('starts with あ and moves on after a correct typed answer', async ({ page }) => {
  await page.goto('/');
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
  await page.goto('/');
  const screenWidth = page.viewportSize()?.width ?? 0;
  for (const tab of ['Practice', 'Progress', 'Mistakes']) {
    await page.getByRole('tab', { name: tab }).click();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, tab).toBeLessThanOrEqual(screenWidth);
  }
});

test('a wrong answer explains the mix-up and waits for Next', async ({ page }) => {
  await page.goto('/');
  await answer(page, 'o');
  await expect(feedback(page)).toContainText('あ is “a”.');
  await expect(feedback(page)).toContainText('which is お');
  await expect(page.locator('#card')).toHaveClass(/is-wrong/);
  await page.getByRole('button', { name: /^Next/ }).click();
  await expect(prompt(page)).toHaveText('い');
});

test('peeking at the info panel shows details and skips scoring', async ({ page }) => {
  await page.goto('/');
  await page.locator('#info summary').click();
  await expect(page.locator('#info-body')).toContainText('Reading');
  await expect(page.locator('.stroke-count')).toHaveText('3 strokes');
  await answer(page, 'a');
  await expect(feedback(page)).toContainText('You peeked');
  await expect(page.locator('#session')).toContainText('Session 0/0');
});

test('multiple choice can be answered with the number keys', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Multiple choice' }).click();
  const choices = page.locator('#choices .choice');
  await expect(choices).toHaveCount(4);
  const values = await choices.evaluateAll(buttons => buttons.map(button => (button as HTMLElement).dataset.value));
  await page.keyboard.press(String(values.indexOf('a') + 1));
  await expect(feedback(page)).toContainText('Correct!');
  await expect(page.locator('#choices .choice.correct')).toHaveCount(1);
});

test('recall accepts typed kana but not while the Japanese keyboard is still composing', async ({ page, seed }) => {
  await seed({ version: 4, settings: { direction: 'recall', mode: 'type', rows: ['basic:Vowels'] } });
  await page.goto('/');
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
  await page.goto('/');
  await expect(page.locator('#mode-select')).toBeHidden();
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
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Done for today' })).toBeVisible();
  await expect(page.locator('#done')).toContainText('learned 5 new ones');

  await page.getByRole('button', { name: 'Learn 5 more' }).click();
  await expect(prompt(page)).toHaveText('か');
  await expect(page.locator('#session')).toContainText('New today 5/10');
});

test('changing rows in the picker changes what is practised', async ({ page }) => {
  await page.goto('/');
  await page.locator('.rows-picker summary').click();
  await page.locator('[data-row="dakuten:G-row"]').click();
  await page.locator('[data-group="basic"]').click();
  await expect(page.locator('#rows-summary')).toHaveText('Dakuten 1/5');
  await expect(prompt(page)).toHaveText('が');
});
