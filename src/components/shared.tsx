import type { ReactNode } from 'react';
import { ArrowUpRight, SpeakerHigh, ArrowRight } from '@phosphor-icons/react';
import { speak } from '../lib/audio';
import type { Settings } from '../types';
export function PageIntro({ label, title, children, action }: { label: string; title: string; children: ReactNode; action?: ReactNode }) {
  return <header className="page-intro"><div><p className="eyebrow">{label}</p><h1>{title}</h1><p className="page-description">{children}</p></div>{action}</header>;
}
export function Listen({ text, settings, label = 'Listen', language = 'es-MX' }: { text: string; settings: Settings; label?: string; language?: string }) {
  return <button type="button" className="listen-button" aria-label={label} onClick={() => speak(text, settings, language)}><SpeakerHigh size={19} /><span>{label}</span></button>;
}
export function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-symbol">h.</div><h2>{title}</h2><p>{children}</p>{action}</div>;
}
export function Arrow({ diagonal = false }: { diagonal?: boolean }) { return diagonal ? <ArrowUpRight size={20} /> : <ArrowRight size={20} />; }
export function Meter({ value, max = 100, label }: { value: number; max?: number; label: string }) {
  return <div className="meter" role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max}><span style={{ width: `${Math.min(100, Math.max(0, value / max * 100))}%` }} /></div>;
}
export const stageLabels = { introduced: 'Introduced', supported: 'With support', independent: 'Independent recall', transfer: 'New context' };
