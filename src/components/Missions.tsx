import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle, Compass, Eye } from '@phosphor-icons/react';
import type { Settings, Unit } from '../types';
import { cancelSpeech } from '../lib/audio';
import { advanceMission, missionTask, resumeMission, revealMissionHelp, setMissionCheckIn, setMissionDraft, startMission, stopMission, submitMission, type MissionCheckIn, type MissionSession } from '../lib/missions';
import { Empty, Listen, Meter, PageIntro } from './shared';

interface Props { units: Unit[]; settings: Settings; session: MissionSession | null; update: (next: MissionSession) => void; go: (route: string) => void; selectedUnitId?: string; saved?: boolean; }
const phases = ['Brief', 'Prepare', 'Rehearse', 'Adapt', 'Debrief'];

export function Missions({ units, settings, session, update, go, selectedUnitId, saved = true }: Props) {
  const [choose, setChoose] = useState(!session);
  const [selected, setSelected] = useState(selectedUnitId ?? units.find(unit => unit.level === settings.level)?.id ?? units[0]?.id ?? '');
  const [spanishFirst, setSpanishFirst] = useState(settings.level !== 'A1');
  const answer = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => cancelSpeech(), []);
  useEffect(() => { if (session && !session.answered && ['rehearse', 'adapt'].includes(session.phase)) answer.current?.focus(); }, [session?.id, session?.phase, session?.index, session?.answered]);
  const unit = units.find(unit => unit.id === session?.unitId);
  const picked = units.find(unit => unit.id === selected);
  if (!units.length) return <Empty title="No mission material yet">Your course units will appear here when they are available.</Empty>;

  if (choose || !session) return <>
    <PageIntro label="MISSION PRACTICE" title="Put your Spanish to work.">Prepare for a useful exchange, rehearse both roles, then adapt what you know.</PageIntro>
    <section className="panel">
      <div className="section-line"><h2>Choose your next situation</h2><Compass size={26} /></div>
      <label htmlFor="mission-unit">Practice goal</label>
      <select id="mission-unit" value={selected} onChange={event => setSelected(event.target.value)}>{(['A1', 'A2', 'B1'] as const).map(level => <optgroup key={level} label={level}>{units.filter(unit => unit.level === level).map(unit => <option value={unit.id} key={unit.id}>{unit.title}</option>)}</optgroup>)}</select>
      {picked && <p>{picked.goal}</p>}
      <label className="checkbox-label"><input type="checkbox" checked={spanishFirst} onChange={event => setSpanishFirst(event.target.checked)} /> Spanish-first rehearsal</label>
      <p className="micro">Start with English meaning support while building your foundation. Spanish-first hides it during rehearsal, with help available whenever you need it. Neither option changes your course level.</p>
      <div className="button-row"><button className="button" disabled={!picked} onClick={() => { if (picked) { update(startMission(picked, spanishFirst)); setChoose(false); } }}>Start mission <ArrowRight size={18} /></button>{session && <button className="button secondary" onClick={() => setChoose(false)}>Return to saved mission</button>}</div>
    </section>
    <section className="panel lesson-note"><h2>Purpose, practice, everyday use.</h2><p>Inspired by public CIA language-training descriptions: prepare for a concrete task, use cultural context and apply your skills. Habla is independently developed, with no CIA affiliation or certification.</p><a href="#method" className="text-link">Read the approach and sources</a></section>
  </>;

  if (!unit) return <Empty title="This mission’s unit is unavailable" action={<button className="button" onClick={() => setChoose(true)}>Choose another mission</button>}>Your other learning progress is still available.</Empty>;
  if (session.stoppedAt && !session.completedAt) return <div className="session-summary"><div className="summary-icon"><Compass size={42} /></div><span className="eyebrow">MISSION PAUSED</span><h1>Pick up where you left off.</h1><p>{unit.title}. Your draft, position and requested help are preserved.</p><div className="button-row"><button className="button" onClick={() => update(resumeMission(session))}>Resume mission <ArrowRight size={18} /></button><button className="button secondary" onClick={() => setChoose(true)}>Choose another mission</button></div><p className="micro">{saved ? 'Saved in this browser.' : 'Only in this open tab. Download a backup in Preferences.'}</p></div>;
  const phaseIndex = ['brief', 'prepare', 'rehearse', 'adapt', 'debrief'].indexOf(session.phase);
  const task = missionTask(session, unit);
  const helpVisible = session.support !== 'none' || session.answered;
  const modelVisible = session.support === 'model' || session.answered;
  const move = () => { cancelSpeech(); update(advanceMission(session, unit)); };
  const check = () => { cancelSpeech(); if (/^(stop|stop practice|end session|parar|terminar)[.!?]*$/i.test(session.draft.trim())) update(stopMission(session)); else update(submitMission(session, unit)); };
  const matched = session.attempts.filter(attempt => attempt.correct);

  return <div className="practice-page mission-page">
    <div className="practice-top"><button className="back-link" onClick={() => { cancelSpeech(); if (!session.completedAt) update(stopMission(session)); go(`course/${unit.id}`); }}><ArrowLeft size={18} /> {session.completedAt ? 'Back to unit' : 'Pause & save'}</button><span className="practice-count">{phaseIndex + 1} / 5 · {phases[phaseIndex]}</span>{!session.completedAt && <button className="text-button" onClick={() => { cancelSpeech(); update(stopMission(session)); }}>Pause mission</button>}</div>
    <Meter value={phaseIndex + 1} max={5} label="Mission stages" />
    <PageIntro label={`${unit.level} · ${phases[phaseIndex].toUpperCase()}`} title={session.phase === 'debrief' ? 'From practice to real life.' : unit.title}>{unit.goal}</PageIntro>

    {session.phase === 'brief' && <section className="panel">
      <h2>Your communication goal</h2><p>{unit.goal}</p><h2>The situation</h2><p>{unit.description}</p><h2>How this mission works</h2><p>Review the useful patterns, take each role in an exchange, then respond in changed situations. Say each reply aloud before typing. You can pause whenever you need.</p><p className="micro">{session.spanishFirst ? 'Spanish-first rehearsal is on. English meaning and model replies stay hidden until requested.' : 'English meaning support is on. Those rehearsal answers will be labeled as supported.'} Adaptation prompts give task instructions in English in both modes.</p><button className="button" onClick={move}>Prepare your toolkit <ArrowRight size={18} /></button>
    </section>}

    {session.phase === 'prepare' && <>
      <section className="panel lesson-note"><h2>Notice the useful patterns</h2><p>{unit.grammar}</p><p className="micro">Register varies across people and places. Notice formal and informal language in the explanations, and use a polite request when unsure.</p></section>
      <section className="panel"><h2>Listen, understand, say it aloud</h2><p className="muted">These are study models. The rehearsal will hide the replies so you can try retrieving them.</p>{unit.phrases.map(phrase => <div className="toolkit-item" key={phrase.id}><strong lang="es">{phrase.spanish}</strong><span>{phrase.english}</span><p className="micro">{phrase.explanation}</p><Listen text={phrase.spanish} settings={settings} label={`Listen: ${phrase.spanish}`} /></div>)}<button className="button" onClick={move}>Begin rehearsal <ArrowRight size={18} /></button></section>
    </>}

    {task && <>
      {task.previous && <section className="panel dialogue"><h2>Your partner just said</h2><p className="story-text" lang="es">{task.previous.spanish}</p><Listen text={task.previous.spanish} settings={settings} label="Listen to your partner" />{helpVisible && <p className="translation">{task.previous.english}</p>}</section>}
      <section className="exercise-card">
        <div className="practice-heading"><span className="eyebrow">{session.phase === 'rehearse' ? `TAKE ROLE ${task.speaker}` : 'A DIFFERENT SITUATION'}</span><span className="tag green">{session.index + 1} / {task.total}</span></div>
        <h2 className="exercise-prompt">{session.phase === 'adapt' || helpVisible ? task.prompt : task.previous ? 'Continue the exchange in Spanish.' : 'Open this exchange in Spanish.'}</h2>
        <p className="micro center">{session.phase === 'rehearse' ? 'This is a guided scene with a model reply. Ask for the intended meaning if you need a clearer cue. Other natural replies may also be valid.' : 'Change the pattern to fit the new task. This checks wording, not pronunciation.'}</p>
        {modelVisible && <div className="model-answer"><span className="eyebrow">ONE NATURAL RESPONSE</span><p lang="es">{task.model}</p><Listen text={task.model} settings={settings} label="Listen to the model" /></div>}
        <form onSubmit={event => { event.preventDefault(); check(); }}><label htmlFor="mission-answer">Your reply in Spanish</label><div className="answer-area"><textarea ref={answer} id="mission-answer" rows={3} maxLength={2000} spellCheck={false} autoCorrect="off" autoComplete="off" value={session.draft} disabled={session.answered} onChange={event => update(setMissionDraft(session, event.target.value))} /></div>
          {session.answered ? <div className={`feedback ${session.feedback?.correct ? 'correct' : 'review'}`} role="status"><div><strong>{session.feedback?.correct ? <><Check size={20} /> {session.support === 'none' ? 'Matched without requested help.' : 'Matched with support.'}</> : 'Compare your wording.'}</strong><p>{session.feedback?.feedback}</p><p className="micro">A nonmatching reply may still be valid. Compare the model and continue; this is practice evidence, not a proficiency rating.</p></div><button className="button" type="button" onClick={move}>{session.index + 1 < task.total ? 'Next reply' : session.phase === 'rehearse' ? 'Try new situations' : 'See your debrief'} <ArrowRight size={18} /></button></div> : <div className="exercise-actions"><div>{session.phase === 'rehearse' && <button className="text-button" type="button" disabled={helpVisible} onClick={() => update(revealMissionHelp(session, 'english'))}>Show English meaning</button>}<button className="text-button" type="button" disabled={modelVisible} onClick={() => update(revealMissionHelp(session, 'model'))}><Eye size={18} /> Reveal model</button></div><button className="button" type="submit" disabled={!session.draft.trim()}>Check reply <ArrowRight size={18} /></button></div>}
        </form>
      </section>
    </>}

    {session.phase === 'debrief' && <>
      <div className="summary-stats"><div><strong>{session.attempts.length}</strong><span>replies practiced</span></div><div><strong>{matched.filter(attempt => attempt.support === 'none').length}</strong><span>matched without help</span></div><div><strong>{session.attempts.filter(attempt => attempt.support !== 'none').length}</strong><span>used support</span></div></div>
      <section className="panel"><div className="section-line"><h2>Your practice evidence</h2><CheckCircle size={24} /></div><p>You rehearsed both roles and adapted {unit.phrases.length} patterns to new situations. {session.attempts.length - matched.length} replies needed model comparison.</p><p>Immediate practice shows what you attempted today. Return after a break, and use your regular reviews to check lasting recall. This mission does not award proficiency or change spaced-review mastery.</p></section>
      <section className="panel mission"><h2>Try it outside the app</h2><p>{unit.mission}</p><label htmlFor="mission-check-in">Your real-world check-in</label><select id="mission-check-in" value={session.checkIn} onChange={event => update(setMissionCheckIn(session, event.target.value as MissionCheckIn, session.reflection))}><option value="not-yet">Not tried yet</option><option value="tried">I tried it and found something to work on</option><option value="completed">I completed my communication goal</option></select><label htmlFor="mission-reflection">What will you try differently next time? (optional)</label><textarea id="mission-reflection" rows={3} maxLength={2000} value={session.reflection} onChange={event => update(setMissionCheckIn(session, session.checkIn, event.target.value))} /><p className="micro">This is your own reflection, not an assessed result. It stays with your local progress and backup.</p></section>
      <div className="button-row"><button className="button" onClick={() => update(startMission(unit, session.spanishFirst))}>Practice this mission again <ArrowRight size={18} /></button><button className="button secondary" onClick={() => setChoose(true)}>Choose another mission</button></div>
    </>}
    <p className="micro center">{saved ? 'Mission progress saved in this browser.' : 'Progress is only in this open tab. Download a backup in Preferences.'} You can stop, rest and resume. Type “stop” in a reply to pause.</p>
  </div>;
}
