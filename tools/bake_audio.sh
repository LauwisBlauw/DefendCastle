#!/usr/bin/env bash
# Re-bake the Godot audio from the JS sound engine.
#
# The port does not reimplement the Web Audio synth — it RUNS it, offline, and records
# the output. So the two builds can never drift: change a sound in src/main.js, re-run
# this, and the Godot build has the new sound.
#
#   ./tools/bake_audio.sh
#
# Requires: node, ffmpeg. Installs node-web-audio-api into tools/ on first run.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
WORK="$ROOT/tools/.bake"
OUT="$ROOT/godot/audio"

# 1. Slice the SND module straight out of src/main.js — no copy is kept, so this can
#    never fall out of date with the source it is baking.
mkdir -p "$WORK"
START=$(grep -n '^const SND = (() => {' src/main.js | head -1 | cut -d: -f1)
END=$(awk -v s="$START" 'NR>s && /^\}\)\(\);$/ {print NR; exit}' src/main.js)
echo "extracting SND from src/main.js lines $START..$END"
sed -n "${START},${END}p" src/main.js > "$WORK/snd_body.js"
cp tools/bake_audio.mjs "$WORK/bake.mjs"

# 2. Render every sound and every track against an OfflineAudioContext.
[ -d tools/node_modules/node-web-audio-api ] || (cd tools && npm install --silent node-web-audio-api)
cd "$WORK"
ln -sfn ../node_modules node_modules
node bake.mjs ./raw

# 3. Level, trim and encode. One gain per group so the engine's own relative balance
#    between sounds survives; per-file normalisation would flatten a footstep onto a
#    boss slam.
SFX_GAIN=3.463
MUS_GAIN=4.310
rm -rf "$OUT"; mkdir -p "$OUT/sfx" "$OUT/music"
for f in raw/sfx/*.wav; do
  b=$(basename "$f" .wav)
  ffmpeg -loglevel error -y -i "$f" \
    -af "volume=${SFX_GAIN},silenceremove=stop_periods=-1:stop_duration=0.08:stop_threshold=-58dB" \
    -c:a pcm_s16le -ar 44100 -ac 1 "$OUT/sfx/$b.wav"
done
for f in raw/music/*.wav; do
  b=$(basename "$f" .wav)
  # -ac 2 because ffmpeg's built-in Vorbis encoder refuses mono.
  ffmpeg -loglevel error -y -i "$f" -af "volume=${MUS_GAIN}" \
    -c:a vorbis -strict -2 -q:a 5 -ar 44100 -ac 2 "$OUT/music/$b.ogg"
done
echo "baked: $(ls "$OUT/sfx" | wc -l | tr -d ' ') sfx, $(ls "$OUT/music" | wc -l | tr -d ' ') tracks -> $OUT"
