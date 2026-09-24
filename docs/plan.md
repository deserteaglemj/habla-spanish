# Habla implementation plan

Goal: ship a complete public Spanish-learning app with a verified GitHub repository and Vercel URL.
Architecture: React/Vite/TypeScript; pure engine; curated curriculum; local progress and export; browser audio.
Spec: design.md. User explicitly authorizes autonomous implementation and publication, overriding review pauses.

## Work and ownership
1. [Codex, root] Create isolated repository, config, shared contracts and design system. Tools: git, npm, apply_patch. Output: reproducible build foundation. Checkpoint before app implementation.
2. [Codex, curriculum worker] Write A1-B1 structured units, varied prompts, explanations, contextual alternatives, reading/listening passages and real-world missions. Files: src/data/curriculum.ts and tests/curriculum.test.ts. Output: navigable course with integrity checks.
3. [Codex, engine worker] Write tests first, then pure grading, selection, scheduling, persistence, session resume/stop, validated backup and coaching handoff. Files: src/lib/engine.ts, src/lib/storage.ts, tests/engine.test.ts. Commands: npm test. Output: reliable learning loop.
4. [Codex, root] Build dashboard, course, practice, phrasebook, progress, preferences, accessible responsive layout, audio and dictation. Files: src/App.tsx, src/components, src/styles.css, src/lib/audio.ts. Commands: npm run build and Playwright. Output: complete interactive app.
5. [Codex, research/review worker] Research learning and language learning; independent plan and release review. Files: docs/research.md and docs/review.md. Output: sourced methodology and addressed material findings.
6. [Codex, root] Verify production build, browser flows, mobile/a11y, privacy scan, GitHub creation/push, Vercel deployment and anonymous access. Output: public working site and source, docs/release.md receipt with rollback instructions.

## Failure modes and checks
- Lost progress on blocked/full storage: catch storage errors, visibly report persistence failures, validate backup before replacement; test corrupt JSON and failed storage.
- False mastery after support/reload: persist support state, retry evidence distinct, separate delayed recall/context from course completion; test hints, reload, repeated answer, transfer.
- Unsupported audio or accidental mic interruption: graceful text fallback, explicit finish-speaking, no automatic grading while thinking; browser test unsupported capability path.
- Malicious import: bounded size and strict shape, no script/HTML execution, numeric clamps; test invalid schema and prototype keys.
- Public personal data: fresh blank learner state, no personal brief in repository, deterministic public curriculum, scan tracked files and commit metadata before push.

Independent plan review: 88/100. Mitigations integrated before implementation. Self-check: all owners, commands and outputs defined; learning research and design/deployment workflows loaded; authorized parallel ownership and release checks assigned.
