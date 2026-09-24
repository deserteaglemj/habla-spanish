import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { units } from '../../src/data/curriculum';

const unit = units[0];
test('guided dialogue waits, resumes and retains history and support', async ({ page }) => {
  await page.goto(`/#course/${unit.id}`);
  await page.getByRole('button', { name: 'Practice this conversation' }).click();
  await expect(page.getByRole('heading', { name: unit.dialogue[1].english, exact: true })).toBeVisible();
  await expect(page.getByText(unit.dialogue[1].spanish, { exact: true })).toHaveCount(0);
  await expect(page.getByText(unit.dialogue[3].english, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Small hint' }).click();
  await page.getByRole('textbox', { name: 'Your reply' }).fill('Mi borrador');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Your reply' })).toHaveValue('Mi borrador');
  await expect(page.getByRole('button', { name: 'Small hint' })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Your reply' }).fill(unit.dialogue[1].spanish);
  await page.getByRole('button', { name: 'Check reply' }).click();
  await expect(page.getByTestId('roleplay-feedback')).toContainText('with support');
  await page.getByRole('button', { name: 'Continue conversation' }).click();
  await expect(page.getByRole('heading', { name: unit.dialogue[3].english, exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Your reply' }).fill(unit.dialogue[3].spanish);
  await page.getByRole('button', { name: 'Check reply' }).click();
  await page.getByRole('button', { name: 'Finish conversation' }).click();
  await expect(page.getByRole('heading', { name: 'You kept the conversation going.' })).toBeVisible();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('habla.progress.v1')!));
  expect(state.roleplayHistory).toHaveLength(1);
  expect(state.roleplayAttemptCount).toBe(2);
  expect(state.roleplay.attempts.map((a: any) => a.support)).toEqual(['hint', 'none']);
  await page.getByRole('button', { name: 'Try the other role' }).click();
  await expect(page.getByRole('heading', { name: unit.dialogue[0].english, exact: true })).toBeVisible();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('habla.progress.v1')!));
  expect(after.roleplayHistory).toHaveLength(1);
  expect(after.roleplayAttemptCount).toBe(2);
});

test('roleplay layout works on mobile with keyboard-accessible controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#course/${unit.id}`);
  await page.getByRole('button', { name: 'Practice this conversation' }).click();
  await expect(page.getByRole('textbox', { name: 'Your reply' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations.filter(v => ['critical', 'serious'].includes(v.impact || ''))).toEqual([]);
  await page.screenshot({ path: 'work/roleplay-390.png', fullPage: true });
});
