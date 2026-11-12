#!/usr/bin/env bash
# One narration clip per scene in demo/script.md → demo/out/audio/scene-N.wav (+ durations.json).
# Per scene, in order of preference:
#   1. your own recording: demo/voice/scene-N.{wav,mp3,m4a,ogg,flac} (always wins over generated audio)
#   2. edge-tts (pip install edge-tts; needs internet) with voice en-KE-AsiliaNeural,
#      falling back to en-US-AriaNeural if that voice is unavailable or fails
#   3. a local TTS: `say` (macOS), piper (needs PIPER_MODEL=/path/voice.onnx), espeak-ng / espeak, Windows SAPI
#   4. none: the scene is silent; captions still burn in and record.ts estimates its length from the word count
# Overrides: NARRATE_ENGINE=edge|say|piper|espeak|sapi|none, EDGE_VOICE, EDGE_FALLBACK_VOICE, EDGE_RATE (e.g. -5%).
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=demo/out/audio
TEXT=demo/out/text
VOICE=demo/voice
EDGE_VOICE="${EDGE_VOICE:-en-KE-AsiliaNeural}"
EDGE_FALLBACK_VOICE="${EDGE_FALLBACK_VOICE:-en-US-AriaNeural}"
EDGE_RATE="${EDGE_RATE:-+0%}"
FFMPEG="${FFMPEG:-$(command -v ffmpeg || node -p "require('ffmpeg-static')")}"
TSX="node_modules/.bin/tsx"

rm -rf "$OUT" && mkdir -p "$OUT"
N=$("$TSX" demo/tools.ts texts "$TEXT")

winpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }

# edge-tts as a CLI, or as a Python module when pip put the script outside PATH (common on Windows).
EDGE=()
if command -v edge-tts >/dev/null 2>&1; then EDGE=(edge-tts)
else
  for py in python3 python; do
    if command -v "$py" >/dev/null 2>&1 && "$py" -c "import edge_tts" >/dev/null 2>&1; then EDGE=("$py" -m edge_tts); break; fi
  done
fi

local_engine() {
  if command -v say >/dev/null 2>&1; then echo say
  elif command -v piper >/dev/null 2>&1 && [ -n "${PIPER_MODEL:-}" ]; then echo piper
  elif command -v espeak-ng >/dev/null 2>&1 || command -v espeak >/dev/null 2>&1; then echo espeak
  elif command -v powershell.exe >/dev/null 2>&1; then echo sapi
  else echo none
  fi
}

engine="${NARRATE_ENGINE:-}"
if [ -z "$engine" ]; then
  if [ ${#EDGE[@]} -gt 0 ]; then engine=edge; else engine=$(local_engine); fi
fi

# Pick the edge voice once: Asilia if the service lists it, else Aria.
voice="$EDGE_VOICE"
if [ "$engine" = edge ]; then
  # Capture first: `… | grep -q` would close the pipe early, and pipefail would read that as "not listed".
  voices=$("${EDGE[@]}" --list-voices 2>/dev/null || true)
  if ! grep -q "^$EDGE_VOICE\b" <<< "$voices"; then
    echo "narrate: $EDGE_VOICE not available, using $EDGE_FALLBACK_VOICE" >&2
    voice="$EDGE_FALLBACK_VOICE"
  fi
fi
echo "narrate: $N scenes, engine: $engine$([ "$engine" = edge ] && echo " ($voice)")"

# speak <engine> <text file> <output base path without extension>; prints the file written, or fails.
speak() {
  local eng="$1" txt="$2" raw="$3"
  case "$eng" in
    edge)
      "${EDGE[@]}" --voice "$voice" --rate="$EDGE_RATE" --file "$txt" --write-media "$raw.mp3" >/dev/null 2>&1 \
        || { [ "$voice" != "$EDGE_FALLBACK_VOICE" ] && "${EDGE[@]}" --voice "$EDGE_FALLBACK_VOICE" --rate="$EDGE_RATE" --file "$txt" --write-media "$raw.mp3" >/dev/null 2>&1; } \
        || return 1
      echo "$raw.mp3" ;;
    say)
      say -o "$raw.aiff" -f "$txt" && echo "$raw.aiff" ;;
    piper)
      piper --model "$PIPER_MODEL" --output_file "$raw.wav" < "$txt" >/dev/null && echo "$raw.wav" ;;
    espeak)
      "$(command -v espeak-ng || command -v espeak)" -s 160 -w "$raw.wav" -f "$txt" && echo "$raw.wav" ;;
    sapi)
      # SAPI_VOICE picks an installed voice (e.g. "Microsoft Zira Desktop"); SAPI_RATE is -10..10.
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
        \$s.Dispose()" && echo "$raw.wav" ;;
    none)
      return 1 ;;
    *)
      echo "narrate: unknown NARRATE_ENGINE=$eng" >&2; exit 2 ;;
  esac
}

own=0; generated=0; silent=0
for i in $(seq 1 "$N"); do
  txt="$TEXT/scene-$i.txt"
  raw="$OUT/raw-$i"
  src=""
  for ext in wav mp3 m4a ogg flac; do
    if [ -f "$VOICE/scene-$i.$ext" ]; then src="$VOICE/scene-$i.$ext"; break; fi
  done
  if [ -n "$src" ]; then
    own=$((own + 1))
  elif src=$(speak "$engine" "$txt" "$raw"); then
    generated=$((generated + 1))
  elif [ "$engine" = edge ] && fallback=$(local_engine) && [ "$fallback" != none ] && src=$(speak "$fallback" "$txt" "$raw"); then
    echo "narrate: edge-tts failed for scene $i (offline?), used $fallback" >&2
    generated=$((generated + 1))
  else
    [ "$engine" != none ] && echo "narrate: could not generate scene $i, it will be silent" >&2
    silent=$((silent + 1))
    continue
  fi
  # Normalise every clip (mono, 48 kHz, 16-bit PCM, loudness-levelled) so build.sh and durations.json can rely on it.
  "$FFMPEG" -hide_banner -loglevel error -y -i "$src" -af "loudnorm=I=-16:TP=-1.5:LRA=11" -ar 48000 -ac 1 -c:a pcm_s16le "$OUT/scene-$i.wav"
  rm -f "$raw".*
done

echo "narrate: $own from demo/voice, $generated generated, $silent silent"
if [ $((own + generated)) -eq 0 ]; then
  echo '{}' > "$OUT/durations.json"
  echo "narrate: no audio at all; the video will have captions only."
else
  echo "narrate: $("$TSX" demo/tools.ts durations "$OUT")"
fi
