// ─────────────────────────────────────────────────────────────────────────────
//  GAME BALANCE DIAGNOSTIC  —  run via: npm run diag
//  Posts a single structured JSON report to /test-result when done.
//  Estimated runtime: ~5 min at speed=4 (background tab safe).
// ─────────────────────────────────────────────────────────────────────────────

const SPEED = 4;
const T     = 16;   // per-battle timeout (seconds)
const report = { generated: new Date().toISOString(), speed: SPEED, sections: {} };

// Helper: reduce a battle result to the key fields worth reporting
const slim = r => ({
  label: r.label, verdict: r.verdict,
  killed: r.killed, escaped: r.escaped,
  hpPct: r.hpPct + '%', defKilled: r.defKilled,
  castleDmg: r.castleDmgDealt, cost: r.costTotal,
  killEff: r.killEfficiency, time: r.duration + 's',
});

// ── 0. Warm-up ────────────────────────────────────────────────────────────────
//  The very first battle after a page load can stall (arena warm-up race:
//  enemies spawn but never path; reported as TIMEOUT). Run a throwaway
//  skirmish so the real matrix starts from a warmed, known-good state.
console.log('[DIAG] Warm-up battle (discarded)…');
await TEST.battle({ label: 'warmup', defenders: [], enemies: [['grunt', 1]], speed: SPEED, timeout: 10 });

// ── 1. Individual matchup matrix ─────────────────────────────────────────────
//  Each defender type (1 unit, row 26) vs key threats.
//  Reveals which units are unviable or overtuned for specific enemies.
const defSets = [
  ['tower',     [['tower',     40, 26]]],
  ['archer',    [['archer',    40, 26]]],
  ['catapult',  [['catapult',  40, 26]]],
  ['swordsman', [['swordsman', 40, 26]]],
  ['knight',    [['knight',    40, 26]]],
  ['spearman',  [['spearman',  40, 26]]],
];
const eneSets = [
  ['grunt×8',    [['grunt',    8]]],
  ['brute×4',    [['brute',    4]]],
  ['boss×1',     [['boss',     1]]],
  ['wolf×6',     [['wolf',     6]]],
  ['troll×3',    [['troll',    3]]],
  ['skeleton×8', [['skeleton', 8]]],
];

console.log('[DIAG] Section 1/4: matchup matrix (36 battles)…');
const matrix = await TEST.sweep(defSets, eneSets, { speed: SPEED, timeout: T });
report.sections.matchup_matrix = matrix;

// ── 2. Standard mid-game setup — weakness scan ───────────────────────────────
//  Mixed defensive line (~260g) tested against every enemy type (5 enemies each).
//  Pinpoints which enemy types slip through a reasonable defence.
const STD_DEF = [
  ['wall',    36, 26], ['wall',    36, 28],
  ['tower',   38, 26], ['tower',   38, 28],
  ['archer',  40, 26], ['archer',  40, 28],
  ['knight',  42, 26],
];

console.log('[DIAG] Section 2/4: weakness scan vs all enemy types…');
const { weaknesses, results: wkRes } = await TEST.findWeakness(
  STD_DEF, null, { speed: SPEED, timeout: T, count: 5 }
);
report.sections.weakness_scan = {
  setup: 'wall×2 + tower×2 + archer×2 + knight×1  (~260g)',
  weaknesses,
  all: wkRes.map(r => ({
    type: r.label, verdict: r.verdict,
    escaped: r.escaped, castleDmg: r.castleDmgDealt,
  })),
};

// ── 3. Real wave simulation — 3-lane mode (waves 3, 6, 10, 14) ──────────────
//  Switches to 3-lane arena to match the real game's 3-road layout.
//  Defenders cover all three lanes; enemies use the full buildSpawnQueue compositions.
//  Defenders persist across waves — tests attrition and difficulty curve.
TEST.lanes(3);
// 3-lane rows are 22/27/32 (the paths themselves). Walls go ON the lanes as
// blockers; everything else must FLANK the lanes — non-wall defenders can't be
// placed on path tiles, so the old on-lane rows silently placed only the walls.
const STD_DEF_3LANE = [
  ['wall',   36, 22], ['wall',   36, 27], ['wall',   36, 32],
  ['tower',  38, 21], ['tower',  38, 26], ['tower',  38, 31],
  ['archer', 40, 23], ['archer', 40, 28], ['archer', 40, 33],
  ['knight', 42, 21], ['knight', 42, 31],
];
console.log('[DIAG] Section 3/4: 3-lane wave simulation (waves 3, 6, 10, 14)…');
const waveResults = await TEST.multiWave(STD_DEF_3LANE, [3, 6, 10, 14], { speed: SPEED, timeout: 70 });
report.sections.wave_sim = {
  setup: '3-lane: wall×3 + tower×3 + archer×3 + knight×2',
  lanes: 3,
  waves: waveResults,
};
// Return to 1-lane for the remaining sections
TEST.lanes(1);

// ── 4. Gold-efficiency at 200g starting budget ───────────────────────────────
//  How many units of each type fit in 200g, and how do they perform
//  against a representative early-game mixed threat?
console.log('[DIAG] Section 4/4: gold-efficiency at 200g…');
const goldResults = await TEST.compareSameGold(
  200,
  [['grunt', 6], ['brute', 2], ['wolf', 2]],
  { speed: SPEED, timeout: T }
);
report.sections.gold_eff_200g = goldResults.map(slim);

// ── 5. Optimizer — best single-type and 2-type combo at 200g ──────────���──────
//  Run after the other sections so the arena is back to 1-lane (TEST.lanes(1) above).
//  Tests every defender type + column positions + top-3 pairings.
//  Reveals whether any combo the standard setup missed would perform better.
console.log('[DIAG] Section 5/5: optimizer (200g vs early-mid threat)…');
const optResult = await TEST.optimize(
  [['grunt', 6], ['brute', 3], ['wolf', 3]],
  { budget: 200, speed: SPEED, timeout: T, testCols: [33, 38, 43, 48] }
);
report.sections.optimizer_200g = {
  best: optResult.best ? {
    config:  optResult.best.label,
    verdict: optResult.best.verdict,
    escaped: optResult.best.escaped,
    hpPct:   optResult.best.hpPct,
    cost:    optResult.best.cost,
  } : null,
  top5: (optResult.rankings || []).slice(0, 5).map(r => ({
    config: r.label, verdict: r.verdict, escaped: r.escaped,
    hpPct: r.hpPct + '%', cost: r.cost, killEff: r.killEfficiency,
  })),
};

// ── Final summary ─────────────────────────────────────────────────────────────
const weaknessTypes = weaknesses.map(w => w.type);
report.summary = {
  weaknesses_in_std_setup: weaknessTypes,
  wave_verdicts: waveResults.map(w => `wave${w.wave}: ${w.verdict}`),
  best_gold_eff: report.sections.gold_eff_200g
    .filter(r => r.verdict === 'WIN')
    .sort((a, b) => parseFloat(b.killEff) - parseFloat(a.killEff))
    .slice(0, 3)
    .map(r => r.label),
  optimizer_winner: report.sections.optimizer_200g?.best?.config ?? 'n/a',
};

console.log('[DIAG COMPLETE]');
console.log('Weaknesses:', weaknessTypes.join(', ') || 'none');
console.log('Wave results:', report.summary.wave_verdicts.join(' | '));
console.log('Optimizer winner:', report.summary.optimizer_winner);

await fetch('/test-result', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(report),
}).catch(() => {});
