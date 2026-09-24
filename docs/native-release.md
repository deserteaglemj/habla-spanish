# Native conversation and mission release

Prepared September 24, 2026.

## Included

- Mission practice based on publicly described CIA learning practices, with preparation, rehearsal, adaptation, support tracking and real-world check-ins.
- Native on-device Spanish AI conversation with topic changes, spoken input/replies, complete local transcript storage/export and bounded rolling memory.
- Native call translation with physical microphone capture, private per-process incoming audio, isolated translated output and local transcripts.
- Public companion setup pages with accurate capability requirements.
- Validated mission backups, activity totals, mobile navigation and storage/error recovery.

The public native source is under `companion/`. Private development handoffs, personal files, prior private repository history and local transcripts are excluded.

## Verification

- Web build passed.
- 85 web unit tests passed.
- 32 browser tests passed, including complete mission flow, storage, cancellation, explicit dictation submission, mobile/accessibility checks and call UI controls.
- Real installed Apple Translation produced Spanish output.
- Real Foundation Models generated Spanish conversation and followed a cooking-to-beach topic change in three independent two-turn probes.
- Native WebKit rendered the bundled web app, saved local progress and reached the native Promise bridge.
- Production exports save automatically to `~/Library/Application Support/Habla/Exports` with private permissions and unique filenames, then reveal the completed file in Finder. The packaged app exported all six saved test messages successfully.
- WebKit integration tests saved exact expected bytes for two default exports and a delayed test destination after browser blob revocation.

The final native regression suite registered 65 tests: 63 executed and passed, and two optional real-model probes were skipped in that suite and passed separately. Native tests additionally cover origin/path validation, lifecycle cancellation, audio routing, PCM ownership, bounded segmentation/backlog, playback drain, transcript atomicity and export filename and destination policy.

## Practical limits

The website supports learning and mission practice on its own. Native AI and live-call audio require the Mac companion and compatible on-device Apple services. There are no cloud model API calls or fixed conversation-turn quotas, but storage and model context remain finite.

Real microphone/audio permission acceptance and a consenting call remain physical-device acceptance checks. The local app build is ad hoc signed and is not a notarized public installer. No real call was placed by the build process. Do not treat automated tests as proof of acoustic quality or live call success.

## Rollback

Vercel can roll back the web deployment. Version 1 course backups remain readable, including optional mission fields. The app packaging script preserves previous app builds with timestamped names. Keep local learner data and transcripts when replacing binaries.
