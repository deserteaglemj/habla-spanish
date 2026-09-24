# Habla Mac companion

A local companion for Habla. Includes Apple on-device Spanish conversation, offline English and Spanish translation, explicit microphone capture, per-process call capture, isolated translated audio output and local transcript saving.

## Requirements

- Apple silicon Mac with macOS 26 or later and a current Xcode command-line toolchain.
- Apple Intelligence enabled with Spanish support available.
- On-device English and Spanish speech recognition.
- Installed Apple Translation English and Spanish language packs, prepared through the visible app interface if needed.
- For live calls only, an existing BlackHole virtual audio device and a calling app that supports choosing its microphone and speaker.

No API key or paid cloud endpoint is used. On-device models still consume local memory and compute. Initial Apple language assets may need a download. This project never installs drivers or changes system audio defaults.

## Build

From the web repository root:

```sh
npm ci
npm run build
cd companion
swift test
./make_app.sh ../dist
```

The script creates `build/Habla.app` and preserves a previous build with a timestamped name. Signing is ad hoc for local development. The app is not notarized or signed with a public distribution identity.

## Use

Open the generated Habla app. Select AI conversation to type a first message, or allow speech permissions before choosing Speak your message. Finish your turn, edit the transcript and send. Interrupt replies whenever needed. The transcript has no fixed turn quota; prompts use bounded recent context and an editable rolling summary.

For calls, follow the live-call setup page. Use a physical microphone for your English, BlackHole as the calling app microphone, and physical speakers or headphones for its output. Habla captures the selected app separately. Route changes stop translation rather than returning the other person's voice into the call. Start only after all participants know translation and a local transcript are enabled.

End call saves JSON and Markdown under `Documents/CallTranscripts`. Those files never enter the web course backup. If saving fails, keep the app open and retry. AI transcript exports receive unique filenames in the app-owned Application Support/Habla/Exports folder and are revealed in Finder.

## Tests

`swift test` covers context bounds, cancellation, routing, playback lifecycle, permission policy, origin/path restrictions and transcript saving. Tests do not start a microphone or place a call.

Optional local integration checks:

```sh
HABLA_LOCAL_MODEL_PROBE=1 swift test --filter realLocalServicesProduceSpanishWithoutDownloads
HABLA_WEB_ROOT="$(cd ../dist && pwd)" swift test --filter nativeBundledWebRendersStoresProgressAndReachesBridge
```

The first opt-in test uses installed models, no download or cloud fallback. The second loads the actual bundled web build in WebKit and checks browser storage plus the native bridge. Physical microphone and consenting call acceptance remain separate from these automated checks.

## Native boundary

Only the bundled `habla-app://bundle` main frame can call the allowlisted Promise bridge. Remote pages never receive native access. Resource paths are confined to the bundled web root. Transcripts and model output are rendered as text. No local network server or secret is exposed to the public website.

Source is included under the repository MIT license. Private development handoffs and prior repository history are not part of this source package.
