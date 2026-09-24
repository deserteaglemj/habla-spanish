# Release receipt

Repository: https://github.com/deserteaglemj/habla-spanish

## Authorized operations
Create a new independent public source repository and deploy the Spanish practice app to Vercel. Public source has no personal learner data. The original inaccessible project was not modified or moved.

## Verification before publication
- Production TypeScript and Vite build passed.
- 62 engine, curriculum, roleplay and progress integration tests passed.
- 14 browser flow tests passed: lesson, resume, support, backup round-trip, invalid backup, import, reading, multi-tab protection, corrupted data recovery, stop commands, guided roleplay, responsive layout and accessibility.
- Five additional browser audio lifecycle tests passed using controlled browser API mocks. They do not verify physical microphone capture or audible speaker output.
- Independent dashboard review inspected 1440, 390 and 320 pixel screenshots.
- npm audit found zero known vulnerabilities after updating the test runner.
- Public source scan found no personal identifiers, local machine paths or secret fields.

## Publication
- Public app: https://habla-spanish-nu.vercel.app
- GitHub source: https://github.com/deserteaglemj/habla-spanish
- Verified application commit: `53a690ce0839f8d711b4a1c9f3d3c4c327beaa91`.
- First verified production deployment: `dpl_Cr6y5HGbfiQBrdF1Fo4G9bebyxxH`, status Ready.
- Anonymous request returned HTTP 200, without an account, cookie or access token.
- All 19 browser checks passed against the public production URL, including 14 user-flow/layout checks and five simulated audio lifecycle checks.
- GitHub Actions passed the clean install, 62 unit tests, production build and all 19 browser tests: https://github.com/deserteaglemj/habla-spanish/actions/runs/35951022164
- Verified on 24 September 2026 UTC. Documentation-only follow-ups preserve the verified application code.
- Vercel is connected to the repository; pushes to main trigger production builds. No paid AI service, database or account setup is required to use the app.

## Rollback
Use Vercel deployment rollback to select a previously verified production deployment. Keep the local progress schema backward compatible. Git changes are checkpointed; revert a specific source commit for a source rollback. No source deletion or machine folder moves are part of this release. Learners can download progress backups before restoring or changing browsers.
