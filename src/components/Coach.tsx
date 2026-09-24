import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChatCircleDots, DownloadSimple, Microphone, SpeakerHigh, Stop } from '@phosphor-icons/react';
import type { Level, Settings } from '../types';
import { appendCoachExchange, coachPrompt, coachRecovery, createCoachTurn, defaultCoachMeta, exportCoach, openCoachDB, parseCoachReply, readCoach, saveCoachMeta, type CoachMeta, type CoachTurn } from '../lib/coach';
import { clipUtf8, nativeAvailable, nativeRequest, utf8Length, type NativeSnapshot } from '../lib/native';
import { PageIntro } from './shared';

export function Coach({ settings }: { settings: Settings }) {
  const native = nativeAvailable();
  const [snapshot, setSnapshot] = useState<NativeSnapshot | null>(null);
  const [turns, setTurns] = useState<CoachTurn[]>([]);
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState<CoachMeta>({ ...defaultCoachMeta, level: settings.level });
  const [draft, setDraft] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState('');
  const [listening, setListening] = useState(false);
  const [micBusy, setMicBusy] = useState(false);
  const [readAloud, setReadAloud] = useState(settings.sound);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState(coachRecovery.error);
  const db = useRef<IDBDatabase | null>(null);
  const unsaved = useRef<CoachTurn[]>(coachRecovery.turns);
  const storageFailed = useRef(Boolean(coachRecovery.error));
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const capturing = useRef(false);
  const voiceGeneration = useRef(0);
  const active = useRef(true);
  const answer = useRef<HTMLTextAreaElement>(null);
  const lastReply = useRef<HTMLDivElement>(null);
  const fail = (error: unknown) => error instanceof Error ? error.message : 'The conversation could not continue. Please try again.';

  useEffect(() => {
    active.current = true;
    if (!native) return;
    let disposed = false;
    const polling = new AbortController();
    let loadingSnapshot = false;
    const refresh = async () => {
      if (loadingSnapshot) return;
      loadingSnapshot = true;
      const voice = voiceGeneration.current;
      try { const next = await nativeRequest<NativeSnapshot>('snapshot', undefined, { signal: polling.signal, timeoutMs: 8000 }); if (!disposed) { setSnapshot(next); if (capturing.current && voice === voiceGeneration.current) {
        setDraft(clipUtf8(next.coachDraft || '', 2000));
        if (!next.coachListening && !next.coachFinal && typeof next.error === 'string' && next.error) { capturing.current = false; voiceGeneration.current++; setListening(false); setError(`Voice input ended early. Review the draft before sending. ${next.error}`); void nativeRequest('coachMicStop').catch(() => {}); }
      } } }
      catch (e) { if (!disposed) setError(fail(e)); }
      finally { loadingSnapshot = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    void openCoachDB().then(async opened => { if (disposed) { opened.close(); return; } db.current = opened; const saved = await readCoach(opened); if (!disposed) { setTurns([...saved.turns, ...unsaved.current].slice(-50)); setTotal(saved.total + unsaved.current.length); if (coachRecovery.meta || saved.meta) setMeta(coachRecovery.meta || saved.meta!); setReady(true); } }).catch(e => { if (!disposed) { storageFailed.current = true; coachRecovery.error = fail(e); setStorageError(fail(e)); setTurns(unsaved.current.slice(-50)); setTotal(unsaved.current.length); if (coachRecovery.meta) setMeta(coachRecovery.meta); setReady(true); } });
    return () => { disposed = true; active.current = false; generation.current++; request.current?.abort(); polling.abort(); clearInterval(timer); db.current?.close(); db.current = null; if (capturing.current) void nativeRequest('coachMicStop').catch(() => {}); capturing.current = false; void nativeRequest('stopSpeech').catch(() => {}); };
  }, [native]);

  useEffect(() => {
    if (!ready) return;
    if (storageFailed.current) { coachRecovery.meta = meta; return; }
    if (!db.current) return;
    void saveCoachMeta(db.current, meta).catch(e => { storageFailed.current = true; coachRecovery.error = fail(e); coachRecovery.meta = meta; setStorageError(fail(e)); });
  }, [meta, ready]);
  useEffect(() => { lastReply.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [turns.length, busy]);
  useEffect(() => {
    const preventLoss = (event: BeforeUnloadEvent) => { if (unsaved.current.length) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', preventLoss); return () => window.removeEventListener('beforeunload', preventLoss);
  }, []);

  async function send() {
    if (busy || listening || micBusy || !draft.trim() || utf8Length(draft.trim()) > 2000 || !snapshot?.coach?.available || snapshot.callActive || !ready) return;
    const text = draft.trim();
    const token = ++generation.current;
    request.current?.abort(); request.current = new AbortController();
    setBusy(true); setPending(text); setError('');
    try {
      await nativeRequest('stopSpeech');
      const reply = parseCoachReply(await nativeRequest('coachReply', coachPrompt(turns, meta, text), { signal: request.current.signal, timeoutMs: 90_000 }));
      if (token !== generation.current || !active.current) return;
      const user = createCoachTurn('user', text), assistant = createCoachTurn('assistant', reply.text);
      const nextMeta = { ...meta, memory: reply.memory };
      if (db.current && !storageFailed.current) {
        try { await appendCoachExchange(db.current, user, assistant, nextMeta, request.current.signal); }
        catch (e) { if (e instanceof DOMException && e.name === 'AbortError') return; storageFailed.current = true; coachRecovery.error = fail(e); coachRecovery.meta = nextMeta; unsaved.current.push(user, assistant); if (active.current) setStorageError(fail(e)); }
      } else { unsaved.current.push(user, assistant); }
      if (token !== generation.current || !active.current) return;
      setTurns(current => [...current, user, assistant].slice(-50)); setTotal(current => current + 2); setMeta(nextMeta); setDraft('');
      if (readAloud) void nativeRequest('speak', { text: clipUtf8(reply.text, 8000) }).catch(e => { if (token === generation.current && active.current) setError(`Reply saved, but audio could not play: ${fail(e)}`); });
    } catch (e) { if (token === generation.current && active.current && !(e instanceof DOMException && e.name === 'AbortError')) setError(fail(e)); }
    finally { if (token === generation.current && active.current) { setBusy(false); setPending(''); answer.current?.focus(); } }
  }
  function interrupt() { generation.current++; request.current?.abort(); setBusy(false); setPending(''); void nativeRequest('stopSpeech').catch(e => setError(fail(e))); }
  async function beginSpeaking() {
    if (busy || micBusy || snapshot?.callActive || !snapshot?.coach?.available) return;
    setMicBusy(true); setError('');
    const voice = ++voiceGeneration.current;
    const token = generation.current;
    try { await nativeRequest('stopSpeech'); if (!active.current || token !== generation.current) return; await nativeRequest('coachMicStart'); if (!active.current || token !== generation.current || voice !== voiceGeneration.current) { await nativeRequest('coachMicStop'); return; } capturing.current = true; setListening(true); setDraft(''); }
    catch (e) { setError(fail(e)); }
    finally { if (active.current) setMicBusy(false); }
  }
  async function finishSpeaking() {
    if (micBusy) return;
    setMicBusy(true); capturing.current = false; voiceGeneration.current++;
    try { const result = await nativeRequest<{ text?: string }>('coachMicStop'); const final = typeof result.text === 'string' ? result.text : (await nativeRequest<NativeSnapshot>('snapshot')).coachDraft; if (active.current && final) setDraft(clipUtf8(final, 2000)); }
    catch (e) { setError(fail(e)); }
    finally { setListening(false); setMicBusy(false); answer.current?.focus(); }
  }
  async function enableMicrophone() {
    setMicBusy(true); setError('');
    try { await nativeRequest('permissions'); const next = await nativeRequest<NativeSnapshot>('snapshot'); if (active.current) setSnapshot(next); }
    catch (e) { if (active.current) setError(fail(e)); }
    finally { if (active.current) setMicBusy(false); }
  }
  async function download() {
    try { const json = await exportCoach(db.current, unsaved.current, meta); const url = URL.createObjectURL(new Blob([json], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'habla-conversation.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (e) { setError(`Transcript export failed: ${fail(e)}`); }
  }

  if (!native) return <>
    <PageIntro label="AI CONVERSATION" title="A conversation that follows you.">Choose a topic, speak or type in Spanish, and get a natural reply with focused coaching.</PageIntro>
    <section className="panel"><div className="section-line"><h2>Open the Mac companion</h2><ChatCircleDots size={28} /></div><p>AI conversation runs locally in the Habla Mac companion using Apple Intelligence. It needs a compatible Mac, macOS 26 or later, Apple Intelligence enabled, and available Spanish model support. Microphone input also needs on-device speech recognition and permission.</p><p>The website does not call a cloud AI service. Your course and guided missions still work here.</p><div className="button-row"><a className="button" href="habla://coach">Open Habla for Mac <ArrowRight size={18} /></a><a className="button secondary" href="#calls">Companion setup</a></div></section>
    <section className="panel"><h2>Practice here while you get set up</h2><p>Guided conversations and missions give you authored situations, editable replies and useful feedback.</p><div className="button-row"><a className="button secondary" href="#missions">Try a mission</a><a className="button secondary" href="#course">Choose a course unit</a></div></section>
  </>;

  const available = snapshot?.coach?.available && !snapshot.callActive;
  return <>
    <PageIntro label="AI CONVERSATION · ON THIS MAC" title="Let’s keep talking.">Follow your curiosity. Say something in Spanish, ask a question or tell the coach what you want to practice.</PageIntro>
    {!snapshot && <p role="status">Checking the Mac’s on-device conversation features…</p>}
    {snapshot && !available && <section className="panel" role="status"><h2>{snapshot.callActive ? 'Finish the call before coaching' : 'The local coach is not ready'}</h2><p>{snapshot.callActive ? 'Live call translation and conversation coaching use the microphone separately.' : snapshot.coach?.reason || 'Check Apple Intelligence and Spanish model availability in your Mac settings.'}</p><a className="text-link" href="#calls">Open companion setup</a></section>}
    {error && <div className="hint-box" role="alert">{error}</div>}
    {typeof snapshot?.error === 'string' && snapshot.error && !error.includes(snapshot.error) && <div className="hint-box" role="alert">{snapshot.error}</div>}
    {storageError && <section className="panel" role="alert"><h2>Keep this conversation safe</h2><p>{storageError}</p><p>New replies are only in this open view. Export before leaving. Course backups do not include this separate conversation transcript.</p><button className="button secondary" onClick={() => void download()}><DownloadSimple size={18} /> Export transcript now</button></section>}
    <section className="panel coach-settings"><div className="section-line"><h2>Make it your conversation</h2><button className="text-button" onClick={() => void download()} disabled={!ready}><DownloadSimple size={18} /> Export transcript</button></div><label htmlFor="coach-topic">Topic or situation</label><input id="coach-topic" value={meta.topic} disabled={busy || listening} onChange={event => setMeta(current => ({ ...current, topic: clipUtf8(event.target.value, 200) }))} placeholder="Food, travel, your day, a topic you love…" /><label htmlFor="coach-level">Conversation level</label><select id="coach-level" value={meta.level} disabled={busy || listening} onChange={event => setMeta(current => ({ ...current, level: event.target.value as Level }))}><option value="A1">A1 · Short, simple exchanges</option><option value="A2">A2 · Everyday conversation</option><option value="B1">B1 · Stories and opinions</option></select><label className="checkbox-label"><input type="checkbox" checked={readAloud} onChange={event => setReadAloud(event.target.checked)} /> Read replies aloud</label><details><summary>What the coach remembers</summary><p className="micro">The coach receives the last eight messages and this short rolling summary. Older transcript entries stay on this Mac but are not all sent to the model. Add a reminder when revisiting an older topic. You can edit the summary.</p><label htmlFor="coach-memory">Conversation memory</label><textarea id="coach-memory" rows={3} value={meta.memory} disabled={busy || listening} onChange={event => setMeta(current => ({ ...current, memory: clipUtf8(event.target.value, 700) }))} /></details></section>
    <section className="panel dialogue coach-transcript" aria-label="Conversation transcript"><div className="section-line"><h2>Your conversation</h2><span className="micro">{total} messages</span></div>{!ready ? <p role="status">Opening your local conversation…</p> : !turns.length ? <p className="muted">Start with a greeting, tell a story or ask to practice a situation. The coach will adapt its replies to your chosen level.</p> : <>{total > turns.length && <p className="micro">Showing the latest {turns.length} messages. Export includes the complete saved transcript.</p>}{turns.map(turn => <div className={`dialogue-line ${turn.role === 'user' ? 'other' : ''}`} key={turn.id}><span>{turn.role === 'user' ? 'You' : 'Coach'}</span><div><p lang={turn.role === 'assistant' ? 'es' : undefined}>{turn.text}</p>{turn.role === 'assistant' && <button className="listen-button" disabled={busy || listening || micBusy || snapshot?.callActive} onClick={() => void nativeRequest('speak', { text: clipUtf8(turn.text, 8000) }).catch(e => setError(fail(e)))}><SpeakerHigh size={18} /> Listen to reply</button>}</div></div>)}</>}{busy && <div role="status"><p><strong>You:</strong> {pending}</p><p>The coach is thinking on this Mac…</p></div>}<div ref={lastReply} /></section>
    <section className="panel coach-composer">{snapshot && (snapshot.microphonePermission !== true || snapshot.speechPermission !== true) && <div><button className="button secondary" disabled={busy || micBusy || listening || snapshot.callActive} onClick={() => void enableMicrophone()}>Enable microphone &amp; speech</button><p className="micro">macOS will ask for access. Typing works without microphone permission.</p></div>}<form onSubmit={event => { event.preventDefault(); void send(); }}><label htmlFor="coach-answer">Your message</label><textarea ref={answer} id="coach-answer" rows={3} value={draft} disabled={busy || listening || micBusy} maxLength={2000} onChange={event => setDraft(event.target.value)} placeholder="Hola. Quiero practicar…" /><p className="micro">{listening ? 'Listening. Finish speaking, review the transcript, then send when you are ready.' : 'Edit freely before sending. Voice input never submits a message automatically.'}</p>{utf8Length(draft.trim()) > 2000 && <p role="status">This message is too long. Shorten it before sending.</p>}<div className="button-row">{listening ? <button type="button" className="button secondary" disabled={micBusy} onClick={() => void finishSpeaking()}><Stop size={18} /> Finish speaking</button> : <button type="button" className="button secondary" disabled={!available || busy || micBusy || !ready} onClick={() => void beginSpeaking()}><Microphone size={18} /> Speak your message</button>}{busy ? <button key="stop-reply" type="button" className="button secondary" onClick={event => { event.preventDefault(); interrupt(); }}><Stop size={18} /> Stop reply</button> : <button key="send-message" className="button" type="submit" disabled={!available || !ready || listening || micBusy || !draft.trim() || utf8Length(draft.trim()) > 2000}>Send message <ArrowRight size={18} /></button>}<button type="button" className="text-button" disabled={busy} onClick={() => void nativeRequest('stopSpeech').catch(e => setError(fail(e)))}>Stop audio</button></div></form></section>
    <p className="micro center">No fixed turn limit. Conversation remains subject to local storage and device availability. AI can make mistakes; course completion and conversation are not proficiency certification.</p>
  </>;
}
