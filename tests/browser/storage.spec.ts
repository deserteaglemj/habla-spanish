import { test, expect } from '@playwright/test';
test('a stale tab cannot silently overwrite newer saved progress', async ({ page, context }) => {
  await page.goto('/#settings'); await page.getByLabel('Session goal').selectOption('15');
  const second = await context.newPage(); await second.goto('/#settings');
  await page.getByLabel('Session goal').selectOption('20');
  await second.getByLabel('Session goal').selectOption('30');
  await expect(second.getByRole('alert')).toContainText('Another tab');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('habla.progress.v1')!).settings.dailyMinutes)).toBe(20);
});
test('unreadable saved progress can be downloaded before explicit replacement', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('habla.progress.v1')) localStorage.setItem('habla.progress.v1', '{broken original'); });
  await page.goto('/'); await expect(page.getByRole('alert')).toContainText('could not be read');
  const pending = page.waitForEvent('download'); await page.getByRole('button',{name:'Download original saved data'}).click();
  const file = await pending; expect(file.suggestedFilename()).toContain('recovery');
  expect(await page.evaluate(() => localStorage.getItem('habla.progress.v1'))).toBe('{broken original');
});
