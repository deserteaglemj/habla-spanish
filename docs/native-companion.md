# Habla Mac companion

## What runs where

The public website provides the course, guided conversations and mission practice. The Mac companion bundles the same interface and adds local AI, speech and call translation. Progress in the website and companion is separate; move course progress with the existing export/import backup. AI conversation has its own complete transcript export.

## Conversation

Choose AI conversation. Set a topic and level, then type or choose Speak your message. Finish speaking, review the recognized text, and send. Replies can be spoken aloud and interrupted. There is no fixed turn quota. The model receives a bounded recent context and a rolling memory you can inspect and edit. Older details may require a reminder. All messages remain in local IndexedDB unless local storage fails or is cleared. The export contains all saved exchanges, not only the fifty most recent messages displayed.

## Live calls

1. Use the readiness controls to allow microphone and speech access and prepare language packs.
2. In the calling app, select BlackHole as its microphone. Select physical speakers or headphones as its output. Do not send the calling app output into BlackHole.
3. In Habla, select a physical microphone, BlackHole output and the process actually playing call audio. Confirm that participants know translation and a local transcript are enabled.
4. Start the translator. Confirm the incoming meter moves when the other speaker talks.
5. Choose Speak my English turn, speak, then Finish my turn. Option + Space can also control a turn when supported by macOS permissions. Spanish audio plays into the calling app. English captions show translations from the other speaker.
6. End call and save. The complete transcript is written under Documents/CallTranscripts. Originals remain even when translation is unfinished. A failed save stays recoverable while the app remains open.

## Limits and verification

The local engines have been tested with real Spanish generation and English-to-Spanish translation. Automated checks exercise state, routing, storage and browser interaction. Microphone permissions, actual application audio ownership and a consenting multi-turn call remain physical acceptance checks. No call is placed automatically, no system audio defaults are changed, and no cloud fallback is used.

The app is locally signed for development, not notarized for public distribution. The repository includes source and a reproducible packaging command. Do not describe the website itself as a cloud voice agent.
