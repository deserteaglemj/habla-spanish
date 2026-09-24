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
GitHub repository created and Vercel project linked to it. Production URL and anonymous verification will be recorded after deployment finishes.

## Rollback
Use Vercel deployment rollback to select a previously verified production deployment. Keep the local progress schema backward compatible. Git changes are checkpointed; revert a specific source commit for a source rollback. No source deletion or machine folder moves are part of this release. Learners can download progress backups before restoring or changing browsers.
