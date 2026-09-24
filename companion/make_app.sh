#!/bin/bash
# Build a local Habla companion without deleting previous builds.
set -euo pipefail
cd "$(dirname "$0")"
HABLA_NATIVE_ROOT="$PWD"
HABLA_WEB_DIST="${1:?Usage: ./make_app.sh /absolute/path/to/habla/dist}"
if [[ ! -f "$HABLA_WEB_DIST/index.html" ]]; then
  echo "Build the Habla website first, then pass its dist directory." >&2
  exit 1
fi
swift build -c release --product CallTranslatorApp
HABLA_BIN="$(swift build -c release --product CallTranslatorApp --show-bin-path)/CallTranslatorApp"
HABLA_APP="$HABLA_NATIVE_ROOT/build/Habla.app"
if [[ -e "$HABLA_APP" ]]; then
  mv "$HABLA_APP" "$HABLA_NATIVE_ROOT/build/Habla.previous.$(date +%Y%m%d-%H%M%S).app"
fi
mkdir -p "$HABLA_APP/Contents/MacOS" "$HABLA_APP/Contents/Resources/HablaWeb"
cp "$HABLA_BIN" "$HABLA_APP/Contents/MacOS/Habla"
cp -R "$HABLA_WEB_DIST/." "$HABLA_APP/Contents/Resources/HablaWeb/"
python3 - "$HABLA_APP" <<'PLIST'
import plistlib, sys
from pathlib import Path
root = Path(sys.argv[1])
values = {
    'CFBundleIdentifier': 'org.habla.spanish',
    'CFBundleExecutable': 'Habla',
    'CFBundleName': 'Habla',
    'CFBundleDisplayName': 'Habla',
    'CFBundlePackageType': 'APPL',
    'CFBundleShortVersionString': '1.1.0',
    'CFBundleVersion': '2',
    'LSMinimumSystemVersion': '26.0',
    'NSHighResolutionCapable': True,
    'NSMicrophoneUsageDescription': 'Habla uses your microphone when you start a spoken conversation or call translation.',
    'NSSpeechRecognitionUsageDescription': 'Habla transcribes your Spanish practice and translated calls on this Mac.',
    'NSAudioCaptureUsageDescription': 'Habla captures only the calling app you select to translate the other speaker.',
    'CFBundleURLTypes': [{'CFBundleURLName': 'Habla', 'CFBundleURLSchemes': ['habla']}],
}
with (root / 'Contents/Info.plist').open('wb') as handle:
    plistlib.dump(values, handle)
PLIST
codesign --force --sign - "$HABLA_APP"
echo "Built $HABLA_APP"
