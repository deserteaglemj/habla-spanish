import { useEffect, useState, useRef } from 'react';
import { House, MapTrifold, BookmarkSimple, ChartBar, SlidersHorizontal, ArrowUpRight, Leaf, CheckCircle, List, X, ChatCircleDots } from '@phosphor-icons/react';
import type { AppState, Mode } from './types';
import { units } from './data/curriculum';
import { loadState, saveState, STORAGE_KEY } from './lib/storage';
import { startSession, stopSession, exportBackup, activityAttempts } from './lib/engine';
import { Dashboard } from './components/Dashboard';
import { Course } from './components/Course';
import { Practice } from './components/Practice';
import { Phrasebook } from './components/Phrasebook';
import { Progress } from './components/Progress';
import { Settings } from './components/Settings';
import { Roleplay } from './components/Roleplay';
import { startRoleplay, stopRoleplay, type RoleplaySession } from './lib/roleplay';
import { Missions } from './components/Missions';
import { Calls } from './components/Calls';
import { Coach } from './components/Coach';
import { stopMission, type MissionSession } from './lib/missions';
import { Method } from './components/Method';
const routes = [{ id: 'today', label: 'Today', icon: House }, { id: 'course', label: 'The course', icon: MapTrifold }, { id: 'phrasebook', label: 'Phrasebook', icon: BookmarkSimple }, { id: 'progress', label: 'My progress', icon: ChartBar }];
export default function App() {
  const [initial] = useState(loadState); const [state, setState] = useState<AppState>(initial.state); const [storageError, setStorageError] = useState<string | null>(initial.error); const [notice, setNotice] = useState('');
  const lastSaved = useRef<string | null | undefined>(undefined);
  if (lastSaved.current === undefined) { try { lastSaved.current = localStorage.getItem(STORAGE_KEY); } catch { lastSaved.current = null; } }
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || 'today'); const [menu, setMenu] = useState(false);
  const section = route.split('/')[0];
  useEffect(() => { const listener = () => { setRoute(window.location.hash.slice(1) || 'today'); setMenu(false); window.scrollTo(0, 0); }; const notifications = (e: Event) => setNotice((e as CustomEvent).detail); window.addEventListener('hashchange', listener); window.addEventListener('habla-notice', notifications); return () => { window.removeEventListener('hashchange', listener); window.removeEventListener('habla-notice', notifications); }; }, []);
  useEffect(() => { document.title = `Habla | ${['practice', 'roleplay'].includes(section) ? 'Practice' : routes.find(r => r.id === section)?.label || ({ settings: 'Preferences', coach: 'AI conversation', calls: 'Live calls', missions: 'Mission practice' }[section] || 'Our approach')}`; }, [section]);
  const update = (next: AppState) => {
    setState(next);
    if (initial.error && storageError) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) !== lastSaved.current) {
        setStorageError('Another tab saved newer progress. This tab has not overwritten it. Download a backup of this tab in Preferences, then refresh to load the saved version.');
        return;
      }
    } catch { /* saveState provides the recoverable browser-storage error. */ }
    const error = saveState(next); setStorageError(error);
    if (!error) lastSaved.current = exportBackup(next);
  };
  const downloadOriginal = () => {
    try { const data = localStorage.getItem(STORAGE_KEY); if (data === null) { setNotice('No saved data was found. Download your current session in Preferences.'); return; }
      const url = URL.createObjectURL(new Blob([data], {type:'application/json'}));
      const link = document.createElement('a'); link.href=url; link.download='habla-recovery-original.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
    } catch { setNotice('The browser is blocking access to saved data. Download the current session from Preferences.'); }
  };
  const replaceSaved = () => { const error = saveState(state); setStorageError(error); if (!error) { initial.error=null; lastSaved.current=exportBackup(state); } };
  const go = (path: string) => { window.location.hash = path; };
  const updateRoleplay = (next: RoleplaySession) => {
    const previous = state.roleplay?.id === next.id ? state.roleplay : undefined;
    const additions = next.attempts.filter(attempt => !previous?.attempts.some(item => item.id === attempt.id)).length;
    let history = state.roleplayHistory || [];
    if (state.roleplay && state.roleplay.id !== next.id && !state.roleplay.stoppedAt) history = [...history.filter(item => item.id !== state.roleplay!.id), stopRoleplay(state.roleplay)].slice(-500);
    if (next.stoppedAt) history = [...history.filter(item => item.id !== next.id), next].slice(-500);
    update({ ...state, roleplay: next, roleplayHistory: history, roleplayAttemptCount: (state.roleplayAttemptCount || 0) + additions });
  };
  const updateMission = (next: MissionSession) => {
    const previous = state.mission?.id === next.id ? state.mission : state.missionHistory?.find(item => item.id === next.id);
    const additions = next.attempts.filter(attempt => !previous?.attempts.some(item => item.phase === attempt.phase && item.index === attempt.index)).length;
    const previousCount = state.missionAttemptCount ?? activityAttempts(state).filter(attempt => attempt.id.startsWith('mission:')).length;
    let history = state.missionHistory || [];
    if (state.mission && state.mission.id !== next.id && !state.mission.stoppedAt && !state.mission.completedAt) history = [...history.filter(item => item.id !== state.mission!.id), stopMission(state.mission)].slice(-500);
    if (next.stoppedAt || next.completedAt) history = [...history.filter(item => item.id !== next.id), next].slice(-500);
    update({ ...state, mission: next, missionHistory: history, missionAttemptCount: previousCount + additions });
  };
  const startDialogue = (unitId: string) => {
    const unit = units.find(item => item.id === unitId); if (!unit) return;
    if (!state.roleplay || state.roleplay.unitId !== unitId || state.roleplay.completedAt) {
      const current = state.roleplay;
      const history = current && !current.stoppedAt ? [...(state.roleplayHistory || []).filter(item => item.id !== current.id), stopRoleplay(current)].slice(-500) : state.roleplayHistory;
      update({ ...state, roleplay: startRoleplay(unit), roleplayHistory: history });
    }
    go('roleplay');
  };
  const start = (mode: Mode, id?: string) => { let current = state; if (current.session && !current.session.stoppedAt && (mode !== 'mixed' || id) && (current.session.mode !== mode || current.session.unitId !== id)) current = stopSession(current); update(startSession(current, units, mode, id)); go('practice'); };
  return <div className="app-shell"><a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to content</a><aside className={`sidebar ${menu ? 'menu-open' : ''}`}><a className="wordmark" href="#today" aria-label="Habla home">habla<span>.</span></a><div className="sidebar-topline">A WORLD OF CONVERSATION</div><button className="mobile-menu" aria-label={menu ? 'Close navigation' : 'Open navigation'} aria-controls="extra-navigation" aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X size={23} /> : <List size={23} />}<span>More</span></button><nav aria-label="Main navigation">{routes.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} aria-current={section === id ? 'page' : undefined} className={section === id ? 'active' : ''}><Icon size={22} weight={section === id ? 'fill' : 'regular'} /><span>{label}</span>{section === id && <span className="nav-mark" />}</a>)}</nav><div className="sidebar-extras" id="extra-navigation" role="navigation" aria-label="More practice tools"><a href="#coach" aria-current={section === 'coach' ? 'page' : undefined}><ChatCircleDots size={19} /> AI conversation</a><a href="#missions" aria-current={section === 'missions' ? 'page' : undefined}>Mission practice</a><a href="#calls" aria-current={section === 'calls' ? 'page' : undefined}>Live calls</a></div><div className="sidebar-bottom"><div className="language-card"><span className="language-symbol">ñ</span><div><strong>Spanish</strong><span>Latin American</span></div><span className="language-check"><CheckCircle size={18} weight="fill" /></span></div><a href="#settings" className={section === 'settings' ? 'settings-link active' : 'settings-link'}><SlidersHorizontal size={21} /> Preferences</a><div className="sidebar-footer"><Leaf size={17} /><span>A little, every day.</span></div></div></aside><div className="workspace"><header className="topbar"><span><span className="small-mark">h.</span> YOUR SPACE TO LEARN</span><div><span className="private-status"><span /> {storageError ? 'Unsaved changes in this tab' : 'Saved on this device'}</span><a href="#method">Our approach <ArrowUpRight size={15} /></a></div></header><main id="main-content" tabIndex={-1} className={`main ${['practice', 'roleplay'].includes(section) ? 'main-practice' : ''}`}>{storageError && <div className="error-banner" role="alert"><strong>Progress storage needs attention.</strong><p>{storageError} Your current work stays in this tab. Download a backup in Preferences.</p><div className="button-row"><button className="button secondary small" onClick={downloadOriginal}>Download original saved data</button><button className="text-button" onClick={replaceSaved}>Replace saved data with this tab</button></div></div>}{notice && <div className="notice global-notice" role="status"><span>{notice}</span><button aria-label="Dismiss notice" className="icon-button" onClick={() => setNotice('')}><X size={18} /></button></div>}
    {section === 'today' ? <Dashboard state={state} units={units} start={start} startDialogue={startDialogue} /> : section === 'course' ? <Course key={route} state={state} units={units} selected={route.split('/')[1]} start={start} startDialogue={startDialogue} /> : section === 'practice' ? <Practice state={state} units={units} update={update} go={go} saved={!storageError} /> : section === 'roleplay' ? <Roleplay units={units} settings={state.settings} session={state.roleplay || null} update={updateRoleplay} go={go} saved={!storageError} /> : section === 'phrasebook' ? <Phrasebook state={state} units={units} update={update} /> : section === 'progress' ? <Progress state={state} units={units} /> : section === 'settings' ? <Settings state={state} units={units} update={update} /> : section === 'missions' ? <Missions units={units} settings={state.settings} session={state.mission || null} update={updateMission} go={go} saved={!storageError} /> : section === 'coach' ? <Coach settings={state.settings} /> : section === 'calls' ? <Calls /> : section === 'method' ? <Method /> : <div className="empty-state"><h1>Let’s find your way back.</h1><a href="#today">Go to today</a></div>}
    <footer className="page-footer"><a href="#today">habla.</a><span>Made for real-life Spanish.</span><a href="#settings">Your data & preferences</a></footer></main></div></div>;
}
