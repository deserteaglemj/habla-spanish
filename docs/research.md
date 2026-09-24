# Learning design and evidence

HABLA combines guided Spanish study, active recall, listening, production, review, and a record of practice. The aim is useful, durable learning. Research supports these ingredients; it does not establish a record-speed route to fluency or validate this app as a complete replacement for real conversation.

Research checked on 23 September 2026. Sources were retrieved from scholarly publishers, an author university archive, and PubMed. These are selected foundational studies and research syntheses, not an exhaustive systematic review of every language-learning intervention. No learner's private history is included.

## General human learning

| Finding and evidence | Design implication | Limit |
| --- | --- | --- |
| In two experiments using prose passages, retrieval practice improved delayed retention relative to additional studying, even when studying felt more effective. [Roediger and Karpicke, 2006](https://pubmed.ncbi.nlm.nih.gov/16507066/) | Ask learners to retrieve an answer before revealing it. Use later reviews rather than treating familiarity or confidence as proof of learning. | This was not a Spanish-app trial. A correct answer immediately after seeing the model is weak evidence of lasting recall. |
| A synthesis of 317 experiments found robust benefits of distributed practice in verbal recall. Effective spacing depended partly on how long information needed to be retained. [Cepeda et al., 2006](https://pubmed.ncbi.nlm.nih.gov/16719566/) | Revisit material across days. Keep review dates and make previously missed material easier to revisit. | There is no single universally best interval. A practical app schedule is a design choice, not a measured personal forgetting curve. |
| A broad review describes sleep's contribution to memory consolidation. [Rasch and Born, 2013](https://pubmed.ncbi.nlm.nih.gov/23589831/) | Support sustainable sessions, save progress when stopping, and let learners return later without penalty. | No claim that one bedtime lesson, a particular session length, or a fixed number of hours guarantees learning. |

## Second-language learning

| Finding and evidence | Design implication | Limit |
| --- | --- | --- |
| Across 48 experiments involving 3,411 learners, spaced L2 practice benefited learning. Longer spacing did better than shorter spacing on delayed tests; equal and expanding schedules were statistically equivalent in the synthesis. [Kim and Webb, 2022](https://onlinelibrary.wiley.com/doi/abs/10.1111/lang.12479) | Use delayed review of vocabulary and sentence patterns, with shorter revisits after difficulty and longer intervals after successful recall. | Do not claim that HABLA's intervals are uniquely optimal or that extra same-day repetitions are equivalent to delayed success. |
| A meta-analysis of 15 classroom studies involving 827 learners found durable benefits from oral corrective feedback. Prompts showed larger effects than recasts in this evidence set. [Lyster and Saito, 2010](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/oral-feedback-in-classroom-sla/4999EE1C8379B2BF026B148EAF373CA1) | Give a specific explanation, show a model when needed, and invite another attempt. Later retrieval should revisit the same underlying skill. | Classroom oral feedback does not establish that automatic text matching diagnoses pronunciation, meaning, or every valid answer. |
| A research review finds that interaction can promote L2 development through input, negotiation of meaning, and output. Its effects vary with learners, tasks, and contexts. [Loewen and Sato, 2018](https://www.cambridge.org/core/journals/language-teaching/article/interaction-and-instructed-second-language-acquisition/78A156EE200F744F5978F99BFB073DBE) | Include meaningful production, roleplay, clarification phrases, and missions learners can try outside the app. Vary the people, place, time, and purpose of a familiar sentence pattern. | Scripted roleplay rehearses interaction. It is not unrestricted conversation or evidence that a learner can handle every real interlocutor. Context variation is a transfer-oriented design decision, not a quantified app effect. |
| Nation's four-strands framework balances meaning-focused input, output, deliberate language study, and fluency development with familiar language. Comprehensible, interesting input should contain mostly known language. [Nation, 2007](https://www.wgtn.ac.nz/lals/resources/paul-nations-resources/paul-nations-publications/publications/documents/2007-Four-strands.pdf) | Pair short explanations and recall with stories, listening, speaking/writing tasks, and repeatable practice using familiar material. Offer transcript and translation support. | The framework is a curriculum rationale, not a clinical or experimental validation of an exact percentage split in this app. |
| A synthesis of 24 primary studies found vocabulary gains from meaning-focused input, but learners acquired only a portion of the target words. Outcomes varied by material, learner, activity, and test. [Webb, Uchihara, and Yanagisawa, 2023](https://www.cambridge.org/core/journals/language-teaching/article/how-effective-is-second-language-incidental-vocabulary-learning-a-metaanalysis/E38E3468FD2090B1FA3051051DE8E70C) | Give repeated meaningful exposure through reading and listening, then practice useful words deliberately. Let learners revisit a passage and retrieve its meaning. | One exposure is insufficient for dependable mastery. Reading or listening alone does not guarantee fluent productive use. |

## Product decisions derived from this evidence

These are implementation choices inspired by the evidence, not research findings about HABLA itself.

1. Start with clear communication goals and a short model. Ask for an attempt before feedback. Keep explanations brief and specific.
2. Schedule review by actual performance and time, with a way to revisit difficult items. Distinguish due review from optional extra practice.
3. Combine receptive and productive skills. Later lessons should include connected reading/listening and multi-turn rehearsal, not only isolated translation cards.
4. Make the next action clear, while allowing learners to choose a topic, repeat a lesson, stop, or resume. Daily goals are adjustable aids, not biological prescriptions.
5. Track observable activity: attempts, practice time, completed lessons, reviews, and demonstrated recall. Do not label course completion as certified proficiency.
6. Use browser speech output for model audio and optional browser dictation for text entry. Let the learner edit the transcript before checking. Speech recognition is not pronunciation assessment.
7. Keep the course available for repeated training. A finite authored curriculum can support ongoing review and application, but must not be described as infinite new content.
8. Encourage meaningful use outside the app. No study here establishes that one app can provide all the exposure, interaction, expertise, or feedback every learner needs.
9. Offer a fluency pass over phrases already recalled independently or used in a changed context. Record the attempt, show a suggested pace, and leave the spaced-review date unchanged. The pace does not auto-submit, grade speed, or assess pronunciation.

## Mission-oriented language practice

Mission practice added on 24 September 2026 follows the public CIA Intelligence Language Institute's emphasis on purposeful language use, cultural context, multiple language skills and tailored instruction. Historical CIA material describes immersion after foundations and experimental use of **FSI-developed** Programmatic Spanish. These are descriptive sources, not evidence that Habla reproduces CIA training or accelerates fluency. The implemented brief, prepare, rehearse, adapt and debrief flow records requested support and separates a voluntary real-world check-in from graded evidence. See [the source review and implementation limits](mission-method.md) for the three primary CIA sources, exact attribution and feature details.

## Architecture review before implementation (original release)

Reviewed approach: a public React, TypeScript, and Vite app on Vercel; no required account; authored Spanish curriculum; browser-local progress; validated JSON import/export; optional browser audio and dictation; a copy/paste learning handoff protocol.

Review score: **88/100**, conditional on the mitigations below. This score evaluates the proposed plan. It is not a completion claim, test result, security certification, or measurement of learning effectiveness.

| Priority failure mode | Required mitigation | Evidence to collect before release |
| --- | --- | --- |
| Progress can disappear when site data is cleared, a browser changes, or storage fails. | Visible local-only storage notice; explicit backup export/import; validation before replacement; preserve current data on failed import; useful storage-error messaging. | Reload/resume test, round-trip backup test, invalid-import preservation test, and blocked-storage behavior. |
| Repeating familiar prompts can produce inflated mastery and brittle transfer. | Separate lesson completion from proficiency; due-date review; explain answer-matching limits; vary transfer prompts; include open production and longer comprehension tasks. | Inspect the curriculum and review scheduler; test overdue, missed, and repeat practice; exercise later-level lessons. |
| Speech features differ by browser, voice availability, permission state, and recognition service. | Typed path always works; no autoplay dependency; transcript and replay support; explicit microphone stop; editable dictation; clear privacy disclosure that the browser provider may process audio; no pronunciation score. | Test unsupported speech, unavailable Spanish voice, permission failure, cancel/stop, navigation cleanup, and the typed completion path. |

Other release checks: responsive keyboard-accessible UI, source repository with no private information, production URL accessible without a Vercel login, and verification that refreshes and imported progress do not corrupt lesson state. A1/B1 labels should describe curriculum orientation rather than an awarded certification.
