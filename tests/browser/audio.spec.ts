import { expect, test, type Page } from '@playwright/test';
import { createInitialState, startSession } from '../../src/lib/engine';
import { units } from '../../src/data/curriculum';

// Deterministic browser-capability tests. These mocks do not validate a real
// microphone, a remote transcription service, installed voices, or audio output.
async function installAudioMocks(page: Page, options: { synthesis?: boolean; recognition?: boolean } = {}) {
  await page.addInitScript(({ synthesis, recognition }) => {
    const testWindow = window as any;
    const harness: any = { starts: 0, stops: 0, aborts: 0, cancels: 0, spoken: [], instance: null };
    testWindow.__hablaAudioTest = harness;
    const removeCapability = (name: string) => {
      let target: any = window;
      while (target) {
        if (Object.prototype.hasOwnProperty.call(target, name)) Reflect.deleteProperty(target, name);
        target = Object.getPrototypeOf(target);
      }
    };
    if (synthesis) {
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
        getVoices: () => [{ name: 'Test Spanish voice', voiceURI: 'test-es', lang: 'es-MX', default: true, localService: true }],
        speak: (utterance: any) => harness.spoken.push(utterance.text),
        cancel: () => { harness.cancels++; },
        addEventListener: () => {}, removeEventListener: () => {},
      } });
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class {
        text: string; lang = ''; rate = 1; voice: unknown = null; onerror: unknown = null;
        constructor(text: string) { this.text = text; }
      } });
    } else removeCapability('speechSynthesis');
    removeCapability('SpeechRecognition');
    removeCapability('webkitSpeechRecognition');
    if (recognition) {
      Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: class {
        lang = ''; continuous = false; interimResults = false;
        onresult: ((event: unknown) => void) | null = null;
        onerror: ((event: unknown) => void) | null = null;
        onend: (() => void) | null = null;
        constructor() { harness.instance = this; }
        start() { harness.starts++; }
        stop() { harness.stops++; this.onend?.(); }
        abort() { harness.aborts++; this.onend?.(); }
      } });
      harness.result = (transcript: string, isFinal: boolean) => {
        harness.instance.onresult?.({ resultIndex: 0, results: [{ 0: { transcript, confidence: 0.95 }, length: 1, isFinal }] });
      };
      harness.error = (error: string) => { harness.instance.onerror?.({ error }); harness.instance.onend?.(); };
    }
  }, { synthesis: options.synthesis ?? true, recognition: options.recognition ?? true });
}

async function openPractice(page: Page, familiar = false) {
  const phrase = units[0].phrases[0];
  const state = createInitialState();
  if (familiar) state.progress[phrase.id] = { phraseId: phrase.id, stage: 'supported', interval: 0, due: new Date(0).toISOString(), lastPracticed: new Date(0).toISOString(), independentCount: 0, lapses: 0, attempts: 1 };
  const session = startSession(state, units, familiar ? 'review' : 'lesson', familiar ? undefined : units[0].id);
  await page.addInitScript(data => localStorage.setItem('habla.progress.v1', data), JSON.stringify(session));
  await page.goto('/#practice');
  await expect(page.getByLabel('Your answer')).toBeVisible();
  return phrase;
}

async function enableDictation(page: Page) {
  await page.getByRole('button', { name: 'Use microphone', exact: true }).click();
  await expect(page.getByText('Optional browser dictation may send audio to your browser provider.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Enable dictation', exact: true }).click();
}

test('unavailable speech synthesis provides a useful text fallback', async ({ page }) => {
  await installAudioMocks(page, { synthesis: false, recognition: false });
  const phrase = await openPractice(page);
  expect(await page.evaluate(() => typeof window.speechSynthesis)).toBe('undefined');
  await page.getByRole('button', { name: 'Hear the answer', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Spoken audio is unavailable' })).toContainText('read and type');
  await page.getByLabel('Your answer').fill(phrase.spanish);
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(page.getByTestId('feedback')).toContainText('Correct');
});

test('unavailable recognition is disclosed and leaves typing usable', async ({ page }) => {
  await installAudioMocks(page, { recognition: false });
  const phrase = await openPractice(page);
  await page.getByRole('button', { name: 'Use microphone', exact: true }).click();
  await expect(page.getByText('Optional browser dictation may send audio to your browser provider.', { exact: false })).toBeVisible();
  await expect(page.getByText('Dictation is unavailable in this browser.', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Enable dictation', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Dictation is unavailable' })).toContainText('Type your answer');
  await page.getByLabel('Your answer').fill(phrase.spanish);
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(page.getByTestId('feedback')).toContainText('Correct');
});

test('partial and final dictation wait for an explicit finish and answer check', async ({ page }) => {
  await installAudioMocks(page);
  const phrase = await openPractice(page, true);
  await enableDictation(page);
  await expect(page.getByRole('button', { name: 'Finish speaking', exact: true })).toBeVisible();
  const partial = phrase.spanish.slice(0, Math.max(1, Math.floor(phrase.spanish.length / 2)));
  await page.evaluate(value => (window as any).__hablaAudioTest.result(value, false), partial);
  await expect(page.getByLabel('Your answer')).toHaveValue(partial);
  await expect(page.getByRole('button', { name: 'Check answer', exact: true })).toBeDisabled();
  await page.getByLabel('Your answer').press('Enter');
  await expect(page.getByTestId('feedback')).toHaveCount(0);
  await page.evaluate(value => (window as any).__hablaAudioTest.result(value, true), phrase.spanish);
  await expect(page.getByLabel('Your answer')).toHaveValue(phrase.spanish);
  await expect(page.getByTestId('feedback')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('habla.progress.v1')!).attempts.length)).toBe(0);
  await page.getByRole('button', { name: 'Finish speaking', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Use microphone', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check answer', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).__hablaAudioTest.stops)).toBeGreaterThanOrEqual(1);
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(page.getByTestId('feedback')).toContainText('Correct');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('habla.progress.v1')!).attempts.length)).toBe(1);
});

test('leaving practice aborts recognition and cancels synthesis', async ({ page }) => {
  await installAudioMocks(page);
  await openPractice(page);
  await page.getByRole('button', { name: 'Hear the answer', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__hablaAudioTest.spoken.length)).toBe(1);
  await enableDictation(page);
  const before = await page.evaluate(() => ({ aborts: (window as any).__hablaAudioTest.aborts, cancels: (window as any).__hablaAudioTest.cancels }));
  await page.getByRole('link', { name: 'Pause & save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume my practice' })).toBeVisible();
  const after = await page.evaluate(() => ({ aborts: (window as any).__hablaAudioTest.aborts, cancels: (window as any).__hablaAudioTest.cancels }));
  expect(after.aborts).toBeGreaterThan(before.aborts);
  expect(after.cancels).toBeGreaterThan(before.cancels);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('habla.progress.v1')!).attempts.length)).toBe(0);
});

test('a denied microphone remains recoverable through typed practice', async ({ page }) => {
  await installAudioMocks(page);
  const phrase = await openPractice(page);
  await enableDictation(page);
  await page.evaluate(() => (window as any).__hablaAudioTest.error('not-allowed'));
  await expect(page.getByRole('status').filter({ hasText: 'Microphone permission was not granted' })).toContainText('type your answer');
  await expect(page.getByRole('button', { name: 'Use microphone', exact: true })).toBeVisible();
  await page.getByLabel('Your answer').fill(phrase.spanish);
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(page.getByTestId('feedback')).toContainText('Correct');
});
