# Habla design

A public Spanish practice workspace for English-speaking adults, with no personal seed data, sign-in, paid APIs, or external progress collection. Public source code and a public Vercel production site are authorized.

## Experience
The default screen is a useful daily practice dashboard with a clear start action. A full sequential course spans A1 foundations, A2 independence, and B1 conversation. All units are accessible, with a recommended order and transparent course completion. Practice mixes retrieval, comprehension, listening, supported introduction, roleplay, and transfer to a different context. Ten-minute goals are adjustable and do not stop sessions. Learners may stop at any point, save, resume, and continue without a quota. Course coverage is finite; reviews, custom phrases and repeats remain available.

## Learning
Unknown phrases show English meaning, a brief explanation and natural Spanish example before one supported attempt. Familiar material hides the answer. Support and reveal flags survive reload. Independent recall, supported repetition, contextual use, and introduction remain distinct. Review intervals begin at 1, 3, 7, 14 days and adjust after recall/failure. Incorrect answers receive a short explanation and one supported retry, then delayed revisit. Spelling/accents do not imply speaking failure. Natural alternatives are accepted. The app never infers pronunciation from text or claims formal proficiency from course progress.

## Architecture
React + TypeScript + Vite static client. Pure learning engine separate from curated curriculum and React views. Versioned localStorage state includes settings, phrase evidence, attempts, active session, and history. Validated JSON backup/restore and explicit text/JSON ChatGPT handoff are provided. Import is user initiated and validated before replacing progress, without executing HTML. No direct ChatGPT synchronization claim. Speech synthesis and optional browser dictation use available browser features; text is always supported. Dictation waits for explicit submission and possible browser transcription errors remain distinguishable.

## Design
Reading this as a focused adult learning product, with a confident, calm study-workspace language. Light ivory-neutral background, deep forest ink and forest green actions, restrained coral decoration, pale green surfaces, dark green speaking panel. Self-hosted sans display and body, compact mono metadata, 8px spacing scale, 12px panels, 8px inputs. A persistent sidebar at desktop becomes compact bottom navigation on mobile. Focal elements are a large daily practice card and ordered course rows. No stock photography is necessary for the learning task. Motion only for feedback and route transitions with reduced-motion support. Accessible contrast, 44px controls, skip link, keyboard focus, live feedback and real empty states.

## Privacy and costs
No names, private observations, imported learner history or user file paths in public artifacts. No backend or AI endpoint means zero per-lesson API fees and no API loop spend. Browser voices may depend on browser services; explain before microphone use. Hosting usage is subject to the existing Vercel plan. Approximate development resources: less than 2 GB RAM and 1 GB disk; static delivery has no application server CPU. Browser progress is device-specific, not cloud sync. Export is the recovery path.

## Release evidence
Engine tests for hidden/revealed recall, retries, intervals, resume, stop and import validity. Curriculum integrity tests. Browser journey through start, answer, hint, stop, resume, course navigation, phrasebook, backup restore and settings. Desktop/mobile, keyboard and axe checks. Production build, clean isolated Git repository, public GitHub remote, successful Vercel deployment and anonymous HTTP/browser verification.
