import { expect, test } from '@playwright/test';
import { units } from '../../src/data/curriculum';

test('mission hides models, preserves requested support and drafts, then records a separate check-in', async ({ page }) => {
  const unit = units[0];
  await page.goto('/#missions');
  await page.getByLabel('Practice goal').selectOption(unit.id);
  await page.getByLabel('Spanish-first rehearsal').check();
  await page.getByRole('button', { name: 'Start mission', exact: true }).click();
  await page.getByRole('button', { name: 'Prepare your toolkit' }).click();
  await page.getByRole('button', { name: 'Begin rehearsal' }).click();
  await expect(page.getByText(unit.dialogue[0].spanish, { exact: true })).toHaveCount(0);
  await expect(page.getByText(unit.dialogue[1].spanish, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show English meaning' }).click();
  await page.getByLabel('Your reply in Spanish').fill('Buenos');
  await page.getByRole('button', { name: 'Pause & save' }).click();
  await page.getByRole('link', { name: 'Mission practice', exact: true }).click();
  await page.getByRole('button', { name: 'Resume mission' }).click();
  await expect(page.getByLabel('Your reply in Spanish')).toHaveValue('Buenos');
  await expect(page.getByRole('button', { name: 'Show English meaning' })).toBeDisabled();
  for (const [index, line] of unit.dialogue.entries()) {
    await page.getByLabel('Your reply in Spanish').fill(line.spanish);
    await page.getByRole('button', { name: 'Check reply', exact: true }).click();
    if (index === 0) await expect(page.getByRole('status').filter({ hasText: 'Matched with support.' })).toBeVisible();
    await page.getByRole('button', { name: index + 1 === unit.dialogue.length ? 'Try new situations' : 'Next reply', exact: true }).click();
  }
  for (const [index, phrase] of unit.phrases.entries()) {
    if (index === 0) await page.getByRole('button', { name: 'Reveal model', exact: true }).click();
    await page.getByLabel('Your reply in Spanish').fill(phrase.contextAnswers[0]);
    await page.getByRole('button', { name: 'Check reply', exact: true }).click();
    await page.getByRole('button', { name: index + 1 === unit.phrases.length ? 'See your debrief' : 'Next reply', exact: true }).click();
  }
  await page.getByLabel('Your real-world check-in').selectOption('tried');
  await page.getByLabel('What will you try differently next time? (optional)').fill('Ask for a slower reply.');
  await page.reload();
  await expect(page.getByLabel('Your real-world check-in')).toHaveValue('tried');
  await expect(page.getByLabel('What will you try differently next time? (optional)')).toHaveValue('Ask for a slower reply.');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('habla.progress.v1')!));
  expect(saved.mission.attempts).toHaveLength(unit.dialogue.length + unit.phrases.length);
  expect(saved.mission.attempts[0].support).toBe('english');
  expect(saved.mission.attempts[unit.dialogue.length].support).toBe('model');
  expect(saved.attempts).toEqual([]);
  expect(saved.progress).toEqual({});
  expect(saved.missionAttemptCount).toBe(unit.dialogue.length + unit.phrases.length);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'My progress', exact: true }).click();
  await expect(page.locator('.mission-history-row').getByText('Real-world attempt reported')).toBeVisible();
  await expect(page.locator('.stat-card').filter({ hasText: 'Practice attempts' }).locator('strong')).toHaveText(String(unit.dialogue.length + unit.phrases.length));
});
