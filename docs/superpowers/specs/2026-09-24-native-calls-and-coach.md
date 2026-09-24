# Habla native calls, conversation coach and mission practice

## Intent
Extend the existing Habla learning app with live English/Spanish call translation, open-topic adaptive Spanish voice conversation, and mission practice grounded in public CIA language-training sources. Preserve the public website, private learner state and existing course. The user authorizes autonomous implementation and has asked not to pause for design feedback.

## Architecture
The existing Swift Call Translator becomes a native Habla companion on macOS 26 or later. It bundles the same Habla production web interface in WKWebView. Only the bundled app-owned origin receives a narrow native bridge. The public Vercel website shows truthful companion setup guidance and continues to provide the learning course. No local HTTP server, cloud model, account, paid API or automatic upload is introduced.

Native audio uses separate routes: a physical microphone captures English; synthesized Spanish goes exclusively to BlackHole selected as the calling app microphone. A private Core Audio process tap captures the calling application's far-side audio. The call's speaker output must remain physical and must not include BlackHole. The existing handoff's shared-loopback route would return the other person's voice to them, so it is superseded by this isolated topology. Permissions and language downloads use Apple's normal interactive UI. No calls are placed automatically.

Apple Translation provides real EN/ES translation. Apple Speech must require on-device recognition and fail clearly if unavailable. Apple Foundation Models provides the adaptive Spanish coach when Apple Intelligence and Spanish are supported. The coach follows chosen topics and skill level, offers short natural replies and selective corrections, waits for explicit completed input, and imposes no fixed turn quota. Bounded rolling context and a learner-visible memory summary prevent context-window growth; local history can be exported. Availability and errors are explicit, with no canned response presented as generated AI.

## Bridge contract
WKScriptMessageHandlerWithReply name `habla`. Request: `{version:1,command:string,payload?:object}`. Response: `{ok:true,result:object}` or `{ok:false,error:string}`. Allowlisted commands: snapshot, permissions, prepareTranslation, startCall, endCall, pttDown, pttUp, translateText, coachReply, coachMicStart, coachMicStop, stopSpeech, openTranscriptFolder. Validate main frame, app-owned origin, payload bounds and types. Never interpolate call text into JavaScript. Reject remote navigation and frames; documentation links open externally. Calls and coaching cannot capture concurrently.

Snapshot: capabilities, call state, near/far original and translated text, recent final transcript entries, selected routing, available physical inputs/virtual outputs/processes, audio level, recognition draft, and explicit error/save status. Native transcripts remain on the Mac. Sending selected phrases to learning is deliberate, not automatic import of the whole call.

## Mission learning
Each unit supplies a communicative goal, contextual briefing, preparation with optional models, rehearsal, changed-context task and debrief. Spanish-first rehearsal is optional after foundations; requested English/model help is retained as support evidence. Track practice evidence, not certification. Attribute current public CIA descriptions separately from historical FSI-developed materials used by CIA. Do not promise accelerated fluency or claim CIA affiliation.

## Resource and privacy bounds
No API fees or recurring model charges, including repeated turns. Estimated incremental native memory is 2-6 GB during recognition and local model use, with CPU/Neural Engine bursts; actual use depends on system model availability. Apple manages any initial model/language downloads, potentially several GB. Existing static website costs and browser learning behavior remain unchanged. No new driver installation or system-default audio changes. Public source and bundles exclude private learner state, call logs and local configuration.

## Acceptance and limits
Fresh web unit/browser tests and native unit/release-build checks. Verify bridge authorization, unsupported native states, no answer leaks, rolling conversation context, transcript export, cancellation and stale callbacks. Run real translation and local AI probes if installed assets allow. Permission prompts and a consenting two-party 10-minute call with at least 10 turns are required to verify physical routing, latency, returned echo and transcript coherence. Automated checks are not evidence that this real-call gate passed.
