# Habla native calls and conversation implementation plan

**Goal:** Integrate the existing Mac translator, adaptive voice coach and evidence-grounded mission learning with Habla.
**Architecture:** Bundled React UI with an allowlisted WKWebView native bridge; local Apple translation, recognition, synthesis and Foundation Models. Isolated virtual microphone and process-tap capture.
**Tech stack:** Existing React/TypeScript/Vite, SwiftPM, Core Audio, AVFoundation, Speech, Translation, FoundationModels and WebKit.
**Spec:** ../specs/2026-09-24-native-calls-and-coach.md
**Execution:** Parallel independent workers plus root integration. User has already authorized autonomous work without approval pauses.

## Work, ownership and verification
1. [Codex, native service and audio workers] Complete the native services in the existing Call Translator repository. Service worker owns AppleTranslationService, SpeechRecognizerService, AppleCoachService and matching tests; audio worker owns device/process enumeration, physical MicCapture, process-tap FarSideCapture and routed Spanish synthesis. Root owns AppModel, menu/window, hotkey, bridge and packaging. Write failing pure regressions where possible, implement and run `env TMPDIR=/tmp swift test`. Use fresh `--scratch-path` for release checks, never delete the existing build. Expected output: real local service adapters and safely isolated audio with explicit unavailable states.
2. [Codex, root and mission worker] Add Calls and AI conversation views, typed bridge client, protected local coaching history and reusable mission practice. Mission worker owns new mission module/component/tests plus public learning-source documentation. Root integrates routes, progress/backup schema and public companion guidance. Commands: `npm test`, `npm run build`, `npx playwright test`. Expected output: accessible working views on browser and native surfaces, no fake native capability, support-preserving mission evidence and open-topic coaching through the actual local model.
3. [Codex, root with independent review] Package the native companion with the verified web build, inspect privacy and bridge boundaries, test local model/translation availability, run fresh unit/build/browser verification, commit scoped changes and publish the updated authorized website. Save release receipt, actual limitations and rollback instructions. [User] Only OS permission grants, model-download prompts and a consenting real call require physical participation; expose concrete setup controls first. Expected output: usable app integration plus an honest distinction between automated evidence and real-call acceptance.

## Review focus and mitigations
- Direct returned audio echo: one BlackHole bus is output-only for Spanish injection; process tap independently captures the selected call source. Reject virtual near input and same-bus capture/injection.
- Permission denial, missing local models or unsupported locale: fail closed with actionable setup UI; never fall back to cloud or echo the input as translation.
- Stale callbacks after stop/new session: generation IDs and serialized lifetimes prevent wrong-call speech, transcripts or AI replies. Test cancellation and duplicate submission.
- Hostile web message/path: app-owned bundled origin, main-frame check, command allowlist, strict payload bounds and safe resource paths. Test origin/path rejection and no transcript interpolation.
- Unbounded AI context/history: bounded prompt context, visible memory, local history/export and storage-failure recovery. No fixed conversation-turn quota; no claim of unlimited physical storage.

## Self-check
Owners, commands, artifacts, context boundaries and five failure modes are explicit. Existing core transcript protections stay intact. No paid infrastructure, driver install, personal seed data or new external-account requirement. An independent review is requested before presenting this plan; review notes will be added after inspection.
