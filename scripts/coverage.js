// ─────────────────────────────────────────────────────────────────────────────
//  COVERAGE RUN  —  the slow cousin of smoke.js.
//  Plays EVERY campaign wave (1-15) and a spread of endless waves, asserting
//  each one resolves with a cleared field. smoke.js samples one wave per level
//  and is meant to gate a commit; this walks the whole campaign and is meant to
//  be run occasionally (~5 min).
//
//  Same three rules as smoke.js: discard the cold-start battle, assert on
//  `killed` rather than `verdict`, and require remaining === 0.
// ─────────────────────────────────────────────────────────────────────────────
const SPEED = 4;
const out = { generated: new Date().toISOString(), waves: [], fail: [], errors: [] };
const _errs = [];
addEventListener('error', e => _errs.push(String(e.message)));

// A defence that scales with the wave, so late waves aren't testing "can 8 units
// beat wave 15" (a balance question) but "does wave 15 RESOLVE" (a correctness one).
const defence = (n) => {
  const d = [['wall', 36, 26], ['wall', 36, 28]];
  for (let i = 0; i < n; i++) {
    d.push(['tower',  38, 24 + (i % 5)]);
    d.push(['archer', 40, 24 + (i % 5)]);
    if (i % 2) d.push(['knight', 42, 24 + (i % 5)]);
  }
  return d;
};

TEST.enter();
console.log('[COV] warm-up (discarded)…');
await TEST.battle({ label: 'warm', defenders: [['tower', 38, 26]], enemies: [['grunt', 4]], speed: SPEED, timeout: 20 });

const CAMPAIGN = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];
const ENDLESS  = [16, 20, 25, 30];

for (const w of [...CAMPAIGN, ...ENDLESS]) {
  const scale = Math.min(6, 1 + Math.floor(w / 3));
  const r = await TEST.wave(w, { defenders: defence(scale), speed: SPEED, timeout: 45, label: `w${w}` });
  const row = { wave: w, verdict: r.verdict, killed: r.killed, escaped: r.escaped,
                remaining: r.remaining, spawned: (r.killed + r.escaped + r.remaining), dur: r.duration };
  out.waves.push(row);
  if (r.remaining !== 0) out.fail.push({ wave: w, why: `field not cleared (${r.remaining} left)`, ...row });
  else if (r.killed === 0) out.fail.push({ wave: w, why: 'zero kills — defence never engaged', ...row });
  console.log(`  wave ${String(w).padStart(3)}  ${r.verdict.padEnd(8)} killed=${r.killed} escaped=${r.escaped} remaining=${r.remaining}`);
}

out.errors = [...new Set(_errs)];
out.summary = { waves: out.waves.length, failed: out.fail.length, errors: out.errors.length };
console.log(`\n[COV] ${out.summary.waves} waves, ${out.summary.failed} failed, ${out.summary.errors} error(s)`);
if (out.fail.length) console.table(out.fail);
fetch('/test-result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out) }).catch(() => {});
return out;
