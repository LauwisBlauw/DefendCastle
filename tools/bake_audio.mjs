// Offline renderer for the DefendCastle sound engine.
//
// The JS build synthesises everything at runtime with Web Audio — 55 audio-node
// constructions, oscillators scheduled by setTimeout, and a data-driven chip-tune
// engine. Godot has no equivalent model, so the port BAKES the same engine to files:
// this script runs the ORIGINAL, UNMODIFIED SND module against an OfflineAudioContext
// and writes what it produces.
//
// Two shims make that possible:
//   * currentTime — offline contexts report 0 until they render, but every SND helper
//     schedules relative to ctx.currentTime. A Proxy reports a VIRTUAL clock instead.
//   * setTimeout  — offline rendering is instantaneous, so a real timer would never
//     fire and every delayed layer (and the whole music engine, which re-schedules
//     itself tick by tick) would be silently dropped. Callbacks are queued against the
//     virtual clock and drained in time order before rendering.
//
// Because the module itself is untouched, what comes out is what the browser plays.

import fs from 'node:fs';
import path from 'node:path';
import { OfflineAudioContext } from 'node-web-audio-api';

const SND_BODY = fs.readFileSync(new URL('./snd_body.js', import.meta.url), 'utf8');
const OUT = process.argv[2] || './out';
const SR = 44100;

// ── virtual clock + deferred-callback queue ─────────────────────────────────
let vnow = 0;
let queue = [];
const shimSetTimeout = (cb, ms = 0) => {
  const id = Symbol();
  queue.push({ t: vnow + (ms || 0) / 1000, cb, id });
  return id;
};
const shimClearTimeout = (id) => { queue = queue.filter(e => e.id !== id); };

// Source nodes are the third shim, and the one that actually matters most.
// `src.start()` with no argument means "now" — which in a LIVE context equals
// currentTime, but in an offline context is literally t=0. Left alone, every note of
// every track starts on the same sample and the render is one enormous transient
// (measured: peak 57 instead of <1). Defaulting start/stop to the virtual clock is
// what puts the notes back where the engine intended them.
function wrapSource(node) {
  return new Proxy(node, {
    get(target, prop) {
      if (prop === 'start' || prop === 'stop') {
        return (when) => target[prop](when === undefined ? vnow : when);
      }
      const v = target[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

const SOURCE_FACTORIES = new Set(['createOscillator', 'createBufferSource', 'createConstantSource']);

function wrapCtx(real) {
  return new Proxy(real, {
    get(target, prop) {
      if (prop === 'currentTime') return vnow;
      if (SOURCE_FACTORIES.has(prop)) {
        return (...args) => wrapSource(target[prop](...args));
      }
      const v = target[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

/** Run `body(SND)` against a fresh offline context and return the rendered buffer. */
async function render(seconds, body, { channels = 1, drainUntil = null } = {}) {
  const real = new OfflineAudioContext(channels, Math.ceil(SR * seconds), SR);
  const ctx = wrapCtx(real);
  vnow = 0;
  queue = [];

  // The module reaches for window.AudioContext; hand it the offline one.
  const sandbox = {
    window: { AudioContext: function () { return ctx; }, webkitAudioContext: undefined },
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    setTimeout: shimSetTimeout,
    clearTimeout: shimClearTimeout,
    setInterval: shimSetTimeout,
    clearInterval: shimClearTimeout,
    performance: { now: () => vnow * 1000 },
    localStorage: { getItem: () => null, setItem() {} },
    console,
    Math,
    Date,
  };
  const make = new Function(
    ...Object.keys(sandbox),
    `${SND_BODY}\nreturn SND;`
  );
  const SND = make(...Object.values(sandbox));

  body(SND);

  // Drain scheduled callbacks in time order, advancing the virtual clock as we go.
  const limit = drainUntil ?? seconds;
  let guard = 0;
  while (queue.length && guard++ < 400000) {
    queue.sort((a, b) => a.t - b.t);
    const next = queue.shift();
    if (next.t > limit) break;
    vnow = next.t;
    try { next.cb(); } catch { /* a tick that depends on DOM state is not fatal */ }
  }
  vnow = 0;
  return await real.startRendering();
}

// ── WAV writer (16-bit PCM) ─────────────────────────────────────────────────
function toWav(buffer) {
  const ch = buffer.numberOfChannels;
  const n = buffer.length;
  const data = Buffer.alloc(n * ch * 2);
  const chans = [];
  for (let c = 0; c < ch; c++) chans.push(buffer.getChannelData(c));
  let peak = 0;
  for (let c = 0; c < ch; c++) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(chans[c][i]));
  // Normalise only if it would clip; otherwise keep the engine's own levels, which are
  // already balanced against each other.
  const gain = peak > 1 ? 1 / peak : 1;
  let o = 0;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i] * gain));
      data.writeInt16LE((s * 32767) | 0, o);
      o += 2;
    }
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8);
  head.write('fmt ', 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(ch, 22);
  head.writeUInt32LE(SR, 24);
  head.writeUInt32LE(SR * ch * 2, 28);
  head.writeUInt16LE(ch * 2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

function peakOf(buffer) {
  let p = 0;
  const d = buffer.getChannelData(0);
  for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i]));
  return p;
}

// ── what to bake ────────────────────────────────────────────────────────────
// One-shots: name -> how to trigger it. Durations are generous; silence is trimmed.
const SFX = {
  bolt: s => s.bolt(), arrow: s => s.arrow(), catapult_fire: s => s.catapultFire(),
  ballista_shot: s => s.ballistaShot(), mage_cast: s => s.mageCast(),
  rock_hit: s => s.rockHit(), sword: s => s.sword(), wall_hit: s => s.wallHit(),
  hit: s => s.hit(), magic_hit: s => s.magicHit(),
  enemy_die: s => s.enemyDie(), big_enemy_die: s => s.bigEnemyDie(),
  defender_die: s => s.defenderDie(), enemy_hit: s => s.enemyHit(),
  castle_hit: s => s.castleHit(), critical_castle: s => s.criticalCastle(),
  enemy_arrow: s => s.enemyArrow(), enemy_rock: s => s.enemyRock(),
  explode: s => s.explode(), heal: s => s.heal(), curse_hit: s => s.curseHit(),
  build: s => s.build(), wall_place: s => s.wallPlace?.(), upgrade: s => s.upgrade(),
  sell: s => s.sell?.(), gold_gain: s => s.goldGain(),
  wave_start: s => s.waveStart(), wave_complete: s => s.waveComplete(),
  game_over: s => s.gameOver(), level_victory: s => s.levelVictory(),
  achievement: s => s.achievement(), boss_spawn: s => s.bossSpawn(),
  boss_slam: s => s.bossSlam(), berserk_roar: s => s.berserkRoar(),
  cyclops_swing: s => s.cyclopsSwing(), knight_slash: s => s.knightSlash(),
  spear_thrust: s => s.spearThrust?.(), swordsman_swing: s => s.swordsmanSwing?.(),
  skeleton_phase: s => s.skeletonPhase?.(), spike_trigger: s => s.spikeTrigger?.(),
  btn_click: s => s.btnClick(), deny_click: s => s.denyClick?.(),
  rally_set: s => s.rallySet?.(), rally_clear: s => s.rallyClear?.(),
  rally_arm: s => s.rallyArm?.(), footstep: s => s.footstep?.(),
  orc_ambient: s => s.orcAmbient?.(),
  enemy_attack_troll: s => s.enemyAttack?.('troll'),
  enemy_attack_brute: s => s.enemyAttack?.('brute'),
  enemy_attack_grunt: s => s.enemyAttack?.('grunt'),
};

const SONGS = ['blitz', 'classic', 'wide', 'bazaar', 'frost', 'ember', 'abyss', 'doom', 'vibe', 'dark', 'danger'];

fs.mkdirSync(path.join(OUT, 'sfx'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'music'), { recursive: true });

const report = { sfx: [], music: [], silent: [], failed: [] };

for (const [name, trigger] of Object.entries(SFX)) {
  try {
    const buf = await render(2.5, s => trigger(s));
    const peak = peakOf(buf);
    if (peak < 1e-4) { report.silent.push(name); continue; }
    fs.writeFileSync(path.join(OUT, 'sfx', `${name}.wav`), toWav(buf));
    report.sfx.push({ name, peak: +peak.toFixed(3) });
  } catch (e) {
    report.failed.push({ name, err: String(e).slice(0, 120) });
  }
}

// Music: 45 seconds is long enough to cover a full A/B/C form on every tempo here.
for (const song of SONGS) {
  try {
    const buf = await render(45, s => { s.setSong(song); s.startMusic(); }, { drainUntil: 45 });
    const peak = peakOf(buf);
    if (peak < 1e-4) { report.silent.push(`music/${song}`); continue; }
    fs.writeFileSync(path.join(OUT, 'music', `${song}.wav`), toWav(buf));
    report.music.push({ name: song, peak: +peak.toFixed(3) });
  } catch (e) {
    report.failed.push({ name: `music/${song}`, err: String(e).slice(0, 160) });
  }
}

console.log(JSON.stringify(report, null, 1));
