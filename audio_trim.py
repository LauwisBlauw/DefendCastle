#!/usr/bin/env python3
"""Browser-based audio trimmer: drag handles on a waveform, cut with ffmpeg.

Run it, a page opens, drop in an audio file, set the start/end by dragging the
handles (or typing times), preview the selection, then download the trimmed clip.
The actual cut is done by ffmpeg so the output keeps the source format/quality.
"""
import argparse
import http.server
import mimetypes
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import urllib.parse
import webbrowser

PORT = 8723

# output extension -> ffmpeg audio codec args
CODECS = {
    ".mp3": ["-c:a", "libmp3lame", "-q:a", "2"],
    ".wav": ["-c:a", "pcm_s16le"],
    ".m4a": ["-c:a", "aac", "-b:a", "192k"],
    ".aac": ["-c:a", "aac", "-b:a", "192k"],
    ".mp4": ["-c:a", "aac", "-b:a", "192k"],
    ".flac": ["-c:a", "flac"],
    ".ogg": ["-c:a", "libvorbis", "-q:a", "5"],
    ".oga": ["-c:a", "libvorbis", "-q:a", "5"],
    ".opus": ["-c:a", "libopus", "-b:a", "128k"],
}

PAGE = b"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Audio Trimmer</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; font: 14px/1.45 -apple-system, system-ui, sans-serif;
    background: #15171c; color: #e6e8eb;
    display: flex; flex-direction: column; align-items: center;
    min-height: 100vh; padding: 28px 16px 60px;
  }
  h1 { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
  .sub { color: #8b929c; margin: 0 0 22px; }
  .card {
    width: 100%; max-width: 920px; background: #1c1f26;
    border: 1px solid #2a2e37; border-radius: 12px; padding: 20px;
  }
  #drop {
    border: 1.5px dashed #3a3f4b; border-radius: 10px;
    padding: 34px; text-align: center; color: #9aa1ab;
    transition: border-color .15s, background .15s; cursor: pointer;
  }
  #drop.hot { border-color: #6ea8fe; background: #1f2734; color: #cdd6e2; }
  .btn {
    appearance: none; border: 1px solid #3a3f4b; background: #262b34;
    color: #e6e8eb; padding: 8px 14px; border-radius: 8px; cursor: pointer;
    font: inherit; transition: background .12s, border-color .12s;
  }
  .btn:hover { background: #2f3540; }
  .btn:disabled { opacity: .45; cursor: not-allowed; }
  .btn.primary { background: #2f6feb; border-color: #2f6feb; color: #fff; }
  .btn.primary:hover:not(:disabled) { background: #3b78f0; }
  .btn.sm { padding: 4px 8px; font-size: 12px; }
  #editor { display: none; margin-top: 6px; }
  .fname { color: #cdd6e2; margin: 0 0 14px; word-break: break-all; }
  .fname b { color: #fff; }
  .wrap { position: relative; width: 100%; height: 180px; border-radius: 8px;
          overflow: hidden; background: #11131a; }
  .wrap canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  #ui { cursor: text; }
  .row { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end;
         margin-top: 16px; }
  .field { display: flex; flex-direction: column; gap: 4px; }
  .field label { font-size: 12px; color: #8b929c; }
  .field .line { display: flex; gap: 6px; align-items: center; }
  input[type=number], select {
    background: #11131a; border: 1px solid #3a3f4b; color: #e6e8eb;
    border-radius: 7px; padding: 7px 9px; font: inherit; width: 110px;
  }
  select { width: 150px; }
  .readout { font-variant-numeric: tabular-nums; color: #cdd6e2; }
  .readout .muted { color: #8b929c; }
  .spacer { flex: 1 1 auto; }
  #status { margin-top: 14px; min-height: 18px; color: #8b929c; }
  #status.err { color: #ff8d7b; white-space: pre-wrap; }
  #status.ok { color: #74d99f; }
  a.dl { color: #74d99f; }
  kbd { background:#262b34; border:1px solid #3a3f4b; border-radius:4px;
        padding:1px 5px; font-size:12px; }
</style>
</head>
<body>
  <h1>Audio Trimmer</h1>
  <p class="sub">Drag the handles to set the clip length, then download the cut.</p>
  <div class="card">
    <div id="drop">
      <input id="file" type="file" accept="audio/*" hidden>
      <div style="font-size:15px;color:#cdd6e2;margin-bottom:6px;">Drop an audio file here</div>
      <div>or <button class="btn" id="pick" type="button">choose a file</button></div>
    </div>

    <div id="editor">
      <p class="fname">Editing <b id="name"></b></p>
      <div class="wrap">
        <canvas id="wave"></canvas>
        <canvas id="ui"></canvas>
      </div>

      <div class="row">
        <button class="btn" id="play" type="button">&#9654;&nbsp; Play</button>
        <div class="readout">
          <span id="cur">0:00.00</span>
          <span class="muted">&nbsp;playhead</span>
        </div>
        <div class="spacer"></div>
        <div class="readout">
          selection <b id="sel">0:00.00</b>
        </div>
      </div>

      <div class="row">
        <div class="field">
          <label>Start (s)</label>
          <div class="line">
            <input id="startIn" type="number" min="0" step="0.01" value="0">
            <button class="btn sm" id="startHere" type="button" title="Set start to playhead">&#9612;&#9166;</button>
          </div>
        </div>
        <div class="field">
          <label>End (s)</label>
          <div class="line">
            <input id="endIn" type="number" min="0" step="0.01" value="0">
            <button class="btn sm" id="endHere" type="button" title="Set end to playhead">&#9166;&#9612;</button>
          </div>
        </div>
        <div class="field">
          <label>Output format</label>
          <select id="fmt">
            <option value="src">Same as source</option>
            <option value=".mp3">MP3</option>
            <option value=".wav">WAV</option>
            <option value=".m4a">M4A (AAC)</option>
            <option value=".flac">FLAC</option>
          </select>
        </div>
        <div class="spacer"></div>
        <button class="btn primary" id="trim" type="button">Trim &amp; download</button>
      </div>
      <div id="status">Tip: click-drag on the waveform to select a region, single-click to move the playhead.</div>
    </div>
  </div>

<script>
const $ = id => document.getElementById(id);
const drop = $('drop'), fileIn = $('file');
const editor = $('editor'), waveC = $('wave'), uiC = $('ui');
const startIn = $('startIn'), endIn = $('endIn'), fmtSel = $('fmt');
const curEl = $('cur'), selEl = $('sel'), statusEl = $('status'), playBtn = $('play');

let file = null, audioCtx = null, buffer = null, peaks = null;
let duration = 0, start = 0, end = 0, playhead = 0;
let W = 0, H = 0, dpr = 1;
let audio = new Audio();
let playing = false, raf = 0;
const MINGAP = 0.02;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function fmtTime(t) {
  if (!isFinite(t)) t = 0;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
}

// ---- file loading ----
function openFile(f) {
  if (!f) return;
  file = f;
  $('name').textContent = f.name;
  editor.style.display = 'block';
  if (audio.src) URL.revokeObjectURL(audio.src);
  audio.src = URL.createObjectURL(f);
  audio.load();
  start = 0; end = 0; playhead = 0; buffer = null; peaks = null;
  setStatus('Decoding waveform...');
  decode(f);
}

async function decode(f) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const buf = await f.arrayBuffer();
    buffer = await audioCtx.decodeAudioData(buf);
    duration = buffer.duration;
    end = duration;
    sizeCanvas();
    setStatus('');
  } catch (e) {
    // Browser can't decode this codec for a waveform; fall back to a flat
    // timeline using the <audio> element's reported duration. Trimming still
    // works because ffmpeg does the real cut server-side.
    buffer = null; peaks = null;
    await new Promise(res => {
      if (audio.readyState >= 1 && isFinite(audio.duration)) return res();
      audio.addEventListener('loadedmetadata', res, { once: true });
    });
    duration = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    end = duration;
    sizeCanvas();
    setStatus('Waveform preview unavailable for this format, but trimming will still work.');
  }
  syncInputs();
}

// ---- canvas / drawing ----
function sizeCanvas() {
  dpr = window.devicePixelRatio || 1;
  W = waveC.clientWidth;
  H = waveC.clientHeight;
  for (const c of [waveC, uiC]) {
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
  }
  computePeaks();
  drawWave();
  drawUI();
}

function computePeaks() {
  if (!buffer || W <= 0) { peaks = null; return; }
  const chs = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) chs.push(buffer.getChannelData(c));
  const n = chs[0].length;
  const step = Math.max(1, Math.floor(n / W));
  peaks = new Float32Array(W * 2);
  for (let x = 0; x < W; x++) {
    let mn = 1, mx = -1;
    const base = x * step;
    for (let j = 0; j < step; j++) {
      const i = base + j;
      if (i >= n) break;
      let v = 0;
      for (let c = 0; c < chs.length; c++) v += chs[c][i];
      v /= chs.length;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    peaks[x * 2] = mn;
    peaks[x * 2 + 1] = mx;
  }
}

function drawWave() {
  const g = waveC.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const mid = H / 2, amp = H / 2 * 0.92;
  if (peaks) {
    g.strokeStyle = '#4b5563';
    g.beginPath();
    for (let x = 0; x < W; x++) {
      const mn = peaks[x * 2], mx = peaks[x * 2 + 1];
      g.moveTo(x + 0.5, mid - mx * amp);
      g.lineTo(x + 0.5, mid - mn * amp);
    }
    g.stroke();
  } else {
    g.strokeStyle = '#2a2e37';
    g.beginPath();
    g.moveTo(0, mid); g.lineTo(W, mid); g.stroke();
  }
}

const t2x = t => duration > 0 ? (t / duration) * W : 0;
const x2t = x => duration > 0 ? clamp((x / W) * duration, 0, duration) : 0;

function drawUI() {
  const g = uiC.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const xs = t2x(start), xe = t2x(end);
  // dim outside the selection
  g.fillStyle = 'rgba(10,12,18,0.62)';
  g.fillRect(0, 0, xs, H);
  g.fillRect(xe, 0, W - xe, H);
  // selection tint
  g.fillStyle = 'rgba(47,111,235,0.12)';
  g.fillRect(xs, 0, xe - xs, H);
  // handles
  for (const x of [xs, xe]) {
    g.fillStyle = '#6ea8fe';
    g.fillRect(x - 1, 0, 2, H);
    g.fillRect(x - 4, H / 2 - 14, 8, 28);
  }
  // playhead
  const xp = t2x(playhead);
  g.fillStyle = '#fbbf24';
  g.fillRect(xp - 0.5, 0, 1.5, H);
}

// ---- interaction ----
let mode = null, anchor = 0, moved = false;
function localX(ev) {
  const r = uiC.getBoundingClientRect();
  const cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
  return clamp(cx, 0, W);
}
uiC.addEventListener('mousedown', e => {
  if (!duration) return;
  const x = localX(e), t = x2t(x);
  if (Math.abs(x - t2x(start)) <= 7) mode = 'start';
  else if (Math.abs(x - t2x(end)) <= 7) mode = 'end';
  else { mode = 'region'; anchor = t; moved = false; }
});
window.addEventListener('mousemove', e => {
  if (!mode) {
    // hover cursor hint
    return;
  }
  const t = x2t(localX(e));
  if (mode === 'start') start = clamp(t, 0, end - MINGAP);
  else if (mode === 'end') end = clamp(t, start + MINGAP, duration);
  else {
    moved = moved || Math.abs(t - anchor) > duration * 0.002;
    if (moved) { start = clamp(Math.min(anchor, t), 0, duration); end = clamp(Math.max(anchor, t), 0, duration); }
  }
  syncInputs(); drawUI();
});
window.addEventListener('mouseup', e => {
  if (mode === 'region' && !moved) seek(anchor);
  mode = null;
});
uiC.addEventListener('mousemove', e => {
  const x = localX(e);
  uiC.style.cursor = (Math.abs(x - t2x(start)) <= 7 || Math.abs(x - t2x(end)) <= 7) ? 'ew-resize' : 'text';
});

startIn.addEventListener('input', () => { start = clamp(parseFloat(startIn.value) || 0, 0, Math.max(0, end - MINGAP)); drawUI(); syncReadouts(); });
endIn.addEventListener('input', () => { end = clamp(parseFloat(endIn.value) || 0, start + MINGAP, duration); drawUI(); syncReadouts(); });
$('startHere').addEventListener('click', () => { start = clamp(playhead, 0, end - MINGAP); syncInputs(); drawUI(); });
$('endHere').addEventListener('click', () => { end = clamp(playhead, start + MINGAP, duration); syncInputs(); drawUI(); });

function syncInputs() {
  startIn.value = start.toFixed(2);
  endIn.value = end.toFixed(2);
  startIn.max = duration.toFixed(2);
  endIn.max = duration.toFixed(2);
  syncReadouts();
}
function syncReadouts() {
  selEl.textContent = fmtTime(Math.max(0, end - start));
  curEl.textContent = fmtTime(playhead);
}

// ---- playback (preview the selection) ----
function seek(t) { playhead = clamp(t, 0, duration); audio.currentTime = playhead; syncReadouts(); drawUI(); }
playBtn.addEventListener('click', () => playing ? pause() : play());
function play() {
  if (!audio.src) return;
  if (audio.currentTime < start - 0.001 || audio.currentTime >= end - 0.001) audio.currentTime = start;
  audio.play().then(() => { playing = true; playBtn.innerHTML = '&#10073;&#10073;&nbsp; Pause'; tick(); }).catch(() => {});
}
function pause() { audio.pause(); playing = false; playBtn.innerHTML = '&#9654;&nbsp; Play'; cancelAnimationFrame(raf); }
function tick() {
  playhead = audio.currentTime;
  if (playhead >= end - 0.001) { pause(); seek(start); return; }
  syncReadouts(); drawUI();
  raf = requestAnimationFrame(tick);
}
audio.addEventListener('ended', () => { pause(); seek(start); });

// ---- trim & download ----
$('trim').addEventListener('click', async () => {
  if (!file || end - start < MINGAP) { setStatus('Select a region first.', 'err'); return; }
  const dot = file.name.lastIndexOf('.');
  const srcExt = dot >= 0 ? file.name.slice(dot) : '';
  const ext = fmtSel.value === 'src' ? (srcExt || '.wav') : fmtSel.value;
  const base = dot >= 0 ? file.name.slice(0, dot) : file.name;
  const btn = $('trim'); btn.disabled = true;
  setStatus('Trimming with ffmpeg...');
  try {
    const url = '/trim?start=' + start.toFixed(3) + '&end=' + end.toFixed(3) +
                '&ext=' + encodeURIComponent(ext) + '&name=' + encodeURIComponent(file.name);
    const res = await fetch(url, { method: 'POST', body: file });
    if (!res.ok) { setStatus('ffmpeg error:\\n' + (await res.text()), 'err'); return; }
    const blob = await res.blob();
    const a = document.createElement('a');
    const outName = base + '_trim' + ext;
    a.href = URL.createObjectURL(blob);
    a.download = outName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    setStatus('Saved ' + outName + ' (' + fmtTime(end - start) + ')', 'ok');
  } catch (e) {
    setStatus('Request failed: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
  }
});

function setStatus(msg, kind) { statusEl.textContent = msg; statusEl.className = kind || ''; }

// ---- drop zone wiring ----
$('pick').addEventListener('click', e => { e.stopPropagation(); fileIn.click(); });
drop.addEventListener('click', () => fileIn.click());
fileIn.addEventListener('change', () => openFile(fileIn.files[0]));
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('hot'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('hot'); }));
drop.addEventListener('drop', e => { if (e.dataTransfer.files[0]) openFile(e.dataTransfer.files[0]); });
window.addEventListener('resize', () => { if (duration) sizeCanvas(); });
</script>
</body>
</html>
"""


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path in ("/", "/index.html"):
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(PAGE)))
            self.end_headers()
            self.wfile.write(PAGE)
        elif path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
        else:
            self.send_error(404)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/trim":
            self.send_error(404)
            return
        q = urllib.parse.parse_qs(parsed.query)
        try:
            start = max(0.0, float(q.get("start", ["0"])[0]))
            end = float(q.get("end", ["0"])[0])
        except ValueError:
            self._fail(400, "bad start/end")
            return
        name = q.get("name", ["clip"])[0]
        out_ext = (q.get("ext", [".wav"])[0] or ".wav").lower()
        in_ext = os.path.splitext(name)[1].lower()
        dur = end - start
        if dur <= 0:
            self._fail(400, "end must be greater than start")
            return

        length = int(self.headers.get("Content-Length", 0))
        if length <= 0:
            self._fail(400, "empty upload")
            return
        data = self.rfile.read(length)

        in_fd, in_path = tempfile.mkstemp(suffix=in_ext or ".audio")
        out_fd, out_path = tempfile.mkstemp(suffix=out_ext)
        os.close(out_fd)
        try:
            with os.fdopen(in_fd, "wb") as f:
                f.write(data)
            codec = CODECS.get(out_ext, [])
            cmd = [FFMPEG, "-hide_banner", "-y",
                   "-ss", f"{start:.3f}", "-i", in_path,
                   "-t", f"{dur:.3f}"] + codec + [out_path]
            proc = subprocess.run(cmd, capture_output=True)
            if proc.returncode != 0 or not os.path.getsize(out_path):
                msg = proc.stderr.decode("utf-8", "replace")[-1500:] or "ffmpeg produced no output"
                self._fail(500, msg)
                return
            with open(out_path, "rb") as f:
                blob = f.read()
            ctype = mimetypes.guess_type("x" + out_ext)[0] or "application/octet-stream"
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(blob)))
            self.send_header("Content-Disposition", f'attachment; filename="trim{out_ext}"')
            self.end_headers()
            self.wfile.write(blob)
            print(f"  trimmed {name}  {start:.2f}s -> {end:.2f}s  ({dur:.2f}s, {out_ext}) -> {len(blob)} bytes")
        finally:
            for p in (in_path, out_path):
                try:
                    os.remove(p)
                except OSError:
                    pass

    def _fail(self, code, msg):
        body = msg.encode("utf-8", "replace")
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


def main():
    global FFMPEG
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("-p", "--port", type=int, default=PORT)
    parser.add_argument("--no-open", action="store_true", help="don't auto-open the browser")
    args = parser.parse_args()

    FFMPEG = shutil.which("ffmpeg")
    if not FFMPEG:
        sys.exit("ffmpeg not found on PATH. Install it (e.g. `brew install ffmpeg`).")

    url = f"http://127.0.0.1:{args.port}/"
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Audio trimmer running at {url}")
    print("Ctrl-C to stop.\n")
    if not args.no_open:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped.")
        httpd.shutdown()


if __name__ == "__main__":
    main()
