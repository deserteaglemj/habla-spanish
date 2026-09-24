import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

// These bridge mocks validate web behavior, not Apple model availability,
// physical microphone capture, real recognition, or native audio output.
async function mockNative(page: Page) {
  await page.addInitScript(() => {
    const harness: any = { commands: [], listening: false, draft: '', delay: false, resolveReply: null, callActive: false, permissions: false, error: '' };
    (window as any).__coachTest = harness;
    (window as any).webkit = { messageHandlers: { habla: { postMessage: async ({ command, payload }: any) => {
      harness.commands.push({ command, payload });
      if (command === 'snapshot') return { ok: true, result: { coach: { available: true }, translation: { available: true }, callActive: harness.callActive, coachListening: harness.listening, coachDraft: harness.draft, coachFinal: !harness.listening && !harness.error, error: harness.error, microphonePermission: harness.permissions, speechPermission: harness.permissions } };
      if (command === 'permissions') { harness.permissions = true; return { ok: true, result: {} }; }
      if (command === 'coachMicStart') { harness.listening = true; return { ok: true, result: {} }; }
      if (command === 'coachMicStop') { harness.listening = false; return { ok: true, result: { text: harness.draft } }; }
      if (command === 'coachReply') {
        if (harness.delay) return new Promise(resolve => { harness.resolveReply = resolve; });
        return { ok: true, result: { text: '¡Hola! ¿Qué te gusta hacer?', memory: 'Practicing everyday conversation.' } };
      }
      return { ok: true, result: {} };
    } } } };
  });
}

test('public coach explains the Mac requirement without fake conversation', async ({ page }) => {
  await page.goto('/#coach');
  await expect(page.getByRole('heading', { name: 'Open the Mac companion' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Habla for Mac' })).toHaveAttribute('href', 'habla://coach');
  await expect(page.getByRole('button', { name: 'Send message' })).toHaveCount(0);
});

test('dictation stays editable and unsent until explicit send, then persists', async ({ page }) => {
  await mockNative(page); await page.goto('/#coach');
  await expect(page.getByRole('button', { name: 'Speak your message' })).toBeEnabled();
  await page.getByRole('button', { name: 'Speak your message' }).click();
  await page.evaluate(() => { (window as any).__coachTest.draft = 'Hola, quiero practicar.'; });
  await expect(page.getByLabel('Your message', { exact: true })).toHaveValue('Hola, quiero practicar.');
  await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
  expect(await page.evaluate(() => (window as any).__coachTest.commands.filter((x: any) => x.command === 'coachReply').length)).toBe(0);
  await page.getByRole('button', { name: 'Finish speaking' }).click();
  await page.getByLabel('Your message', { exact: true }).fill('Hola, quiero hablar de comida.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('¡Hola! ¿Qué te gusta hacer?', { exact: true })).toBeVisible();
  await expect(page.getByText('2 messages', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__coachTest.commands.find((x: any) => x.command === 'coachReply').payload.text)).toBe('Hola, quiero hablar de comida.');
  await page.reload();
  await expect(page.getByText('Hola, quiero hablar de comida.', { exact: true })).toBeVisible();
  await expect(page.getByText('2 messages', { exact: true })).toBeVisible();
});

test('cancelled late replies add no duplicate turns and can be retried', async ({ page }) => {
  await mockNative(page); await page.goto('/#coach');
  await expect(page.getByRole('button', { name: 'Speak your message' })).toBeEnabled();
  await page.evaluate(() => { (window as any).__coachTest.delay = true; });
  await page.getByLabel('Your message', { exact: true }).fill('Hola');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('button', { name: 'Stop reply' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop reply' }).click();
  expect(await page.evaluate(() => (window as any).__coachTest.commands.filter((x: any) => x.command === 'coachReply').length)).toBe(1);
  await page.evaluate(() => { const h = (window as any).__coachTest; h.resolveReply({ ok: true, result: { text: 'Late reply', memory: '' } }); h.delay = false; });
  await expect(page.getByText('Late reply', { exact: true })).toHaveCount(0);
  await expect(page.getByText('0 messages', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Your message', { exact: true })).toHaveValue('Hola');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('2 messages', { exact: true })).toBeVisible();
});

test('coach offers microphone permission and surfaces capture failures without sending', async ({ page }) => {
  await mockNative(page); await page.goto('/#coach');
  await page.getByRole('button', { name: 'Enable microphone & speech' }).click();
  await expect(page.getByRole('button', { name: 'Enable microphone & speech' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Speak your message' }).click();
  await page.evaluate(() => { const h = (window as any).__coachTest; h.draft = 'Quiero un'; h.listening = false; h.error = 'Microphone disconnected.'; });
  await expect(page.getByRole('alert').filter({ hasText: 'Voice input ended early' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Microphone disconnected.' })).toHaveCount(1);
  await expect(page.getByLabel('Your message', { exact: true })).toHaveValue('Quiero un');
  await expect(page.getByLabel('Your message', { exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).__coachTest.commands.filter((x: any) => x.command === 'coachReply').length)).toBe(0);
  await page.getByLabel('Your message', { exact: true }).fill('Quiero un café, por favor.');
});

test('asynchronous companion errors stay visible until the native status clears', async ({ page }) => {
  await mockNative(page); await page.goto('/#coach');
  await expect(page.getByRole('button', { name: 'Speak your message' })).toBeEnabled();
  await page.evaluate(() => { (window as any).__coachTest.error = 'The transcript could not be saved.'; });
  await expect(page.getByRole('alert').filter({ hasText: 'The transcript could not be saved.' })).toBeVisible();
  await page.evaluate(() => { (window as any).__coachTest.error = ''; });
  await expect(page.getByRole('alert').filter({ hasText: 'The transcript could not be saved.' })).toHaveCount(0);
});

test('long conversations render recent turns but export the complete IndexedDB transcript', async ({ page }) => {
  await mockNative(page); await page.goto('/#coach');
  await expect(page.getByRole('button', { name: 'Speak your message' })).toBeEnabled();
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('habla.coach.v1', 1);
    open.onsuccess = () => { const db = open.result; const tx = db.transaction('turns', 'readwrite'); for (let i = 0; i < 122; i++) tx.objectStore('turns').add({ id: `test-${i}`, role: i % 2 ? 'assistant' : 'user', text: `Saved turn ${i}`, at: new Date().toISOString() }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; open.onerror = () => reject(open.error);
  }));
  await page.reload();
  await expect(page.getByText('122 messages', { exact: true })).toBeVisible();
  await expect(page.getByText('Saved turn 0', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Saved turn 121', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export transcript', exact: true }).click();
  const file = await (await download).path();
  const exported = JSON.parse(await readFile(file!, 'utf8'));
  expect(exported.turns).toHaveLength(122);
  expect(exported.turns[0].text).toBe('Saved turn 0');
});

test('write failure keeps both replies available in the recovery export', async ({ page }) => {
  await mockNative(page); await page.goto('/#coach');
  await expect(page.getByRole('button', { name: 'Speak your message' })).toBeEnabled();
  await page.evaluate(() => { const original = IDBDatabase.prototype.transaction; (IDBDatabase.prototype as any).transaction = function(stores: any, mode: any, options: any) { if (mode === 'readwrite') throw new DOMException('Test storage quota reached', 'QuotaExceededError'); return original.call(this, stores, mode, options); }; });
  await page.getByLabel('Your message', { exact: true }).fill('Hola');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('heading', { name: 'Keep this conversation safe' })).toBeVisible();
  await expect(page.getByText('2 messages', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export transcript now', exact: true }).click();
  const file = await (await download).path();
  const exported = JSON.parse(await readFile(file!, 'utf8'));
  expect(exported.turns.map((turn: any) => turn.role)).toEqual(['user', 'assistant']);
  await page.getByRole('link', { name: 'Preferences', exact: true }).click();
  await page.getByRole('link', { name: 'AI conversation', exact: true }).click();
  await expect(page.getByText('2 messages', { exact: true })).toBeVisible();
  await expect(page.getByText('¡Hola! ¿Qué te gusta hacer?', { exact: true })).toBeVisible();
});
