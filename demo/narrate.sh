#!/usr/bin/env bash
# One narration clip per scene in demo/script.md → demo/out/audio/scene-N.wav (+ durations.json).
# Voice, in order of preference:
#   1. your own recordings in demo/voice/scene-N.wav (any format ffmpeg reads, e.g. .wav/.m4a renamed is fine)
#   2. TTS: `say` (macOS), piper (needs PIPER_MODEL=/path/voice.onnx), espeak-ng / espeak (Linux),
#      Windows SAPI via PowerShell
#   3. none: no audio; captions still burn in and scene lengths are estimated from word counts
# Override the choice with NARRATE_ENGINE=voice|say|piper|espeak|sapi|none.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=demo/out/audio
TEXT=demo/out/text
VOICE=demo/voice
FFMPEG="${FFMPEG:-$(command -v ffmpeg || node -p "require('ffmpeg-static')")}"
TSX="node_modules/.bin/tsx"

rm -rf "$OUT" && mkdir -p "$OUT"
N=$("$TSX" demo/tools.ts texts "$TEXT")

engine="${NARRATE_ENGINE:-}"
if [ -z "$engine" ]; then
  if [ -f "$VOICE/scene-1.wav" ]; then engine=voice
  elif command -v say >/dev/null 2>&1; then engine=say
  elif command -v piper >/dev/null 2>&1 && [ -n "${PIPER_MODEL:-}" ]; then engine=piper
  elif command -v espeak-ng >/dev/null 2>&1 || command -v espeak >/dev/null 2>&1; then engine=espeak
  elif command -v powershell.exe >/dev/null 2>&1; then engine=sapi
  else engine=none
  fi
fi
echo "narrate: $N scenes, engine: $engine"

winpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }

for i in $(seq 1 "$N"); do
  txt="$TEXT/scene-$i.txt"
  raw="$OUT/raw-$i"
  case "$engine" in
    voice)
      if [ ! -f "$VOICE/scene-$i.wav" ]; then echo "narrate: missing $VOICE/scene-$i.wav, scene $i will be silent" >&2; continue; fi
      cp "$VOICE/scene-$i.wav" "$raw.wav" ;;
    say)
      say -o "$raw.aiff" -f "$txt" && mv "$raw.aiff" "$raw.wav" ;;
    piper)
      piper --model "$PIPER_MODEL" --output_file "$raw.wav" < "$txt" ;;
    espeak)
      "$(command -v espeak-ng || command -v espeak)" -s 160 -w "$raw.wav" -f "$txt" ;;
    sapi)
      # Prefer a natural voice if installed; SAPI_VOICE overrides (e.g. "Microsoft Zira Desktop").
      powershell.exe -NoProfile -NonInteractive -Command "
        Add-Type -AssemblyName System.Speech
        \$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
        \$want = '${SAPI_VOICE:-}'
        \$names = \$s.GetInstalledVoices() | Where-Object { \$_.Enabled } | ForEach-Object { \$_.VoiceInfo.Name }
        if (\$want -and (\$names -contains \$want)) { \$s.SelectVoice(\$want) }
        elseif (\$names -contains 'Microsoft Zira Desktop') { \$s.SelectVoice('Microsoft Zira Desktop') }
        \$s.Rate = ${SAPI_RATE:-0}
        \$s.SetOutputToWaveFile('$(winpath "$raw.wav")')
        \$s.Speak([IO.File]::ReadAllText('$(winpath "$txt")'))
        \$s.Dispose()" ;;
    none)
      continue ;;
    *)
      echo "narrate: unknown NARRATE_ENGINE=$engine" >&2; exit 2 ;;
  esac
  # Normalise every clip (mono, 48 kHz, 16-bit PCM, loudness-levelled) so build.sh and durations.json can rely on it.
  "$FFMPEG" -hide_banner -loglevel error -y -i "$raw.wav" -af "loudnorm=I=-16:TP=-1.5:LRA=11" -ar 48000 -ac 1 -c:a pcm_s16le "$OUT/scene-$i.wav"
  rm -f "$raw.wav"
done

if [ "$engine" = none ]; then
  echo '{}' > "$OUT/durations.json"
  echo "narrate: no TTS found and no demo/voice/scene-N.wav; the video will have captions only."
else
  echo "narrate: $("$TSX" demo/tools.ts durations "$OUT")"
fi
