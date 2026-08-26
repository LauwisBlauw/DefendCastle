// ─────────────────────────────────────────────────────────────────────────────
//  SMOKE TEST  —  run via: bash scripts/run-smoke.sh   (needs `npm run dev`)
//
//  This is a CORRECTNESS harness, not a balance one. diagnostic.js answers "is
//  this unit too strong?"; this answers "does this thing run AT ALL?".
//
//  It exists because a string of features in this project were fully built and
//  silently never executed — hills that never generated, a wall upgrade blocked
//  in three places, a merchant unreachable by wave arithmetic, a milestone
//  reward cancelled by a clamp. Every one of them would have failed an assert
//  here on the day it was written.
//
//  THREE RULES LEARNED THE HARD WAY, encoded below:
//   1. Discard the first battle after a page load — it never engages. A real
//      run that looks like a total loss is otherwise indistinguishable from it.
//   2. Assert on `killed`, never on `verdict` alone. A stalled battle used to
//      score WIN simply because nothing had escaped yet.
//   3. Require remaining === 0. "Nobody escaped" is not "the field is clear".
// ─────────────────────────────────────────────────────────────────────────────

const SPEED = 4;
const T     = 20;
const results = { generated: new Date().toISOString(), pass: [], fail: [], errors: [] };

// Catch anything the game throws while we drive it.
const _errs = [];
addEventListener('error', e => _errs.push(String(e.message)));
const _ce = console.error;
console.error = (...a) => { _errs.push('console.error: ' + a.join(' ')); _ce(...a); };

const ok   = (name, detail) => { results.pass.push({ name, ...detail }); console.log(`  PASS  ${name}`, detail); };
const bad  = (name, why, detail) => { results.fail.push({ name, why, ...detail }); console.warn(`  FAIL  ${name} — ${why}`, detail); };

// One assertion used everywhere: the thing under test actually did something.
function assertBattle(name, r, { minKills = 1 } = {}) {
  if (!r)                     return bad(name, 'no result returned', {});
  const d = { verdict: r.verdict, killed: r.killed, escaped: r.escaped, remaining: r.remaining, hpPct: r.hpPct };
  if (r.killed < minKills)    return bad(name, `killed ${r.killed} < ${minKills} — defender never engaged`, d);
  if (r.remaining !== 0)      return bad(name, `field not cleared (${r.remaining} left) — battle stalled`, d);
  ok(name, d);
}

TEST.enter();

// ── Rule 1: burn the cold-start battle ───────────────────────────────────────
console.log('[SMOKE] warm-up (discarded)…');
await TEST.battle({ label: 'warmup', defenders: [['tower', 38, 26]], enemies: [['grunt', 4]], speed: SPEED, timeout: T });

// ── 1. Every defender type must be able to kill something ────────────────────
// This is the check that catches a dead unit. The Lv2 wall shipped unable to
// fire at all and nothing noticed, because no test ever asked it to.
console.log('[SMOKE] 1/2 — each defender type scores a kill…');
const SOLO = [
  ['tower',     [['tower', 38, 26], ['tower', 38, 28]]],
  ['archer',    [['archer', 40, 26], ['archer', 40, 28]]],
  ['catapult',  [['catapult', 38, 26], ['catapult', 38, 28]]],
  ['ballista',  [['ballista', 38, 26], ['ballista', 38, 28]]],
  ['mage',      [['mage', 40, 26], ['mage', 40, 28], ['mage', 42, 26]]],
  ['knight',    [['knight', 42, 26], ['knight', 42, 28]]],
  ['swordsman', [['swordsman', 42, 26], ['swordsman', 42, 28], ['swordsman', 44, 26]]],
  ['spearman',  [['spearman', 42, 26], ['spearman', 42, 28]]],
  // Spiketrap needs a real minefield, not a token three. It is 18g of area denial
  // with dmg 1 and range 0.75 — an enemy at speed 3.4 is inside one for well under a
  // second, so a handful of them cannot finish an 18 HP grunt no matter how long you
  // wait. Measured: 3 traps → 0 kills, 6 → 0 kills, 12 → 6 kills. Twelve is the
  // honest "used as designed" case; asserting on three would just be a false alarm.
  ['spiketrap', Array.from({ length: 12 }, (_, i) => ['spiketrap', 22 + i, 27])],
];
for (const [type, defs] of SOLO) {
  const r = await TEST.battle({ label: `solo:${type}`, defenders: defs,
    enemies: [['grunt', 6]], speed: SPEED, timeout: T });
  assertBattle(`defender "${type}" can kill`, r);
}

// ── 2. One wave from each campaign level must resolve ────────────────────────
// Levels map onto global wave numbers: L1=1-3, L2=4-6, L3=7-9, L4=10-12, L5=13-15.
console.log('[SMOKE] 2/2 — one wave per campaign level…');
const STD = [
  ['wall', 36, 26], ['wall', 36, 28],
  ['tower', 38, 26], ['tower', 38, 28],
  ['archer', 40, 26], ['archer', 40, 28],
  ['knight', 42, 26], ['mage', 40, 27],
];
for (const [lvl, waveNum] of [[1, 1], [2, 4], [3, 7], [4, 10], [5, 13]]) {
  const r = await TEST.wave(waveNum, { defenders: STD, speed: SPEED, timeout: 30, label: `L${lvl}w${waveNum}` });
  assertBattle(`level ${lvl} (wave ${waveNum}) resolves`, r);
}

// ── 3. Nothing threw while we did all that ───────────────────────────────────
results.errors = [...new Set(_errs)];
if (results.errors.length) bad('no runtime errors', `${results.errors.length} distinct error(s)`, { errors: results.errors.slice(0, 5) });
else ok('no runtime errors', {});

results.summary = { passed: results.pass.length, failed: results.fail.length, errors: results.errors.length };
console.log(`\n[SMOKE] ${results.summary.passed} passed, ${results.summary.failed} failed, ${results.summary.errors} error(s)`);
if (results.fail.length) console.table(results.fail);

fetch('/test-result', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(results) }).catch(() => {});
return results;
