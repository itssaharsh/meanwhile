#!/usr/bin/env bash
# demokit/setup.sh — idempotent; ~1 min first time (Kokoro model 330 MB from GitHub releases)
set -e
python3 -c "import kokoro_onnx, cv2, soundfile, scipy" 2>/dev/null || \
  pip install -q --break-system-packages kokoro-onnx soundfile opencv-python-headless scipy
python3 -c "import faster_whisper" 2>/dev/null || pip install -q --break-system-packages faster-whisper || echo "faster-whisper unavailable: run qa.py without --asr"
python3 -c "import playwright" 2>/dev/null || pip install -q --break-system-packages playwright
python3 -c "from playwright.sync_api import sync_playwright as s; p=s().start(); p.chromium.launch().close(); p.stop()" 2>/dev/null \
  || python3 -m playwright install chromium || echo "Chromium for Playwright missing"
which ffmpeg >/dev/null || { echo "ffmpeg missing: apt-get install -y ffmpeg"; exit 1; }
M=~/.cache/demokit/kokoro; mkdir -p $M
R=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1   # v1.1 export has phoneme durations (word timings)
[ -s $M/kokoro-v1.0.onnx ] || curl -fsSL -o $M/kokoro-v1.0.onnx $R/kokoro-v1.0.onnx
[ -s $M/voices-v1.0.bin ] || curl -fsSL -o $M/voices-v1.0.bin $R/voices-v1.0.bin
# CC0 background music (public domain, no attribution needed). calm | chill | upbeat
MU=~/.cache/demokit/music; mkdir -p $MU
B=https://raw.githubusercontent.com/SoundSafari/CC0-1.0-Music/main
[ -s $MU/calm.mp3 ]   || curl -fsSL -o $MU/calm.mp3   "$B/freepd.com/Adding%20the%20Sun.mp3" || true
[ -s $MU/chill.mp3 ]  || curl -fsSL -o $MU/chill.mp3  "$B/freemusicarchive.org/Komiku%20-%20Road%201%20Chill.mp3" || true
[ -s $MU/upbeat.mp3 ] || curl -fsSL -o $MU/upbeat.mp3 "$B/freepd.com/Be%20Chillin.mp3" || true
ls -la $M $MU | grep -E "onnx|bin|mp3"
echo "demokit ready"
