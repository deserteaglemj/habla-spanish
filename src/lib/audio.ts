import type { Settings } from '../types';
export function spanishVoices(): SpeechSynthesisVoice[] { return 'speechSynthesis' in window ? window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('es')) : []; }
export function speak(text: string, settings: Settings, language = 'es-MX'): boolean {
  if (typeof window.speechSynthesis === 'undefined') { window.dispatchEvent(new CustomEvent('habla-notice', { detail: 'Spoken audio is unavailable in this browser. You can still read and type every exercise.' })); return false; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  utterance.lang = language; utterance.rate = settings.speechRate;
  const voice = voices.find(v => v.voiceURI === settings.voiceURI && v.lang.startsWith(language.split('-')[0])) || voices.find(v => v.lang === language) || voices.find(v => v.lang.startsWith(language.split('-')[0]));
  if (voice) utterance.voice = voice;
  utterance.onerror = e => { if (!['interrupted', 'canceled'].includes(e.error)) window.dispatchEvent(new CustomEvent('habla-notice', { detail: 'Audio could not play. Check your device volume and installed Spanish voices, or use the text version.' })); };
  window.speechSynthesis.speak(utterance); return true;
}
export function cancelSpeech() { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }
export interface RecognitionInstance { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: any) => void) | null; onerror: ((event: any) => void) | null; onend: (() => void) | null; start(): void; stop(): void; abort(): void; }
export function getRecognition(): (new () => RecognitionInstance) | null { return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null; }
