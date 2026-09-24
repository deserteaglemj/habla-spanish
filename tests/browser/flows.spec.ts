import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createInitialState, startSession } from '../../src/lib/engine';
import { units } from '../../src/data/curriculum';
const key = 'habla.progress.v1';
test('recall is hidden and a hint stays supported after reload', async ({ page }) => {
  const state = createInitialState(); const p = units[0].phrases[0];
  state.progress[p.id] = { phraseId: p.id, stage: 'supported', interval: 0, due: new Date(0).toISOString(), lastPracticed: new Date(0).toISOString(), independentCount: 0, lapses: 0, attempts: 1 };
  const started = startSession(state, units, 'review');
  await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, data); }, { key, data: JSON.stringify(started) });
  await page.goto('/#practice');
  await expect(page.locator('.model-answer')).toHaveCount(0);
  await page.getByRole('button', { name: 'Small hint' }).click();
  await page.reload();
  await expect(page.locator('.hint-box')).toBeVisible();
  await page.getByLabel('Your answer').fill(p.spanish);
  await page.getByRole('button', { name: 'Check answer' }).click();
  await expect(page.getByTestId('feedback')).toContainText('with support');
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key);
  expect(saved.progress[p.id].independentCount).toBe(0);
});
test('mid-answer pause resumes exact draft and stop saves once', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Start my practice' }).click();
  await page.getByLabel('Your answer').fill('estoy pensando');
  await page.getByRole('link', { name: 'Pause & save' }).click();
  await page.reload(); await page.getByRole('button', { name: 'Resume my practice' }).click();
  await expect(page.getByLabel('Your answer')).toHaveValue('estoy pensando');
  await page.getByLabel('Your answer').fill('stop'); await page.getByRole('button', { name: 'Check answer' }).click();
  await expect(page.getByRole('heading', { name: 'Practice saved.' })).toBeVisible();
  await page.reload();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).history.length, key)).toBe(1);
});
test('custom phrase, saved filter and backup restore work without an account', async ({ page }) => {
  await page.goto('/#phrasebook'); await page.getByRole('button', { name: 'Add a phrase' }).click();
  await page.getByLabel('Spanish', { exact: true }).fill('Un café, por favor.');
  await page.getByLabel('English meaning').fill('A coffee, please.');
  await page.getByRole('button', { name: 'Save phrase', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Un café, por favor.' })).toBeVisible();
  await page.getByRole('button', { name: 'Save Un café, por favor.' }).click();
  await page.getByRole('button', { name: 'Saved', exact: true }).click();
  await expect(page.locator('.phrase-card')).toHaveCount(1);
  await page.goto('/#settings');
  const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download backup' }).click();
  const download = await downloaded; const path = await download.path(); expect(path).toBeTruthy();
  await page.getByLabel('Import backup file').setInputFiles(path!);
  await expect(page.getByText('Backup validated.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Replace with this backup' }).click();
  await expect(page.getByText('Progress restored successfully.')).toBeVisible();
  await page.reload(); await page.goto('/#phrasebook'); await page.getByRole('button', { name: 'My phrases' }).click();
  await expect(page.getByRole('heading', { name: 'Un café, por favor.' })).toBeVisible();
});
test('invalid backup leaves current data untouched', async ({ page }) => {
  await page.goto('/#settings'); await page.getByLabel('Session goal').selectOption('20');
  await page.getByLabel('Import backup file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":999}') });
  await expect(page.getByRole('status')).toContainText('existing progress is unchanged');
  await page.reload(); await expect(page.getByLabel('Session goal')).toHaveValue('20');
});
test('a ChatGPT session imports once, preserves support and surfaces next step', async ({ page }) => {
  await page.goto('/#settings');
  const text = JSON.stringify({format:'habla-session', version:1, observations:[{spanish:'Quiero un café.',english:'I want a coffee.',response:'Quiero un café.',support:'revealed',correct:true}],nextPrompt:'Order a coffee politely.'});
  await page.getByLabel('Import a practice session').fill(text); await page.getByRole('button',{name:'Import session',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('observations imported');
  await page.goto('/#today'); await expect(page.getByText('Order a coffee politely.')).toBeVisible();
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key);
  expect(stored.attempts[0].support).toBe('revealed');
  expect(Object.values(stored.progress).every((p:any) => p.independentCount === 0)).toBe(true);
});
test('course details include dialogues, reading, comprehension and specific unit practice', async ({ page }) => {
  await page.goto(`/#course/${units[0].id}`);
  await expect(page.getByRole('heading',{name:'A real-life exchange'})).toBeVisible();
  await page.getByRole('button',{name:'Show English',exact:true}).click();
  await expect(page.locator('.translation')).toHaveCount(units[0].dialogue.length);
  await page.getByLabel(units[0].reading.question).fill(units[0].reading.answers[0]);
  await page.getByRole('button',{name:'Check',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Correct');
  await page.getByRole('button',{name:'Practice this unit'}).click();
  await expect(page.locator('.practice-heading')).toContainText(units[0].title);
});
test('responsive pages have no overflow or serious accessibility defects', async ({ page }) => {
  test.setTimeout(120000);
  for (const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:1000});
    for (const route of ['today','course','phrasebook','progress','settings','method']) {
      await page.goto(`/#${route}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${route} at ${width}`).toBe(true);
      if (width === 390 || width === 1440) { const results = await new AxeBuilder({page}).analyze(); expect(results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical'), `${route} ${width}`).toEqual([]); }
    }
    await page.goto('/'); await page.screenshot({path:`work/dashboard-${width}.png`,fullPage:true});
  }
});
