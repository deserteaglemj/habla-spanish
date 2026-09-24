import { test, expect } from '@playwright/test';

test('a punctuated stop command saves without recording a wrong answer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start my practice' }).click();
  await page.getByRole('textbox', { name: 'Your answer' }).fill('Stop.');
  await page.getByRole('button', { name: 'Check answer' }).click();
  await expect(page.getByRole('heading', { name: 'Practice saved.' })).toBeVisible();
  await expect(page.getByText('YOUR NEXT PROMPT', { exact: true })).toBeVisible();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('habla.progress.v1')!));
  expect(state.attempts).toHaveLength(0);
  expect(state.history).toHaveLength(1);
});
