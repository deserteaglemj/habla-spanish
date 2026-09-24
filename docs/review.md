# Independent correctness review

Reviewed the learning engine, backup validation, storage, state types, engine tests, and their connections to App, Practice, and Settings. Initial review: 23 September 2026. The original findings below are retained as an audit trail. Their line references describe the initial implementation; use the re-review table for current status.

## Re-review after remediation

Current assessment: **all six original correctness findings resolved for their reported reproduction paths.** Product-scope observations from the original brief are listed separately below and are not covered by this correctness closeout.

Fresh validation: `npm test -- --reporter=dot` passed **46 tests in three files**. Source and regression tests were independently inspected. A direct sweep of the current curriculum confirmed all 144 displayed English models are accepted in comprehension mode. The reviewer's attempt to rerun the storage and audio browser suites could not start its server because the sandbox denied binding port 5173, so that invocation supplied no browser result. The implementation team separately reported passing browser tests. Real microphone capture and audible output have not been physically tested; the audio suite exercises mocked browser API lifecycles.

| Finding | Current status | Current evidence |
| --- | --- | --- |
| Stale tab overwrites newer progress | Resolved for the reported stale-tab sequence | `src/App.tsx:17`, `src/App.tsx:27` compare the current stored snapshot before writes and preserve the conflicting tab in memory. `tests/browser/storage.spec.ts:2` opens two pages and asserts the first page's saved preference survives a stale write attempt. Explicit user replacement remains possible. |
| Failed-load recovery loses access to original | Resolved | `src/App.tsx:35` downloads the untouched stored string separately from current-tab progress. `src/App.tsx:41` clears the original error only after a successful explicit replacement; the button now says what it replaces. `tests/browser/storage.spec.ts:10` checks that a recovery download leaves original storage unchanged. |
| Export/import size mismatch | Resolved | `src/components/Settings.tsx:12` no longer applies a smaller file-size cutoff. `src/lib/engine.ts:291`, `src/lib/engine.ts:340`, and `src/lib/engine.ts:356` preserve lossless full backups while retaining strict schema, record-count, and string-length validation. `tests/backup.test.ts:6` passes a greater-than-16-MB Unicode round trip without dropping data. External coaching input retains a separate byte-based cap at `src/lib/engine.ts:392`, verified by `tests/backup.test.ts:17`. |
| Incorrect subject stripping | Resolved | `src/lib/engine.ts:34` through `src/lib/engine.ts:36` now require compatible conjugated verbs after optional clitics. `tests/engine.test.ts:47` rejects `Yo me gustaría...` and `Tú quiero...` while accepting `Yo me levanto...`; these tests passed in the fresh run. |
| Editorial annotations required as English answers | Resolved | `src/lib/engine.ts:54` through `src/lib/engine.ts:69` applies the same known-annotation normalization to candidates and learner responses. `tests/engine.test.ts:32` accepts plain English; `tests/engine.test.ts:38` accepts a copied model but rejects unrelated parenthetical learner content and annotation-only responses. All 144 displayed English models also passed a direct current-curriculum sweep. |
| Invalid imported session cannot resume | Resolved for backup restoration | `src/components/Settings.tsx:12` passes the current course into `importBackup`. `src/lib/engine.ts:342` validates active phrase and unit references; `src/lib/engine.ts:376` also rejects custom/built-in ID collisions. `tests/engine.test.ts:288` and `tests/engine.test.ts:298` verify unknown and mismatched active content is rejected while recoverable history is retained. Low-level raw recovery intentionally remains permissive without course context. |

The six fixes are suitable for the release verification stage. This is a bounded review, not proof that every feature or browser works. The observed speech-testing limit should remain clear in the release record. Very large manually selected local backups still consume browser memory during parsing; imports validate before replacing current progress and do not silently trim exported data.

## Original-brief scope comparison

The later instruction to make a public app without personal information supersedes publishing the private seed progress and personal resume point. Leaving public visitors with empty progress is therefore appropriate. No private learner examples are reproduced here.

The following product-depth requirements are not established by the current README and reviewed implementation:

1. **Interactive short roleplay.** `src/components/Course.tsx:11` shows read-along dialogues and invites learners to take a part themselves. `src/lib/engine.ts:116` implements conversation mode as individual changed-context phrase prompts. There is no tracked multi-turn learner-role sequence with hidden upcoming responses.
2. **Specific error categories and correction.** `src/lib/engine.ts:77` currently emits spelling or unrecognized for mismatches. The declared language-error category is unused, so known grammar mistakes receive the same generic mismatch feedback as valid but unlisted alternatives. This falls short of the brief's requested distinction, although the UI truthfully explains text-matching limits.
3. **Adaptive freedom and concrete next steps.** `src/lib/engine.ts:119` cycles exercise kinds by count rather than increasing conversational freedom after independent success. `src/components/Practice.tsx:32` provides practiced phrases and broad revisit advice, but not a concrete next prompt or named priority item.

These observations are separate from the six fixed defects. They identify remaining brief alignment work without requiring accounts, paid AI, or publication of private learner history.

## Original findings

Initial validation: all 33 then-existing tests passed. Additional direct calls to the engine reproduced the grading, backup-size, and invalid-reference failures below.

## P1: A second open tab can silently overwrite newer progress

**Location:** `src/App.tsx:16`, `src/App.tsx:19`, `src/App.tsx:21`; `src/lib/storage.ts:18`.

Each tab loads its own snapshot once. Every update writes that entire snapshot to the same storage key. There is no storage-event synchronization or conflict check. Open two tabs, complete practice in the first, then change a preference or type an answer in the second: the second tab writes its stale progress object over the first tab's new attempts. The save reports success, so the learner has no reason to back up or investigate.

**Fix:** reconcile incoming storage events and protect writes against stale revisions. If safe merging is unavailable, stop a stale tab from overwriting newer data and offer reload/export. Verify with two browser pages sharing the same storage origin.

## P1: Failed-load recovery offers an overwrite without access to the preserved data

**Location:** `src/lib/storage.ts:12`; `src/App.tsx:21`, `src/App.tsx:24`; `src/components/Settings.tsx:11`.

When saved JSON cannot be read, `loadState` substitutes an empty state and initially preserves the raw stored value. However, Download backup exports only that replacement state. The recovery button immediately writes the replacement to the original key and clears the initial error. A learner following the banner's export/retry guidance can therefore download an empty or partial backup and permanently overwrite the only recoverable original.

**Fix:** expose a download of the untouched raw stored value before replacement, distinguish it from the current-tab backup, and make replacing unreadable storage an explicit action. Test a valid-looking backup that fails one nested validation, not only the string `{bad`. Do not call the replacement successfully saved until the write succeeds.

## P2: The app cannot restore some of its own valid backups

**Location:** `src/components/Settings.tsx:12`; `src/lib/engine.ts:4`, `src/lib/engine.ts:326`.

Settings refuses files over 5,000,000 bytes, while engine imports allow 16,000,000 characters and exports have no matching bound. A state containing 2,600 otherwise valid attempts with 2,000-character responses exported to **5,672,348 bytes** and passed `importBackup`, but the UI rejects that file before parsing it. Larger legitimate runtime states can also exceed the engine limit and produce exports the engine itself cannot restore. This affects the recovery path precisely when localStorage fills up.

**Fix:** use one byte-based export/import limit across the UI and engine, and ensure runtime retention policy keeps an exported state restorable. Alternatively provide an explicit archival format for older attempts. Add a near-limit round-trip test that uses the UI's file path and multibyte Spanish text.

## P2: Subject stripping accepts grammatically wrong Spanish

**Location:** `src/lib/engine.ts:34` through `src/lib/engine.ts:36`.

The optional-subject rules accept `me`, `te`, and `nos` without inspecting the verb. For the real curriculum phrase `Me gustaría aprender a bailar.`, the engine marks **`Yo me gustaría aprender a bailar.`** correct after removing `yo`. The leading `yo` is not an optional grammatical subject here. The same broad reflexive/clitic shortcut defeats the nearby comment promising a matching conjugated verb and can award independent recall for an incorrect construction.

**Fix:** remove these blanket clitic branches or match only explicitly compatible constructions. Preserve curated alternatives for valid variants. Add this real-curriculum regression alongside the existing `tú quiero` rejection.

## P2: English comprehension requires learners to type editorial annotations

**Location:** `src/lib/engine.ts:55` through `src/lib/engine.ts:58`; example data in `src/data/curriculum.ts:35`.

Comprehension accepts only `phrase.english`. Several curriculum meanings contain annotations such as `(informal)`. For `¿Cómo estás?`, **`How are you?`** is rejected because the stored English meaning is `How are you? (informal)`. The English translation is correct; the learner is being graded on metadata that the prompt does not request. This creates a lapse and schedules corrective practice for a correct answer.

**Fix:** separate pedagogical annotations from accepted meaning answers or strip only recognized editorial annotations when building English candidates. Add regression coverage for informal/formal and gender annotations without making general semantic grading promises.

## P2: Backup validation accepts a session that cannot be resumed

**Location:** `src/lib/engine.ts:344` through `src/lib/engine.ts:349`; resulting behavior in `src/components/Practice.tsx:33`.

Validation checks identifier syntax but never resolves identifiers against the current curriculum and imported custom phrases. A backup with `session.exercise.phraseId = 'not-in-the-course'` is accepted. Practice then displays its empty-state message instead of the prompt, while `nextExercise` refuses to advance the unanswered exercise. Unknown progress IDs also contribute to statistics even though no actual phrase can be reviewed. This can arise from an edited or mismatched backup and is not described as a validation failure before current progress is replaced.

**Fix:** perform referential validation with the current curriculum before confirming replacement. Reject unknown current-exercise IDs, unknown lesson unit IDs, and collisions between custom and built-in phrase IDs, or apply a clearly reported migration that preserves recoverable records and resets only the invalid session. Test the actual UI import/resume path.

## What was verified without a finding

The engine distinguishes supported practice from unaided productive recall, prevents double submissions, retains support through backup round trips, and avoids increasing review intervals through immediate repeats. The existing tests exercise those properties. Structured parsing rejects forbidden object keys, unsupported fields, malformed dates, excessive nesting, and several inconsistent session shapes. Imported coaching observations are locally regraded and imports operate on copied state before returning. No account or paid API is required by the reviewed code; that is the chosen architecture, not a missing feature.
