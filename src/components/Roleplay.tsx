import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChatCircleDots, Check, CheckCircle, Eye, Lightbulb } from '@phosphor-icons/react';
import type { Settings, Unit } from '../types';
import {
  continueRoleplay, giveRoleplayHint, revealRoleplayAnswer, resumeRoleplay,
  roleplayRoles, setRoleplayDraft, startRoleplay, stopRoleplay, submitRoleplay,
  type RoleplaySession,
} from '../lib/roleplay';
import { cancelSpeech } from '../lib/audio';
import { Empty, Listen, Meter, PageIntro } from './shared';

export interface RoleplayProps {
  units: Unit[];
  settings: Settings;
  session: RoleplaySession | null;
  update: (next: RoleplaySession) => void;
  go: (route: string) => void;
  selectedUnitId?: string;
  saved?: boolean;
}

export function Roleplay({ units, settings, session, update, go, selectedUnitId, saved = true }: RoleplayProps) {
  const [unitChoice, setUnitChoice] = useState(selectedUnitId ?? units.find(unit => unit.level === settings.level)?.id ?? units[0]?.id ?? '');
  const [roleChoice, setRoleChoice] = useState('');
  const answer = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => cancelSpeech(), []);
  useEffect(() => {
    if (session && !session.stoppedAt && !session.answered) answer.current?.focus();
  }, [session?.id, session?.turnIndex, session?.stoppedAt]);

  const chosenUnit = units.find(unit => unit.id === unitChoice);
  if (!session) return <>
    <PageIntro label="GUIDED CONVERSATION" title="Take your part in the story.">Listen to your partner, decide what to say, then reply in Spanish. Each conversation moves at your pace.</PageIntro>
    <section className="panel roleplay-setup">
      <h2>Choose a scene</h2>
      <p className="muted">Start with a unit you have practiced. You can pause, get a hint or hear a model whenever you need one.</p>
      <label htmlFor="roleplay-unit">Conversation</label>
      <select id="roleplay-unit" value={unitChoice} onChange={event => { setUnitChoice(event.target.value); setRoleChoice(''); }}>
        {units.map(unit => <option key={unit.id} value={unit.id}>{unit.level} · {unit.title}</option>)}
      </select>
      {chosenUnit && <><label htmlFor="roleplay-role">Your role</label>
        <select id="roleplay-role" value={roleChoice || roleplayRoles(chosenUnit)[1] || roleplayRoles(chosenUnit)[0]} onChange={event => setRoleChoice(event.target.value)}>
          {roleplayRoles(chosenUnit).map(role => <option key={role} value={role}>{role}</option>)}
        </select>
        <p>{chosenUnit.goal}</p>
        <button className="button" onClick={() => update(startRoleplay(chosenUnit, roleChoice || undefined))}>Start conversation <ArrowRight size={18} /></button>
      </>}
      <p className="micro">These are guided scenes with supported responses. They check written wording, not pronunciation or unrestricted conversation.</p>
    </section>
  </>;

  const unit = units.find(item => item.id === session.unitId);
  const current = unit?.dialogue[session.turnIndex];
  if (!unit || !current || current.speaker !== session.learnerRole) return <Empty title="This conversation is unavailable." action={<button className="button" onClick={() => go('course')}>Choose a course unit <ArrowRight size={18} /></button>}>Your other practice remains saved. Choose a course unit to start a new conversation.</Empty>;

  const learnerIndices = unit.dialogue.map((line, index) => line.speaker === session.learnerRole ? index : -1).filter(index => index >= 0);
  const turnNumber = learnerIndices.indexOf(session.turnIndex) + 1;
  const correctCount = session.attempts.filter(attempt => attempt.correct).length;
  const supportedCount = session.attempts.filter(attempt => attempt.support !== 'none').length;
  const showModel = session.support === 'revealed' || session.answered;
  const shownLines = unit.dialogue.slice(0, session.completedAt ? unit.dialogue.length : session.turnIndex);
  const lastTurn = turnNumber === learnerIndices.length;
  const nextLearner = unit.dialogue[learnerIndices[turnNumber]];

  function stop() { cancelSpeech(); if (session) update(stopRoleplay(session)); }
  function submit() {
    cancelSpeech();
    if (!session || !unit) return;
    if (/^(stop|stop practice|end session|parar|terminar)[.!?]*$/i.test(session.draft.trim())) { stop(); return; }
    update(submitRoleplay(session, unit));
  }
  const transcript = <section className="panel dialogue roleplay-transcript" aria-label="Conversation so far">
    <div className="section-line"><h2>{session.completedAt ? 'Your conversation' : 'The conversation so far'}</h2><ChatCircleDots size={24} /></div>
    {shownLines.length ? shownLines.map((line, index) => {
      const own = line.speaker === session.learnerRole;
      const attempt = session.attempts.find(item => item.turnIndex === index);
      const text = own && attempt ? attempt.response : line.spanish;
      return <div className={`dialogue-line ${own ? 'other' : ''}`} key={index}>
        <span>{own ? 'You' : line.speaker}</span>
        <div><p lang="es">{text}</p>{!own && <><p className="translation">{line.english}</p><Listen text={line.spanish} settings={settings} label={`Listen to ${line.speaker}, line ${index + 1}`} /></>}
          {own && attempt && <span className="micro">{attempt.correct ? attempt.support === 'none' ? 'Matched without support' : 'Matched with support' : 'Compared with the model'}</span>}
        </div>
      </div>;
    }) : <p className="muted">You open this scene. Use the goal below to begin in Spanish.</p>}
  </section>;

  if (session.stoppedAt || session.completedAt) return <div className="session-summary">
    <div className="summary-icon"><CheckCircle size={42} /></div>
    <span className="eyebrow">{session.completedAt ? 'CONVERSATION COMPLETE' : 'A GOOD PLACE TO PAUSE'}</span>
    <h1>{session.completedAt ? 'You kept the conversation going.' : saved ? 'Your place is saved.' : 'Conversation paused.'}</h1>
    <p>{unit.title} · Your role: {session.learnerRole}</p>
    <div className="summary-stats"><div><strong>{session.attempts.length}</strong><span>replies practiced</span></div><div><strong>{correctCount}</strong><span>matched responses</span></div><div><strong>{supportedCount}</strong><span>with support</span></div></div>
    {!session.completedAt && <section className="panel">
      <h2>Where you will pick up</h2>
      <p>{session.answered ? nextLearner ? `Your current reply is checked. Next, you will express: “${nextLearner.english}”` : 'Your last reply is checked. Continue to finish the scene.' : `Your next reply should express: “${current.english}”`}</p>
      <p className="micro">Your draft and any hint or revealed model are preserved.</p>
    </section>}
    {session.completedAt && transcript}
    <div className="button-row">
      {!session.completedAt && <button className="button" onClick={() => update(resumeRoleplay(session))}>Resume conversation <ArrowRight size={18} /></button>}
      {session.completedAt && <button className="button" onClick={() => update(startRoleplay(unit, session.learnerRole))}>Practice this scene again <ArrowRight size={18} /></button>}
      <button className="button secondary" onClick={() => go(`course/${unit.id}`)}>Back to the unit</button>
    </div>
    {session.completedAt && <button className="text-button" onClick={() => {
      const other = roleplayRoles(unit).find(role => role !== session.learnerRole);
      if (other) update(startRoleplay(unit, other));
    }}>Try the other role</button>}
    <p className="micro">{saved ? 'Saved on this device.' : 'Your progress is only in this tab. Download a backup in Preferences.'} Roleplay practice is separate from spaced recall. Try the scene aloud again after a break.</p>
  </div>;

  return <div className="practice-page roleplay-page">
    <div className="practice-top"><button className="back-link" onClick={() => { cancelSpeech(); go(`course/${unit.id}`); }}><ArrowLeft size={18} /> Pause & save</button><span className="practice-count">Your turn {turnNumber} of {learnerIndices.length}</span><button className="text-button" onClick={stop}>End conversation</button></div>
    <Meter value={session.attempts.length} max={learnerIndices.length} label="Roleplay turns practiced" />
    <div className="practice-heading"><span className="eyebrow">{unit.title}</span><span className="tag green">You are {session.learnerRole}</span></div>
    {transcript}
    <section className="exercise-card roleplay-response">
      <div className="exercise-symbol"><ChatCircleDots size={28} /></div>
      <p className="exercise-instruction">Your turn. Express this idea in Spanish.</p>
      <h1 className="exercise-prompt">{current.english}</h1>
      <p className="micro center">Read or listen to your partner above. Say your reply aloud, then type it to check the wording.</p>
      {session.support === 'hint' && !showModel && <div className="hint-box" role="status"><Lightbulb size={19} /><span>Try starting with <strong lang="es">{current.spanish.split(/\s+/).slice(0, current.spanish.split(/\s+/).length > 4 ? 2 : 1).join(' ')}…</strong> Then express the rest of the idea.</span></div>}
      {showModel && <div className="model-answer"><span className="eyebrow">A NATURAL RESPONSE</span><p lang="es">{current.spanish}</p><Listen text={current.spanish} settings={settings} label="Hear the model reply" /><p className="micro">Use this model to compare the structure. Another phrasing can also be valid.</p></div>}
      <form onSubmit={event => { event.preventDefault(); submit(); }}>
        <label htmlFor="roleplay-answer">Your reply</label>
        <div className={`answer-area ${session.answered ? session.feedback?.correct ? 'answer-correct' : 'answer-review' : ''}`}>
          <textarea ref={answer} id="roleplay-answer" rows={3} maxLength={2000} autoComplete="off" autoCorrect="off" spellCheck={false} disabled={session.answered} value={session.draft} onChange={event => update(setRoleplayDraft(session, event.target.value))} placeholder="Write your reply in Spanish…" onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!session.answered && session.draft.trim()) submit(); }
          }} />
        </div>
        {session.answered ? <div className={`feedback ${session.feedback?.correct ? 'correct' : 'review'}`} role="status" data-testid="roleplay-feedback">
          <div><strong>{session.feedback?.correct ? <><Check size={20} /> {session.support === 'none' ? 'Your reply works.' : 'Your reply works, with support.'}</> : 'Compare your reply.'}</strong><p>{session.feedback?.feedback}</p>{!session.feedback?.correct && <p className="micro">Read the model aloud, then continue. This reply stays recorded as practice with a model comparison.</p>}</div>
          <button className="button" type="button" onClick={() => { cancelSpeech(); update(continueRoleplay(session, unit)); }}>{lastTurn ? 'Finish conversation' : 'Continue conversation'} <ArrowRight size={18} /></button>
        </div> : <div className="exercise-actions"><div><button type="button" className="text-button" disabled={showModel || session.support === 'hint'} onClick={() => update(giveRoleplayHint(session))}><Lightbulb size={19} /> Small hint</button><button type="button" className="text-button" disabled={showModel} onClick={() => update(revealRoleplayAnswer(session))}><Eye size={19} /> Reveal reply</button></div><button type="submit" className="button" disabled={!session.draft.trim()}>Check reply <ArrowRight size={18} /></button></div>}
      </form>
    </section>
    <div className="practice-reassurance"><span><CheckCircle size={16} /> {saved ? 'Conversation saved on this device' : 'Conversation is only in this tab'}</span><span>No timer. Your partner waits for you.</span></div>
    <p className="micro center">Guided wording practice, not a pronunciation score. Accents and punctuation are flexible. Type “stop” to save and finish.</p>
  </div>;
}
