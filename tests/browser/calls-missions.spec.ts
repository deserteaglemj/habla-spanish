import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('call controls require routing and consent and save on explicit end', async ({ page }) => {
  await page.addInitScript(() => {
    const data = { coach: { available: true }, translation: { available: true }, callActive: false, coachListening: false, coachDraft: '', state: 'idle', error: '', nearDraft: '', farDraft: '', farLevel: 0, microphonePermission: true, speechPermission: true, lines: [], devices: { inputs: [{ id: 1, name: 'Built-in microphone', isVirtual: false }], virtualOutputs: [{ id: 2, name: 'BlackHole', isVirtual: true }], processes: [{ id: 3, name: 'Call app', outputDeviceIDs: [4] }] } };
    Object.defineProperty(window, 'webkit', { value: { messageHandlers: { habla: { postMessage: async ({ command, payload }: { command: string; payload: any }) => {
      if (command === 'startCall') { if (!payload.consent || !payload.physicalOutputConfirmed) return { ok: false, error: 'Missing consent' }; data.callActive = true; }
      if (command === 'pttDown') data.state = 'capturingHisUtterance';
      if (command === 'pttUp') data.state = 'translating';
      if (command === 'endCall') { data.state = 'saved'; data.callActive = false; }
      return { ok: true, result: command === 'snapshot' ? JSON.parse(JSON.stringify(data)) : {} };
    } } } } });
  });
  await page.goto('/#calls');
  await expect(page.getByRole('button', { name: 'Start call translator' })).toBeDisabled();
  await page.getByLabel('1. Your physical microphone').selectOption('1');
  await page.getByLabel('2. Spanish audio output').selectOption('2');
  await page.getByLabel('3. Calling app audio source').selectOption('3');
  await page.getByLabel('I set the calling app microphone').check();
  await expect(page.getByRole('button', { name: 'Start call translator' })).toBeDisabled();
  await page.getByLabel('Everyone knows translation').check();
  await page.getByRole('button', { name: 'Start call translator' }).click();
  await page.getByRole('button', { name: 'Speak my English turn' }).click();
  await page.getByRole('button', { name: 'Finish my turn' }).click();
  await page.getByRole('button', { name: 'End call & save' }).click();
  await expect(page.getByText('saved', { exact: true })).toBeVisible();
});
test('new public screens remain usable and accessible on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['coach', 'calls', 'missions']) {
    await page.goto('/#' + route);
    await expect(page.locator('h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const audit = await new AxeBuilder({ page }).analyze();
    expect(audit.violations.filter(v => ['serious', 'critical'].includes(v.impact || ''))).toEqual([]);
  }
});
test('extra practice navigation is reachable across the mobile breakpoint', async ({ page }) => {
  for (const width of [320, 650, 680, 700]) {
    await page.setViewportSize({ width, height: 720 });
    await page.goto('/#today');
    const open = page.getByRole('button', { name: 'Open navigation' });
    await expect(open).toBeInViewport();
    await open.click();
    const navigation = page.getByRole('navigation', { name: 'More practice tools' });
    for (const label of ['AI conversation', 'Mission practice', 'Live calls']) await expect(navigation.getByRole('link', { name: label, exact: true })).toBeInViewport();
    await navigation.getByRole('link', { name: 'Live calls', exact: true }).click();
    await expect(page).toHaveURL(/#calls$/);
    await expect(open).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1024, height: 600 });
  const preferences = page.locator('.sidebar').getByRole('link', { name: 'Preferences', exact: true });
  await preferences.click();
  await expect(page).toHaveURL(/#settings$/);
});
test('paused call audio requires ending the call while keeping the transcript available', async ({ page }) => {
  await page.addInitScript(() => {
    const data = { callActive: true, state: 'audio paused', error: 'Audio input disconnected.', translation: { available: true }, microphonePermission: true, speechPermission: true, lines: [{ id: 'one', side: 'you', original: 'Hello', translated: 'Hola', status: 'translated' }] };
    Object.defineProperty(window, 'webkit', { value: { messageHandlers: { habla: { postMessage: async ({ command }: { command: string }) => {
      if (command === 'endCall') { data.callActive = false; data.state = 'saved'; data.error = ''; }
      return { ok: true, result: command === 'snapshot' ? { ...data } : {} };
    } } } } });
  });
  await page.goto('/#calls');
  await expect(page.getByRole('heading', { name: 'Call audio paused' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Speak my English turn' })).toBeDisabled();
  await expect(page.getByText('Hola', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'End call & save' }).click();
  await expect(page.getByText('saved', { exact: true })).toBeVisible();
});
test('typed translation never keeps a result for an edited phrase', async ({ page }) => {
  await page.addInitScript(() => {
    const data = { callActive: false, state: 'idle', error: '', translation: { available: true }, microphonePermission: true, speechPermission: true, lines: [] };
    Object.defineProperty(window, 'webkit', { value: { messageHandlers: { habla: { postMessage: ({ command }: { command: string }) => {
      if (command === 'translateText') return new Promise(resolve => { (window as any).finishTranslation = (text: string) => resolve({ ok: true, result: { text } }); });
      return Promise.resolve({ ok: true, result: command === 'snapshot' ? data : {} });
    } } } } });
  });
  await page.goto('/#calls');
  const submit = page.getByRole('button', { name: 'Translate to Spanish' });
  await submit.click();
  await page.evaluate(() => (window as any).finishTranslation('Hola.'));
  await expect(page.getByRole('status').filter({ hasText: 'Hola.' })).toBeVisible();
  await submit.click();
  await expect(page.getByRole('status').filter({ hasText: 'Hola.' })).toHaveCount(0);
  await page.getByLabel('English phrase').fill('Goodbye.');
  await page.evaluate(() => (window as any).finishTranslation('Hola otra vez.'));
  await expect(submit).toBeEnabled();
  await expect(page.getByRole('status').filter({ hasText: 'Hola' })).toHaveCount(0);
  await submit.click();
  await page.evaluate(() => (window as any).finishTranslation('Adiós.'));
  await expect(page.getByRole('status').filter({ hasText: 'Adiós.' })).toBeVisible();
  await page.getByLabel('English phrase').fill('Thanks.');
  await expect(page.getByRole('status').filter({ hasText: 'Adiós.' })).toHaveCount(0);
});
