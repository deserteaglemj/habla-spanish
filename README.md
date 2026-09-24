# Habla

A public, account-free space for everyday Latin American Spanish practice.

**[Open Habla](https://habla-spanish-nu.vercel.app)**

## What you can do

- Follow 24 guided units across A1, A2 and B1 course material, with 144 phrases and changed-context exercises.
- Read and listen to 24 dialogues and 24 short stories, with English support and comprehension checks.
- Take either role in 24 guided conversations, with hidden learner turns, explicit feedback, saved drafts and tracked support.
- Practice recall, listening transcription, meaning and contextual production. New phrases include a model and a short explanation.
- Revisit phrases on an adjustable spaced schedule. Supported repetition stays distinct from independent recall.
- Save sessions, resume your exact prompt and draft, review your history, bookmark phrases and add your own.
- Use browser text-to-speech and optional dictation. Dictation waits for you to submit, and its text remains editable.
- Follow mission practice inspired by public CIA descriptions: prepare, rehearse, adapt and debrief, with help tracked honestly.
- Talk freely with an on-device Spanish AI coach in the Mac companion, with editable dictation, spoken replies, rolling memory and complete local transcript export.
- Translate calls in the Mac companion using separate audio paths for your microphone, the calling app and translated speech.
- Download and restore progress backups. Carry a coaching brief to ChatGPT and import structured session observations afterward.

## Data and privacy

There are no accounts, server-side databases, advertising trackers, cloud AI endpoints or paid model calls. Every visitor begins with empty progress. Course progress stays in localStorage and AI conversations use IndexedDB on the current device; this data is not shared with other visitors or automatically synchronized across devices. The public curriculum uses fictional examples.

Browser dictation may send audio to the browser provider. Habla stores no recordings. Hosting providers receive normal website requests. Use Settings to download a backup before clearing site data or moving devices. Backup export is lossless and restore applies the same record limits as the app. Very large histories may exceed the browser storage quota; Habla reports that failure and keeps a downloadable copy in the open tab. Recent detail is limited to 10,000 attempts and 500 sessions; per-phrase cumulative totals persist. Corrupted saved data can be downloaded for recovery before explicit replacement. A stale tab cannot silently overwrite a newer saved state.

## Learning approach and limits

See [the evidence review](docs/research.md). Habla combines retrieval practice, spacing, corrective feedback, understandable input and varied production. The exact scheduling intervals are design choices. Course levels are labels for the material, not certification. The authored course is finite; repeat practice and custom phrases remain available without a session quota.

Guided course conversations follow authored scenes. The separate Mac AI coach generates adaptive, open-topic replies with no fixed turn quota. It receives the latest eight messages and a short rolling summary; it does not have infinite memory. Local storage and device availability still apply. Text matching recognizes curated alternatives but cannot judge every possible response, unrestricted conversation, or pronunciation. This app does not claim record-speed fluency. Real conversation, varied listening and reading remain valuable alongside structured study.

ChatGPT integration is a manual JSON/text handoff. Habla cannot read ChatGPT conversations or memory. Imported answers are checked locally, support is retained, repeated imports are deduplicated, and a next-step note appears on the dashboard.

## Mac companion

The companion source is in [companion](companion/README.md). It requires Apple silicon and macOS 26 or later. AI coaching additionally requires available Apple Intelligence with Spanish support. Speech input requires on-device speech recognition; call translation requires English and Spanish speech recognition and installed Apple Translation language packs. AI and translation have no per-call API cost. The companion loads a bundled copy of Habla, never grants native access to a remote website, and keeps chat and transcripts local.

Speech recognition requires explicit microphone and speech permissions. Live calls additionally need Core Audio capture access and an existing BlackHole device. The calling app microphone must use BlackHole while its output stays on physical speakers or headphones. The app refuses overlapping audio routes and never changes system defaults. Real-world call quality still requires a consenting call test; passing automated tests is not a substitute.

No signed or notarized public installer is provided. The build script produces a local, ad-hoc signed app. A browser alone cannot capture another app's audio or use Apple's native on-device model through this integration.

## Development

Requires Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
npm test
npm run build
```

Browser tests use installed Google Chrome locally:

```sh
npm run test:e2e
```

On CI, Chromium is installed with `npx playwright install --with-deps chromium`. To test an existing deployment, set `HABLA_TEST_URL` to its URL. No secrets or environment files are required by the application.

## Deploy

Import the GitHub repository into Vercel as a Vite project. Build command: `npm run build`. Output directory: `dist`. The application is static and uses hash routes, so every learning page can be refreshed without a server-side router.

The authorized production deployment and verification receipt are recorded in [release notes](docs/release.md). Roll back a deployment with Vercel's rollback mechanism; learner storage is unaffected by a source rollback as long as the version 1 data contract is retained.

## Continuation

See the [continuation prompt](docs/HANDOFF.md) and [native release evidence](docs/native-release.md) before extending the integration.

## License

MIT. See [LICENSE](LICENSE).
