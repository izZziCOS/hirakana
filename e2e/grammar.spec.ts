import { answer, expect, feedback, openApp, prompt, showTrack, test } from './fixtures.ts';

const TOPIC = 'g5:は (topic)';

test('the grammar track is picked on the home screen and practised in Fill in', async ({ page }) => {
  await openApp(page);
  const grammar = page.locator('.track', { has: page.locator('#track-grammar') });
  await showTrack(page, 'grammar');
  await expect(grammar.locator('[data-group="g5"]')).toContainText('Fill in only');
  await grammar.locator('[data-group="g5"]').click();
  await page
    .locator('#direction-select')
    .getByRole('button', { name: /Fill in/ })
    .click();
  await expect(page.locator('#hero-detail')).toHaveText('Fill in · Basic, JLPT N5 grammar');
  await expect(grammar.locator('[data-group="g5"]')).toContainText(/\d+ cards/);

  await page.locator('#continue-btn').click();
  await expect(prompt(page).locator('.cloze-gap')).toBeVisible();
  await expect(page.locator('#card-script')).toHaveText('Type the missing part · JLPT N5 grammar');
  // A whole sentence still fits a phone screen.
  const screenWidth = page.viewportSize()?.width ?? 0;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(screenWidth);
});

test('a gap is filled in by typing, in romaji or kana', async ({ page, seed }) => {
  await seed({ version: 7, settings: { rows: [TOPIC], direction: 'cloze', mode: 'type' } });
  await openApp(page);
  await page.locator('#continue-btn').click();

  await expect(prompt(page)).toContainText('I am a student.');
  await expect(page.locator('#answer-input')).toHaveAttribute(
    'placeholder',
    'Type the missing part in kana or romaji…',
  );
  await answer(page, 'wa');
  await expect(feedback(page)).toContainText('Correct! 私は学生です。');

  await expect(prompt(page)).toContainText('It’s hot today, isn’t it?');
  await answer(page, 'が');
  await expect(feedback(page)).toContainText('You answered が.');
  await expect(feedback(page).locator('.cloze-answer')).toHaveText('は');
});

test('grammar up to N1 appears once the kanji file has loaded, and can be practised', async ({ page, seed }) => {
  await seed({
    version: 9,
    settings: { rows: ['g1:～ならでは'], direction: 'cloze', mode: 'choose', introduce: false },
  });
  await openApp(page);
  const grammar = page.locator('.track', { has: page.locator('#track-grammar') });
  await expect(grammar.locator('[data-group="g3"]')).toContainText(/\d+ cards/);
  await expect(grammar.locator('[data-group="g1"]')).toContainText(/\d+ cards/);
  await page.locator('#continue-btn').click();
  await expect(page.locator('#card-script')).toContainText('JLPT N1 grammar');
  await page.locator('#choices').getByRole('button', { name: 'ならでは' }).click();
  await expect(page.locator('#feedback')).toContainText('Correct!');
});

test('verb forms are drilled from the Conjugation track, starting with an everyday verb', async ({ page, seed }) => {
  await seed({ version: 9, settings: { rows: ['cv:て form'], direction: 'cloze', mode: 'type', introduce: false } });
  await openApp(page);
  const forms = page.locator('.track', { has: page.locator('#track-forms') });
  await expect(forms.locator('[data-group="cv"]')).toContainText(/\d+ cards/);
  await page.locator('#continue-btn').click();
  await expect(page.locator('#kana')).toContainText('to eat · て form');
  await page.locator('#answer-input').fill('たべて');
  await page.locator('#answer-input').press('Enter');
  await expect(page.locator('#feedback')).toContainText('Correct!');
});

test('a word’s sentences appear in its info panel', async ({ page }) => {
  await openApp(page);
  await page.locator('#search-btn').click();
  await page.locator('#search-input').fill('水');
  await page.locator('.search-result[data-open="水"]').click();
  await expect(page.locator('#dialog-body')).toContainText('In a sentence');
  await expect(page.locator('#dialog-body .grammar-examples')).toContainText('水');
});

test('a new grammar point is introduced once, then picked from four options', async ({ page, seed }) => {
  await seed({ version: 7, settings: { rows: [TOPIC], direction: 'cloze', mode: 'choose', introduce: true } });
  await openApp(page);
  await page.locator('#continue-btn').click();

  await expect(page.locator('#card-script')).toHaveText('New grammar point · have a look, then you’ll be tested');
  await expect(prompt(page).locator('.cloze-answer')).toHaveText('は');
  await expect(page.locator('#card-intro')).toContainText('は (topic) · as for A; marks what the sentence is about');
  await expect(page.locator('#info-body')).toContainText('As a particle it is read “wa”');
  await page.locator('#learn-btn').click();

  // The point has been met, so its next sentence is tested straight away.
  await expect(page.locator('#card-badge')).toHaveText('New');
  await expect(prompt(page).locator('.cloze-gap')).toBeVisible();
  const choices = page.locator('#choices .choice');
  await expect(choices).toHaveCount(4);
  await choices.filter({ hasText: 'は' }).click();
  await expect(feedback(page)).toContainText('Correct!');
});
