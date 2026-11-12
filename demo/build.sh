#!/usr/bin/env bash
# Assembles demo/out/earmark-demo.mp4 from what record.ts and narrate.sh produced:
#   3 s title card → the recording (narration clip placed at each scene's timestamp, captions burned in) → 4 s end card.
# H.264 (-preset veryfast) + AAC. Uses ffmpeg on PATH, else the ffmpeg-static binary from node_modules.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=demo/out
FFMPEG="${FFMPEG:-$(command -v ffmpeg || node -p "require('ffmpeg-static')")}"
TSX="node_modules/.bin/tsx"

for f in "$OUT/timings.json" "$OUT/title.png" "$OUT/end.png"; do
  [ -f "$f" ] || { echo "build: $f is missing. Run demo/record.ts first (npm run demo does)." >&2; exit 1; }
done

TOTAL=$("$TSX" demo/tools.ts plan)   # writes captions.srt, filter.txt, inputs.txt
mapfile -t INPUTS < <(tr -d '\r' < "$OUT/inputs.txt")

echo "build: ${TOTAL}s → $OUT/earmark-demo.mp4"
"$FFMPEG" -hide_banner -loglevel warning -stats -y \
  "${INPUTS[@]}" \
  -filter_complex_script "$OUT/filter.txt" \
  -map "[v]" -map "[a]" \
  -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 160k -ar 48000 \
  -t "$TOTAL" -movflags +faststart \
  "$OUT/earmark-demo.mp4"

echo "build: done, $(du -h "$OUT/earmark-demo.mp4" | cut -f1)"
