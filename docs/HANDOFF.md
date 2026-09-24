# Habla continuation prompt

Continue development of the existing Habla Spanish-learning app. Work from this repository, preserve its current features and design, and inspect the current Git state before changing anything. Do not start a parallel rebuild.

## Project

- Website: https://habla-spanish-nu.vercel.app
- Repository: https://github.com/deserteaglemj/habla-spanish
- Web stack: React, TypeScript and Vite.
- Mac companion source: `companion/`.
- Vercel project: `habla-spanish`, scope `quis1`.
- Product direction: practical Spanish learning, truthful progress, publicly documented mission-training practices, adaptive conversation and live-call translation.

The user authorized autonomous implementation and deployment. Do useful work without routine review pauses. Do not add paid infrastructure or API costs without explicit authorization. Do not expose personal information, transcripts, private handoffs or credentials in public source. Do not read or modify environment-secret files or SSH files. Do not use destructive cleanup, overwrite unrelated work or force-push. Never use the U+2014 punctuation character.

## Implemented behavior

The public website has 24 A1/A2/B1 units, 144 phrases, guided conversations, reading/listening, spaced review, a phrasebook, local progress, backups and mission practice. Missions use brief, prepare, rehearse, adapt and debrief phases. Support is tracked honestly; mission effort counts as activity but does not inflate independent mastery. These activities are inspired by public CIA descriptions, not an official CIA course or certification. Read `docs/research.md` and `docs/mission-method.md` for the evidence and limits.

The Mac companion bundles this same interface and adds native Apple on-device AI, speech recognition, translation and call audio. The website alone does not run these native capabilities. Keep that boundary explicit.

AI conversation supports topic changes, level adaptation, editable spoken drafts, spoken replies, interruptions and no fixed turn quota. Full exchanges are stored in local IndexedDB. The interface shows the latest 50 messages; the model receives the latest eight and a compact visible/editable memory. Older details may need a reminder. Full transcript export includes older saved turns. Do not promise infinite memory or error-free AI.

The latest learner message has explicit precedence and appears last in the bounded model prompt. This was corrected after a real UI test stayed on an old cooking topic. Three real cooking-to-beach probes then followed the new topic despite old history, topic and memory.

Fluency practice repeats phrases already recalled independently or used in transfer. It records activity, shows a suggested pace that does not auto-grade, and leaves spaced-review dates and independent counts unchanged. It is not a pronunciation or speaking-speed score.

Call audio follows separate paths:

- Physical mic -> English recognition -> Spanish translation -> BlackHole output -> calling app microphone.
- Calling app physical output -> private Core Audio process tap -> Spanish recognition -> English captions.

Never capture the incoming call and inject translated speech through the same BlackHole loopback. That creates echo. The app validates audio routes, never changes system defaults and never installs drivers. Participants must know translation and a local transcript are enabled. End/save failures keep recoverable data in the open app.

## Important implementation locations

- `src/App.tsx`: routes, storage protection and mission/roleplay archiving.
- `src/lib/engine.ts`: review scheduling, validated backups and activity evidence.
- `src/lib/missions.ts`, `src/components/Missions.tsx`: guided mission state and UI.
- `src/lib/coach.ts`, `src/components/Coach.tsx`: complete local conversations, bounded context and recovery.
- `src/lib/native.ts`, `src/components/Calls.tsx`: typed native bridge and call controls.
- `companion/App/AppModel.swift`: capture/translation/coach lifecycle and transcript saving.
- `companion/App/MenuBar.swift`: bundled WebKit interface, bridge, local export destinations and shortcuts.
- `companion/App/Speech/AppleCoachService.swift`: real Foundation Models replies and cancellation.
- `companion/Sources/CallTranslatorCore/CoachContext.swift`: bounded context and latest-message precedence.
- `companion/App/Audio/`: device selection, isolated process capture, speech recognition and buffered PCM.
- `companion/Sources/CallTranslatorCore/TranscriptStore.swift`: atomic manifest-last transcript persistence. Preserve its failure handling.

Only the bundled `habla-app://bundle` main frame may use the allowlisted native bridge. A remote Vercel page must never receive native access. Do not replace this with an unauthenticated localhost bridge. Native transcripts stay local; they are not automatically imported into course backups.

## Build and verify

```sh
npm ci
npm run build
npm test
npm run test:e2e -- --output=/tmp/habla-browser-verification

cd companion
swift test
./make_app.sh ../dist
```

The native app requires Apple silicon and macOS 26 or later. AI coaching requires available Apple Intelligence with Spanish support. Speech input requires on-device speech recognition; call translation requires English/Spanish speech recognition and installed Apple Translation assets. Call translation also needs an existing BlackHole device. The package script preserves prior app builds and produces a locally signed `build/Habla.app`.

Optional real native checks, from `companion/`:

```sh
HABLA_LOCAL_MODEL_PROBE=1 swift test --filter realLocalServices
HABLA_LOCAL_MODEL_PROBE=1 swift test --filter realCoachFollowsLatest
HABLA_WEB_ROOT="$(cd ../dist && pwd)" swift test --filter nativeBundledWeb
```

Inspect the actual current test names if filters change. Avoid running browser suites into the same output directory concurrently. Tests distinguish mocked browser integration from real local-model and WebKit checks. No test result alone proves a consenting real call worked.

## Remaining acceptance and distribution boundaries

Before claiming live calls are fully verified, complete a consenting multi-turn call using actual microphone/audio permissions, verify both translation directions, interruption/echo behavior, end/save and transcript contents. Do not initiate a call or bypass permission prompts without appropriate authorization.

The Mac build is locally signed for development. There is no notarized public installer. A public signing/notarization process and any cloud/browser AI option require separate deliberate decisions; do not claim they are already supplied.

The web and companion store learning data separately. Use the course backup export/import to transfer it. AI transcript export is separate. Do not erase existing local data when updating the app.

## Working approach

Read `docs/native-companion.md`, `docs/native-release.md`, the relevant code and tests before modifying the implementation. Keep the existing forest/ivory interface, keyboard access, mobile More navigation, explicit speaking controls and visible storage errors. Retain meaningful independent tests and verify the actual shipped artifact after changes.

For publication, inspect the existing Vercel target before deploying, commit only intended files, push the existing GitHub project, and verify the live site and deployment status. Record exactly what was tested, what shipped and any remaining physical-device limitations. Never describe a setup screen, local preview, queued deployment or mocked test as completed production functionality.
