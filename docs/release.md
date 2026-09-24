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

## Fluency practice, 24 September 2026

- Public app: https://habla-spanish-nu.vercel.app
- Application commit: `8a9d06eb36991bf5176c580e7c936f9f94be0749`
- Pull request: https://github.com/deserteaglemj/habla-spanish/pull/1
- Production deployment: `dpl_J34gzrt5ogPBKj69KJ2HH83WLSwD`, status Ready, target production.
- Immutable deployment: https://habla-spanish-c03rnvz9o-quis1.vercel.app
- Anonymous request to the production alias returned HTTP 200. Its HTML, JavaScript and CSS were byte-identical to the local production build, including the fluency copy.
- Local checks before publication: 88 unit tests, production build, and 33 browser tests.
- The same 33 browser tests passed again against the public production alias, including the fluency flow, storage protection, missions, calls UI, coach recovery, mobile layout and accessibility.
- GitHub Actions passed install, unit tests, production build and browser tests: https://github.com/deserteaglemj/habla-spanish/actions/runs/36061140926
- Fluency practice records activity and does not move spaced-review dates or independent-recall counts. The suggested pace does not auto-submit or score pronunciation.
- The Mac companion source was not changed. A rebuilt local app package is required before this web change is inside Habla.app. No consenting live call was placed.

## Rollback
Use Vercel deployment rollback to select a previously verified production deployment. Keep the local progress schema backward compatible. Git changes are checkpointed; revert a specific source commit for a source rollback. No source deletion or machine folder moves are part of this release. Learners can download progress backups before restoring or changing browsers.
