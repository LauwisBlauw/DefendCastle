import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────
const CFG = {
  GRID_W: 72, GRID_H: 54,
  CASTLE_MAX_HP: 280,                                  // was 300 — leaks bite harder
  START_GOLD: 175,                                     // was 200 — opening is tighter
  // ── Costs ─────────────────────────────────────────────────────────────────
  // Tactical pass: walls/towers slightly pricier so spam-spam-spam isn't a winning strategy.
  COSTS: { wall: 14, tower: 36, catapult: 62, swordsman: 22, knight: 75, spearman: 34, archer: 55, mage: 50, ballista: 80, spiketrap: 18 },
  // ── Defender stats ────────────────────────────────────────────────────────
  // Tower:     solid single-target (2.7 DPS); backbone of any defence
  // Catapult:  AoE splash specialist; same DPS as tower but hits crowds hard
  // Archer:    fast long-range burst (5.0 DPS, range 8); fragile but shreds fast enemies
  // Swordsman: cheap starter melee (2.2 DPS); mass-spammable early-game filler
  // Knight:    elite heavy fighter (8.0 DPS, 65 HP); best vs high-HP elites
  // Spearman:  mid-range hard-hitter (4.4 DPS, range 2.8); good vs tanks
  // Wall:      sturdy blocker; cheap enough to spam key choke points
  STATS: {
    tower:     { range: 6.5, rate: 1.05, dmg: 3, pSpeed: 12, hp: 35, maxSlots: 8, unitCost: 1 },  // 3.15 DPS — bumped from 2.7 so single-target outpaces catapult on lone enemies
    catapult:  { range: 8.5, rate: 0.4, dmg: 8, pSpeed: 6,  aoe: 2.2, hp: 35, maxSlots: 8, unitCost: 2 },  // 3.2 DPS + AoE — slight slow-down so it stays the crowd specialist, not strictly better than tower
    archer:    { range: 8.0, rate: 1.9, dmg: 3, pSpeed: 18, hp: 22, maxSlots: 4, unitCost: 1 },  // rate 2.5→1.9: still strong burst but cost-efficiency closer to tower
    swordsman: { range: 2.5, rate: 2.4, dmg: 2, hp: 26, maxSlots: 2, unitCost: 1 },              // rate 2.8→2.4 (was the cheapest DPS in the game by a mile)
    knight:    { range: 1.8, rate: 1.6, dmg: 5, hp: 65, maxSlots: 4, unitCost: 3 },
    spearman:  { range: 2.8, rate: 1.1, dmg: 5, hp: 32, maxSlots: 3, unitCost: 2 },              // dmg 4→5: gives spearman a real anti-tank niche between sword and knight
    wall:      { hp: 40, unitCost: 0 },                                 // was 35 — walls needed to be a bit sturdier
    mage:      { range: 5.5, rate: 0.9, dmg: 3, pSpeed: 9,  hp: 25, maxSlots: 8, unitCost: 2 }, // dmg 2→3: slow + meaningful damage; cost dropped to 50 to match value
    ballista:  { range: 10.0, rate: 0.3, dmg: 12, pSpeed: 22, hp: 30, maxSlots: 6, unitCost: 2 }, // long-range sniper; reduced dmg + pierce so it's strong, not god-tier
    spiketrap: { range: 0.75, rate: 2.0, dmg: 1, hp: 9999, unitCost: 1 },           // passive AoE; placed on path, no sell
  },
  // ── Enemy stats ───────────────────────────────────────────────────────────
  // hp tuned so 1 tower kills grunts/skeletons in ≤2 s; wolves/spiders in ≤3 s;
  // brutes need 2 towers; tanks/elites need 3+ or specialised coverage.
  // Rewards re-calibrated: r/HP ≈ 1.0–1.4, +bonus for ranged/regen/fast.
  ORC_TYPES: {
    // Tactical-difficulty pass: HP +15-20%, castleDmg up so leaks really hurt, defRates slightly faster.
    grunt:      { speed: 3.4,  hp: 18, reward: 7,  castleDmg: 10, scale: 0.77, wallDmg: 4,  defDmg: 1,  defRate: 1.5 },
    brute:      { speed: 2.93, hp: 26, reward: 20, castleDmg: 26, scale: 0.9,  wallDmg: 7,  defDmg: 3,  defRate: 0.8 },
    boss:       { speed: 1.85, hp: 50, reward: 52, castleDmg: 48, scale: 0.65, wallDmg: 14, defDmg: 6,  defRate: 0.9 },
    troll:      { speed: 2.05, hp: 54, reward: 44, castleDmg: 36, scale: 1.0,  wallDmg: 10, defDmg: 4,  defRate: 0.7,
                  regens: true },
    skeleton:   { speed: 5.4,  hp: 14, reward: 6,  castleDmg: 12, scale: 0.70, wallDmg: 0,  defDmg: 1,  defRate: 1.6 },
    wolf:       { speed: 6.1,  hp: 22, reward: 14, castleDmg: 18, scale: 0.70, wallDmg: 5,  defDmg: 2,  defRate: 1.1 },
    spider:     { speed: 7.6,  hp: 14, reward: 10, castleDmg: 12, scale: 0.56, wallDmg: 2,  defDmg: 1,  defRate: 1.3 },
    cyclops:    { speed: 2.30, hp: 70, reward: 72, castleDmg: 58, scale: 0.85, wallDmg: 18, defDmg: 5,  defRate: 0.7,
                  meleeRange: 2.4, meleeRate: 0.7, meleeDmg: 4 },
    enemyArcher:{ speed: 2.55, hp: 11, reward: 14, castleDmg: 14, scale: 0.77, wallDmg: 2,  defDmg: 2,  defRate: 0.9,
                  shootRange: 8.0, shootRate: 1.2, shootDmg: 3 },                                                          // longer range + harder bow shot
    exploder:   { speed: 2.6,  hp: 14, reward: 14, castleDmg: 20, scale: 0.78, wallDmg: 6, defDmg: 2,  defRate: 0.9,
                  explodesOnDeath: true, explodeRadius: 2.7, explodeDmg: 9 },                                               // bigger & deadlier blast
    healerOrc:  { speed: 2.05, hp: 22, reward: 22, castleDmg: 14, scale: 0.80, wallDmg: 4, defDmg: 1,  defRate: 0.8,
                  healsNearby: true, healRadius: 3.4, healAmount: 5, healInterval: 1.8 },                                   // heals more, more often, wider radius — focus-fire mandatory
    orcMage:    { speed: 1.75, hp: 34, reward: 30, castleDmg: 22, scale: 0.85, wallDmg: 1, defDmg: 0,  defRate: 0.5,
                  shootRange: 9.0, shootRate: 0.65, shootDmg: 5,
                  explodesOnDeath: true, explodeRadius: 3.0, explodeDmg: 9 },                                              // longer range, faster cast, deadlier bolts
    rockTroll:  { speed: 1.45, hp: 95, reward: 80, castleDmg: 52, scale: 1.1,  wallDmg: 18, defDmg: 5, defRate: 0.5,
                  regens: true,
                  shootRange: 7.0, shootRate: 0.32, shootDmg: 12, aoe: 1.3 },                                              // chunkier health, longer-range boulders
  },
  SPAWN_INTERVAL: 1.15, // base; decreases with wave in updateSpawner
  MAX_DEFENDERS: 14,    // base unit cap; +1 per completed wave, max 26
  // ── Upgrade multipliers per level ─────────────────────────────────────────
  // [dmg, range, rate, hp] multipliers applied each time a unit upgrades
  UPGRADE_STATS: {
    tower:     { dmg: 1.35, range: 1.15, rate: 1.25, hp: 1.40 },
    catapult:  { dmg: 1.35, range: 1.15, rate: 1.25, hp: 1.40 },
    archer:    { dmg: 1.35, range: 1.15, rate: 1.25, hp: 1.40 },
    swordsman: { dmg: 1.30, range: 1.10, rate: 1.20, hp: 1.35 },
    knight:    { dmg: 1.30, range: 1.10, rate: 1.20, hp: 1.35 },
    spearman:  { dmg: 1.30, range: 1.15, rate: 1.20, hp: 1.35 },
    mage:      { dmg: 1.35, range: 1.20, rate: 1.25, hp: 1.40 },
    ballista:  { dmg: 1.40, range: 1.20, rate: 1.30, hp: 1.40 },
  },
};

// ─────────────────────────────────────────────
//  PATHS — 3 winding routes through 72x54 map
// ─────────────────────────────────────────────
function expandPath(waypoints) {
  const pts = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    let [c, r] = waypoints[i];
    const [tc, tr] = waypoints[i + 1];
    while (c !== tc) { pts.push([c, r]); c += tc > c ? 1 : -1; }
    while (r !== tr) { pts.push([c, r]); r += tr > r ? 1 : -1; }
  }
  pts.push(waypoints[waypoints.length - 1]);
  return pts;
}

// ─────────────────────────────────────────────
//  MULTI-LAYOUT PATH SYSTEM
//  4 layouts, each with 3 non-overlapping bands:
//    Band A  z 2–17  →  exits at z=24
//    Band B  z 19–30 →  exits at z=27
//    Band C  z 37–52 →  exits at z=30
//  All paths exit near the castle at x=65.
// ─────────────────────────────────────────────
const LAYOUT_WAYPOINTS = [
  { name: 'Blitz',
    // Short paths for the tutorial levels — still fast, but each has ONE meaningful jog
    // so a single long-range tower can't cover the whole road. Teaches placement early.
    a: [[0,10],[20,10],[20,16],[40,16],[40,24],[65,24]],
    b: [[0,27],[18,27],[18,21],[40,21],[40,27],[65,27]],
    c: [[0,44],[20,44],[20,38],[40,38],[40,30],[65,30]],
  },
  { name: 'Classic Winding',
    a: [[0,7],[12,7],[12,2],[26,2],[26,12],[40,12],[40,3],[54,3],[54,17],[62,17],[62,24],[65,24]],
    b: [[0,27],[14,27],[14,21],[30,21],[30,28],[46,28],[46,21],[58,21],[58,27],[65,27]],
    c: [[0,47],[10,47],[10,52],[24,52],[24,41],[38,41],[38,51],[52,51],[52,38],[62,38],[62,30],[65,30]],
  },
  { name: 'Wide Sweeps',
    a: [[0,4],[18,4],[18,15],[34,15],[34,4],[50,4],[50,16],[62,16],[62,24],[65,24]],
    b: [[0,27],[16,27],[16,19],[32,19],[32,29],[50,29],[50,22],[60,22],[60,27],[65,27]],
    c: [[0,50],[16,50],[16,40],[32,40],[32,51],[50,51],[50,39],[62,39],[62,30],[65,30]],
  },
  { name: 'Comb',
    a: [[0,8],[10,8],[10,2],[24,2],[24,12],[38,12],[38,2],[52,2],[52,15],[62,15],[62,24],[65,24]],
    b: [[0,27],[12,27],[12,20],[26,20],[26,30],[42,30],[42,20],[56,20],[56,27],[65,27]],
    c: [[0,46],[10,46],[10,52],[26,52],[26,42],[40,42],[40,52],[56,52],[56,38],[62,38],[62,30],[65,30]],
  },
  { name: 'Switchback',
    a: [[0,6],[14,6],[14,15],[30,15],[30,5],[46,5],[46,15],[58,15],[58,17],[62,17],[62,24],[65,24]],
    b: [[0,27],[12,27],[12,21],[30,21],[30,29],[48,29],[48,21],[60,21],[60,27],[65,27]],
    c: [[0,48],[12,48],[12,38],[30,38],[30,50],[48,50],[48,37],[62,37],[62,30],[65,30]],
  },
];

let activeLayoutIdx = -1;
let PATHS = [[], [], []];
let PATH_SET = new Set();
// Banner display timers — hoisted here so resetGameField (defined right below) can clear
// them safely without hitting the temporal dead zone of let declarations later in the file.
let _bannerHideTimer    = 0;
let _bannerCleanupTimer = 0;

// Call before buildGrid — sets PATHS/PATH_SET without touching grid meshes
function initLayout(idx) {
  activeLayoutIdx = idx;
  const def = LAYOUT_WAYPOINTS[idx];
  PATHS[0] = expandPath(def.a);
  PATHS[1] = expandPath(def.b);
  PATHS[2] = expandPath(def.c);
  PATH_SET = new Set([...PATHS[0], ...PATHS[1], ...PATHS[2]].map(([c,r]) => `${c},${r}`));
}

// Returns total gold invested in a defender (base cost + all upgrade costs paid).
function totalCostPaid(d) {
  const lv = d.level || 1;
  const base = CFG.COSTS[d.type] || 0;
  if (d.type === 'wall') {
    if (lv === 1) return base;
    if (lv === 2) return base + base;        // base + lv2 upgrade (wall*1)
    return base + base + base * 2;            // + lv3 upgrade (wall*2)
  }
  const isBuilding = ['tower', 'catapult', 'archer', 'mage', 'ballista'].includes(d.type);
  const mult = isBuilding ? 2 : 1;
  if (lv === 1) return base;
  if (lv === 2) return base + base * mult;            // base + lv2 upgrade
  return base + base * mult + base * 2 * mult;         // + lv3 upgrade
}

// Clear all defenders, enemies, and projectiles from the field and refund defender costs.
// Called whenever the map layout changes so the player starts the new layout fresh.
function resetGameField(opts = {}) {
  const quiet = opts.quiet === true;
  // Refund and remove all defenders (alive or dying) — refund full investment inc. upgrades
  let refundTotal = 0;
  for (const d of defenders) {
    refundTotal += totalCostPaid(d);
    scene.remove(d.group);
    disposeGroup(d.group);
    // Rally markers are top-level scene children, not under d.group — remove them explicitly
    if (d._rallyMarker) { scene.remove(d._rallyMarker); d._rallyMarker = null; }
  }
  defenders.length = 0;
  _rallyTargeting = false;
  _wallCache.length = 0;
  gold += refundTotal;

  // Remove all enemies
  for (const o of orcs) {
    scene.remove(o.group);
    disposeGroup(o.group);
  }
  orcs.length = 0;

  // Remove all projectiles
  for (const p of projectiles) {
    scene.remove(p.mesh);
    if (p.mesh?.geometry) p.mesh.geometry.dispose();
  }
  projectiles.length = 0;

  // Remove web zones (Group of meshes sharing one material)
  for (const w of webZones) {
    scene.remove(w.mesh);
    w.mesh.traverse(c => { if (c.geometry) c.geometry.dispose(); });
    w.mat.dispose();
  }
  webZones.length = 0;

  // Clear occupied tiles so the fresh layout can be built on
  occupied.clear();

  // Dismiss any open defender panel
  if (typeof selectedDef !== 'undefined') selectedDef = null;
  const _dp = document.getElementById('defender-panel');
  if (_dp) _dp.style.display = 'none';

  // Cancel in-flight UI timers so banners/tooltips from a prior wave don't fire on the new state.
  // resetGameField is only invoked after module init, so all UI bindings below are initialized.
  clearTimeout(_bannerHideTimer);    _bannerHideTimer    = 0;
  clearTimeout(_bannerCleanupTimer); _bannerCleanupTimer = 0;
  clearTimeout(tooltipTimer);
  elBanner.classList.remove('visible', 'boss-fight');

  updateHUD();
  if (!quiet) {
    if (refundTotal > 0) showTooltip(`New layout — ${refundTotal}🟡 refunded!`, 3000);
    else                 showTooltip('New layout — field cleared!', 2200);
  }
}

// Call between waves — swaps tile materials and updates path data
function applyLayout(idx) {
  if (idx === activeLayoutIdx) return;

  // Clear the field and refund defenders before remapping tiles
  resetGameField();

  const def = LAYOUT_WAYPOINTS[idx];
  const newA = expandPath(def.a);
  const newB = expandPath(def.b);
  const newC = expandPath(def.c);
  const newSet = new Set([...newA, ...newB, ...newC].map(([c,r]) => `${c},${r}`));

  // Revert old path tiles to grass (only actual path tiles — never touch scenery/water)
  PATH_SET.forEach(key => {
    const cell = grid[key];
    if (cell && cell.type === 'path') {
      cell.type = 'grass';
      cell.mesh.material = M.grassA;
    }
  });
  // Paint new path tiles (skip scenery/water so tree/pond tiles are never overwritten)
  newSet.forEach(key => {
    const cell = grid[key];
    if (cell && cell.type !== 'castle' && cell.type !== 'scenery' && cell.type !== 'water') {
      cell.type = 'path';
      cell.mesh.material = M.pathMat;
    }
  });

  activeLayoutIdx = idx;
  PATHS[0] = newA; PATHS[1] = newB; PATHS[2] = newC;
  PATH_SET = newSet;
  buildPathLanterns();
}

// ─────────────────────────────────────────────
//  GAME STATE
// ─────────────────────────────────────────────
let gold       = CFG.START_GOLD;
let castleHp   = CFG.CASTLE_MAX_HP;
let wave       = 0;
let kills      = 0;
let waveActive = false;
let gameOver   = false;
let testMode   = false;
let selectedTool      = null;
let selectedEnemyType = null; // test mode: enemy type selected for tile placement
let selectedDef  = null; // defender currently shown in the info panel
let gameSpeed = 1; // 0 = paused, 1 = normal, 2 = fast
let shakeAmt      = 0; // screen shake magnitude, decays each frame
let castleHitTimer = 0; // castle hit-flash animation timer
let castleGroup    = null; // reference to castle THREE.Group

// ── Feature state vars ──────────────────────────────────────────────────────
let totalStars      = 0;          // Feature 3: cumulative stars
let waveStartHp     = 300;        // HP at start of wave (for no-damage star)
let waveDefDeaths   = 0;          // non-wall defenders that died this wave
let waveStartTime   = 0;          // Date.now() when wave started (for speed star)
let hasteWaves      = 0;          // Feature 6: merchant haste
let doubleBonusWave = false;       // Feature 6: merchant double bonus
let streakCount     = 0;           // Feature 7: kill streak
let lastKillTime    = 0;           // Feature 7: kill streak
let rageMultiplier  = 1.0;         // Feature 9: enemy rage
let gameTime        = 0;           // Accumulated game time (pauses with game, unlike clock.elapsedTime)
let lastStandActive = false;       // Feature 10: last stand
let lastStandTimer  = 0;           // Feature 10: last stand
let difficultyMult  = { hp: 1.0, speed: 1.0 }; // Easy/Normal/Hard scaling

// ── Level system ────────────────────────────────────────────────────────────
// Starting gold scales quadratically with level difficulty so each new level opens with enough
// to build a defense that matches the tougher enemies at its starting wave. Deltas: +60/+80/+100/+120/+140.
// Each level has a unique `boss` that appears LAST on the final wave — scaled up, recolored, with
// stats multiplied so it feels like a fight rather than another grunt.
const LEVELS = [
  { id: 1, name: 'Green Fields',   biome: 0, layout: 0, startWave: 1,  endWave: 3,  startGold: 100, icon: '🌿',
    boss: { name: 'Gorthak the Warlord',       scale: 1.45, hpMult: 3.0, rewardMult: 6,  castleDmgMult: 1.5, bodyColor: 0x3a0a3a, eyeColor: 0xff0040,
            slamRange: 3.0, slamRate: 0.55, slamDmg: 6,  slamColor: 0xff2244, aggroRange: 6.5 } },
  { id: 2, name: 'Desert Outpost', biome: 1, layout: 1, startWave: 4,  endWave: 6,  startGold: 160, icon: '🏜️',
    boss: { name: 'Sarathi the Sand Emir',     scale: 1.50, hpMult: 3.5, rewardMult: 7,  castleDmgMult: 1.7, bodyColor: 0x8a5a2a, eyeColor: 0xffaa22,
            slamRange: 3.2, slamRate: 0.60, slamDmg: 7,  slamColor: 0xffaa22, aggroRange: 7.0 } },
  { id: 3, name: 'Frozen Reach',   biome: 2, layout: 2, startWave: 7,  endWave: 9,  startGold: 240, icon: '❄️',
    boss: { name: 'Krivus the Frost King',     scale: 1.55, hpMult: 4.0, rewardMult: 8,  castleDmgMult: 1.8, bodyColor: 0x2a5a8a, eyeColor: 0x88ccff,
            slamRange: 3.4, slamRate: 0.65, slamDmg: 8,  slamColor: 0x88ccff, aggroRange: 7.5 } },
  { id: 4, name: 'Dreadworld',     biome: 3, layout: 3, startWave: 10, endWave: 12, startGold: 340, icon: '🌋',
    boss: { name: 'Ignarok the Flame Tyrant',  scale: 1.60, hpMult: 4.5, rewardMult: 9,  castleDmgMult: 2.0, bodyColor: 0x6a1a0a, eyeColor: 0xff6600,
            slamRange: 3.6, slamRate: 0.70, slamDmg: 10, slamColor: 0xff6600, aggroRange: 8.0,
            explodesOnDeath: true, explodeRadius: 4.5, explodeDmg: 14 } },
  { id: 5, name: 'The Abyss',      biome: 4, layout: 4, startWave: 13, endWave: 15, startGold: 460, icon: '💀',
    boss: { name: 'Vhalzur the Void Sovereign', scale: 1.70, hpMult: 5.5, rewardMult: 12, castleDmgMult: 2.2, bodyColor: 0x0a0210, eyeColor: 0xaa22ff,
            slamRange: 3.8, slamRate: 0.80, slamDmg: 12, slamColor: 0xaa22ff, aggroRange: 9.0 } },
];
const ENDLESS_LEVEL = { id: 'endless', name: 'Endless', biome: 5, layout: 4, startWave: 16, endWave: Infinity, startGold: 600, icon: '♾️' };
// Each story level gets its own base theme so the soundtrack changes as you travel the realms.
// (On Hard these are biased to darker cousins; intensity still escalates to dark/danger in fights.)
//  1 Green Fields = whimsical · 2 Desert = exotic · 3 Icelands = adventurous · 4 Lava = aggressive · 5 Abyss = ominous
const LEVEL_SONGS = { 1: 'wide', 2: 'bazaar', 3: 'switchback', 4: 'comb', 5: 'dark', endless: 'classic' };
const LEVEL_MAX_STARS = 3;
let currentLevel    = null;       // LEVELS entry while playing a level; null in menu; ENDLESS_LEVEL in endless
let levelStarsEarned = 0;         // stars accumulated across the current level's waves (0-9)
let levelWaveStars  = [];         // per-wave star counts for the current level (0-3 each); drives level star rating
let levelProgress   = {};         // { "1": { unlocked, bestStars, completed, bestTimeMs, bestKills }, ... } — loaded from localStorage
let _levelCompleteTimer = null;   // setTimeout handle for the delayed level-complete modal; cleared on mode switch

// ─────────────────────────────────────────────
//  PERSISTENCE — centralized save/load with schema versioning
// ─────────────────────────────────────────────
// Every save key carries a `schemaVersion` field. When we change the shape of
// a saved structure, bump CURRENT_SAVE_VERSIONS[key] and add a migration entry
// that turns the old shape into the new one. `loadSave()` runs migrations in
// order and rewrites the result so old saves keep working forever.
const CURRENT_SAVE_VERSIONS = {
  td_settings:         1,
  td_level_progress:   1,
  td_achievements:     1,
  td_difficulty:       1,
  td_endless_best:     1,
  td_saved_maps:       1,
  td_studio_objects:   1,
  tdHighScore:         1,
};
// migrations[key] = { fromVersion: (data) => newData, ... }
// Example: if you change levelProgress shape later, add `td_level_progress: { 1: d => ({...}) }`
const SAVE_MIGRATIONS = {};

function loadSave(key, defaults = null) {
  let raw;
  try { raw = localStorage.getItem(key); } catch (err) {
    console.warn(`loadSave(${key}): localStorage unavailable`, err);
    return defaults;
  }
  if (!raw) return defaults;
  let data;
  try { data = JSON.parse(raw); } catch (err) {
    console.warn(`loadSave(${key}): corrupted JSON, using defaults`, err);
    return defaults;
  }
  if (data == null) return defaults;
  // Run migrations if the save is older than current version
  const target = CURRENT_SAVE_VERSIONS[key] ?? 1;
  let version = (typeof data === 'object' && data.schemaVersion) || 1;
  const migrations = SAVE_MIGRATIONS[key] || {};
  while (version < target && migrations[version]) {
    try {
      data = migrations[version](data);
      version++;
    } catch (err) {
      console.warn(`loadSave(${key}): migration v${version}→v${version+1} failed`, err);
      return defaults;
    }
  }
  return data;
}

function saveSave(key, data) {
  if (data == null) return;
  // Stamp the current schema version so future migrations know the source shape
  if (typeof data === 'object' && !Array.isArray(data)) {
    data.schemaVersion = CURRENT_SAVE_VERSIONS[key] ?? 1;
  }
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (err) {
    console.warn(`saveSave(${key}): localStorage write failed`, err);
  }
}

// ── Difficulty system ────────────────────────────────────────────────────────
// Three preset difficulties scale enemy HP/speed and per-kill rewards. The
// player picks one in the level select and it applies to every mode (story
// + endless). Stored in localStorage so it persists across sessions.
const DIFFICULTY_PRESETS = {
  easy:   { hp: 0.85, speed: 0.95, rewardMult: 0.85, label: 'Easy',   icon: '🌱' },
  normal: { hp: 1.00, speed: 1.00, rewardMult: 1.00, label: 'Normal', icon: '⚔️' },
  hard:   { hp: 1.25, speed: 1.10, rewardMult: 1.25, label: 'Hard',   icon: '🔥' },
};
let currentDifficulty = 'normal'; // key into DIFFICULTY_PRESETS
function loadDifficulty() {
  try {
    const v = localStorage.getItem('td_difficulty');
    if (v && DIFFICULTY_PRESETS[v]) currentDifficulty = v;
  } catch {}
  applyDifficulty();
}
function saveDifficulty() {
  try { localStorage.setItem('td_difficulty', currentDifficulty); } catch {}
}
function applyDifficulty() {
  const p = DIFFICULTY_PRESETS[currentDifficulty];
  difficultyMult = { hp: p.hp, speed: p.speed, rewardMult: p.rewardMult };
  // Reflect the current pick in the HUD badge so the player can see at a glance
  // which difficulty they're playing — without having to back out to level select.
  const iconEl = document.getElementById('hud-diff-icon');
  const valEl  = document.getElementById('hud-diff-val');
  if (iconEl) iconEl.textContent = p.icon;
  if (valEl)  valEl.textContent  = p.label;
  // Music mood follows difficulty (tempo, darkness, dread-drone timing)
  try { SND.setDifficulty?.(currentDifficulty); } catch {}
}

// ── Endless mode personal best (per-difficulty) ──────────────────────────────
// Best { wave, kills, gold, ts } stored per difficulty so each tier has its own
// leaderboard. Also tracks total endless runs for stat-y achievements.
function loadEndlessBest(diff = currentDifficulty) {
  return loadSave('td_endless_best_' + diff, null);
}
function saveEndlessBest(diff, record) {
  saveSave('td_endless_best_' + diff, record);
}
function maybeUpdateEndlessBest() {
  if (!currentLevel || currentLevel.id !== 'endless') return null;
  const prev = loadEndlessBest(currentDifficulty);
  const cur  = { wave, kills, ts: Date.now() };
  const isNew = !prev || cur.wave > prev.wave || (cur.wave === prev.wave && cur.kills > (prev.kills || 0));
  if (isNew) saveEndlessBest(currentDifficulty, cur);
  return { isNew, prev, cur };
}

// ── Level run timer (for "best clear time" per story level) ──────────────────
let _levelRunStartMs = 0;          // ms timestamp when a level started
function _levelElapsedMs() { return _levelRunStartMs ? (Date.now() - _levelRunStartMs) : 0; }
function _formatTimeMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2,'0')}` : `${s}s`;
}

let studioMode       = false;
let studioParts      = [];   // [{mesh, w,h,d, color}] — parts in the current build
let studioSel        = null; // currently selected part
let studioSaved      = [];   // [{name, parts:[{x,y,z,w,h,d,rx,ry,rz,color}]}]
let studioLoadedName = null; // name of the currently loaded saved object
let studioRafId      = null; // rAF handle for studio render loop
let _stScene, _stRenderer, _stCamera, _stControls, _stGroup, _stRaycaster;
let _stPointerStart  = null; // for click-vs-drag detection on studio canvas
let studioTab        = 'build'; // 'build' | 'world' | 'units'
// World Editor state
let _worldSel        = null;  // selected initialScenery item
let _worldFilter     = 'all'; // filter category
// Unit Lab state
let _unitLabType     = null;
let _unitLabCat      = 'defender';
// Build tab undo/redo
let _stUndoStack   = [];
let _stRedoStack   = [];
let _stStepMode    = 1;    // 0=fine  1=normal  2=coarse
let _stNudgeActive = false; // true while user is nudging (groups nudges into one undo step)
// Build tab layers
let _stLayers       = [];   // [{id,name,visible,locked}]
let _stActiveLayerId = null;
let _stLayerNextId  = 1;
const _stLayerGroups = {}; // id → THREE.Group (children of _stGroup)
// Unit Lab preview renderer
let _unitPreviewRenderer = null;
let _unitPreviewScene    = null;
let _unitPreviewCamera   = null;
let _unitPreviewRafId    = null;
let _unitPreviewGroup    = null;
// Snapshot of original stats for reset
const _UNIT_DEF_DEFAULTS = JSON.parse(JSON.stringify(CFG.STATS));
const _UNIT_ORC_DEFAULTS = JSON.parse(JSON.stringify(CFG.ORC_TYPES));

let mapEditorMode   = false;
let _meActiveTool   = 'tree';
let _meBrushSize    = 1;            // 1/2/3 — square brush for plain tile tools + erase
let _meItems        = [];           // [{type, col, row, scale, seed, group}]
let _meTileOverrides = {};          // key `col,row` -> { origMat, origType, newType }
let _mePaths        = [[], [], []]; // ordered [col,row] per path A/B/C (index 0/1/2)
let _mePathTiles    = [{}, {}, {}]; // quick lookup: key->`col,row` per path index
let _meSavedMaps    = [];
let _meLoadedName   = null;
let _meHoverMesh    = null;
// Undo/redo stacks — each entry is { undo, redo }: paired closures that reverse
// or re-apply ONE editor action. Capped at 50 to bound memory.
let _meUndoStack    = [];
let _meRedoStack    = [];
const _ME_UNDO_LIMIT = 50;
// While true, a redo is replaying an action — _mePushUndo becomes a no-op so
// the replay doesn't record itself as a brand-new action.
let _meReplaying = false;
// Batching: while a drag-stroke is in progress (between mousedown and mouseup),
// individual tile actions accumulate into _meUndoBatch instead of pushing directly.
// One Ctrl+Z then reverses the WHOLE stroke, which is what players expect.
let _meUndoBatch = null;
function _meBeginUndoBatch() { _meUndoBatch = []; }
function _meEndUndoBatch() {
  if (!_meUndoBatch) return;
  const batch = _meUndoBatch;
  _meUndoBatch = null;
  if (batch.length === 0) return;
  if (batch.length === 1) { _mePushUndoRaw(batch[0]); return; }
  // Collapse N entries into one — undo runs in reverse order, redo re-applies forward.
  _mePushUndoRaw({
    undo: () => { for (let i = batch.length - 1; i >= 0; i--) batch[i].undo(); },
    redo: () => { for (let i = 0; i < batch.length; i++) batch[i].redo(); },
  });
}
function _mePushUndoRaw(entry) {
  _meUndoStack.push(entry);
  if (_meUndoStack.length > _ME_UNDO_LIMIT) _meUndoStack.shift();
  _meRedoStack.length = 0; // a fresh action invalidates the redo branch
}
function _mePushUndo(undoFn, redoFn) {
  if (_meReplaying) return; // redo replays must not re-record themselves
  const entry = { undo: undoFn, redo: redoFn || (() => {}) };
  // If a batch is open, accumulate. Otherwise push directly (single-click actions).
  if (_meUndoBatch) _meUndoBatch.push(entry);
  else _mePushUndoRaw(entry);
}
function _meUndo() {
  const entry = _meUndoStack.pop();
  if (!entry) { showTooltip('Nothing to undo', 1200); return; }
  try { entry.undo(); } catch (err) { console.warn('undo failed:', err); }
  _meRedoStack.push(entry);
  showTooltip(`Undo (${_meUndoStack.length} left · Ctrl+Y = redo)`, 900);
}
function _meRedo() {
  const entry = _meRedoStack.pop();
  if (!entry) { showTooltip('Nothing to redo', 1200); return; }
  _meReplaying = true;
  try { entry.redo(); } catch (err) { console.warn('redo failed:', err); }
  finally { _meReplaying = false; }
  // Back onto the undo stack directly — must NOT clear the remaining redo branch
  _meUndoStack.push(entry);
  if (_meUndoStack.length > _ME_UNDO_LIMIT) _meUndoStack.shift();
  showTooltip(`Redo (${_meRedoStack.length} left)`, 900);
}

// Feature 4: unlock system
const UNLOCKED = new Set(['wall','tower','swordsman']);
const UNLOCK_WAVES = { archer: 3, spearman: 6, knight: 8, catapult: 9, spiketrap: 2, ballista: 5, mage: 7 };

const grid        = {};
const orcs        = [];
const defenders   = [];
const _wallCache  = []; // cached wall refs — rebuilt on place/sell/death/clear
const projectiles = [];
const vfx         = [];
const webZones    = []; // { mesh, pos, timer, radius }

// ── Reusable temp vectors (avoid per-frame allocations) ──
const _tmpV3a = new THREE.Vector3();
const _tmpV3b = new THREE.Vector3();
const _tmpV3c = new THREE.Vector3();
const _tmpV3d = new THREE.Vector3();
const _tmpV2  = new THREE.Vector2();
// Dedicated to the projectile hot-loop so per-frame aim/steer math allocates nothing.
const _projTgt = new THREE.Vector3();   // current aim point
const _projDir = new THREE.Vector3();   // steering vector (mesh → aim)
// Shared "black" emissive — read-only sentinel for hit-flash restoration paths
// (many callsites used to do `new THREE.Color(0)` per restore).
const _COLOR_BLACK = Object.freeze(new THREE.Color(0));
let spawnQueue    = [];
let spawnTimer    = 0;
let _testSpawnQueue = [];  // timed wave simulation in test mode
let _testSpawnTimer = 0;
let _testSpawnWave  = 1;
const occupied    = new Set();
const staticObstacles = []; // {x, z, r} — trees and rocks, for unit collision
const initialScenery  = []; // {group, col, row} — objects placed by buildScenery(), erasable in map editor
let _biomeTreeSpots   = []; // [{col,row,scale,x,z}] — tree positions for biome-swap rebuilding

// ─────────────────────────────────────────────
//  SCENE
// ─────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080c14);
scene.fog = new THREE.Fog(0x080c14, 80, 160);

// ── SKY DOME — vertical gradient (horizon → zenith), tinted per biome ──────
// Replaces the flat scene.background with real atmospheric depth: pale at the
// horizon (matching the fog colour so terrain fades seamlessly into sky),
// deepening toward the zenith. Drawn first with no depth write so stars/moon
// still render on top; ignores fog so it reads as sky beyond the falloff.
const skyDomeMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    topColor:     { value: new THREE.Color(0x5588bb) },
    horizonColor: { value: new THREE.Color(0x88aacc) },
  },
  vertexShader: /* glsl */`
    varying vec3 vWorld;
    void main() {
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 topColor;
    uniform vec3 horizonColor;
    varying vec3 vWorld;
    void main() {
      float h = normalize(vWorld - cameraPosition).y;
      float t = smoothstep(-0.08, 0.5, h);
      gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0);
    }`,
});
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(230, 24, 12), skyDomeMat);
skyDome.position.set(36, 0, 27);
skyDome.renderOrder = -10;
scene.add(skyDome);

// ── VOXEL CLOUDS — chunky flat clusters drifting over the map ──────────────
// They cast real shadows, so cloud shade slowly sweeps across the battlefield.
// Tint/opacity follow the biome (bright over Meadow, ash-dark over Mordor).
// Drift uses wall-clock elapsed time: ambient motion shouldn't speed up at 2×
// game speed, and it keeps the menu backdrop alive while paused.
const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
const cloudGroup = new THREE.Group();
const _clouds = [];
{
  // Deterministic layout (mulberry-ish hash) so the sky looks the same every load
  const rnd = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Group();
    const puffs = 3 + Math.floor(rnd(i, 1) * 3);
    for (let p = 0; p < puffs; p++) {
      const w = 4 + rnd(i, p + 2) * 6, d = 2.5 + rnd(i, p + 9) * 4;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), cloudMat);
      m.position.set((p - puffs / 2) * 3 + rnd(i, p + 17) * 2, rnd(i, p + 23) * 0.8, (rnd(i, p + 31) - 0.5) * 3.5);
      m.castShadow = true;
      c.add(m);
    }
    c.position.y = 26 + rnd(i, 40) * 9;
    c.position.z = -8 + rnd(i, 50) * 70;
    _clouds.push({ group: c, baseX: rnd(i, 60) * 140 - 30, speed: 0.45 + rnd(i, 70) * 0.5 });
    cloudGroup.add(c);
  }
}
scene.add(cloudGroup);
function updateClouds(elapsed) {
  for (const c of _clouds) {
    // Wrap across [-35, 105] so clouds re-enter long before becoming visible
    c.group.position.x = ((c.baseX + elapsed * c.speed + 35) % 140) - 35;
  }
}
// Per-biome cloud dressing — keyed by biome name, falls back to plain white
const CLOUD_STYLE = {
  Meadow:   { color: 0xffffff, opacity: 0.92 },
  Desert:   { color: 0xf2dcae, opacity: 0.55 },
  Icelands: { color: 0xe8f2ff, opacity: 0.95 },
  Lava:     { color: 0x4a2018, opacity: 0.85 },
  Mordor:   { color: 0x3a342c, opacity: 0.88 },
  Doom:     { color: 0x3a1226, opacity: 0.85 },
  Vibe:     { color: 0x7a55cc, opacity: 0.60 },
};

// ── AMBIENT PARTICLES — per-biome atmosphere motes ──────────────────────────
// One pooled THREE.Points cloud restyled per biome: fireflies drifting low
// over the Meadow, falling snow in the Icelands, rising embers over Lava,
// ash flakes in Mordor, neon motes in Vibe. Driven by wall-clock time like
// the clouds (ambience shouldn't fast-forward at 2× or freeze on pause).
const AMBIENT_STYLE = {
  Meadow:   { color: 0xdfff7a, size: 0.30, opacity: 0.75, add: true,  count: 90,  mode: 'firefly', yMin: 0.4, yMax: 4.5, spd: [0.4, 0.9] },
  Desert:   { color: 0xd8b878, size: 0.50, opacity: 0.26, add: false, count: 140, mode: 'drift',   yMin: 0.5, yMax: 9,   spd: [1.2, 2.6] },
  Icelands: { color: 0xffffff, size: 0.38, opacity: 0.90, add: false, count: 220, mode: 'fall',    yMin: 0,   yMax: 22,  spd: [1.2, 2.4] },
  Lava:     { color: 0xff7733, size: 0.32, opacity: 0.90, add: true,  count: 160, mode: 'rise',    yMin: 0,   yMax: 14,  spd: [0.8, 1.8] },
  Mordor:   { color: 0x77695a, size: 0.42, opacity: 0.50, add: false, count: 150, mode: 'fall',    yMin: 0,   yMax: 18,  spd: [0.5, 1.1] },
  Doom:     { color: 0xcc2255, size: 0.28, opacity: 0.70, add: true,  count: 110, mode: 'rise',    yMin: 0,   yMax: 12,  spd: [0.5, 1.2] },
  Vibe:     { color: 0xff55dd, size: 0.30, opacity: 0.80, add: true,  count: 120, mode: 'rise',    yMin: 0,   yMax: 14,  spd: [0.4, 1.0] },
};
const AMBIENT_MAX = 220;
const _ambPos  = new Float32Array(AMBIENT_MAX * 3);
const _ambSeed = []; // { spd, ph } per particle
const _ambGeo  = new THREE.BufferGeometry();
_ambGeo.setAttribute('position', new THREE.BufferAttribute(_ambPos, 3));
const ambientPtsMat = new THREE.PointsMaterial({
  color: 0xdfff7a, size: 0.3, transparent: true, opacity: 0.75,
  depthWrite: false, sizeAttenuation: true,
});
const ambientPts = new THREE.Points(_ambGeo, ambientPtsMat);
ambientPts.frustumCulled = false; // positions update on CPU; skip stale-bounds culling
scene.add(ambientPts);
let _ambStyle = AMBIENT_STYLE.Meadow;
function _applyAmbientStyle(name) {
  _ambStyle = AMBIENT_STYLE[name] || AMBIENT_STYLE.Meadow;
  const s = _ambStyle;
  ambientPtsMat.color.setHex(s.color);
  ambientPtsMat.size = s.size;
  ambientPtsMat.opacity = s.opacity;
  ambientPtsMat.blending = s.add ? THREE.AdditiveBlending : THREE.NormalBlending;
  ambientPtsMat.needsUpdate = true;
  _ambGeo.setDrawRange(0, s.count);
  _ambSeed.length = 0;
  for (let i = 0; i < s.count; i++) {
    _ambPos[i * 3]     = -2 + Math.random() * 78; // x: across the whole field
    _ambPos[i * 3 + 1] = s.yMin + Math.random() * (s.yMax - s.yMin);
    _ambPos[i * 3 + 2] = -2 + Math.random() * 60; // z
    _ambSeed.push({ spd: s.spd[0] + Math.random() * (s.spd[1] - s.spd[0]), ph: Math.random() * Math.PI * 2 });
  }
  _ambGeo.attributes.position.needsUpdate = true;
}
function updateAmbientParticles(rawDt, t) {
  const s = _ambStyle;
  for (let i = 0; i < s.count; i++) {
    const j = i * 3, sd = _ambSeed[i];
    if (!sd) break;
    if (s.mode === 'fall') {
      _ambPos[j + 1] -= sd.spd * rawDt;
      _ambPos[j]     += Math.sin(t * 0.5 + sd.ph) * 0.4 * rawDt;
      if (_ambPos[j + 1] < s.yMin) _ambPos[j + 1] = s.yMax;
    } else if (s.mode === 'rise') {
      _ambPos[j + 1] += sd.spd * rawDt;
      _ambPos[j]     += Math.sin(t * 0.8 + sd.ph) * 0.6 * rawDt;
      if (_ambPos[j + 1] > s.yMax) _ambPos[j + 1] = s.yMin;
    } else if (s.mode === 'drift') {
      _ambPos[j]     += sd.spd * rawDt;
      _ambPos[j + 1] += Math.sin(t * 0.6 + sd.ph) * 0.25 * rawDt;
      if (_ambPos[j] > 78) _ambPos[j] = -4;
    } else { // firefly: gentle 3D wander inside a low band
      _ambPos[j]     += Math.sin(t * 0.35 + sd.ph) * sd.spd * rawDt;
      _ambPos[j + 2] += Math.cos(t * 0.30 + sd.ph * 1.7) * sd.spd * rawDt;
      _ambPos[j + 1] += Math.sin(t * 0.85 + sd.ph) * 0.3 * rawDt;
      if (_ambPos[j + 1] < s.yMin) _ambPos[j + 1] = s.yMin;
      if (_ambPos[j + 1] > s.yMax) _ambPos[j + 1] = s.yMax;
    }
  }
  // Fireflies softly pulse as a swarm
  if (s.mode === 'firefly') ambientPtsMat.opacity = s.opacity * (0.65 + 0.35 * Math.sin(t * 1.8));
  _ambGeo.attributes.position.needsUpdate = true;
}

// ── DAY/NIGHT CYCLE — endless mode only ─────────────────────────────────────
// A slow sinusoidal brightness sweep (4-minute day) layered multiplicatively
// over the active biome's base lighting, so long endless runs breathe between
// noon and deep night. Every frame recomputes from the biome table, and the
// exact base values are restored the moment the player leaves endless.
const DAYNIGHT_PERIOD = 240; // seconds per full day
let _dnWasActive = false;
function updateDayNight(t) {
  const active = currentLevel?.id === 'endless' && activeBiomeIdx >= 0;
  const b = BIOMES[activeBiomeIdx];
  if (!active || !b) {
    if (_dnWasActive && b) {
      _dnWasActive = false;
      sun.intensity       = b.sun[1];
      ambient.intensity   = b.ambient[1];
      hemiLight.intensity = b.hemi[2];
      skyDomeMat.uniforms.topColor.value.setHex(b.bg);
      skyDomeMat.uniforms.horizonColor.value.setHex(b.fog[0]);
      scene.fog.color.setHex(b.fog[0]);
    }
    return;
  }
  _dnWasActive = true;
  const cyc    = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 / DAYNIGHT_PERIOD); // 1 = noon, 0 = midnight
  const lightF = 0.55 + 0.45 * cyc;   // lights never fully die — the game stays readable at night
  const skyF   = 0.40 + 0.60 * cyc;
  sun.intensity       = b.sun[1]     * lightF;
  ambient.intensity   = b.ambient[1] * lightF;
  hemiLight.intensity = b.hemi[2]    * lightF;
  skyDomeMat.uniforms.topColor.value.setHex(b.bg).multiplyScalar(skyF);
  skyDomeMat.uniforms.horizonColor.value.setHex(b.fog[0]).multiplyScalar(skyF);
  scene.fog.color.setHex(b.fog[0]).multiplyScalar(skyF);
}

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;     // blocky but not stair-stepped — keeps the voxel feel without shadow-edge crawl
renderer.toneMapping = THREE.ACESFilmicToneMapping; // filmic grading: richer saturation rolloff, highlights stop clipping
renderer.toneMappingExposure = 1.35;                // ACES darkens midtones — compensate so the palette keeps its brightness

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 280);
camera.position.set(32, 38, 68);
camera.lookAt(32, 0, 27);

// ── POST-PROCESSING — subtle bloom so emissives (lava, lanterns, crystals,
// magic bolts, boss eyes) actually glow instead of just being bright pixels.
// Toggleable in settings ("Glow FX"); when off, the classic single-pass
// renderer.render path is used untouched.
let bloomEnabled = true; // persisted via td_settings (see _initSettings)
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.45,  // strength — subtle halo, not a haze
  0.55,  // radius
  0.80,  // threshold — only genuinely bright/emissive surfaces bloom
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass()); // applies tone mapping + sRGB in the composer path

const controls = new OrbitControls(camera, canvas);
controls.target.set(32, 0, 27);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 22;
controls.maxDistance = 52;
controls.maxPolarAngle = Math.PI / 2.8;

const _camKeys = new Set();
const _camVel  = new THREE.Vector3();

// Lights — tuned for voxel AO feel: low ambient = deep shadow pockets
const ambient = new THREE.AmbientLight(0x223355, 0.35);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff0dd, 2.2);
sun.position.set(50, 80, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 220;
sun.shadow.camera.left   = -90;
sun.shadow.camera.right  =  90;
sun.shadow.camera.top    =  90;
sun.shadow.camera.bottom = -90;
scene.add(sun);

// dim cool fill — keeps dark faces readable without washing out shadows
const fillLight = new THREE.DirectionalLight(0x3355aa, 0.18);
fillLight.position.set(-30, 12, -20);
scene.add(fillLight);

const hemiLight = new THREE.HemisphereLight(0x334466, 0x1a2211, 0.2);
scene.add(hemiLight);

const rimLight = new THREE.DirectionalLight(0x8899cc, 0.15);
rimLight.position.set(-60, 30, 80);
scene.add(rimLight);

const castleGlow = new THREE.PointLight(0x00d4ff, 2.5, 22);
castleGlow.position.set(68, 5, 27);
scene.add(castleGlow);

const torchL = new THREE.PointLight(0xff8820, 1.8, 7);
torchL.position.set(65.8, 2.5, 24.5);
scene.add(torchL);

const torchR = new THREE.PointLight(0xff8820, 1.8, 7);
torchR.position.set(65.8, 2.5, 29.5);
scene.add(torchR);

// Muzzle flash — single pooled light, repositioned & intensity set on each shot
const muzzleFlash = new THREE.PointLight(0xffffff, 0, 7);
scene.add(muzzleFlash);

// Container for path lanterns — cleared and rebuilt on layout change
const lanternGroup = new THREE.Group();
scene.add(lanternGroup);
const lanternLights = []; // PointLights inside lanterns, updated for flicker each frame

// ─────────────────────────────────────────────
//  PIXEL ART UNIT TEXTURE FACTORY
//  Generates 16×16 canvas textures with per-pixel noise so every box face
//  has a hand-painted voxel look rather than a flat solid colour.
// ─────────────────────────────────────────────
function makePxTex(baseHex, { spots = false, stripes = false, seed = 0x9a7f3c } = {}) {
  const SZ = 16;
  const cv = document.createElement('canvas'); cv.width = cv.height = SZ;
  const ctx = cv.getContext('2d');
  let s = seed;
  const rng = () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return (s >>> 0) / 0x100000000; };
  const hex = baseHex.replace('#', '');
  const br = parseInt(hex.substring(0, 2), 16);
  const bg = parseInt(hex.substring(2, 4), 16);
  const bb = parseInt(hex.substring(4, 6), 16);
  for (let y = 0; y < SZ; y++) {
    for (let x = 0; x < SZ; x++) {
      let v = (rng() - 0.5) * 26;
      if (stripes && (y % 4 < 2)) v -= 18;          // dark horizontal bands
      if (spots && rng() < 0.07)   v += 35;          // bright speckles
      const r = Math.max(0, Math.min(255, (br + v) | 0));
      const g = Math.max(0, Math.min(255, (bg + v) | 0));
      const b = Math.max(0, Math.min(255, (bb + v) | 0));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
// Convenience: textured MeshStandardMaterial with flat shading + NearestFilter map.
//
// The map is a NEUTRAL white-based grain (darkening noise only) shared per
// pattern, while the material's `color` carries the hue. Two reasons:
//  1. applyBiome() re-tints several of these materials at runtime via setHex —
//     a colour baked into the texture would double-multiply and muddy the tint.
//  2. Darkening-only noise keeps every palette hue at its designed brightness.
const _pxTexCache = new Map();
function _neutralPxTex({ spots = false, stripes = false } = {}) {
  const key = `${spots ? 1 : 0}|${stripes ? 1 : 0}`;
  if (_pxTexCache.has(key)) return _pxTexCache.get(key);
  const SZ = 16;
  const cv = document.createElement('canvas'); cv.width = cv.height = SZ;
  const ctx = cv.getContext('2d');
  let s = 0x9a7f3c;
  const rng = () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return (s >>> 0) / 0x100000000; };
  const val = new Float32Array(SZ * SZ).fill(255); // darkening-only weathering field

  // COARSE blotches: a handful of soft dark patches several texels wide. Per-pixel
  // noise (the old approach) averaged back to flat under mipmapping, so weathering
  // vanished at gameplay distance — low-frequency blotches survive the mip chain.
  const nBlobs = spots ? 7 : 5;
  for (let i = 0; i < nBlobs; i++) {
    const cx = rng() * SZ, cy = rng() * SZ;
    const r  = 2.0 + rng() * 3.5;
    const depth = (spots ? 46 : 30) * (0.6 + rng() * 0.4);
    for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < r) val[y * SZ + x] -= depth * (1 - d / r);
    }
  }
  // Pattern overlays + fine grain
  for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) {
    let v = val[y * SZ + x] - rng() * 12;          // subtle per-texel break-up on top
    if (stripes && (y % 4 < 2)) v -= 22;           // plank / brushed-metal banding
    const c = Math.max(20, Math.min(255, v | 0));  // floor so nothing goes pure black
    ctx.fillStyle = `rgb(${c},${c},${c})`;
    ctx.fillRect(x, y, 1, 1);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  _pxTexCache.set(key, tex);
  return tex;
}
function pxMat(baseHex, opts = {}, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color: baseHex,
    map: _neutralPxTex(opts),
    roughness: 0.92, metalness: 0, flatShading: true,
    ...extra,
  });
}

// ─────────────────────────────────────────────
//  MATERIALS
// ─────────────────────────────────────────────
const M = {
  grassA:       new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0.0 }),
  pathMat:      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x223311, emissiveIntensity: 0.10, roughness: 0.95 }),
  castleStone:  new THREE.MeshStandardMaterial({ color: 0x5a6878 }),
  castleLight:  new THREE.MeshStandardMaterial({ color: 0x6e8090 }),
  castleDark:   new THREE.MeshStandardMaterial({ color: 0x2a3848 }),
  castleFlag:   new THREE.MeshStandardMaterial({ color: 0x1e56c8 }),  // royal-blue banner — flies on castle, tower pennant & knight tabard (was red)
  castleFlagPole: new THREE.MeshStandardMaterial({ color: 0xd4a04a }), // gold trim accent
  towerBase:    new THREE.MeshStandardMaterial({ color: 0x2c3e50 }),
  crystal:      new THREE.MeshStandardMaterial({ color: 0x00d4ff, emissive: 0x00d4ff, emissiveIntensity: 1.9 }),
  wallStone:    new THREE.MeshStandardMaterial({ color: 0x7a8898 }),
  catWood:      new THREE.MeshStandardMaterial({ color: 0x3a2515 }),
  catMetal:     new THREE.MeshStandardMaterial({ color: 0x4a4a5a, metalness: 0.7, roughness: 0.4 }),
  swArmor:      pxMat('#3a6bc4', {}, { metalness: 0.5, roughness: 0.5 }),
  swHelmet:     pxMat('#4a7bd4', {}, { metalness: 0.5, roughness: 0.4 }),
  spLeather:    pxMat('#7a5a38'),
  arcGreen:     pxMat('#2d6b3a'),
  skin:         pxMat('#f0c090'),
  weapon:       new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.8, roughness: 0.3 }),
  spearHead:    new THREE.MeshStandardMaterial({ color: 0xd0d0e0, metalness: 0.9, roughness: 0.2 }),
  orcBody:      pxMat('#3a1414', { spots: true }),   // dark blood-maroon grunt (was teal — now in the warm horde palette)
  orcHead:      pxMat('#4a1c1c'),
  // Enemy faction accent = purple (glowing eyes unify all enemies as "the purple horde";
  // each species gets a slightly different shade so individual identities still read clearly).
  orcEye:       new THREE.MeshStandardMaterial({ color: 0xaa33ff, emissive: 0xaa33ff, emissiveIntensity: 1.6 }),
  orcTusk:      new THREE.MeshStandardMaterial({ color: 0xf0e0c0 }),
  bruteBody:    pxMat('#4a1208', { stripes: true }), // volcanic crimson — very distinct from teal grunt
  bruteEye:     new THREE.MeshStandardMaterial({ color: 0xdd44ff, emissive: 0xdd44ff, emissiveIntensity: 1.2 }),
  bossBody:     pxMat('#2a0820', { stripes: true }), // blackened blood-purple warlord (kept dark & corrupt, nudged warm)
  trollMat:     pxMat('#3e2c1a', { spots: true }),   // rust-brown troll (shifted off olive-green into the warm horde)
  trollEye:     new THREE.MeshStandardMaterial({ color: 0xcc22dd, emissive: 0xcc22dd, emissiveIntensity: 1.6 }),
  trollClub:    new THREE.MeshStandardMaterial({ color: 0x3a2510 }),
  rockTrollMat: pxMat('#564e44', { spots: true }),   // warm stone-skin rock troll (grey nudged warm so it isn't read as steel)
  rockTrollEye: new THREE.MeshStandardMaterial({ color: 0x9922ff, emissive: 0x7711cc, emissiveIntensity: 1.4 }),
  skelBone:     pxMat('#c0b898'),                    // aged/dirty bone
  skelEye:      new THREE.MeshStandardMaterial({ color: 0x9900ff, emissive: 0x9900ff, emissiveIntensity: 1.3 }),
  // Wolf — warm charcoal (shifted off blue-grey so it can't be mistaken for a steel defender)
  wolfBody:     pxMat('#473a38', { stripes: true }),
  wolfHead:     pxMat('#372c2a'),
  wolfEye:      new THREE.MeshStandardMaterial({ color: 0xbb33ff, emissive: 0xbb33ff, emissiveIntensity: 1.6 }),
  // Spider — red-black carapace (shifted off blue-black; warm so it stays in the horde palette)
  spiderBody:   pxMat('#1c0808', { spots: true }),
  spiderEye:    new THREE.MeshStandardMaterial({ color: 0xaa33ff, emissive: 0xaa33ff, emissiveIntensity: 1.2 }),
  // Cyclops
  cyclopMat:    pxMat('#583828', { spots: true }),   // dark clay (replaces MC skin)
  cyclopBody:   pxMat('#583828', { spots: true }),   // kept for brow piece
  cyclopEye:    new THREE.MeshStandardMaterial({ color: 0xdd33ff, emissive: 0xdd33ff, emissiveIntensity: 1.8 }),
  // Enemy Archer
  eArcherBody:  pxMat('#221808', { stripes: true }), // dark warm brown
  eArcherHood:  pxMat('#141028'),                    // deep indigo-black hood
  oArchSkin:    pxMat('#485228'),                    // military olive, distinct from grunt teal
  oArchLeather: pxMat('#2a1a08'),
  // Defender extras
  swShield:     new THREE.MeshStandardMaterial({ color: 0x1a3060, metalness: 0.35, roughness: 0.55 }),
  swVisor:      new THREE.MeshStandardMaterial({ color: 0x080c18 }),
  // Defender faction trim accent = GOLD. Small-area trim only (waist bands, shield bosses,
  // visor rims, helm crests, sword pommels, tabard emblems). Paired with royal-blue cloth +
  // steel this gives the cohesive "Azure & Gold Order" look — warm metallic gold is unmistakable
  // against the enemy's matte blood-red bodies, so it never blurs the faction line.
  swGold:       new THREE.MeshStandardMaterial({ color: 0xe0a82a, metalness: 0.7, roughness: 0.32, emissive: 0xc89020, emissiveIntensity: 0.85 }),
  spCape:       new THREE.MeshStandardMaterial({ color: 0x1a2e72 }),  // deep royal-blue cape (was crimson — now matches the Azure Order)
  spHelmet:     new THREE.MeshStandardMaterial({ color: 0x62748c, metalness: 0.55, roughness: 0.45 }),  // steel blue-grey (was bronze)
  arcHood:      new THREE.MeshStandardMaterial({ color: 0x0e2c3c }),  // dark blue-teal hood (shifted off green)
  arcBelt:      new THREE.MeshStandardMaterial({ color: 0x3a2010 }),
  mageBeard:    new THREE.MeshStandardMaterial({ color: 0xe8e0d0 }),  // ivory wizard beard
  swTunic:      pxMat('#1e3a7a'),                                     // royal blue swordsman tunic
  spTunic:      pxMat('#2a4060'),                                     // slate blue spearman cloth
  arcTeal:      pxMat('#296a86'),                                    // blue-teal archer (shifted off green into the cool faction)
  towerRoof:    new THREE.MeshStandardMaterial({ color: 0x12122a }),
  // Projectiles
  bolt:         new THREE.MeshStandardMaterial({ color: 0x00d4ff, emissive: 0x00d4ff, emissiveIntensity: 1.5 }),
  arrowMat:     new THREE.MeshStandardMaterial({ color: 0x8B5a14 }),
  enemyArrow:   new THREE.MeshStandardMaterial({ color: 0x6a3008, emissive: 0x440000, emissiveIntensity: 0.3 }),
  rockMat:      new THREE.MeshStandardMaterial({ color: 0x888898 }),
  enemyRock:    new THREE.MeshStandardMaterial({ color: 0x7a6a58 }),
  // Mage defender
  magePurple:   pxMat('#1a4a8a'),
  mageRobe:     pxMat('#0d2a6a', { stripes: true }),
  mageOrb:      new THREE.MeshStandardMaterial({ color: 0x55aaff, emissive: 0x2266ff, emissiveIntensity: 2.0 }),
  mageEye:      new THREE.MeshStandardMaterial({ color: 0x00ccff, emissive: 0x0088ff, emissiveIntensity: 2.5 }),
  mageStaff:    new THREE.MeshStandardMaterial({ color: 0x3a2510 }),
  // Ballista defender
  ballistaWood: new THREE.MeshStandardMaterial({ color: 0x2a1a08 }),
  ballistaArm:  new THREE.MeshStandardMaterial({ color: 0x3a2a10 }),
  ballistaRope: new THREE.MeshStandardMaterial({ color: 0xc8b070 }),
  // Spike trap
  spikeBase:    new THREE.MeshStandardMaterial({ color: 0x3a2810 }),
  spikeMetal:   new THREE.MeshStandardMaterial({ color: 0x3a3848, metalness: 0.8, roughness: 0.3 }),
  spikeGlow:    new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff4400, emissiveIntensity: 0.7 }),
  // Exploder enemy
  exploderBody: pxMat('#bb2200', { stripes: true }),
  exploderBelly:new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff8800, emissiveIntensity: 1.2 }),
  // Healer orc enemy — rusty-brown body (off green); the GREEN stays only on the heal glow as a spell tell
  healerBody:   pxMat('#4a2818', { spots: true }),
  healerGlow:   new THREE.MeshStandardMaterial({ color: 0x44ff66, emissive: 0x22ee44, emissiveIntensity: 1.4 }),
  // Orc Mage enemy — warm mottled flesh (off green); blood-crimson robe keeps it in the horde palette
  orcMageSkin:  pxMat('#5a3418', { spots: true }),
  orcMageRobe:  pxMat('#280808', { stripes: true }), // dark blood-crimson robe
  orcMageHat:   pxMat('#120618'),                    // near-black purple hat
  orcMageEye:   new THREE.MeshStandardMaterial({ color: 0xaaff00, emissive: 0x88dd00, emissiveIntensity: 2.0 }),
  orcMageOrbMat:new THREE.MeshStandardMaterial({ color: 0xdd2200, emissive: 0xaa1100, emissiveIntensity: 2.8 }),
  orcMagicMat:  new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xcc1100, emissiveIntensity: 2.2 }),
  // Orb projectile (mage)
  orbMat:       new THREE.MeshStandardMaterial({ color: 0xcc55ff, emissive: 0x9922ee, emissiveIntensity: 2.0 }),
  // Ballista bolt projectile
  bBoltMat:     new THREE.MeshStandardMaterial({ color: 0xd4a030, metalness: 0.6, roughness: 0.4 }),
  hpBg:         new THREE.MeshBasicMaterial({ color: 0x220000 }),
  hpFg:         new THREE.MeshBasicMaterial({ color: 0x22ff44 }),
  ghost:        new THREE.MeshStandardMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.3, depthWrite: false }),
  ghostNo:      new THREE.MeshStandardMaterial({ color: 0xff3300, transparent: true, opacity: 0.3, depthWrite: false }),
  ghostEnemy:   new THREE.MeshStandardMaterial({ color: 0xff6600, transparent: true, opacity: 0.4, depthWrite: false }),
  voidPlane:    new THREE.MeshStandardMaterial({ color: 0x3a8040, roughness: 0.95 }),
  rockMat:      new THREE.MeshStandardMaterial({ color: 0x7a7868, roughness: 0.88 }),
  rockDark:     new THREE.MeshStandardMaterial({ color: 0x585850, roughness: 0.92 }),
  treeTrunk:    new THREE.MeshStandardMaterial({ color: 0x5a3a1a }),
  treeFoliage:  new THREE.MeshStandardMaterial({ color: 0x1a5c28 }),
  treeFoliage2: new THREE.MeshStandardMaterial({ color: 0x226b32 }),
  waterDeep:    new THREE.MeshStandardMaterial({ color: 0x1a5c9a, emissive: 0x0a2c4a, emissiveIntensity: 0.3, roughness: 0.05, metalness: 0.3 }),
  waterShallow: new THREE.MeshStandardMaterial({ color: 0x2a7abf, emissive: 0x0a3a60, emissiveIntensity: 0.2, roughness: 0.1, metalness: 0.1 }),
  waterSurf:    new THREE.MeshStandardMaterial({ color: 0x3a9fe0, transparent: true, opacity: 0.52, roughness: 0.0, metalness: 0.5, depthWrite: false }),
  hillGrass:    new THREE.MeshStandardMaterial({ color: 0x3a8040, roughness: 0.88 }),
  hillDark:     new THREE.MeshStandardMaterial({ color: 0x2d6030, roughness: 0.95 }),
  castleHPBarBg:new THREE.MeshBasicMaterial({ color: 0x330000 }),
  castleHPBarFg:new THREE.MeshBasicMaterial({ color: 0x22ff44, side: THREE.DoubleSide }),
  // Lanterns
  lanternPost: new THREE.MeshStandardMaterial({ color: 0x1a1a22, metalness: 0.75, roughness: 0.35 }),
  lanternGlow: new THREE.MeshStandardMaterial({ color: 0xffcc44, emissive: 0xffaa22, emissiveIntensity: 2.4, transparent: true, opacity: 0.88 }),
  // Fantasy town buildings
  townWall:  new THREE.MeshStandardMaterial({ color: 0xd0c4b0, roughness: 0.85 }),
  townWallB: new THREE.MeshStandardMaterial({ color: 0xb8a888, roughness: 0.90 }),
  townRoof:  new THREE.MeshStandardMaterial({ color: 0x7a3520, roughness: 0.90 }),
  townRoofB: new THREE.MeshStandardMaterial({ color: 0x3a4870, roughness: 0.85 }),
  townRoofC: new THREE.MeshStandardMaterial({ color: 0x2a5030, roughness: 0.90 }),
  townRoofD: new THREE.MeshStandardMaterial({ color: 0x604878, roughness: 0.88 }),
  townBeam:  new THREE.MeshStandardMaterial({ color: 0x3a2510, roughness: 0.95 }),
  townWin:   new THREE.MeshStandardMaterial({ color: 0xffe090, emissive: 0xffaa00, emissiveIntensity: 1.4 }),
  townDoor:  new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.92 }),
  townSign:  new THREE.MeshStandardMaterial({ color: 0x6a4820, roughness: 0.92 }),
  townStone: new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 0.92 }),
  townThatch:new THREE.MeshStandardMaterial({ color: 0xb8904a, roughness: 0.97 }),
  townThatchD:new THREE.MeshStandardMaterial({ color: 0x8a6a30, roughness: 0.97 }),
  townMetal: new THREE.MeshStandardMaterial({ color: 0x3c3c4a, roughness: 0.65, metalness: 0.45 }),
  townForge: new THREE.MeshStandardMaterial({ color: 0xff5500, emissive: 0xff2200, emissiveIntensity: 1.8 }),
  townAwningR:new THREE.MeshStandardMaterial({ color: 0xcc2828, roughness: 0.95 }),
  townAwningB:new THREE.MeshStandardMaterial({ color: 0x224499, roughness: 0.95 }),
  townPlanks: new THREE.MeshStandardMaterial({ color: 0x6a4c28, roughness: 0.96 }),
  townPlaster:new THREE.MeshStandardMaterial({ color: 0xddd4b8, roughness: 0.92 }),
  townTileR:  new THREE.MeshStandardMaterial({ color: 0x8a3018, roughness: 0.90 }),
  townStoneD: new THREE.MeshStandardMaterial({ color: 0x58504a, roughness: 0.96 }),
  townIron:   new THREE.MeshStandardMaterial({ color: 0x282830, roughness: 0.55, metalness: 0.6 }),
  // Map Editor tile materials
  meDirt:      new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 0.97 }),
  meSand:      new THREE.MeshStandardMaterial({ color: 0xc8aa68, roughness: 0.96 }),
  meLava:      new THREE.MeshStandardMaterial({ color: 0x1a0400, emissive: 0xcc3300, emissiveIntensity: 0.75, roughness: 0.65 }),
  mePathB:     new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x332200, emissiveIntensity: 0.14, roughness: 0.95 }),
  mePathC:     new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x001a33, emissiveIntensity: 0.14, roughness: 0.95 }),
  // New tree materials
  pineTrunk:   new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.95 }),
  pineFoliage: new THREE.MeshStandardMaterial({ color: 0x1a4020, roughness: 0.90 }),
  palmTrunk:   new THREE.MeshStandardMaterial({ color: 0x8a6830, roughness: 0.92 }),
  palmFrond:   new THREE.MeshStandardMaterial({ color: 0x2a6010, roughness: 0.88 }),
  cactus:      new THREE.MeshStandardMaterial({ color: 0x286422, roughness: 0.88 }),
  deadTrunk:   new THREE.MeshStandardMaterial({ color: 0x2e1c0c, roughness: 0.97 }),
  mushStem:    new THREE.MeshStandardMaterial({ color: 0xddd0b8, roughness: 0.93 }),
  mushCap:     new THREE.MeshStandardMaterial({ color: 0xcc2200, roughness: 0.84 }),
  mushSpot:    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 }),
};
// Shared-material registry: palette materials in M.* are reused across many meshes, so
// disposeGroup() must NOT free them when a single unit dies (per-unit hit-flash clones are
// unique and DO get freed). Declared here — before the loop below — so the const is
// initialized when markMaterialShared runs (avoids a temporal-dead-zone ReferenceError).
const _SHARED_MATERIALS = new WeakSet();
function markMaterialShared(m) {
  if (!m) return;
  if (Array.isArray(m)) m.forEach(_SHARED_MATERIALS.add, _SHARED_MATERIALS);
  else _SHARED_MATERIALS.add(m);
}
// Mark every palette material as shared so `disposeGroup` doesn't free them when a single
// unit dies. Per-unit hit-flash clones (`mat0.clone()`) are NOT in this set, so they get freed.
for (const m of Object.values(M)) markMaterialShared(m);

// Voxel aesthetic: flat-shade every solid surface so face transitions are hard and blocky.
// Skip water (needs smooth normals for reflections) and ghost/transparent overlays.
(function applyVoxelShading() {
  const skipKeys = new Set(['waterDeep','waterShallow','waterSurf','ghost','ghostNo','ghostEnemy',
                            'hpBg','hpFg','castleHPBarBg','castleHPBarFg']);
  Object.entries(M).forEach(([key, mat]) => {
    if (skipKeys.has(key)) return;
    if (mat.isMeshStandardMaterial) { mat.flatShading = true; mat.needsUpdate = true; }
  });
})();

// ── Hand-painted grain on STRUCTURAL materials ──────────────────────────────
// The creature/soldier bodies (pxMat) already carry a neutral darkening grain;
// the stone, wood, cloth and metal of buildings & siege engines did not, so
// they read as flat plastic next to the grained units. Apply the same shared
// grain map here (colour stays in the material; the map only darkens), keyed by
// surface type for the right pattern. Skipped: ground (grassA/pathMat take
// biome ground textures), pure-glow emissives, and anything already mapped.
(function applyStructuralGrain() {
  // stone → pitting speckles · wood/metal → grain banding · cloth → soft noise
  const STONE = ['castleStone','castleLight','castleDark','towerBase','wallStone','rockMat','enemyRock','spikeMetal','catMetal'];
  const WOOD  = ['catWood','ballistaWood','ballistaArm','mageStaff','trollClub','spikeBase','arcBelt','towerRoof','catapult'];
  const CLOTH = ['castleFlag','spCape','mageBeard','swShield','arcHood','orcTusk'];
  const tex = (opts) => _neutralPxTex(opts);
  const assign = (keys, opts) => keys.forEach(k => {
    const m = M[k];
    if (!m || m.map) return;          // skip missing or already-textured
    m.map = tex(opts); m.needsUpdate = true;
  });
  assign(STONE, { spots: true });
  assign(WOOD,  { stripes: true });
  assign(CLOTH, {});
})();

// ─────────────────────────────────────────────
//  MINECRAFT SKIN TEXTURES
// ─────────────────────────────────────────────
const _texLoader = new THREE.TextureLoader();
function _loadSkin(path) {
  const t = _texLoader.load(path);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const SKINS = {
  cyclops: _loadSkin('/skins/cyclops-on-planetminecraft-com.png'),
  troll:   _loadSkin('/skins/Ogree-Troll-on-planetminecraft-com.png'),
  knight:  _loadSkin('/skins/pmcskin3d-alex-slim-arms-2024-04-09t231852-188-17705801-e1030.png'),
};
// skinMat: returns a MeshStandardMaterial showing sub-region [px,py,pw,ph] of a 64×64 skin atlas
function skinMat(tex, px, py, pw, ph, sz = 64) {
  const t = tex.clone(); t.needsUpdate = true;
  t.repeat.set(pw / sz, ph / sz);
  t.offset.set(px / sz, 1 - (py + ph) / sz);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, flatShading: true });
}
// skinBox6: BoxGeometry with 6 per-face materials mapped to Minecraft skin UV regions
function skinBox6(w, h, d, tex, {right, left, top, bot, front, back}, sz = 64) {
  const mk = ([px, py, pw, ph]) => skinMat(tex, px, py, pw, ph, sz);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    [mk(right), mk(left), mk(top), mk(bot), mk(front), mk(back)]);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
// Minecraft skin UV layout constants (64×64 pixel sheet)
const MC_SKIN = {
  HEAD:  { right:[0,8,8,8],    left:[16,8,8,8],   top:[8,0,8,8],   bot:[16,0,8,8],  front:[8,8,8,8],   back:[24,8,8,8]  },
  BODY:  { right:[16,20,4,12], left:[28,20,4,12],  top:[20,16,8,4], bot:[28,16,8,4], front:[20,20,8,12], back:[32,20,8,12] },
  ARM_R: { right:[40,20,4,12], left:[48,20,4,12],  top:[44,16,4,4], bot:[48,16,4,4], front:[44,20,4,12], back:[52,20,4,12] },
  ARM_L: { right:[32,52,4,12], left:[40,52,4,12],  top:[36,48,4,4], bot:[40,48,4,4], front:[36,52,4,12], back:[44,52,4,12] },
  LEG_R: { right:[0,20,4,12],  left:[8,20,4,12],   top:[4,16,4,4],  bot:[8,16,4,4],  front:[4,20,4,12],  back:[12,20,4,12] },
  LEG_L: { right:[16,52,4,12], left:[24,52,4,12],  top:[20,48,4,4], bot:[24,48,4,4], front:[20,52,4,12], back:[28,52,4,12] },
};
// Helper: apply fn to every material on a mesh (handles both single and array materials)
function _forMats(m, fn) {
  if (Array.isArray(m.material)) m.material.forEach(fn); else fn(m.material);
}

// ─────────────────────────────────────────────
//  GEOMETRY CACHE
// ─────────────────────────────────────────────
const GEO = {
  tile:     new THREE.BoxGeometry(1, 0.3, 1),
  pBolt:    new THREE.BoxGeometry(0.15, 0.15, 0.15),
  pArrow:   new THREE.BoxGeometry(0.05, 0.05, 0.40),
  pRock:    new THREE.BoxGeometry(0.30, 0.30, 0.30),
  pEArrow:  new THREE.BoxGeometry(0.05, 0.05, 0.42),
  pERock:   new THREE.BoxGeometry(0.28, 0.28, 0.28),
  pEMagic:  new THREE.BoxGeometry(0.20, 0.20, 0.20),
  pOrb:     new THREE.BoxGeometry(0.22, 0.22, 0.22),
  pBBolt:   new THREE.BoxGeometry(0.07, 0.07, 0.54),
  particle: new THREE.BoxGeometry(0.10, 0.10, 0.10),
};
function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }

// Convenience: return a new Vector3 at pos with a Y offset — avoids verbose clone+add chains
// Reused across all callers — safe because every call site either passes the result
// straight into a consumer that reads it immediately (spawnHitParticles copies, .project()
// is synchronous, etc.) or calls .clone() on it before the next frame.
const _posAboveV = new THREE.Vector3();
function posAbove(pos, y) { return _posAboveV.set(pos.x, pos.y + y, pos.z); }

// Stepped animation: quantise a smooth [-1,1] curve to N discrete keyframes.
// Makes limb movement look like sprite-sheet flipbook animation — the Minecraft retro feel.
// steps=4 → 4-frame cycle (very chunky), steps=6 → smoother but still stepped.
function stepAnim(v, steps) { return Math.round(v * steps) / steps; }

function mesh(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ─────────────────────────────────────────────
//  CASTLE HP MESH (3D bar over gate)
// ─────────────────────────────────────────────
let castleHPMesh = null;
let castleHPBgMesh = null;
const CASTLE_BAR_MAX_W = 3.0;

// ─────────────────────────────────────────────
//  TILE TEXTURES — procedural canvas textures
// ─────────────────────────────────────────────

// Shared rounded-rect path helper
function _rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2, 4);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function makeCobbleTex() {
  const SZ = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = SZ;
  const ctx = cv.getContext('2d');

  // Dark mortar background
  ctx.fillStyle = '#1e1c18';
  ctx.fillRect(0, 0, SZ, SZ);
  // Mortar micro-noise
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * SZ, y = Math.random() * SZ;
    const v = 10 + Math.floor(Math.random() * 18);
    ctx.fillStyle = `rgba(${v},${v - 2},${v - 4},0.12)`;
    ctx.fillRect(x, y, 2, 2);
  }

  const COLS = 8, ROWS = 7;
  const GX = SZ / COLS, GY = SZ / ROWS;
  const PAD = 5;
  let seed = 0x5ea1ed;
  const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 0x100000000; };

  for (let row = 0; row < ROWS + 1; row++) {
    for (let col = 0; col < COLS + 1; col++) {
      const offX = (row & 1) ? GX * 0.5 : 0;
      const jx = (rng() - 0.5) * GX * 0.16;
      const jy = (rng() - 0.5) * GY * 0.16;
      const scX = 0.78 + rng() * 0.26;
      const scY = 0.76 + rng() * 0.28;
      let px = ((col * GX + offX + jx) % SZ);
      if (px < -GX) px += SZ;
      const py = row * GY + jy;
      const pw = (GX - PAD) * scX;
      const ph = (GY - PAD) * scY;
      if (py + ph < -5 || py > SZ + 5) continue;

      const v = 72 + Math.floor(rng() * 60);
      const warm = Math.floor(rng() * 14) - 5;
      const mossy = rng() < 0.12;
      const mossG = mossy ? Math.floor(rng() * 18) : 0;
      const sr = Math.min(255, v + warm + 8);
      const sg = Math.min(255, v + warm + 2 + mossG);
      const sb = Math.min(255, v - warm);

      const radius = Math.min(pw, ph) * 0.20;
      _rrect(ctx, px + PAD / 2, py + PAD / 2, pw, ph, radius);
      const grd = ctx.createLinearGradient(px, py, px + pw, py + ph);
      grd.addColorStop(0,    `rgb(${sr + 22},${sg + 20},${sb + 18})`);
      grd.addColorStop(0.45, `rgb(${sr},${sg},${sb})`);
      grd.addColorStop(1,    `rgb(${Math.max(0, sr - 28)},${Math.max(0, sg - 24)},${Math.max(0, sb - 24)})`);
      ctx.fillStyle = grd;
      ctx.fill();

      // Edge stroke
      _rrect(ctx, px + PAD / 2, py + PAD / 2, pw, ph, radius);
      ctx.strokeStyle = 'rgba(0,0,0,0.40)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Top-left rim highlight
      ctx.save();
      _rrect(ctx, px + PAD / 2, py + PAD / 2, pw, ph, radius);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,252,240,0.13)';
      ctx.fillRect(px + PAD / 2, py + PAD / 2, pw, ph * 0.3);
      ctx.fillRect(px + PAD / 2, py + PAD / 2, pw * 0.25, ph);
      ctx.restore();

      // Surface crack
      if (rng() < 0.38) {
        ctx.save();
        _rrect(ctx, px + PAD / 2 + 1, py + PAD / 2 + 1, pw - 2, ph - 2, radius);
        ctx.clip();
        ctx.beginPath();
        const cx0 = px + PAD / 2 + rng() * pw * 0.5 + pw * 0.15;
        const cy0 = py + PAD / 2 + rng() * ph * 0.5 + ph * 0.15;
        ctx.moveTo(cx0, cy0);
        ctx.lineTo(cx0 + (rng() - 0.5) * pw * 0.55, cy0 + (rng() - 0.5) * ph * 0.55);
        ctx.strokeStyle = 'rgba(0,0,0,0.20)';
        ctx.lineWidth = 0.6 + rng() * 0.8;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 3.5);
  return tex;
}

// Warm sandstone-brick path (Path B)
function makeCobbleTexB() {
  const SZ = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = SZ;
  const ctx = cv.getContext('2d');

  ctx.fillStyle = '#3a2e1e';
  ctx.fillRect(0, 0, SZ, SZ);
  for (let i = 0; i < 2500; i++) {
    const x = Math.random() * SZ, y = Math.random() * SZ;
    const v = 20 + Math.floor(Math.random() * 20);
    ctx.fillStyle = `rgba(${v + 10},${v},${v - 8},0.10)`;
    ctx.fillRect(x, y, 2, 2);
  }

  const COLS = 6, ROWS = 10;
  const GX = SZ / COLS, GY = SZ / ROWS;
  const PAD = 4;
  let seed = 0x7a3f12;
  const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 0x100000000; };

  for (let row = 0; row < ROWS + 1; row++) {
    for (let col = 0; col < COLS + 1; col++) {
      const offX = (row & 1) ? GX * 0.5 : 0;
      let px = ((col * GX + offX) % SZ) + (rng() - 0.5) * GX * 0.1;
      const py = row * GY + (rng() - 0.5) * GY * 0.1;
      const pw = (GX - PAD) * (0.82 + rng() * 0.20);
      const ph = (GY - PAD) * (0.78 + rng() * 0.24);
      if (py + ph < 0 || py > SZ + 5) continue;

      const v = 160 + Math.floor(rng() * 40);
      const r = Math.min(255, v + 15);
      const g = Math.min(255, v - 10);
      const b = Math.min(255, v - 40);

      const radius = Math.min(pw, ph) * 0.15;
      _rrect(ctx, px + PAD / 2, py + PAD / 2, pw, ph, radius);
      const grd = ctx.createLinearGradient(px, py, px + pw, py + ph);
      grd.addColorStop(0,   `rgb(${r + 18},${g + 16},${b + 12})`);
      grd.addColorStop(0.5, `rgb(${r},${g},${b})`);
      grd.addColorStop(1,   `rgb(${Math.max(0, r - 22)},${Math.max(0, g - 20)},${Math.max(0, b - 16)})`);
      ctx.fillStyle = grd;
      ctx.fill();

      _rrect(ctx, px + PAD / 2, py + PAD / 2, pw, ph, radius);
      ctx.strokeStyle = 'rgba(0,0,0,0.30)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.save();
      _rrect(ctx, px + PAD / 2, py + PAD / 2, pw, ph, radius);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,245,200,0.15)';
      ctx.fillRect(px + PAD / 2, py + PAD / 2, pw, ph * 0.25);
      ctx.restore();
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 3.5);
  return tex;
}

// Dark slate path (Path C)
function makeCobbleTexC() {
  const SZ = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = SZ;
  const ctx = cv.getContext('2d');

  ctx.fillStyle = '#0e0e12';
  ctx.fillRect(0, 0, SZ, SZ);
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * SZ, y = Math.random() * SZ;
    const v = 5 + Math.floor(Math.random() * 12);
    ctx.fillStyle = `rgba(${v},${v},${v + 4},0.15)`;
    ctx.fillRect(x, y, 2, 2);
  }

  const COLS = 7, ROWS = 6;
  const GX = SZ / COLS, GY = SZ / ROWS;
  const PAD = 5;
  let seed = 0x2c1b9a;
  const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 0x100000000; };

  for (let row = 0; row < ROWS + 1; row++) {
    for (let col = 0; col < COLS + 1; col++) {
      const offX = (row & 1) ? GX * 0.55 : 0;
      let px = ((col * GX + offX) % SZ) + (rng() - 0.5) * GX * 0.2;
      const py = row * GY + (rng() - 0.5) * GY * 0.2;
      const pw = (GX - PAD) * (0.80 + rng() * 0.24);
      const ph = (GY - PAD) * (0.78 + rng() * 0.26);
      if (py + ph < 0 || py > SZ + 5) continue;

      const v = 42 + Math.floor(rng() * 32);
      const r = Math.max(0, v - 5);
      const g = Math.max(0, v - 2);
      const b = Math.min(255, v + 10);

      const radius = Math.min(pw, ph) * 0.22;
      _rrect(ctx, px + PAD / 2, py + PAD / 2, pw, ph, radius);
      const grd = ctx.createLinearGradient(px, py, px + pw, py + ph);
      grd.addColorStop(0,   `rgb(${r + 20},${g + 20},${b + 24})`);
      grd.addColorStop(0.5, `rgb(${r},${g},${b})`);
      grd.addColorStop(1,   `rgb(${Math.max(0, r - 18)},${Math.max(0, g - 18)},${Math.max(0, b - 18)})`);
      ctx.fillStyle = grd;
      ctx.fill();

      _rrect(ctx, px + PAD / 2, py + PAD / 2, pw, ph, radius);
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Wet/reflective sheen
      ctx.save();
      _rrect(ctx, px + PAD / 2, py + PAD / 2, pw, ph, radius);
      ctx.clip();
      ctx.fillStyle = 'rgba(180,210,255,0.08)';
      ctx.fillRect(px + PAD / 2, py + PAD / 2, pw, ph * 0.35);
      ctx.restore();

      if (rng() < 0.45) {
        ctx.save();
        _rrect(ctx, px + PAD / 2 + 1, py + PAD / 2 + 1, pw - 2, ph - 2, radius);
        ctx.clip();
        ctx.beginPath();
        const cx0 = px + PAD / 2 + rng() * pw * 0.6 + pw * 0.1;
        const cy0 = py + PAD / 2 + rng() * ph * 0.6 + ph * 0.1;
        ctx.moveTo(cx0, cy0);
        ctx.lineTo(cx0 + (rng() - 0.5) * pw * 0.6, cy0 + (rng() - 0.5) * ph * 0.6);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 0.5 + rng() * 0.8;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 3.5);
  return tex;
}

// Dirt / soil tile texture
function makeDirtTex() {
  const SZ = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = SZ;
  const ctx = cv.getContext('2d');

  ctx.fillStyle = '#6b4e2a';
  ctx.fillRect(0, 0, SZ, SZ);

  for (let i = 0; i < 200; i++) {
    const x = Math.random() * SZ, y = Math.random() * SZ;
    const r = 8 + Math.random() * 24;
    const v = Math.floor(Math.random() * 30) - 15;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${107 + v},${78 + v},${42 + v},0.55)`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 8000; i++) {
    const x = Math.random() * SZ, y = Math.random() * SZ;
    const v = Math.floor(Math.random() * 40) - 20;
    ctx.fillStyle = `rgba(${80 + v},${55 + v},${28 + v},0.18)`;
    ctx.fillRect(x, y, 2, 2);
  }
  // Small pebbles
  for (let i = 0; i < 60; i++) {
    const x = 10 + Math.random() * (SZ - 20), y = 10 + Math.random() * (SZ - 20);
    const rp = 2 + Math.random() * 4;
    const v = 110 + Math.floor(Math.random() * 40);
    ctx.beginPath();
    ctx.ellipse(x, y, rp * (0.7 + Math.random() * 0.6), rp * (0.7 + Math.random() * 0.6), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${v - 5},${v - 12},${v - 18})`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  // Subtle cracks
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    let cx = Math.random() * SZ, cy = Math.random() * SZ;
    ctx.moveTo(cx, cy);
    for (let s = 0; s < 4; s++) {
      cx += (Math.random() - 0.5) * 30;
      cy += (Math.random() - 0.5) * 30;
      ctx.lineTo(cx, cy);
    }
    ctx.strokeStyle = `rgba(30,18,8,${0.15 + Math.random() * 0.2})`;
    ctx.lineWidth = 0.5 + Math.random();
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  return tex;
}

// Sand tile texture
function makeSandTex() {
  const SZ = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = SZ;
  const ctx = cv.getContext('2d');

  ctx.fillStyle = '#c8aa68';
  ctx.fillRect(0, 0, SZ, SZ);

  for (let i = 0; i < 300; i++) {
    const x = Math.random() * SZ, y = Math.random() * SZ;
    const r = 5 + Math.random() * 30;
    const v = Math.floor(Math.random() * 25) - 12;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${200 + v},${170 + v},${104 + v},0.35)`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * SZ, y = Math.random() * SZ;
    const v = Math.floor(Math.random() * 35) - 17;
    ctx.fillStyle = `rgba(${200 + v},${170 + v},${105 + v},0.20)`;
    ctx.fillRect(x, y, 1, 1);
  }
  // Wind ripple lines
  for (let rr = 0; rr < 18; rr++) {
    const y0 = rr * (SZ / 18) + (Math.random() - 0.5) * 12;
    const amp = 3 + Math.random() * 6;
    const freq = 0.01 + Math.random() * 0.015;
    const phase = Math.random() * Math.PI * 2;
    ctx.beginPath();
    for (let x = 0; x < SZ; x += 2) {
      const y = y0 + Math.sin(x * freq + phase) * amp;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(${180 + Math.floor(Math.random() * 20)},${148 + Math.floor(Math.random() * 15)},80,${0.10 + Math.random() * 0.12})`;
    ctx.lineWidth = 1 + Math.random();
    ctx.stroke();
  }
  // Scattered pebbles
  for (let i = 0; i < 40; i++) {
    const x = 8 + Math.random() * (SZ - 16), y = 8 + Math.random() * (SZ - 16);
    const rp = 1.5 + Math.random() * 3;
    const v = 130 + Math.floor(Math.random() * 40);
    ctx.beginPath();
    ctx.ellipse(x, y, rp * (0.8 + Math.random() * 0.5), rp * (0.6 + Math.random() * 0.5), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${v + 10},${v + 5},${v - 10})`;
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  return tex;
}

// Lava cracked-obsidian tile texture
function makeLavaTex() {
  const SZ = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = SZ;
  const ctx = cv.getContext('2d');

  ctx.fillStyle = '#0a0604';
  ctx.fillRect(0, 0, SZ, SZ);

  // Basalt surface variation
  for (let i = 0; i < 250; i++) {
    const x = Math.random() * SZ, y = Math.random() * SZ;
    const r = 6 + Math.random() * 30;
    const v = Math.floor(Math.random() * 18);
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${20 + v},${12 + v},${8 + v},0.6)`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * SZ, y = Math.random() * SZ;
    const v = Math.floor(Math.random() * 15);
    ctx.fillStyle = `rgba(${v},${v},${v},0.20)`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Glowing crack network
  const numPts = 22;
  const pts = [];
  for (let i = 0; i < numPts; i++) pts.push([Math.random() * SZ, Math.random() * SZ]);
  const edgePts = [[0,0],[SZ,0],[0,SZ],[SZ,SZ],[SZ/2,0],[0,SZ/2],[SZ,SZ/2],[SZ/2,SZ]];
  const allPts = [...pts, ...edgePts];

  for (let i = 0; i < pts.length; i++) {
    const neighbours = allPts
      .map((p, j) => ({ j, d: Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]) }))
      .filter(e => e.j !== i && e.d > 0)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);

    neighbours.forEach(({ j }) => {
      const [x1, y1] = pts[i];
      const [x2, y2] = allPts[j];
      const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * 35;
      const my = (y1 + y2) / 2 + (Math.random() - 0.5) * 35;

      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2);
      ctx.strokeStyle = 'rgba(200,60,0,0.35)'; ctx.lineWidth = 7; ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2);
      ctx.strokeStyle = 'rgba(255,130,20,0.60)'; ctx.lineWidth = 3; ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2);
      ctx.strokeStyle = 'rgba(255,220,60,0.85)'; ctx.lineWidth = 1; ctx.stroke();
    });
  }

  // Hotspot glows at crack junctions
  pts.forEach(([x, y]) => {
    if (Math.random() < 0.6) {
      const r = 8 + Math.random() * 22;
      const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0,   'rgba(255,200,50,0.7)');
      grd.addColorStop(0.3, 'rgba(220,80,10,0.4)');
      grd.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });

  // Darken to keep overall tone moody
  ctx.fillStyle = 'rgba(5,3,2,0.28)';
  ctx.fillRect(0, 0, SZ, SZ);

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

// ─────────────────────────────────────────────
//  GROUND TEXTURE — procedural per biome
// ─────────────────────────────────────────────
function makeGroundTex(name) {
  const SZ = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = SZ;
  const ctx = cv.getContext('2d');
  const R = () => Math.random();

  // helper: scatter radial gradient blobs
  function blobs(n, rMin, rMax, hsl, alpha) {
    for (let i = 0; i < n; i++) {
      const x = R()*SZ, y = R()*SZ, r = rMin + R()*(rMax-rMin);
      const [h,s,l] = hsl(i);
      const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `hsla(${h},${s}%,${l}%,${alpha})`);
      grd.addColorStop(1, `hsla(${h},${s}%,${l}%,0)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r*(0.4+R()*0.7), R()*Math.PI, 0, Math.PI*2);
      ctx.fill();
    }
  }
  // helper: jagged cracks
  function cracks(n, color, wMin, wMax, segs) {
    for (let i = 0; i < n; i++) {
      let cx = R()*SZ, cy = R()*SZ;
      ctx.strokeStyle = color;
      ctx.lineWidth = wMin + R()*(wMax-wMin);
      ctx.beginPath(); ctx.moveTo(cx, cy);
      for (let s = 0; s < segs; s++) {
        cx += (R()-0.5)*22; cy += (R()-0.5)*22;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
  }

  if (name === 'Meadow') {
    ctx.fillStyle = '#253c14'; ctx.fillRect(0,0,SZ,SZ);
    blobs(90, 18, 58, () => [95+R()*35, 65, 22+R()*22], 0.75);
    blobs(45, 8, 30, () => [115, 60, 42], 0.28);
    for (let i = 0; i < 700; i++) {
      const x=R()*SZ, y=R()*SZ, len=5+R()*14, a=-Math.PI/2+(R()-0.5)*1.3;
      const g=80+Math.floor(R()*100);
      ctx.strokeStyle=`rgba(${Math.floor(g*0.35)},${g},${Math.floor(g*0.1)},0.85)`;
      ctx.lineWidth=0.6+R(); ctx.beginPath(); ctx.moveTo(x,y);
      ctx.quadraticCurveTo(x+Math.cos(a+0.4)*len*0.5, y+Math.sin(a+0.4)*len*0.5, x+Math.cos(a)*len, y+Math.sin(a)*len);
      ctx.stroke();
    }
    blobs(25, 4, 14, () => [35, 55, 40], 0.22);

  } else if (name === 'Desert') {
    ctx.fillStyle = '#c0994a'; ctx.fillRect(0,0,SZ,SZ);
    blobs(80, 15, 45, () => [35+R()*15, 60, 50+R()*18], 0.45);
    // Sand ripple strokes
    for (let i = 0; i < 60; i++) {
      const x0=R()*SZ, y0=R()*SZ, len=18+R()*55, a=R()*Math.PI;
      ctx.strokeStyle=`rgba(${160+Math.floor(R()*50)},${120+Math.floor(R()*30)},60,0.25)`;
      ctx.lineWidth=1+R()*2.5; ctx.beginPath(); ctx.moveTo(x0,y0);
      ctx.quadraticCurveTo(x0+Math.cos(a)*len*0.5+(R()-0.5)*20, y0+Math.sin(a)*len*0.5, x0+Math.cos(a)*len, y0+Math.sin(a)*len);
      ctx.stroke();
    }
    cracks(35, 'rgba(90,60,15,0.35)', 0.4, 1.2, 4);
    blobs(20, 4, 14, () => [25, 50, 35], 0.2); // pebbles

  } else if (name === 'Icelands') {
    ctx.fillStyle = '#c4dff0'; ctx.fillRect(0,0,SZ,SZ);
    blobs(60, 15, 45, () => [200+R()*20, 55, 68+R()*20], 0.5);
    cracks(50, `rgba(80,160,220,0.45)`, 0.5, 2, 5);
    // Snow sparkles
    for (let i = 0; i < 250; i++) {
      const x=R()*SZ, y=R()*SZ, r=0.4+R()*2;
      ctx.fillStyle=`rgba(255,255,255,${0.3+R()*0.7})`;
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    }
    blobs(30, 6, 20, () => [210, 30, 85], 0.3); // bright ice patches

  } else if (name === 'Lava') {
    ctx.fillStyle = '#0f0400'; ctx.fillRect(0,0,SZ,SZ);
    blobs(55, 12, 35, () => [15+R()*10, 70, 8+R()*8], 0.8); // dark rock
    // Glowing lava cracks
    for (let i = 0; i < 45; i++) {
      let cx=R()*SZ, cy=R()*SZ;
      const b=140+Math.floor(R()*115);
      ctx.strokeStyle=`rgba(${b},${Math.floor(b*0.28)},0,0.92)`;
      ctx.lineWidth=1+R()*3.5; ctx.beginPath(); ctx.moveTo(cx,cy);
      for (let s=0;s<6;s++){cx+=(R()-0.5)*20;cy+=(R()-0.5)*20;ctx.lineTo(cx,cy);}
      ctx.stroke();
    }
    // Hot pools
    blobs(22, 5, 20, i => [25, 100, 35+R()*20], 0.65);
    // Cooling lava (orange glow)
    for (let i = 0; i < 18; i++) {
      const x=R()*SZ,y=R()*SZ,r=6+R()*20;
      const grd=ctx.createRadialGradient(x,y,0,x,y,r);
      grd.addColorStop(0,'rgba(255,200,0,0.55)'); grd.addColorStop(0.5,'rgba(255,80,0,0.3)'); grd.addColorStop(1,'rgba(255,0,0,0)');
      ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    }

  } else if (name === 'Mordor') {
    ctx.fillStyle = '#191008'; ctx.fillRect(0,0,SZ,SZ);
    blobs(75, 10, 35, () => [22+R()*15, 20, 10+R()*14], 0.7);
    cracks(55, 'rgba(5,3,1,0.6)', 0.4, 1.5, 6);
    // Ash puffs
    blobs(35, 4, 18, () => [30, 10, 28+R()*12], 0.22);
    // Faint ember veins
    for (let i = 0; i < 20; i++) {
      let cx=R()*SZ,cy=R()*SZ;
      ctx.strokeStyle=`rgba(${100+Math.floor(R()*60)},${30+Math.floor(R()*20)},0,0.3)`;
      ctx.lineWidth=0.5+R(); ctx.beginPath(); ctx.moveTo(cx,cy);
      for (let s=0;s<5;s++){cx+=(R()-0.5)*18;cy+=(R()-0.5)*18;ctx.lineTo(cx,cy);}
      ctx.stroke();
    }

  } else if (name === 'Doom') {
    ctx.fillStyle = '#0c0005'; ctx.fillRect(0,0,SZ,SZ);
    blobs(55, 10, 30, () => [330+R()*20, 75, 8+R()*10], 0.7);
    // Demonic glowing veins
    for (let i = 0; i < 38; i++) {
      let cx=R()*SZ,cy=R()*SZ;
      const b=90+Math.floor(R()*120);
      ctx.strokeStyle=`rgba(${b},0,${Math.floor(b*0.4)},0.85)`;
      ctx.lineWidth=0.5+R()*2; ctx.beginPath(); ctx.moveTo(cx,cy);
      for (let s=0;s<6;s++){cx+=(R()-0.5)*18;cy+=(R()-0.5)*18;ctx.lineTo(cx,cy);}
      ctx.stroke();
    }
    blobs(28, 5, 18, () => [280, 70, 12+R()*8], 0.35); // purple pools
    // Blood pools
    blobs(18, 4, 16, () => [350, 90, 15+R()*10], 0.6);

  } else if (name === 'Vibe') {
    ctx.fillStyle = '#06001a'; ctx.fillRect(0,0,SZ,SZ);
    // Neon grid lines
    const step = 32;
    ['rgba(0,120,255,0.14)', 'rgba(0,120,255,0.08)'].forEach((col, gi) => {
      ctx.strokeStyle = col; ctx.lineWidth = gi === 0 ? 1 : 0.5;
      for (let x = 0; x < SZ; x += step) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,SZ); ctx.stroke(); }
      for (let y = 0; y < SZ; y += step) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(SZ,y); ctx.stroke(); }
    });
    // Neon glow patches
    const neons = ['255,0,200', '0,255,190', '255,220,0', '120,0,255', '0,180,255', '255,80,0'];
    blobs(50, 8, 28, i => {
      const c = neons[i % neons.length].split(',').map(Number);
      return [Math.round(Math.atan2(c[2]-c[1],c[0])*180/Math.PI+180), 100, 40+R()*20];
    }, 0.4);
    // Scanlines
    for (let y = 0; y < SZ; y += 3) {
      ctx.strokeStyle=`rgba(0,60,200,${0.015+R()*0.025})`; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(SZ,y); ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  return tex;
}

// ─────────────────────────────────────────────
//  BUILD GRID
// ─────────────────────────────────────────────
function buildGrid() {
  const voidMesh = new THREE.Mesh(new THREE.BoxGeometry(500, 0.18, 500), M.voidPlane);
  voidMesh.position.set(35, -0.38, 27);
  voidMesh.receiveShadow = true;
  scene.add(voidMesh);

  for (let c = 0; c < CFG.GRID_W; c++) {
    for (let r = 0; r < CFG.GRID_H; r++) {
      const isCastle = c >= 66 && c <= 71 && r >= 23 && r <= 31;
      const onPath   = !isCastle && PATH_SET.has(`${c},${r}`);
      const type = isCastle ? 'castle' : (onPath ? 'path' : 'grass');
      const mat  = isCastle ? M.castleLight
                 : onPath   ? M.pathMat
                 : M.grassA;
      const m = new THREE.Mesh(GEO.tile, mat);
      m.position.set(c, -0.15, r);
      m.receiveShadow = true;
      m.userData = { col: c, row: r, isTile: true };
      scene.add(m);
      grid[`${c},${r}`] = { type, mesh: m };
    }
  }
}

// ─────────────────────────────────────────────
//  SCENERY — trees, hills, water
// ─────────────────────────────────────────────
const waterSurfaces = []; // for animation
const hillMeshes    = []; // individual meshes placed by buildHill (for Clear All)
const pondCells     = []; // {col, row, origMat} pond tile positions (for Clear All)

function buildTree(x, z, scale = 1.0) {
  const g = new THREE.Group();
  // Roots — 4 small wedge bumps at base
  [[0.18,0],[0,-0.18],[-0.18,0],[0,0.18]].forEach(([rx,rz]) => {
    const root = mesh(box(0.14*scale, 0.12*scale, 0.14*scale), M.treeTrunk);
    root.position.set(rx*scale, 0.06*scale, rz*scale); g.add(root);
  });
  // Trunk — slightly tapered (wider base segment + narrower top segment)
  const trunkBase = mesh(box(0.34*scale, 0.5*scale, 0.34*scale), M.treeTrunk);
  trunkBase.position.y = 0.25*scale; g.add(trunkBase);
  const trunkMid = mesh(box(0.26*scale, 0.55*scale, 0.26*scale), M.treeTrunk);
  trunkMid.position.y = 0.78*scale; g.add(trunkMid);
  // Small branch stubs
  [[0.18*scale,0.6*scale,0],[0,0.65*scale,0.18*scale]].forEach(([bx,by,bz]) => {
    const stub = mesh(box(0.16*scale, 0.08*scale, 0.1*scale), M.treeTrunk);
    stub.position.set(bx,by,bz); g.add(stub);
  });
  // Foliage — 4 overlapping layers for a full canopy
  const f0 = mesh(box(1.05*scale, 0.52*scale, 1.05*scale), M.treeFoliage);
  f0.position.y = 1.1*scale; g.add(f0);
  const f1 = mesh(box(0.88*scale, 0.62*scale, 0.88*scale), M.treeFoliage2);
  f1.position.y = 1.55*scale; g.add(f1);
  const f2 = mesh(box(0.66*scale, 0.60*scale, 0.66*scale), M.treeFoliage);
  f2.position.y = 2.0*scale; g.add(f2);
  const f3 = mesh(box(0.42*scale, 0.52*scale, 0.42*scale), M.treeFoliage2);
  f3.position.y = 2.42*scale; g.add(f3);
  const f4 = mesh(box(0.22*scale, 0.34*scale, 0.22*scale), M.treeFoliage);
  f4.position.y = 2.78*scale; g.add(f4);
  g.position.set(x, 0, z);
  scene.add(g);
  staticObstacles.push({ x, z, r: 0.28 * scale }); // trunk collision radius
  const tc = grid[`${Math.round(x)},${Math.round(z)}`];
  if (tc && tc.type === 'grass') tc.type = 'scenery';
  return g;
}

function buildPine(x, z, scale = 1.0) {
  const g = new THREE.Group();
  const trunk = mesh(box(0.22*scale, 0.7*scale, 0.22*scale), M.pineTrunk);
  trunk.position.y = 0.35*scale; g.add(trunk);
  // 4 conical foliage tiers
  [[1.0, 0.5, 0.9], [0.78, 0.9, 0.72], [0.58, 1.24, 0.56], [0.36, 1.54, 0.36]].forEach(([w, y, h]) => {
    const tier = mesh(box(w*scale, h*scale, w*scale), M.pineFoliage);
    tier.position.y = y*scale; g.add(tier);
  });
  // Snow cap on top
  const snow = mesh(box(0.18*scale, 0.12*scale, 0.18*scale), new THREE.MeshStandardMaterial({ color: 0xeef8ff }));
  snow.position.y = 1.92*scale; g.add(snow);
  g.position.set(x, 0, z);
  scene.add(g);
  staticObstacles.push({ x, z, r: 0.22 * scale });
  const tc = grid[`${Math.round(x)},${Math.round(z)}`];
  if (tc && tc.type === 'grass') tc.type = 'scenery';
  return g;
}

function buildPalm(x, z, scale = 1.0) {
  const g = new THREE.Group();
  // Slightly curved trunk (3 segments leaning)
  [[0, 0.4, 0], [0.06*scale, 1.0, 0], [0.12*scale, 1.65, 0]].forEach(([ox, y, oz]) => {
    const seg = mesh(box(0.22*scale, 0.75*scale, 0.22*scale), M.palmTrunk);
    seg.position.set(ox, y*scale, oz*scale); g.add(seg);
  });
  // Frond cluster at top
  [[1,0],[-1,0],[0,1],[0,-1],[0.7,0.7],[-0.7,0.7],[0.7,-0.7],[-0.7,-0.7]].forEach(([fx,fz]) => {
    const len = 0.55 + Math.random()*0.15;
    const frond = mesh(box(len*scale, 0.06*scale, 0.14*scale), M.palmFrond);
    frond.position.set(0.14*scale + fx*len*0.5*scale, 2.1*scale, fz*len*0.5*scale);
    frond.rotation.y = Math.atan2(fz, fx);
    frond.rotation.z = -0.35;
    g.add(frond);
  });
  // Coconuts
  for (let ci = 0; ci < 3; ci++) {
    const cn = mesh(box(0.1*scale, 0.1*scale, 0.1*scale), M.palmTrunk);
    cn.position.set((ci-1)*0.14*scale, 1.96*scale, (ci%2===0?0.1:-0.1)*scale); g.add(cn);
  }
  g.position.set(x, 0, z);
  scene.add(g);
  staticObstacles.push({ x, z, r: 0.22 * scale });
  const tc = grid[`${Math.round(x)},${Math.round(z)}`];
  if (tc && tc.type === 'grass') tc.type = 'scenery';
  return g;
}

function buildCactus(x, z, scale = 1.0) {
  const g = new THREE.Group();
  // Main column
  const body = mesh(box(0.28*scale, 1.4*scale, 0.28*scale), M.cactus);
  body.position.y = 0.7*scale; g.add(body);
  // Rounded top
  const top = mesh(box(0.22*scale, 0.22*scale, 0.22*scale), M.cactus);
  top.position.y = 1.45*scale; g.add(top);
  // Left arm
  const armLH = mesh(box(0.38*scale, 0.16*scale, 0.18*scale), M.cactus);
  armLH.position.set(-0.32*scale, 0.7*scale, 0); g.add(armLH);
  const armLV = mesh(box(0.16*scale, 0.42*scale, 0.16*scale), M.cactus);
  armLV.position.set(-0.47*scale, 0.98*scale, 0); g.add(armLV);
  // Right arm
  const armRH = mesh(box(0.38*scale, 0.16*scale, 0.18*scale), M.cactus);
  armRH.position.set(0.32*scale, 0.85*scale, 0); g.add(armRH);
  const armRV = mesh(box(0.16*scale, 0.38*scale, 0.16*scale), M.cactus);
  armRV.position.set(0.47*scale, 1.1*scale, 0); g.add(armRV);
  // Spines (tiny white bumps)
  for (let si = 0; si < 8; si++) {
    const s = mesh(box(0.04*scale, 0.04*scale, 0.32*scale), new THREE.MeshStandardMaterial({color:0xeeeedd}));
    s.position.set((Math.cos(si*Math.PI/4))*0.16*scale, (0.3+si*0.15)*scale, (Math.sin(si*Math.PI/4))*0.16*scale);
    g.add(s);
  }
  g.position.set(x, 0, z);
  scene.add(g);
  staticObstacles.push({ x, z, r: 0.24 * scale });
  const tc = grid[`${Math.round(x)},${Math.round(z)}`];
  if (tc && tc.type === 'grass') tc.type = 'scenery';
  return g;
}

function buildDeadTree(x, z, scale = 1.0) {
  const g = new THREE.Group();
  // Main trunk
  const trunk = mesh(box(0.26*scale, 1.5*scale, 0.26*scale), M.deadTrunk);
  trunk.position.y = 0.75*scale; g.add(trunk);
  // Bare branches
  [
    [0.48*scale, 1.1*scale, 0,  0.5, 0, 0.3],
    [-0.44*scale, 1.0*scale, 0, 0.44, 0, -0.35],
    [0.36*scale, 1.35*scale, 0, 0.38, 0.15, 0.2],
    [-0.3*scale, 1.5*scale, 0,  0.32, -0.1, -0.22],
    [0.14*scale, 1.6*scale, 0,  0.26, 0.2, 0.08],
  ].forEach(([bx, by, bz, len, ry, rz]) => {
    const br = mesh(box(len*scale, 0.08*scale, 0.08*scale), M.deadTrunk);
    br.position.set(bx, by, bz);
    br.rotation.y = ry; br.rotation.z = rz;
    g.add(br);
    // Sub-branches
    const sub = mesh(box(len*0.5*scale, 0.05*scale, 0.05*scale), M.deadTrunk);
    sub.position.set(bx + Math.cos(ry)*len*0.35*scale, by + Math.sin(rz+0.3)*0.25*scale, bz);
    sub.rotation.z = rz + 0.4;
    g.add(sub);
  });
  g.position.set(x, 0, z);
  scene.add(g);
  staticObstacles.push({ x, z, r: 0.20 * scale });
  const tc = grid[`${Math.round(x)},${Math.round(z)}`];
  if (tc && tc.type === 'grass') tc.type = 'scenery';
  return g;
}

function buildMushroom(x, z, scale = 1.0) {
  const g = new THREE.Group();
  // Stem
  const stem = mesh(box(0.22*scale, 0.7*scale, 0.22*scale), M.mushStem);
  stem.position.y = 0.35*scale; g.add(stem);
  // Cap underside
  const capU = mesh(box(0.9*scale, 0.12*scale, 0.9*scale), M.mushStem);
  capU.position.y = 0.73*scale; g.add(capU);
  // Cap top
  const cap = mesh(box(1.0*scale, 0.38*scale, 1.0*scale), M.mushCap);
  cap.position.y = 0.98*scale; g.add(cap);
  // White spots on cap
  [[0.25,0.1],[-0.22,0.18],[0.05,-0.25],[-0.1,0.05],[0.3,-0.1]].forEach(([sx,sz]) => {
    const spot = mesh(box(0.14*scale, 0.05*scale, 0.14*scale), M.mushSpot);
    spot.position.set(sx*scale, 1.18*scale, sz*scale); g.add(spot);
  });
  // Small mushrooms at base
  for (let mi = 0; mi < 3; mi++) {
    const ang = mi * Math.PI * 2 / 3;
    const ms = mesh(box(0.10*scale, 0.28*scale, 0.10*scale), M.mushStem);
    ms.position.set(Math.cos(ang)*0.36*scale, 0.14*scale, Math.sin(ang)*0.36*scale); g.add(ms);
    const mc = mesh(box(0.22*scale, 0.14*scale, 0.22*scale), M.mushCap);
    mc.position.set(Math.cos(ang)*0.36*scale, 0.34*scale, Math.sin(ang)*0.36*scale); g.add(mc);
  }
  g.position.set(x, 0, z);
  scene.add(g);
  staticObstacles.push({ x, z, r: 0.22 * scale });
  const tc = grid[`${Math.round(x)},${Math.round(z)}`];
  if (tc && tc.type === 'grass') tc.type = 'scenery';
  return g;
}

function buildHill(c, r, h) {
  // Central cap
  const cap = mesh(box(1.08, h + 0.3, 1.08), M.hillGrass);
  cap.position.set(c, (h + 0.3) * 0.5 - 0.15, r);
  scene.add(cap);
  hillMeshes.push(cap);
  // Sloped neighbors
  [[c-1,r],[c+1,r],[c,r-1],[c,r+1]].forEach(([nc, nr]) => {
    const cell = grid[`${nc},${nr}`];
    if (cell && cell.type === 'grass') {
      const sh = h * 0.45 + 0.15;
      const slope = mesh(box(1.0, sh, 1.0), M.hillDark);
      slope.position.set(nc, sh * 0.5 - 0.15, nr);
      scene.add(slope);
      hillMeshes.push(slope);
    }
  });
}

function buildRock(x, z, scale, rng) {
  const g = new THREE.Group();
  // Main boulder — irregular box, tilted slightly
  const bw = 0.28 + rng() * 0.24, bh = 0.18 + rng() * 0.24, bd = 0.22 + rng() * 0.2;
  const main = mesh(box(bw, bh, bd), M.rockMat);
  main.position.y = bh * 0.5 - 0.04;
  main.rotation.y = rng() * Math.PI;
  main.rotation.z = (rng() - 0.5) * 0.25;
  g.add(main);
  // Second chunk leaning beside it
  if (rng() > 0.3) {
    const w2 = 0.14 + rng() * 0.16, h2 = 0.1 + rng() * 0.15;
    const r2 = mesh(box(w2, h2, w2 * 0.88), M.rockDark);
    r2.position.set((rng() - 0.5) * 0.38, h2 * 0.5 - 0.04, (rng() - 0.5) * 0.32);
    r2.rotation.y = rng() * Math.PI;
    r2.rotation.z = (rng() - 0.5) * 0.3;
    g.add(r2);
  }
  // Third small chunk on top / beside
  if (rng() > 0.55) {
    const w3 = 0.09 + rng() * 0.1, h3 = 0.08 + rng() * 0.1;
    const r3 = mesh(box(w3, h3, w3), M.rockMat);
    r3.position.set((rng() - 0.5) * 0.25, bh * 0.7 + h3 * 0.5, (rng() - 0.5) * 0.2);
    r3.rotation.y = rng() * Math.PI * 2;
    g.add(r3);
  }
  // Scattered pebbles around base
  const pebCount = 2 + Math.floor(rng() * 5);
  for (let i = 0; i < pebCount; i++) {
    const pw = 0.05 + rng() * 0.09, ph = 0.03 + rng() * 0.06;
    const peb = mesh(box(pw, ph, pw * 0.85), M.rockDark);
    peb.position.set((rng() - 0.5) * 0.7, ph * 0.5 - 0.01, (rng() - 0.5) * 0.65);
    peb.rotation.y = rng() * Math.PI * 2;
    g.add(peb);
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  scene.add(g);
  staticObstacles.push({ x, z, r: 0.32 * scale }); // boulder collision radius
  const rc = grid[`${Math.round(x)},${Math.round(z)}`];
  if (rc && rc.type === 'grass') rc.type = 'scenery';
  return g;
}

function buildPond(cells) {
  cells.forEach(([c, r]) => {
    const cell = grid[`${c},${r}`];
    if (!cell) return;
    pondCells.push({ col: c, row: r, origMat: cell.mesh.material });
    cell.mesh.material = M.waterDeep;
    cell.mesh.position.y = -0.22; // sunken
    cell.type = 'water';
  });
  // Per-cell surface
  cells.forEach(([c, r]) => {
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), M.waterSurf.clone());
    surf.rotation.x = -Math.PI / 2;
    surf.position.set(c, -0.06, r);
    surf.receiveShadow = false;
    scene.add(surf);
    waterSurfaces.push({ mesh: surf, baseY: -0.06, phase: c * 0.7 + r * 1.1 });
  });
}

function buildScenery() {
  _biomeTreeSpots.length = 0; // reset on each full scenery build
  // Union of ALL layout paths — these zones are always occupied across layout changes
  const allPathKeys = new Set();
  for (const L of LAYOUT_WAYPOINTS) {
    expandPath(L.a).forEach(([c,r]) => allPathKeys.add(`${c},${r}`));
    expandPath(L.b).forEach(([c,r]) => allPathKeys.add(`${c},${r}`));
    expandPath(L.c).forEach(([c,r]) => allPathKeys.add(`${c},${r}`));
  }
  // Castle zone
  for (let c = 65; c <= 71; c++) for (let r = 22; r <= 32; r++) allPathKeys.add(`${c},${r}`);
  // 1-tile buffer around all path/castle tiles
  const blocked = new Set(allPathKeys);
  allPathKeys.forEach(key => {
    const [c, r] = key.split(',').map(Number);
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) blocked.add(`${c+dc},${r+dr}`);
  });

  let seed = 31337;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967295; };

  const used = new Set();
  function canPlace(c, r, pad) {
    for (let dc = -pad; dc <= pad; dc++) for (let dr = -pad; dr <= pad; dr++) {
      if (c+dc < 0 || c+dc >= CFG.GRID_W || r+dr < 0 || r+dr >= CFG.GRID_H) return false;
      const key = `${c+dc},${r+dr}`;
      if (blocked.has(key) || used.has(key)) return false;
    }
    return true;
  }
  function markUsed(c, r, pad) {
    for (let dc = -pad; dc <= pad; dc++) for (let dr = -pad; dr <= pad; dr++) used.add(`${c+dc},${r+dr}`);
  }

  const _btypes = BIOMES[activeBiomeIdx]?.trees || ['tree'];
  // Small helper — places one biome tree with jitter + stat bookkeeping.
  // Returns true if placed, false if the target cell was blocked.
  function placeTree(c, r, pad = 1, scaleMin = 0.45, scaleRange = 0.7) {
    if (!canPlace(c, r, pad)) return false;
    const scale = scaleMin + rng() * scaleRange;
    const tx = c + rng() * 0.5 - 0.25;
    const tz = r + rng() * 0.5 - 0.25;
    const tType = _btypes[(c * 7 + r * 13) % _btypes.length];
    const tg = _buildBiomeTree(tType, tx, tz, scale);
    _biomeTreeSpots.push({ col: c, row: r, scale, x: tx, z: tz });
    initialScenery.push({ group: tg, col: c, row: r, type: tType });
    const _tc = grid[`${c},${r}`]; if (_tc && _tc.type === 'grass') _tc.type = 'scenery';
    markUsed(c, r, pad);
    return true;
  }

  // ── 1. VILLAGE CENTERS — 2-4 per map, realistic layout ──
  // Each village: a well (or feature building) at center, a ring of smaller houses around it,
  // and a couple of outlying buildings. This feels like a real hamlet instead of random blobs.
  const villageCount = 2 + Math.floor(rng() * 3); // 2-4 villages
  const villageSites = [];
  for (let v = 0; v < villageCount; v++) {
    // Pick a centre cell on the interior with room — try up to 24 times
    let cx = 0, cy = 0, ok = false;
    for (let tries = 0; tries < 24; tries++) {
      cx = 10 + Math.floor(rng() * (CFG.GRID_W - 20));
      cy = 8  + Math.floor(rng() * (CFG.GRID_H - 16));
      // Require a clear 5x5 centre so the village has breathing room
      if (canPlace(cx, cy, 3) &&
          // Space from other villages
          villageSites.every(s => Math.hypot(s.cx - cx, s.cy - cy) > 10)) {
        ok = true; break;
      }
    }
    if (!ok) continue;
    villageSites.push({ cx, cy });
    // Centrepiece: well + 2 larger houses framing it
    if (canPlace(cx, cy, 1)) {
      const wg = buildWell(cx + rng() * 0.3 - 0.15, cy + rng() * 0.3 - 0.15, rng);
      initialScenery.push({ group: wg, col: cx, row: cy, type: 'well' });
      const _wc = grid[`${cx},${cy}`]; if (_wc && _wc.type === 'grass') _wc.type = 'scenery';
      markUsed(cx, cy, 1);
    }
    // Ring of 4-6 houses on a rough 3-tile radius around the well
    const ringHouses = 4 + Math.floor(rng() * 3);
    for (let i = 0; i < ringHouses; i++) {
      const ang = (i / ringHouses) * Math.PI * 2 + rng() * 0.6;
      const rad = 2.6 + rng() * 1.2;
      const bc = Math.round(cx + Math.cos(ang) * rad);
      const br = Math.round(cy + Math.sin(ang) * rad);
      if (!canPlace(bc, br, 1)) continue;
      const bg = buildFantasyBuilding(bc + rng() * 0.3 - 0.15, br + rng() * 0.3 - 0.15, rng);
      initialScenery.push({ group: bg, col: bc, row: br, type: 'building' });
      markUsed(bc, br, 1);
    }
    // 0-2 outlying buildings further away (barn / farmhouse)
    const outliers = Math.floor(rng() * 3);
    for (let i = 0; i < outliers; i++) {
      const ang = rng() * Math.PI * 2;
      const rad = 5 + rng() * 2;
      const bc = Math.round(cx + Math.cos(ang) * rad);
      const br = Math.round(cy + Math.sin(ang) * rad);
      if (!canPlace(bc, br, 1)) continue;
      const bg = buildFantasyBuilding(bc + rng() * 0.3 - 0.15, br + rng() * 0.3 - 0.15, rng);
      initialScenery.push({ group: bg, col: bc, row: br, type: 'building' });
      markUsed(bc, br, 1);
    }
    // Sprinkle 3-5 trees around each village perimeter for a settled, lived-in look
    const villageTrees = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < villageTrees; i++) {
      const ang = rng() * Math.PI * 2;
      const rad = 4 + rng() * 2.5;
      const tc = Math.round(cx + Math.cos(ang) * rad);
      const tr = Math.round(cy + Math.sin(ang) * rad);
      placeTree(tc, tr, 1, 0.55, 0.5);
    }
  }

  // ── 2. FOREST GROVES — organic tree clusters (replaces "salt-and-pepper" uniform scatter) ──
  // Pick 4-6 grove centres, grow an organic cluster by radial density falloff. This creates
  // recognizable forest patches with clear edges — far more natural than uniform random.
  const groveCount = 4 + Math.floor(rng() * 3);
  for (let g = 0; g < groveCount; g++) {
    // Pick a grove centre — biased toward the field interior, away from villages
    let gx = 0, gy = 0, ok = false;
    for (let tries = 0; tries < 20; tries++) {
      gx = 4 + Math.floor(rng() * (CFG.GRID_W - 8));
      gy = 4 + Math.floor(rng() * (CFG.GRID_H - 8));
      if (!blocked.has(`${gx},${gy}`) &&
          villageSites.every(s => Math.hypot(s.cx - gx, s.cy - gy) > 6)) {
        ok = true; break;
      }
    }
    if (!ok) continue;
    // Grow grove: each nearby tile has tree-probability = peak * exp(-dist/radius)
    const radius = 3 + rng() * 2.5; // ~3-5.5 tile radius
    const peak   = 0.75;            // density at centre
    const minC = Math.max(1, Math.floor(gx - radius * 1.4));
    const maxC = Math.min(CFG.GRID_W - 2, Math.ceil(gx + radius * 1.4));
    const minR = Math.max(1, Math.floor(gy - radius * 1.4));
    const maxR = Math.min(CFG.GRID_H - 2, Math.ceil(gy + radius * 1.4));
    for (let c = minC; c <= maxC; c++) {
      for (let r = minR; r <= maxR; r++) {
        const d = Math.hypot(c - gx, r - gy);
        const p = peak * Math.exp(-d / radius);
        if (rng() < p) placeTree(c, r, 1, 0.55, 0.65);
      }
    }
  }

  // ── 3. BORDER FRAMING — denser tree ring around the map edges (forest horizon) ──
  // The outer 2-3 tiles get high tree density, giving the map a "clearing in a forest" feel.
  for (let c = 0; c < CFG.GRID_W; c++) {
    for (let r = 0; r < CFG.GRID_H; r++) {
      const edgeDist = Math.min(c, r, CFG.GRID_W - 1 - c, CFG.GRID_H - 1 - r);
      if (edgeDist > 2) continue; // only outer-3-tile ring
      // Probability decays from 0.55 at the edge to ~0.20 at ring #2
      const p = 0.55 - edgeDist * 0.17;
      if (rng() > p) continue;
      placeTree(c, r, 0, 0.65, 0.6); // pad=0 (allow adjacent trees at border for density)
    }
  }

  // ── 4. INTERIOR FILL TREES — sparse scatter for the open-field feel ──
  // Reduced from 6.5% → 3.5% since groves + borders now provide the bulk of foliage.
  for (let c = 1; c < CFG.GRID_W - 2; c++) {
    for (let r = 1; r < CFG.GRID_H - 2; r++) {
      if (rng() > 0.035) continue;
      placeTree(c, r, 1);
    }
  }

  // ── 5. HILLS — raised bumps in grass strips between roads
  for (let c = 2; c < CFG.GRID_W - 2; c += 2) {
    for (let r = 2; r < CFG.GRID_H - 2; r += 2) {
      if (rng() > 0.22) continue;
      if (!canPlace(c, r, 2)) continue;
      buildHill(c, r, 0.30 + rng() * 0.70);
      markUsed(c, r, 2);
    }
  }

  // ── 6. ROCKS — scattered boulders and clusters across the landscape
  for (let c = 2; c < CFG.GRID_W - 2; c += 2) {
    for (let r = 2; r < CFG.GRID_H - 2; r += 2) {
      if (rng() > 0.14) continue;
      if (!canPlace(c, r, 1)) continue;
      const scale = 0.7 + rng() * 1.4;
      const rg = buildRock(c + rng() * 0.6 - 0.3, r + rng() * 0.6 - 0.3, scale, rng);
      initialScenery.push({ group: rg, col: c, row: r, type: 'rock' });
      const _rc = grid[`${c},${r}`]; if (_rc && _rc.type === 'grass') _rc.type = 'scenery';
      markUsed(c, r, 1);
    }
  }

  // ── 7. WATER PONDS — small lakes in grass areas
  const pondShapes = [
    (c,r) => [[c,r],[c+1,r],[c,r+1],[c+1,r+1]],      // 2×2 square
    (c,r) => [[c,r],[c+1,r],[c+2,r]],                 // horizontal strip
    (c,r) => [[c,r],[c,r+1],[c,r+2]],                 // vertical strip
    (c,r) => [[c,r],[c+1,r],[c+1,r+1],[c+2,r+1]],     // S-shape
    (c,r) => [[c,r],[c,r+1],[c+1,r+1]],               // L-corner
    (c,r) => [[c,r],[c+1,r],[c+2,r],[c+1,r+1]],       // T-shape
  ];
  for (let c = 3; c < CFG.GRID_W - 5; c += 4) {
    for (let r = 3; r < CFG.GRID_H - 5; r += 4) {
      if (rng() > 0.14) continue;
      const shapeFn = pondShapes[Math.floor(rng() * pondShapes.length)];
      const cells = shapeFn(c, r);
      const valid = cells.every(([sc,sr]) =>
        sc >= 0 && sc < CFG.GRID_W && sr >= 0 && sr < CFG.GRID_H &&
        !blocked.has(`${sc},${sr}`) && !used.has(`${sc},${sr}`)
      );
      if (valid) {
        buildPond(cells);
        cells.forEach(([sc,sr]) => markUsed(sc, sr, 1));
      }
    }
  }

  // ── 8. OUTLYING BUILDINGS — a few extra farmsteads scattered outside villages ──
  // Keeps the world from feeling empty between villages; lower rate than the original
  // scattered-buildings pass since villages now provide the main built-up feel.
  for (let c = 6; c < CFG.GRID_W - 6; c += 10) {
    for (let r = 6; r < CFG.GRID_H - 6; r += 10) {
      if (rng() > 0.30) continue;
      if (!canPlace(c, r, 2)) continue;
      const bg = buildFantasyBuilding(c + rng() * 0.5 - 0.25, r + rng() * 0.5 - 0.25, rng);
      initialScenery.push({ group: bg, col: c, row: r, type: 'building' });
      markUsed(c, r, 2);
      // 50% chance of a companion tree right next to the farmstead (trees flanking houses)
      if (rng() < 0.6) {
        for (const [dc, dr] of [[2,0],[-2,0],[0,2],[0,-2]]) {
          if (placeTree(c + dc, r + dr, 1, 0.6, 0.4)) break;
        }
      }
    }
  }
}

// ─────────────────────────────────────────────
//  SKY — stars + moon
// ─────────────────────────────────────────────
function buildSky() {
  const starCount = 500;
  const pos = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    pos[i * 3]     = (Math.random() - 0.5) * 380;
    pos[i * 3 + 1] = 60 + Math.random() * 110;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 380;
    sizes[i] = 0.3 + Math.random() * 0.55;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  const starMat = new THREE.PointsMaterial({ color: 0xddeeff, size: 0.55, sizeAttenuation: true, transparent: true, opacity: 0.8 });
  scene.add(new THREE.Points(starGeo, starMat));

  // Moon sphere
  const moonMat = new THREE.MeshStandardMaterial({ color: 0xc8d8e8, emissive: 0xaabbcc, emissiveIntensity: 0.9, roughness: 1.0, metalness: 0.0, flatShading: true });
  const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(6, 1), moonMat);
  moon.position.set(-90, 130, -80);
  scene.add(moon);

  const moonLight = new THREE.DirectionalLight(0xaabbdd, 0.25);
  moonLight.position.set(-90, 130, -80);
  scene.add(moonLight);
}

// ─────────────────────────────────────────────
//  PATH LANTERNS
// ─────────────────────────────────────────────
function makeLanternMesh() {
  const g = new THREE.Group();
  // Base plate + post
  const baseFlare = mesh(box(0.13, 0.05, 0.13), M.lanternPost); baseFlare.position.y = 0.025; g.add(baseFlare);
  const post = mesh(box(0.052, 1.08, 0.052), M.lanternPost); post.position.y = 0.57; g.add(post);
  // Mid-post decorative ring
  const postRing = mesh(box(0.09, 0.04, 0.09), M.lanternPost); postRing.position.y = 0.55; g.add(postRing);
  // Horizontal arm with elbow
  const armH = mesh(box(0.04, 0.04, 0.34), M.lanternPost); armH.position.set(0, 1.07, 0.17); g.add(armH);
  const elbow = mesh(box(0.07, 0.07, 0.07), M.lanternPost); elbow.position.set(0, 1.07, 0.35); g.add(elbow);
  const armDrop = mesh(box(0.04, 0.12, 0.04), M.lanternPost); armDrop.position.set(0, 1.0, 0.35); g.add(armDrop);
  // Chain links (4 small boxes hanging from arm to cage)
  for (let ci = 0; ci < 4; ci++) {
    const link = mesh(box(0.025, 0.03, 0.025), M.lanternPost);
    link.position.set(0, 0.925 - ci * 0.025, 0.35); g.add(link);
  }
  // Cage frame — 4 thin vertical corner posts
  [[ 0.08, 0.08],[ 0.08,-0.08],[-0.08, 0.08],[-0.08,-0.08]].forEach(([cx,cz]) => {
    const bar = mesh(box(0.025, 0.28, 0.025), M.lanternPost); bar.position.set(cx, 0.82, 0.35 + cz); g.add(bar);
  });
  // 4 glass pane sides (translucent glow colour)
  const gpMat = new THREE.MeshStandardMaterial({ color: 0xffee88, emissive: 0xffaa22, emissiveIntensity: 1.6, transparent: true, opacity: 0.55, depthWrite: false });
  [[0, 0.08],[0,-0.08],[0.08,0],[-0.08,0]].forEach(([gx,gz]) => {
    const gp = new THREE.Mesh(box(gz !== 0 ? 0.16 : 0.01, 0.22, gx !== 0 ? 0.16 : 0.01), gpMat);
    gp.position.set(gx, 0.82, 0.35 + gz); gp.castShadow = false; g.add(gp);
  });
  // Inner flame glow core
  const glow = mesh(box(0.09, 0.14, 0.09), M.lanternGlow); glow.position.set(0, 0.82, 0.35); g.add(glow);
  // Cage cap — larger flat plate
  const cap = mesh(box(0.22, 0.05, 0.22), M.lanternPost); cap.position.set(0, 0.975, 0.35); g.add(cap);
  // Finial spike atop cap
  const finA = mesh(box(0.06, 0.05, 0.06), M.lanternPost); finA.position.set(0, 1.01, 0.35); g.add(finA);
  const finB = mesh(box(0.03, 0.1, 0.03), M.lanternPost); finB.position.set(0, 1.065, 0.35); g.add(finB);
  return g;
}

function buildPathLanterns() {
  // Remove old lanterns + lights
  for (let i = lanternGroup.children.length - 1; i >= 0; i--) {
    disposeGroup(lanternGroup.children[i]);
    lanternGroup.remove(lanternGroup.children[i]);
  }
  lanternLights.length = 0;
  // Remove old lantern collision obstacles so they don't accumulate on layout changes
  for (let i = staticObstacles.length - 1; i >= 0; i--) {
    if (staticObstacles[i].isLantern) staticObstacles.splice(i, 1);
  }
  PATHS.forEach((path, pi) => {
    for (let i = 5; i < path.length - 2; i += 9) {
      const [c, r]   = path[i];
      const [nc, nr] = path[Math.min(i + 1, path.length - 1)];
      const fwdX = nc - c, fwdZ = nr - r;
      const len = Math.sqrt(fwdX * fwdX + fwdZ * fwdZ) || 1;
      const perpX = -fwdZ / len, perpZ = fwdX / len;
      const preferredSide = ((Math.floor(i / 9) + pi) % 2 === 0) ? 1 : -1;

      // Pick the side whose grid cell is NOT a path tile.
      // At corners the perpendicular can point back along the path, landing on a path tile.
      const OFFSET = 0.9; // slightly beyond tile boundary so the post sits clearly on grass
      let chosenSide = null;
      for (const s of [preferredSide, -preferredSide]) {
        const lx = Math.round(c + perpX * s * OFFSET);
        const lz = Math.round(r + perpZ * s * OFFSET);
        if (!PATH_SET.has(`${lx},${lz}`)) { chosenSide = s; break; }
      }
      if (chosenSide === null) continue; // both adjacent cells are path — skip this lantern

      const side = chosenSide;
      const lamp = makeLanternMesh();
      lamp.position.set(c + perpX * side * OFFSET, 0, r + perpZ * side * OFFSET);
      lamp.rotation.y = Math.atan2(-(perpX * side), -(perpZ * side));
      // Point light inside lantern cage
      const ptLight = new THREE.PointLight(0xffaa22, 1.1, 6.0);
      ptLight.position.set(0, 0.88, 0.38);
      lamp.add(ptLight);
      lanternLights.push(ptLight);
      lanternGroup.add(lamp);
      // Block the adjacent grass tile from defender placement
      const _lc = Math.round(c + perpX * side * OFFSET);
      const _lr = Math.round(r + perpZ * side * OFFSET);
      const _ltile = grid[`${_lc},${_lr}`];
      if (_ltile && _ltile.type === 'grass') _ltile.type = 'scenery';
      // Post collision so units can't walk through
      staticObstacles.push({ x: lamp.position.x, z: lamp.position.z, r: 0.18, isLantern: true });
    }
  });
}

// ─────────────────────────────────────────────
//  MEDIEVAL BUILDINGS — 7 sub-classes
// ─────────────────────────────────────────────

// Shared helper: half-timber facade — stone base, plaster+beam upper, applied to FRONT face at z=dz
function _mbTimberFront(g, w, h, dz, baseH, rng) {
  // Corner posts full height
  [-w * 0.5, w * 0.5].forEach(px => {
    const post = mesh(box(0.065, h, 0.065), M.townBeam);
    post.position.set(px, h / 2, dz); g.add(post);
  });
  // Horizontal rails at baseH and near top
  [baseH + 0.02, h - 0.07].forEach(ry => {
    const rail = mesh(box(w + 0.06, 0.065, 0.065), M.townBeam);
    rail.position.set(0, ry, dz); g.add(rail);
  });
  // Diagonal braces (X) in plaster zone
  const uH = h - baseH;
  const diagLen = Math.sqrt((w * 0.44) ** 2 + (uH * 0.46) ** 2);
  [-1, 1].forEach(side => {
    const br = mesh(box(diagLen, 0.055, 0.055), M.townBeam);
    br.position.set(0, baseH + uH * 0.5, dz);
    br.rotation.z = Math.atan2(uH * 0.46, w * 0.44) * side;
    g.add(br);
  });
}

// ── 1. Medieval Cottage ─────────────────────────────────────────────────────
function _mbCottage(g, rng) {
  const w = 1.0 + rng() * 0.28, d = 0.72 + rng() * 0.22, h = 0.92 + rng() * 0.28;
  const baseH = 0.28;

  // Stone foundation + lower wall
  const found = mesh(box(w + 0.1, 0.12, d + 0.1), M.townStoneD); found.position.y = 0.06; g.add(found);
  const swall = mesh(box(w, baseH, d), M.townStone); swall.position.y = 0.12 + baseH / 2; g.add(swall);
  // Plaster upper wall
  const uH = h - 0.12 - baseH;
  const uwall = mesh(box(w, uH, d), M.townPlaster); uwall.position.y = 0.12 + baseH + uH / 2; g.add(uwall);

  // Half-timber: corner posts + rails + diagonals on all 4 faces
  [[d / 2, 1], [-d / 2, -1]].forEach(([dz]) => {
    _mbTimberFront(g, w, h, dz, 0.12 + baseH, rng);
  });
  // Side rails
  [d / 2, -d / 2].forEach(pz => {
    [-w / 2, w / 2].forEach(px => {
      const pr = mesh(box(0.065, h, 0.065), M.townBeam); pr.position.set(px, h / 2, pz); g.add(pr);
    });
  });
  [0.12 + baseH, h - 0.07].forEach(ry => {
    const s = mesh(box(0.065, 0.065, d + 0.06), M.townBeam); s.position.set(-w / 2, ry, 0); g.add(s);
    const s2 = mesh(box(0.065, 0.065, d + 0.06), M.townBeam); s2.position.set(w / 2, ry, 0); g.add(s2);
  });

  // Steep thatched roof (4 stepped slabs)
  for (let s = 0; s < 5; s++) {
    const t = 1 - s / 5;
    const sl = mesh(box(w * t * 1.3, 0.15, d * t * 1.3), M.townThatch);
    sl.position.y = h + s * 0.15; g.add(sl);
  }
  // Ridge
  const ridge = mesh(box(0.12, 0.10, d * 0.18), M.townThatchD); ridge.position.y = h + 5 * 0.15 - 0.02; g.add(ridge);

  // Chimney (stone, offset)
  const chX = w * (rng() > 0.5 ? 0.28 : -0.28);
  const chH = 0.42 + rng() * 0.22;
  const ch = mesh(box(0.22, h + chH, 0.22), M.townStone); ch.position.set(chX, (h + chH) / 2, 0); g.add(ch);
  const chTop = mesh(box(0.26, 0.07, 0.26), M.townStone); chTop.position.set(chX, h + chH, 0); g.add(chTop);
  const chPot = mesh(box(0.11, 0.14, 0.11), M.townStoneD); chPot.position.set(chX, h + chH + 0.10, 0); g.add(chPot);

  // Front windows with wooden surrounds
  const wY = 0.12 + baseH + uH * 0.52;
  [w * 0.26, w > 1.0 ? -w * 0.26 : null].filter(Boolean).forEach(wx => {
    const win = mesh(box(0.21, 0.25, 0.06), M.townWin); win.position.set(wx, wY, d / 2 + 0.02); g.add(win);
    // Wooden surround
    const wBot = mesh(box(0.26, 0.055, 0.065), M.townBeam); wBot.position.set(wx, wY - 0.15, d / 2 + 0.02); g.add(wBot);
    const wTop = mesh(box(0.26, 0.055, 0.065), M.townBeam); wTop.position.set(wx, wY + 0.15, d / 2 + 0.02); g.add(wTop);
    const wL = mesh(box(0.055, 0.26, 0.065), M.townBeam); wL.position.set(wx - 0.13, wY, d / 2 + 0.02); g.add(wL);
    const wR = mesh(box(0.055, 0.26, 0.065), M.townBeam); wR.position.set(wx + 0.13, wY, d / 2 + 0.02); g.add(wR);
  });

  // Door + stone arch lintel
  const dW = 0.27, dH = 0.44;
  const door = mesh(box(dW, dH, 0.06), M.townDoor); door.position.set(0, dH / 2, d / 2 + 0.02); g.add(door);
  [0.10, 0.30].forEach(dy => { const band = mesh(box(dW + 0.02, 0.04, 0.07), M.townIron); band.position.set(0, dy, d / 2 + 0.03); g.add(band); });
  const arch = mesh(box(dW + 0.10, 0.11, 0.08), M.townStone); arch.position.set(0, dH + 0.055, d / 2 + 0.02); g.add(arch);
  // Step stone
  const step = mesh(box(0.36, 0.07, 0.18), M.townStoneD); step.position.set(0, 0.035, d / 2 + 0.12); g.add(step);
}

// ── 2. Farmhouse ────────────────────────────────────────────────────────────
function _mbFarmhouse(g, rng) {
  const w = 1.35 + rng() * 0.25, d = 1.0 + rng() * 0.2, h = 0.82 + rng() * 0.18;

  // Stone base
  const found = mesh(box(w + 0.12, 0.13, d + 0.12), M.townStoneD); found.position.y = 0.065; g.add(found);
  const swall = mesh(box(w, 0.30, d), M.townStone); swall.position.y = 0.13 + 0.15; g.add(swall);
  // Plank upper walls
  const uH = h - 0.13 - 0.30;
  const plank = mesh(box(w, uH, d), M.townPlanks); plank.position.y = 0.43 + uH / 2; g.add(plank);

  // Thick timber corner posts + horizontal beams (barn framing)
  [-w / 2, w / 2].forEach(px => {
    const post = mesh(box(0.09, h + 0.12, 0.09), M.townBeam); post.position.set(px, (h + 0.12) / 2, 0); g.add(post);
  });
  [0.42, h - 0.06].forEach(ry => {
    const bm = mesh(box(w + 0.10, 0.08, 0.08), M.townBeam); bm.position.set(0, ry, d / 2 + 0.01); g.add(bm);
    const bmB = mesh(box(w + 0.10, 0.08, 0.08), M.townBeam); bmB.position.set(0, ry, -d / 2 - 0.01); g.add(bmB);
  });
  // King post truss front (V brace)
  [[w * 0.3, 0.42, -0.42], [-w * 0.3, 0.42, 0.42]].forEach(([dx, dy, dz]) => {
    const bLen = Math.sqrt(dx * dx + (h - 0.42) * 0.36 * (h - 0.42) * 0.36) + 0.1;
    const br = mesh(box(bLen, 0.07, 0.07), M.townBeam);
    br.position.set(dx / 2, 0.42 + (h - 0.42) * 0.18, d / 2 + 0.02);
    br.rotation.z = Math.atan2((h - 0.42) * 0.36, dx) * (dx > 0 ? -1 : 1);
    g.add(br);
  });

  // Low wide thatched roof with overhang
  for (let s = 0; s < 3; s++) {
    const t = 1 - s / 3;
    const sl = mesh(box(w * t * 1.32, 0.18, d * t * 1.32), M.townThatch); sl.position.y = h + s * 0.18; g.add(sl);
  }
  const ridge2 = mesh(box(w * 0.14, 0.10, d * 0.3), M.townThatchD); ridge2.position.y = h + 3 * 0.18 - 0.02; g.add(ridge2);

  // Wide barn doors (double)
  const dH = 0.52, dW = 0.52;
  [-dW / 2, dW / 2].forEach((dx, i) => {
    const door = mesh(box(dW, dH, 0.065), M.townPlanks); door.position.set(dx, dH / 2, d / 2 + 0.02); g.add(door);
    const iron = mesh(box(0.04, dH + 0.04, 0.075), M.townIron); iron.position.set(dx + (i === 0 ? dW / 2 - 0.02 : -dW / 2 + 0.02), dH / 2, d / 2 + 0.03); g.add(iron);
  });
  const lintel = mesh(box(dW * 2.1, 0.10, 0.08), M.townBeam); lintel.position.set(0, dH + 0.05, d / 2 + 0.02); g.add(lintel);

  // Small window (side)
  const win = mesh(box(0.24, 0.20, 0.06), M.townWin); win.position.set(w * 0.32, 0.43 + uH * 0.5, d / 2 + 0.02); g.add(win);

  // Hay bales (outside)
  [[w * 0.52 + 0.15, 0.14, d / 2 + 0.22], [w * 0.52 + 0.15, 0.14, d / 2 + 0.46]].forEach(([hx, hy, hz]) => {
    const hay = mesh(box(0.28, 0.28, 0.28), M.townThatch); hay.position.set(hx, hy, hz); g.add(hay);
    const band = mesh(box(0.30, 0.055, 0.06), M.townBeam); band.position.set(hx, hy + 0.04, hz); g.add(band);
  });

  // Fence posts (3 along side)
  for (let fi = 0; fi < 3; fi++) {
    const fp = mesh(box(0.06, 0.36, 0.06), M.townBeam); fp.position.set(-w / 2 - 0.06, 0.18, -d / 2 + fi * 0.34); g.add(fp);
  }
  const fence = mesh(box(0.05, 0.06, d * 0.55), M.townBeam); fence.position.set(-w / 2 - 0.06, 0.26, -d / 4); g.add(fence);
}

// ── 3. Windmill ─────────────────────────────────────────────────────────────
function _mbWindmill(g, rng) {
  const tR = 0.56 + rng() * 0.14, h = 2.2 + rng() * 0.7;

  // Tapered stone tower (3 sections, each narrower)
  const sections = [[1.0, 0.0, 0.38], [0.88, 0.38, 0.36], [0.76, 0.74, 0.26]];
  sections.forEach(([scale, yStart, yLen]) => {
    const sec = mesh(box(tR * 2 * scale, h * yLen, tR * 2 * scale), M.townStone);
    sec.position.y = h * yStart + h * yLen / 2; g.add(sec);
  });

  // Stone quoins (corner highlights)
  for (let qi = 0; qi < 4; qi++) {
    const ang = qi * Math.PI / 2 + Math.PI / 4;
    const qx = Math.cos(ang) * tR * 0.95, qz = Math.sin(ang) * tR * 0.95;
    const quoin = mesh(box(0.10, h * 0.62, 0.10), M.townStoneD); quoin.position.set(qx, h * 0.31, qz); g.add(quoin);
  }

  // Wooden cap ring + thatched cone
  const capRing = mesh(box(tR * 2.1, 0.15, tR * 2.1), M.townBeam); capRing.position.y = h + 0.04; g.add(capRing);
  for (let s = 0; s < 6; s++) {
    const t = 1 - s / 6;
    const sl = mesh(box(tR * 1.85 * t, 0.14, tR * 1.85 * t), M.townThatch); sl.position.y = h + 0.15 + s * 0.14; g.add(sl);
  }

  // Door arch + stone lintel
  const door = mesh(box(0.28, 0.46, 0.07), M.townDoor); door.position.set(0, 0.23, tR + 0.02); g.add(door);
  const lintel = mesh(box(0.36, 0.12, 0.08), M.townStone); lintel.position.set(0, 0.52, tR + 0.02); g.add(lintel);

  // Arrow-slit windows (3 up the tower)
  for (let wi = 0; wi < 3; wi++) {
    const wY = h * (0.25 + wi * 0.22);
    const slit = mesh(box(0.09, 0.30, 0.07), M.townWin); slit.position.set(0, wY, tR * 0.76 + 0.01); g.add(slit);
  }

  // Sail hub + 4 large wooden blades
  const hubY = h * 0.62;
  const hub = mesh(box(0.18, 0.18, 0.18), M.townIron); hub.position.set(0, hubY, tR * 0.76 + 0.12); g.add(hub);
  const sailLen = 1.05 + rng() * 0.28;
  const sailAngle = rng() * Math.PI / 4;
  for (let ai = 0; ai < 4; ai++) {
    const ang = ai * Math.PI / 2 + sailAngle;
    // Shaft
    const shaft = mesh(box(0.075, sailLen * 1.1, 0.075), M.townBeam);
    shaft.position.set(0, hubY, tR * 0.76 + 0.10); shaft.rotation.z = ang; g.add(shaft);
    // Sail planks (3 per blade)
    for (let pi = 0; pi < 3; pi++) {
      const sailPlank = mesh(box(0.14, sailLen * 0.78, 0.04), M.townPlanks);
      sailPlank.position.set((pi - 1) * 0.16, hubY, tR * 0.76 + 0.14);
      sailPlank.rotation.z = ang; g.add(sailPlank);
    }
    // Cross brace
    const cross = mesh(box(sailLen * 0.55, 0.055, 0.055), M.townBeam);
    cross.position.set(0, hubY, tR * 0.76 + 0.10); cross.rotation.z = ang + Math.PI / 4; g.add(cross);
  }

  // Wooden platform at base
  const plat = mesh(box(tR * 2.3, 0.10, tR * 2.3), M.townPlanks); plat.position.y = 0.05; g.add(plat);
}

// ── 4. Blacksmith ────────────────────────────────────────────────────────────
function _mbBlacksmith(g, rng) {
  const w = 1.2 + rng() * 0.25, d = 0.92 + rng() * 0.2, h = 0.76 + rng() * 0.22;

  // All-stone walls
  const found = mesh(box(w + 0.12, 0.14, d + 0.12), M.townStoneD); found.position.y = 0.07; g.add(found);
  const walls = mesh(box(w, h, d), M.townStone); walls.position.y = 0.14 + h / 2; g.add(walls);

  // Exposed timber header + corner braces
  [-w / 2, w / 2].forEach(px => {
    const post = mesh(box(0.10, h + 0.14, 0.10), M.townBeam); post.position.set(px, (h + 0.14) / 2, 0); g.add(post);
  });
  const header = mesh(box(w + 0.10, 0.10, 0.10), M.townBeam); header.position.set(0, h + 0.09, d / 2); g.add(header);

  // Low thatch roof with wide overhang
  for (let s = 0; s < 3; s++) {
    const t = 1 - s / 3;
    const sl = mesh(box(w * t * 1.38, 0.16, d * t * 1.38), M.townThatch); sl.position.y = h + 0.14 + s * 0.16; g.add(sl);
  }

  // Thick stone chimney (left side) with glowing forge mouth
  const chH = 0.65 + rng() * 0.3;
  const ch = mesh(box(0.30, h + 0.14 + chH, 0.30), M.townStone); ch.position.set(-w * 0.30, (h + 0.14 + chH) / 2, 0); g.add(ch);
  const chCap = mesh(box(0.36, 0.08, 0.36), M.townStoneD); chCap.position.set(-w * 0.30, h + 0.14 + chH, 0); g.add(chCap);
  const glow = mesh(box(0.12, 0.10, 0.32), M.townForge); glow.position.set(-w * 0.30, 0.18, 0); g.add(glow);

  // Wide double door
  const dH = 0.56, dW = 0.28;
  [-dW / 2, dW / 2].forEach((dx, i) => {
    const door = mesh(box(dW, dH, 0.07), M.townDoor); door.position.set(dx, dH / 2 + 0.14, d / 2 + 0.02); g.add(door);
    const strap = mesh(box(dW + 0.02, 0.05, 0.08), M.townIron); strap.position.set(dx, 0.22 + 0.14, d / 2 + 0.03); g.add(strap);
    const strap2 = mesh(box(dW + 0.02, 0.05, 0.08), M.townIron); strap2.position.set(dx, 0.50 + 0.14, d / 2 + 0.03); g.add(strap2);
  });
  const lintel2 = mesh(box(dW * 2 + 0.14, 0.12, 0.10), M.townBeam); lintel2.position.set(0, dH + 0.21, d / 2 + 0.02); g.add(lintel2);

  // Window with iron bars
  const win = mesh(box(0.22, 0.20, 0.06), M.townWin); win.position.set(w * 0.32, 0.14 + h * 0.62, d / 2 + 0.02); g.add(win);
  for (let bi = -1; bi <= 1; bi++) {
    const bar = mesh(box(0.04, 0.22, 0.07), M.townIron); bar.position.set(w * 0.32 + bi * 0.07, 0.14 + h * 0.62, d / 2 + 0.02); g.add(bar);
  }

  // Anvil + tools outside
  const aBase = mesh(box(0.22, 0.09, 0.16), M.townIron); aBase.position.set(w * 0.45, 0.045 + 0.14, d / 2 + 0.26); g.add(aBase);
  const aTop = mesh(box(0.18, 0.08, 0.13), M.townIron); aTop.position.set(w * 0.45, 0.17 + 0.14, d / 2 + 0.26); g.add(aTop);
  const aHorn = mesh(box(0.10, 0.06, 0.08), M.townMetal); aHorn.position.set(w * 0.45 + 0.12, 0.15 + 0.14, d / 2 + 0.26); g.add(aHorn);
  const aStump = mesh(box(0.20, 0.18, 0.20), M.townBeam); aStump.position.set(w * 0.45, 0.09 + 0.14, d / 2 + 0.26); g.add(aStump);
  // Barrel
  const barrel = mesh(box(0.18, 0.24, 0.18), M.townBeam); barrel.position.set(-w * 0.44, 0.12 + 0.14, d / 2 + 0.20); g.add(barrel);
  const bTop = mesh(box(0.20, 0.04, 0.20), M.townStoneD); bTop.position.set(-w * 0.44, 0.26 + 0.14, d / 2 + 0.20); g.add(bTop);
}

// ── 5. Tavern / Inn ──────────────────────────────────────────────────────────
function _mbTavern(g, rng) {
  const w = 1.1 + rng() * 0.3, d = 0.82 + rng() * 0.25;
  const h1 = 0.72, h2 = 0.68 + rng() * 0.2; // floor heights

  // Ground floor stone
  const found = mesh(box(w + 0.10, 0.13, d + 0.10), M.townStoneD); found.position.y = 0.065; g.add(found);
  const gf = mesh(box(w, h1, d), M.townStone); gf.position.y = 0.13 + h1 / 2; g.add(gf);

  // Floor divider beam
  const div = mesh(box(w + 0.22, 0.10, d + 0.22), M.townBeam); div.position.y = 0.13 + h1; g.add(div);

  // Upper floor timber-frame (overhangs by 0.10 each side)
  const ow = w + 0.20, od = d + 0.20;
  const uf = mesh(box(ow, h2, od), M.townPlaster); uf.position.y = 0.13 + h1 + h2 / 2 + 0.10; g.add(uf);

  // Upper half-timber
  const uBase = 0.13 + h1 + 0.10;
  _mbTimberFront(g, ow, uBase + h2, d / 2 + 0.12, uBase, rng);
  [-w / 2 - 0.10, w / 2 + 0.10].forEach(px => {
    const post = mesh(box(0.07, 0.13 + h1 + h2 + 0.14, 0.07), M.townBeam);
    post.position.set(px, (0.13 + h1 + h2 + 0.14) / 2, 0); g.add(post);
  });

  // Steep tiled roof
  for (let s = 0; s < 5; s++) {
    const t = 1 - s / 5;
    const sl = mesh(box(ow * t * 1.18, 0.14, od * t * 1.18), M.townTileR);
    sl.position.y = 0.13 + h1 + h2 + 0.10 + s * 0.14; g.add(sl);
  }

  // Chimney
  const chH = 0.38 + rng() * 0.18;
  const chBase = 0.13 + h1 + h2 + 0.10;
  const tch = mesh(box(0.20, chBase + chH, 0.20), M.townStone); tch.position.set(w * 0.28, (chBase + chH) / 2, 0); g.add(tch);
  const tchCap = mesh(box(0.24, 0.07, 0.24), M.townStoneD); tchCap.position.set(w * 0.28, chBase + chH, 0); g.add(tchCap);

  // Ground floor windows (2) + door
  const gWY = 0.13 + h1 * 0.55;
  [-w * 0.28, w * 0.28].forEach(wx => {
    const win = mesh(box(0.22, 0.28, 0.06), M.townWin); win.position.set(wx, gWY, d / 2 + 0.02); g.add(win);
    const wBotF = mesh(box(0.26, 0.055, 0.065), M.townBeam); wBotF.position.set(wx, gWY - 0.17, d / 2 + 0.02); g.add(wBotF);
    const wTopF = mesh(box(0.26, 0.055, 0.065), M.townBeam); wTopF.position.set(wx, gWY + 0.17, d / 2 + 0.02); g.add(wTopF);
  });
  const door = mesh(box(0.28, 0.52, 0.07), M.townDoor); door.position.set(0, 0.26 + 0.13, d / 2 + 0.02); g.add(door);
  const dArch = mesh(box(0.36, 0.13, 0.08), M.townStone); dArch.position.set(0, 0.65 + 0.13, d / 2 + 0.02); g.add(dArch);

  // Upper floor windows (3)
  const uWY = 0.13 + h1 + 0.10 + h2 * 0.52;
  [-w * 0.34, 0, w * 0.34].forEach(wx => {
    const uWin = mesh(box(0.20, 0.26, 0.06), M.townWin); uWin.position.set(wx, uWY, od / 2 + 0.02); g.add(uWin);
    const uWF = mesh(box(0.24, 0.055, 0.065), M.townBeam); uWF.position.set(wx, uWY - 0.15, od / 2 + 0.02); g.add(uWF);
  });

  // Hanging inn sign
  const bracket = mesh(box(0.055, 0.38, 0.055), M.townBeam); bracket.position.set(w * 0.44, 0.13 + h1 + 0.30, d / 2 + 0.16); g.add(bracket);
  const arm = mesh(box(0.055, 0.055, 0.30), M.townBeam); arm.position.set(w * 0.44, 0.13 + h1 + 0.44, d / 2 + 0.16); g.add(arm);
  const sign = mesh(box(0.38, 0.18, 0.06), M.townSign); sign.position.set(w * 0.44, 0.13 + h1 + 0.26, d / 2 + 0.30); g.add(sign);

  // Step + barrels by door
  const step2 = mesh(box(0.38, 0.07, 0.16), M.townStoneD); step2.position.set(0, 0.035, d / 2 + 0.12); g.add(step2);
  [[-w * 0.46, 0.14, d / 2 + 0.18], [w * 0.46, 0.14, d / 2 + 0.18]].forEach(([bx, by, bz]) => {
    const bar2 = mesh(box(0.17, 0.26, 0.17), M.townBeam); bar2.position.set(bx, by, bz); g.add(bar2);
    const bLid = mesh(box(0.19, 0.04, 0.19), M.townStoneD); bLid.position.set(bx, by + 0.15, bz); g.add(bLid);
  });
}

// ── 6. Stone Chapel ──────────────────────────────────────────────────────────
function _mbChapel(g, rng) {
  const w = 0.72 + rng() * 0.14, d = 1.05 + rng() * 0.25, h = 1.15 + rng() * 0.35;

  // Stone nave
  const found = mesh(box(w + 0.10, 0.14, d + 0.10), M.townStoneD); found.position.y = 0.07; g.add(found);
  const nave = mesh(box(w, h, d), M.townStone); nave.position.y = 0.14 + h / 2; g.add(nave);
  // Quoins
  [[w / 2, d / 2], [-w / 2, d / 2], [w / 2, -d / 2], [-w / 2, -d / 2]].forEach(([px, pz]) => {
    const q = mesh(box(0.10, h + 0.14, 0.10), M.townStoneD); q.position.set(px, (h + 0.14) / 2, pz); g.add(q);
  });

  // Steep pointed roof (tiled)
  for (let s = 0; s < 6; s++) {
    const t = 1 - s / 6;
    const sl = mesh(box(w * t * 1.20, 0.14, d * t * 1.20), M.townTileR);
    sl.position.y = h + 0.14 + s * 0.14; g.add(sl);
  }

  // Bell tower (front-center, narrower)
  const btW = w * 0.56, btH = 0.52 + rng() * 0.18;
  const btBase = h + 0.14;
  const btower = mesh(box(btW, btH, btW), M.townStone); btower.position.set(0, btBase + btH / 2, d / 2 - btW * 0.45); g.add(btower);
  // Bell tower arched opening
  const bell = mesh(box(btW * 0.45, btH * 0.5, 0.06), M.townWin); bell.position.set(0, btBase + btH * 0.6, d / 2 - btW * 0.45 + btW / 2); g.add(bell);
  // Bell tower roof
  for (let s = 0; s < 4; s++) {
    const t = 1 - s / 4;
    const bl = mesh(box(btW * t * 1.12, 0.12, btW * t * 1.12), M.townTileR);
    bl.position.set(0, btBase + btH + s * 0.12, d / 2 - btW * 0.45); g.add(bl);
  }

  // Cross on main peak
  const peakY = h + 0.14 + 6 * 0.14;
  const cV = mesh(box(0.06, 0.32, 0.06), M.townBeam); cV.position.set(0, peakY + 0.16, 0); g.add(cV);
  const cH = mesh(box(0.26, 0.06, 0.06), M.townBeam); cH.position.set(0, peakY + 0.26, 0); g.add(cH);

  // Arched windows (lancet style, front + sides)
  const wY = 0.14 + h * 0.52;
  [[0, d / 2], [w * 0.32, 0], [-w * 0.32, 0]].forEach(([wx, wz], i) => {
    const wFace = i === 0 ? d / 2 + 0.02 : 0;
    const win = mesh(box(0.15, 0.34, 0.06), M.townWin); win.position.set(wx, wY, wFace || wz + 0.02); g.add(win);
    const wTop = mesh(box(0.15, 0.10, 0.06), M.townWin); wTop.position.set(wx, wY + 0.24, wFace || wz + 0.02); g.add(wTop);
  });

  // Front door with stone arch
  const dH = 0.48, dW = 0.24;
  const door = mesh(box(dW, dH, 0.07), M.townDoor); door.position.set(0, 0.14 + dH / 2, d / 2 + 0.02); g.add(door);
  const arch2 = mesh(box(dW + 0.12, 0.14, 0.09), M.townStone); arch2.position.set(0, 0.14 + dH + 0.07, d / 2 + 0.02); g.add(arch2);
  const step3 = mesh(box(0.40, 0.07, 0.18), M.townStoneD); step3.position.set(0, 0.035, d / 2 + 0.12); g.add(step3);
}

// ── 7. Watchtower ────────────────────────────────────────────────────────────
function _mbWatchtower(g, rng) {
  const tW = 0.70 + rng() * 0.18, h = 2.4 + rng() * 0.8;

  // Stone tower (slightly tapering)
  const low = mesh(box(tW, h * 0.6, tW), M.townStone); low.position.y = h * 0.3; g.add(low);
  const mid = mesh(box(tW * 0.92, h * 0.4, tW * 0.92), M.townStone); mid.position.y = h * 0.8; g.add(mid);
  // Horizontal string courses
  [h * 0.33, h * 0.66].forEach(ry => {
    const course = mesh(box(tW + 0.06, 0.07, tW + 0.06), M.townStoneD); course.position.y = ry; g.add(course);
  });

  // Parapet walkway
  const pw = tW + 0.22;
  const plat = mesh(box(pw, 0.16, pw), M.townStone); plat.position.y = h + 0.08; g.add(plat);

  // Merlons (battlements) — 3 per face, 4 faces
  for (let face = 0; face < 4; face++) {
    const ang = face * Math.PI / 2;
    const fx = Math.cos(ang) * pw / 2, fz = Math.sin(ang) * pw / 2;
    for (let mi = -1; mi <= 1; mi++) {
      const tx = Math.cos(ang + Math.PI / 2) * mi * pw * 0.28;
      const tz = Math.sin(ang + Math.PI / 2) * mi * pw * 0.28;
      const mer = mesh(box(0.18, 0.30, 0.18), M.townStone);
      mer.position.set(fx + tx, h + 0.31, fz + tz); g.add(mer);
    }
    // Arrow slit per face (mid height)
    const slitY = h * 0.55;
    const slit = mesh(box(face % 2 === 0 ? 0.09 : tW * 0.5, 0.28, face % 2 === 0 ? tW * 0.5 : 0.09), M.townWin);
    slit.position.set(fx * 0.72, slitY, fz * 0.72); g.add(slit);
  }

  // Wooden conical cap
  for (let s = 0; s < 5; s++) {
    const t = 1 - s / 5;
    const sl = mesh(box(tW * t * 0.9, 0.16, tW * t * 0.9), M.townTileR);
    sl.position.y = h + 0.16 + s * 0.16; g.add(sl);
  }

  // Door with portcullis
  const dH = 0.50, dW = 0.24;
  const door = mesh(box(dW, dH, 0.08), M.townDoor); door.position.set(0, dH / 2, tW / 2 + 0.02); g.add(door);
  // Portcullis bars
  for (let bi = -1; bi <= 1; bi++) {
    const bar = mesh(box(0.04, dH, 0.09), M.townIron); bar.position.set(bi * 0.08, dH / 2, tW / 2 + 0.03); g.add(bar);
  }
  const arch3 = mesh(box(dW + 0.14, 0.14, 0.10), M.townStone); arch3.position.set(0, dH + 0.07, tW / 2 + 0.02); g.add(arch3);

  // Window slits (2 more up the tower)
  [[h * 0.35, tW / 2], [h * 0.65, tW / 2]].forEach(([wy, wz]) => {
    const ws = mesh(box(0.09, 0.28, 0.08), M.townWin); ws.position.set(0, wy, wz + 0.01); g.add(ws);
  });
}

// ── Dispatcher + public wrappers ────────────────────────────────────────────
const _MB_BUILDERS = [_mbCottage, _mbFarmhouse, _mbWindmill, _mbBlacksmith, _mbTavern, _mbChapel, _mbWatchtower];

function _wrapMB(builderFn, x, z, rng) {
  const g = new THREE.Group();
  builderFn(g, rng);
  g.position.set(x, 0, z);
  g.rotation.y = rng() * Math.PI * 2;
  scene.add(g);
  const cell = grid[`${Math.round(x)},${Math.round(z)}`];
  if (cell && cell.type === 'grass') cell.type = 'scenery';
  staticObstacles.push({ x, z, r: 0.60 });
  return g;
}

function buildMedievalCottage(x, z, rng) { return _wrapMB(_mbCottage,    x, z, rng); }
function buildFarmhouse(x, z, rng)       { return _wrapMB(_mbFarmhouse,  x, z, rng); }
function buildWindmill(x, z, rng)         { return _wrapMB(_mbWindmill,   x, z, rng); }
function buildBlacksmith(x, z, rng)       { return _wrapMB(_mbBlacksmith, x, z, rng); }
function buildTavern(x, z, rng)           { return _wrapMB(_mbTavern,     x, z, rng); }
function buildChapel(x, z, rng)           { return _wrapMB(_mbChapel,     x, z, rng); }
function buildWatchtower(x, z, rng)       { return _wrapMB(_mbWatchtower, x, z, rng); }

function buildFantasyBuilding(x, z, rng) {
  return _wrapMB(_MB_BUILDERS[Math.floor(rng() * _MB_BUILDERS.length)], x, z, rng);
}

function buildWell(x, z, rng) {
  const g = new THREE.Group();
  // Stone rim (4 corner blocks)
  [[0.25,0.25],[-0.25,0.25],[0.25,-0.25],[-0.25,-0.25]].forEach(([sx,sz]) => {
    const s = mesh(box(0.2, 0.4, 0.2), M.townStone); s.position.set(sx, 0.2, sz); g.add(s);
  });
  // Top cap
  const rim = mesh(box(0.72, 0.06, 0.72), M.townStone); rim.position.y = 0.43; g.add(rim);
  // Two posts + crossbeam
  [-0.28, 0.28].forEach(px => {
    const post = mesh(box(0.07, 0.46, 0.07), M.townBeam); post.position.set(px, 0.66, 0); g.add(post);
  });
  const beam = mesh(box(0.62, 0.07, 0.07), M.townBeam); beam.position.y = 0.89; g.add(beam);
  // Mini cross roof
  const rA = mesh(box(0.7, 0.06, 0.18), M.townRoof); rA.position.set(0, 0.95, 0); g.add(rA);
  const rB = mesh(box(0.18, 0.06, 0.7), M.townRoof); rB.position.set(0, 0.95, 0); g.add(rB);
  // Rope + bucket
  const rope = mesh(box(0.03, 0.26, 0.03), M.townBeam); rope.position.set(0, 0.76, 0); g.add(rope);
  const bucket = mesh(box(0.1, 0.1, 0.1), M.townMetal); bucket.position.set(0, 0.6, 0); g.add(bucket);
  g.position.set(x, 0, z);
  g.rotation.y = rng() * Math.PI * 2;
  scene.add(g);
  staticObstacles.push({ x, z, r: 0.42 });
  return g;
}

// ─────────────────────────────────────────────
//  SCREEN SHAKE
// ─────────────────────────────────────────────
function triggerShake(mag) {
  shakeAmt = Math.max(shakeAmt, mag);
}

// ─────────────────────────────────────────────
//  IMPACT RING VFX
// ─────────────────────────────────────────────
function spawnImpactRing(pos, color) {
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  const ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.28, 8), ringMat);
  ringMesh.position.set(pos.x, pos.y + 0.1, pos.z);
  ringMesh.rotation.x = -Math.PI / 2;
  scene.add(ringMesh);
  vfx.push({ mesh: ringMesh, life: 0.55, maxLife: 0.55, isRing: true, startScale: 0.1, endScale: 5.0, _ownsGeo: true });
}

// ─────────────────────────────────────────────
//  BIOME SYSTEM
// ─────────────────────────────────────────────
const BIOMES = [
  { name:'Meadow',
    bg:0x5588bb, fog:[0x88aacc,110,210], ambient:[0x99bbdd,2.2], sun:[0xfff8e0,3.0], fill:[0x4477bb,0.7], hemi:[0x66aadd,0x2a6820,0.9],
    grassColor:0xffffff, hill:[0x3a8040,0x2d6030], foliage:[0x1a5c28,0x226b32],
    water:{ deep:[0x1a5c9a,0x0a2c4a], shallow:[0x2a7abf,0x0a3a60], surf:[0x3a9fe0,0.52] },
    pathTint:0xffffff, castleGlow:[0x00d4ff,2.5], torch:0xff8820, crystal:0x00d4ff,
    trees:['tree','tree','tree','pine'],
    treeMats:{ pineFoliage:0x1a4020, pineTrunk:0x4a3020, palmFrond:0x2a6010, palmTrunk:0x8a6830, cactus:0x286422, deadTrunk:0x2e1c0c, mushCap:0xcc2200, mushStem:0xddd0b8 } },

  { name:'Desert',
    bg:0x1a0e04, fog:[0xc47830,90,180], ambient:[0x886644,1.4], sun:[0xffcc66,2.2], fill:[0xaa7722,0.4], hemi:[0x997744,0x553311,0.6],
    grassColor:0xffffff, hill:[0xb89050,0x8a6830], foliage:[0x8a7040,0x6a5030],
    water:{ deep:[0xc4a030,0x7a6020], shallow:[0xd4b040,0x8a6820], surf:[0xe0c060,0.38] },
    pathTint:0xd4b070, castleGlow:[0xffaa00,2.0], torch:0xff6600, crystal:0xffaa00,
    trees:['cactus','cactus','deadtree','palm'],
    treeMats:{ pineFoliage:0x1a4020, pineTrunk:0x4a3020, palmFrond:0x3a7010, palmTrunk:0x9a7020, cactus:0x3d6620, deadTrunk:0xa08040, mushCap:0xcc2200, mushStem:0xddd0b8 } },

  { name:'Icelands',
    bg:0x080d18, fog:[0x8ab0d0,60,140], ambient:[0x4488cc,1.3], sun:[0xc0ddff,1.6], fill:[0x2255aa,0.6], hemi:[0x6699cc,0x334466,0.65],
    grassColor:0xffffff, hill:[0xc0d8f0,0x8ab0d8], foliage:[0xd0e8f8,0xb8d4f0],
    water:{ deep:[0x8ab8e0,0x4488cc], shallow:[0xaad0f0,0x66aadd], surf:[0xc8e8ff,0.6] },
    pathTint:0xd0e8ff, castleGlow:[0x88ccff,2.5], torch:0x88ccff, crystal:0x88ddff,
    trees:['pine','pine','deadtree'],
    treeMats:{ pineFoliage:0xd4eef8, pineTrunk:0x7090a8, palmFrond:0x2a6010, palmTrunk:0x8a6830, cactus:0x286422, deadTrunk:0x8898aa, mushCap:0xcc2200, mushStem:0xddd0b8 } },

  { name:'Lava',
    bg:0x220500, fog:[0x661800,45,100], ambient:[0x882200,2.0], sun:[0xff7722,2.8], fill:[0xcc3300,1.1], hemi:[0xaa3300,0x330800,0.9],
    grassColor:0xffffff, hill:[0x2a0c00,0x180500], foliage:[0x2a0800,0x120400],
    water:{ deep:[0xff5500,0xff3300], shallow:[0xff7700,0xff5500], surf:[0xff9900,0.85] },
    pathTint:0x3a2010, castleGlow:[0xff5500,5.0], torch:0xff5500, crystal:0xff6600,
    trees:['deadtree','deadtree','mushroom'],
    treeMats:{ pineFoliage:0x1a0800, pineTrunk:0x200800, palmFrond:0x1a0800, palmTrunk:0x200800, cactus:0x1a0800, deadTrunk:0x180a00, mushCap:0xff4400, mushStem:0x3a1808 } },

  { name:'Mordor',
    bg:0x050302, fog:[0x1a1208,60,130], ambient:[0x221408,1.1], sun:[0xaa8855,1.2], fill:[0x331a08,0.5], hemi:[0x332210,0x100808,0.5],
    grassColor:0xffffff, hill:[0x2a2018,0x1a1410], foliage:[0x1a1408,0x100e08],
    water:{ deep:[0x1a1208,0x0a0804], shallow:[0x221a10,0x120e08], surf:[0x2a2010,0.55] },
    pathTint:0x2a2010, castleGlow:[0xcc6600,2.0], torch:0xdd7722, crystal:0xcc7700,
    trees:['deadtree','deadtree','mushroom'],
    treeMats:{ pineFoliage:0x181208, pineTrunk:0x1a1208, palmFrond:0x181208, palmTrunk:0x1a1208, cactus:0x181208, deadTrunk:0x1a1208, mushCap:0x6a3818, mushStem:0x2a2010 } },

  { name:'Doom',
    bg:0x060002, fog:[0x1a0010,50,115], ambient:[0x330011,1.3], sun:[0xcc2244,1.8], fill:[0x550022,0.7], hemi:[0x440022,0x110008,0.6],
    grassColor:0xffffff, hill:[0x150010,0x0a0008], foliage:[0x220010,0x110008],
    water:{ deep:[0x550022,0x330011], shallow:[0x770033,0x440022], surf:[0xaa0044,0.7] },
    pathTint:0x200010, castleGlow:[0xff0044,3.0], torch:0xff0044, crystal:0xff0066,
    trees:['deadtree','mushroom','mushroom'],
    treeMats:{ pineFoliage:0x150010, pineTrunk:0x110008, palmFrond:0x150010, palmTrunk:0x110008, cactus:0x150010, deadTrunk:0x150010, mushCap:0xaa0040, mushStem:0x330018 } },

  { name:'Vibe',
    bg:0x04000e, fog:[0x100030,65,145], ambient:[0x220055,1.4], sun:[0xff44cc,1.6], fill:[0x0044ff,0.7], hemi:[0x440088,0x110044,0.65],
    grassColor:0xffffff, hill:[0x440088,0x220055], foliage:[0xff44cc,0xcc00ff],
    water:{ deep:[0x0088ff,0x0044cc], shallow:[0x00ffcc,0x00aa88], surf:[0x44ffff,0.65] },
    pathTint:0xffffff, castleGlow:[0x00ffcc,3.0], torch:0xff00ff, crystal:0x00ffcc,
    trees:['tree','pine','mushroom'],
    treeMats:{ pineFoliage:0xff44cc, pineTrunk:0x330066, palmFrond:0x00ffcc, palmTrunk:0x220055, cactus:0xff00aa, deadTrunk:0x440088, mushCap:0x00ffcc, mushStem:0x440088 } },
];

let activeBiomeIdx = -1;

const _TREE_TYPES = new Set(['tree','pine','palm','cactus','deadtree','mushroom']);

function _buildBiomeTree(type, x, z, scale) {
  if (type === 'pine')     return buildPine(x, z, scale);
  if (type === 'palm')     return buildPalm(x, z, scale);
  if (type === 'cactus')   return buildCactus(x, z, scale);
  if (type === 'deadtree') return buildDeadTree(x, z, scale);
  if (type === 'mushroom') return buildMushroom(x, z, scale);
  return buildTree(x, z, scale);
}

function _rebuildBiomeTrees(biomeIdx) {
  if (_biomeTreeSpots.length === 0) return;
  const treeXZSet = new Set(_biomeTreeSpots.map(s => `${s.col},${s.row}`));
  // Remove old biome trees from scene + initialScenery
  for (let i = initialScenery.length - 1; i >= 0; i--) {
    const item = initialScenery[i];
    if (!_TREE_TYPES.has(item.type)) continue;
    if (!treeXZSet.has(`${item.col},${item.row}`)) continue;
    scene.remove(item.group);
    disposeGroup(item.group);
    initialScenery.splice(i, 1);
  }
  // Remove their static obstacles (matched by rounded position)
  for (let i = staticObstacles.length - 1; i >= 0; i--) {
    const o = staticObstacles[i];
    if (treeXZSet.has(`${Math.round(o.x)},${Math.round(o.z)}`)) staticObstacles.splice(i, 1);
  }
  // Rebuild with new biome tree types
  const types = BIOMES[biomeIdx]?.trees || ['tree'];
  for (const spot of _biomeTreeSpots) {
    const tType = types[(spot.col * 7 + spot.row * 13) % types.length];
    const g = _buildBiomeTree(tType, spot.x, spot.z, spot.scale);
    initialScenery.push({ group: g, col: spot.col, row: spot.row, type: tType });
  }
}

function applyBiome(idx) {
  const i = idx % BIOMES.length;
  if (activeBiomeIdx === i) return;
  activeBiomeIdx = i;
  const b = BIOMES[i];

  scene.background.setHex(b.bg);
  scene.fog.color.setHex(b.fog[0]); scene.fog.near = b.fog[1]; scene.fog.far = b.fog[2];
  // Sky dome gradient: fog colour at the horizon (seamless terrain fade), bg at the zenith
  skyDomeMat.uniforms.horizonColor.value.setHex(b.fog[0]);
  skyDomeMat.uniforms.topColor.value.setHex(b.bg);
  const cs = CLOUD_STYLE[b.name] || { color: 0xffffff, opacity: 0.9 };
  cloudMat.color.setHex(cs.color);
  cloudMat.opacity = cs.opacity;
  _applyAmbientStyle(b.name);

  ambient.color.setHex(b.ambient[0]);   ambient.intensity   = b.ambient[1];
  sun.color.setHex(b.sun[0]);            sun.intensity       = b.sun[1];
  fillLight.color.setHex(b.fill[0]);    fillLight.intensity  = b.fill[1];
  hemiLight.color.setHex(b.hemi[0]);    hemiLight.groundColor.setHex(b.hemi[1]); hemiLight.intensity = b.hemi[2];

  castleGlow.color.setHex(b.castleGlow[0]); castleGlow.intensity = b.castleGlow[1];
  torchL.color.setHex(b.torch); torchR.color.setHex(b.torch);
  for (const l of lanternLights) l.color.setHex(b.torch);
  M.voidPlane.color.setHex(b.hill[0]);

  if (M.grassA.map) M.grassA.map.dispose();
  M.grassA.map = makeGroundTex(b.name);
  M.grassA.color.setHex(b.grassColor);
  M.grassA.needsUpdate = true;

  M.hillGrass.color.setHex(b.hill[0]);
  M.hillDark.color.setHex(b.hill[1]);
  M.treeFoliage.color.setHex(b.foliage[0]);
  M.treeFoliage2.color.setHex(b.foliage[1]);
  if (b.treeMats) {
    const tm = b.treeMats;
    M.pineFoliage.color.setHex(tm.pineFoliage);
    M.pineTrunk.color.setHex(tm.pineTrunk);
    M.palmFrond.color.setHex(tm.palmFrond);
    M.palmTrunk.color.setHex(tm.palmTrunk);
    M.cactus.color.setHex(tm.cactus);
    M.deadTrunk.color.setHex(tm.deadTrunk);
    M.mushCap.color.setHex(tm.mushCap);
    M.mushStem.color.setHex(tm.mushStem);
  }

  M.waterDeep.color.setHex(b.water.deep[0]);     M.waterDeep.emissive.setHex(b.water.deep[1]);
  M.waterShallow.color.setHex(b.water.shallow[0]); M.waterShallow.emissive.setHex(b.water.shallow[1]);
  M.waterSurf.color.setHex(b.water.surf[0]);       M.waterSurf.opacity = b.water.surf[1];

  M.pathMat.color.setHex(b.pathTint);

  // Crystal stays blue always — only bolt tints with biome
  M.bolt.color.setHex(b.crystal);    M.bolt.emissive.setHex(b.crystal);

  // Swap tree meshes to match biome vegetation
  _rebuildBiomeTrees(i);
}

// ─────────────────────────────────────────────
//  BUILD CASTLE (spans cols 66-71, rows 23-31, 3 gate lanes)
// ─────────────────────────────────────────────
function addBattlement(group, x, y, z) {
  const b = mesh(box(0.35, 0.65, 0.35), M.castleStone);
  b.position.set(x, y, z);
  group.add(b);
}

function addFlag(group, x, y, z) {
  const pole = mesh(box(0.06, 1.2, 0.06), M.castleFlagPole);
  pole.position.set(x, y + 0.6, z);
  group.add(pole);
  const flag = mesh(box(0.55, 0.32, 0.05), M.castleFlag);
  flag.position.set(x + 0.28, y + 1.05, z);
  group.add(flag);
}

function buildCastle() {
  const g = new THREE.Group();

  // Courtyard floor (covered by castle model on top of grid tiles)
  for (let cx = 66; cx <= 71; cx++) {
    for (let cz = 23; cz <= 31; cz++) {
      const slab = mesh(box(1.0, 0.14, 1.0), M.castleLight);
      slab.position.set(cx, -0.07, cz);
      g.add(slab);
    }
  }

  // West gate wall — solid sections between the 3 path openings
  // Openings at rows 25, 27, 29; solid at rows 23-24, 26, 28, 30-31
  [[23,24],[26,26],[28,28],[30,31]].forEach(([r0,r1]) => {
    for (let cz = r0; cz <= r1; cz++) {
      const w = mesh(box(0.55, 3.5, 1.0), M.castleStone);
      w.position.set(66, 1.75, cz);
      g.add(w);
    }
  });

  // Gate lintels + portcullis bars over each opening
  [25, 27, 29].forEach(cz => {
    const lintel = mesh(box(0.55, 0.65, 1.0), M.castleDark);
    lintel.position.set(66, 3.08, cz);
    g.add(lintel);
    for (let bi = -1; bi <= 1; bi++) {
      const bar = mesh(box(0.06, 2.0, 0.06), M.castleDark);
      bar.position.set(66.02, 1.4, cz + bi * 0.32);
      g.add(bar);
    }
    for (let hi = 0; hi < 3; hi++) {
      const bar = mesh(box(0.06, 0.06, 0.9), M.castleDark);
      bar.position.set(66.02, 0.6 + hi * 0.7, cz);
      g.add(bar);
    }
  });

  // Flanking gate towers (col 66) — banding, corner pillars, arrow slits
  [[66,23],[66,31]].forEach(([cx,cz]) => {
    const t = mesh(box(1.3, 5.5, 1.3), M.castleStone);
    t.position.set(cx, 2.75, cz);
    g.add(t);
    [1.0, 2.0, 3.0, 4.0].forEach(y => {
      const band = mesh(box(1.36, 0.09, 1.36), M.castleLight); band.position.set(cx, y, cz); g.add(band);
    });
    [[-0.56,-0.56],[-0.56,0.56],[0.56,-0.56],[0.56,0.56]].forEach(([px,pz]) => {
      const col = mesh(box(0.23, 5.62, 0.23), M.castleLight); col.position.set(cx+px, 2.81, cz+pz); g.add(col);
    });
    [2.2, 4.0].forEach(sy => {
      [[-0.655,0],[0.655,0],[0,-0.655],[0,0.655]].forEach(([ox,oz]) => {
        const isX = oz === 0;
        const sv = mesh(isX ? box(0.08,0.48,0.12) : box(0.12,0.48,0.08), M.castleDark); sv.position.set(cx+ox, sy, cz+oz); g.add(sv);
        const sh = mesh(isX ? box(0.08,0.09,0.30) : box(0.30,0.09,0.08), M.castleDark); sh.position.set(cx+ox, sy+0.10, cz+oz); g.add(sh);
      });
    });
  });
  // Mid-gate pillars — with horizontal banding
  [[66,26],[66,28]].forEach(([cx,cz]) => {
    const t = mesh(box(0.8, 3.8, 0.8), M.castleStone);
    t.position.set(cx, 1.9, cz);
    g.add(t);
    [0.8, 1.6, 2.4].forEach(y => {
      const band = mesh(box(0.84, 0.08, 0.84), M.castleLight); band.position.set(cx, y, cz); g.add(band);
    });
  });

  // Back corner towers (col 71) — banding, corner pillars, arrow slits
  [[71,23],[71,31]].forEach(([cx,cz]) => {
    const t = mesh(box(1.3, 5.0, 1.3), M.castleStone);
    t.position.set(cx, 2.5, cz);
    g.add(t);
    [0.8, 1.8, 2.8, 3.8].forEach(y => {
      const band = mesh(box(1.36, 0.09, 1.36), M.castleLight); band.position.set(cx, y, cz); g.add(band);
    });
    [[-0.56,-0.56],[-0.56,0.56],[0.56,-0.56],[0.56,0.56]].forEach(([px,pz]) => {
      const col = mesh(box(0.23, 5.12, 0.23), M.castleLight); col.position.set(cx+px, 2.56, cz+pz); g.add(col);
    });
    [2.0, 3.6].forEach(sy => {
      [[-0.655,0],[0.655,0],[0,-0.655],[0,0.655]].forEach(([ox,oz]) => {
        const isX = oz === 0;
        const sv = mesh(isX ? box(0.08,0.48,0.12) : box(0.12,0.48,0.08), M.castleDark); sv.position.set(cx+ox, sy, cz+oz); g.add(sv);
        const sh = mesh(isX ? box(0.08,0.09,0.30) : box(0.30,0.09,0.08), M.castleDark); sh.position.set(cx+ox, sy+0.10, cz+oz); g.add(sh);
      });
    });
  });

  // North curtain wall — banding + arrow slits on outer face
  const wallN = mesh(box(6, 3.0, 0.55), M.castleStone);
  wallN.position.set(68.5, 1.5, 23);
  g.add(wallN);
  [0.7, 1.7, 2.5].forEach(y => {
    const band = mesh(box(6.06, 0.09, 0.58), M.castleLight); band.position.set(68.5, y, 23); g.add(band);
  });
  [67.2, 68.2, 69.2, 70.2].forEach(ax => {
    const sv = mesh(box(0.12, 0.48, 0.08), M.castleDark); sv.position.set(ax, 1.6, 22.73); g.add(sv);
    const sh = mesh(box(0.30, 0.09, 0.08), M.castleDark); sh.position.set(ax, 1.75, 22.73); g.add(sh);
  });

  // South curtain wall — banding + arrow slits on outer face
  const wallS = mesh(box(6, 3.0, 0.55), M.castleStone);
  wallS.position.set(68.5, 1.5, 31);
  g.add(wallS);
  [0.7, 1.7, 2.5].forEach(y => {
    const band = mesh(box(6.06, 0.09, 0.58), M.castleLight); band.position.set(68.5, y, 31); g.add(band);
  });
  [67.2, 68.2, 69.2, 70.2].forEach(ax => {
    const sv = mesh(box(0.12, 0.48, 0.08), M.castleDark); sv.position.set(ax, 1.6, 31.28); g.add(sv);
    const sh = mesh(box(0.30, 0.09, 0.08), M.castleDark); sh.position.set(ax, 1.75, 31.28); g.add(sh);
  });

  // East back wall — banding + arrow slits on outer face
  const wallE = mesh(box(0.55, 3.0, 9), M.castleStone);
  wallE.position.set(71, 1.5, 27);
  g.add(wallE);
  [0.7, 1.7, 2.5].forEach(y => {
    const band = mesh(box(0.58, 0.09, 9.06), M.castleLight); band.position.set(71, y, 27); g.add(band);
  });
  [24, 26, 28, 30].forEach(az => {
    const sv = mesh(box(0.08, 0.48, 0.12), M.castleDark); sv.position.set(71.28, 1.6, az); g.add(sv);
    const sh = mesh(box(0.08, 0.09, 0.30), M.castleDark); sh.position.set(71.28, 1.75, az); g.add(sh);
  });

  // Main keep — banding + corner buttresses
  const keep = mesh(box(3.5, 9.5, 3.5), M.castleStone);
  keep.position.set(68.5, 4.75, 27);
  g.add(keep);
  [2.0, 4.0, 6.0, 8.0].forEach(y => {
    const band = mesh(box(3.58, 0.12, 3.58), M.castleLight); band.position.set(68.5, y, 27); g.add(band);
  });
  [[66.62,25.12],[66.62,28.88],[70.38,25.12],[70.38,28.88]].forEach(([bx,bz]) => {
    const butt = mesh(box(0.36, 9.6, 0.36), M.castleLight); butt.position.set(bx, 4.8, bz); g.add(butt);
  });

  const keepTop = mesh(box(3.8, 0.35, 3.8), M.castleLight);
  keepTop.position.set(68.5, 9.7, 27);
  g.add(keepTop);

  // Keep windows
  const winGeo = box(0.15, 0.55, 0.45);
  [
    [66.73, 5.5, 27],[70.27, 5.5, 27],
    [66.73, 7.2, 27],[70.27, 7.2, 27],
    [68.5,  5.5, 25.24],[68.5, 5.5, 28.76],
  ].forEach(([wx,wy,wz]) => {
    const w = mesh(winGeo, M.castleDark);
    w.position.set(wx, wy, wz);
    g.add(w);
  });

  // Battlements on flanking towers
  [[66,5.82,23],[66,5.82,31],[71,5.32,23],[71,5.32,31]].forEach(([tx,ty,tz]) => {
    [[-0.4,0.4],[-0.4,-0.4],[0.4,0.4],[0.4,-0.4]].forEach(([bx,bz]) => {
      addBattlement(g, tx+bx, ty, tz+bz);
    });
  });
  // Curtain wall battlements
  for (let i = 0; i < 5; i++) {
    addBattlement(g, 66.5 + i * 1.0, 3.2, 22.7);
    addBattlement(g, 66.5 + i * 1.0, 3.2, 31.3);
  }
  // Keep battlements
  const kbY = 10.1, kbR = 1.7;
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    addBattlement(g, 68.5 + Math.cos(angle) * kbR, kbY, 27 + Math.sin(angle) * kbR);
  }

  // Flags
  addFlag(g, 66, 5.5, 23.0);
  addFlag(g, 66, 5.5, 31.0);
  addFlag(g, 71, 5.0, 23.0);
  addFlag(g, 71, 5.0, 31.0);
  addFlag(g, 68.5, 9.75, 27);

  // Wall-mounted torches flanking the gate openings
  const torchMat = new THREE.MeshStandardMaterial({ color: 0xff7700, emissive: 0xff5500, emissiveIntensity: 2.4 });
  const bracketMat = M.catMetal;
  [24, 26, 28, 30].forEach(tz => {
    const brk = mesh(box(0.12, 0.06, 0.10), bracketMat); brk.position.set(65.72, 2.8, tz); g.add(brk);
    const tBody = mesh(box(0.08, 0.22, 0.08), M.catWood); tBody.position.set(65.72, 2.96, tz); g.add(tBody);
    const tFlame = new THREE.Mesh(box(0.09, 0.11, 0.09), torchMat); tFlame.position.set(65.72, 3.1, tz); g.add(tFlame);
  });
  // Curtain wall torches (north and south sides)
  for (let i = 0; i < 4; i++) {
    const tx = 67.0 + i * 1.0;
    // North wall
    const brkN = mesh(box(0.10, 0.05, 0.08), bracketMat); brkN.position.set(tx, 2.7, 23.3); g.add(brkN);
    const tBN  = mesh(box(0.07, 0.18, 0.07), M.catWood); tBN.position.set(tx, 2.82, 23.3); g.add(tBN);
    const tFN  = new THREE.Mesh(box(0.08, 0.09, 0.08), torchMat); tFN.position.set(tx, 2.93, 23.3); g.add(tFN);
    // South wall
    const brkS = mesh(box(0.10, 0.05, 0.08), bracketMat); brkS.position.set(tx, 2.7, 30.7); g.add(brkS);
    const tBS  = mesh(box(0.07, 0.18, 0.07), M.catWood); tBS.position.set(tx, 2.82, 30.7); g.add(tBS);
    const tFS  = new THREE.Mesh(box(0.08, 0.09, 0.08), torchMat); tFS.position.set(tx, 2.93, 30.7); g.add(tFS);
  }
  // Drawbridge planks (wooden floor across gate entrances)
  [25, 27, 29].forEach(tz => {
    for (let pi = 0; pi < 4; pi++) {
      const plank = mesh(box(0.55, 0.08, 0.22), M.catWood); plank.position.set(65.72, 0.04, tz - 0.33 + pi * 0.22); g.add(plank);
    }
    // Chain anchors above doorway
    const chainL = mesh(box(0.04, 0.40, 0.04), M.catMetal); chainL.position.set(65.72, 2.0, tz - 0.40); g.add(chainL);
    const chainR = mesh(box(0.04, 0.40, 0.04), M.catMetal); chainR.position.set(65.72, 2.0, tz + 0.40); g.add(chainR);
  });
  // Keep entrance arch + door
  const keepArch = mesh(box(0.16, 1.6, 1.0), M.castleDark); keepArch.position.set(66.92, 0.80, 27); g.add(keepArch);
  const keepDoor = mesh(box(0.10, 1.4, 0.80), M.catWood); keepDoor.position.set(66.88, 0.70, 27); g.add(keepDoor);
  // Keep windows glow interior
  [
    [66.73, 5.5, 27],[70.27, 5.5, 27],
    [66.73, 7.2, 27],[70.27, 7.2, 27],
    [68.5,  5.5, 25.24],[68.5, 5.5, 28.76],
  ].forEach(([wx,wy,wz]) => {
    const gWin = mesh(box(0.07, 0.40, 0.28), M.townWin); gWin.position.set(wx, wy, wz); g.add(gWin);
  });
  // Moat hint — sunken dark strip in front of gate wall (col 65)
  const moatMat = new THREE.MeshStandardMaterial({ color: 0x0a1a2e, emissive: 0x040c14, emissiveIntensity: 0.4 });
  for (let mz = 22; mz <= 32; mz++) {
    const moat = new THREE.Mesh(box(0.7, 0.22, 0.96), moatMat); moat.position.set(65.15, -0.26, mz); g.add(moat);
  }

  // Castle HP bar (over gate)
  const hpBg = new THREE.Mesh(box(CASTLE_BAR_MAX_W + 0.12, 0.18, 0.12), M.castleHPBarBg);
  hpBg.position.set(66, 6.8, 29.5);
  g.add(hpBg);
  castleHPBgMesh = hpBg;

  const hpFg = new THREE.Mesh(box(CASTLE_BAR_MAX_W, 0.13, 0.14), M.castleHPBarFg);
  hpFg.position.set(66, 6.8, 29.5);
  g.add(hpFg);
  castleHPMesh = hpFg;

  // Clone materials on all castle meshes for hit-flash (same pattern as defenders)
  const castleFlashMeshes = [];
  g.traverse(c => {
    if (!c.isMesh) return;
    c.material = Array.isArray(c.material) ? c.material.map(mat => mat.clone()) : c.material.clone();
    const mat0 = Array.isArray(c.material) ? c.material[0] : c.material;
    c.userData.origEmissive = mat0.emissive ? mat0.emissive.clone() : new THREE.Color(0);
    castleFlashMeshes.push(c);
  });
  g.userData.hitFlashMeshes = castleFlashMeshes;

  scene.add(g);
  return g;
}

// ─────────────────────────────────────────────
//  HP BAR helper
// ─────────────────────────────────────────────
function makeHPBar(group, yOffset, bgTint = null) {
  const bgMat = M.hpBg.clone();
  if (bgTint) bgMat.color.setHex(bgTint);
  const bg = new THREE.Mesh(box(0.65, 0.08, 0.05), bgMat);
  bg.position.set(0, yOffset, 0);
  group.add(bg);
  const fgMat = M.hpFg.clone(); // own instance so colour is per-unit
  fgMat.color.setHSL(0.33, 1.0, 0.5); // full-health green
  const fg = new THREE.Mesh(box(0.65, 0.07, 0.06), fgMat);
  fg.position.set(0, yOffset, 0.01);
  group.add(fg);
  return { bg, fg };
}

// ─────────────────────────────────────────────
//  ENEMY BUILDERS
// ─────────────────────────────────────────────
const _HP_BAR_TINT = {
  skeleton: 0x554422, wolf: 0x443355, spider: 0x330022,
  troll: 0x224411, boss: 0x330044, orcMage: 0x440011, rockTroll: 0x333322,
  cyclops: 0x442200, exploder: 0x441100, healerOrc: 0x113322,
  brute: 0x442200, grunt: 0x223311,
  enemyArcher: 0x223344,
};
let _nextEnemyIsElite = false;
function _pushEnemy(g, orcType, legL, legR, body, head, hpYOffset, chosenPath, armL = null, armR = null) {
  const type = CFG.ORC_TYPES[orcType];
  const isElite = _nextEnemyIsElite; _nextEnemyIsElite = false;
  const hpBar = makeHPBar(g, hpYOffset, isElite ? 0x664400 : (_HP_BAR_TINT[orcType] ?? null));
  const eliteScale = isElite ? type.scale * 1.15 : type.scale;
  g.scale.setScalar(eliteScale);
  g.position.set(chosenPath[0][0], 0, chosenPath[0][1]);
  if (isElite) {
    // Gold glowing eyes on elite enemies
    g.traverse(c => {
      if (c.isMesh && c.material && (c.material === M.orcEye || c.material?.color?.getHex?.() === 0xaaff00)) {
        c.material = c.material.clone();
        c.material.color.setHex(0xffcc00);
        c.material.emissive?.setHex(0xffaa00);
        c.material.emissiveIntensity = 3.0;
      }
    });
  }
  scene.add(g);
  const baseHp = Math.round((isElite ? type.hp * 2 : type.hp) * difficultyMult.hp);
  orcs.push({
    group: g, type: orcType, isElite,
    path: chosenPath,
    pathIndex: 0, progress: 0,
    hp: baseHp, maxHp: baseHp, alive: true,
    speed: (isElite ? type.speed * 1.3 : type.speed) * rageMultiplier * difficultyMult.speed,
    castleDmg: type.castleDmg, reward: Math.round((isElite ? type.reward * 2 : type.reward) * (difficultyMult.rewardMult || 1)),
    animTime: Math.random() * Math.PI * 2,
    legL, legR, armL, armR, hpBar, scale: eliteScale,
    hitFlashTimer: 0,
    hitFlashMeshes: [body, head],
    hitRecoilT: 0, hitRecoilDir: 1,
    squashT: 0, prevGs: 0,       // squash-and-stretch
    leanX: 0.09, hitLeanX: 0,    // procedural lean
    slowTimer: 0, slowAmount: 1.0,
    blockedByWall: null,
    wallAttackTimer: 0,
    wallSlotIdx: -1,
    wallTargetX: null, wallTargetZ: null,
    castleSlotIdx: -1,
    castleTargetZ: null,
    fightingDefender: null,
    defAttackTimer: 0,
    attackSlot: -1,
    chasingDefender: null,
  });
}

function spawnTroll(chosenPath) {
  const g = new THREE.Group();
  const legL = mesh(box(0.3, 0.45, 0.3), M.trollMat); legL.position.set( 0.2, 0.22, 0); g.add(legL);
  const legR = mesh(box(0.3, 0.45, 0.3), M.trollMat); legR.position.set(-0.2, 0.22, 0); g.add(legR);
  // Knee pads
  const kneeL = mesh(box(0.28, 0.10, 0.12), M.catMetal); kneeL.position.set( 0.2, 0.35, 0.08); g.add(kneeL);
  const kneeR = mesh(box(0.28, 0.10, 0.12), M.catMetal); kneeR.position.set(-0.2, 0.35, 0.08); g.add(kneeR);
  const body = mesh(box(0.75, 0.65, 0.5), M.trollMat); body.position.y = 0.75; g.add(body);
  // Crude chest plate
  const chest = mesh(box(0.50, 0.40, 0.08), M.catMetal); chest.position.set(0, 0.80, 0.27); g.add(chest);
  // Spiked shoulder pads
  const padL = mesh(box(0.22, 0.16, 0.36), M.catMetal); padL.position.set( 0.52, 0.98, 0); g.add(padL);
  const padR = mesh(box(0.22, 0.16, 0.36), M.catMetal); padR.position.set(-0.52, 0.98, 0); g.add(padR);
  const spikeL = mesh(box(0.08, 0.20, 0.08), M.catMetal); spikeL.position.set( 0.52, 1.14, 0); g.add(spikeL);
  const spikeR = mesh(box(0.08, 0.20, 0.08), M.catMetal); spikeR.position.set(-0.52, 1.14, 0); g.add(spikeR);
  const armL = mesh(box(0.28, 0.6, 0.28), M.trollMat); armL.position.set( 0.52, 0.65, 0); g.add(armL);
  const armR = mesh(box(0.28, 0.6, 0.28), M.trollMat); armR.position.set(-0.52, 0.65, 0); g.add(armR);
  const club = mesh(box(0.22, 0.75, 0.22), M.trollClub); club.position.set(0, -0.35, 0.15); armR.add(club);
  const clubHead = mesh(box(0.36, 0.3, 0.36), M.trollClub); clubHead.position.set(0, -0.75, 0.15); armR.add(clubHead);
  // Club spikes
  [[0.22,0],[0,-0.22],[-0.22,0]].forEach(([sx,sz]) => {
    const s = mesh(box(0.10,0.14,0.10), M.catMetal); s.position.set(sx, -0.82, 0.15+sz); armR.add(s);
  });
  const head = mesh(box(0.6, 0.5, 0.55), M.trollMat); head.position.y = 1.28; g.add(head);
  // Heavy brow ridge
  const brow = mesh(box(0.64, 0.11, 0.14), M.trollMat); brow.position.set(0, 1.44, 0.28); g.add(brow);
  // Nose bump
  const nose = mesh(box(0.18, 0.14, 0.10), M.trollMat); nose.position.set(0, 1.30, 0.31); g.add(nose);
  // Eyes
  const eL = mesh(box(0.10, 0.10, 0.06), M.trollEye); eL.position.set( 0.16, 1.38, 0.29); g.add(eL);
  const eR = mesh(box(0.10, 0.10, 0.06), M.trollEye); eR.position.set(-0.16, 1.38, 0.29); g.add(eR);
  // Tusks
  const tuskL = mesh(box(0.07, 0.20, 0.07), M.orcTusk); tuskL.position.set( 0.14, 1.14, 0.30); tuskL.rotation.z = -0.18; g.add(tuskL);
  const tuskR = mesh(box(0.07, 0.20, 0.07), M.orcTusk); tuskR.position.set(-0.14, 1.14, 0.30); tuskR.rotation.z = 0.18; g.add(tuskR);
  // Bony back ridge — row of protruding spines down the spine (additive, rig-safe)
  [[1.02, 0.28, -0.24], [0.82, 0.34, -0.26], [0.60, 0.28, -0.26]].forEach(([sy, sh, sz]) => {
    const spine = mesh(box(0.12, sh, 0.12), M.orcTusk); spine.position.set(0, sy, sz); spine.rotation.x = -0.5; g.add(spine);
  });
  _pushEnemy(g, 'troll', legL, legR, body, head, 1.95, chosenPath, armL, armR);
}

function spawnSkeleton(chosenPath) {
  const g = new THREE.Group();
  const bMat = M.skelBone.clone();
  // Feet
  const footL = mesh(box(0.14, 0.07, 0.18), bMat); footL.position.set( 0.1, 0.035, 0.02); g.add(footL);
  const footR = mesh(box(0.14, 0.07, 0.18), bMat); footR.position.set(-0.1, 0.035, 0.02); g.add(footR);
  // Legs — upper + lower segment with visible knee knob
  const legL = mesh(box(0.13, 0.20, 0.13), bMat); legL.position.set( 0.1, 0.17, 0); g.add(legL);
  const legR = mesh(box(0.13, 0.20, 0.13), bMat); legR.position.set(-0.1, 0.17, 0); g.add(legR);
  const kneeL = mesh(box(0.15, 0.07, 0.15), bMat); kneeL.position.set( 0.1, 0.29, 0); g.add(kneeL);
  const kneeR = mesh(box(0.15, 0.07, 0.15), bMat); kneeR.position.set(-0.1, 0.29, 0); g.add(kneeR);
  const thighL = mesh(box(0.12, 0.20, 0.12), bMat); thighL.position.set( 0.1, 0.40, 0); g.add(thighL);
  const thighR = mesh(box(0.12, 0.20, 0.12), bMat); thighR.position.set(-0.1, 0.40, 0); g.add(thighR);
  // Pelvis
  const pelvis = mesh(box(0.34, 0.1, 0.2), bMat); pelvis.position.y = 0.52; g.add(pelvis);
  // Spine chain — 4 vertebrae segments
  for (let vi = 0; vi < 4; vi++) {
    const vert = mesh(box(0.10, 0.09, 0.14), bMat); vert.position.set(0, 0.59 + vi * 0.11, 0); g.add(vert);
    if (vi < 3) {
      const disc = mesh(box(0.07, 0.03, 0.07), bMat); disc.position.set(0, 0.63 + vi * 0.11, 0); g.add(disc);
    }
  }
  // Rib cage — 4 rib pairs with slight arc
  const body = mesh(box(0.38, 0.44, 0.20), bMat); body.position.y = 0.68; g.add(body);
  for (let ri = 0; ri < 4; ri++) {
    const ribY = 0.48 + ri * 0.10;
    const ribW = 0.40 - ri * 0.03;
    const rib = mesh(box(ribW, 0.038, 0.06), M.castleLight); rib.position.set(0, ribY, 0.11); g.add(rib);
    // Rib side bumps to sell the 3D arc
    const ribSL = mesh(box(0.04, 0.038, 0.14), M.castleLight); ribSL.position.set( ribW*0.5-0.02, ribY, 0.04); g.add(ribSL);
    const ribSR = mesh(box(0.04, 0.038, 0.14), M.castleLight); ribSR.position.set(-ribW*0.5+0.02, ribY, 0.04); g.add(ribSR);
  }
  // Clavicle bones
  const clavL = mesh(box(0.16, 0.05, 0.07), bMat); clavL.position.set( 0.18, 0.95, 0.04); clavL.rotation.z = 0.25; g.add(clavL);
  const clavR = mesh(box(0.16, 0.05, 0.07), bMat); clavR.position.set(-0.18, 0.95, 0.04); clavR.rotation.z = -0.25; g.add(clavR);
  // Arms — upper + lower with elbow knob
  const armL = mesh(box(0.11, 0.22, 0.11), bMat); armL.position.set( 0.3, 0.67, 0); g.add(armL);
  const armR = mesh(box(0.11, 0.22, 0.11), bMat); armR.position.set(-0.3, 0.67, 0); g.add(armR);
  const elbL = mesh(box(0.13, 0.06, 0.13), bMat); elbL.position.set( 0.3, 0.55, 0); g.add(elbL);
  const elbR = mesh(box(0.13, 0.06, 0.13), bMat); elbR.position.set(-0.3, 0.55, 0); g.add(elbR);
  const forL = mesh(box(0.10, 0.20, 0.10), bMat); forL.position.set( 0.3, 0.44, 0); g.add(forL);
  const forR = mesh(box(0.10, 0.20, 0.10), bMat); forR.position.set(-0.3, 0.44, 0); g.add(forR);
  // Skull — slightly cracked look with offset shards
  const head = mesh(box(0.36, 0.36, 0.36), bMat); head.position.y = 1.07; g.add(head);
  const skullCrk = mesh(box(0.10, 0.06, 0.04), bMat); skullCrk.position.set(0.12, 1.24, 0.17); skullCrk.rotation.z = 0.3; g.add(skullCrk);
  // Eye sockets — recessed dark holes then glowing iris
  const sL = mesh(box(0.12,0.10,0.07), M.castleDark); sL.position.set( 0.10, 1.11, 0.18); g.add(sL);
  const sR = mesh(box(0.12,0.10,0.07), M.castleDark); sR.position.set(-0.10, 1.11, 0.18); g.add(sR);
  const eyeL = mesh(box(0.09, 0.09, 0.05), M.skelEye); eyeL.position.set( 0.10, 1.11, 0.20); g.add(eyeL);
  const eyeR = mesh(box(0.09, 0.09, 0.05), M.skelEye); eyeR.position.set(-0.10, 1.11, 0.20); g.add(eyeR);
  // Jaw — slightly angled down, with teeth nubs
  const jaw = mesh(box(0.28, 0.08, 0.24), bMat); jaw.position.set(0, 0.91, 0.04); jaw.rotation.x = 0.12; g.add(jaw);
  g.userData.skelJaw = jaw; // stored for bite animation
  for (let ti = 0; ti < 4; ti++) {
    const tooth = mesh(box(0.04, 0.06, 0.04), bMat); tooth.position.set(-0.12 + ti * 0.08, 0.87, 0.17); g.add(tooth);
  }
  // Rusted sword gripped in the right hand + a tattered burial shroud (additive)
  const skGrip  = mesh(box(0.05, 0.16, 0.05), M.arcBelt); skGrip.position.set(-0.30, 0.42, 0.16); g.add(skGrip);
  const skGuard = mesh(box(0.22, 0.04, 0.05), M.catMetal); skGuard.position.set(-0.30, 0.52, 0.16); g.add(skGuard);
  const skBlade = mesh(box(0.06, 0.40, 0.03), M.weapon);   skBlade.position.set(-0.30, 0.76, 0.16); g.add(skBlade);
  const skNick  = mesh(box(0.07, 0.05, 0.04), M.castleDark); skNick.position.set(-0.30, 0.70, 0.165); g.add(skNick); // chipped edge
  const skTip   = mesh(box(0.04, 0.10, 0.02), M.weapon);   skTip.position.set(-0.30, 0.98, 0.16); g.add(skTip);
  const shroud1 = mesh(box(0.36, 0.34, 0.05), M.arcHood);  shroud1.position.set(0.02, 0.72, -0.13); g.add(shroud1);
  const shroud2 = mesh(box(0.18, 0.16, 0.05), M.arcHood);  shroud2.position.set(0.13, 0.50, -0.14); g.add(shroud2); // ragged tail
  _pushEnemy(g, 'skeleton', legL, legR, body, head, 1.55, chosenPath, armL, armR);
}

// Wolf — quadruped, horizontal body
function spawnWolf(chosenPath) {
  const g = new THREE.Group();
  // Inner group rotates geometry so head (+x) faces forward (+z)
  const wi = new THREE.Group();
  wi.rotation.y = -Math.PI / 2;
  g.add(wi);
  const bMat = M.wolfBody.clone();
  const hMat = M.wolfHead.clone();
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x222233 });
  // Body (horizontal) — slightly arched haunches
  const body = mesh(box(0.65, 0.34, 0.38), bMat); body.position.set(0, 0.40, 0); wi.add(body);
  // Haunches — slightly raised rump
  const haunch = mesh(box(0.26, 0.36, 0.36), bMat); haunch.position.set(-0.22, 0.42, 0); wi.add(haunch);
  // Mane — darker ridge along neck/back
  const maneA = mesh(box(0.14, 0.10, 0.24), darkMat); maneA.position.set(0.26, 0.54, 0); wi.add(maneA);
  const maneB = mesh(box(0.10, 0.08, 0.20), darkMat); maneB.position.set(0.10, 0.56, 0); wi.add(maneB);
  // Neck — thicker, angled
  const neck = mesh(box(0.28, 0.30, 0.26), bMat); neck.position.set(0.30, 0.52, 0); neck.rotation.z = -0.38; wi.add(neck);
  // Head
  const head = mesh(box(0.36, 0.30, 0.34), hMat); head.position.set(0.54, 0.64, 0); wi.add(head);
  // Snout — longer with nostril bumps
  const snout = mesh(box(0.26, 0.18, 0.24), hMat); snout.position.set(0.70, 0.53, 0); wi.add(snout);
  const nostL = mesh(box(0.04, 0.04, 0.04), darkMat); nostL.position.set(0.82, 0.55, 0.07); wi.add(nostL);
  const nostR = mesh(box(0.04, 0.04, 0.04), darkMat); nostR.position.set(0.82, 0.55,-0.07); wi.add(nostR);
  // Visible fangs
  const fangL = mesh(box(0.04, 0.10, 0.04), M.orcTusk); fangL.position.set(0.73, 0.46, 0.07); wi.add(fangL);
  const fangR = mesh(box(0.04, 0.10, 0.04), M.orcTusk); fangR.position.set(0.73, 0.46,-0.07); wi.add(fangR);
  // Ears — pointed
  const earL = mesh(box(0.09,0.18,0.07), bMat); earL.position.set(0.46, 0.84, 0.14); earL.rotation.z = -0.2; wi.add(earL);
  const earR = mesh(box(0.09,0.18,0.07), bMat); earR.position.set(0.46, 0.84,-0.14); earR.rotation.z = -0.2; wi.add(earR);
  const earIL = mesh(box(0.05,0.12,0.04), darkMat); earIL.position.set(0.46, 0.84, 0.14); wi.add(earIL);
  const earIR = mesh(box(0.05,0.12,0.04), darkMat); earIR.position.set(0.46, 0.84,-0.14); wi.add(earIR);
  // Eyes — fierce glow
  const eL = mesh(box(0.07,0.07,0.05), M.wolfEye); eL.position.set(0.68, 0.66, 0.12); wi.add(eL);
  const eR = mesh(box(0.07,0.07,0.05), M.wolfEye); eR.position.set(0.68, 0.66,-0.12); wi.add(eR);
  // Scar across left eye
  const scar = mesh(box(0.03, 0.18, 0.02), darkMat); scar.position.set(0.68, 0.68, 0.14); scar.rotation.z = 0.4; wi.add(scar);
  // Tail — curved with tip tuft
  const tailBase = mesh(box(0.13, 0.13, 0.30), bMat); tailBase.position.set(-0.42, 0.50, 0); tailBase.rotation.z = -0.45; wi.add(tailBase);
  const tailTip  = mesh(box(0.09, 0.09, 0.18), darkMat); tailTip.position.set(-0.56, 0.60, 0); tailTip.rotation.z = -0.8; wi.add(tailTip);
  // 4 legs — with upper + lower segment + paw
  const legDefs = [[ 0.22, 0.18],[ 0.22,-0.18],[-0.22, 0.18],[-0.22,-0.18]];
  const legMeshes = legDefs.map(([lx,lz]) => {
    const upper = mesh(box(0.14, 0.18, 0.14), bMat); upper.position.set(lx, 0.26, lz); wi.add(upper);
    const knee  = mesh(box(0.16, 0.06, 0.16), bMat); knee.position.set(lx, 0.17, lz); wi.add(knee);
    const lower = mesh(box(0.12, 0.16, 0.12), bMat); lower.position.set(lx, 0.08, lz); wi.add(lower);
    // Paw with claws
    const paw = mesh(box(0.16, 0.06, 0.20), hMat); paw.position.set(lx, 0.03, lz + 0.02); wi.add(paw);
    for (let ci = 0; ci < 3; ci++) {
      const claw = mesh(box(0.03, 0.05, 0.04), darkMat); claw.position.set(lx - 0.04 + ci * 0.04, 0.0, lz + 0.12); wi.add(claw);
    }
    return lower; // return as animation proxy
  });
  const [legFL, legFR, legBL, legBR] = legMeshes;
  // Spiked iron war-collar around the neck — marks this as a trained dire-wolf (additive)
  const collar = mesh(box(0.36, 0.14, 0.36), M.arcBelt); collar.position.set(0.34, 0.46, 0); wi.add(collar);
  [[0, 0.15], [0.15, 0], [0, -0.15], [-0.11, 0.10], [-0.11, -0.10]].forEach(([cx, cz]) => {
    const stud = mesh(box(0.06, 0.11, 0.06), M.catMetal); stud.position.set(0.34 + cx, 0.52, cz); stud.rotation.x = cz * 1.5; wi.add(stud);
  });
  _pushEnemy(g, 'wolf', legFL, legBR, body, head, 0.95, chosenPath);
  const w = orcs[orcs.length - 1];
  w.legFR = legFR; w.legBL = legBL;
}

// Spider — 8-legged voxel creature
function spawnSpider(chosenPath) {
  const g = new THREE.Group();
  const bMat = M.spiderBody.clone();
  const markMat = new THREE.MeshStandardMaterial({ color: 0x880000, emissive: 0x440000, emissiveIntensity: 0.8 });
  // Abdomen (back) — oval with hourglass marking
  const abdomen = mesh(box(0.50, 0.34, 0.54), bMat); abdomen.position.set(-0.22, 0.30, 0); g.add(abdomen);
  const markBack = mesh(box(0.14, 0.22, 0.10), markMat); markBack.position.set(-0.22, 0.34, 0.28); g.add(markBack);
  const markTop  = mesh(box(0.16, 0.08, 0.20), markMat); markTop.position.set(-0.22, 0.48, 0.06); g.add(markTop);
  // Pedicel (waist connection between cephalothorax and abdomen)
  const waist = mesh(box(0.10, 0.10, 0.10), bMat); waist.position.set(0.02, 0.26, 0); g.add(waist);
  // Cephalothorax (front body) — wider, flatter
  const cthorax = mesh(box(0.38, 0.26, 0.40), bMat); cthorax.position.set(0.22, 0.30, 0); g.add(cthorax);
  // Chelicerae (jaw pincers)
  const chelL = mesh(box(0.08, 0.08, 0.08), bMat); chelL.position.set(0.42, 0.24, 0.10); g.add(chelL);
  const chelR = mesh(box(0.08, 0.08, 0.08), bMat); chelR.position.set(0.42, 0.24,-0.10); g.add(chelR);
  // Fangs — curved downward
  const fL = mesh(box(0.05, 0.16, 0.05), M.skelBone); fL.position.set(0.47, 0.14, 0.08); fL.rotation.z = 0.3; g.add(fL);
  const fR = mesh(box(0.05, 0.16, 0.05), M.skelBone); fR.position.set(0.47, 0.14,-0.08); fR.rotation.z = 0.3; g.add(fR);
  // 8 legs — each has upper arm + lower arm + foot with 2-segment joints
  for (let i = 0; i < 4; i++) {
    const xOff = 0.30 - i * 0.13;
    const spread = 0.30 + i * 0.05;
    const tiltZ = (i - 1.5) * 0.22;
    [1, -1].forEach(side => {
      // Upper segment
      const upper = mesh(box(0.28, 0.055, 0.055), bMat);
      upper.position.set(xOff, 0.28, side * spread * 0.6);
      upper.rotation.x = side * 0.7; upper.rotation.z = tiltZ;
      g.add(upper);
      // Knee knob
      const knee = mesh(box(0.07, 0.07, 0.07), bMat);
      knee.position.set(xOff - 0.02, 0.24, side * spread);
      g.add(knee);
      // Lower segment — angling down
      const lower = mesh(box(0.22, 0.05, 0.05), bMat);
      lower.position.set(xOff - 0.04, 0.14, side * (spread + 0.14));
      lower.rotation.x = side * 1.1; lower.rotation.z = tiltZ * 0.5;
      g.add(lower);
      // Foot tip
      const foot = mesh(box(0.05, 0.09, 0.05), bMat);
      foot.position.set(xOff - 0.06, 0.04, side * (spread + 0.24));
      g.add(foot);
    });
  }
  // 6 eyes in a cluster (2 main + 4 secondary)
  [[0.08,0.38,0.20],[-0.08,0.38,0.20],[0.14,0.34,0.19],[-0.14,0.34,0.19],[0.06,0.34,0.20],[-0.06,0.34,0.20]].forEach(([x,y,z],ei) => {
    const eyeSz = ei < 2 ? 0.09 : 0.06;
    const eye = mesh(box(eyeSz,eyeSz,0.04), M.spiderEye); eye.position.set(x+0.20, y, z); g.add(eye);
  });
  // Coarse bristles on the abdomen — makes it read as a hairy, creepy hunter (additive)
  [[-0.22,0.50,0.12],[-0.30,0.47,-0.08],[-0.14,0.47,-0.06],[-0.36,0.40,0.08],[-0.10,0.42,0.14]].forEach(([bx,by,bz]) => {
    const bristle = mesh(box(0.035, 0.13, 0.035), bMat); bristle.position.set(bx, by, bz); bristle.rotation.x = bz * 1.4; bristle.rotation.z = bx * 0.6; g.add(bristle);
  });
  _pushEnemy(g, 'spider', null, null, cthorax, abdomen, 0.7, chosenPath);
}

// Cyclops — massive one-eyed brute
function spawnCyclops(chosenPath) {
  const g = new THREE.Group();
  const legL = mesh(box(0.48, 0.65, 0.48), M.cyclopMat); legL.position.set( 0.3, 0.32, 0); g.add(legL);
  const legR = mesh(box(0.48, 0.65, 0.48), M.cyclopMat); legR.position.set(-0.3, 0.32, 0); g.add(legR);
  // Stone wrappings on shins
  const shinL = mesh(box(0.46, 0.28, 0.12), M.catMetal); shinL.position.set( 0.3, 0.22, 0.22); g.add(shinL);
  const shinR = mesh(box(0.46, 0.28, 0.12), M.catMetal); shinR.position.set(-0.3, 0.22, 0.22); g.add(shinR);
  const body = mesh(box(1.15, 1.0, 0.8), M.cyclopMat); body.position.y = 1.05; g.add(body);
  // Crude stone chest plate with ridge
  const chestPlate = mesh(box(0.80, 0.62, 0.10), M.catMetal); chestPlate.position.set(0, 1.10, 0.45); g.add(chestPlate);
  const chestRidge = mesh(box(0.10, 0.58, 0.12), M.catMetal); chestRidge.position.set(0, 1.10, 0.50); g.add(chestRidge);
  // Massive shoulder pads
  const padL = mesh(box(0.26, 0.22, 0.50), M.catMetal); padL.position.set( 0.82, 1.32, 0); g.add(padL);
  const padR = mesh(box(0.26, 0.22, 0.50), M.catMetal); padR.position.set(-0.82, 1.32, 0); g.add(padR);
  const armL = mesh(box(0.42, 0.9, 0.42), M.cyclopMat); armL.position.set( 0.78, 0.9, 0); g.add(armL);
  const armR = mesh(box(0.42, 0.9, 0.42), M.cyclopMat); armR.position.set(-0.78, 0.9, 0); g.add(armR);
  // Heavy flat feet — parented to legs (bottom of leg ≈ local y -0.33), with thick stone toes
  [legL, legR].forEach(leg => {
    const foot = mesh(box(0.54, 0.18, 0.62), M.cyclopMat); foot.position.set(0, -0.34, 0.10); leg.add(foot);
    for (let ci = -1; ci <= 1; ci++) {
      const toe = mesh(box(0.13, 0.11, 0.12), M.catMetal); toe.position.set(ci * 0.16, -0.36, 0.42); leg.add(toe);
    }
  });
  // Massive clenched fists — parented to arms (bottom ≈ local y -0.45)
  [armL, armR].forEach(arm => {
    const fist = mesh(box(0.50, 0.34, 0.50), M.cyclopMat); fist.position.set(0, -0.46, 0.02); arm.add(fist);
    const knuckles = mesh(box(0.50, 0.10, 0.16), M.catMetal); knuckles.position.set(0, -0.40, 0.24); arm.add(knuckles);
  });
  // Giant mace
  const maceHandle = mesh(box(0.16, 1.0, 0.16), M.trollClub); maceHandle.position.set(0, -0.62, 0.22); armR.add(maceHandle);
  const maceHead   = mesh(box(0.6, 0.6, 0.6), M.trollClub); maceHead.position.set(0, -1.12, 0.22); armR.add(maceHead);
  [[0.32,0],[0,-0.32],[-0.32,0],[0,0.32]].forEach(([sx,sz]) => {
    const spike = mesh(box(0.13,0.17,0.13), M.catMetal); spike.position.set(sx, -1.22, 0.22+sz); armR.add(spike);
  });
  const head = mesh(box(0.9, 0.9, 0.85), M.cyclopMat); head.position.y = 1.88; g.add(head);
  // Heavy brow plate
  const browPlate = mesh(box(0.96, 0.18, 0.14), M.catMetal); browPlate.position.set(0, 2.22, 0.42); g.add(browPlate);
  // Single giant eye — recessed socket then glowing iris
  const socket = mesh(box(0.44, 0.42, 0.10), M.castleDark); socket.position.set(0, 1.97, 0.42); g.add(socket);
  const eye    = mesh(box(0.36, 0.34, 0.14), M.cyclopEye); eye.position.set(0, 1.97, 0.46); g.add(eye);
  const brow   = mesh(box(0.42, 0.12, 0.10), M.cyclopBody); brow.position.set(0, 2.17, 0.46); g.add(brow);
  // Horns
  const hornL = mesh(box(0.15, 0.4, 0.15), M.orcTusk); hornL.position.set( 0.32, 2.42, 0); hornL.rotation.z =  0.35; g.add(hornL);
  const hornR = mesh(box(0.15, 0.4, 0.15), M.orcTusk); hornR.position.set(-0.32, 2.42, 0); hornR.rotation.z = -0.35; g.add(hornR);
  // Ragged hide kilt + a bone bandolier of trophies slung across the chest (additive)
  const kiltF = mesh(box(0.92, 0.44, 0.14), M.arcBelt);  kiltF.position.set(0, 0.60, 0.34); g.add(kiltF);
  const kiltB = mesh(box(0.92, 0.44, 0.14), M.spLeather); kiltB.position.set(0, 0.60, -0.34); g.add(kiltB);
  const belt  = mesh(box(1.00, 0.14, 0.86), M.spLeather); belt.position.set(0, 0.80, 0); g.add(belt);
  const bandolier = mesh(box(0.16, 1.05, 0.10), M.spLeather); bandolier.position.set(0.06, 1.15, 0.46); bandolier.rotation.z = 0.5; g.add(bandolier);
  [[0.34,1.42],[0.20,1.18],[0.06,0.94]].forEach(([bx,by]) => { const bone = mesh(box(0.11,0.11,0.07), M.orcTusk); bone.position.set(bx, by, 0.49); g.add(bone); });
  _pushEnemy(g, 'cyclops', legL, legR, body, head, 2.7, chosenPath, armL, armR);
}

// Enemy Archer — hooded dark figure with bow
function spawnEnemyArcher(chosenPath) {
  const g = new THREE.Group();
  const bMat = M.eArcherBody.clone();
  const hMat = M.eArcherHood.clone();
  // Leather boots with metal toe caps
  const bootL = mesh(box(0.18,0.08,0.22), bMat); bootL.position.set( 0.12, 0.04, 0.02); g.add(bootL);
  const bootR = mesh(box(0.18,0.08,0.22), bMat); bootR.position.set(-0.12, 0.04, 0.02); g.add(bootR);
  const toeL = mesh(box(0.12,0.05,0.07), M.catMetal); toeL.position.set( 0.12, 0.05, 0.13); g.add(toeL);
  const toeR = mesh(box(0.12,0.05,0.07), M.catMetal); toeR.position.set(-0.12, 0.05, 0.13); g.add(toeR);
  // Legs
  const legL = mesh(box(0.17,0.36,0.17), bMat); legL.position.set( 0.12, 0.26, 0); g.add(legL);
  const legR = mesh(box(0.17,0.36,0.17), bMat); legR.position.set(-0.12, 0.26, 0); g.add(legR);
  // Body
  const body = mesh(box(0.48, 0.55, 0.34), bMat); body.position.y = 0.64; g.add(body);
  // Long flowing cloak — multi-part: back panel + side flaps + front slit
  const cloakBack  = mesh(box(0.50, 0.60, 0.08), hMat); cloakBack.position.set(0, 0.50, -0.21); g.add(cloakBack);
  const cloakLower = mesh(box(0.42, 0.32, 0.08), hMat); cloakLower.position.set(0, 0.14, -0.21); g.add(cloakLower);
  const cloakSideL = mesh(box(0.09, 0.62, 0.34), hMat); cloakSideL.position.set( 0.28, 0.46, -0.04); g.add(cloakSideL);
  const cloakSideR = mesh(box(0.09, 0.62, 0.34), hMat); cloakSideR.position.set(-0.28, 0.46, -0.04); g.add(cloakSideR);
  // Buckle/clasp at chest
  const clasp = mesh(box(0.10, 0.08, 0.06), M.catMetal); clasp.position.set(0, 0.82, 0.18); g.add(clasp);
  // Dagger at belt
  const dagBelt = mesh(box(0.05, 0.26, 0.05), M.catMetal); dagBelt.position.set(0.24, 0.50, 0.18); dagBelt.rotation.z = 0.35; g.add(dagBelt);
  const dagGrip  = mesh(box(0.05, 0.10, 0.05), bMat); dagGrip.position.set(0.21, 0.64, 0.18); g.add(dagGrip);
  // Arms
  const armL = mesh(box(0.14,0.48,0.14), bMat); armL.position.set( 0.32, 0.62, 0); g.add(armL);
  const armR = mesh(box(0.14,0.48,0.14), bMat); armR.position.set(-0.32, 0.62, 0); g.add(armR);
  // Head + hood
  const head = mesh(box(0.35,0.35,0.35), bMat); head.position.y = 1.1; g.add(head);
  const hood = mesh(box(0.46,0.50,0.46), hMat); hood.position.y = 1.15; g.add(hood);
  // Hood shadow peak (makes hood look pointy/deep)
  const hoodPeak = mesh(box(0.28, 0.14, 0.14), hMat); hoodPeak.position.set(0, 1.44, -0.08); g.add(hoodPeak);
  // Shadow face — dark void under hood with bright glowing eyes
  const faceShadow = mesh(box(0.30, 0.22, 0.06), M.castleDark); faceShadow.position.set(0, 1.14, 0.16); g.add(faceShadow);
  const eL = mesh(box(0.09,0.08,0.05), M.orcEye); eL.position.set( 0.08, 1.14, 0.19); g.add(eL);
  const eR = mesh(box(0.09,0.08,0.05), M.orcEye); eR.position.set(-0.08, 1.14, 0.19); g.add(eR);
  // Recurve longbow — attached to left arm, moves with it
  const bowPivot = new THREE.Group(); bowPivot.position.set(0, -0.20, 0.04); bowPivot.rotation.y = Math.PI; armL.add(bowPivot);
  const bGrip = mesh(box(0.062, 0.14, 0.07), hMat);
  const bUpA  = mesh(box(0.046, 0.23, 0.048), hMat); bUpA.position.y = 0.19; bUpA.rotation.z = -0.09;
  const bUpB  = mesh(box(0.034, 0.15, 0.038), hMat); bUpB.position.set(0.038, 0.36, 0.008); bUpB.rotation.z = -0.42;
  const bDnA  = mesh(box(0.046, 0.23, 0.048), hMat); bDnA.position.y = -0.19; bDnA.rotation.z = 0.09;
  const bDnB  = mesh(box(0.034, 0.15, 0.038), hMat); bDnB.position.set(0.038, -0.36, 0.008); bDnB.rotation.z = 0.42;
  const bStrUp = mesh(box(0.017, 0.43, 0.017), M.weapon); bStrUp.position.set(0.048, 0.21, 0.016); bStrUp.rotation.z = -0.056;
  const bStrDn = mesh(box(0.017, 0.43, 0.017), M.weapon); bStrDn.position.set(0.048, -0.21, 0.016); bStrDn.rotation.z =  0.056;
  bowPivot.add(bGrip, bUpA, bUpB, bDnA, bDnB, bStrUp, bStrDn);
  bowPivot.userData.strUp = bStrUp;
  bowPivot.userData.strDn = bStrDn;
  // Nocked arrow resting on string
  const arrowShaft = mesh(box(0.026, 0.42, 0.026), hMat); arrowShaft.position.set(-0.022, -0.04, 0);
  const arrowTip   = mesh(box(0.048, 0.085, 0.048), M.spearHead); arrowTip.position.set(-0.022, 0.17, 0);
  const fletchH    = mesh(box(0.07, 0.085, 0.016), hMat); fletchH.position.set(-0.022, -0.25, 0);
  const fletchV    = mesh(box(0.016, 0.085, 0.07), hMat); fletchV.position.set(-0.022, -0.25, 0);
  bowPivot.add(arrowShaft, arrowTip, fletchH, fletchV);
  // Quiver on back
  const quiver = mesh(box(0.13,0.44,0.13), hMat); quiver.position.set(0.2, 0.78,-0.2); g.add(quiver);
  for (let ai = 0; ai < 3; ai++) {
    const shaft = mesh(box(0.025,0.26,0.025), bMat);
    shaft.position.set(0.12 + ai*0.04, 1.0, -0.2); g.add(shaft);
  }
  // Ragged torn strips at the cloak hem — sinister, weathered silhouette (additive)
  [[-0.15,-0.06],[0,-0.10],[0.15,-0.05]].forEach(([tx,ty]) => {
    const tatter = mesh(box(0.10, 0.16, 0.06), hMat); tatter.position.set(tx, ty, -0.21); g.add(tatter);
  });
  _pushEnemy(g, 'enemyArcher', legL, legR, body, head, 1.65, chosenPath, armL, armR);
  orcs[orcs.length - 1].weapon = bowPivot;
}

// Generic Orc (grunt / brute / boss)
function spawnGenericOrc(orcType, chosenPath) {
  const type = CFG.ORC_TYPES[orcType];
  const sc = type.scale;
  const g = new THREE.Group();
  const bodyMat = (orcType === 'grunt' ? M.orcBody : orcType === 'brute' ? M.bruteBody : M.bossBody).clone();
  const headMat = (orcType === 'grunt' ? M.orcHead : orcType === 'brute' ? M.bruteBody : M.bossBody).clone();

  const legGeo = box(0.22, 0.38, 0.22);
  const legL = mesh(legGeo, bodyMat); legL.position.set( 0.16, 0.19, 0); g.add(legL);
  const legR = mesh(legGeo, bodyMat); legR.position.set(-0.16, 0.19, 0); g.add(legR);
  const body = mesh(box(0.55, 0.58, 0.38), bodyMat); body.position.y = 0.68; g.add(body);
  const armL = mesh(box(0.24, 0.44, 0.24), bodyMat); armL.position.set( 0.4, 0.62, 0); g.add(armL);
  const armR = mesh(box(0.24, 0.44, 0.24), bodyMat); armR.position.set(-0.4, 0.62, 0); g.add(armR);
  // Clawed feet — parented to the legs so they swing with each stride (bottom of leg ≈ local y -0.19)
  [legL, legR].forEach(leg => {
    const foot = mesh(box(0.26, 0.12, 0.34), bodyMat); foot.position.set(0, -0.21, 0.07); leg.add(foot);
    for (let ci = -1; ci <= 1; ci++) {
      const toe = mesh(box(0.055, 0.05, 0.08), M.orcTusk); toe.position.set(ci * 0.08, -0.24, 0.24); leg.add(toe);
    }
  });
  // Heavy fists with knuckle claws — parented to arms (bottom of arm ≈ local y -0.22)
  [armL, armR].forEach(arm => {
    const fist = mesh(box(0.27, 0.18, 0.28), bodyMat); fist.position.set(0, -0.27, 0.01); arm.add(fist);
    for (let ci = -1; ci <= 1; ci++) {
      const knuckle = mesh(box(0.05, 0.06, 0.06), M.orcTusk); knuckle.position.set(ci * 0.085, -0.30, 0.15); arm.add(knuckle);
    }
  });
  // Brow ridge over eyes
  const brow = mesh(box(0.5, 0.08, 0.12), headMat); brow.position.set(0, 1.3, 0.2); g.add(brow);
  // Nose ridge bump
  const nose = mesh(box(0.14, 0.10, 0.14), headMat); nose.position.set(0, 1.18, 0.24); g.add(nose);

  if (orcType === 'grunt') {
    // Spiked club — wooden shaft + metal nails
    const weaponG = new THREE.Group(); weaponG.position.set(-0.02, -0.18, 0.08); weaponG.rotation.x = Math.PI * 1.5; armR.add(weaponG);
    const shaft = mesh(box(0.13, 0.52, 0.13), M.trollClub); shaft.position.set(0, -0.26, 0); weaponG.add(shaft);
    const clubH  = mesh(box(0.22, 0.22, 0.22), M.trollClub); clubH.position.set(0, -0.54, 0); weaponG.add(clubH);
    // 4 metal spikes on club head
    [[0.12,0],[0,-0.12],[-0.12,0],[0,0.12]].forEach(([sx,sz]) => {
      const nail = mesh(box(0.06, 0.06, 0.06), M.catMetal); nail.position.set(sx, -0.58, sz); weaponG.add(nail);
    });
    // Crude leather loincloth flap
    const loin = mesh(box(0.28, 0.24, 0.08), M.arcBelt); loin.position.set(0, 0.42, 0.22); g.add(loin);
    // Savage fur shoulder mantle + a bone trophy necklace (additive, rig-safe)
    const mantle  = mesh(box(0.66, 0.16, 0.46), M.arcBelt);   mantle.position.set(0, 0.93, -0.02); g.add(mantle);
    const mantleR = mesh(box(0.70, 0.10, 0.40), M.spLeather); mantleR.position.set(0, 0.86, -0.04); g.add(mantleR);
    const boneNeck = mesh(box(0.34, 0.05, 0.09), M.orcTusk);  boneNeck.position.set(0, 0.84, 0.19); g.add(boneNeck);
    [-0.10, 0, 0.10].forEach(bx => { const fang = mesh(box(0.04, 0.10, 0.04), M.orcTusk); fang.position.set(bx, 0.78, 0.20); g.add(fang); });
  }

  if (orcType === 'brute') {
    // Heavy shoulder pads
    const padL = mesh(box(0.22,0.18,0.38), M.catMetal); padL.position.set( 0.4, 0.86, 0); g.add(padL);
    const padR = mesh(box(0.22,0.18,0.38), M.catMetal); padR.position.set(-0.4, 0.86, 0); g.add(padR);
    const padSL = mesh(box(0.06,0.12,0.44), M.catMetal); padSL.position.set( 0.47, 0.86, 0); g.add(padSL);
    const padSR = mesh(box(0.06,0.12,0.44), M.catMetal); padSR.position.set(-0.47, 0.86, 0); g.add(padSR);
    // Chest plate
    const chest = mesh(box(0.46, 0.44, 0.08), M.catMetal); chest.position.set(0, 0.72, 0.22); g.add(chest);
    // Big double-headed axe
    const axeShaft = mesh(box(0.09, 0.72, 0.09), M.trollClub); axeShaft.position.set(-0.08, -0.34, 0.08); armR.add(axeShaft);
    const axeHeadT = mesh(box(0.38, 0.16, 0.09), M.catMetal); axeHeadT.position.set(-0.08,  0.04, 0.08); armR.add(axeHeadT);
    const axeHeadB = mesh(box(0.32, 0.14, 0.09), M.catMetal); axeHeadB.position.set(-0.08, -0.10, 0.08); armR.add(axeHeadB);
    // Iron shoulder spikes + a ragged war-banner lashed to the back (additive)
    [[0.43,0.10],[0.43,-0.10],[-0.43,0.10],[-0.43,-0.10]].forEach(([sx,sz]) => {
      const spike = mesh(box(0.07, 0.20, 0.07), M.orcTusk); spike.position.set(sx, 1.02, sz); g.add(spike);
    });
    const bnPole  = mesh(box(0.05, 0.96, 0.05), M.trollClub); bnPole.position.set(0.30, 1.05, -0.22); g.add(bnPole);
    const bnFlag  = mesh(box(0.04, 0.36, 0.34), M.bruteBody); bnFlag.position.set(0.30, 1.34, -0.40); g.add(bnFlag);
    const bnSkull = mesh(box(0.10, 0.10, 0.08), M.orcTusk);   bnSkull.position.set(0.30, 1.56, -0.22); g.add(bnSkull); // skull finial
  }

  if (orcType === 'boss') {
    // Boss armor — full plate set
    const padL = mesh(box(0.26,0.22,0.44), M.catMetal); padL.position.set( 0.44, 0.88, 0); g.add(padL);
    const padR = mesh(box(0.26,0.22,0.44), M.catMetal); padR.position.set(-0.44, 0.88, 0); g.add(padR);
    const plateFront = mesh(box(0.52, 0.50, 0.08), M.catMetal); plateFront.position.set(0, 0.72, 0.22); g.add(plateFront);
    const plateBack  = mesh(box(0.52, 0.50, 0.08), M.catMetal); plateBack.position.set(0, 0.72, -0.22); g.add(plateBack);
    // Boss greatsword
    const gsShaft = mesh(box(0.10, 0.20, 0.10), M.trollClub); gsShaft.position.set(-0.04, -0.30, 0.08); armR.add(gsShaft);
    const gsGuard = mesh(box(0.46, 0.09, 0.09), M.catMetal); gsGuard.position.set(-0.04, -0.14, 0.08); armR.add(gsGuard);
    const gsBlade = mesh(box(0.09, 0.72, 0.06), M.weapon); gsBlade.position.set(-0.04,  0.28, 0.08); armR.add(gsBlade);
    const gsTip   = mesh(box(0.06, 0.18, 0.04), M.weapon); gsTip.position.set(-0.04,  0.70, 0.08); armR.add(gsTip);
    // Tattered warlord cape hanging from a gold gorget (additive, rig-safe)
    const capeGorget = mesh(box(0.56, 0.10, 0.07), M.castleFlagPole); capeGorget.position.set(0, 0.96, -0.20); g.add(capeGorget);
    const capeWarU   = mesh(box(0.54, 0.52, 0.05), M.bossBody);       capeWarU.position.set(0, 0.62, -0.245); g.add(capeWarU);
    const capeWarL   = mesh(box(0.46, 0.26, 0.05), M.bossBody);       capeWarL.position.set(0, 0.27, -0.27); capeWarL.rotation.x = -0.05; g.add(capeWarL);
  }

  const headSize = orcType === 'boss' ? 0.50 : 0.44;
  const head = mesh(box(headSize, headSize, headSize), headMat); head.position.y = 1.17; g.add(head);
  const eyeMat = orcType === 'brute' ? M.bruteEye : M.orcEye;
  const eL = mesh(box(0.1,0.08,0.07), eyeMat); eL.position.set( 0.13, 1.22, 0.23); g.add(eL);
  const eR = mesh(box(0.1,0.08,0.07), eyeMat); eR.position.set(-0.13, 1.22, 0.23); g.add(eR);
  const tL = mesh(box(0.07,0.16,0.07), M.orcTusk); tL.position.set( 0.10, 1.01, 0.21); tL.rotation.z =  0.15; g.add(tL);
  const tR = mesh(box(0.07,0.16,0.07), M.orcTusk); tR.position.set(-0.10, 1.01, 0.21); tR.rotation.z = -0.15; g.add(tR);
  // Pointed orc ears jutting from the sides of the head
  const earOff = headSize * 0.52;
  const earL = mesh(box(0.07, 0.20, 0.11), headMat); earL.position.set( earOff, 1.22, -0.02); earL.rotation.z = -0.5; g.add(earL);
  const earR = mesh(box(0.07, 0.20, 0.11), headMat); earR.position.set(-earOff, 1.22, -0.02); earR.rotation.z =  0.5; g.add(earR);

  if (orcType === 'boss') {
    // Crown — spiky gold circlet with 5 spikes
    const crownBase = mesh(box(0.54,0.10,0.54), M.castleFlagPole); crownBase.position.y = 1.46; g.add(crownBase);
    for (let ci = 0; ci < 5; ci++) {
      const angle = (ci / 5) * Math.PI * 2;
      const spike = mesh(box(0.07,0.22,0.07), M.castleFlagPole);
      spike.position.set(Math.cos(angle)*0.22, 1.62, Math.sin(angle)*0.22); g.add(spike);
    }
    // Glowing crown gem
    const gemMat = new THREE.MeshStandardMaterial({ color: 0xff0040, emissive: 0xff0040, emissiveIntensity: 2.0 });
    const gem = new THREE.Mesh(box(0.10, 0.12, 0.10), gemMat); gem.position.set(0, 1.62, 0.22); g.add(gem);
  }

  const isElite = _nextEnemyIsElite; _nextEnemyIsElite = false;
  const eliteSc = isElite ? sc * 1.15 : sc;
  const hpBar = makeHPBar(g, 1.7 * (orcType === 'boss' ? 1.2 : 1.0), isElite ? 0x664400 : (_HP_BAR_TINT[orcType] ?? null));
  if (isElite) {
    [eL, eR].forEach(e => { e.material = e.material.clone(); e.material.color.setHex(0xffcc00); e.material.emissive?.setHex(0xffaa00); e.material.emissiveIntensity = 3.0; });
  }
  g.scale.setScalar(eliteSc);
  g.position.set(chosenPath[0][0], 0, chosenPath[0][1]);
  scene.add(g);
  const baseHp = Math.round((isElite ? type.hp * 2 : type.hp) * difficultyMult.hp);
  orcs.push({
    group: g, type: orcType, isElite,
    path: chosenPath,
    pathIndex: 0, progress: 0,
    hp: baseHp, maxHp: baseHp, alive: true,
    speed: (isElite ? type.speed * 1.3 : type.speed) * rageMultiplier * difficultyMult.speed,
    castleDmg: type.castleDmg, reward: Math.round((isElite ? type.reward * 2 : type.reward) * (difficultyMult.rewardMult || 1)),
    animTime: Math.random() * Math.PI * 2,
    legL, legR, armL, armR, hpBar, scale: eliteSc,
    hitFlashTimer: 0,
    hitFlashMeshes: [body, head],
    hitRecoilT: 0, hitRecoilDir: 1,
    squashT: 0, prevGs: 0,       // squash-and-stretch
    leanX: 0.09, hitLeanX: 0,    // procedural lean
    slowTimer: 0, slowAmount: 1.0,
    blockedByWall: null,
    wallAttackTimer: 0,
    wallSlotIdx: -1,
    wallTargetX: null, wallTargetZ: null,
    castleSlotIdx: -1,
    castleTargetZ: null,
    fightingDefender: null,
    defAttackTimer: 0,
    attackSlot: -1,
    chasingDefender: null,
  });
}

// ─────────────────────────────────────────────
//  EXPLODER — stocky orc with glowing belly; AoE detonates on death
// ─────────────────────────────────────────────
function spawnExploder(chosenPath) {
  const g = new THREE.Group();
  const bMat = M.exploderBody;
  const legL = mesh(box(0.24, 0.32, 0.24), bMat); legL.position.set( 0.17, 0.16, 0); g.add(legL);
  const legR = mesh(box(0.24, 0.32, 0.24), bMat); legR.position.set(-0.17, 0.16, 0); g.add(legR);
  // Bloated body with glowing volatile belly
  const torso = mesh(box(0.62, 0.58, 0.52), bMat); torso.position.y = 0.66; g.add(torso);
  const belly = mesh(box(0.46, 0.34, 0.38), M.exploderBelly); belly.position.set(0, 0.60, 0.12); g.add(belly);
  // Warning stripes (dark horizontal bands)
  const stripeA = mesh(box(0.48, 0.06, 0.40), M.trollClub); stripeA.position.set(0, 0.55, 0.12); g.add(stripeA);
  const stripeB = mesh(box(0.48, 0.06, 0.40), M.trollClub); stripeB.position.set(0, 0.70, 0.12); g.add(stripeB);
  const armL = mesh(box(0.22, 0.40, 0.22), bMat); armL.position.set( 0.44, 0.60, 0); g.add(armL);
  const armR = mesh(box(0.22, 0.40, 0.22), bMat); armR.position.set(-0.44, 0.60, 0); g.add(armR);
  // Stubby feet — parented to legs (bottom of leg ≈ local y -0.16)
  [legL, legR].forEach(leg => {
    const foot = mesh(box(0.28, 0.10, 0.32), M.trollClub); foot.position.set(0, -0.17, 0.06); leg.add(foot);
  });
  // Clawed hands — parented to arms (bottom ≈ local y -0.20)
  [armL, armR].forEach(arm => {
    const hand = mesh(box(0.24, 0.16, 0.24), bMat); hand.position.set(0, -0.24, 0.01); arm.add(hand);
    for (let ci = -1; ci <= 1; ci++) {
      const claw = mesh(box(0.045, 0.05, 0.07), M.orcTusk); claw.position.set(ci * 0.075, -0.27, 0.13); arm.add(claw);
    }
  });
  const head = mesh(box(0.46, 0.42, 0.42), bMat); head.position.y = 1.12; g.add(head);
  const eL = mesh(box(0.10, 0.09, 0.07), M.exploderBelly); eL.position.set( 0.14, 1.17, 0.22); g.add(eL);
  const eR = mesh(box(0.10, 0.09, 0.07), M.exploderBelly); eR.position.set(-0.14, 1.17, 0.22); g.add(eR);
  // Glowing volatile cracks radiating across the torso — telegraphs the bomb
  const crackV = mesh(box(0.05, 0.30, 0.02), M.exploderBelly); crackV.position.set(-0.14, 0.72, 0.39); crackV.rotation.z = 0.4; g.add(crackV);
  const crackH = mesh(box(0.26, 0.045, 0.02), M.exploderBelly); crackH.position.set( 0.12, 0.80, 0.39); crackH.rotation.z = 0.25; g.add(crackH);
  // Lit fuse sprouting from the back/top — dark cord with a glowing ember tip
  const fuseCord = mesh(box(0.05, 0.22, 0.05), M.trollClub); fuseCord.position.set(0.10, 1.42, -0.06); fuseCord.rotation.z = -0.3; g.add(fuseCord);
  const fuseEmber = mesh(box(0.09, 0.09, 0.09), M.exploderBelly); fuseEmber.position.set(0.17, 1.54, -0.06); g.add(fuseEmber);
  // Jagged scrap-metal shrapnel embedded in the hide — telegraphs a deadly blast (additive)
  [[0.30,0.74,0.28,0.5],[-0.28,0.58,0.30,-0.6],[0.12,0.88,0.26,0.2],[-0.16,0.48,0.30,-0.35],[0.26,0.44,0.28,0.7]].forEach(([sx,sy,sz,rz]) => {
    const shard = mesh(box(0.06, 0.17, 0.06), M.catMetal); shard.position.set(sx, sy, sz); shard.rotation.z = rz; shard.rotation.x = -0.4; g.add(shard);
  });
  _pushEnemy(g, 'exploder', legL, legR, torso, head, 1.55, chosenPath, armL, armR);
  // Attach belly + eye refs so the update loop can pulse them (ember pulses with the belly)
  const last = orcs[orcs.length - 1];
  last.belly = belly; last.bellyEyeL = eL; last.bellyEyeR = eR; last.fuseEmber = fuseEmber;
}

// ─────────────────────────────────────────────
//  HEALER ORC — shaman with glowing staff; heals nearby allies
// ─────────────────────────────────────────────
function spawnHealerOrc(chosenPath) {
  const g = new THREE.Group();
  const bMat = M.healerBody;
  const legL = mesh(box(0.20, 0.34, 0.20), bMat); legL.position.set( 0.14, 0.17, 0); g.add(legL);
  const legR = mesh(box(0.20, 0.34, 0.20), bMat); legR.position.set(-0.14, 0.17, 0); g.add(legR);
  const body = mesh(box(0.50, 0.54, 0.36), bMat); body.position.y = 0.65; g.add(body);
  // Hunched shaman back-hump — rounded mass on the upper back with hanging bone fetishes
  const hump = mesh(box(0.46, 0.40, 0.28), bMat); hump.position.set(0, 0.86, -0.18); g.add(hump);
  const fetishA = mesh(box(0.05, 0.18, 0.05), M.orcTusk); fetishA.position.set( 0.18, 0.70, -0.28); fetishA.rotation.z = 0.12; g.add(fetishA);
  const fetishB = mesh(box(0.05, 0.14, 0.05), M.orcTusk); fetishB.position.set(-0.16, 0.66, -0.28); fetishB.rotation.z = -0.1; g.add(fetishB);
  // Bone-and-bead necklace
  const beadA = mesh(box(0.06, 0.06, 0.06), M.orcTusk); beadA.position.set( 0.12, 0.86, 0.20); g.add(beadA);
  const beadB = mesh(box(0.06, 0.06, 0.06), M.orcTusk); beadB.position.set(-0.12, 0.86, 0.20); g.add(beadB);
  const beadC = mesh(box(0.06, 0.06, 0.06), M.orcTusk); beadC.position.set(0, 0.90, 0.22); g.add(beadC);
  const armL = mesh(box(0.20, 0.40, 0.20), bMat); armL.position.set( 0.38, 0.60, 0); g.add(armL);
  const armR = mesh(box(0.20, 0.40, 0.20), bMat); armR.position.set(-0.38, 0.60, 0); g.add(armR);
  // Bare feet — parented to legs (bottom of leg ≈ local y -0.17)
  [legL, legR].forEach(leg => {
    const foot = mesh(box(0.22, 0.09, 0.28), M.arcBelt); foot.position.set(0, -0.18, 0.05); leg.add(foot);
  });
  // Gnarled hands — parented to arms (bottom ≈ local y -0.20); left hand open, right grips the staff
  const handL = mesh(box(0.21, 0.14, 0.21), bMat); handL.position.set(0, -0.24, 0.01); armL.add(handL);
  for (let ci = -1; ci <= 1; ci++) {
    const claw = mesh(box(0.04, 0.05, 0.06), M.orcTusk); claw.position.set(ci * 0.07, -0.27, 0.12); armL.add(claw);
  }
  const handR = mesh(box(0.21, 0.16, 0.21), bMat); handR.position.set(0, -0.22, 0.04); armR.add(handR);
  // Staff in right arm — tall with glowing crystal tip
  const staffShaft = mesh(box(0.07, 0.72, 0.07), M.mageStaff); staffShaft.position.set(0, -0.28, 0.06); armR.add(staffShaft);
  const staffHead  = mesh(box(0.18, 0.22, 0.18), M.healerGlow); staffHead.position.set(0, 0.14, 0.06); armR.add(staffHead);
  const staffTip   = mesh(box(0.10, 0.12, 0.10), M.healerGlow); staffTip.position.set(0, 0.30, 0.06); armR.add(staffTip);
  const head = mesh(box(0.42, 0.40, 0.40), bMat); head.position.y = 1.10; g.add(head);
  // Bone headband
  const hband = mesh(box(0.48, 0.10, 0.10), M.orcTusk); hband.position.set(0, 1.30, 0.22); g.add(hband);
  const eL = mesh(box(0.09, 0.08, 0.07), M.orcEye); eL.position.set( 0.13, 1.14, 0.21); g.add(eL);
  const eR = mesh(box(0.09, 0.08, 0.07), M.orcEye); eR.position.set(-0.13, 1.14, 0.21); g.add(eR);
  // Shaman skull-totem lashed below the staff crystal, with glowing eye sockets (additive)
  const totemSkull = mesh(box(0.17, 0.16, 0.14), M.orcTusk);   totemSkull.position.set(0, -0.02, 0.06); armR.add(totemSkull);
  const totemJaw   = mesh(box(0.14, 0.05, 0.11), M.orcTusk);   totemJaw.position.set(0, -0.11, 0.09);  armR.add(totemJaw);
  const totemEyeL  = mesh(box(0.045,0.05, 0.03), M.healerGlow); totemEyeL.position.set( 0.045, 0.0, 0.13); armR.add(totemEyeL);
  const totemEyeR  = mesh(box(0.045,0.05, 0.03), M.healerGlow); totemEyeR.position.set(-0.045, 0.0, 0.13); armR.add(totemEyeR);
  const fetishC    = mesh(box(0.05, 0.16, 0.05), M.orcTusk);   fetishC.position.set(0, 0.60, -0.30); g.add(fetishC); // extra back charm
  _pushEnemy(g, 'healerOrc', legL, legR, body, head, 1.60, chosenPath, armL, armR);
}

// ─────────────────────────────────────────────
//  ORC MAGE — fat evil warlock; fires dark magic bolts at defenders
// ─────────────────────────────────────────────
function spawnOrcMage(chosenPath) {
  const g = new THREE.Group();
  const bMat = M.orcMageSkin.clone();
  const rMat = M.orcMageRobe.clone();
  const hMat = M.orcMageHat.clone();
  // Short wide legs
  const legL = mesh(box(0.28, 0.34, 0.28), rMat); legL.position.set( 0.18, 0.18, 0); g.add(legL);
  const legR = mesh(box(0.28, 0.34, 0.28), rMat); legR.position.set(-0.18, 0.18, 0); g.add(legR);
  // Fat round body
  const body = mesh(box(0.74, 0.64, 0.56), rMat); body.position.y = 0.72; g.add(body);
  // Belly bulge — fat gut
  const belly = mesh(box(0.56, 0.38, 0.20), rMat); belly.position.set(0, 0.63, 0.30); g.add(belly);
  const bellyFat = mesh(box(0.38, 0.24, 0.16), bMat); bellyFat.position.set(0, 0.63, 0.40); g.add(bellyFat);
  // Robe hem strips
  const hemF = mesh(box(0.76, 0.18, 0.08), rMat); hemF.position.set(0, 0.42, 0.25); g.add(hemF);
  const hemL = mesh(box(0.08, 0.18, 0.32), rMat); hemL.position.set( 0.40, 0.42, 0); g.add(hemL);
  const hemR = mesh(box(0.08, 0.18, 0.32), rMat); hemR.position.set(-0.40, 0.42, 0); g.add(hemR);
  // Belt
  const belt = mesh(box(0.76, 0.09, 0.52), hMat); belt.position.y = 0.49; g.add(belt);
  const buckle = mesh(box(0.14, 0.12, 0.10), M.catMetal); buckle.position.set(0, 0.49, 0.29); g.add(buckle);
  // Short chubby arms
  const armL = mesh(box(0.24, 0.38, 0.24), rMat); armL.position.set( 0.52, 0.76, 0); g.add(armL);
  const armR = mesh(box(0.24, 0.38, 0.24), rMat); armR.position.set(-0.52, 0.76, 0); g.add(armR);
  // Fat round head
  const head = mesh(box(0.54, 0.52, 0.50), bMat); head.position.y = 1.24; g.add(head);
  // Heavy brow ridge
  const brow = mesh(box(0.56, 0.11, 0.12), bMat); brow.position.set(0, 1.44, 0.24); g.add(brow);
  // Wide flat nose
  const nose = mesh(box(0.24, 0.13, 0.17), bMat); nose.position.set(0, 1.30, 0.27); g.add(nose);
  // Evil glowing eyes
  const eL = mesh(box(0.13, 0.10, 0.07), M.orcMageEye); eL.position.set( 0.15, 1.38, 0.26); g.add(eL);
  const eR = mesh(box(0.13, 0.10, 0.07), M.orcMageEye); eR.position.set(-0.15, 1.38, 0.26); g.add(eR);
  // Tusks
  const tL = mesh(box(0.08, 0.17, 0.08), M.orcTusk); tL.position.set( 0.15, 1.09, 0.25); tL.rotation.z =  0.18; g.add(tL);
  const tR = mesh(box(0.08, 0.17, 0.08), M.orcTusk); tR.position.set(-0.15, 1.09, 0.25); tR.rotation.z = -0.18; g.add(tR);
  // Pointy warlock hat — wide brim + tapered cone
  const hatBrim = mesh(box(0.82, 0.07, 0.82), hMat); hatBrim.position.y = 1.58; g.add(hatBrim);
  // Bone hat-band (was swGold — but swGold is now the defender blue accent, so enemies use bone/tusk here instead)
  const hatBand = mesh(box(0.56, 0.08, 0.56), M.orcTusk); hatBand.position.y = 1.60; g.add(hatBand);
  const hatLow  = mesh(box(0.54, 0.28, 0.54), hMat); hatLow.position.y = 1.72; g.add(hatLow);
  const hatMid  = mesh(box(0.40, 0.26, 0.40), hMat); hatMid.position.y = 1.96; g.add(hatMid);
  const hatTop  = mesh(box(0.24, 0.22, 0.24), hMat); hatTop.position.y = 2.16; g.add(hatTop);
  const hatTip  = mesh(box(0.10, 0.18, 0.10), hMat); hatTip.position.y = 2.30; g.add(hatTip);
  // Staff — parented to armR so it rotates with the arm
  const staffPivot = new THREE.Group(); staffPivot.position.set(0, -0.18, 0.05); armR.add(staffPivot);
  const sShaft1 = mesh(box(0.07, 0.50, 0.07), M.mageStaff); sShaft1.position.y = 0.00; staffPivot.add(sShaft1);
  const sShaft2 = mesh(box(0.07, 0.50, 0.07), M.mageStaff); sShaft2.position.y = 0.50; staffPivot.add(sShaft2);
  const sShaft3 = mesh(box(0.07, 0.50, 0.07), M.mageStaff); sShaft3.position.y = 1.00; staffPivot.add(sShaft3);
  // Staff head — gnarled fork holding the orb
  const sHead   = mesh(box(0.18, 0.14, 0.18), M.mageStaff); sHead.position.y = 1.57; staffPivot.add(sHead);
  const sClawL  = mesh(box(0.06, 0.22, 0.06), M.mageStaff); sClawL.position.set( 0.12, 1.68, 0); sClawL.rotation.z = -0.38; staffPivot.add(sClawL);
  const sClawR  = mesh(box(0.06, 0.22, 0.06), M.mageStaff); sClawR.position.set(-0.12, 1.68, 0); sClawR.rotation.z =  0.38; staffPivot.add(sClawR);
  // Glowing dark orb — unique per-enemy clone so we can animate its emissiveIntensity
  const staffOrb = mesh(box(0.24, 0.24, 0.24), M.orcMageOrbMat.clone()); staffOrb.position.y = 1.73; staffPivot.add(staffOrb);
  // Skull talisman hung from the belt + curved shoulder horns — dark-sorcerer menace (additive)
  const talis    = mesh(box(0.12, 0.12, 0.07), M.orcTusk); talis.position.set(0.22, 0.44, 0.29); g.add(talis);
  const talisJaw = mesh(box(0.10, 0.05, 0.06), M.orcTusk); talisJaw.position.set(0.22, 0.38, 0.30); g.add(talisJaw);
  const shHornL  = mesh(box(0.08, 0.20, 0.08), M.orcTusk); shHornL.position.set( 0.50, 1.00, 0); shHornL.rotation.z =  0.35; g.add(shHornL);
  const shHornR  = mesh(box(0.08, 0.20, 0.08), M.orcTusk); shHornR.position.set(-0.50, 1.00, 0); shHornR.rotation.z = -0.35; g.add(shHornR);
  _pushEnemy(g, 'orcMage', legL, legR, body, head, 2.1, chosenPath, armL, armR);
  orcs[orcs.length - 1].staffOrb = staffOrb;
}

// Master spawn dispatcher — picks a random path
function spawnRockTroll(chosenPath) {
  const g = new THREE.Group();
  // Massive stone-grey legs
  const legL = mesh(box(0.38, 0.55, 0.38), M.rockTrollMat); legL.position.set( 0.25, 0.27, 0); g.add(legL);
  const legR = mesh(box(0.38, 0.55, 0.38), M.rockTrollMat); legR.position.set(-0.25, 0.27, 0); g.add(legR);
  // Heavy stone plating on knees
  const kneeL = mesh(box(0.34, 0.14, 0.16), M.catMetal); kneeL.position.set( 0.25, 0.42, 0.10); g.add(kneeL);
  const kneeR = mesh(box(0.34, 0.14, 0.16), M.catMetal); kneeR.position.set(-0.25, 0.42, 0.10); g.add(kneeR);
  const body = mesh(box(0.92, 0.78, 0.62), M.rockTrollMat); body.position.y = 0.88; g.add(body);
  // Boulder-encrusted shoulders
  const boulderL = mesh(box(0.30, 0.28, 0.28), M.rockTrollMat); boulderL.position.set( 0.66, 1.08, 0); g.add(boulderL);
  const boulderR = mesh(box(0.30, 0.28, 0.28), M.rockTrollMat); boulderR.position.set(-0.66, 1.08, 0); g.add(boulderR);
  // Rock chip accents on shoulders
  [[0.72,1.22,0.10],[0.60,1.28,-0.08],[-0.72,1.22,0.10],[-0.60,1.28,-0.08]].forEach(([px,py,pz]) => {
    const chip = mesh(box(0.12, 0.10, 0.10), M.catMetal); chip.position.set(px, py, pz); g.add(chip);
  });
  const armL = mesh(box(0.34, 0.72, 0.34), M.rockTrollMat); armL.position.set( 0.64, 0.78, 0); g.add(armL);
  const armR = mesh(box(0.34, 0.72, 0.34), M.rockTrollMat); armR.position.set(-0.64, 0.78, 0); g.add(armR);
  // Boulder in right hand
  const heldRock = mesh(box(0.38, 0.34, 0.38), M.rockTrollMat); heldRock.position.set(0, -0.45, 0.18); armR.add(heldRock);
  const head = mesh(box(0.72, 0.62, 0.66), M.rockTrollMat); head.position.y = 1.44; g.add(head);
  // Craggy brow
  const brow = mesh(box(0.76, 0.14, 0.18), M.rockTrollMat); brow.position.set(0, 1.62, 0.30); g.add(brow);
  const nose = mesh(box(0.20, 0.16, 0.12), M.rockTrollMat); nose.position.set(0, 1.46, 0.36); g.add(nose);
  // Eyes — fiery orange
  const eL = mesh(box(0.13, 0.13, 0.08), M.rockTrollEye); eL.position.set( 0.19, 1.54, 0.34); g.add(eL);
  const eR = mesh(box(0.13, 0.13, 0.08), M.rockTrollEye); eR.position.set(-0.19, 1.54, 0.34); g.add(eR);
  // Stone teeth
  [[0.12,1.30,0.36],[0,1.28,0.38],[-0.12,1.30,0.36]].forEach(([px,py,pz]) => {
    const t = mesh(box(0.08, 0.18, 0.08), M.catMetal); t.position.set(px, py, pz); g.add(t);
  });
  // Molten crystal growths bursting from the stone — reads as a glowing-core golem (additive)
  [[0.66,1.26,0.12,0.13],[-0.62,1.16,0.14,0.11],[0.16,1.02,0.34,0.11],[-0.22,0.84,0.32,0.09],[0.40,0.66,0.30,0.08]].forEach(([cx,cy,cz,cs]) => {
    const shard = mesh(box(cs, cs*1.7, cs), M.rockTrollEye); shard.position.set(cx, cy, cz); shard.rotation.z = cx * 0.35; shard.rotation.x = -0.2; g.add(shard);
  });
  _pushEnemy(g, 'rockTroll', legL, legR, body, head, 2.3, chosenPath, armL, armR);
}

// Per-wave enemy-per-path tally so path selection stays balanced across the 3 roads.
// Reset at wave start. Random pure-RNG path picking was high-variance on small queues
// (a trimmed boss wave could leave one path empty); this keeps distribution ±1 across paths.
let _pathSpawnCounts = [0, 0, 0];
// When set, the next orc is forced onto this path instead of balanced selection.
// Used to lock the boss and his retinue onto a single road for dramatic coherence.
let _forcedSpawnPath = null;

function spawnOrc(orcType) {
  // Defensive: empty/undefined token can occur if queue manipulation races with spawner
  if (!orcType || typeof orcType !== 'string') return;
  // Boss retinue: 'retinue:<type>' spawns as elite AND shares the boss path
  let forceBossPath = false;
  if (orcType.startsWith('retinue:')) { _nextEnemyIsElite = true; forceBossPath = true; orcType = orcType.slice(8); }
  else if (orcType.startsWith('elite:')) { _nextEnemyIsElite = true; orcType = orcType.slice(6); }
  const validPaths = PATHS.filter(p => p.length > 0);
  if (validPaths.length === 0) return;
  let chosenPath;
  if (_forcedSpawnPath && validPaths.includes(_forcedSpawnPath)) {
    chosenPath = _forcedSpawnPath;
  } else if (orcType === '__levelBoss' || forceBossPath) {
    // Lock boss path once — first retinue member or the boss itself decides the road
    _forcedSpawnPath = validPaths[Math.floor(Math.random() * validPaths.length)];
    chosenPath = _forcedSpawnPath;
  } else {
    // Balanced: pick the path with the fewest spawns so far; tie-break randomly
    let minCount = Infinity;
    const candidates = [];
    for (let i = 0; i < validPaths.length; i++) {
      const origIdx = PATHS.indexOf(validPaths[i]);
      const c = _pathSpawnCounts[origIdx] || 0;
      if (c < minCount) { minCount = c; candidates.length = 0; candidates.push(origIdx); }
      else if (c === minCount) { candidates.push(origIdx); }
    }
    const pickIdx = candidates[Math.floor(Math.random() * candidates.length)];
    chosenPath = PATHS[pickIdx];
    _pathSpawnCounts[pickIdx] = (_pathSpawnCounts[pickIdx] || 0) + 1;
  }
  if (orcType === '__levelBoss') return spawnLevelBoss(chosenPath);
  if (orcType === 'troll')       return spawnTroll(chosenPath);
  if (orcType === 'rockTroll')   return spawnRockTroll(chosenPath);
  if (orcType === 'skeleton')    return spawnSkeleton(chosenPath);
  if (orcType === 'wolf')        return spawnWolf(chosenPath);
  if (orcType === 'spider')      return spawnSpider(chosenPath);
  if (orcType === 'cyclops')     return spawnCyclops(chosenPath);
  if (orcType === 'enemyArcher') return spawnEnemyArcher(chosenPath);
  if (orcType === 'exploder')    return spawnExploder(chosenPath);
  if (orcType === 'healerOrc')   return spawnHealerOrc(chosenPath);
  if (orcType === 'orcMage')     return spawnOrcMage(chosenPath);
  spawnGenericOrc(orcType, chosenPath);
}

// ─────────────────────────────────────────────
//  LEVEL BOSS — unique end-of-level boss.
//  Builds on the generic 'boss' mesh, then post-processes materials (body + head clones of
//  M.bossBody, identifiable by original color 0x200832) to apply a level-specific tint.
//  Scale, HP, reward, and castle damage are all multiplied so each boss feels like a fight.
// ─────────────────────────────────────────────
function spawnLevelBoss(chosenPath) {
  const cfg = currentLevel?.boss;
  // Fallback: no boss config → spawn a regular boss and return
  if (!cfg) { spawnGenericOrc('boss', chosenPath); return; }
  spawnGenericOrc('boss', chosenPath);
  const o = orcs[orcs.length - 1];
  if (!o) return;
  // Up-scale the whole group on top of whatever scale spawnGenericOrc set
  const newScale = (o.scale || 1) * (cfg.scale || 1.5);
  o.group.scale.setScalar(newScale);
  o.scale = newScale;
  // Recolor only the cloned body+head materials (original boss color is 0x200832)
  const baseColor = 0x200832;
  const targetCol = new THREE.Color(cfg.bodyColor);
  o.group.traverse(m => {
    if (m.isMesh && m.material && m.material.color && m.material.color.getHex() === baseColor) {
      m.material.color.copy(targetCol);
    }
  });
  // HP + reward + castle damage multipliers (maxHp already has difficulty scaling baked in)
  const bossHp = Math.max(1, Math.round(o.maxHp * (cfg.hpMult || 3)));
  o.hp = bossHp; o.maxHp = bossHp;
  o.reward    = Math.round(o.reward    * (cfg.rewardMult    || 5));
  o.castleDmg = Math.round(o.castleDmg * (cfg.castleDmgMult || 1.5));
  // Mark as a level boss — handy for any future UI hooks
  o.isLevelBoss = true;
  o.bossName    = cfg.name;
  // Active boss attack: ground-slam AoE that hits nearby defenders. Tuned per level.
  o.slamRange   = cfg.slamRange ?? 3.0;
  o.slamRate    = cfg.slamRate  ?? 0.55;
  o.slamDmg     = cfg.slamDmg   ?? 6;
  o.slamColor   = cfg.slamColor ?? 0xff2244;
  o.slamCooldown = 1.5; // short wind-up before first slam so it isn't instant on spawn
  // Per-boss explode override (e.g. Ignarok the Flame Tyrant detonates on death)
  if (cfg.explodesOnDeath) {
    o.explodesOnDeath = true;
    o.explodeRadius   = cfg.explodeRadius || 4.0;
    o.explodeDmg      = cfg.explodeDmg    || 12;
  }
  // Dramatic entrance: full-screen boss banner + dedicated horn fanfare
  showBossBanner(cfg.name);
  try { SND.bossSpawn?.(); } catch (_) {}
}

// ─────────────────────────────────────────────
//  WALL-ON-PATH HELPER
// ─────────────────────────────────────────────
function getWallAtPath(col, row) {
  for (const d of defenders) {
    if (d.alive && d.type === 'wall' && d.col === col && d.row === row) return d;
  }
  return null;
}


// Snap an enemy back onto its path at the nearest waypoint (used after off-path chase)
function returnToPath(o) {
  let bestIdx = 0, bestDist = Infinity;
  const px = o.group.position.x, pz = o.group.position.z;
  for (let i = 0; i < o.path.length - 1; i++) {
    const [pc, pr] = o.path[i];
    const d2 = (px - pc) * (px - pc) + (pz - pr) * (pz - pr);
    if (d2 < bestDist) { bestDist = d2; bestIdx = i; }
  }
  o.pathIndex = bestIdx;
  o.progress  = 0;
  o.chasingDefender = null; // clear stale chase so enemy doesn't resume old pursuit
  o._lungeBase = null;
  o.group.rotation.x = 0;
  o.group.rotation.y = 0;
  o.group.rotation.z = 0;
  o.swingPhase = 0;
}

// ── Attack-slot system: enemies fan out in concentric rings around a target ──
// Ring 0 (slots  0-3): dist 1.0, angles   0°/ 90°/180°/270°
// Ring 1 (slots  4-7): dist 2.0, angles  45°/135°/225°/315°
// Ring 2 (slots 8-11): dist 3.0, angles   0°/ 90°/180°/270° …
const defenderSlots = new WeakMap();
function getDefSlots(def) {
  if (!defenderSlots.has(def)) defenderSlots.set(def, []);
  return defenderSlots.get(def);
}
function acquireAttackSlot(def, orc) {
  const s = getDefSlots(def);
  const ex = s.indexOf(orc); if (ex >= 0) return ex;
  const maxSlots = CFG.STATS[def.type]?.maxSlots ?? Infinity;
  let active = 0; for (let i = 0; i < s.length; i++) if (s[i] !== null) active++;
  if (active >= maxSlots) return -1; // defender is at capacity
  for (let i = 0; i < s.length; i++) { if (s[i] === null) { s[i] = orc; return i; } }
  s.push(orc); return s.length - 1; // auto-expand to next ring
}
function releaseAttackSlot(def, orc) {
  if (!defenderSlots.has(def)) return;
  const s = defenderSlots.get(def);
  const i = s.indexOf(orc); if (i >= 0) s[i] = null;
}
function attackSlotDist(slotIdx, scale) {
  return 1.0 + Math.floor(slotIdx / 4) * 1.0 + 0.15 * scale;
}
function attackSlotPos(def, slotIdx, scale) {
  const ring = Math.floor(slotIdx / 4);
  const angle = (slotIdx % 4) * Math.PI * 0.5 + (ring % 2 === 1 ? Math.PI / 4 : 0);
  const dist = attackSlotDist(slotIdx, scale);
  return new THREE.Vector3(
    def.group.position.x + Math.sin(angle) * dist, 0,
    def.group.position.z + Math.cos(angle) * dist
  );
}

// Rebuild the cached wall list — call whenever walls are added, removed, or killed
function _rebuildWallCache() {
  _wallCache.length = 0;
  for (const d of defenders) {
    if (d.alive && d.type === 'wall') _wallCache.push(d);
  }
}

// Returns true if an alive wall lies on the line segment between fromPos and toPos.
// Walls within 0.6 units of fromPos are ignored (attacker may be flush against it).
function _wallBlocksPath(fromPos, toPos) {
  const dx = toPos.x - fromPos.x, dz = toPos.z - fromPos.z;
  const len2 = dx*dx + dz*dz;
  if (len2 < 0.01) return false;
  for (const d of _wallCache) {
    const wx = d.col - fromPos.x, wz = d.row - fromPos.z;
    if (wx*wx + wz*wz < 0.36) continue; // skip walls at attacker's own position
    const t = Math.max(0, Math.min(1, (wx*dx + wz*dz) / len2));
    const cx = fromPos.x + t*dx - d.col, cz = fromPos.z + t*dz - d.row;
    if (cx*cx + cz*cz < 0.6*0.6) return true;
  }
  return false;
}

// Returns the closest non-wall defender within range (for enemy melee engagement)
function findDefenderInRange(pos, range) {
  let best = null, bestD2 = range * range;
  for (const d of defenders) {
    if (!d.alive || d.type === 'wall') continue;
    const d2 = pos.distanceToSquared(d.group.position);
    if (d2 <= bestD2 && !_wallBlocksPath(pos, d.group.position)) { best = d; bestD2 = d2; }
  }
  return best;
}

// Returns the nearest tower or catapult within range (enemies aggro on these from 6 tiles)
function findTowerInRange(pos, range) {
  let best = null, bestD2 = range * range;
  for (const d of defenders) {
    if (!d.alive || (d.type !== 'tower' && d.type !== 'catapult')) continue;
    const d2 = pos.distanceToSquared(d.group.position);
    if (d2 <= bestD2) { best = d; bestD2 = d2; }
  }
  return best;
}


// ─────────────────────────────────────────────
//  SOUND SYSTEM  (Web Audio API — fully procedural, no files)
// ─────────────────────────────────────────────
const SND = (() => {
  let ctx = null, master = null, lastHitMs = 0, _lastGruntMs = 0;
  let musicGain = null, _musicPlaying = false, _musicNodes = [];
  let _chipSong = null, _chipMelStep = 0, _chipBassStep = 0, _chipPercBeat = 0, _chipHarStep = 0, _chipArpStep = 0;
  let _chipMelSection = 0; // index into the active song's `form` — drives A/B/C melody variation
  let _chipMelTimer = null, _chipBassTimer = null, _chipPercTimer = null, _chipHarTimer = null, _chipArpTimer = null;
  let _musicIntensity = 0, _tempoMult = 1.0, _baseSong = 'blitz';
  // Difficulty mood: easy = calmer/slower & caps escalation; hard = faster, darker, earlier dread.
  let _difficulty = 'normal', _diffTempo = 1.0, _diffCapIntensity = 3, _diffDark = false, _diffDroneEarly = false;
  let _droneOsc = null, _droneGain = null, _heartbeatTimer = null;
  let _melDelayNode = null, _melDelayFb = null;
  let _pendingSfxVol = 0.32, _pendingMusicVol = 0.40;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function getM() {
    if (!master) {
      const c = getCtx();
      master = c.createGain();
      master.gain.value = _pendingSfxVol;
      master.connect(c.destination);
    }
    return master;
  }

  // Short oscillator burst
  function osc(freq, type, dur, vol, freqEnd) {
    const c = getCtx(), o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(getM());
    o.start(); o.stop(c.currentTime + dur + 0.01);
  }

  // Filtered noise burst
  function noise(dur, vol, filterHz, ftype = 'bandpass') {
    const c = getCtx();
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const filt = c.createBiquadFilter(); filt.type = ftype; filt.frequency.value = filterHz;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    src.connect(filt); filt.connect(g); g.connect(getM());
    src.start(); src.stop(c.currentTime + dur + 0.01);
  }

  // ── CHIP-TUNE MUSIC ENGINE ────────────────────────────────────────────
  const _NOTE = {
    C3:130.8,D3:146.8,E3:164.8,F3:174.6,Fs3:185.0,G3:196.0,A3:220.0,Bb3:233.1,B3:246.9,
    C4:261.6,Cs4:277.2,D4:293.7,E4:329.6,F4:349.2,Fs4:370.0,G4:392.0,A4:440.0,Bb4:466.2,B4:493.9,
    C5:523.3,Cs5:554.4,D5:587.3,E5:659.3,F5:698.5,Fs5:740.0,G5:784.0,A5:880.0,B5:987.8,
  };
  // mel/melB/melC = melody phrases, har = harmony, bas = bass, arp = fast sparkle.
  // `form` sequences the melody phrases (A/B/C) so the tune evolves instead of looping one
  // 8-bar phrase forever — har/bas/arp loop underneath as a steady accompaniment.
  // `['rest', n]` in a melody = an n-beat pause (breathing room → less mechanical, more "song-like").
  const _CHIP_SONGS = {
    blitz: { // G Major — "Goblin Rush" — very fast, punchy 8th-note runs (172 BPM)
      bpm: 172, form:['A','A','B','A','C','A'],
      mel:[
        ['G4',0.5],['A4',0.5],['B4',1],['D5',1],['B4',1],
        ['C5',0.5],['D5',0.5],['E5',1],['G5',1],['E5',1],
        ['D5',0.5],['C5',0.5],['B4',1],['A4',1],['G4',1],
        ['A4',0.5],['B4',0.5],['D5',2],['B4',1],
        ['C5',0.5],['D5',0.5],['E5',1],['D5',1],['C5',1],
        ['B4',0.5],['A4',0.5],['G4',1],['B4',2],
        ['D5',0.5],['E5',0.5],['G5',1],['A5',1],['G5',1],
        ['G4',4],
      ],
      // B — soaring upper-register answer, then a tumbling run home
      melB:[
        ['D5',0.5],['G5',0.5],['Fs5',1],['E5',1],['D5',1],
        ['E5',0.5],['D5',0.5],['B4',1],['G4',1],['rest',1],
        ['B4',0.5],['C5',0.5],['D5',1],['G5',2],
        ['Fs5',0.5],['E5',0.5],['D5',1],['B4',1],['G4',1],
      ],
      // C — call-and-response, lighter, leaves space
      melC:[
        ['B4',1],['rest',1],['D5',1],['rest',1],
        ['G5',0.5],['Fs5',0.5],['E5',0.5],['D5',0.5],['B4',2],
        ['A4',0.5],['B4',0.5],['C5',0.5],['D5',0.5],['E5',2],
        ['D5',1],['G4',3],
      ],
      har:[
        ['D4',2],['G3',2],['A3',2],['Fs3',2],
        ['G3',2],['E3',2],['D3',2],['G3',4],
      ],
      bas:[
        ['G3',1],['D3',1],['G3',2],
        ['C3',1],['G3',1],['D3',2],
        ['G3',2],['C3',2],
        ['D3',2],['G3',2],
      ],
      arp:[
        ['G4',0.5],['B4',0.5],['D5',0.5],['G5',0.5],
        ['D5',0.5],['B4',0.5],['A4',0.5],['G4',0.5],
        ['B4',0.5],['D5',0.5],['G5',0.5],['A5',0.5],
        ['G5',0.5],['E5',0.5],['D5',0.5],['B4',0.5],
      ],
    },
    classic: { // C Major — "Castle March" — heroic, syncopated leaps (140 BPM)
      bpm: 140, form:['A','B','A','C'],
      mel:[
        ['C5',0.5],['E5',0.5],['G5',1],['E5',0.5],['C5',0.5],['G5',1],
        ['A5',1.5],['G5',0.5],['F5',1],['E5',1],
        ['D5',0.5],['F5',0.5],['A5',1],['G5',1],['E5',1],
        ['C5',4],
        ['E5',0.5],['G5',0.5],['C5',1],['E5',1],['G5',1],
        ['F5',1.5],['E5',0.5],['D5',1],['C5',1],
        ['B4',0.5],['D5',0.5],['G5',1],['F5',1],['E5',1],
        ['C5',4],
      ],
      // B — a nobler, more lyrical strain moving through the relative minor
      melB:[
        ['G5',0.5],['F5',0.5],['E5',1],['D5',1],['C5',1],
        ['A4',0.5],['C5',0.5],['E5',1],['G5',1],['F5',1],
        ['E5',0.5],['D5',0.5],['C5',1],['B4',1],['G4',1],
        ['A4',1],['rest',1],['C5',2],
      ],
      // C — fanfare turnaround on the dominant, then a confident landing
      melC:[
        ['G5',1],['A5',0.5],['G5',0.5],['F5',1],['E5',1],
        ['D5',0.5],['E5',0.5],['F5',1],['G5',2],
        ['E5',0.5],['C5',0.5],['G4',1],['C5',1],['E5',1],
        ['C5',4],
      ],
      har:[
        ['E4',2],['C4',2],['F3',2],['G3',2],
        ['C4',2],['B3',2],['A3',2],['C4',4],
      ],
      bas:[
        ['C3',2],['G3',2],['F3',2],['G3',2],
        ['C3',4],['F3',2],['G3',2],
      ],
      arp:[
        ['C5',0.5],['E5',0.5],['G5',0.5],['E5',0.5],
        ['F4',0.5],['A4',0.5],['C5',0.5],['A4',0.5],
        ['G4',0.5],['B4',0.5],['D5',0.5],['G5',0.5],
        ['E5',0.5],['C5',0.5],['G4',0.5],['E4',0.5],
      ],
    },
    wide: { // F Major — "Enchanted Kingdom" — whimsical, flowing (106 BPM)
      bpm: 106, form:['A','A','B','A'],
      mel:[
        ['F4',1],['A4',0.5],['C5',0.5],['F5',2],
        ['E5',0.5],['D5',0.5],['C5',1],['Bb4',2],
        ['A4',0.5],['Bb4',0.5],['C5',1],['D5',1],['C5',1],
        ['F4',4],
        ['A4',0.5],['C5',0.5],['F5',1],['G5',1],['F5',1],
        ['E5',0.5],['D5',0.5],['C5',1],['Bb4',2],
        ['A4',0.5],['G4',0.5],['F4',1],['G4',1],['A4',1],
        ['F4',4],
      ],
      // B — a dreamier middle-eight that lifts to the high register and floats back
      melB:[
        ['C5',1],['D5',0.5],['E5',0.5],['F5',2],
        ['G5',0.5],['F5',0.5],['E5',1],['D5',2],
        ['Bb4',0.5],['C5',0.5],['D5',1],['F5',1],['E5',1],
        ['C5',0.5],['A4',0.5],['F4',1],['rest',2],
      ],
      har:[
        ['F3',2],['C4',2],['Bb3',2],['A3',2],
        ['C4',2],['F3',2],['G3',2],['F3',4],
      ],
      bas:[
        ['F3',2],['C3',2],['F3',2],['C3',2],
        ['Bb3',4],['F3',2],['C3',2],
      ],
      arp:[
        ['F4',0.5],['A4',0.5],['C5',0.5],['F5',0.5],
        ['C5',0.5],['A4',0.5],['G4',0.5],['F4',0.5],
        ['A4',0.5],['C5',0.5],['E5',0.5],['C5',0.5],
        ['Bb4',0.5],['D5',0.5],['F5',0.5],['D5',0.5],
      ],
    },
    bazaar: { // E Phrygian — "Desert Bazaar" — exotic, snake-charmer medieval flavour (128 BPM)
      bpm: 128, form:['A','A','B','A'],
      mel:[
        ['E4',0.5],['F4',0.5],['G4',1],['A4',1],['G4',1],
        ['F4',0.5],['E4',0.5],['E4',2],['B4',1],
        ['C5',0.5],['B4',0.5],['A4',1],['G4',1],['F4',1],
        ['E4',3],['rest',1],
      ],
      // B — climbs into the upper octave with the tell-tale flat-2nd colour
      melB:[
        ['B4',0.5],['C5',0.5],['D5',1],['E5',1],['D5',1],
        ['C5',0.5],['B4',0.5],['A4',1],['B4',2],
        ['G4',0.5],['A4',0.5],['B4',1],['C5',1],['B4',1],
        ['A4',0.5],['G4',0.5],['F4',1],['E4',2],
      ],
      har:[
        ['E3',2],['F3',2],['A3',2],['B3',2],
        ['C4',2],['B3',2],['A3',2],['E3',4],
      ],
      bas:[
        ['E3',2],['E3',2],
        ['F3',2],['E3',2],
        ['A3',2],['G3',2],
        ['E3',2],['B3',2],
      ],
      arp:[
        ['E4',0.5],['G4',0.5],['B4',0.5],['E5',0.5],
        ['F4',0.5],['A4',0.5],['C5',0.5],['A4',0.5],
        ['G4',0.5],['B4',0.5],['D5',0.5],['B4',0.5],
        ['E4',0.5],['B4',0.5],['G4',0.5],['E4',0.5],
      ],
    },
    comb: { // D Dorian — "Siege Fury" — driving, aggressive 8th-note attack (168 BPM)
      bpm: 168, form:['A','B','A','B'],
      mel:[
        ['D5',0.5],['E5',0.5],['F5',1],['E5',0.5],['D5',0.5],['C5',1],
        ['A4',0.5],['B4',0.5],['C5',1],['D5',2],
        ['E5',0.5],['F5',0.5],['G5',1],['F5',0.5],['E5',0.5],['D5',1],
        ['C5',0.5],['B4',0.5],['A4',1],['D4',2],
        ['F4',0.5],['G4',0.5],['A4',1],['B4',0.5],['A4',0.5],['G4',1],
        ['F4',0.5],['E4',0.5],['D4',1],['E4',1],['F4',1],
        ['G4',0.5],['A4',0.5],['C5',1],['D5',1],['E5',1],
        ['D5',4],
      ],
      // B — relentless hammering ostinato that resolves up the Dorian scale
      melB:[
        ['A4',0.5],['C5',0.5],['D5',1],['E5',1],['F5',1],
        ['E5',0.5],['D5',0.5],['C5',1],['A4',2],
        ['G4',0.5],['A4',0.5],['B4',1],['C5',1],['D5',1],
        ['E5',0.5],['F5',0.5],['G5',1],['D5',2],
      ],
      har:[
        ['F3',2],['D3',2],['G3',2],['A3',2],
        ['D3',2],['F3',2],['G3',2],['D3',4],
      ],
      bas:[
        ['D3',1],['A3',1],['D3',2],
        ['G3',1],['A3',1],['G3',2],
        ['D3',2],['A3',2],
        ['G3',1],['F3',1],['D3',2],
      ],
      arp:[
        ['D5',0.5],['F5',0.5],['A4',0.5],['D5',0.5],
        ['C5',0.5],['A4',0.5],['G4',0.5],['F4',0.5],
        ['E4',0.5],['G4',0.5],['A4',0.5],['C5',0.5],
        ['D5',0.5],['E5',0.5],['F5',0.5],['D5',0.5],
      ],
    },
    dark: { // D Minor — "Dark Siege" — ominous, heavy (148 BPM)
      bpm: 148, form:['A','A','B','A'],
      mel:[
        ['D5',0.5],['F5',0.5],['A4',1],['F5',0.5],['D5',0.5],['C5',1],
        ['Bb4',0.5],['C5',0.5],['D5',2],['C5',1],
        ['E5',0.5],['D5',0.5],['C5',1],['Bb4',1],['A4',1],
        ['D4',4],
        ['F4',0.5],['G4',0.5],['A4',1],['C5',1],['D5',1],
        ['E5',0.5],['F5',0.5],['G5',1],['F5',0.5],['D5',0.5],['C5',1],
        ['Bb4',0.5],['A4',0.5],['G4',1],['A4',1],['Bb4',1],
        ['D5',4],
      ],
      // B — a creeping, dread-laden line built on the lowered 6th
      melB:[
        ['A4',0.5],['Bb4',0.5],['C5',1],['D5',1],['E5',1],
        ['F5',0.5],['E5',0.5],['D5',1],['A4',2],
        ['Bb4',0.5],['A4',0.5],['G4',1],['F4',1],['E4',1],
        ['D4',2],['rest',2],
      ],
      har:[
        ['F3',2],['D3',2],['G3',2],['A3',2],
        ['Bb3',2],['A3',2],['D3',4],
      ],
      bas:[
        ['D3',1],['A3',1],['D3',2],
        ['G3',1],['F3',1],['G3',2],
        ['Bb3',2],['A3',2],
        ['D3',2],['A3',2],
      ],
      arp:[
        ['D4',0.5],['F4',0.5],['A4',0.5],['C5',0.5],
        ['Bb3',0.5],['D4',0.5],['F4',0.5],['A4',0.5],
        ['A3',0.5],['C4',0.5],['E4',0.5],['G4',0.5],
        ['D4',0.5],['F4',0.5],['A4',0.5],['D5',0.5],
      ],
    },
    danger: { // D Minor — "Last Stand" — frantic, desperate 8th-note assault (188 BPM)
      bpm: 188, form:['A','B','A','B'],
      mel:[
        ['D5',0.5],['E5',0.5],['F5',0.5],['E5',0.5],['D5',1],['C5',1],
        ['Bb4',0.5],['C5',0.5],['D5',1],['F5',1],['E5',1],
        ['G5',0.5],['F5',0.5],['E5',0.5],['D5',0.5],['C5',1],['Bb4',1],
        ['A4',0.5],['Bb4',0.5],['C5',0.5],['D5',0.5],['E5',2],
        ['F5',0.5],['E5',0.5],['D5',1],['C5',0.5],['Bb4',0.5],['A4',1],
        ['G4',0.5],['A4',0.5],['Bb4',0.5],['C5',0.5],['D5',2],
        ['E5',0.5],['F5',0.5],['G5',0.5],['F5',0.5],['E5',0.5],['D5',0.5],['C5',1],
        ['D5',4],
      ],
      // B — shrieking high-octave countercharge
      melB:[
        ['A5',0.5],['G5',0.5],['F5',0.5],['E5',0.5],['D5',1],['F5',1],
        ['E5',0.5],['D5',0.5],['C5',0.5],['Bb4',0.5],['A4',1],['C5',1],
        ['D5',0.5],['E5',0.5],['F5',0.5],['G5',0.5],['A5',2],
        ['G5',0.5],['F5',0.5],['E5',0.5],['D5',0.5],['D5',2],
      ],
      har:[
        ['F3',1],['A3',1],['C4',2],
        ['Bb3',1],['A3',1],['G3',2],
        ['F3',2],['G3',2],
        ['D3',4],
      ],
      bas:[
        ['D3',0.5],['A3',0.5],['D3',1],['A3',1],['D3',1],
        ['G3',0.5],['A3',0.5],['G3',1],['F3',1],['G3',1],
        ['Bb3',0.5],['A3',0.5],['G3',1],['A3',2],
        ['D3',4],
      ],
      arp:[
        ['D5',0.5],['F5',0.5],['A4',0.5],['D5',0.5],
        ['C5',0.5],['E5',0.5],['G4',0.5],['C5',0.5],
        ['Bb4',0.5],['D5',0.5],['F5',0.5],['Bb4',0.5],
        ['A4',0.5],['C5',0.5],['E5',0.5],['A4',0.5],
      ],
    },
    switchback: { // A Minor — "Hero's Quest" — flowing, adventurous (118 BPM)
      bpm: 118, form:['A','A','B','A'],
      mel:[
        ['A4',0.5],['B4',0.5],['C5',1],['E5',1],['D5',1],
        ['C5',0.5],['B4',0.5],['A4',1],['G4',1],['E4',1],
        ['F4',0.5],['G4',0.5],['A4',1],['C5',1],['E5',1],
        ['D5',0.5],['C5',0.5],['B4',2],['A4',1],
        ['A4',0.5],['C5',0.5],['E5',1],['A5',1],['G5',1],
        ['F5',0.5],['E5',0.5],['D5',1],['C5',2],
        ['B4',0.5],['C5',0.5],['D5',1],['E5',1],['C5',1],
        ['A4',4],
      ],
      // B — a questing, hopeful lift toward the relative major (C) then back home
      melB:[
        ['E5',0.5],['D5',0.5],['C5',1],['B4',1],['A4',1],
        ['C5',0.5],['E5',0.5],['A5',1],['G5',1],['E5',1],
        ['F5',0.5],['E5',0.5],['D5',1],['C5',1],['B4',1],
        ['A4',1],['rest',1],['E5',2],
      ],
      har:[
        ['A3',2],['E4',2],['C4',2],['B3',2],
        ['A3',2],['G3',2],['F3',2],['A3',4],
      ],
      bas:[
        ['A3',2],['E3',2],
        ['D3',2],['E3',2],
        ['F3',2],['A3',2],
        ['E3',2],['A3',2],
      ],
      arp:[
        ['A4',0.5],['C5',0.5],['E5',0.5],['A5',0.5],
        ['E5',0.5],['C5',0.5],['B4',0.5],['A4',0.5],
        ['F4',0.5],['A4',0.5],['C5',0.5],['E5',0.5],
        ['D5',0.5],['B4',0.5],['G4',0.5],['E4',0.5],
      ],
    },
  };
  // Per-base-song "darker cousin" used on Hard difficulty so each level audibly toughens up.
  const _DARK_VARIANT = {
    blitz:'comb', classic:'switchback', wide:'switchback', bazaar:'dark',
    comb:'dark', switchback:'dark', dark:'danger', danger:'danger',
  };

  // ── Ensure melody delay chain exists (echo effect) ──
  function _getMelOut(bpm) {
    if (!musicGain) return null;
    const c = getCtx();
    if (!_melDelayNode) {
      _melDelayNode = c.createDelay(1.0);
      _melDelayFb   = c.createGain(); _melDelayFb.gain.value = 0.22;
      const dlpf = c.createBiquadFilter(); dlpf.type = 'lowpass'; dlpf.frequency.value = 2000;
      _melDelayNode.connect(_melDelayFb);
      _melDelayFb.connect(dlpf);
      dlpf.connect(_melDelayNode); // feedback loop
      dlpf.connect(musicGain);     // wet echo out
    }
    _melDelayNode.delayTime.value = Math.min(0.45, (60 / bpm) * 0.375);
    return _melDelayNode;
  }

  // ── Marimba/bell melody — vibrato + echo (Terraria-style) ──
  function _playMelNote(freq, durBeats, bpm) {
    if (!musicGain) return;
    const c = getCtx(), now = c.currentTime;
    const dur = (60 / bpm) * durBeats * 0.78;
    const melDelay = _getMelOut(bpm);
    // Fundamental sine
    const o1 = c.createOscillator(), g1 = c.createGain();
    o1.type = 'sine'; o1.frequency.value = freq;
    // Vibrato: starts after attack settles
    const vib = c.createOscillator(), vibG = c.createGain();
    vib.type = 'sine'; vib.frequency.value = 5.5;
    vibG.gain.value = freq * 0.011;
    vib.connect(vibG); vibG.connect(o1.frequency);
    vib.start(now + 0.07); vib.stop(now + dur + 0.02);
    g1.gain.setValueAtTime(0, now);
    g1.gain.linearRampToValueAtTime(0.072, now + 0.007);
    g1.gain.exponentialRampToValueAtTime(0.038, now + 0.06);
    g1.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o1.connect(g1); g1.connect(musicGain);          // dry
    if (melDelay) g1.connect(melDelay);              // into echo
    o1.start(now); o1.stop(now + dur + 0.05);
    // Octave partial — bell brightness
    const o2 = c.createOscillator(), g2 = c.createGain();
    o2.type = 'sine'; o2.frequency.value = freq * 2;
    g2.gain.setValueAtTime(0, now);
    g2.gain.linearRampToValueAtTime(0.030, now + 0.004);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + Math.min(dur * 0.45, 0.16));
    o2.connect(g2); g2.connect(musicGain); o2.start(now); o2.stop(now + 0.20);
    // Inharmonic 3.5× partial — woody marimba click
    const o3 = c.createOscillator(), g3 = c.createGain();
    o3.type = 'sine'; o3.frequency.value = freq * 3.5;
    g3.gain.setValueAtTime(0, now);
    g3.gain.linearRampToValueAtTime(0.013, now + 0.003);
    g3.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
    o3.connect(g3); g3.connect(musicGain); o3.start(now); o3.stop(now + 0.07);
  }

  // ── Celesta/music-box arpeggio — bright sparkle notes ──
  function _playArpNote(freq) {
    if (!musicGain) return;
    const c = getCtx(), now = c.currentTime;
    const o1 = c.createOscillator(), g1 = c.createGain();
    o1.type = 'sine'; o1.frequency.value = freq;
    g1.gain.setValueAtTime(0, now);
    g1.gain.linearRampToValueAtTime(0.024, now + 0.003);
    g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.10);
    o1.connect(g1); g1.connect(musicGain); o1.start(now); o1.stop(now + 0.12);
    // Octave sparkle
    const o2 = c.createOscillator(), g2 = c.createGain();
    o2.type = 'sine'; o2.frequency.value = freq * 2;
    g2.gain.setValueAtTime(0, now);
    g2.gain.linearRampToValueAtTime(0.010, now + 0.002);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    o2.connect(g2); g2.connect(musicGain); o2.start(now); o2.stop(now + 0.055);
  }

  // ── Soft string-pad harmony — three detuned sines, slow attack ──
  function _playHarNote(freq, durBeats, bpm) {
    if (!musicGain) return;
    const c = getCtx(), now = c.currentTime;
    const dur = (60 / bpm) * durBeats * 0.92;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = freq * 3.5; filt.Q.value = 0.5;
    filt.connect(musicGain);
    [-8, 0, 8].forEach(cents => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.value = freq * Math.pow(2, cents / 1200);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.032, now + 0.05);  // louder pad
      g.gain.setValueAtTime(0.026, now + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.connect(g); g.connect(filt); o.start(now); o.stop(now + dur + 0.06);
    });
  }

  // ── Warm round bass — sine body + low-passed sawtooth for punch ──
  function _playBassNote(freq, durBeats, bpm) {
    if (!musicGain) return;
    const c = getCtx(), now = c.currentTime;
    const dur = (60 / bpm) * durBeats * 0.80;
    // Sine body
    const o1 = c.createOscillator(), g1 = c.createGain();
    o1.type = 'sine'; o1.frequency.value = freq;
    g1.gain.setValueAtTime(0, now);
    g1.gain.linearRampToValueAtTime(0.068, now + 0.012);
    g1.gain.setValueAtTime(0.048, now + dur * 0.55);
    g1.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o1.connect(g1); g1.connect(musicGain); o1.start(now); o1.stop(now + dur + 0.02);
    // Low-passed sawtooth for harmonic richness
    const o2 = c.createOscillator(), filt = c.createBiquadFilter(), g2 = c.createGain();
    o2.type = 'sawtooth'; o2.frequency.value = freq;
    filt.type = 'lowpass'; filt.frequency.value = freq * 3.5;
    g2.gain.setValueAtTime(0, now);
    g2.gain.linearRampToValueAtTime(0.022, now + 0.018);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.65);
    o2.connect(filt); filt.connect(g2); g2.connect(musicGain); o2.start(now); o2.stop(now + dur + 0.02);
  }

  // Resolve which melody phrase the current form-section points at (A=mel, B=melB, C=melC).
  function _melPhrase(song) {
    const form = song.form || ['A'];
    const sec = form[_chipMelSection % form.length];
    if (sec === 'C' && song.melC) return song.melC;
    if (sec === 'B' && song.melB) return song.melB;
    return song.mel;
  }

  function _chipMelTick() {
    if (!_musicPlaying || !_chipSong) return;
    const song = _CHIP_SONGS[_chipSong]; if (!song) return;
    const phrase = _melPhrase(song);
    const [note, beats] = phrase[_chipMelStep % phrase.length];
    const beatMs = 60000 / song.bpm;
    const freq = _NOTE[note];           // 'rest' (and any undefined note) → silent beat
    if (freq) _playMelNote(freq, beats, song.bpm);
    _chipMelStep++;
    // When the current phrase finishes, advance to the next section in the form.
    if (_chipMelStep >= phrase.length) { _chipMelStep = 0; _chipMelSection = (_chipMelSection + 1) % 1024; }
    _chipMelTimer = setTimeout(_chipMelTick, (beatMs * beats - 5) * _tempoMult * _diffTempo);
  }

  function _chipBassTick() {
    if (!_musicPlaying || !_chipSong) return;
    const song = _CHIP_SONGS[_chipSong]; if (!song) return;
    const [note, beats] = song.bas[_chipBassStep % song.bas.length];
    const beatMs = 60000 / song.bpm;
    const freq = _NOTE[note];
    if (freq) _playBassNote(freq, beats, song.bpm);
    _chipBassStep = (_chipBassStep + 1) % song.bas.length;
    _chipBassTimer = setTimeout(_chipBassTick, (beatMs * beats - 5) * _tempoMult * _diffTempo);
  }

  function _chipHarTick() {
    if (!_musicPlaying || !_chipSong) return;
    const song = _CHIP_SONGS[_chipSong]; if (!song?.har) return;
    const [note, beats] = song.har[_chipHarStep % song.har.length];
    const beatMs = 60000 / song.bpm;
    const freq = _NOTE[note];
    if (freq) _playHarNote(freq, beats, song.bpm);
    _chipHarStep = (_chipHarStep + 1) % song.har.length;
    _chipHarTimer = setTimeout(_chipHarTick, (beatMs * beats - 5) * _tempoMult * _diffTempo);
  }

  function _chipArpTick() {
    if (!_musicPlaying || !_chipSong) return;
    const song = _CHIP_SONGS[_chipSong]; if (!song?.arp) return;
    const [note, beats] = song.arp[_chipArpStep % song.arp.length];
    const beatMs = 60000 / song.bpm;
    const freq = _NOTE[note];
    if (freq) _playArpNote(freq);
    _chipArpStep = (_chipArpStep + 1) % song.arp.length;
    _chipArpTimer = setTimeout(_chipArpTick, (beatMs * beats - 5) * _tempoMult * _diffTempo);
  }

  // ── Tension drone — deep low rumble that fades in with danger ──
  function _startDrone(level) {
    if (!musicGain) return;
    const c = getCtx();
    if (!_droneGain) {
      _droneGain = c.createGain(); _droneGain.gain.value = 0; _droneGain.connect(musicGain);
      _droneOsc = c.createOscillator(); _droneOsc.type = 'sawtooth'; _droneOsc.frequency.value = 55;
      const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 180;
      _droneOsc.connect(filt); filt.connect(_droneGain); _droneOsc.start();
    }
    const vol = level === 2 ? 0.022 : 0.042;
    _droneGain.gain.setTargetAtTime(vol, c.currentTime, 2.5);
  }
  function _stopDrone() {
    if (_droneGain && ctx) {
      _droneGain.gain.setTargetAtTime(0, ctx.currentTime, 2.0);
      setTimeout(() => { try { _droneOsc?.stop(); } catch(e){} _droneOsc = null; _droneGain = null; }, 6000);
    }
  }

  // ── Heartbeat — deep double-thump at critical ──
  function _startHeartbeat() {
    if (_heartbeatTimer) return;
    function _hbTick() {
      if (!_musicPlaying || _musicIntensity < 3 || !musicGain) { _heartbeatTimer = null; return; }
      const c = getCtx(), now = c.currentTime;
      [0, 0.22].forEach(t => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(58, now + t);
        o.frequency.exponentialRampToValueAtTime(22, now + t + 0.18);
        g.gain.setValueAtTime(0.20, now + t); g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.22);
        o.connect(g); g.connect(musicGain); o.start(now + t); o.stop(now + t + 0.26);
      });
      _heartbeatTimer = setTimeout(_hbTick, 850);
    }
    _hbTick();
  }
  function _stopHeartbeat() { clearTimeout(_heartbeatTimer); _heartbeatTimer = null; }

  function _chipPercTick() {
    if (!_musicPlaying || !_chipSong || !musicGain) return;
    const song = _CHIP_SONGS[_chipSong]; if (!song) return;
    const beatMs = 60000 / song.bpm;
    const c = getCtx();
    const beat4 = _chipPercBeat % 4;
    // Kick on beat 0
    if (beat4 === 0) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(120, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(30, c.currentTime + 0.12);
      g.gain.setValueAtTime(0.22, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.15);
      o.connect(g); g.connect(musicGain); o.start(); o.stop(c.currentTime + 0.18);
    }
    // Snare on beat 2
    if (beat4 === 2) {
      const bufLen = Math.ceil(c.sampleRate * 0.09);
      const buf = c.createBuffer(1, bufLen, c.sampleRate);
      const bd = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) bd[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf;
      const filt = c.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 1800; filt.Q.value = 0.8;
      const g = c.createGain();
      g.gain.setValueAtTime(0.13, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.09);
      src.connect(filt); filt.connect(g); g.connect(musicGain);
      src.start(); src.stop(c.currentTime + 0.11);
    }
    // Hi-hat on every beat
    {
      const bufLen = Math.ceil(c.sampleRate * 0.025);
      const buf = c.createBuffer(1, bufLen, c.sampleRate);
      const bd = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) bd[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf;
      const filt = c.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = 7000;
      const g = c.createGain();
      const hhVol = beat4 === 0 || beat4 === 2 ? 0.045 : 0.065; // louder on off-beats
      g.gain.setValueAtTime(hhVol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.025);
      src.connect(filt); filt.connect(g); g.connect(musicGain);
      src.start(); src.stop(c.currentTime + 0.03);
    }
    // Sparkle ping every 8 beats — a bright ascending bell that kids love
    if (_chipPercBeat % 8 === 4) {
      [0, 60, 120].forEach((ms, i) => {
        setTimeout(() => {
          const song = _CHIP_SONGS[_chipSong];
          if (!song || !musicGain) return;
          const sparkFreqs = [784, 1047, 1319]; // G5 C6 E6
          const o2 = c.createOscillator(), g2 = c.createGain();
          o2.type = 'sine'; o2.frequency.value = sparkFreqs[i];
          g2.gain.setValueAtTime(0.028, c.currentTime);
          g2.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.18);
          o2.connect(g2); g2.connect(musicGain); o2.start(); o2.stop(c.currentTime + 0.2);
        }, ms);
      });
    }
    _chipPercBeat++;
    _chipPercTimer = setTimeout(_chipPercTick, beatMs - 5);
  }

  function _startMusicEngine() {
    const c = getCtx();
    if (!musicGain) {
      musicGain = c.createGain();
      musicGain.gain.value = _pendingMusicVol;
      musicGain.connect(c.destination);
    }
    _chipMelStep = 0; _chipBassStep = 0; _chipPercBeat = 0; _chipHarStep = 0; _chipArpStep = 0; _chipMelSection = 0;
    if (!_chipSong) _chipSong = 'blitz';
    _chipMelTick();
    _chipBassTick();
    _chipPercTick();
    _chipHarTick();
    _chipArpTick();
  }

  // Decide which song should be playing right now from base song + intensity + difficulty mood.
  function _resolveSong() {
    const lvl = Math.min(_musicIntensity, _diffCapIntensity);   // Easy caps escalation
    let key = lvl >= 3 ? 'danger' : lvl >= 2 ? 'dark' : _baseSong;
    // Hard: push the calm/tense base toward its darker cousin (escalated tracks are already dark)
    if (_diffDark && lvl < 2) key = _DARK_VARIANT[key] || key;
    return key;
  }
  function _restartChipTicks() {
    clearTimeout(_chipMelTimer); clearTimeout(_chipBassTimer); clearTimeout(_chipPercTimer); clearTimeout(_chipHarTimer); clearTimeout(_chipArpTimer);
    _chipMelStep = 0; _chipBassStep = 0; _chipPercBeat = 0; _chipHarStep = 0; _chipArpStep = 0; _chipMelSection = 0;
    _chipMelTick(); _chipBassTick(); _chipPercTick(); _chipHarTick(); _chipArpTick();
  }
  function _applySong(target) {
    if (!target || target === _chipSong) return;
    _chipSong = target;
    if (_musicPlaying) _restartChipTicks();
  }

  return {
    bolt()        { osc(1400,'square', 0.07, 0.11, 480); noise(0.05, 0.07, 2600); },
    arrow()       { osc( 720,'sawtooth',0.1,  0.09, 175); noise(0.07, 0.04, 1100); },
    catapultFire(){ osc(  88,'sine',   0.35, 0.32,  34); noise(0.26, 0.2,  340); },
    rockHit()     { osc( 105,'sine',   0.22, 0.32,  36); noise(0.18, 0.16, 490); },
    sword()       { noise(0.09, 0.18, 1900); osc(270,'sawtooth',0.08,0.09,130); },
    wallHit()     { osc(  78,'sine',   0.15, 0.2,   42); noise(0.1,  0.13, 540); },
    enemyDie()    { osc( 185,'sawtooth',0.23,0.16,  52); noise(0.14, 0.07, 580); },
    bigEnemyDie() { osc(  80,'sawtooth',0.45,0.28,  28); noise(0.30, 0.18, 260); osc(140,'sine',0.35,0.12,40); },
    defenderDie() { osc(  95,'sine',   0.38,0.25,  30); noise(0.22, 0.14, 420); osc(200,'sawtooth',0.18,0.08,60); },
    enemyHit()    { noise(0.045,0.10,1600,'bandpass'); },
    castleHit()   { osc(  52,'sine',   0.55, 0.48,  20); noise(0.42, 0.32, 195); },
    enemyArrow()  { osc( 480,'sawtooth',0.07,0.05, 140); },
    enemyRock()   { osc(  70,'sine',   0.22, 0.18,  30); noise(0.15, 0.1,  270); },
    build() {
      osc(440,'sine',0.08,0.12,880);
      setTimeout(() => osc(660,'sine',0.13,0.09,880), 85);
    },
    hit() { // throttled — max 1 per 130 ms
      const now = Date.now();
      if (now - lastHitMs < 130) return;
      lastHitMs = now;
      noise(0.07, 0.09, 880);
    },
    waveStart() {
      [[0,220],[110,277],[225,330],[345,440]].forEach(([ms,f]) =>
        setTimeout(() => osc(f,'sawtooth',0.3,0.17,f*1.01), ms));
    },
    waveComplete() {
      [[0,523],[135,659],[265,784],[395,1047]].forEach(([ms,f]) =>
        setTimeout(() => osc(f,'sine',0.34,0.13,f), ms));
    },
    gameOver() {
      [[0,220],[230,175],[455,131],[710,110]].forEach(([ms,f]) =>
        setTimeout(() => osc(f,'sawtooth',0.4,0.19,f*0.94), ms));
    },
    // ── Per-type enemy death ─────────────────────────────────────────────
    dieEnemy(type) {
      switch (type) {
        case 'skeleton':   noise(0.15,0.13,2700,'highpass'); noise(0.09,0.08,3500,'highpass'); osc(310,'square',0.06,0.05,185); break;
        case 'wolf':       osc(370,'sawtooth',0.22,0.17,75); noise(0.13,0.08,720); setTimeout(()=>osc(235,'sine',0.14,0.10,58),115); break;
        case 'spider':     noise(0.09,0.11,4000,'highpass'); osc(630,'square',0.08,0.09,112); noise(0.06,0.06,2100); break;
        case 'cyclops':    osc(52,'sawtooth',0.58,0.33,16); noise(0.48,0.30,190); osc(85,'sine',0.42,0.15,26); setTimeout(()=>noise(0.28,0.18,145,'lowpass'),175); break;
        case 'troll':      osc(65,'sawtooth',0.55,0.30,20); noise(0.40,0.22,205); setTimeout(()=>{ osc(48,'sine',0.28,0.17,14); noise(0.20,0.12,140,'lowpass'); },195); break;
        case 'boss':       osc(78,'sawtooth',0.52,0.32,24); noise(0.40,0.24,235); osc(128,'sine',0.40,0.15,34); break;
        case 'brute':      osc(108,'sawtooth',0.38,0.23,36); noise(0.22,0.12,390); break;
        case 'exploder':   osc(52,'sine',0.52,0.48,13); noise(0.44,0.38,162,'lowpass'); osc(76,'sawtooth',0.32,0.22,21); break;
        case 'healerOrc':  osc(505,'sine',0.26,0.14,80); osc(318,'sine',0.20,0.10,50); noise(0.16,0.06,1800); break;
        case 'orcMage':    osc(155,'sawtooth',0.34,0.18,38); noise(0.24,0.12,640); osc(272,'square',0.15,0.08,50); break;
        case 'enemyArcher':osc(210,'sawtooth',0.18,0.12,60); noise(0.10,0.06,680); break;
        default:           osc(185,'sawtooth',0.23,0.16,52); noise(0.14,0.07,580); // grunt
      }
    },
    // ── Enemy hurt grunt — throttled per-enemy at call site ───────────
    hurtEnemy(type) {
      const big  = type==='boss'||type==='troll'||type==='cyclops'||type==='brute'||type==='rockTroll';
      const bony = type==='skeleton';
      if (bony)  { noise(0.04,0.07,2900,'highpass'); return; }
      if (big)   { osc(90,'sawtooth',0.07,0.11,36); noise(0.05,0.06,275,'bandpass'); }
      else       { osc(190,'sawtooth',0.05,0.09,80); noise(0.03,0.04,510,'bandpass'); }
    },
    // ── Per-type defender death ───────────────────────────────────────
    dieDefender(type) {
      switch (type) {
        case 'knight':   noise(0.18,0.20,780); osc(128,'sawtooth',0.28,0.20,38); osc(315,'square',0.10,0.08,108); break;
        case 'spearman': osc(195,'sawtooth',0.25,0.16,52); noise(0.16,0.10,560); setTimeout(()=>noise(0.10,0.07,1400),80); break;
        case 'archer':   osc(235,'sawtooth',0.20,0.14,62); noise(0.12,0.08,740); break;
        default:         osc(95,'sine',0.38,0.25,30); noise(0.22,0.14,420); osc(200,'sawtooth',0.18,0.08,60); // swordsman
      }
    },
    // ── Defender hurt grunt — throttled per-unit at call site ─────────
    hurtDefender(type) {
      if      (type==='knight')   { osc(152,'sawtooth',0.06,0.09,55); noise(0.045,0.055,345,'bandpass'); osc(405,'square',0.022,0.030,185); }
      else if (type==='spearman') { osc(218,'sawtooth',0.05,0.07,90); noise(0.028,0.038,575,'bandpass'); }
      else if (type==='archer')   { osc(248,'sawtooth',0.045,0.065,105); noise(0.022,0.035,695,'bandpass'); }
      else                        { osc(200,'sawtooth',0.05,0.08,82); noise(0.028,0.038,470,'bandpass'); }
    },
    // ── Volume controls ──────────────────────────────────────────────────
    setSfxVol(v)   { _pendingSfxVol = v; if (master) master.gain.setTargetAtTime(v, getCtx().currentTime, 0.05); },
    setMusicVol(v) { _pendingMusicVol = v; if (musicGain) musicGain.gain.setTargetAtTime(v, getCtx().currentTime, 0.05); },
    // ── Music engine ─────────────────────────────────────────────────────
    isRunning()    { return ctx ? ctx.state === 'running' : false },
    startMusic()   {
      // Always resume AudioContext on user gesture, even if music is already running
      if (ctx && ctx.state === 'suspended') ctx.resume();
      if (_musicPlaying) return;
      _musicPlaying = true; _startMusicEngine();
    },
    stopMusic() {
      _musicPlaying = false;
      clearTimeout(_chipMelTimer); clearTimeout(_chipBassTimer); clearTimeout(_chipPercTimer); clearTimeout(_chipHarTimer); clearTimeout(_chipArpTimer);
      _chipMelTimer = null; _chipBassTimer = null; _chipPercTimer = null; _chipHarTimer = null; _chipArpTimer = null;
      _stopDrone(); _stopHeartbeat(); _musicIntensity = 0; _tempoMult = 1.0;
      if (_melDelayNode) { try { _melDelayNode.disconnect(); } catch(e){} _melDelayNode = null; }
      if (_melDelayFb)   { try { _melDelayFb.disconnect();   } catch(e){} _melDelayFb   = null; }
      _musicNodes.forEach(n=>{try{n.stop();}catch(e){}});
      _musicNodes=[]; musicGain=null;
    },
    setSong(key) {
      _baseSong = key;
      _applySong(_resolveSong());
    },
    setIntensity(level) {
      if (level === _musicIntensity) return;
      _musicIntensity = level;
      // Tempo: calm=normal, tense=+10%, intense=+22%, critical=+38% (difficulty layers on via _diffTempo)
      _tempoMult = [1.0, 0.90, 0.78, 0.62][Math.min(level, 3)] ?? 1.0;
      _applySong(_resolveSong());
      // Tension drone — fades in one stage earlier on Hard for sustained dread
      const droneThresh = _diffDroneEarly ? 1 : 2;
      if (level >= droneThresh) _startDrone(Math.max(2, level)); else _stopDrone();
      // Heartbeat — only at critical
      if (level >= 3) _startHeartbeat(); else _stopHeartbeat();
    },
    // Difficulty mood: Easy = a touch slower & never reaches the frantic 'danger' track;
    // Hard = faster, biased to darker song variants, with the dread drone arriving sooner.
    setDifficulty(diff) {
      _difficulty = diff;
      _diffTempo = diff === 'easy' ? 1.07 : diff === 'hard' ? 0.92 : 1.0;
      _diffCapIntensity = diff === 'easy' ? 2 : 3;
      _diffDark = diff === 'hard';
      _diffDroneEarly = diff === 'hard';
      _applySong(_resolveSong());
    },
    // ── New sounds ───────────────────────────────────────────────────────
    btnClick()    { osc(1080,'square',0.032,0.038,660); },
    // Soft dual-tone descending buzz for rejected actions (can't afford, blocked tile, etc.)
    denyClick()   { osc(220,'square',0.08,0.06,140); setTimeout(() => osc(150,'square',0.06,0.05,90), 50); },
    // Vocalization when an enemy lands a hit — throttled so overlapping attackers don't blast
    enemyAttack(type) {
      const big = type==='boss'||type==='troll'||type==='cyclops'||type==='brute'||type==='rockTroll';
      if (big) {
        osc(52,'sawtooth',0.32,0.26,22); noise(0.22,0.15,165,'bandpass');
      } else {
        const n = Date.now();
        if (n - _lastGruntMs < 210) return;
        _lastGruntMs = n;
        osc(92,'sawtooth',0.12,0.12,48); noise(0.08,0.07,295,'bandpass');
      }
    },
    // Building / tower collapse — heavy rubble
    towerFall()   { osc(50,'sine',0.72,0.50,16); noise(0.58,0.40,245,'lowpass'); setTimeout(()=>noise(0.30,0.22,155,'lowpass'),125); },
    // Wall crumble — stone crack, slightly lighter
    wallCrumble() { osc(65,'sine',0.32,0.32,22); noise(0.26,0.26,390,'bandpass'); setTimeout(()=>noise(0.18,0.14,230,'lowpass'),85); },
    // Knight heavy slash — metallic clang
    knightSlash() { noise(0.13,0.26,1250); osc(168,'sawtooth',0.12,0.16,62); osc(295,'square',0.05,0.065,140); },
    // Spearman thrust — short whoosh then sharp impact
    spearThrust() { noise(0.05,0.17,2800); osc(360,'sawtooth',0.07,0.09,108); },

    // ── Defender gibberish voice — sawtooth at vocal pitch through sweeping bandpass ──
    defVoice(type) {
      const c = getCtx();
      const pitch = type==='knight' ? 112 : type==='spearman' ? 148 : type==='archer' ? 198 : 168;
      const vol   = 0.048;
      const syls  = type==='knight' ? (Math.random()<0.45?1:2) : 2 + (Math.random()<0.5?1:0);
      for (let i = 0; i < syls; i++) {
        setTimeout(() => {
          const o = c.createOscillator(), filt = c.createBiquadFilter(), g = c.createGain();
          o.type = 'sawtooth'; o.frequency.value = pitch * (0.95 + Math.random() * 0.12);
          filt.type = 'bandpass'; filt.Q.value = 7;
          const f0 = 550 + Math.random() * 900;
          filt.frequency.setValueAtTime(f0, c.currentTime);
          filt.frequency.exponentialRampToValueAtTime(f0 * (0.35 + Math.random() * 0.3), c.currentTime + 0.09);
          const dur = 0.065 + Math.random() * 0.06;
          g.gain.setValueAtTime(vol, c.currentTime);
          g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
          o.connect(filt); filt.connect(g); g.connect(getM());
          o.start(); o.stop(c.currentTime + dur + 0.02);
        }, i * (72 + Math.random() * 52));
      }
    },

    // ── New combat & feedback sounds ─────────────────────────────────────
    // Mage orb fire — ethereal sweep with sparkle (was using SND.bolt())
    mageCast()    { osc(660,'sine',0.18,0.13,1320); osc(990,'sine',0.10,0.07,1980); noise(0.06,0.045,5200,'highpass'); },
    // Ballista heavy bolt — string snap + low thunk + zip
    ballistaShot(){ osc(140,'square',0.08,0.18,72); noise(0.06,0.10,1100,'bandpass'); osc(820,'sawtooth',0.05,0.06,420); },
    // Boss ground slam — deep low boom + earthen rumble
    bossSlam()    { osc(36,'sine',0.55,0.55,18); noise(0.42,0.35,150,'lowpass'); osc(60,'sawtooth',0.25,0.18,22); setTimeout(()=>noise(0.20,0.12,95,'lowpass'),80); },
    // Heavy enemy footstep — deep ground thud, weight varies by enemy class.
    // Globally throttled so a herd of giants doesn't blast overlapping stomps.
    footstep(type) {
      const n = Date.now();
      if (n - (this._lastFoot || 0) < 55) return;
      this._lastFoot = n;
      if (type === 'cyclops' || type === 'rockTroll') {        // colossal — deepest, longest
        osc(44,'sine',0.17,0.30,22); noise(0.11,0.13,135,'lowpass');
      } else if (type === 'troll' || type === 'boss') {        // heavy
        osc(54,'sine',0.14,0.25,28); noise(0.08,0.10,165,'lowpass');
      } else {                                                  // brute — meaty but quicker
        osc(64,'sine',0.11,0.19,34); noise(0.06,0.08,210,'lowpass');
      }
    },
    // Death explosion (exploder / Ignarok boss) — proper boom not a catapult clap
    explode()     { osc(48,'sine',0.42,0.62,15); noise(0.40,0.45,210,'lowpass'); osc(85,'sawtooth',0.22,0.25,28); setTimeout(()=>noise(0.18,0.18,135,'lowpass'),60); },
    // Spike trap pop — sharp metallic shing (throttled — many traps can fire same frame)
    spikeTrigger() {
      const n = Date.now();
      if (n - (this._lastSpike || 0) < 80) return;
      this._lastSpike = n;
      osc(2200,'square',0.05,0.08,1400); noise(0.04,0.05,3800,'highpass');
    },
    // Healer orc pulse — soft bell / chime
    heal()        { osc(880,'sine',0.20,0.10,1320); osc(1320,'sine',0.16,0.07,1760); noise(0.04,0.025,6000,'highpass'); },
    // Mage orb impact — frosty tinkle (slow applied)
    magicHit()    { osc(1480,'sine',0.10,0.07,2200); osc(990,'sine',0.07,0.05,1480); noise(0.04,0.03,5800,'highpass'); },
    // OrcMage curse landing — eerie warble
    curseHit()    { osc(330,'sawtooth',0.18,0.13,165); osc(220,'sine',0.18,0.10,110); noise(0.06,0.05,1400,'bandpass'); },
    // Cyclops melee swing — heavy whoosh + thump (throttled in case multiple cyclopses overlap)
    cyclopsSwing() {
      const n = Date.now();
      if (n - (this._lastCyc || 0) < 180) return;
      this._lastCyc = n;
      noise(0.13,0.20,520,'lowpass'); osc(95,'sawtooth',0.10,0.16,42);
    },
    // Coin tinkle on enemy reward — heavily throttled so 30-orc waves don't spam
    goldGain() {
      const n = Date.now();
      if (n - (this._lastGold || 0) < 95) return;
      this._lastGold = n;
      osc(1760,'sine',0.045,0.045,2640); osc(2640,'sine',0.030,0.030,3520);
    },
    // Defender level-up — bright triumph chord
    upgrade() {
      [[0,523],[80,659],[160,784],[240,1047]].forEach(([ms,f]) =>
        setTimeout(() => osc(f,'sine',0.20,0.12,f*1.005), ms));
    },
    // Boss spawn — dramatic horn blare (matches the BOSS FIGHT banner)
    bossSpawn() {
      osc(110,'sawtooth',0.50,0.30,82); osc(165,'sawtooth',0.50,0.22,140); noise(0.40,0.18,180,'lowpass');
      setTimeout(() => { osc(82,'sawtooth',0.55,0.32,55); osc(124,'sawtooth',0.55,0.22,98); }, 280);
    },
    // Achievement unlocked — ascending bright chime
    achievement() {
      [[0,784],[110,988],[220,1175],[360,1568]].forEach(([ms,f]) =>
        setTimeout(() => osc(f,'sine',0.18,0.10,f*1.01), ms));
    },
    // Swordsman swing — quick agile slash, lighter than knight, sharper than generic sword
    swordsmanSwing() { noise(0.07,0.16,2200); osc(385,'sawtooth',0.07,0.10,170); },
    // Skeleton phasing through wall — eerie ghost wail
    skeletonPhase() {
      const c = getCtx();
      const o = c.createOscillator(), filt = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(420, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(180, c.currentTime + 0.45);
      filt.type = 'highpass'; filt.frequency.value = 1200;
      g.gain.setValueAtTime(0.10, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.45);
      o.connect(filt); filt.connect(g); g.connect(getM());
      o.start(); o.stop(c.currentTime + 0.46);
      noise(0.18,0.05,3200,'highpass');
    },
    // Brute berserk activation — full-throated roar, much beefier than ambient grunt
    berserkRoar() {
      osc(72,'sawtooth',0.55,0.42,28); noise(0.40,0.30,210,'bandpass');
      setTimeout(()=>{ osc(95,'sawtooth',0.40,0.32,38); noise(0.28,0.20,260,'bandpass'); }, 180);
    },
    // Critical castle warning — once-per-wave deep alarm sting when HP drops below 25%
    criticalCastle() {
      osc(155,'sawtooth',0.30,0.30,80); osc(82,'sawtooth',0.40,0.25,60);
      setTimeout(()=>{ osc(140,'sawtooth',0.32,0.28,75); }, 240);
    },
    // Sell refund — clattering coin pile (heavier than per-kill goldGain)
    sellRefund() {
      [0,55,115,180].forEach((ms, i) =>
        setTimeout(() => osc(1760 + i * 220,'sine',0.05,0.045 - i*0.005,2640 + i*180), ms));
    },
    // Level victory fanfare — full triumphant phrase (richer than waveComplete)
    levelVictory() {
      [[0,523],[140,659],[280,784],[420,1047],[640,1319]].forEach(([ms,f]) =>
        setTimeout(() => { osc(f,'sine',0.32,0.15,f*1.005); osc(f*0.5,'sine',0.32,0.08,f*0.5); }, ms));
    },
    // Wall placement — solid stone-on-stone thunk (heavier than the ascending build chime)
    wallPlace() { osc(110,'sine',0.13,0.20,55); noise(0.08,0.10,420,'lowpass'); },

    // ── Per-unit placement cues — each defender gets a signature "deploy" sound ──
    // so the player can tell what they built by ear. Kept short (<0.35s) and moderate volume.
    placeUnit(type) {
      switch (type) {
        case 'tower':     // crystalline rising chime + airy shimmer
          osc(523,'sine',0.10,0.10,784); setTimeout(()=>osc(784,'sine',0.15,0.09,1047),70); noise(0.05,0.03,6500,'highpass');
          break;
        case 'catapult':  // timber assembly creak, then a heavy beam thunk
          osc(150,'sawtooth',0.10,0.10,90); noise(0.10,0.10,520,'lowpass');
          setTimeout(()=>{ osc(80,'sine',0.16,0.20,40); noise(0.12,0.12,300,'lowpass'); },115);
          break;
        case 'ballista':  // winch ratchet clicks then an iron-shod thunk
          noise(0.04,0.08,2600,'bandpass'); setTimeout(()=>noise(0.04,0.07,2200,'bandpass'),55);
          setTimeout(()=>{ osc(95,'square',0.12,0.16,52); noise(0.10,0.10,360,'lowpass'); },120);
          break;
        case 'archer':    // bowstring tighten + soft quiver rustle
          osc(330,'sawtooth',0.10,0.07,520); noise(0.06,0.05,3200,'highpass');
          setTimeout(()=>osc(440,'sine',0.10,0.06,660),85);
          break;
        case 'mage':      // arcane bloom — ethereal sweep rising into a bell + sparkle
          osc(440,'sine',0.22,0.08,880); osc(660,'sine',0.18,0.06,1320);
          setTimeout(()=>{ osc(880,'sine',0.20,0.07,1760); noise(0.05,0.03,7000,'highpass'); },95);
          break;
        case 'knight':    // heavy plate clank settling into a grounded stomp
          noise(0.07,0.16,1500,'bandpass'); osc(150,'square',0.07,0.10,70);
          setTimeout(()=>{ osc(70,'sine',0.16,0.22,38); noise(0.10,0.10,260,'lowpass'); },95);
          break;
        case 'spearman':  // butt-spike planted + a light metallic tap
          osc(120,'sine',0.12,0.16,60); noise(0.06,0.08,1200,'bandpass');
          setTimeout(()=>osc(420,'square',0.05,0.07,300),105);
          break;
        case 'swordsman': // leather creak + short bright blade ring
          osc(180,'sawtooth',0.08,0.10,100); noise(0.06,0.07,900,'bandpass');
          setTimeout(()=>osc(620,'sine',0.11,0.06,930),85);
          break;
        case 'spiketrap': // mechanical arming ratchet then a sharp set-click
          noise(0.03,0.07,3000,'bandpass'); setTimeout(()=>noise(0.03,0.06,2600,'bandpass'),45);
          setTimeout(()=>osc(1600,'square',0.04,0.07,1000),95);
          break;
        default:          // fallback — the classic ascending build chime
          osc(440,'sine',0.08,0.12,880); setTimeout(()=>osc(660,'sine',0.13,0.09,880),85);
      }
    },
    // Selection cue — soldiers answer with a short voice grunt; structures give a soft UI blip.
    selectUnit(type) {
      const soldier = type==='knight'||type==='swordsman'||type==='spearman'||type==='archer';
      if (soldier) { this.defVoice(type); }
      else { osc(680,'sine',0.05,0.045,1020); }
    },

    // ── Enemy ambient grunt / roar ────────────────────────────────────────
    orcAmbient(type) {
      if (type==='wolf') {
        osc(260,'sine',0.50,0.14,540); setTimeout(()=>osc(520,'sine',0.34,0.11,300),210);
      } else if (type==='spider') {
        noise(0.07,0.07,3900,'bandpass'); setTimeout(()=>noise(0.05,0.05,4300,'bandpass'),55); setTimeout(()=>noise(0.04,0.04,3600,'bandpass'),105);
      } else if (type==='skeleton') {
        noise(0.06,0.06,2900,'highpass'); setTimeout(()=>noise(0.04,0.04,3300,'highpass'),42); setTimeout(()=>noise(0.04,0.04,2700,'highpass'),88);
      } else if (type==='boss'||type==='troll'||type==='cyclops'||type==='rockTroll') {
        osc(46,'sawtooth',0.60,0.38,26); noise(0.44,0.24,155,'bandpass'); setTimeout(()=>osc(36,'sine',0.34,0.22,20),160);
      } else if (type==='brute') {
        osc(68,'sawtooth',0.42,0.30,36); noise(0.30,0.16,230,'bandpass');
      } else {
        osc(105,'sawtooth',0.24,0.18,52); noise(0.15,0.09,300,'bandpass');
      }
    },
  };
})();

// Dispose all mesh geometries in a group, plus any non-shared materials.
// (_SHARED_MATERIALS / markMaterialShared are declared up by the M palette so the
//  "mark every palette material" loop there can run without a temporal-dead-zone crash.)
function disposeGroup(group) {
  group.traverse(child => {
    if (!child.isMesh) return;
    if (child.geometry) child.geometry.dispose();
    // Dispose materials too — but only the ones that aren't part of the shared palette.
    // Hit-flash material clones (`mat0.clone()` per unit) end up unique and would leak.
    const mat = child.material;
    if (!mat) return;
    if (Array.isArray(mat)) {
      for (const m of mat) if (!_SHARED_MATERIALS.has(m)) m.dispose();
    } else if (!_SHARED_MATERIALS.has(mat)) {
      mat.dispose();
    }
  });
}

// Consolidated ranged/melee-aura tick for enemy types that attack while moving or stopped.
// Called once per frame per orc regardless of its current movement state.
function tickRangedEnemy(o, dt) {
  const cfg = CFG.ORC_TYPES[o.type];
  if (o.type === 'enemyArcher') {
    // In melee combat, archers swing instead of shooting — skip ranged fire to avoid dual damage
    if (!o.fightingDefender) {
      o.shootCooldown = (o.shootCooldown || 0) - dt;
      if (o.shootCooldown <= 0) {
        const t = findClosestDefender(o.group.position, cfg.shootRange);
        if (t) {
          fireEnemyArrow(o, t);
          o.shootCooldown = 1 / cfg.shootRate;
          o.drawPhase = 1.0;
        }
      }
    }
  } else if (o.type === 'orcMage') {
    o.shootCooldown = (o.shootCooldown || 0) - dt;
    if (o.shootCooldown <= 0) {
      const t = findClosestDefender(o.group.position, cfg.shootRange);
      if (t) {
        fireEnemyMagic(o, t);
        o.shootCooldown = 1 / cfg.shootRate;
        o.castPhase = 1.0;
      }
    }
  } else if (o.type === 'cyclops') {
    o.meleeCooldown = (o.meleeCooldown || 0) - dt;
    if (o.meleeCooldown <= 0) {
      const t = findClosestDefender(o.group.position, cfg.meleeRange);
      if (t) {
        dealDefenderDamage(t, cfg.meleeDmg);
        spawnHitParticles(posAbove(t.group.position, 0.8), 0xff6600);
        SND.cyclopsSwing();
        o.meleeCooldown = 1 / cfg.meleeRate;
      }
    }
  } else if (o.type === 'rockTroll') {
    o.shootCooldown = (o.shootCooldown || 0) - dt;
    if (o.shootCooldown <= 0) {
      const t = findClosestDefender(o.group.position, cfg.shootRange);
      if (t) {
        fireEnemyRock(o, t);
        o.shootCooldown = 1 / cfg.shootRate;
      }
    }
  }
  // ── Level boss: ground-slam AoE that hits ALL defenders in range ──
  // Runs in addition to any type-specific tick above (bosses use 'boss' base type).
  // The slam is what makes the fight feel like a boss rather than a bigger grunt —
  // it bypasses melee range and damages walls/towers/units together.
  if (o.isLevelBoss && o.slamRange) {
    o.slamCooldown = (o.slamCooldown || 0) - dt;
    if (o.slamCooldown <= 0) {
      // Only slam if at least one defender is actually in range (avoid flailing in empty field)
      const bossPos = o.group.position;
      const range = o.slamRange;
      const range2 = range * range;
      let anyHit = false;
      // Visual impact ring first so it feels like a wind-up release
      spawnImpactRing(bossPos, o.slamColor || 0xff2244);
      for (const d of defenders) {
        if (!d.alive) continue;
        if (bossPos.distanceToSquared(d.group.position) <= range2) {
          dealDefenderDamage(d, o.slamDmg, o);
          spawnHitParticles(posAbove(d.group.position, 0.8), o.slamColor || 0xff2244);
          anyHit = true;
        }
      }
      if (anyHit) { triggerShake(0.45); SND.bossSlam(); }
      o.slamCooldown = 1 / (o.slamRate || 0.55);
    }
  }
}

// ─────────────────────────────────────────────
//  UPDATE ORCS
// ─────────────────────────────────────────────
function updateOrcs(dt, t) {
  for (let i = orcs.length - 1; i >= 0; i--) {
    const o = orcs[i];
    if (!o.alive) {
      if (!o.dying) { // castle attacker or safety — instant remove
        disposeGroup(o.group); scene.remove(o.group); orcs.splice(i, 1); continue;
      }
      o.deathTimer += dt;
      const FALL = 0.38, TOTAL = 0.72;
      if (o.deathTimer < FALL) {
        const f = o.deathTimer / FALL;
        const ff = Math.sin(f * Math.PI); // bell-curve peak at midpoint of fall
        o.group.rotation.z = o.deathDir * (Math.PI / 2) * f;
        o.group.position.y = Math.sin(f * Math.PI * 0.5) * 0.18 * o.scale;
        // Arms flail outward as the body topples
        if (o.armL) { o.armL.rotation.x = ff * -1.8; o.armL.rotation.z =  ff * 0.9; }
        if (o.armR) { o.armR.rotation.x = ff * -1.4; o.armR.rotation.z = -ff * 0.7; }
      } else {
        o.group.rotation.z = o.deathDir * Math.PI / 2;
        const f = (o.deathTimer - FALL) / (TOTAL - FALL);
        o.group.position.y = -f * 0.9 * o.scale;
      }
      if (o.deathTimer >= TOTAL) {
        disposeGroup(o.group); scene.remove(o.group); orcs.splice(i, 1);
      }
      continue;
    }

    // ── Attacking castle (spread across gate, same logic as wall spread) ──
    if (o.attackingCastle) {
      const gate    = o.path[o.path.length - 1];
      const targetX = Math.min(gate[0], 65.5 - 0.48 * o.scale - 0.1);
      const targetZ = o.castleTargetZ !== null ? o.castleTargetZ : gate[1];
      // Slide to spread position before attacking (mirrors wallTargetX/Z navigation)
      const ctdx = targetX - o.group.position.x;
      const ctdz = targetZ - o.group.position.z;
      const ctD  = Math.sqrt(ctdx * ctdx + ctdz * ctdz);
      if (ctD > 0.06) {
        const spd = o.speed * dt;
        o.group.position.x += (ctdx / ctD) * Math.min(spd, ctD);
        o.group.position.z += (ctdz / ctD) * Math.min(spd, ctD);
        pushFromStatics(o.group.position, 0.28 + 0.12 * o.scale);
        pushFromBuildings(o.group.position, 0.28 + 0.12 * o.scale);
        o.group.rotation.y = Math.atan2(ctdx, ctdz);
        // Clear residual lean/tilt from prior states (chase, fight, wall) — orc walks upright
        o.group.rotation.x = 0;
        o.group.rotation.z = 0;
        updateOrcHPBar(o); updateOrcFlash(o, dt);
        continue;
      }
      o.group.position.x = targetX;
      o.group.position.z = targetZ;
      o.castleAttackTimer += dt;
      const attackRate = 1 / (CFG.ORC_TYPES[o.type].defRate || 0.8);
      if (o.castleAttackTimer >= attackRate) {
        o.castleAttackTimer = 0;
        o.swingDamageReady = true;
        if (!o.swingPhase || o.swingPhase < 0.5) { o.swingPhase = 1.0; o.swingHit = false; }
      }
      // Face castle (+x direction) and play attack animation
      o.group.rotation.y = Math.PI / 2;
      o.animTime += dt * 5.5;
      o.group.position.y = Math.abs(Math.sin(o.animTime)) * 0.15;
      o.group.rotation.x = 0.12;
      o.group.rotation.z = Math.sin(o.animTime * 0.8) * 0.04;     // subtle idle sway, no obvious tilt
      const legBase = o.type === 'wolf' ? 0.16 : o.type === 'cyclops' ? 0.32 : 0.19;
      if (o.legL) o.legL.position.y = legBase + Math.sin(o.animTime) * 0.11;
      if (o.legR) o.legR.position.y = legBase - Math.sin(o.animTime) * 0.11;
      // Type-specific weapon arm — same formulas as wall/defender attack
      if (o.type === 'cyclops') {
        if ((o.swingPhase || 0) > 0) {
          o.swingPhase = Math.max(0, o.swingPhase - dt * 4);
          const csw = Math.sin(o.swingPhase * Math.PI);
          if (o.armR) { o.armR.rotation.x = -0.75 + csw * 3.0; o.armR.rotation.z = -csw * 0.24; }
          if (o.armL) { o.armL.rotation.x =  csw * 1.0;         o.armL.rotation.z =  csw * 0.18; }
          o.group.rotation.z = csw * 0.10;                      // gentler torso twist into strike
          o.group.rotation.x = 0.12 + csw * 0.40;
          if (!o.swingHit && o.swingPhase <= 0.5 && o.swingDamageReady) {
            o.swingHit = true; o.swingDamageReady = false;
            SND.castleHit(); triggerShake(0.65); castleHitTimer = 0.14;
            if (castleGroup && castleGroup.userData.hitFlashMeshes) {
              castleGroup.userData.hitFlashMeshes.forEach(m => {
                _forMats(m, mat => { if (mat.emissive) mat.emissive.set(0xff2200); mat.emissiveIntensity = 1.8; });
              });
            }
            _handleCastleHit(o);
          }
        } else {
          o._swingRest = (o._swingRest || 0) + dt;
          if (o._swingRest >= 0.06) { o._swingRest = 0; o.swingPhase = 1.0; o.swingHit = false; o.swingDamageReady = false; }
          if (o.armR) { o.armR.rotation.x = -0.75; o.armR.rotation.z = 0; }
          if (o.armL) o.armL.rotation.x = -Math.sin(o.animTime) * 0.88;
        }
      } else if (o.type === 'skeleton') {
        // Bite attack at castle — head lunges, jaw snaps, arms hang limp
        const bHead = o.hitFlashMeshes[1];
        const bJaw  = o.group.userData.skelJaw;
        if (o.armL) { o.armL.rotation.x = 0.15; o.armL.rotation.z =  0.35; }
        if (o.armR) { o.armR.rotation.x = 0.15; o.armR.rotation.z = -0.35; }
        if ((o.swingPhase || 0) > 0) {
          o.swingPhase = Math.max(0, o.swingPhase - dt * 8);
          const sb = Math.sin(o.swingPhase * Math.PI);
          if (bHead) { bHead.position.z = sb * 0.30; bHead.position.y = 1.07 - sb * 0.05; bHead.rotation.x = sb * 0.45; }
          if (bJaw)  { bJaw.rotation.x = 0.12 + sb * 0.65; }
          o.group.rotation.x = sb * 0.38;
          if (!o.swingHit && o.swingPhase <= 0.5 && o.swingDamageReady) {
            o.swingHit = true; o.swingDamageReady = false;
            SND.castleHit(); triggerShake(0.65); castleHitTimer = 0.14;
            if (castleGroup && castleGroup.userData.hitFlashMeshes) {
              castleGroup.userData.hitFlashMeshes.forEach(m => {
                _forMats(m, mat => { if (mat.emissive) mat.emissive.set(0xff2200); mat.emissiveIntensity = 1.8; });
              });
            }
            _handleCastleHit(o);
          }
        } else {
          o._swingRest = (o._swingRest || 0) + dt;
          if (o._swingRest >= 0.06) { o._swingRest = 0; o.swingPhase = 1.0; o.swingHit = false; o.swingDamageReady = false; }
          if (bHead) { bHead.position.z = 0; bHead.position.y = 1.07; bHead.rotation.x = 0; }
          if (bJaw)  { bJaw.rotation.x = 0.12; }
          o.group.rotation.x = 0;
        }
      } else if (o.type === 'wolf') {
        // Bite attack at castle — rear up, front paws claw the wall, jaws snap forward
        const wHead = o.hitFlashMeshes?.[1];
        if ((o.swingPhase || 0) > 0) {
          o.swingPhase = Math.max(0, o.swingPhase - dt * 8);
          const ws = Math.sin(o.swingPhase * Math.PI);
          o.group.rotation.x = 0.05 + ws * 0.55;              // pitch head-down into castle
          o.group.rotation.z = 0;
          o.group.position.y = ws * 0.14;                     // springs off front paws
          // Front legs (legL = front-left, legFR = front-right) lift as wolf rears
          if (o.legL)  o.legL.rotation.x  = -ws * 0.70;
          if (o.legFR) o.legFR.rotation.x = -ws * 0.70;
          // Back legs plant hard to drive the bite
          if (o.legR)  o.legR.rotation.x  = ws * 0.35;
          if (o.legBL) o.legBL.rotation.x = ws * 0.35;
          if (wHead) { wHead.rotation.x = 0.05 - ws * 0.60; wHead.position.z = 0.28 + ws * 0.22; }
          if (!o.swingHit && o.swingPhase <= 0.5 && o.swingDamageReady) {
            o.swingHit = true; o.swingDamageReady = false;
            SND.castleHit(); triggerShake(0.65); castleHitTimer = 0.14;
            if (castleGroup && castleGroup.userData.hitFlashMeshes) {
              castleGroup.userData.hitFlashMeshes.forEach(m => {
                _forMats(m, mat => { if (mat.emissive) mat.emissive.set(0xff2200); mat.emissiveIntensity = 1.8; });
              });
            }
            _handleCastleHit(o);
          }
        } else {
          o._swingRest = (o._swingRest || 0) + dt;
          if (o._swingRest >= 0.06) { o._swingRest = 0; o.swingPhase = 1.0; o.swingHit = false; o.swingDamageReady = false; }
          o.group.rotation.x = 0.05;
          o.group.rotation.z = 0;                          // wolf shouldn't roll while resting
          o.group.position.y = 0;                          // settle from bite-spring
          if (wHead) { wHead.rotation.x = 0; wHead.position.z = 0.28; }
          // Reset leg poses so they don't freeze mid-rear
          if (o.legL)  o.legL.rotation.x  = 0;
          if (o.legR)  o.legR.rotation.x  = 0;
          if (o.legFR) o.legFR.rotation.x = 0;
          if (o.legBL) o.legBL.rotation.x = 0;
        }
      } else {
        const _isRangedCaster = o.type === 'enemyArcher' || o.type === 'orcMage';
        if (!_isRangedCaster && o.armL) o.armL.rotation.x = -Math.sin(o.animTime * 1.4) * 0.60;
        if ((o.swingPhase || 0) > 0) {
          o.swingPhase = Math.max(0, o.swingPhase - dt * 1);
          const sw = Math.sin(o.swingPhase * Math.PI);
          if (o.type === 'orcMage') {
            // Staff-thrust cast animation at castle
            if (o.armR) { o.armR.rotation.x = -1.2 - sw * 0.4; o.armR.rotation.z = -0.18; }
            if (o.armL) { o.armL.rotation.x = 0.30; o.armL.rotation.z = 0.20; }
          } else if (_isRangedCaster) {
            if (o.armR) { o.armR.rotation.x = -1.0 + sw * 0.55; o.armR.rotation.z = -0.24; }
            if (o.armL) { o.armL.rotation.x = -0.50 - sw * 0.10; o.armL.rotation.z = 0.10; }
          } else {
            if (o.armR) { o.armR.rotation.x = -1.4 + sw * 2.8; o.armR.rotation.z = -0.20 + sw * 0.30; }
            if (o.armL) { o.armL.rotation.x =  0.40 - sw * 0.4; o.armL.rotation.z = 0.22; }
          }
          o.group.rotation.x = 0.12 + sw * 0.28;
          // Hit lands at peak — weapon arm fully extended into castle wall
          if (!o.swingHit && o.swingPhase <= 0.5 && o.swingDamageReady) {
            o.swingHit = true; o.swingDamageReady = false;
            SND.castleHit(); triggerShake(0.65); castleHitTimer = 0.14;
            if (castleGroup && castleGroup.userData.hitFlashMeshes) {
              castleGroup.userData.hitFlashMeshes.forEach(m => {
                _forMats(m, mat => { if (mat.emissive) mat.emissive.set(0xff2200); mat.emissiveIntensity = 1.8; });
              });
            }
            _handleCastleHit(o);
          }
        } else {
          o._swingRest = (o._swingRest || 0) + dt;
          if (o._swingRest >= 0.06) { o._swingRest = 0; o.swingPhase = 1.0; o.swingHit = false; o.swingDamageReady = false; }
          if (o.type === 'orcMage') {
            if (o.armR) { o.armR.rotation.x = -1.2; o.armR.rotation.z = -0.18; }
            if (o.armL) { o.armL.rotation.x =  0.30; o.armL.rotation.z =  0.20; }
          } else if (_isRangedCaster) {
            if (o.armR) { o.armR.rotation.x = -1.0; o.armR.rotation.z = -0.24; }
            if (o.armL) { o.armL.rotation.x = -0.50; o.armL.rotation.z = 0.10; }
          } else {
            if (o.armR) { o.armR.rotation.x = -1.4; o.armR.rotation.z = -0.20; }
            if (o.armL) { o.armL.rotation.x =  0.40; o.armL.rotation.z =  0.22; }
          }
          o.group.rotation.x = 0.12;
        }
      }
      updateOrcHPBar(o);
      updateOrcFlash(o, dt);
      continue;
    }

    // ── Wall-blocking logic ──
    if (o.blockedByWall) {
      if (!o.blockedByWall.alive) {
        o.blockedByWall = null;  // Wall destroyed — surge forward
        o.wallSlotIdx = -1; o.wallTargetX = null; o.wallTargetZ = null;
        o.progress = 1.0;        // snap to tile edge so path loop immediately advances past the cleared tile
        o.group.rotation.x = 0;
        o.group.rotation.z = 0;
      } else {
        o.wallAttackTimer -= dt;
        if (o.wallAttackTimer <= 0) {
          if (o.type === 'enemyArcher') {
            // Ranged archers shoot walls instead of melee-pounding them
            fireEnemyArrow(o, o.blockedByWall);
            o.drawPhase = 1.0;
            o.wallAttackTimer = 1.0 / (CFG.ORC_TYPES[o.type].shootRate || 1.0);
          } else if (o.type === 'orcMage') {
            fireEnemyMagic(o, o.blockedByWall);
            o.castPhase = 1.0;
            o.wallAttackTimer = 1.0 / (CFG.ORC_TYPES[o.type].shootRate || 0.5);
          } else {
            o.wallAttackTimer = 1.0 / (CFG.ORC_TYPES[o.type].defRate || 0.8);
            o.swingDamageReady = true;
            if (!o.swingPhase || o.swingPhase < 0.5) { o.swingPhase = 1.0; o.swingHit = false; }
          }
        }
        // Face the wall and animate in place
        if (o.blockedByWall && o.blockedByWall.alive) {
          const wp = o.blockedByWall.group.position;
          o.group.rotation.y = Math.atan2(wp.x - o.group.position.x, wp.z - o.group.position.z);
        }
        o.animTime += dt * 4.5;
        // Attack animation while hammering the wall
        if (o.type === 'cyclops') {
          const cwa = Math.sin(o.animTime * 1.5);
          o.group.position.y = Math.abs(cwa) * 0.28;
          o.legL.position.y = 0.32 + Math.sin(o.animTime) * 0.16;
          o.legR.position.y = 0.32 - Math.sin(o.animTime) * 0.16;
          if ((o.swingPhase || 0) > 0) {
            o.swingPhase = Math.max(0, o.swingPhase - dt * 4);
            const csw = Math.sin(o.swingPhase * Math.PI);
            if (o.armR) { o.armR.rotation.x = -0.75 + csw * 3.0; o.armR.rotation.z = -csw * 0.24; }
            if (o.armL) { o.armL.rotation.x = csw * 1.0; o.armL.rotation.z = csw * 0.18; }
            o.group.rotation.z = csw * 0.10;        // gentler sideways shoulder twist
            o.group.rotation.x = 0.12 + csw * 0.40;
            if (!o.swingHit && o.swingPhase <= 0.5 && o.swingDamageReady && o.blockedByWall?.alive) {
              o.swingHit = true; o.swingDamageReady = false;
              SND.wallHit();
              dealDefenderDamage(o.blockedByWall, CFG.ORC_TYPES[o.type].wallDmg || 1);
              if (o.blockedByWall) spawnHitParticles(posAbove(o.blockedByWall.group.position, 1.2), 0xaaaaaa);
            }
          } else {
            o._swingRest = (o._swingRest || 0) + dt;
            if (o._swingRest >= 0.06) { o._swingRest = 0; o.swingPhase = 1.0; o.swingHit = false; o.swingDamageReady = false; }
            if (o.armR) { o.armR.rotation.x = -0.75; o.armR.rotation.z = 0; }
            if (o.armL) o.armL.rotation.x = -cwa * 1.1;
            o.group.rotation.z = Math.sin(o.animTime * 0.8) * 0.04;   // softer idle sway
            o.group.rotation.x = 0.10;                                // hold ready stance
          }
        } else if (o.type === 'wolf' || o.type === 'spider') {
          if ((o.swingPhase || 0) > 0) {
            o.swingPhase = Math.max(0, o.swingPhase - dt * 8);
            const bs = Math.sin(o.swingPhase * Math.PI); // 0→1→0 bite curve
            if (o.type === 'wolf') {
              // Crouch-rear then snap forward: body tilts head-down into the wall, jaws lunge
              o.group.rotation.x = 0.05 + bs * 0.55;
              o.group.rotation.z = 0;
              o.group.position.y = bs * 0.12;                 // springs off front paws
              // Front legs (legL/legFR) lift as wolf rears to bite
              if (o.legL)  o.legL.rotation.x  = -bs * 0.70;
              if (o.legFR) o.legFR.rotation.x = -bs * 0.70;
              // Back legs plant hard
              if (o.legR)  o.legR.rotation.x  = bs * 0.35;
              if (o.legBL) o.legBL.rotation.x = bs * 0.35;
              // Head & jaw thrust forward
              const wHead = o.hitFlashMeshes?.[1];
              if (wHead) { wHead.rotation.x = 0.05 - bs * 0.60; wHead.position.z = 0.28 + bs * 0.22; }
            } else {
              // Spider: rears on back legs, front legs stab at the wall
              o.group.rotation.x = -bs * 0.42;                // tilts body upright
              o.group.rotation.z = 0;
              o.group.position.y = 0.02 + bs * 0.16;          // up on haunches
              if (o.armL) { o.armL.rotation.x = -1.10 - bs * 0.55; o.armL.rotation.z =  0.22 + bs * 0.24; }
              if (o.armR) { o.armR.rotation.x = -1.10 - bs * 0.55; o.armR.rotation.z = -0.22 - bs * 0.24; }
              if (o.legL) o.legL.rotation.x =  bs * 0.30;
              if (o.legR) o.legR.rotation.x = -bs * 0.30;
            }
            // Lunge forward into the wall during the strike
            if (!o._lungeBase && o.blockedByWall) {
              o._lungeBase = { x: o.group.position.x, z: o.group.position.z };
              const tp = o.blockedByWall.group.position;
              const dx = tp.x - o.group.position.x, dz = tp.z - o.group.position.z;
              const d2 = Math.sqrt(dx * dx + dz * dz) || 1;
              o._lungeDir = { x: dx / d2, z: dz / d2 };
            }
            if (o._lungeBase) {
              const lunge = bs * 0.20;
              o.group.position.x = o._lungeBase.x + o._lungeDir.x * lunge;
              o.group.position.z = o._lungeBase.z + o._lungeDir.z * lunge;
            }
            if (!o.swingHit && o.swingPhase <= 0.5 && o.swingDamageReady && o.blockedByWall?.alive) {
              o.swingHit = true; o.swingDamageReady = false;
              SND.wallHit();
              dealDefenderDamage(o.blockedByWall, CFG.ORC_TYPES[o.type].wallDmg || 1);
              if (o.blockedByWall) spawnHitParticles(posAbove(o.blockedByWall.group.position, 1.2), 0xaaaaaa);
            }
          } else {
            // Brief rest between bites — body settles, breathing bob, legs return to neutral
            o.group.position.y = 0;
            o.group.rotation.z = 0;                        // no sideways roll while resting
            o.group.rotation.x = Math.sin(o.animTime * 1.0) * 0.03;
            // Reset leg/arm poses so they don't freeze in last swing position
            if (o.type === 'wolf') {
              if (o.legL)  o.legL.rotation.x  = 0;
              if (o.legR)  o.legR.rotation.x  = 0;
              if (o.legFR) o.legFR.rotation.x = 0;
              if (o.legBL) o.legBL.rotation.x = 0;
              const _wHeadR = o.hitFlashMeshes?.[1];
              if (_wHeadR) { _wHeadR.rotation.x = 0.05; _wHeadR.position.z = 0.28; }
            } else {
              // spider — return arms/legs to neutral idle
              if (o.armL) { o.armL.rotation.x = -1.10; o.armL.rotation.z =  0.22; }
              if (o.armR) { o.armR.rotation.x = -1.10; o.armR.rotation.z = -0.22; }
              if (o.legL) o.legL.rotation.x = 0;
              if (o.legR) o.legR.rotation.x = 0;
            }
            o._lungeBase = null;
            o._swingRest = (o._swingRest || 0) + dt;
            if (o._swingRest >= 0.06) { o._swingRest = 0; o.swingPhase = 1.0; o.swingHit = false; o.swingDamageReady = false; }
          }
        } else if (o.type === 'skeleton') {
          // Bite attack — head lunges forward, jaw snaps, arms hang limp
          const bHead = o.hitFlashMeshes[1];
          const bJaw  = o.group.userData.skelJaw;
          o.group.position.y = 0; o.group.rotation.z = 0; o.group.rotation.x = 0;
          if (o.legL) o.legL.rotation.x = 0;
          if (o.legR) o.legR.rotation.x = 0;
          if (o.armL) { o.armL.rotation.x = 0.15; o.armL.rotation.z =  0.35; }
          if (o.armR) { o.armR.rotation.x = 0.15; o.armR.rotation.z = -0.35; }
          if ((o.swingPhase || 0) > 0) {
            o.swingPhase = Math.max(0, o.swingPhase - dt * 8);
            const sb = Math.sin(o.swingPhase * Math.PI);
            if (bHead) { bHead.position.z = sb * 0.30; bHead.position.y = 1.07 - sb * 0.05; bHead.rotation.x = sb * 0.45; }
            if (bJaw)  { bJaw.rotation.x = 0.12 + sb * 0.65; } // jaw snaps wide open
            o.group.rotation.x = sb * 0.38; // whole body surges forward
            if (!o._lungeBase && o.blockedByWall) {
              o._lungeBase = { x: o.group.position.x, z: o.group.position.z };
              const tp = o.blockedByWall.group.position;
              const dx = tp.x - o.group.position.x, dz = tp.z - o.group.position.z;
              const d2 = Math.sqrt(dx * dx + dz * dz) || 1;
              o._lungeDir = { x: dx / d2, z: dz / d2 };
            }
            if (o._lungeBase) {
              const lunge = sb * 0.22;
              o.group.position.x = o._lungeBase.x + o._lungeDir.x * lunge;
              o.group.position.z = o._lungeBase.z + o._lungeDir.z * lunge;
            }
            if (!o.swingHit && o.swingPhase <= 0.5 && o.swingDamageReady && o.blockedByWall?.alive) {
              o.swingHit = true; o.swingDamageReady = false;
              SND.wallHit();
              dealDefenderDamage(o.blockedByWall, CFG.ORC_TYPES[o.type].wallDmg || 1);
              if (o.blockedByWall) spawnHitParticles(posAbove(o.blockedByWall.group.position, 1.2), 0xaaaaaa);
            }
          } else {
            if (bHead) { bHead.position.z = 0; bHead.position.y = 1.07; bHead.rotation.x = 0; }
            if (bJaw)  { bJaw.rotation.x = 0.12; }
            o.group.rotation.x = 0; o._lungeBase = null;
          }
        } else if (o.type === 'grunt') {
          // ── GRUNT wall attack: body-forward smash ──
          o.group.position.y = Math.abs(Math.sin((o.animTime || 0) * 1.5)) * 0.06;
          o.group.rotation.z = 0;
          if (o.legL) o.legL.rotation.x = 0;
          if (o.legR) o.legR.rotation.x = 0;
          if ((o.swingPhase || 0) > 0) {
            const swingRate = o.berserk ? 1.9 : 1.2; // berserk grunts swing faster
            o.swingPhase = Math.max(0, o.swingPhase - dt * swingRate);
            const sw = Math.sin(o.swingPhase * Math.PI);
            if (o.armR) { o.armR.rotation.x = -1.6 + sw * 3.2; o.armR.rotation.z = -0.15 + sw * 0.20; }
            if (o.armL) { o.armL.rotation.x = -0.20 - sw * 0.3; o.armL.rotation.z = 0.28; }
            o.group.rotation.x = sw * 0.36;
            if (!o._lungeBase && o.blockedByWall) {
              o._lungeBase = { x: o.group.position.x, z: o.group.position.z };
              const tp = o.blockedByWall.group.position;
              const dx = tp.x - o.group.position.x, dz = tp.z - o.group.position.z;
              const d2 = Math.sqrt(dx * dx + dz * dz) || 1;
              o._lungeDir = { x: dx / d2, z: dz / d2 };
            }
            if (o._lungeBase) {
              const lunge = sw * 0.18;
              o.group.position.x = o._lungeBase.x + o._lungeDir.x * lunge;
              o.group.position.z = o._lungeBase.z + o._lungeDir.z * lunge;
            }
            if (!o.swingHit && o.swingPhase <= 0.5 && o.swingDamageReady && o.blockedByWall?.alive) {
              o.swingHit = true; o.swingDamageReady = false;
              SND.wallHit();
              const wallDmg = (CFG.ORC_TYPES.grunt.wallDmg || 3) + (o.berserk ? 1 : 0); // +1 wall dmg when berserk
              dealDefenderDamage(o.blockedByWall, wallDmg);
              if (o.blockedByWall) spawnHitParticles(posAbove(o.blockedByWall.group.position, 1.2), o.berserk ? 0xff4400 : 0xaaaaaa);
            }
          } else {
            o._swingRest = (o._swingRest || 0) + dt;
            if (o._swingRest >= 0.06) { o._swingRest = 0; o.swingPhase = 1.0; o.swingHit = false; o.swingDamageReady = false; }
            if (o.armR) { o.armR.rotation.x = -1.6; o.armR.rotation.z = -0.15; }
            if (o.armL) { o.armL.rotation.x = -0.20; o.armL.rotation.z = 0.28; }
            o.group.rotation.x = 0.08; o._lungeBase = null;
          }
        } else {
          // Planted stance — only weapon arm swings, no body bob or leg stride
          o.group.position.y = 0;
          o.group.rotation.z = 0;
          o.group.rotation.x = 0;
          if (o.legL) o.legL.rotation.x = 0;
          if (o.legR) o.legR.rotation.x = 0;
          if (o.type === 'enemyArcher') {
            // Bow draw animation — wall damage from fireEnemyArrow via wallAttackTimer
            o.drawPhase = Math.max(0, (o.drawPhase || 0) - dt * 3.2);
            const dp = o.drawPhase;
            if (o.armR) { o.armR.rotation.x = -1.0 + dp * 0.55; o.armR.rotation.z = -0.24; }
            if (o.armL) { o.armL.rotation.x = -0.50; o.armL.rotation.z = 0.10; }
          } else if (o.type === 'orcMage') {
            // Staff cast animation — wall damage from fireEnemyMagic via wallAttackTimer
            o.castPhase = Math.max(0, (o.castPhase || 0) - dt * 4);
            const mcp = Math.sin((o.castPhase || 0) * Math.PI);
            if (o.armR) { o.armR.rotation.x = -1.1 - mcp * 0.5; o.armR.rotation.z = -0.18; }
            if (o.armL) { o.armL.rotation.x = 0.28; o.armL.rotation.z = 0.22; }
            if (o.staffOrb) o.staffOrb.material.emissiveIntensity = 2.0 + mcp * 2.5;
          } else if (o.type === 'troll' || o.type === 'rockTroll') {
            // ── TROLL/ROCKTROLL: two-handed overhead smash — both fists raise high, slam down
            if ((o.swingPhase || 0) > 0) {
              o.swingPhase = Math.max(0, o.swingPhase - dt * 0.85); // slow, heavy swing
              const tsw = Math.sin(o.swingPhase * Math.PI);
              if (o.armR) { o.armR.rotation.x = -2.0 + tsw * 3.7; o.armR.rotation.z = -0.08; }
              if (o.armL) { o.armL.rotation.x = -2.0 + tsw * 3.7; o.armL.rotation.z =  0.08; }
              o.group.rotation.x = tsw * 0.42;                    // body heaves forward with slam
              o.group.position.y = -tsw * 0.08;                   // knees buckle at impact
              if (!o._lungeBase && o.blockedByWall) {
                o._lungeBase = { x: o.group.position.x, z: o.group.position.z };
                const tp = o.blockedByWall.group.position;
                const dx = tp.x - o.group.position.x, dz = tp.z - o.group.position.z;
                const d2 = Math.sqrt(dx * dx + dz * dz) || 1;
                o._lungeDir = { x: dx / d2, z: dz / d2 };
              }
              if (o._lungeBase) {
                const lunge = tsw * 0.12;
                o.group.position.x = o._lungeBase.x + o._lungeDir.x * lunge;
                o.group.position.z = o._lungeBase.z + o._lungeDir.z * lunge;
              }
              if (!o.swingHit && o.swingPhase <= 0.5 && o.swingDamageReady && o.blockedByWall?.alive) {
                o.swingHit = true; o.swingDamageReady = false;
                SND.wallHit();
                dealDefenderDamage(o.blockedByWall, CFG.ORC_TYPES[o.type].wallDmg || 1);
                if (o.blockedByWall) spawnHitParticles(posAbove(o.blockedByWall.group.position, 1.2), 0xaaaaaa);
              }
            } else {
              o._swingRest = (o._swingRest || 0) + dt;
              if (o._swingRest >= 0.08) { o._swingRest = 0; o.swingPhase = 1.0; o.swingHit = false; o.swingDamageReady = false; }
              if (o.armR) { o.armR.rotation.x = -2.0; o.armR.rotation.z = -0.08; }
              if (o.armL) { o.armL.rotation.x = -2.0; o.armL.rotation.z =  0.08; }
              o.group.rotation.x = 0;          // clear forward heave residual
              o.group.position.y = 0;          // settle from knee buckle
              o._lungeBase = null;
            }
          } else if (o.type === 'boss') {
            // ── BOSS: dominant overhead chop with torso rotation into the strike
            if ((o.swingPhase || 0) > 0) {
              o.swingPhase = Math.max(0, o.swingPhase - dt * 1.1);
              const bsw = Math.sin(o.swingPhase * Math.PI);
              if (o.armR) { o.armR.rotation.x = -1.7 + bsw * 3.3; o.armR.rotation.z = -0.28 + bsw * 0.50; }
              if (o.armL) { o.armL.rotation.x =  0.35 - bsw * 0.45; o.armL.rotation.z =  0.18 - bsw * 0.10; }
              o.group.rotation.x = bsw * 0.36;
              o.group.rotation.z = 0;                              // no sideways tilt — boss is square to wall
              // Torso winds back then into strike (line 5045 above resets rotation.y to face wall each frame)
              o.group.rotation.y += (bsw - 0.5) * 0.10;
              if (!o._lungeBase && o.blockedByWall) {
                o._lungeBase = { x: o.group.position.x, z: o.group.position.z };
                const tp = o.blockedByWall.group.position;
                const dx = tp.x - o.group.position.x, dz = tp.z - o.group.position.z;
                const d2 = Math.sqrt(dx * dx + dz * dz) || 1;
                o._lungeDir = { x: dx / d2, z: dz / d2 };
              }
              if (o._lungeBase) {
                const lunge = bsw * 0.18;
                o.group.position.x = o._lungeBase.x + o._lungeDir.x * lunge;
                o.group.position.z = o._lungeBase.z + o._lungeDir.z * lunge;
              }
              if (!o.swingHit && o.swingPhase <= 0.5 && o.swingDamageReady && o.blockedByWall?.alive) {
                o.swingHit = true; o.swingDamageReady = false;
                SND.wallHit();
                dealDefenderDamage(o.blockedByWall, CFG.ORC_TYPES[o.type].wallDmg || 1);
                if (o.blockedByWall) spawnHitParticles(posAbove(o.blockedByWall.group.position, 1.2), 0xaaaaaa);
              }
            } else {
              o._swingRest = (o._swingRest || 0) + dt;
              if (o._swingRest >= 0.06) { o._swingRest = 0; o.swingPhase = 1.0; o.swingHit = false; o.swingDamageReady = false; }
              if (o.armR) { o.armR.rotation.x = -1.7; o.armR.rotation.z = -0.28; }
              if (o.armL) { o.armL.rotation.x =  0.35; o.armL.rotation.z =  0.18; }
              o._lungeBase = null;
            }
          } else if (o.type === 'brute') {
            // ── BRUTE: hook swing — shoulder drives into the wall, club arcs sideways
            if ((o.swingPhase || 0) > 0) {
              o.swingPhase = Math.max(0, o.swingPhase - dt * 1.3);
              const bsw = Math.sin(o.swingPhase * Math.PI);
              if (o.armR) { o.armR.rotation.x = -0.6 + bsw * 1.5; o.armR.rotation.z = -0.45 + bsw * 0.70; }
              if (o.armL) { o.armL.rotation.x =  0.30 - bsw * 0.30; o.armL.rotation.z =  0.28; }
              o.group.rotation.x = bsw * 0.24;
              o.group.rotation.z = -bsw * 0.08;                   // gentle shoulder lead, not heavy roll
              if (!o._lungeBase && o.blockedByWall) {
                o._lungeBase = { x: o.group.position.x, z: o.group.position.z };
                const tp = o.blockedByWall.group.position;
                const dx = tp.x - o.group.position.x, dz = tp.z - o.group.position.z;
                const d2 = Math.sqrt(dx * dx + dz * dz) || 1;
                o._lungeDir = { x: dx / d2, z: dz / d2 };
              }
              if (o._lungeBase) {
                const lunge = bsw * 0.22;
                o.group.position.x = o._lungeBase.x + o._lungeDir.x * lunge;
                o.group.position.z = o._lungeBase.z + o._lungeDir.z * lunge;
              }
              if (!o.swingHit && o.swingPhase <= 0.5 && o.swingDamageReady && o.blockedByWall?.alive) {
                o.swingHit = true; o.swingDamageReady = false;
                SND.wallHit();
                dealDefenderDamage(o.blockedByWall, CFG.ORC_TYPES[o.type].wallDmg || 1);
                if (o.blockedByWall) spawnHitParticles(posAbove(o.blockedByWall.group.position, 1.2), 0xaaaaaa);
              }
            } else {
              o._swingRest = (o._swingRest || 0) + dt;
              if (o._swingRest >= 0.06) { o._swingRest = 0; o.swingPhase = 1.0; o.swingHit = false; o.swingDamageReady = false; }
              if (o.armR) { o.armR.rotation.x = -0.6; o.armR.rotation.z = -0.45; }
              if (o.armL) { o.armL.rotation.x =  0.30; o.armL.rotation.z =  0.28; }
              o._lungeBase = null;
            }
          } else if ((o.swingPhase || 0) > 0) {
            o.swingPhase = Math.max(0, o.swingPhase - dt * 1);
            const sw2 = Math.sin(o.swingPhase * Math.PI);
            if (o.armR) { o.armR.rotation.x = -1.4 + sw2 * 2.8; o.armR.rotation.z = -0.20 + sw2 * 0.30; }
            if (o.armL) { o.armL.rotation.x = 0.35 - sw2 * 0.4; o.armL.rotation.z = 0.18; }
            o.group.rotation.x = sw2 * 0.28;
            if (!o.swingHit && o.swingPhase <= 0.5 && o.swingDamageReady && o.blockedByWall?.alive) {
              o.swingHit = true; o.swingDamageReady = false;
              SND.wallHit();
              dealDefenderDamage(o.blockedByWall, CFG.ORC_TYPES[o.type].wallDmg || 1);
              if (o.blockedByWall) spawnHitParticles(posAbove(o.blockedByWall.group.position, 1.2), 0xaaaaaa);
            }
            if (!o._lungeBase && o.blockedByWall) {
              o._lungeBase = { x: o.group.position.x, z: o.group.position.z };
              const tp = o.blockedByWall.group.position;
              const dx = tp.x - o.group.position.x, dz = tp.z - o.group.position.z;
              const d2 = Math.sqrt(dx * dx + dz * dz) || 1;
              o._lungeDir = { x: dx / d2, z: dz / d2 };
            }
            if (o._lungeBase) {
              const lunge = sw2 * 0.14;
              o.group.position.x = o._lungeBase.x + o._lungeDir.x * lunge;
              o.group.position.z = o._lungeBase.z + o._lungeDir.z * lunge;
            }
          } else {
            o._swingRest = (o._swingRest || 0) + dt;
            if (o._swingRest >= 0.06) { o._swingRest = 0; o.swingPhase = 1.0; o.swingHit = false; o.swingDamageReady = false; }
            if (o.armR) { o.armR.rotation.x = -1.4; o.armR.rotation.z = -0.20; }
            if (o.armL) { o.armL.rotation.x =  0.35; o.armL.rotation.z =  0.18; }
            o.group.rotation.x = 0;
            o._lungeBase = null;
          }
        }
        // Navigate to pre-assigned spread position across the wall face
        if (o.wallTargetX !== null) {
          const wtdx = o.wallTargetX - o.group.position.x;
          const wtdz = o.wallTargetZ - o.group.position.z;
          const wtD  = Math.sqrt(wtdx * wtdx + wtdz * wtdz);
          if (wtD > 0.06) {
            const spd = o.speed * dt;
            o.group.position.x += (wtdx / wtD) * Math.min(spd, wtD);
            o.group.position.z += (wtdz / wtD) * Math.min(spd, wtD);
            pushFromStatics(o.group.position, 0.28 + 0.12 * o.scale);
            pushFromBuildings(o.group.position, 0.28 + 0.12 * o.scale, o.blockedByWall);
          }
        }
        updateOrcHPBar(o);
        updateOrcFlash(o, dt);
        continue;
      }
    }

    // ── Defender-fighting logic (enemy stops to attack nearby towers/soldiers) ──
    if (o.fightingDefender) {
      if (!o.fightingDefender.alive) {
        releaseAttackSlot(o.fightingDefender, o); o.attackSlot = -1;
        o.fightingDefender = null;
        // Immediately look for another target so enemy doesn't drift one frame
        const _isAggro = o.type === 'grunt' || o.type === 'skeleton' || o.type === 'wolf';
        const detRe = (_isAggro ? 2.6 : 1.5) + 0.3 * o.scale;
        const nextDef = findDefenderInRange(o.group.position, detRe);
        if (nextDef) {
          const ns = acquireAttackSlot(nextDef, o);
          if (ns >= 0) { o.attackSlot = ns; o.fightingDefender = nextDef; o.defAttackTimer = 0; o.swingDamageReady = false; o.swingPhase = 0; o.swingHit = false; }
          updateOrcHPBar(o);
          updateOrcFlash(o, dt);
          continue; // Stay stopped — fightingDefender block runs next frame
        }
        // No melee replacement — look for a farther target to chase, else return to path
        o.group.rotation.x = 0;
        o.group.rotation.z = 0;
        o.swingPhase = 0;
        const chaseNext = findDefenderInRange(o.group.position, 5.0);
        if (chaseNext) { o.chasingDefender = chaseNext; continue; }
        returnToPath(o);
      } else {
        // If a wall now blocks the path to the fighting defender, give up and return to path
        if (_wallBlocksPath(o.group.position, o.fightingDefender.group.position)) {
          releaseAttackSlot(o.fightingDefender, o); o.attackSlot = -1;
          o.fightingDefender = null;
          returnToPath(o);
          updateOrcHPBar(o); updateOrcFlash(o, dt);
          continue;
        }
        // Acquire (or re-verify) slot — auto-expands to outer rings, always succeeds
        if (o.attackSlot < 0) o.attackSlot = acquireAttackSlot(o.fightingDefender, o);
        const SLOT_DIST = attackSlotDist(o.attackSlot, o.scale);
        // Navigate to assigned slot position
        const sp = attackSlotPos(o.fightingDefender, o.attackSlot, o.scale);
        const sdx = sp.x - o.group.position.x, sdz = sp.z - o.group.position.z;
        const sDist = Math.sqrt(sdx * sdx + sdz * sdz);
        if (sDist > 0.15) {
          const spd = Math.min(o.speed * dt, sDist);
          o.group.position.x += (sdx / sDist) * spd;
          o.group.position.z += (sdz / sDist) * spd;
          pushFromStatics(o.group.position, 0.28 + 0.12 * o.scale);
          pushFromBuildings(o.group.position, 0.28 + 0.12 * o.scale, o.fightingDefender);
          // Push apart from other enemies while navigating to slot
          for (const other of orcs) {
            if (other === o || !other.alive) continue;
            const pushD = 0.5 + 0.1 * o.scale;
            const epx = o.group.position.x - other.group.position.x;
            const epz = o.group.position.z - other.group.position.z;
            const ed2 = epx * epx + epz * epz;
            if (ed2 < pushD * pushD && ed2 > 0.0001) { const ed = Math.sqrt(ed2); o.group.position.x += (epx / ed) * (pushD - ed) * 0.3; o.group.position.z += (epz / ed) * (pushD - ed) * 0.3; }
          }
          o.group.rotation.y = Math.atan2(sdx, sdz);
          // Clear residual lean/tilt from prior states so orc walks upright into slot
          o.group.rotation.x = 0;
          o.group.rotation.z = 0;
          updateOrcHPBar(o); updateOrcFlash(o, dt);
          continue;
        }
        // Check still reasonably close to defender (grunt/skeleton lock on until defender dies)
        const _stickyFight = o.type === 'grunt' || o.type === 'skeleton';
        const _maxDist = SLOT_DIST + 0.8 + 0.3 * o.scale;
        const fDist2 = o.group.position.distanceToSquared(o.fightingDefender.group.position);
        if (!_stickyFight && fDist2 > _maxDist * _maxDist) {
          releaseAttackSlot(o.fightingDefender, o); o.attackSlot = -1;
          o.fightingDefender = null; // Drifted out of range — keep walking
        } else {
          o.defAttackTimer -= dt;
          if (o.defAttackTimer <= 0) {
            const defRate = CFG.ORC_TYPES[o.type].defRate || 0.8;
            o.defAttackTimer = 1 / defRate;
            o.swingDamageReady = true;
            if (!o.swingPhase || o.swingPhase < 0.5) { o.swingPhase = 1.0; o.swingHit = false; }
          }
          // Face the target
          if (o.fightingDefender && o.fightingDefender.alive) {
            const dp = o.fightingDefender.group.position;
            o.group.rotation.y = Math.atan2(dp.x - o.group.position.x, dp.z - o.group.position.z);
          }
          // Animate in place (attack bob)
          o.animTime += dt * 5.5;
          if (o.type === 'spider') {
            // Frantic attack: fast scuttle + rearing claw strike
            const sa = Math.sin(o.animTime * 2.5);
            o.group.position.y = Math.abs(sa) * 0.05 + 0.02;
            o.group.rotation.z = sa * 0.10;                  // gentler scuttle roll
            o.group.rotation.x = -0.14 + Math.sin(o.animTime * 1.6) * 0.10;
            if ((o.swingPhase || 0) > 0) {
              o.swingPhase = Math.max(0, o.swingPhase - dt * 12);
              const ss = Math.sin(o.swingPhase * Math.PI);
              if (!o.swingHit && o.swingPhase <= 0.5 && o.swingDamageReady && o.fightingDefender?.alive && weaponInRange(o, o.fightingDefender, 0.55)) {
                o.swingHit = true; o.swingDamageReady = false;
                SND.sword(); dealDefenderDamage(o.fightingDefender, CFG.ORC_TYPES[o.type].defDmg || 1, o);
                if (o.fightingDefender?.alive) { const cp = o.group.position.clone().lerp(o.fightingDefender.group.position, 0.5); cp.y += 0.6; spawnHitParticles(cp, 0xff6600); spawnImpactRing(cp, 0xff8844); }
              }
              o.group.rotation.x = -0.14 + ss * 0.44;
              if (!o._lungeBase && o.fightingDefender) {
                o._lungeBase = { x: o.group.position.x, z: o.group.position.z };
                const tp = o.fightingDefender.group.position;
                const dx = tp.x - o.group.position.x, dz = tp.z - o.group.position.z;
                const d2 = Math.sqrt(dx * dx + dz * dz) || 1;
                o._lungeDir = { x: dx / d2, z: dz / d2 };
              }
              if (o._lungeBase) {
                o.group.position.x = o._lungeBase.x + o._lungeDir.x * ss * 0.18;
                o.group.position.z = o._lungeBase.z + o._lungeDir.z * ss * 0.18;
              }
            } else {
              o._swingRest = (o._swingRest || 0) + dt;
              if (o._swingRest >= 0.06) { o._swingRest = 0; o.swingPhase = 1.0; o.swingHit = false; o.swingDamageReady = false; }
              o._lungeBase = null;
            }
          } else if (o.type === 'wolf') {
            // Low combat crouch — slow aggressive bob + bite lunge
            const wa = Math.sin(o.animTime * 1.4);
            o.group.position.y = 0;
            o.group.rotation.x = -0.10 + Math.abs(wa) * 0.08;
            o.group.rotation.z = Math.sin(o.animTime * 0.8) * 0.05;     // softer body roll
            o.legL.position.y = 0.16 + wa * 0.07;
            o.legR.position.y = 0.16 - wa * 0.07;
            if (o.legFR) o.legFR.position.y = 0.16 - wa * 0.07;
            if (o.legBL) o.legBL.position.y = 0.16 + wa * 0.07;
            if ((o.swingPhase || 0) > 0) {
              o.swingPhase = Math.max(0, o.swingPhase - dt * 10);
              const ws = Math.sin(o.swingPhase * Math.PI);
              if (!o.swingHit && o.swingPhase <= 0.5 && o.swingDamageReady && o.fightingDefender?.alive && weaponInRange(o, o.fightingDefender, 0.65)) {
                o.swingHit = true; o.swingDamageReady = false;
                SND.sword(); dealDefenderDamage(o.fightingDefender, CFG.ORC_TYPES[o.type].defDmg || 1, o);
                if (o.fightingDefender?.alive) { const cp = o.group.position.clone().lerp(o.fightingDefender.group.position, 0.5); cp.y += 0.7; spawnHitParticles(cp, 0xff6600); spawnImpactRing(cp, 0xff8844); }
              }
              o.group.rotation.x = -0.10 + ws * 0.52;
              if (!o._lungeBase && o.fightingDefender) {
                o._lungeBase = { x: o.group.position.x, z: o.group.position.z };
                const tp = o.fightingDefender.group.position;
                const dx = tp.x - o.group.position.x, dz = tp.z - o.group.position.z;
                const d2 = Math.sqrt(dx * dx + dz * dz) || 1;
                o._lungeDir = { x: dx / d2, z: dz / d2 };
              }
              if (o._lungeBase) {
                o.group.position.x = o._lungeBase.x + o._lungeDir.x * ws * 0.22;
                o.group.position.z = o._lungeBase.z + o._lungeDir.z * ws * 0.22;
              }
            } else {
              o._swingRest = (o._swingRest || 0) + dt;
              if (o._swingRest >= 0.06) { o._swingRest = 0; o.swingPhase = 1.0; o.swingHit = false; o.swingDamageReady = false; }
              o._lungeBase = null;
            }
          } else if (o.type === 'cyclops') {
            const cca = Math.sin(o.animTime);
            o.group.position.y = Math.abs(cca) * 0.28;
            o.legL.position.y = 0.32 + cca * 0.17;
            o.legR.position.y = 0.32 - cca * 0.17;
            if ((o.swingPhase || 0) > 0) {
              o.swingPhase = Math.max(0, o.swingPhase - dt * 4);
              const csw = Math.sin(o.swingPhase * Math.PI);
              if (!o.swingHit && o.swingPhase <= 0.5 && o.swingDamageReady && o.fightingDefender?.alive && weaponInRange(o, o.fightingDefender, 1.1)) {
                o.swingHit = true; o.swingDamageReady = false;
                SND.sword(); dealDefenderDamage(o.fightingDefender, CFG.ORC_TYPES[o.type].defDmg || 1, o);
                if (o.fightingDefender?.alive) { const cp = o.group.position.clone().lerp(o.fightingDefender.group.position, 0.5); cp.y += 0.9; spawnHitParticles(cp, 0xff6600); spawnImpactRing(cp, 0xff8844); }
              }
              if (o.armR) { o.armR.rotation.x = -0.75 + csw * 3.0; o.armR.rotation.z = -csw * 0.22; }
              if (o.armL) { o.armL.rotation.x =  csw * 1.2; o.armL.rotation.z =  csw * 0.18; }
              o.group.rotation.z = csw * 0.10;                  // gentler shoulder twist into strike
              o.group.rotation.x = 0.10 + csw * 0.38;
            } else {
              o._swingRest = (o._swingRest || 0) + dt;
              if (o._swingRest >= 0.06) { o._swingRest = 0; o.swingPhase = 1.0; o.swingHit = false; o.swingDamageReady = false; }
              if (o.armR) { o.armR.rotation.x = -0.75; o.armR.rotation.z = 0; }
              if (o.armL) { o.armL.rotation.x = -cca * 0.88; o.armL.rotation.z = 0.14; }
              o.group.rotation.z = Math.sin(o.animTime * 0.6) * 0.04;   // softer idle sway
              o.group.rotation.x = 0.08;
            }
          } else if (o.type === 'skeleton') {
            // Bite attack on defender — head lunges, jaw snaps, arms hang
            const bHead = o.hitFlashMeshes[1];
            const bJaw  = o.group.userData.skelJaw;
            o.group.position.y = 0; o.group.rotation.x = 0; o.group.rotation.z = 0;
            if (o.legL) { o.legL.position.y = 0.19; o.legL.rotation.x = 0; }
            if (o.legR) { o.legR.position.y = 0.19; o.legR.rotation.x = 0; }
            if (o.armL) { o.armL.rotation.x = 0.15; o.armL.rotation.z =  0.35; }
            if (o.armR) { o.armR.rotation.x = 0.15; o.armR.rotation.z = -0.35; }
            if ((o.swingPhase || 0) > 0) {
              o.swingPhase = Math.max(0, o.swingPhase - dt * 8);
              const sb = Math.sin(o.swingPhase * Math.PI);
              if (!o.swingHit && o.swingPhase <= 0.5 && o.swingDamageReady && o.fightingDefender?.alive && weaponInRange(o, o.fightingDefender, 0.6)) {
                o.swingHit = true; o.swingDamageReady = false;
                SND.sword(); dealDefenderDamage(o.fightingDefender, CFG.ORC_TYPES[o.type].defDmg || 1, o);
                if (o.fightingDefender?.alive) { const cp = o.group.position.clone().lerp(o.fightingDefender.group.position, 0.5); cp.y += 0.9; spawnHitParticles(cp, 0xff6600); spawnImpactRing(cp, 0xff8844); }
              }
              if (bHead) { bHead.position.z = sb * 0.30; bHead.position.y = 1.07 - sb * 0.05; bHead.rotation.x = sb * 0.45; }
              if (bJaw)  { bJaw.rotation.x = 0.12 + sb * 0.65; }
              o.group.rotation.x = sb * 0.38;
              if (!o._lungeBase && o.fightingDefender) {
                o._lungeBase = { x: o.group.position.x, z: o.group.position.z };
                const tp = o.fightingDefender.group.position;
                const dx = tp.x - o.group.position.x, dz = tp.z - o.group.position.z;
                const d2 = Math.sqrt(dx * dx + dz * dz) || 1;
                o._lungeDir = { x: dx / d2, z: dz / d2 };
              }
              if (o._lungeBase) {
                const lunge = sb * 0.22;
                o.group.position.x = o._lungeBase.x + o._lungeDir.x * lunge;
                o.group.position.z = o._lungeBase.z + o._lungeDir.z * lunge;
              }
            } else {
              o._swingRest = (o._swingRest || 0) + dt;
              if (o._swingRest >= 0.06) { o._swingRest = 0; o.swingPhase = 1.0; o.swingHit = false; o.swingDamageReady = false; }
              if (bHead) { bHead.position.z = 0; bHead.position.y = 1.07; bHead.rotation.x = 0; }
              if (bJaw)  { bJaw.rotation.x = 0.12; }
              o.group.rotation.x = 0; o._lungeBase = null;
            }
          } else if (o.type === 'brute') {
            // ── BRUTE: club-hook swing — shoulder drives forward, club arcs in sideways ──
            o.group.position.y = Math.abs(Math.sin((o.animTime || 0) * 1.6)) * 0.06;
            if ((o.swingPhase || 0) > 0) {
              o.swingPhase = Math.max(0, o.swingPhase - dt * 2.0);
              const sw = Math.sin(o.swingPhase * Math.PI);
              if (o.armR) { o.armR.rotation.x = -0.6 + sw * 1.55; o.armR.rotation.z = -0.45 + sw * 0.75; }
              if (o.armL) { o.armL.rotation.x = 0.30 - sw * 0.35; o.armL.rotation.z = 0.28; }
              o.group.rotation.x = sw * 0.26;
              o.group.rotation.z = -sw * 0.09;                 // gentle shoulder lead, not an off-axis roll
              if (!o._lungeBase && o.fightingDefender) {
                o._lungeBase = { x: o.group.position.x, z: o.group.position.z };
                const tp = o.fightingDefender.group.position;
                const dx = tp.x - o.group.position.x, dz = tp.z - o.group.position.z;
                const d2 = Math.sqrt(dx * dx + dz * dz) || 1;
                o._lungeDir = { x: dx / d2, z: dz / d2 };
              }
              if (o._lungeBase) {
                const lunge = sw * 0.22;
                o.group.position.x = o._lungeBase.x + o._lungeDir.x * lunge;
                o.group.position.z = o._lungeBase.z + o._lungeDir.z * lunge;
              }
              if (!o.swingHit && o.swingPhase <= 0.5 && o.swingDamageReady && o.fightingDefender?.alive && weaponInRange(o, o.fightingDefender, 0.75)) {
                o.swingHit = true; o.swingDamageReady = false;
                SND.sword(); dealDefenderDamage(o.fightingDefender, CFG.ORC_TYPES[o.type].defDmg || 1, o);
                if (o.fightingDefender?.alive) { const cp = o.group.position.clone().lerp(o.fightingDefender.group.position, 0.5); cp.y += 0.9; spawnHitParticles(cp, 0xff6600); spawnImpactRing(cp, 0xff8844); }
              }
            } else {
              o._swingRest = (o._swingRest || 0) + dt;
              if (o._swingRest >= 0.10) { o._swingRest = 0; o.swingPhase = 1.0; o.swingHit = false; o.swingDamageReady = false; }
              if (o.armR) { o.armR.rotation.x = -0.6; o.armR.rotation.z = -0.45; }
              if (o.armL) { o.armL.rotation.x = 0.30; o.armL.rotation.z = 0.28; }
              o.group.rotation.x = 0; o.group.rotation.z = 0;
              o._lungeBase = null;
            }
          } else if (o.type === 'grunt') {
            // ── GRUNT: aggressive shoulder-charge lunge ──
            o.group.position.y = Math.abs(Math.sin((o.animTime || 0) * 2)) * 0.05;
            if ((o.swingPhase || 0) > 0) {
              o.swingPhase = Math.max(0, o.swingPhase - dt * 2.5);
              const sw = Math.sin(o.swingPhase * Math.PI);
              if (o.armR) { o.armR.rotation.x = -1.6 + sw * 3.2; o.armR.rotation.z = -0.15 + sw * 0.20; }
              if (o.armL) { o.armL.rotation.x = -0.20 - sw * 0.4; o.armL.rotation.z = 0.30; }
              o.group.rotation.x = 0.10 + sw * 0.38;
              o.group.rotation.z = sw * 0.06;                  // subtle hip lead, no big sideways tilt
              if (!o._lungeBase && o.fightingDefender) {
                o._lungeBase = { x: o.group.position.x, z: o.group.position.z };
                const tp = o.fightingDefender.group.position;
                const dx = tp.x - o.group.position.x, dz = tp.z - o.group.position.z;
                const d2 = Math.sqrt(dx * dx + dz * dz) || 1;
                o._lungeDir = { x: dx / d2, z: dz / d2 };
              }
              if (o._lungeBase) {
                const lunge = sw * 0.20;
                o.group.position.x = o._lungeBase.x + o._lungeDir.x * lunge;
                o.group.position.z = o._lungeBase.z + o._lungeDir.z * lunge;
              }
              if (!o.swingHit && o.swingPhase <= 0.5 && o.swingDamageReady && o.fightingDefender?.alive && weaponInRange(o, o.fightingDefender, 0.65)) {
                o.swingHit = true; o.swingDamageReady = false;
                SND.sword();
                const dmg = (CFG.ORC_TYPES.grunt.defDmg || 1) + (o.berserk ? 1 : 0);
                dealDefenderDamage(o.fightingDefender, dmg, o);
                if (o.fightingDefender?.alive) { const cp = o.group.position.clone().lerp(o.fightingDefender.group.position, 0.5); cp.y += 0.8; spawnHitParticles(cp, 0xff6600); spawnImpactRing(cp, 0xff8844); }
              }
            } else {
              o._swingRest = (o._swingRest || 0) + dt;
              const _restNeeded = Math.max(0.08, (1 / (CFG.ORC_TYPES.grunt.defRate || 1.4)) - 0.35);
              if (o._swingRest >= _restNeeded) { o._swingRest = 0; o.swingPhase = 1.0; o.swingHit = false; o.swingDamageReady = false; }
              if (o.armR) { o.armR.rotation.x = -1.6; o.armR.rotation.z = -0.15; }
              if (o.armL) { o.armL.rotation.x = -0.20; o.armL.rotation.z = 0.30; }
              o.group.rotation.x = 0.08; o.group.rotation.z = 0;
              o._lungeBase = null;
            }
          } else {
            // Planted stance — feet still, body upright, only weapon arm swings
            o.group.position.y = 0;
            o.group.rotation.x = 0;
            o.group.rotation.z = 0;
            if (o.legL) { o.legL.position.y = 0.19; o.legL.rotation.x = 0; }
            if (o.legR) { o.legR.position.y = 0.19; o.legR.rotation.x = 0; }
            const _isMeleeArcher = o.type === 'enemyArcher' || o.type === 'orcMage';
            if (_isMeleeArcher) {
              // Ranged casters in close combat show cast pose instead of sword swing
              // (projectiles still fired via tickRangedEnemy; swingPhase carries melee damage)
              o.drawPhase = Math.max(0, (o.drawPhase || 0) - dt * 3.2);
              const dp = o.drawPhase;
              if (o.armR) { o.armR.rotation.x = -1.0 + dp * 0.55; o.armR.rotation.z = -0.24; }
              if (o.armL) { o.armL.rotation.x = -0.50; o.armL.rotation.z = 0.10; }
              if ((o.swingPhase || 0) > 0) {
                o.swingPhase = Math.max(0, o.swingPhase - dt * 1);
                if (!o.swingHit && o.swingPhase <= 0.5 && o.swingDamageReady && o.fightingDefender?.alive && weaponInRange(o, o.fightingDefender)) {
                  o.swingHit = true; o.swingDamageReady = false;
                  SND.sword(); dealDefenderDamage(o.fightingDefender, CFG.ORC_TYPES[o.type].defDmg || 1, o);
                  if (o.fightingDefender?.alive) { const cp = o.group.position.clone().lerp(o.fightingDefender.group.position, 0.5); cp.y += 0.9; spawnHitParticles(cp, 0xff6600); spawnImpactRing(cp, 0xff8844); }
                }
              } else {
                o._swingRest = (o._swingRest || 0) + dt;
                if (o._swingRest >= 0.06) { o._swingRest = 0; o.swingPhase = 1.0; o.swingHit = false; o.swingDamageReady = false; }
                o._lungeBase = null;
              }
            } else if ((o.swingPhase || 0) > 0) {
              // Speed proportional to defRate so fast attackers (grunt 0.9/s) swing quickly
              const _swRate = (CFG.ORC_TYPES[o.type]?.defRate || 0.8) * 2.5;
              o.swingPhase = Math.max(0, o.swingPhase - dt * _swRate);
              const sw = Math.sin(o.swingPhase * Math.PI);
              // Hit lands at visual peak — weapon arm fully extended toward target
              if (!o.swingHit && o.swingPhase <= 0.5 && o.swingDamageReady && o.fightingDefender?.alive && weaponInRange(o, o.fightingDefender)) {
                o.swingHit = true;
                o.swingDamageReady = false;
                SND.sword();
                dealDefenderDamage(o.fightingDefender, CFG.ORC_TYPES[o.type].defDmg || 1, o);
                if (o.fightingDefender?.alive) {
                  const cp = o.group.position.clone().lerp(o.fightingDefender.group.position, 0.5);
                  cp.y += 0.9;
                  spawnHitParticles(cp, 0xff6600);
                  spawnImpactRing(cp, 0xff8844);
                }
              }
              if (o.armR) { o.armR.rotation.x = -1.4 + sw * 2.8; o.armR.rotation.z = -0.20 + sw * 0.30; }
              if (o.armL) { o.armL.rotation.x =  0.40 - sw * 0.4; o.armL.rotation.z = 0.22; }
              o.group.rotation.x = sw * 0.28;
              if (!o._lungeBase && o.fightingDefender) {
                o._lungeBase = { x: o.group.position.x, z: o.group.position.z };
                const tp = o.fightingDefender.group.position;
                const dx = tp.x - o.group.position.x, dz = tp.z - o.group.position.z;
                const d2 = Math.sqrt(dx * dx + dz * dz) || 1;
                o._lungeDir = { x: dx / d2, z: dz / d2 };
              }
              if (o._lungeBase) {
                const lunge = sw * 0.16;
                o.group.position.x = o._lungeBase.x + o._lungeDir.x * lunge;
                o.group.position.z = o._lungeBase.z + o._lungeDir.z * lunge;
              }
            } else {
              // Hold weapon-raised pose between swings; only restart animation once defAttackTimer
              // is about to fire so we don't spin through empty swings between damage ticks.
              o._swingRest = (o._swingRest || 0) + dt;
              const _restNeeded = Math.max(0.08, (1 / (CFG.ORC_TYPES[o.type]?.defRate || 0.8)) - 0.35);
              if (o._swingRest >= _restNeeded) { o._swingRest = 0; o.swingPhase = 1.0; o.swingHit = false; o.swingDamageReady = false; }
              if (o.armR) { o.armR.rotation.x = -1.4; o.armR.rotation.z = -0.20; }
              if (o.armL) { o.armL.rotation.x =  0.40; o.armL.rotation.z =  0.22; }
              o.group.rotation.x = 0;
              o._lungeBase = null;
            }
          }
          pushFromBuildings(o.group.position, 0.28 + 0.12 * o.scale, o.fightingDefender);
          updateOrcHPBar(o);
          updateOrcFlash(o, dt);
          tickRangedEnemy(o, dt); // ranged/aura enemies keep firing while stopped
          continue; // Don't move this frame
        }
      }
    }

    // ── Chase: enemy moves off-path in world-space toward a detected defender ──
    if (o.chasingDefender) {
      if (!o.chasingDefender.alive) {
        o.chasingDefender = null;
        const nextChase = findDefenderInRange(o.group.position, 5.0);
        if (nextChase) { o.chasingDefender = nextChase; }
        else           { returnToPath(o); }
      } else {
        // If a melee defender steps into immediate range while chasing a tower, engage it first
        const _isMA = o.type === 'grunt' || o.type === 'skeleton' || o.type === 'wolf';
        const _imR  = (_isMA ? 2.6 : 1.5) + 0.3 * o.scale;
        const _immMelee = findDefenderInRange(o.group.position, _imR);
        if (_immMelee && _immMelee !== o.chasingDefender) {
          const _imSlot = acquireAttackSlot(_immMelee, o);
          if (_imSlot >= 0) {
            o.chasingDefender = null;
            o.attackSlot = _imSlot;
            o.fightingDefender = _immMelee; o.defAttackTimer = 0;
            updateOrcHPBar(o); updateOrcFlash(o, dt);
            continue;
          }
        }
        // Abandon chase if a wall now blocks the path to the target
        if (_wallBlocksPath(o.group.position, o.chasingDefender.group.position)) {
          o.chasingDefender = null;
          returnToPath(o);
          updateOrcHPBar(o); updateOrcFlash(o, dt);
          continue;
        }
        const tx = o.chasingDefender.group.position.x;
        const tz = o.chasingDefender.group.position.z;
        const dx = tx - o.group.position.x;
        const dz = tz - o.group.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const atkR = 1.1 + 0.3 * o.scale;
        if (dist <= atkR) {
          const _chaseSlot = acquireAttackSlot(o.chasingDefender, o);
          if (_chaseSlot >= 0) {
            o.attackSlot = _chaseSlot;
            o.fightingDefender = o.chasingDefender;
            o.chasingDefender  = null;
            o.defAttackTimer   = 0;
            o.swingDamageReady = false; o.swingPhase = 0; o.swingHit = false;
          }
        } else {
          // Move directly toward target — determined charge
          const spd = Math.min(o.speed * dt, dist);
          o.group.position.x += (dx / dist) * spd;
          o.group.position.z += (dz / dist) * spd;
          // Avoid trees, rocks, and buildings while off-path
          const unitR = 0.28 + 0.12 * o.scale;
          pushFromStatics(o.group.position, unitR);
          pushFromBuildings(o.group.position, unitR, o.chasingDefender);
          // Spread apart from other enemies to prevent congestion
          for (const other of orcs) {
            if (other === o || !other.alive) continue;
            const pushD = 0.45 + 0.1 * o.scale;
            const epx = o.group.position.x - other.group.position.x;
            const epz = o.group.position.z - other.group.position.z;
            const ed2 = epx * epx + epz * epz;
            if (ed2 < pushD * pushD && ed2 > 0.0001) { const ed = Math.sqrt(ed2); o.group.position.x += (epx / ed) * (pushD - ed) * 0.28; o.group.position.z += (epz / ed) * (pushD - ed) * 0.28; }
          }
          pushFromBuildings(o.group.position, 0.28 + 0.12 * o.scale, o.chasingDefender);
          o.group.rotation.y  = Math.atan2(dx, dz);
          o.group.rotation.x  = 0.16; // aggressive charging lean
          o.animTime += dt * 7.5;
          const chs = Math.sin(o.animTime);
          const chc = Math.cos(o.animTime * 0.5);
          o.group.position.y  = chs * chs * 0.15;               // quadratic sprint bounce
          o.group.rotation.z  = chc * 0.072;                    // hip rock
          const legBase = o.type === 'wolf' ? 0.16 : o.type === 'cyclops' ? 0.32 : 0.19;
          if (o.legL) { o.legL.position.y = legBase + chs * 0.16; o.legL.rotation.x =  chs * 0.58; }
          if (o.legR) { o.legR.position.y = legBase - chs * 0.16; o.legR.rotation.x = -chs * 0.58; }
          if (o.armL) { o.armL.rotation.x =  chs * 0.72; o.armL.rotation.z =  chc * 0.10; }
          if (o.armR) { o.armR.rotation.x = -chs * 0.72; o.armR.rotation.z = -chc * 0.10; }
        }
      }
      updateOrcHPBar(o);
      updateOrcFlash(o, dt);
      tickRangedEnemy(o, dt);
      continue;
    }

    // ── Tower aggro: enemies within 6 tiles notice and charge towers/catapults ──
    // Melee defender check runs first — a soldier in range always beats a distant tower.
    if (!o.fightingDefender && !o.blockedByWall && !o.attackingCastle) {
      const _isMeleeAggro2 = o.type === 'grunt' || o.type === 'skeleton' || o.type === 'wolf';
      // Wider engagement: melee aggressors lock onto soldiers from further out so unprotected towers are real bait
      const _meleeR2 = (_isMeleeAggro2 ? 3.2 : 1.8) + 0.3 * o.scale;
      const nearMeleeFirst = findDefenderInRange(o.group.position, _meleeR2);
      if (nearMeleeFirst) {
        // Soldier within engagement range — fight it immediately, ignore tower
        const _nmSlot = acquireAttackSlot(nearMeleeFirst, o);
        if (_nmSlot >= 0) { o.attackSlot = _nmSlot; o.fightingDefender = nearMeleeFirst; o.defAttackTimer = 0; }
      } else {
        // Tower aggro radius bumped 6.0 → 7.5 — exposed towers get charged from farther on the path
        const nearTower = findTowerInRange(o.group.position, 7.5);
        if (nearTower && !_wallBlocksPath(o.group.position, nearTower.group.position)) {
          o.chasingDefender = nearTower;
          updateOrcHPBar(o);
          updateOrcFlash(o, dt);
          tickRangedEnemy(o, dt);
          continue;
        }
      }
    }

    // ── Separation: yield to enemies ahead on the same path ──
    // Smooth speed falloff: full speed at SEP_SLOW, full stop at SEP_STOP
    // Budget cap: skip when >80 active orcs to avoid O(n²) cost at large waves
    const SEP_STOP = 0.5, SEP_SLOW = 1.0;
    const SEP_SLOW_SQ = SEP_SLOW * SEP_SLOW;
    let speedFactor = 1.0;
    const _skipSep = orcs.length > 80;
    if (!_skipSep) for (const other of orcs) {
      if (other === o || !other.alive || other.path !== o.path) continue;
      // Off-path enemies have left the lane — don't block followers
      if (other.fightingDefender || other.chasingDefender || other.blockedByWall || other.attackingCastle) continue;
      const ahead = other.pathIndex > o.pathIndex ||
        (other.pathIndex === o.pathIndex && other.progress > o.progress) ||
        other.attackingCastle;
      if (!ahead) continue;
      const ddx = other.group.position.x - o.group.position.x;
      const ddz = other.group.position.z - o.group.position.z;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 < SEP_SLOW_SQ) {
        const t = Math.max(0, (Math.sqrt(d2) - SEP_STOP) / (SEP_SLOW - SEP_STOP));
        speedFactor = Math.min(speedFactor, t);
        if (speedFactor <= 0) break;
      }
    }

    // ── CC: slow debuff (applied by mage orb hits and spike traps) ──
    if (o.slowTimer > 0) {
      speedFactor *= o.slowAmount;
      o.slowTimer -= dt;
      if (o.slowTimer < 0) { o.slowTimer = 0; o.slowAmount = 1.0; }
    }

    // ── Test-mode: off-path placed enemy walks toward the path row ──
    if (o.testOffPath) {
      // Engage any nearby defender immediately rather than walking to path
      if (!o.fightingDefender) {
        const near = findDefenderInRange(o.group.position, 1.5 + 0.3 * o.scale);
        if (near) { const _ts = acquireAttackSlot(near, o); if (_ts >= 0) { o.attackSlot = _ts; o.fightingDefender = near; o.defAttackTimer = 0; o.testOffPath = false; } }
      }
      if (o.testOffPath) {
        const targetZ = o.path[o.pathIndex][1];
        const dz = targetZ - o.group.position.z;
        if (Math.abs(dz) < 0.25) {
          o.testOffPath = false; // reached path row, resume normal movement
        } else {
          const spd = o.speed * dt;
          o.group.position.z += Math.sign(dz) * Math.min(spd, Math.abs(dz));
          o.group.rotation.y = dz > 0 ? 0 : Math.PI;
          o.animTime += dt * 4;
          if (o.legL) { o.legL.rotation.x =  Math.sin(o.animTime) * 0.38; }
          if (o.legR) { o.legR.rotation.x = -Math.sin(o.animTime) * 0.38; }
          updateOrcHPBar(o); updateOrcFlash(o, dt);
          continue; // skip path interpolation this frame
        }
      }
    }

    // ── Skeleton wall-phase slowdown ──
    if (o._phaseTimer > 0) { o._phaseTimer -= dt; speedFactor *= 0.35; }

    // ── Movement along path ──
    o.progress += speedFactor * o.speed * dt;
    while (o.progress >= 1) {
      const nextIdx = o.pathIndex + 1;
      if (nextIdx >= o.path.length) {
        o.attackingCastle = true;
        o.castleAttackTimer = 0;
        o.progress = 0;
        // Assign lateral spread slot — same pattern as wall spread
        const takenCS = new Set();
        for (const other of orcs) {
          if (other !== o && other.alive && other.attackingCastle && other.castleSlotIdx >= 0)
            takenCS.add(other.castleSlotIdx);
        }
        let csi = 0; while (takenCS.has(csi)) csi++;
        o.castleSlotIdx = csi;
        const cgate = o.path[o.path.length - 1];
        const latSign = csi === 0 ? 0 : (csi % 2 === 1 ? 1 : -1);
        const latMag  = Math.ceil(csi / 2) * 0.85;
        o.castleTargetZ = cgate[1] + latSign * latMag;
        break;
      }
      // Check if next tile has a blocking wall
      const [nc, nr] = o.path[nextIdx];
      const wall = getWallAtPath(nc, nr);
      if (wall) {
        if (o.type === 'skeleton') {
          // Skeletons phase through walls — they're just bones, they squeeze through the gaps
          // Slowed to 35% speed for 1.8 s while passing through
          o._phaseTimer = 1.8;
          spawnHitParticles(posAbove(o.group.position, 0.6), 0x88aaff);
          SND.skeletonPhase();
          // Do NOT break — let normal advance happen below
        } else {
          o.blockedByWall = wall;
          o.wallAttackTimer = 0;
          // Stop far enough that the enemy's scaled body doesn't penetrate the wall mesh (±0.45 half-extent)
          o.progress = Math.max(0.05, 1 - 0.48 - 0.22 * o.scale);
          // Assign a unique lateral spread slot so enemies fan across the wall face
          const takenWS = new Set();
          for (const other of orcs) {
            if (other !== o && other.alive && other.blockedByWall === wall && other.wallSlotIdx >= 0)
              takenWS.add(other.wallSlotIdx);
          }
          let wsi = 0; while (takenWS.has(wsi)) wsi++;
          o.wallSlotIdx = wsi;
          // Perpendicular direction to path at this tile
          const [cc, cr] = o.path[o.pathIndex];
          const perpX = -(nr - cr), perpZ = nc - cc;
          const latSign = wsi === 0 ? 0 : (wsi % 2 === 1 ? 1 : -1);
          const latMag  = Math.ceil(wsi / 2) * 0.85;
          o.wallTargetX = cc + (nc - cc) * o.progress + perpX * latSign * latMag;
          o.wallTargetZ = cr + (nr - cr) * o.progress + perpZ * latSign * latMag;
          break;
        }
      }
      o.progress -= 1;
      o.pathIndex = nextIdx;
    }
    if (!o.alive || o.attackingCastle) continue;

    // ── Position interpolation ──
    const cur = o.path[o.pathIndex];
    const nxt = o.path[Math.min(o.pathIndex + 1, o.path.length - 1)];
    o.group.position.x = cur[0] + (nxt[0] - cur[0]) * o.progress;
    o.group.position.z = cur[1] + (nxt[1] - cur[1]) * o.progress;

    const dx = nxt[0] - cur[0], dz = nxt[1] - cur[1];
    if (dx !== 0 || dz !== 0) o.group.rotation.y = Math.atan2(dx, dz);

    // ── Soft push from enemies on other paths (prevents visual overlap at crossings) ──
    const crossMinD = 0.45 + 0.2 * o.scale;
    const crossMinD2 = crossMinD * crossMinD;
    for (const other of orcs) {
      if (other === o || !other.alive || other.path === o.path) continue;
      const ddx = o.group.position.x - other.group.position.x;
      const ddz = o.group.position.z - other.group.position.z;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 < crossMinD2 && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        o.group.position.x += (ddx / d) * (crossMinD - d) * 0.3;
        o.group.position.z += (ddz / d) * (crossMinD - d) * 0.3;
      }
    }
    // ── Push off towers/catapults placed near the path ──
    pushFromBuildings(o.group.position, 0.28 + 0.12 * o.scale);

    // ── Check for nearby defender to engage ──
    if (!o.fightingDefender && !o.blockedByWall && !o.chasingDefender) {
      // Tactical pass: wider melee + chase radii so unprotected defenders get hunted, not just walked past.
      const _isMeleeAggro = o.type === 'grunt' || o.type === 'skeleton' || o.type === 'wolf';
      const meleeR = (_isMeleeAggro ? 3.2 : 1.8) + 0.3 * o.scale;
      const near   = findDefenderInRange(o.group.position, meleeR);
      if (near) {
        const _nearSlot = acquireAttackSlot(near, o);
        if (_nearSlot >= 0) { o.attackSlot = _nearSlot; o.fightingDefender = near; o.defAttackTimer = 0; }
      } else {
        // Queue-breaking: if a same-path teammate ahead is already in combat, adopt their
        // target immediately and route around the cluster instead of queuing behind them
        let teamTarget = null;
        for (const other of orcs) {
          if (other === o || !other.alive || other.path !== o.path) continue;
          if (other.pathIndex < o.pathIndex) continue; // only look ahead on path
          if (other.fightingDefender && other.fightingDefender.alive) { teamTarget = other.fightingDefender; break; }
          if (other.chasingDefender  && other.chasingDefender.alive)  { teamTarget = other.chasingDefender;  break; }
        }
        if (teamTarget && !_wallBlocksPath(o.group.position, teamTarget.group.position)) {
          o.chasingDefender = teamTarget;
        } else {
          // Wider chase sweep: 5.0 → 6.5 base — exposed back-line defenders get hunted
          const chaseR = 6.5 + 0.4 * o.scale;
          const farDef = findDefenderInRange(o.group.position, chaseR);
          if (farDef && !_wallBlocksPath(o.group.position, farDef.group.position)) o.chasingDefender = farDef;
        }
      }
    }

    // ── Per-type animation ──
    if (o.type === 'spider') {
      o.animTime += dt * 14;
      const sp1 = Math.sin(o.animTime);
      const sp2 = Math.sin(o.animTime * 2);
      o.group.position.y = Math.abs(sp2) * 0.09 + 0.015;      // skitters up, always slightly elevated
      o.group.rotation.z = sp2 * 0.07;                         // controlled scuttle, not over-rolled
      o.group.rotation.x = Math.sin(o.animTime * 1.5) * 0.08; // front-back lurch
      // Leg pairs alternate phase for realistic multi-leg skitter
      if (o.legL) { o.legL.rotation.x =  sp1 * 0.50; o.legL.rotation.z =  sp2 * 0.22; }
      if (o.legR) { o.legR.rotation.x = -sp1 * 0.50; o.legR.rotation.z = -sp2 * 0.22; }
      if (o.armL) { o.armL.rotation.x = -sp2 * 0.38; o.armL.rotation.z =  sp1 * 0.18; }
      if (o.armR) { o.armR.rotation.x =  sp2 * 0.38; o.armR.rotation.z = -sp1 * 0.18; }
    } else if (o.type === 'wolf') {
      o.animTime += dt * 10;
      const wBound = Math.abs(Math.sin(o.animTime * 1.5));
      const wLeg   = Math.sin(o.animTime);
      const wSpine = Math.sin(o.animTime * 1.5);
      o.group.position.y = wBound * wBound * 0.16;
      o.group.rotation.x = wSpine * 0.16;                       // spine flexes with each bound
      o.group.rotation.z = wLeg * 0.045;                        // subtle body roll during gallop
      // 4-leg gallop: FL+BL vs FR+BR diagonal pairs
      o.legL.position.y = 0.16 + wLeg * 0.18;
      o.legR.position.y = 0.16 - wLeg * 0.18;
      if (o.legFR) o.legFR.position.y = 0.16 - wLeg * 0.18;
      if (o.legBL) o.legBL.position.y = 0.16 + wLeg * 0.18;
      o.legL.rotation.z  =  wLeg * 0.72;
      o.legR.rotation.z  = -wLeg * 0.72;
      if (o.legFR) o.legFR.rotation.z = -wLeg * 0.72;
      if (o.legBL) o.legBL.rotation.z =  wLeg * 0.72;
      o.legL.rotation.x  = -wLeg * 0.60;
      o.legR.rotation.x  =  wLeg * 0.60;
      if (o.legFR) o.legFR.rotation.x =  wLeg * 0.60;
      if (o.legBL) o.legBL.rotation.x = -wLeg * 0.60;
      // Head nods with each gallop bound
      const _wHead = o.hitFlashMeshes?.[1];
      if (_wHead) _wHead.rotation.x = wSpine * 0.13;
    } else if (o.type === 'cyclops') {
      o.animTime += dt * 2.0;
      const cs     = Math.sin(o.animTime);
      const cStomp = Math.abs(cs);
      const cHalf  = Math.sin(o.animTime * 0.5);
      o.group.position.y = cStomp * cStomp * 0.22;              // heavier stomp air time
      o.group.rotation.x = 0.05 + cStomp * 0.06;               // lean pulses with each impact
      o.group.rotation.z = cHalf * 0.07;                        // measured lumbering sway, not a roll
      o.legL.position.y = 0.32 + cs * 0.28;
      o.legR.position.y = 0.32 - cs * 0.28;
      o.legL.rotation.x =  cs * 0.55;
      o.legR.rotation.x = -cs * 0.55;
      o.legL.rotation.z =  cs * 0.10;                           // lateral leg kick on each stride
      o.legR.rotation.z = -cs * 0.10;
      if (o.armL) { o.armL.rotation.x = -cs * 0.72; o.armL.rotation.z =  cHalf * 0.18; }
      if (o.armR) { o.armR.rotation.x = -0.75 + cs * 0.22; o.armR.rotation.z = -cHalf * 0.18; }
      // Head counters hip sway — stays more level than body
      const _cHead = o.hitFlashMeshes?.[1];
      if (_cHead) _cHead.rotation.z = -cHalf * 0.07;
    } else if (o.type === 'orcMage') {
      // Fat slow waddle with staff held up
      o.animTime += dt * 3.0;
      const ms = Math.sin(o.animTime);
      o.group.position.y = ms * ms * 0.06;
      o.group.rotation.x = 0.05;
      o.group.rotation.z = Math.cos(o.animTime * 0.5) * 0.04;
      o.legL.position.y = 0.22 + ms * 0.09;
      o.legR.position.y = 0.22 - ms * 0.09;
      o.legL.rotation.x =  ms * 0.24;
      o.legR.rotation.x = -ms * 0.24;
      o.legL.rotation.z =  ms * 0.05;
      o.legR.rotation.z = -ms * 0.05;
      // Staff arm raised, cast blend when charging a shot
      const mCd = o.shootCooldown || 0;
      o.castBlend = (o.castBlend ?? 0) + ((mCd > 0 ? 1 : 0) - (o.castBlend ?? 0)) * Math.min(1, dt * 3);
      if (o.armR) { o.armR.rotation.x = -0.65 - o.castBlend * 0.55; o.armR.rotation.z = -0.16; }
      if (o.armL) { o.armL.rotation.x = 0.28 + ms * 0.14; o.armL.rotation.z = 0.22; }
      // Orb pulses brighter when casting
      if (o.staffOrb) {
        o.staffOrb.material.emissiveIntensity = 2.0 + o.castBlend * 1.5 + Math.sin(o.animTime * 4) * 0.4;
      }
      // castPhase drives a recoil kick on the staff arm when firing
      if ((o.castPhase || 0) > 0) {
        o.castPhase = Math.max(0, o.castPhase - dt * 5);
        const cp = Math.sin(o.castPhase * Math.PI);
        if (o.armR) o.armR.rotation.x -= cp * 0.45;
      }
    } else if (o.type === 'enemyArcher') {
      o.animTime += dt * 5.5;
      const eas = Math.sin(o.animTime);
      o.group.position.y = eas * eas * 0.11;
      o.group.rotation.x = 0.06;
      o.group.rotation.z = Math.cos(o.animTime * 0.5) * 0.048;
      o.legL.position.y = 0.19 + eas * 0.13;
      o.legR.position.y = 0.19 - eas * 0.13;
      o.legL.rotation.x =  eas * 0.48;
      o.legR.rotation.x = -eas * 0.48;
      o.legL.rotation.z =  eas * 0.05;
      o.legR.rotation.z = -eas * 0.05;
      // Head bobs with stride — archer keeps eyes on target
      const _eaHead = o.hitFlashMeshes?.[1];
      if (_eaHead) { _eaHead.rotation.x = -Math.abs(eas) * 0.06; _eaHead.rotation.z = -Math.cos(o.animTime*0.5)*0.025; }
      // Low-ready ↔ aimed blend
      const eaCd = o.shootCooldown || 0;
      o.aimBlend = (o.aimBlend ?? 0) + ((eaCd > 0 ? 1 : 0) - (o.aimBlend ?? 0)) * Math.min(1, dt * 4);
      const eaDraw = eaCd > 0
        ? Math.max(0, 1 - eaCd * CFG.ORC_TYPES.enemyArcher.shootRate)
        : 1;
      const eaEff = eaDraw * o.aimBlend;
      // Bow arm: lerp from low-ready (0.65) to aimed (-0.82)
      if (o.armL) { o.armL.rotation.x = 0.65 - o.aimBlend * 1.47; o.armL.rotation.z = 0.05 * o.aimBlend; }
      // Draw arm: relaxed → extended → pulled back
      let eaDrawX = 0.3 + o.aimBlend * (-0.72) + eaEff * 0.72;
      if ((o.drawPhase || 0) > 0) {
        o.drawPhase = Math.max(0, o.drawPhase - dt * 6);
        eaDrawX -= Math.sin(o.drawPhase * Math.PI) * 0.52;
      }
      if (o.armR) { o.armR.rotation.x = eaDrawX; o.armR.rotation.z = -eaEff * 0.14; }
      // Bow string — midpoint pulls backward (away from enemy) when drawn
      if (o.weapon && o.weapon.userData.strUp) {
        let strMidX = 0.055 - eaEff * 0.15;
        if ((o.drawPhase || 0) > 0) strMidX += Math.sin(o.drawPhase * Math.PI) * 0.09;
        const tipX = 0.040;
        const strCtrX = (tipX + strMidX) * 0.5;
        const strAng = Math.atan2(tipX - strMidX, 0.42);
        o.weapon.userData.strUp.position.x = strCtrX;
        o.weapon.userData.strUp.rotation.z = strAng;
        o.weapon.userData.strDn.position.x = strCtrX;
        o.weapon.userData.strDn.rotation.z = -strAng;
      }
    } else {
      const gaitSpd = Math.min(1.4, 0.7 + o.speed * 0.4); // faster enemies stride faster
      o.animTime += dt * 6 * gaitSpd;
      const gs = Math.sin(o.animTime);
      const gc = Math.cos(o.animTime * 0.5);
      // Per-type gait character — each enemy class has distinct weight and rhythm
      let _legAmp = 0.16, _legRotAmp = 0.60, _armAmpL = 0.74, _bodyBob = 0.08, _hipRock = 0.068;
      if (o.type === 'troll' || o.type === 'rockTroll') {
        // Heavy lumbering stomp — big stride, arms barely swing
        _legAmp = 0.22; _legRotAmp = 0.65; _armAmpL = 0.55; _bodyBob = 0.13; _hipRock = 0.09;
      } else if (o.type === 'skeleton') {
        // Rigid undead shuffle — stiff knees, clipped arm swing
        _legAmp = 0.13; _legRotAmp = 0.42; _armAmpL = 0.50; _bodyBob = 0.06; _hipRock = 0.04;
      } else if (o.type === 'brute') {
        // Aggressive power walk — heavy arm swing, big stomp
        _legAmp = 0.20; _legRotAmp = 0.65; _armAmpL = 0.85; _bodyBob = 0.11; _hipRock = 0.055;
      } else if (o.type === 'boss') {
        // Dominant measured stride — weight behind every step
        _legAmp = 0.19; _legRotAmp = 0.62; _armAmpL = 0.80; _bodyBob = 0.12; _hipRock = 0.065;
      } else if (o.type === 'healerOrc') {
        // Fat waddle — small steps, barely lifts feet
        _legAmp = 0.10; _legRotAmp = 0.30; _armAmpL = 0.45; _bodyBob = 0.05; _hipRock = 0.05;
      } else if (o.type === 'exploder') {
        // Unstable bloated jog — quick short steps, bounce high, arms flail
        _legAmp = 0.13; _legRotAmp = 0.55; _armAmpL = 0.95; _bodyBob = 0.14; _hipRock = 0.085;
      }
      // Heavy enemies thud the ground each step. animTime advances ~π per stride half-cycle,
      // so one footstep fires per π crossing (i.e. each foot plant) — but only while actually
      // moving (speedFactor>0.05), so it stays silent when slowed/blocked/stationary.
      if (speedFactor > 0.05 &&
          (o.type === 'cyclops' || o.type === 'rockTroll' || o.type === 'troll' || o.type === 'boss' || o.type === 'brute')) {
        const _gaitPhase = Math.floor(o.animTime / Math.PI);
        if (o._gaitPhase === undefined) o._gaitPhase = _gaitPhase;
        else if (_gaitPhase > o._gaitPhase) { o._gaitPhase = _gaitPhase; SND.footstep?.(o.type); }
      }
      o.group.position.y = gs * gs * _bodyBob;
      // Velocity-proportional forward lean + hit-backward lean
      const _velLean = Math.min(0.14, speedFactor * o.speed * 0.035);
      const _leanTgt = 0.07 + Math.abs(gs) * 0.04 + _velLean;
      o.leanX = (o.leanX || 0.09) + (_leanTgt - (o.leanX || 0.09)) * Math.min(1, dt * 8);
      o.group.rotation.x = o.leanX + (o.hitLeanX || 0);
      o.group.rotation.z = gc * _hipRock;
      o.legL.position.y = 0.19 + gs * _legAmp;
      o.legR.position.y = 0.19 - gs * _legAmp;
      o.legL.rotation.x =  gs * _legRotAmp;
      o.legR.rotation.x = -gs * _legRotAmp;
      o.legL.rotation.z =  gs * 0.06;
      o.legR.rotation.z = -gs * 0.06;
      if (o.armL) { o.armL.rotation.x = -gs * _armAmpL; o.armL.rotation.z =  gc * 0.10; }
      if (o.armR) {
        if (o.type === 'grunt') {
          // Club drops from sky-raised carry (-1.3) to shoulder-ready (-0.65) when engaging a target
          const engaged = (o.chasingDefender || o.fightingDefender) ? 1 : 0;
          o._clubReady = (o._clubReady ?? 0) + (engaged - (o._clubReady ?? 0)) * Math.min(1, dt * 4);
          o.armR.rotation.x = -1.3 + o._clubReady * 0.65 + gs * (0.10 + o._clubReady * 0.22);
          o.armR.rotation.z = -0.20 + o._clubReady * 0.12;
        } else if (o.type === 'brute') {
          o.armR.rotation.x = -0.45 + gs * 0.55; o.armR.rotation.z = -0.18 - gc * 0.08; // heavy opposing swing
        } else {
          o.armR.rotation.x = 0.40 + gs * 0.25; o.armR.rotation.z = -0.15 - gc * 0.08; // natural carry
        }
      }
      // Subtle head bob: chin dips each footfall, slightly counters hip rock
      const _defHead = o.hitFlashMeshes?.[1];
      if (_defHead) {
        if (o.type === 'skeleton') {
          // Loose-neck wobble — undead skull rolls opposite to hips and tilts on each footfall
          _defHead.rotation.z = -gc * 0.15;
          _defHead.rotation.x = Math.abs(gs) * 0.13 - 0.03;
        } else {
          _defHead.rotation.x = -Math.abs(gs) * 0.07;     // chin tuck at each step
          _defHead.rotation.z = -gc * (_hipRock * 0.45);  // counters hip rock
        }
      }
      // Exploder-specific: belly and eyes pulse faster as it nears the gate — danger tell
      if (o.type === 'exploder') {
        // Panic factor increases along path: 0 at spawn, 1.5 near castle
        const panicProg = o.path ? (o.pathIndex + o.progress) / Math.max(1, o.path.length - 1) : 0;
        const pulseSpd = 5 + panicProg * 9; // 5 → 14 rad/s
        const pulse = Math.sin(o.animTime * pulseSpd);
        const amp = 0.10 + panicProg * 0.14; // 10 → 24% scale amplitude
        if (o.belly) o.belly.scale.setScalar(1 + pulse * amp);
        if (o.bellyEyeL) o.bellyEyeL.scale.setScalar(1 + pulse * (amp * 0.6));
        if (o.bellyEyeR) o.bellyEyeR.scale.setScalar(1 + pulse * (amp * 0.6));
        // Fuse ember flickers faster + brighter as it nears detonation
        if (o.fuseEmber) o.fuseEmber.scale.setScalar(1 + Math.abs(pulse) * (0.5 + panicProg * 0.6));
        // Twitchy body jitter near the end
        o.group.position.x += (Math.random() - 0.5) * 0.006 * panicProg;
      }
    }

    // ── Grunt berserk: triggers once at ≤50% HP ──
    if (o.type === 'grunt' && !o.berserk && o.hp <= o.maxHp * 0.5) {
      o.berserk = true;
      o.speed *= 1.5;
      // Clone body/head materials so only THIS grunt glows red (shared mats would affect all grunts)
      o._berserkMats = [];
      o.hitFlashMeshes.forEach(m => {
        _forMats(m, mat => {
          const c = mat.clone();
          c.emissive.setHex(0xff2200); c.emissiveIntensity = 0.35;
          m.material = c;
          o._berserkMats.push(c);
        });
      });
      spawnHitParticles(posAbove(o.group.position, 0.8), 0xff4400);
      spawnImpactRing(o.group.position.clone(), 0xff4400);
      SND.berserkRoar(); // dedicated full-throated roar on berserk activation
    }
    // Pulse the berserk glow
    if (o._berserkMats && o.hitFlashTimer <= 0) {
      const pulse = 0.28 + Math.sin(gameTime * 8) * 0.18;
      o._berserkMats.forEach(m => { m.emissiveIntensity = pulse; });
    }

    updateOrcHPBar(o);
    updateOrcFlash(o, dt);

    // ── Troll / RockTroll regeneration ──
    if (CFG.ORC_TYPES[o.type].regens && o.alive && o.hp < o.maxHp) {
      o.regenTimer = (o.regenTimer || 0) + dt;
      if (o.regenTimer >= 2.5) {
        o.hp = Math.min(o.maxHp, o.hp + 3);
        o.regenTimer = 0;
        spawnHitParticles(posAbove(o.group.position, 1.2), 0x44ff44);
      }
    }

    // ── HealerOrc: heals nearby allies on interval ──
    if (o.type === 'healerOrc' && o.alive) {
      const hcfg = CFG.ORC_TYPES.healerOrc;
      o.healTimer = (o.healTimer || 0) + dt;
      if (o.healTimer >= hcfg.healInterval) {
        o.healTimer = 0;
        let healed = false;
        const healR2 = hcfg.healRadius * hcfg.healRadius;
        for (const other of orcs) {
          if (other !== o && other.alive && other.hp < other.maxHp &&
              other.group.position.distanceToSquared(o.group.position) < healR2) {
            other.hp = Math.min(other.maxHp, other.hp + hcfg.healAmount);
            spawnHitParticles(posAbove(other.group.position, 1.2), 0x44ff44);
            healed = true;
          }
        }
        if (healed) { spawnImpactRing(o.group.position.clone(), 0x44ff44); SND.heal(); }
      }
    }

    // ── Ranged / melee-aura abilities (enemyArcher, orcMage, cyclops) ──
    tickRangedEnemy(o, dt);
  }

  // Castle glow tint based on HP
  const hpPct = castleHp / CFG.CASTLE_MAX_HP;
  if (hpPct > 0.5)       { castleGlow.color.set(0x00d4ff); castleGlow.intensity = 2.5; }
  else if (hpPct > 0.25) { castleGlow.color.set(0xff8800); castleGlow.intensity = 2.8; }
  else                   { castleGlow.color.set(0xff2200); castleGlow.intensity = 3.5; }
}

function updateOrcHPBar(o) {
  const hpRatio = Math.max(0, o.hp / o.maxHp);
  // Dirty-flag: skip THREE writes when HP hasn't changed (most frames for most enemies).
  // Use a small epsilon so floating-point regen doesn't churn the bar each frame.
  if (o._lastHpRatio !== undefined && Math.abs(hpRatio - o._lastHpRatio) < 0.001) return;
  o._lastHpRatio = hpRatio;
  o.hpBar.fg.scale.x = hpRatio;
  o.hpBar.fg.position.x = (hpRatio - 1) * 0.325;
  o.hpBar.fg.material.color.setHSL(hpRatio * 0.33, 1.0, 0.5);
}

function updateOrcFlash(o, dt) {
  if (o.hitFlashTimer > 0) {
    o.hitFlashTimer -= dt;
    const fi = Math.max(0, o.hitFlashTimer * 8);
    o.hitFlashMeshes.forEach(m => {
      _forMats(m, mat => {
        mat.emissiveIntensity = fi;
        if (o.hitFlashTimer <= 0) {
          if (mat.emissive) mat.emissive.set(m.userData.origEmissive || _COLOR_BLACK);
          mat.emissiveIntensity = 0;
        }
      });
    });
    if (o.hitFlashTimer < 0) o.hitFlashTimer = 0;
    // Full-body flash: sync extra meshes with the same timer
    if (o._extraFlashMeshes) {
      const efi = Math.max(0, o.hitFlashTimer * 6);
      o._extraFlashMeshes.forEach(m => {
        _forMats(m, mat => {
          mat.emissiveIntensity = efi;
          if (o.hitFlashTimer <= 0) {
            if (mat.emissive) mat.emissive.set(m.userData.origEmissive || _COLOR_BLACK);
            mat.emissiveIntensity = 0;
          }
        });
      });
    }
  }
  // Skeleton phase-through: ghostly blue glow while phasing through a wall
  if (o.type === 'skeleton' && o.hitFlashTimer <= 0) {
    const phasing = (o._phaseTimer || 0) > 0;
    const pulse = phasing ? 0.4 + Math.sin(gameTime * 12) * 0.2 : 0;
    o.hitFlashMeshes.forEach(m => {
      _forMats(m, mat => {
        if (phasing) { mat.emissive.setRGB(0.2, 0.5, 1.0); mat.emissiveIntensity = pulse; }
        else         { mat.emissive.set(m.userData.origEmissive || _COLOR_BLACK); mat.emissiveIntensity = 0; }
      });
    });
  }
  // Hit stagger: brief Z-tilt knockback that decays quickly — gives enemies a "flinch" reaction
  if ((o.hitRecoilT || 0) > 0) {
    o.hitRecoilT = Math.max(0, o.hitRecoilT - dt * 14);
    const rt = Math.sin(o.hitRecoilT * Math.PI);                // 0→peak→0 arc
    o.group.rotation.z = o.hitRecoilDir * rt * 0.13;            // subtle side tilt
    if (o.hitRecoilT <= 0) o.group.rotation.z = 0;              // clean reset
  }
  // Hit lean-away: brief backward tilt from the impact direction
  if ((o.hitLeanX || 0) !== 0) {
    o.hitLeanX += (0 - o.hitLeanX) * Math.min(1, dt * 10);
    if (Math.abs(o.hitLeanX) < 0.002) o.hitLeanX = 0;
  }
  // Squash & Stretch: detect footfall via animTime zero-crossing, then squash Y / expand XZ
  const _gs = Math.sin(o.animTime);
  if (o.prevGs !== undefined) {
    if ((o.prevGs > 0.12 && _gs < -0.05) || (o.prevGs < -0.12 && _gs > 0.05)) {
      o.squashT = 1.0;
    }
  }
  o.prevGs = _gs;
  if ((o.squashT || 0) > 0) {
    o.squashT = Math.max(0, o.squashT - dt * 9);
    const sq = o.squashT;
    o.group.scale.set(o.scale * (1 + sq * 0.13), o.scale * (1 - sq * 0.20), o.scale * (1 + sq * 0.13));
  } else if (Math.abs(o.group.scale.y - o.scale) > 0.002) {
    o.group.scale.setScalar(o.scale);
  }
}

function updateDefHit(d, dt) {
  if ((d.hitFlashTimer || 0) > 0) {
    d.hitFlashTimer -= dt;
    const fi = Math.max(0, d.hitFlashTimer * 8);
    if (d.hitFlashMeshes) {
      d.hitFlashMeshes.forEach(m => {
        _forMats(m, mat => {
          mat.emissiveIntensity = fi;
          if (d.hitFlashTimer <= 0) {
            if (mat.emissive) mat.emissive.set(m.userData.origEmissive || _COLOR_BLACK);
            mat.emissiveIntensity = 0;
          }
        });
      });
    }
    if (d.hitFlashTimer < 0) d.hitFlashTimer = 0;
  }
  // Stagger tilt for melee defenders — same Z-tilt style as enemy flinch.
  // Buildings (wall/tower/catapult) stay anchored; hitRecoilT still ticks
  // down so other code paths that check it continue to work.
  if ((d.hitRecoilT || 0) > 0) {
    d.hitRecoilT = Math.max(0, d.hitRecoilT - dt * 14);
    const isBuilding = d.type === 'wall' || d.type === 'tower' || d.type === 'catapult';
    if (!isBuilding) {
      const rt = Math.sin(d.hitRecoilT * Math.PI);
      d.group.rotation.z = (d.hitRecoilDir || 1) * rt * 0.11;
      if (d.hitRecoilT <= 0) d.group.rotation.z = 0;
    }
  }
  // Skeleton poison: tick down, deal damage without flash effect
  if ((d.poisonTimer || 0) > 0) {
    d.poisonTimer -= dt;
    d.hp -= (d.poisonDps || 0) * dt;
    if (d.hpBar) {
      const pp = Math.max(0, d.hp / d.maxHp);
      d.hpBar.fg.scale.x = pp; d.hpBar.fg.position.x = (pp - 1) * 0.325;
      d.hpBar.fg.material.color.setHSL(pp * 0.33, 1.0, 0.5);
    }
    if (d.hp <= 0 && d.alive) dealDefenderDamage(d, 0); // trigger death
    if (vfx.length < 120 && Math.random() < dt * 3) spawnHitParticles(posAbove(d.group.position, 0.8), 0x44ff44, 2);
    if (d.poisonTimer <= 0) { d.poisonTimer = 0; }
  }
  // OrcMage curse: tick down and manage purple orb visual
  if ((d.cursedTimer || 0) > 0) {
    d.cursedTimer -= dt;
    if (d.cursedTimer <= 0) { d.cursedTimer = 0; d.cursed = false; }
  }
  if (d.cursed && !d._curseOrb) {
    const curseMat = new THREE.MeshStandardMaterial({ color: 0xaa00ff, emissive: 0xaa00ff, emissiveIntensity: 2.5, transparent: true, opacity: 0.8 });
    d._curseOrb = new THREE.Mesh(box(0.20, 0.20, 0.20), curseMat);
    const yTop = d.type === 'tower' ? 4.6 : d.type === 'catapult' ? 3.0 : d.type === 'wall' ? 3.4 : 2.3;
    d._curseOrb.position.set(0, yTop, 0);
    d.group.add(d._curseOrb);
  }
  if (!d.cursed && d._curseOrb) {
    d.group.remove(d._curseOrb);
    d._curseOrb.geometry.dispose(); d._curseOrb.material.dispose();
    d._curseOrb = null;
  }
  if (d._curseOrb) {
    d._curseOrb.material.emissiveIntensity = 1.8 + Math.sin(gameTime * 9) * 0.9;
    d._curseOrb.rotation.y += dt * 2.5;
  }
}

// ─────────────────────────────────────────────
//  BUILD WALL (can go on path or grass)
// ─────────────────────────────────────────────
function buildWall(col, row) {
  const g = new THREE.Group();
  // Foundation slab
  const found = mesh(box(0.96, 0.14, 0.96), M.castleStone); found.position.y = 0.07; g.add(found);
  // Main stone body
  const body = mesh(box(0.88, 1.92, 0.88), M.wallStone); body.position.y = 0.96; g.add(body);
  // Corner pillar columns (extend above main body)
  [[0.37,0.37],[0.37,-0.37],[-0.37,0.37],[-0.37,-0.37]].forEach(([px,pz]) => {
    const col2 = mesh(box(0.2, 2.36, 0.2), M.castleStone); col2.position.set(px, 1.18, pz); g.add(col2);
  });
  // Horizontal stone banding (more bands, slightly protruding)
  [0.28, 0.72, 1.18, 1.64].forEach(y => {
    const band = mesh(box(0.97, 0.07, 0.97), M.castleStone); band.position.y = y; g.add(band);
  });
  // Front arrow slit (cross shape: vertical + horizontal slot)
  const slitV = mesh(box(0.10, 0.52, 0.07), M.castleDark); slitV.position.set(0, 1.12, 0.455); g.add(slitV);
  const slitH = mesh(box(0.30, 0.10, 0.07), M.castleDark); slitH.position.set(0, 1.18, 0.455); g.add(slitH);
  const slitLin = mesh(box(0.18, 0.07, 0.07), M.castleStone); slitLin.position.set(0, 1.42, 0.455); g.add(slitLin);
  // Back arrow slit
  const slitB = mesh(box(0.10, 0.52, 0.07), M.castleDark); slitB.position.set(0, 1.12, -0.455); g.add(slitB);
  const slitBH = mesh(box(0.30, 0.10, 0.07), M.castleDark); slitBH.position.set(0, 1.18, -0.455); g.add(slitBH);
  // Recessed door arch on front (decorative)
  const archBase = mesh(box(0.28, 0.44, 0.06), M.castleDark); archBase.position.set(0, 0.3, 0.455); g.add(archBase);
  const archTop  = mesh(box(0.28, 0.07, 0.06), M.castleDark); archTop.position.set(0, 0.54, 0.455); g.add(archTop);
  // Top cap slab
  const cap = mesh(box(0.97, 0.12, 0.97), M.castleStone); cap.position.y = 2.08; g.add(cap);
  // 6 merlons — varied heights per side (front 3, back 3)
  [[-0.3,0.3],[0,0.3],[0.3,0.3],[-0.3,-0.3],[0,-0.3],[0.3,-0.3]].forEach(([px,pz], i) => {
    const mh = i % 2 === 0 ? 0.44 : 0.36;
    const m2 = mesh(box(0.22, mh, 0.22), M.castleStone); m2.position.set(px, 2.08 + mh*0.5, pz); g.add(m2);
  });
  // Wall torch bracket + flame on right side
  const bracket = mesh(box(0.06, 0.06, 0.16), M.catMetal); bracket.position.set(0.46, 1.55, 0); g.add(bracket);
  const torchBody = mesh(box(0.06, 0.22, 0.06), M.catWood); torchBody.position.set(0.50, 1.7, 0); g.add(torchBody);
  const flameMat = new THREE.MeshStandardMaterial({ color: 0xff8800, emissive: 0xff6600, emissiveIntensity: 2.2 });
  const flame = new THREE.Mesh(box(0.07, 0.1, 0.07), flameMat); flame.position.set(0.50, 1.84, 0); g.add(flame);
  // Iron ring decoration on front face
  const ring = mesh(box(0.14, 0.14, 0.06), M.catMetal); ring.position.set(0, 0.62, 0.47); g.add(ring);
  const crossH = mesh(box(0.14, 0.03, 0.06), M.catMetal); crossH.position.set(0, 0.62, 0.47); g.add(crossH);
  // Hanging heraldic banner on the front face — flies the Azure & Gold Order colours (additive)
  const bnRod   = mesh(box(0.44, 0.05, 0.05), M.castleFlagPole); bnRod.position.set(0, 1.66, 0.50); g.add(bnRod);
  const bnCloth = mesh(box(0.34, 0.70, 0.04), M.castleFlag);     bnCloth.position.set(0, 1.28, 0.50); g.add(bnCloth);
  const bnTrim  = mesh(box(0.36, 0.05, 0.05), M.swGold);         bnTrim.position.set(0, 0.94, 0.505); g.add(bnTrim);
  const bnEmblem= mesh(box(0.14, 0.16, 0.05), M.swGold);         bnEmblem.position.set(0, 1.30, 0.515); g.add(bnEmblem);
  const bnPointL= mesh(box(0.17, 0.12, 0.04), M.castleFlag);     bnPointL.position.set(-0.085, 0.86, 0.50); g.add(bnPointL); // swallow-tail
  const bnPointR= mesh(box(0.17, 0.12, 0.04), M.castleFlag);     bnPointR.position.set( 0.085, 0.86, 0.50); g.add(bnPointR);
  const hpBar = makeHPBar(g, 2.88);
  g.position.set(col, 0, row); g.scale.set(0.01, 0.01, 0.01);
  scene.add(g);
  defenders.push({ type: 'wall', group: g, col, row, hpBar,
    hp: CFG.STATS.wall.hp, maxHp: CFG.STATS.wall.hp, animScale: 0, spawnTime: performance.now(), alive: true });
  _rebuildWallCache();
  _bumpStat('wallsBuilt', 1);
}

// ─────────────────────────────────────────────
//  BUILD TOWER
// ─────────────────────────────────────────────
function buildTower(col, row) {
  const g = new THREE.Group();
  // Foundation step — wide base slab
  const found = mesh(box(0.96, 0.18, 0.96), M.wallStone); found.position.y = 0.09; g.add(found);
  // Three tapered stone tiers with banding
  const tierW = [0.82, 0.68, 0.54];
  tierW.forEach((w, i) => {
    const t = mesh(box(w, 0.58, w), M.towerBase); t.position.y = 0.18 + i * 0.58 + 0.29; g.add(t);
    // Band ring between tiers
    if (i < 2) {
      const bnd = mesh(box(w + 0.06, 0.06, w + 0.06), M.castleStone); bnd.position.y = 0.18 + i * 0.58 + 0.58; g.add(bnd);
    }
  });
  // Corner buttresses on base tier (with cap)
  [[0.36,0.36],[0.36,-0.36],[-0.36,0.36],[-0.36,-0.36]].forEach(([px,pz]) => {
    const butt = mesh(box(0.16, 0.86, 0.16), M.castleStone); butt.position.set(px, 0.63, pz); g.add(butt);
    const bCap = mesh(box(0.2, 0.06, 0.2), M.wallStone); bCap.position.set(px, 1.09, pz); g.add(bCap);
  });
  // Arrow slit windows on all 3 tiers × 4 sides — cross-shaped
  [[0,0.35,0],[0,-0.35,0],[0.35,0,Math.PI/2],[-0.35,0,Math.PI/2]].forEach(([px,pz,ry]) => {
    // First tier slit
    const slit1 = mesh(box(0.10, 0.30, 0.06), M.castleDark); slit1.position.set(px, 0.7, pz); slit1.rotation.y = ry; g.add(slit1);
    const slit1H = mesh(box(0.22, 0.09, 0.06), M.castleDark); slit1H.position.set(px, 0.77, pz); slit1H.rotation.y = ry; g.add(slit1H);
    // Second tier slit
    const slit2 = mesh(box(0.10, 0.26, 0.06), M.castleDark); slit2.position.set(px, 1.22, pz); slit2.rotation.y = ry; g.add(slit2);
    // Glowing window — warm light visible through slit
    const win = mesh(box(0.07, 0.18, 0.03), M.townWin); win.position.set(px * 0.92, 1.22, pz * 0.92); win.rotation.y = ry; g.add(win);
  });
  // Top parapet ring
  const ring = mesh(box(0.76, 0.14, 0.76), M.castleStone); ring.position.y = 1.98; g.add(ring);
  // 8 mini merlons — alternating heights for crenellation
  [[0.27,0.27],[0,0.27],[-0.27,0.27],[0.27,0],[0.27,-0.27],[0,-0.27],[-0.27,-0.27],[-0.27,0]].forEach(([px,pz], i) => {
    const mh = i % 2 === 0 ? 0.26 : 0.18;
    const m2 = mesh(box(0.12, mh, 0.12), M.castleStone); m2.position.set(px, 1.98 + mh*0.5 + 0.07, pz); g.add(m2);
  });
  // Conical roof — 4 stacked boxes (darker, more pointed)
  [[0.62,0.20,0.62],[0.44,0.22,0.44],[0.26,0.20,0.26],[0.12,0.16,0.12]].forEach(([w,h,d],i) => {
    const r = mesh(box(w,h,d), M.towerRoof); r.position.y = 2.12 + i * 0.2 + h*0.5; g.add(r);
  });
  // Crystal mount — stone pedestal with 4 arching arms
  const mount = mesh(box(0.26, 0.22, 0.26), M.castleStone); mount.position.y = 2.78; g.add(mount);
  [[0.28,0.06,0],[0,0.06,0.28],[-0.28,0.06,0],[0,0.06,-0.28]].forEach(([ax,ah,az]) => {
    const arm2 = mesh(box(Math.abs(ax)||0.06, ah, Math.abs(az)||0.06), M.castleStone); arm2.position.set(ax*0.5, 2.9, az*0.5); g.add(arm2);
  });
  // Arcane rune studs ringing the crystal mount — glowing sigils that tie the
  // stone tower to its crystal focus (additive; reuse the crystal glow material)
  [[0.24,0],[0,0.24],[-0.24,0],[0,-0.24]].forEach(([rx,rz]) => {
    const rune = mesh(box(0.06, 0.06, 0.06), M.crystal); rune.position.set(rx, 2.80, rz); g.add(rune);
  });
  // Crystal — 3-part stack (base, body, tip) with glow ring at base
  const xtalBase = mesh(box(0.26, 0.18, 0.26), M.crystal); xtalBase.position.y = 3.0; g.add(xtalBase);
  const xtal = mesh(box(0.22, 0.52, 0.22), M.crystal);
  xtal.position.y = 3.27; xtal.userData.floatBase = 3.27; g.add(xtal);
  const xtalTip = mesh(box(0.10, 0.20, 0.10), M.crystal); xtalTip.position.y = 3.58; g.add(xtalTip);
  // Orbiting crystal shard — small accent piece
  const xShard = mesh(box(0.10, 0.10, 0.10), M.crystal); xShard.position.set(0.26, 3.27, 0); xShard.userData.orbitBase = true; g.add(xShard);
  // Pennant banner — heraldic flag on a side mast for personality (matches castle banner style)
  const flagPole = mesh(box(0.05, 0.74, 0.05), M.castleFlagPole); flagPole.position.set(0.32, 2.42, 0.32); g.add(flagPole);
  const flagFinial = mesh(box(0.07, 0.07, 0.07), M.swGold); flagFinial.position.set(0.32, 2.83, 0.32); g.add(flagFinial);
  const flagMain = mesh(box(0.04, 0.30, 0.32), M.castleFlag); flagMain.position.set(0.34, 2.62, 0.50); g.add(flagMain);
  const flagTrim = mesh(box(0.045, 0.05, 0.34), M.swGold);    flagTrim.position.set(0.34, 2.78, 0.50); g.add(flagTrim);
  const flagTail = mesh(box(0.04, 0.10, 0.10), M.castleFlag); flagTail.position.set(0.34, 2.42, 0.62); g.add(flagTail);
  const towerHpBar = makeHPBar(g, 3.85);
  g.position.set(col, 0, row); g.scale.set(0.01, 0.01, 0.01);
  scene.add(g);
  const stat = CFG.STATS.tower;
  defenders.push({
    type: 'tower', group: g, col, row, crystal: xtal,
    crystalParts: [xtalBase, xtal, xtalTip, xShard], firePhase: 0,
    cooldown: 0, range: stat.range, dmg: stat.dmg, rate: stat.rate, pSpeed: stat.pSpeed,
    hp: stat.hp, maxHp: stat.hp, hpBar: towerHpBar, animScale: 0, spawnTime: performance.now(), alive: true,
  });
}

// ─────────────────────────────────────────────
//  BUILD CATAPULT
// ─────────────────────────────────────────────
function buildCatapult(col, row) {
  const g = new THREE.Group();
  // Chassis platform with planks
  const base = mesh(box(0.84, 0.2, 0.74), M.catWood); base.position.y = 0.1; g.add(base);
  [-0.22, 0, 0.22].forEach(z => {
    const plank = mesh(box(0.88, 0.05, 0.12), M.catWood); plank.position.set(0, 0.21, z); g.add(plank);
  });
  // Corner feet
  [[-0.36,-0.3],[0.36,-0.3],[-0.36,0.3],[0.36,0.3]].forEach(([x,z]) => {
    const foot = mesh(box(0.09, 0.12, 0.09), M.catWood); foot.position.set(x, -0.06, z); g.add(foot);
  });
  // Two A-frame struts with diagonal braces
  [-0.3, 0.3].forEach(xOff => {
    const strut = mesh(box(0.1, 0.6, 0.1), M.catWood); strut.position.set(xOff, 0.42, 0.08); g.add(strut);
    const brace = mesh(box(0.08, 0.28, 0.08), M.catWood);
    brace.position.set(xOff, 0.28, 0.3); brace.rotation.x = -0.55; g.add(brace);
  });
  // Cross-brace between struts
  const xbrace = mesh(box(0.64, 0.08, 0.08), M.catWood); xbrace.position.set(0, 0.55, 0.08); g.add(xbrace);
  // Pivot axle
  const pivot = mesh(box(0.74, 0.09, 0.09), M.catMetal); pivot.position.set(0, 0.68, 0.08); g.add(pivot);
  // Arm group (pivots around axle)
  const armGroup = new THREE.Group(); armGroup.position.set(0, 0.68, 0.08); g.add(armGroup);
  const arm = mesh(box(0.1, 0.82, 0.1), M.catWood); arm.position.y = 0.41; armGroup.add(arm);
  const armBand = mesh(box(0.16, 0.06, 0.16), M.catMetal); armBand.position.y = 0.56; armGroup.add(armBand);
  // Counterweight with chain
  const cwChain = mesh(box(0.04, 0.18, 0.04), M.catMetal); cwChain.position.y = -0.18; armGroup.add(cwChain);
  const cw = mesh(box(0.3, 0.3, 0.3), M.catMetal); cw.position.y = -0.33; armGroup.add(cw);
  // Sling cup
  const slingRope = mesh(box(0.03, 0.14, 0.03), M.catWood); slingRope.position.y = 0.89; armGroup.add(slingRope);
  const sling = mesh(box(0.22, 0.06, 0.22), M.catWood); sling.position.y = 0.97; armGroup.add(sling);
  // Wheels (with hub + spokes look)
  [-0.4, 0.4].forEach(xOff => {
    const rim  = mesh(box(0.07, 0.28, 0.28), M.catMetal); rim.position.set(xOff, 0.14, 0); g.add(rim);
    const hub  = mesh(box(0.09, 0.1, 0.1), M.catWood); hub.position.set(xOff, 0.14, 0); g.add(hub);
    const spV  = mesh(box(0.05, 0.26, 0.05), M.catWood); spV.position.set(xOff, 0.14, 0); g.add(spV);
    const spH  = mesh(box(0.05, 0.05, 0.26), M.catWood); spH.position.set(xOff, 0.14, 0); g.add(spH);
  });
  // ── Engineer operator — armored crew member braced beside the catapult ──
  // Boots & legs in plated greaves
  const opBootL = mesh(box(0.10, 0.07, 0.14), M.arcBelt);  opBootL.position.set(0.58, 0.035, 0.16); g.add(opBootL);
  const opBootR = mesh(box(0.10, 0.07, 0.14), M.arcBelt);  opBootR.position.set(0.50, 0.035, 0.04); g.add(opBootR);
  const opLegL = mesh(box(0.10, 0.20, 0.10), M.swArmor);   opLegL.position.set(0.58, 0.17, 0.16); g.add(opLegL);
  const opLegR = mesh(box(0.10, 0.20, 0.10), M.swArmor);   opLegR.position.set(0.50, 0.17, 0.04); g.add(opLegR);
  // Belt
  const opBelt = mesh(box(0.26, 0.05, 0.22), M.arcBelt);   opBelt.position.set(0.54, 0.30, 0.10); g.add(opBelt);
  const opBuckle = mesh(box(0.06, 0.05, 0.05), M.swGold);  opBuckle.position.set(0.54, 0.30, 0.22); g.add(opBuckle);
  // Tunic body — same blue as defender faction so operator reads as "ours"
  const opBody = mesh(box(0.24, 0.28, 0.20), M.swTunic);   opBody.position.set(0.54, 0.46, 0.10); g.add(opBody);
  // Diagonal leather strap across chest (bandolier with tools)
  const opStrap = mesh(box(0.05, 0.30, 0.05), M.arcBelt);  opStrap.position.set(0.62, 0.46, 0.18); opStrap.rotation.z = 0.20; g.add(opStrap);
  // Shoulder pads
  const opPadL = mesh(box(0.12, 0.07, 0.22), M.arcBelt);   opPadL.position.set(0.54, 0.62, 0.10); g.add(opPadL);
  // Head & hood
  const opNeck = mesh(box(0.10, 0.06, 0.10), M.skin);      opNeck.position.set(0.54, 0.63, 0.10); g.add(opNeck);
  const opHead = mesh(box(0.18, 0.18, 0.18), M.skin);      opHead.position.set(0.54, 0.74, 0.10); g.add(opHead);
  const opHood = mesh(box(0.22, 0.10, 0.22), M.spLeather); opHood.position.set(0.54, 0.86, 0.10); g.add(opHood);
  const opBrim = mesh(box(0.26, 0.025, 0.26), M.spLeather); opBrim.position.set(0.54, 0.81, 0.10); g.add(opBrim);
  // Arms — both braced toward the winch, leather sleeves
  const opArmL = mesh(box(0.10, 0.22, 0.10), M.swTunic);   opArmL.position.set(0.42, 0.50, 0.10); opArmL.rotation.z = 0.55; g.add(opArmL);
  const opArmR = mesh(box(0.10, 0.22, 0.10), M.swTunic);   opArmR.position.set(0.42, 0.36, 0.10); opArmR.rotation.z = 0.30; g.add(opArmR);
  // Gloved hands gripping a winch-handle implied to be inside the chassis
  const opHandL = mesh(box(0.08, 0.07, 0.08), M.arcBelt);  opHandL.position.set(0.30, 0.40, 0.10); g.add(opHandL);
  const opHandR = mesh(box(0.08, 0.07, 0.08), M.arcBelt);  opHandR.position.set(0.30, 0.28, 0.10); g.add(opHandR);
  // Rope/sling detail — side rope attached to sling arm
  const rope1 = mesh(box(0.03, 0.36, 0.03), M.arcBelt); rope1.position.set(0.14, 0.70, 0.08); rope1.rotation.z = 0.2; g.add(rope1);
  // Ammo pile — 5 stacked boulders beside catapult base
  [[-0.48,0.06,-0.32],[-0.38,0.06,-0.46],[-0.52,0.06,-0.46],[-0.44,0.17,-0.38],[-0.44,0.06,-0.20]].forEach(([bx,by,bz]) => {
    const boulderSz = 0.12 + Math.abs(bx+bz) * 0.05;
    const boulder = mesh(box(boulderSz, boulderSz*0.85, boulderSz*0.9), M.rockMat); boulder.position.set(bx, by, bz); g.add(boulder);
  });
  // Faction colours — a corner pennant mast + a gold-bossed shield hung on the
  // chassis flank, matching the Azure & Gold treatment of the other defenders (additive)
  const cpMast   = mesh(box(0.05, 0.80, 0.05), M.castleFlagPole); cpMast.position.set(-0.36, 0.62, 0.30); g.add(cpMast);
  const cpFinial = mesh(box(0.07, 0.07, 0.07), M.swGold);         cpFinial.position.set(-0.36, 1.05, 0.30); g.add(cpFinial);
  const cpFlag   = mesh(box(0.04, 0.22, 0.26), M.castleFlag);     cpFlag.position.set(-0.34, 0.90, 0.45); g.add(cpFlag);
  const cpTrim   = mesh(box(0.045, 0.04, 0.28), M.swGold);        cpTrim.position.set(-0.34, 1.02, 0.45); g.add(cpTrim);
  const cpShield = mesh(box(0.06, 0.30, 0.24), M.swShield);       cpShield.position.set(-0.46, 0.30, -0.10); g.add(cpShield);
  const cpBoss   = mesh(box(0.07, 0.10, 0.10), M.swGold);         cpBoss.position.set(-0.48, 0.30, -0.10); g.add(cpBoss);
  const catHpBar = makeHPBar(g, 2.1);
  g.position.set(col, 0, row); g.scale.set(0.01, 0.01, 0.01);
  scene.add(g);
  const stat = CFG.STATS.catapult;
  defenders.push({
    type: 'catapult', group: g, col, row, armGroup,
    cooldown: 0, range: stat.range, dmg: stat.dmg, rate: stat.rate, pSpeed: stat.pSpeed, aoe: stat.aoe,
    hp: stat.hp, maxHp: stat.hp, hpBar: catHpBar, animScale: 0, armAnim: 0, spawnTime: performance.now(), alive: true,
  });
}

// ─────────────────────────────────────────────
//  BUILD MAGE
// ─────────────────────────────────────────────
function buildMage(col, row) {
  const g = new THREE.Group();
  // Glowing arcane rune ring at the mage's feet — 4 emissive runes surrounding a flat ritual disc
  const runeDisc = mesh(box(0.62, 0.04, 0.62), M.mageRobe); runeDisc.position.y = 0.02; g.add(runeDisc);
  const runeRim  = mesh(box(0.66, 0.025, 0.66), M.mageOrb); runeRim.position.y = 0.038; g.add(runeRim);
  [[0.28, 0], [-0.28, 0], [0, 0.28], [0, -0.28]].forEach(([rx, rz]) => {
    const rune = mesh(box(0.07, 0.04, 0.07), M.mageOrb); rune.position.set(rx, 0.05, rz); g.add(rune);
  });
  // Legs under robe
  const legL = mesh(box(0.14, 0.30, 0.14), M.magePurple); legL.position.set( 0.11, 0.20, 0); g.add(legL);
  const legR = mesh(box(0.14, 0.30, 0.14), M.magePurple); legR.position.set(-0.11, 0.20, 0); g.add(legR);
  // Long robe covers legs (lifted slightly to clear rune disc)
  const robe = mesh(box(0.46, 0.52, 0.36), M.mageRobe); robe.position.set(0, 0.51, 0); g.add(robe);
  // Robe back panel — flowing cloth drape behind mage (cape-like, narrower at top widening at base)
  const robeBackTop = mesh(box(0.36, 0.24, 0.06), M.mageRobe); robeBackTop.position.set(0, 0.84, -0.20); g.add(robeBackTop);
  const robeBackMid = mesh(box(0.42, 0.30, 0.06), M.mageRobe); robeBackMid.position.set(0, 0.55, -0.21); g.add(robeBackMid);
  const robeBackBot = mesh(box(0.46, 0.24, 0.06), M.mageRobe); robeBackBot.position.set(0, 0.27, -0.22); g.add(robeBackBot);
  const body = mesh(box(0.40, 0.36, 0.30), M.magePurple); body.position.y = 0.83; g.add(body);
  // Belt rune (bumped to match new robe height)
  const belt = mesh(box(0.42, 0.08, 0.32), M.mageOrb); belt.position.set(0, 0.66, 0); g.add(belt);
  // Three glowing belt-rune accents (front)
  [[-0.13, 0.16], [0, 0.16], [0.13, 0.16]].forEach(([bx, bz]) => {
    const beltRune = mesh(box(0.05, 0.05, 0.04), M.mageEye); beltRune.position.set(bx, 0.66, bz); g.add(beltRune);
  });
  const armL = mesh(box(0.18, 0.40, 0.18), M.magePurple); armL.position.set( 0.32, 0.77, 0); g.add(armL);
  const armR = mesh(box(0.18, 0.40, 0.18), M.magePurple); armR.position.set(-0.32, 0.77, 0); g.add(armR);
  // Sleeve cuffs — flared cloth ends with mystical orb trim (parented to arms so they animate)
  const cuffL = mesh(box(0.22, 0.10, 0.22), M.mageRobe); cuffL.position.set(0, -0.18, 0); armL.add(cuffL);
  const cuffR = mesh(box(0.22, 0.10, 0.22), M.mageRobe); cuffR.position.set(0, -0.18, 0); armR.add(cuffR);
  const cuffTrimL = mesh(box(0.24, 0.025, 0.24), M.mageOrb); cuffTrimL.position.set(0, -0.14, 0); armL.add(cuffTrimL);
  const cuffTrimR = mesh(box(0.24, 0.025, 0.24), M.mageOrb); cuffTrimR.position.set(0, -0.14, 0); armR.add(cuffTrimR);
  // Staff in right arm with glowing orb tip
  const staffShaft = mesh(box(0.06, 0.70, 0.06), M.mageStaff); staffShaft.position.set(0, -0.28, 0.06); armR.add(staffShaft);
  const orbBase    = mesh(box(0.18, 0.18, 0.18), M.mageOrb);   orbBase.position.set(0, 0.14, 0.06);    armR.add(orbBase);
  const orbTip     = mesh(box(0.10, 0.10, 0.10), M.mageOrb);   orbTip.position.set(0, 0.27, 0.06);     armR.add(orbTip);
  // Head (shifted +0.05 to track raised body/robe)
  const head = mesh(box(0.38, 0.36, 0.34), M.skin); head.position.y = 1.17; g.add(head);
  const eL = mesh(box(0.09, 0.07, 0.06), M.mageEye); eL.position.set( 0.11, 1.20, 0.18); g.add(eL);
  const eR = mesh(box(0.09, 0.07, 0.06), M.mageEye); eR.position.set(-0.11, 1.20, 0.18); g.add(eR);
  // Wizard beard — mustache, wide chin pad, long pointed tip
  const stache = mesh(box(0.22, 0.05, 0.06), M.mageBeard); stache.position.set(0, 1.14, 0.20); g.add(stache);
  const beard1 = mesh(box(0.24, 0.10, 0.08), M.mageBeard); beard1.position.set(0, 1.09, 0.19); g.add(beard1);
  const beard2 = mesh(box(0.16, 0.11, 0.07), M.mageBeard); beard2.position.set(0, 0.99, 0.18); g.add(beard2);
  const beard3 = mesh(box(0.08, 0.10, 0.06), M.mageBeard); beard3.position.set(0, 0.90, 0.17); g.add(beard3);
  // Pointy wizard hat — stacked boxes tapering upward
  const hatBrim = mesh(box(0.52, 0.06, 0.52), M.mageRobe); hatBrim.position.y = 1.40; g.add(hatBrim);
  const hat1    = mesh(box(0.36, 0.20, 0.36), M.mageRobe); hat1.position.y = 1.57; g.add(hat1);
  const hat2    = mesh(box(0.24, 0.20, 0.24), M.mageRobe); hat2.position.y = 1.76; g.add(hat2);
  const hat3    = mesh(box(0.14, 0.22, 0.14), M.mageRobe); hat3.position.y = 1.95; g.add(hat3);
  const hat4    = mesh(box(0.06, 0.14, 0.06), M.mageOrb);  hat4.position.y = 2.13; g.add(hat4); // glowing tip
  // Hat band — gold trim around brim base (mystic stripe)
  const hatBand = mesh(box(0.38, 0.04, 0.38), M.mageOrb);  hatBand.position.y = 1.45; g.add(hatBand);
  // Orbiting spell-tome — a small floating grimoire wreathed in arcane light,
  // hovering at the mage's left side (additive; animated in updateDefenders)
  const tome = new THREE.Group(); tome.position.set(0.62, 1.05, 0.10); g.add(tome);
  const tomeCover = mesh(box(0.06, 0.24, 0.20), M.mageRobe); tome.add(tomeCover);
  const tomePages = mesh(box(0.08, 0.20, 0.16), M.skelBone); tome.add(tomePages);
  const tomeRune  = mesh(box(0.09, 0.09, 0.03), M.mageOrb);  tomeRune.position.set(0.05, 0, 0); tome.add(tomeRune);
  const mageHpBar = makeHPBar(g, 2.45);
  g.position.set(col, 0, row); g.rotation.y = -Math.PI / 2; g.scale.set(0.01, 0.01, 0.01);
  scene.add(g);
  const stat = CFG.STATS.mage;
  defenders.push({
    type: 'mage', group: g, col, row,
    cooldown: 0, range: stat.range, dmg: stat.dmg, rate: stat.rate, pSpeed: stat.pSpeed,
    hp: stat.hp, maxHp: stat.hp, hpBar: mageHpBar, animScale: 0, spawnTime: performance.now(), alive: true,
    legL, legR, armL, armR, idleTime: 0,
    orbBase, orbTip, hatTip: hat4,
  });
}

// ─────────────────────────────────────────────
//  BUILD BALLISTA
// ─────────────────────────────────────────────
function buildBallista(col, row) {
  const g = new THREE.Group();
  // Rotating platform base — wider stone footing for stability
  const stoneFoot = mesh(box(0.86, 0.10, 0.86), M.castleStone); stoneFoot.position.y = 0.05; g.add(stoneFoot);
  const base = mesh(box(0.70, 0.14, 0.70), M.ballistaWood); base.position.y = 0.17; g.add(base);
  // Iron rim banding around the wooden base
  const baseBand = mesh(box(0.74, 0.04, 0.74), M.catMetal); baseBand.position.y = 0.255; g.add(baseBand);
  const pivot = new THREE.Group(); pivot.position.y = 0.24; g.add(pivot);
  // Chassis frame — main wooden body with iron banding
  const frame = mesh(box(0.30, 0.20, 0.80), M.ballistaWood); frame.position.y = 0.15; pivot.add(frame);
  const frameBandF = mesh(box(0.34, 0.05, 0.06), M.catMetal); frameBandF.position.set(0, 0.16, 0.34); pivot.add(frameBandF);  // front iron band
  const frameBandB = mesh(box(0.34, 0.05, 0.06), M.catMetal); frameBandB.position.set(0, 0.16, -0.34); pivot.add(frameBandB); // rear iron band
  const sideL = mesh(box(0.08, 0.36, 0.60), M.ballistaArm);  sideL.position.set( 0.20, 0.18, 0); pivot.add(sideL);
  const sideR = mesh(box(0.08, 0.36, 0.60), M.ballistaArm);  sideR.position.set(-0.20, 0.18, 0); pivot.add(sideR);
  // Torsion skein bundles — twisted rope coils that store the bow's energy (the actual mechanism)
  const skeinL = mesh(box(0.16, 0.22, 0.16), M.ballistaRope); skeinL.position.set( 0.28, 0.38, 0.04); pivot.add(skeinL);
  const skeinR = mesh(box(0.16, 0.22, 0.16), M.ballistaRope); skeinR.position.set(-0.28, 0.38, 0.04); pivot.add(skeinR);
  // Skein iron caps (the bracing plates that hold the torsion bundles in tension)
  const skeinCapLT = mesh(box(0.18, 0.04, 0.18), M.catMetal); skeinCapLT.position.set( 0.28, 0.51, 0.04); pivot.add(skeinCapLT);
  const skeinCapLB = mesh(box(0.18, 0.04, 0.18), M.catMetal); skeinCapLB.position.set( 0.28, 0.25, 0.04); pivot.add(skeinCapLB);
  const skeinCapRT = mesh(box(0.18, 0.04, 0.18), M.catMetal); skeinCapRT.position.set(-0.28, 0.51, 0.04); pivot.add(skeinCapRT);
  const skeinCapRB = mesh(box(0.18, 0.04, 0.18), M.catMetal); skeinCapRB.position.set(-0.28, 0.25, 0.04); pivot.add(skeinCapRB);
  // Horizontal bow arms (now clearly anchored INTO the skein caps)
  const bowL = mesh(box(0.46, 0.08, 0.12), M.ballistaArm);   bowL.position.set( 0.49, 0.38, 0.28); pivot.add(bowL);
  const bowR = mesh(box(0.46, 0.08, 0.12), M.ballistaArm);   bowR.position.set(-0.49, 0.38, 0.28); pivot.add(bowR);
  // Bow string (tight across)
  const string = mesh(box(0.78, 0.04, 0.04), M.ballistaRope); string.position.set(0, 0.38, 0.20); pivot.add(string);
  // Trough / bolt channel
  const trough = mesh(box(0.12, 0.08, 0.62), M.ballistaArm);  trough.position.set(0, 0.42, 0.02); pivot.add(trough);
  // Loaded bolt sitting in trough — visible ammunition gives the weapon "menace"
  const loadedShaft = mesh(box(0.040, 0.50, 0.040), M.catWood);    loadedShaft.position.set(0, 0.48, 0.10); pivot.add(loadedShaft);
  const loadedHead  = mesh(box(0.080, 0.10, 0.080), M.bBoltMat);   loadedHead.position.set(0, 0.48, 0.40);  pivot.add(loadedHead);
  const loadedTip   = mesh(box(0.030, 0.06, 0.030), M.bBoltMat);   loadedTip.position.set(0, 0.48, 0.48);  pivot.add(loadedTip);
  const loadedFletchH = mesh(box(0.10, 0.06, 0.025), M.castleFlag); loadedFletchH.position.set(0, 0.48, -0.16); pivot.add(loadedFletchH);
  const loadedFletchV = mesh(box(0.025, 0.06, 0.10), M.castleFlag); loadedFletchV.position.set(0, 0.48, -0.16); pivot.add(loadedFletchV);
  // Trigger/winding mechanism
  const crank  = mesh(box(0.18, 0.22, 0.18), M.catMetal);     crank.position.set(0, 0.24, -0.28); pivot.add(crank);
  const wheel  = mesh(box(0.22, 0.06, 0.22), M.catMetal);     wheel.position.set(0, 0.34, -0.28); pivot.add(wheel);
  // Crank handle (sticks out the side)
  const crankHandle = mesh(box(0.04, 0.04, 0.20), M.catWood); crankHandle.position.set(0.16, 0.34, -0.32); pivot.add(crankHandle);
  const crankKnob   = mesh(box(0.06, 0.06, 0.06), M.catMetal); crankKnob.position.set(0.24, 0.34, -0.32); pivot.add(crankKnob);
  // Legs / support struts to base — A-frame plus iron sockets
  [[0.24,0.20,0.30],[0.24,0.20,-0.30],[-0.24,0.20,0.30],[-0.24,0.20,-0.30]].forEach(([lx,ly,lz]) => {
    const leg = mesh(box(0.08, 0.28, 0.08), M.ballistaWood); leg.position.set(lx, ly, lz); g.add(leg);
    const sock = mesh(box(0.10, 0.05, 0.10), M.catMetal);    sock.position.set(lx, 0.10, lz); g.add(sock);
  });
  // Side rack of spare bolts — a quiver of ammunition lashed to the chassis (additive)
  const rack = mesh(box(0.10, 0.12, 0.34), M.catWood); rack.position.set(0.40, 0.30, -0.10); g.add(rack);
  for (let i = 0; i < 3; i++) {
    const spare = mesh(box(0.035, 0.46, 0.035), M.catWood);  spare.position.set(0.40, 0.42, -0.20 + i * 0.09); g.add(spare);
    const spTip = mesh(box(0.06, 0.09, 0.06), M.bBoltMat);   spTip.position.set(0.40, 0.66, -0.20 + i * 0.09); g.add(spTip);
  }
  const balHpBar = makeHPBar(g, 1.30);
  g.position.set(col, 0, row); g.scale.set(0.01, 0.01, 0.01);
  scene.add(g);
  const stat = CFG.STATS.ballista;
  defenders.push({
    type: 'ballista', group: g, pivot, col, row,
    cooldown: 0, range: stat.range, dmg: stat.dmg, rate: stat.rate, pSpeed: stat.pSpeed,
    hp: stat.hp, maxHp: stat.hp, hpBar: balHpBar, animScale: 0, spawnTime: performance.now(), alive: true,
    scanTime: 0, bowL, bowR, string, firePhase: 0,
  });
}

// ─────────────────────────────────────────────
//  BUILD SPIKE TRAP (path tile)
// ─────────────────────────────────────────────
function buildSpikeTrap(col, row) {
  const g = new THREE.Group();
  // Wooden base plate flush with path
  const base = mesh(box(0.92, 0.08, 0.92), M.spikeBase); base.position.y = 0.04; g.add(base);
  // Iron frame border
  const frameN = mesh(box(0.92, 0.10, 0.10), M.spikeMetal); frameN.position.set(0, 0.09, -0.42); g.add(frameN);
  const frameS = mesh(box(0.92, 0.10, 0.10), M.spikeMetal); frameS.position.set(0, 0.09,  0.42); g.add(frameS);
  const frameE = mesh(box(0.10, 0.10, 0.72), M.spikeMetal); frameE.position.set( 0.42, 0.09, 0); g.add(frameE);
  const frameW = mesh(box(0.10, 0.10, 0.72), M.spikeMetal); frameW.position.set(-0.42, 0.09, 0); g.add(frameW);
  // 3×3 grid of spikes (pyramid-tapered via 3 stacked boxes)
  const spikePosns = [
    [-0.28,-0.28],[-0.28,0],[-0.28,0.28],
    [0,-0.28],[0,0],[0,0.28],
    [0.28,-0.28],[0.28,0],[0.28,0.28],
  ];
  const spikeGroups = [];
  spikePosns.forEach(([sx,sz]) => {
    const sg = new THREE.Group(); sg.position.set(sx, 0, sz); g.add(sg);
    const s1 = mesh(box(0.12, 0.12, 0.12), M.spikeMetal); s1.position.set(0, 0.14, 0); sg.add(s1);
    const s2 = mesh(box(0.07, 0.12, 0.07), M.spikeMetal); s2.position.set(0, 0.26, 0); sg.add(s2);
    const s3 = mesh(box(0.04, 0.08, 0.04), M.spikeGlow);  s3.position.set(0, 0.37, 0); sg.add(s3); // glowing tip
    spikeGroups.push(sg);
  });
  // Heavy corner rivets on the iron frame
  [[0.42,0.42],[0.42,-0.42],[-0.42,0.42],[-0.42,-0.42]].forEach(([rx,rz]) => {
    const rivet = mesh(box(0.12, 0.13, 0.12), M.catMetal); rivet.position.set(rx, 0.10, rz); g.add(rivet);
  });
  // Grim trophies — a cracked skull impaled at the edge + scattered bones (the trap bites)
  const skull   = mesh(box(0.17, 0.16, 0.15), M.orcTusk);  skull.position.set(0.16, 0.30, 0.30); g.add(skull);
  const skullJaw= mesh(box(0.14, 0.05, 0.11), M.orcTusk);  skullJaw.position.set(0.16, 0.24, 0.33); g.add(skullJaw);
  const skEyeL  = mesh(box(0.04, 0.045,0.03), M.castleDark); skEyeL.position.set(0.20, 0.31, 0.37); g.add(skEyeL);
  const skEyeR  = mesh(box(0.04, 0.045,0.03), M.castleDark); skEyeR.position.set(0.12, 0.31, 0.37); g.add(skEyeR);
  const bone1   = mesh(box(0.05, 0.22, 0.05), M.orcTusk);  bone1.position.set(-0.30, 0.11, -0.22); bone1.rotation.z = 1.3; g.add(bone1);
  const bone2   = mesh(box(0.05, 0.17, 0.05), M.orcTusk);  bone2.position.set(-0.24, 0.11, 0.26); bone2.rotation.z = 1.1; bone2.rotation.y = 0.5; g.add(bone2);
  const spikeHpBar = makeHPBar(g, 0.70);
  // hide HP bar since trap is indestructible
  spikeHpBar.bg.visible = false; spikeHpBar.fg.visible = false;
  g.position.set(col, 0, row); g.scale.set(0.01, 0.01, 0.01);
  scene.add(g);
  const stat = CFG.STATS.spiketrap;
  defenders.push({
    type: 'spiketrap', group: g, col, row,
    cooldown: 0, range: stat.range, dmg: stat.dmg, rate: stat.rate,
    hp: stat.hp, maxHp: stat.hp, hpBar: spikeHpBar, animScale: 0, spawnTime: performance.now(), alive: true,
    spikeGroups, triggerPhase: 0,
  });
}

// ─────────────────────────────────────────────
//  BUILD SOLDIER
// ─────────────────────────────────────────────
function buildSoldier(col, row, soldierType) {
  const g = new THREE.Group();
  let lL, lR, armL, armR, weaponRef = null;

  if (soldierType === 'knight') {
    // ── KNIGHT / SWORDSMAN ──
    // Armored boots
    const bootL = mesh(box(0.16, 0.1, 0.2), M.swArmor); bootL.position.set( 0.14, 0.05, 0.02); g.add(bootL);
    const bootR = mesh(box(0.16, 0.1, 0.2), M.swArmor); bootR.position.set(-0.14, 0.05, 0.02); g.add(bootR);
    // Legs with knee plates
    lL = skinBox6(0.2, 0.36, 0.2, SKINS.knight, MC_SKIN.LEG_L); lL.position.set( 0.14, 0.28, 0); g.add(lL);
    lR = skinBox6(0.2, 0.36, 0.2, SKINS.knight, MC_SKIN.LEG_R); lR.position.set(-0.14, 0.28, 0); g.add(lR);
    const kneeL = mesh(box(0.2, 0.08, 0.22), M.swHelmet); kneeL.position.set( 0.14, 0.38, 0.03); g.add(kneeL);
    const kneeR = mesh(box(0.2, 0.08, 0.22), M.swHelmet); kneeR.position.set(-0.14, 0.38, 0.03); g.add(kneeR);
    // Waist/belt plate
    const waist = mesh(box(0.48, 0.1, 0.32), M.swGold); waist.position.y = 0.51; g.add(waist);
    // Heraldic tabard — cloth surcoat hanging from belt over breastplate (front + back panels with gold trim)
    const tabardF      = mesh(box(0.34, 0.40, 0.04), M.castleFlag); tabardF.position.set(0, 0.30, 0.20); g.add(tabardF);
    const tabardFTrim  = mesh(box(0.36, 0.04, 0.045), M.swGold);    tabardFTrim.position.set(0, 0.10, 0.20); g.add(tabardFTrim);
    const tabardFEmblem= mesh(box(0.10, 0.10, 0.045), M.swGold);    tabardFEmblem.position.set(0, 0.34, 0.21); g.add(tabardFEmblem);
    const tabardB      = mesh(box(0.34, 0.40, 0.04), M.castleFlag); tabardB.position.set(0, 0.30, -0.20); g.add(tabardB);
    const tabardBTrim  = mesh(box(0.36, 0.04, 0.045), M.swGold);    tabardBTrim.position.set(0, 0.10, -0.20); g.add(tabardBTrim);
    // Body breastplate
    const body = skinBox6(0.5, 0.52, 0.32, SKINS.knight, MC_SKIN.BODY); body.position.y = 0.72; g.add(body);
    const chest = mesh(box(0.22, 0.3, 0.06), M.swHelmet); chest.position.set(0, 0.78, 0.18); g.add(chest);
    const stripe = mesh(box(0.06, 0.28, 0.06), M.swGold); stripe.position.set(0, 0.78, 0.2); g.add(stripe);
    // Pauldrons (shoulder pads)
    const padL = mesh(box(0.2, 0.16, 0.34), M.swHelmet); padL.position.set( 0.34, 0.9, 0); g.add(padL);
    const padR = mesh(box(0.2, 0.16, 0.34), M.swHelmet); padR.position.set(-0.34, 0.9, 0); g.add(padR);
    // Arms
    armL = skinBox6(0.16, 0.42, 0.16, SKINS.knight, MC_SKIN.ARM_L); armL.position.set( 0.36, 0.66, 0); g.add(armL);
    armR = skinBox6(0.16, 0.42, 0.16, SKINS.knight, MC_SKIN.ARM_R); armR.position.set(-0.36, 0.66, 0); g.add(armR);
    // Shield attached to left arm — moves with armL rotation
    const shield = mesh(box(0.06, 0.48, 0.36), M.swShield); shield.position.set(0.20, 0.06, 0); armL.add(shield);
    const shieldBoss = mesh(box(0.08, 0.14, 0.14), M.swGold); shieldBoss.position.set(0.26, 0.06, 0); armL.add(shieldBoss);
    // Helmet — detailed great helm
    const helmet    = skinBox6(0.42, 0.32, 0.4, SKINS.knight, MC_SKIN.HEAD); helmet.position.y = 1.14; g.add(helmet);
    const brow      = mesh(box(0.44, 0.05, 0.10), M.swHelmet); brow.position.set(0, 1.225, 0.22);    g.add(brow);      // brow ridge jutting over visor
    const visor     = mesh(box(0.28, 0.14, 0.07), M.swVisor);  visor.position.set(0, 1.09, 0.24);    g.add(visor);     // eye/nose plate
    const visorRim  = mesh(box(0.30, 0.02, 0.07), M.swGold);   visorRim.position.set(0, 1.16, 0.24); g.add(visorRim);  // gold trim above visor
    const nasal     = mesh(box(0.04, 0.14, 0.07), M.swHelmet); nasal.position.set(0, 1.09, 0.26);    g.add(nasal);     // nasal bar down centre
    const cheekL    = mesh(box(0.08, 0.18, 0.32), M.swHelmet); cheekL.position.set( 0.25, 1.07, 0.02); g.add(cheekL); // left cheek guard
    const cheekR    = mesh(box(0.08, 0.18, 0.32), M.swHelmet); cheekR.position.set(-0.25, 1.07, 0.02); g.add(cheekR); // right cheek guard
    const neckGuard = mesh(box(0.38, 0.12, 0.08), M.swHelmet); neckGuard.position.set(0, 1.02, -0.18); g.add(neckGuard); // rear neck plate
    const chinGuard = mesh(box(0.24, 0.08, 0.09), M.swHelmet); chinGuard.position.set(0, 0.99, 0.18);  g.add(chinGuard); // chin guard
    const crestBase = mesh(box(0.10, 0.06, 0.38), M.swGold);   crestBase.position.set(0, 1.29, -0.01); g.add(crestBase); // gold crest mounting
    const crest     = mesh(box(0.06, 0.26, 0.36), M.swGold);   crest.position.set(0, 1.42, -0.01);     g.add(crest);     // main crest fin
    // Sword attached to right arm — swings with armR rotation
    // Sword attached to right arm — flat face already points toward enemy (-X world)
    // Local space: arm center = (0,0,0), hand ≈ y=-0.21, shoulder ≈ y=+0.21
    // Sword group — rotation.x = PI/2 tips the vertical blade to point forward (+Z)
    // Group positioned so the grip (y=-0.22 in group) lands at armR z=0 (inside palm)
    const swGroup = new THREE.Group();
    swGroup.position.set(0, -0.22, 0.22);
    swGroup.rotation.x = Math.PI / 2;
    armR.add(swGroup);
    const swPommel = mesh(box(0.13, 0.11, 0.13), M.swGold);   swPommel.position.set(0, -0.38, 0); swGroup.add(swPommel);
    const swGrip   = mesh(box(0.07, 0.22, 0.07), M.arcBelt);  swGrip.position.set(0,  -0.22, 0); swGroup.add(swGrip);
    const swGuard  = mesh(box(0.40, 0.07, 0.08), M.weapon);   swGuard.position.set(0, -0.08, 0); swGuard.rotation.y = Math.PI / 2; swGroup.add(swGuard);
    const swBlade  = mesh(box(0.07, 0.52, 0.05), M.weapon);   swBlade.position.set(0,   0.20, 0); swBlade.rotation.y = Math.PI / 2; swGroup.add(swBlade);
    const swTip    = mesh(box(0.045, 0.14, 0.035), M.weapon); swTip.position.set(0,     0.50, 0); swGroup.add(swTip);
    // ── Knight grandeur: flowing heraldic cape + crest plume (additive, rig-safe) ──
    // Local -Z is the figure's back; cape hangs from a gold mantle at the shoulders.
    const capeClasp = mesh(box(0.46, 0.09, 0.06), M.swGold); capeClasp.position.set(0, 0.93, -0.17); g.add(capeClasp);
    const capeUp    = mesh(box(0.44, 0.42, 0.05), M.spCape); capeUp.position.set(0, 0.66, -0.205); g.add(capeUp);
    const capeLo    = mesh(box(0.40, 0.26, 0.05), M.spCape); capeLo.position.set(0, 0.34, -0.235); capeLo.rotation.x = -0.05; g.add(capeLo);
    const capeHem   = mesh(box(0.41, 0.05, 0.06), M.swGold); capeHem.position.set(0, 0.215, -0.245); g.add(capeHem);
    // Tall horsehair crest plume sweeping back off the helm crest
    const plume1 = mesh(box(0.09, 0.16, 0.14), M.spCape); plume1.position.set(0, 1.50, -0.10); plume1.rotation.x = -0.5; g.add(plume1);
    const plume2 = mesh(box(0.08, 0.14, 0.12), M.spCape); plume2.position.set(0, 1.42, -0.22); plume2.rotation.x = -0.9; g.add(plume2);

  } else if (soldierType === 'swordsman') {
    // ── SWORDSMAN — royal blue tunic, brown leather accents ──
    // Boots
    const bootL = mesh(box(0.17, 0.12, 0.22), M.arcBelt); bootL.position.set( 0.14, 0.06, 0.02); g.add(bootL);
    const bootR = mesh(box(0.17, 0.12, 0.22), M.arcBelt); bootR.position.set(-0.14, 0.06, 0.02); g.add(bootR);
    // Blue breeches
    lL = mesh(box(0.20, 0.36, 0.20), M.swTunic); lL.position.set( 0.14, 0.28, 0); g.add(lL);
    lR = mesh(box(0.20, 0.36, 0.20), M.swTunic); lR.position.set(-0.14, 0.28, 0); g.add(lR);
    // Leather knee pads
    const kneeL = mesh(box(0.18, 0.08, 0.05), M.arcBelt); kneeL.position.set( 0.14, 0.38, 0.11); g.add(kneeL);
    const kneeR = mesh(box(0.18, 0.08, 0.05), M.arcBelt); kneeR.position.set(-0.14, 0.38, 0.11); g.add(kneeR);
    // Belt with iron buckle
    const belt   = mesh(box(0.46, 0.08, 0.30), M.arcBelt); belt.position.y = 0.50; g.add(belt);
    const buckle = mesh(box(0.08, 0.08, 0.06), M.weapon);  buckle.position.set(0, 0.50, 0.17); g.add(buckle);
    // Scabbard on left hip (decorative)
    const scabbard = mesh(box(0.06, 0.26, 0.06), M.arcBelt); scabbard.position.set(0.26, 0.40, 0.10); scabbard.rotation.z = 0.22; g.add(scabbard);
    // Royal blue tunic body
    const body = mesh(box(0.46, 0.52, 0.30), M.swTunic); body.position.y = 0.72; g.add(body);
    // Gold chest stripe (faction emblem)
    const goldStripe = mesh(box(0.06, 0.30, 0.06), M.swGold); goldStripe.position.set(0, 0.78, 0.18); g.add(goldStripe);
    // Diagonal leather chest strap
    const strap = mesh(box(0.05, 0.46, 0.06), M.arcBelt); strap.position.set(0.07, 0.74, 0.17); strap.rotation.z = 0.14; g.add(strap);
    // Small leather shoulder pads
    const padL = mesh(box(0.18, 0.11, 0.28), M.arcBelt); padL.position.set( 0.34, 0.88, 0); g.add(padL);
    const padR = mesh(box(0.18, 0.11, 0.28), M.arcBelt); padR.position.set(-0.34, 0.88, 0); g.add(padR);
    // Arms — blue tunic sleeves
    armL = mesh(box(0.16, 0.40, 0.16), M.swTunic); armL.position.set( 0.36, 0.66, 0); g.add(armL);
    armR = mesh(box(0.16, 0.40, 0.16), M.swTunic); armR.position.set(-0.36, 0.66, 0); g.add(armR);
    // Bracers on forearms — parented to arms so they animate together
    const bracerL = mesh(box(0.17, 0.14, 0.17), M.arcBelt); bracerL.position.set(0, -0.10, 0); armL.add(bracerL);
    const bracerR = mesh(box(0.17, 0.14, 0.17), M.arcBelt); bracerR.position.set(0, -0.10, 0); armR.add(bracerR);
    // Neck + head with cloth cap
    const neck = mesh(box(0.18, 0.10, 0.18), M.skin);    neck.position.y = 0.98; g.add(neck);
    const head = mesh(box(0.38, 0.32, 0.36), M.skin);    head.position.y = 1.14; g.add(head);
    // Nasal helmet — brown leather cap with brow band, nose guard, ear guards, neck flap
    const helmCap  = mesh(box(0.40, 0.22, 0.40), M.spLeather); helmCap.position.set(0, 1.26, 0);      g.add(helmCap);   // main cap
    const helmBrow = mesh(box(0.42, 0.05, 0.42), M.spLeather); helmBrow.position.set(0, 1.16, 0);     g.add(helmBrow);  // brow rim
    const helmNose = mesh(box(0.04, 0.16, 0.07), M.arcBelt);   helmNose.position.set(0, 1.10, 0.24);  g.add(helmNose);  // nasal bar
    const helmEarL = mesh(box(0.06, 0.13, 0.26), M.spLeather); helmEarL.position.set( 0.24, 1.10, 0); g.add(helmEarL); // left ear guard
    const helmEarR = mesh(box(0.06, 0.13, 0.26), M.spLeather); helmEarR.position.set(-0.24, 1.10, 0); g.add(helmEarR); // right ear guard
    const helmNeck = mesh(box(0.36, 0.10, 0.07), M.spLeather); helmNeck.position.set(0, 1.10, -0.20); g.add(helmNeck); // neck flap
    const helmPad  = mesh(box(0.38, 0.04, 0.38), M.arcBelt);   helmPad.position.set(0, 1.14, 0);      g.add(helmPad);  // brow padding
    // Iron sword — swGrp rotated so tip points toward enemy (+Z of armR)
    const swGrp = new THREE.Group();
    swGrp.position.set(0, -0.20, 0.20);
    swGrp.rotation.x = Math.PI / 2;
    armR.add(swGrp);
    const swPom   = mesh(box(0.10, 0.09, 0.10), M.arcBelt); swPom.position.set(0, -0.30, 0); swGrp.add(swPom);
    const swGrip2 = mesh(box(0.06, 0.18, 0.06), M.arcBelt); swGrip2.position.set(0, -0.16, 0); swGrp.add(swGrip2);
    const swGrd   = mesh(box(0.28, 0.06, 0.07), M.weapon);  swGrd.position.set(0, -0.04, 0); swGrd.rotation.y = Math.PI / 2; swGrp.add(swGrd);
    const swBlade = mesh(box(0.06, 0.42, 0.04), M.weapon);  swBlade.position.set(0, 0.18, 0); swBlade.rotation.y = Math.PI / 2; swGrp.add(swBlade);
    const swTip   = mesh(box(0.04, 0.12, 0.03), M.weapon);  swTip.position.set(0, 0.44, 0); swGrp.add(swTip);
    // ── Swordsman flair: dashing half-cloak slung from the right shoulder (rig-safe) ──
    const hcClasp = mesh(box(0.16, 0.08, 0.24), M.swGold); hcClasp.position.set(-0.18, 0.92, -0.02); g.add(hcClasp);
    const hcUp    = mesh(box(0.30, 0.40, 0.05), M.castleFlag); hcUp.position.set(-0.06, 0.66, -0.19); hcUp.rotation.z = 0.10; g.add(hcUp);
    const hcLo    = mesh(box(0.26, 0.22, 0.05), M.castleFlag); hcLo.position.set(-0.04, 0.36, -0.21); hcLo.rotation.z = 0.06; g.add(hcLo);

  } else if (soldierType === 'spearman') {
    // ── SPEARMAN — slate blue cloth, metal plates, red cape ──
    // Leather boots
    const bootL = mesh(box(0.16, 0.1, 0.2), M.arcBelt); bootL.position.set( 0.13, 0.05, 0.02); g.add(bootL);
    const bootR = mesh(box(0.16, 0.1, 0.2), M.arcBelt); bootR.position.set(-0.13, 0.05, 0.02); g.add(bootR);
    // Slate blue legs with metal shin guards
    lL = mesh(box(0.18, 0.36, 0.18), M.spTunic); lL.position.set( 0.13, 0.28, 0); g.add(lL);
    lR = mesh(box(0.18, 0.36, 0.18), M.spTunic); lR.position.set(-0.13, 0.28, 0); g.add(lR);
    const shinL = mesh(box(0.18, 0.22, 0.07), M.spHelmet); shinL.position.set( 0.13, 0.22, 0.1); g.add(shinL);
    const shinR = mesh(box(0.18, 0.22, 0.07), M.spHelmet); shinR.position.set(-0.13, 0.22, 0.1); g.add(shinR);
    // Waist belt with gold buckle
    const belt = mesh(box(0.48, 0.09, 0.3), M.arcBelt); belt.position.y = 0.5; g.add(belt);
    const buckle = mesh(box(0.1, 0.09, 0.07), M.swGold); buckle.position.set(0, 0.5, 0.17); g.add(buckle);
    // Slate blue body with chest strap
    const body = mesh(box(0.48, 0.52, 0.3), M.spTunic); body.position.y = 0.71; g.add(body);
    const strap = mesh(box(0.06, 0.5, 0.07), M.arcBelt); strap.position.set(0.12, 0.72, 0.17); strap.rotation.z = 0.18; g.add(strap);
    // Cape (behind body) — crimson red, very distinctive
    const cape = mesh(box(0.52, 0.6, 0.07), M.spCape); cape.position.set(0, 0.68, -0.2); g.add(cape);
    const capeBot = mesh(box(0.44, 0.18, 0.07), M.spCape); capeBot.position.set(0, 0.32, -0.2); g.add(capeBot);
    // Arms — slate blue sleeves
    armL = mesh(box(0.16, 0.38, 0.16), M.spTunic); armL.position.set( 0.3, 0.72, 0.08); armL.rotation.z = -0.25; g.add(armL);
    armR = mesh(box(0.16, 0.38, 0.16), M.spTunic); armR.position.set( 0.3, 0.48, 0.08); armR.rotation.z =  0.15; g.add(armR);
    // Helmet with cheek guards
    const helmet = mesh(box(0.38, 0.28, 0.36), M.spHelmet); helmet.position.y = 1.13; g.add(helmet);
    const cheekL = mesh(box(0.08, 0.2, 0.3), M.spHelmet); cheekL.position.set( 0.22, 1.06, 0); g.add(cheekL);
    const cheekR = mesh(box(0.08, 0.2, 0.3), M.spHelmet); cheekR.position.set(-0.22, 1.06, 0); g.add(cheekR);
    const plume  = mesh(box(0.08, 0.26, 0.28), M.spCape); plume.position.set(0, 1.4, -0.04); g.add(plume);
    const face   = mesh(box(0.26, 0.18, 0.06), M.skin); face.position.set(0, 1.1, 0.19); g.add(face);
    // Spear parented to armR (lower hand) — follows arm during thrust so tip drives forward
    const spearGroup = new THREE.Group(); spearGroup.position.set(0, 0.18, 0.02); armR.add(spearGroup);
    const pole   = mesh(box(0.05, 1.5, 0.05), M.catWood);    pole.position.set(0, 0.25, 0);   spearGroup.add(pole);
    const spBase = mesh(box(0.08, 0.1,  0.08), M.spHelmet);  spBase.position.set(0, -0.55, 0); spearGroup.add(spBase);
    const spHead2 = mesh(box(0.12, 0.28, 0.12), M.spearHead); spHead2.position.set(0, 1.14, 0); spearGroup.add(spHead2);
    const spWing  = mesh(box(0.28, 0.06, 0.06), M.spearHead); spWing.position.set(0, 0.95, 0);  spearGroup.add(spWing);
    weaponRef = spearGroup;

  } else {
    // ── ARCHER — teal tunic, dark teal hood, brown leather ──
    // Boots
    const bootL = mesh(box(0.15, 0.1, 0.2), M.arcBelt); bootL.position.set( 0.12, 0.05, 0.02); g.add(bootL);
    const bootR = mesh(box(0.15, 0.1, 0.2), M.arcBelt); bootR.position.set(-0.12, 0.05, 0.02); g.add(bootR);
    // Teal legs
    lL = mesh(box(0.17, 0.36, 0.17), M.arcTeal); lL.position.set( 0.12, 0.28, 0); g.add(lL);
    lR = mesh(box(0.17, 0.36, 0.17), M.arcTeal); lR.position.set(-0.12, 0.28, 0); g.add(lR);
    // Belt
    const belt = mesh(box(0.44, 0.09, 0.28), M.arcBelt); belt.position.y = 0.5; g.add(belt);
    const pouch = mesh(box(0.12, 0.12, 0.09), M.arcBelt); pouch.position.set(-0.2, 0.48, 0.16); g.add(pouch);
    // Teal body tunic
    const body = mesh(box(0.44, 0.5, 0.28), M.arcTeal); body.position.y = 0.7; g.add(body);
    // Quiver on back with arrows
    const quiver = mesh(box(0.14, 0.42, 0.14), M.arcBelt); quiver.position.set(-0.24, 0.72, -0.2); g.add(quiver);
    for (let ai = 0; ai < 4; ai++) {
      const arrTop = mesh(box(0.03, 0.1, 0.03), M.spearHead);
      arrTop.position.set(-0.24 + (ai - 1.5) * 0.04, 1.0, -0.2); g.add(arrTop);
    }
    // Left arm — bow arm
    armL = mesh(box(0.14, 0.36, 0.14), M.arcTeal); armL.position.set(0.3, 0.72, 0.05); g.add(armL);
    // Leather bracer — moves with armL
    const bracer = mesh(box(0.16, 0.14, 0.16), M.arcBelt); bracer.position.set(0, -0.05, 0.04); armL.add(bracer);

    // ── RECURVE LONGBOW — parented to armL hand ──
    // The bow hangs vertically from the grip, string faces the draw arm
    const bowPivot = new THREE.Group(); bowPivot.position.set(0, -0.16, 0.04); bowPivot.rotation.y = Math.PI; armL.add(bowPivot);
    // Central grip — slightly wider so the hand wrap is visible
    const bGrip  = mesh(box(0.072, 0.16, 0.082), M.catWood); bowPivot.add(bGrip);
    // Grip wrapping tape (dark band)
    const bWrap  = mesh(box(0.080, 0.08, 0.090), M.arcBelt); bWrap.position.y = 0.00; bowPivot.add(bWrap);
    // Upper limb — 2 segments tapering and curving away from string (recurve shape)
    const bUpA   = mesh(box(0.052, 0.27, 0.056), M.catWood); bUpA.position.y = 0.22; bUpA.rotation.z = -0.09; bowPivot.add(bUpA);
    const bUpB   = mesh(box(0.038, 0.18, 0.042), M.catWood); bUpB.position.set(0.045, 0.41, 0.01); bUpB.rotation.z = -0.40; bowPivot.add(bUpB);
    // Lower limb — mirrors upper
    const bDnA   = mesh(box(0.052, 0.27, 0.056), M.catWood); bDnA.position.y = -0.22; bDnA.rotation.z = 0.09; bowPivot.add(bDnA);
    const bDnB   = mesh(box(0.038, 0.18, 0.042), M.catWood); bDnB.position.set(0.045, -0.41, 0.01); bDnB.rotation.z = 0.40; bowPivot.add(bDnB);
    // Bowstring — two halves that form a V pointing toward the draw arm.
    // At rest the V is shallow; animation deepens it as the bow is drawn.
    // Upper half: from string midpoint (x≈+0.07) up to upper limb tip (x≈+0.04, y≈+0.48)
    const bStrUp = mesh(box(0.022, 0.50, 0.022), M.weapon);
    bStrUp.position.set(0.055, 0.24, 0.02); bStrUp.rotation.z = -0.062; bowPivot.add(bStrUp);
    // Lower half: mirrors upper
    const bStrDn = mesh(box(0.022, 0.50, 0.022), M.weapon);
    bStrDn.position.set(0.055, -0.24, 0.02); bStrDn.rotation.z =  0.062; bowPivot.add(bStrDn);
    // Stash references for live string animation
    bowPivot.userData.strUp = bStrUp;
    bowPivot.userData.strDn = bStrDn;
    weaponRef = bowPivot;

    // Right arm — draw arm
    armR = mesh(box(0.14, 0.36, 0.14), M.arcTeal); armR.position.set(-0.3, 0.72, 0.05); g.add(armR);
    // Nocked arrow — shaft, tip, and two crossed fletchings parented to draw arm
    const nockShaft = mesh(box(0.030, 0.48, 0.030), M.catWood); nockShaft.position.set(-0.02, -0.08, 0.24); armR.add(nockShaft);
    const arrowTip  = mesh(box(0.055, 0.11, 0.055), M.spearHead); arrowTip.position.set(-0.02,  0.19, 0.24); armR.add(arrowTip);
    // Fletching fins (two crossed, at the nock end)
    const fletchH   = mesh(box(0.080, 0.10, 0.020), M.arcTeal); fletchH.position.set(-0.02, -0.30, 0.24); armR.add(fletchH);
    const fletchV   = mesh(box(0.020, 0.10, 0.080), M.arcTeal); fletchV.position.set(-0.02, -0.30, 0.24); armR.add(fletchV);
    // Hood
    const hood = mesh(box(0.38, 0.4, 0.38), M.arcHood); hood.position.y = 1.12; g.add(hood);
    const face2 = mesh(box(0.26, 0.2, 0.08), M.skin); face2.position.set(0, 1.1, 0.2); g.add(face2);
    // ── Ranger's hooded cloak flowing down the back (rig-safe, static) ──
    const cloakNeck = mesh(box(0.40, 0.12, 0.06), M.arcHood); cloakNeck.position.set(0, 0.92, -0.16); g.add(cloakNeck);
    const cloakUp   = mesh(box(0.40, 0.44, 0.05), M.arcHood); cloakUp.position.set(0, 0.64, -0.19); g.add(cloakUp);
    const cloakLo   = mesh(box(0.34, 0.26, 0.05), M.arcHood); cloakLo.position.set(0, 0.34, -0.215); cloakLo.rotation.x = -0.05; g.add(cloakLo);
    const cloakHem  = mesh(box(0.35, 0.05, 0.06), M.arcBelt); cloakHem.position.set(0, 0.205, -0.225); g.add(cloakHem);
  }

  const soldierHpBar = makeHPBar(g, 1.72);
  g.position.set(col, 0, row); g.rotation.y = -Math.PI / 2; g.scale.set(0.01, 0.01, 0.01);
  scene.add(g);
  const stat = CFG.STATS[soldierType];
  defenders.push({
    type: soldierType, group: g, col, row,
    cooldown: 0, range: stat.range, dmg: stat.dmg, rate: stat.rate, pSpeed: stat.pSpeed || 0,
    hp: stat.hp, maxHp: stat.hp, hpBar: soldierHpBar,
    animScale: 0, spawnTime: performance.now(), alive: true, legL: lL, legR: lR, armL, armR,
    idleTime: Math.random() * Math.PI * 2,
    attackedBy: null, state: 'idle', chaseTarget: null, weapon: weaponRef,
  });
}

// ─────────────────────────────────────────────
//  PLACE (walls allowed on path tiles)
// ─────────────────────────────────────────────
// Feature 1: upgrade defender
function addUpgradeIndicator(def) {
  // Remove old gem meshes
  const toRemove = [];
  def.group.traverse(child => { if (child.userData.isUpgradeGem) toRemove.push(child); });
  toRemove.forEach(child => { def.group.remove(child); child.geometry.dispose(); });
  // Add gems based on level
  const gemCount = def.level - 1; // level 2 = 1 gem, level 3 = 2 gems
  const colors = [0xffd040, 0xff8820]; // yellow, orange
  for (let i = 0; i < gemCount; i++) {
    const gemGeo = box(0.11, 0.11, 0.11);
    const gemMat = new THREE.MeshStandardMaterial({ color: colors[i], emissive: colors[i], emissiveIntensity: 1.8 });
    const gem = new THREE.Mesh(gemGeo, gemMat);
    gem.castShadow = false;
    const yTop = def.type === 'tower' ? 4.1 : def.type === 'catapult' ? 2.5 : def.type === 'wall' ? 3.2 : 2.0;
    gem.position.set((i - (gemCount - 1) / 2) * 0.22, yTop, 0);
    gem.userData.isUpgradeGem = true;
    def.group.add(gem);
  }
}

// Kill-pip indicator: small coloured spheres above defender showing kill milestones (1 pip per 5 kills, max 5)
function updateKillPips(def) {
  if (!def.group?.traverse) return;
  const killCount = def.kills || 0;
  const pipCount = Math.min(5, Math.floor(killCount / 5));
  let existing = 0;
  def.group.traverse(c => { if (c.userData.isKillPip) existing++; });
  if (existing === pipCount) return;
  // Rebuild pips
  const toRemove = [];
  def.group.traverse(c => { if (c.userData.isKillPip) toRemove.push(c); });
  toRemove.forEach(c => { def.group.remove(c); c.geometry.dispose(); c.material.dispose(); });
  const yBase = def.type === 'tower' ? 3.7 : def.type === 'catapult' ? 2.3 : def.type === 'wall' ? 3.0 : 1.8;
  for (let i = 0; i < pipCount; i++) {
    const t = i / 4;
    const col = new THREE.Color().setHSL(0.6 - t * 0.5, 1.0, 0.55); // blue → red
    const pipMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.2 });
    const pip = new THREE.Mesh(box(0.09, 0.09, 0.09), pipMat);
    pip.position.set((i - (pipCount - 1) / 2) * 0.20, yBase, 0.35);
    pip.userData.isKillPip = true;
    def.group.add(pip);
  }
}

function tryUpgradeDefender(col, row) {
  const def = defenders.find(d => d.col === col && d.row === row && d.alive);
  if (!def) return;
  if (def.type === 'spiketrap') { showTooltip('Spike traps cannot be upgraded!', 1800); return; }
  if (def.type === 'wall') { showTooltip('Walls cannot be upgraded!', 1800); return; }
  const level = def.level || 1;
  if (level >= 3) {
    showTooltip('Max level!', 1500);
    return;
  }
  const killsNeeded = level === 1 ? 10 : 25;
  if ((def.kills || 0) < killsNeeded) {
    showTooltip(`Need ${killsNeeded} kills to upgrade! (${def.kills || 0}/${killsNeeded})`, 2000);
    return;
  }
  const isBuilding = ['tower', 'catapult', 'archer', 'mage', 'ballista'].includes(def.type);
  const cost = CFG.COSTS[def.type] * level * (isBuilding ? 2 : 1);
  if (gold < cost) {
    showTooltip(`Not enough gold! Need ${cost}🟡 to upgrade`, 2000);
    return;
  }
  gold -= cost;
  def.level = level + 1;
  SND.upgrade();
  // Boost stats using per-type multipliers from CFG.UPGRADE_STATS
  const um = CFG.UPGRADE_STATS[def.type] || { dmg: 1.35, range: 1.15, rate: 1.25, hp: 1.40 };
  def.dmg   = (def.dmg   || 1) * um.dmg;
  def.range = (def.range || 3) * um.range;
  def.rate  = (def.rate  || 1) * um.rate;
  def.maxHp = Math.floor(def.maxHp * um.hp);
  def.hp    = Math.min(def.maxHp, def.hp + Math.floor(def.maxHp * 0.3));
  updateHUD();
  addUpgradeIndicator(def);
  SND.build();
  showTooltip(`Upgraded to Level ${def.level}! (${cost}🟡)`, 1800);
}

function place(tool, col, row) {
  if (!tool) return;
  const key = `${col},${row}`;
  const cell = grid[key];
  if (!cell) return;

  // Feature 4: unlock check
  if (!testMode && !UNLOCKED.has(tool)) {
    SND.denyClick?.();
    showTooltip(`Unlocks at wave ${UNLOCK_WAVES[tool]}!`, 1800);
    return;
  }

  if (cell.type === 'castle') {
    SND.denyClick?.();
    showTooltip('Cannot build inside the castle!', 1800);
    return;
  }
  if (cell.type === 'water' || cell.type === 'scenery') {
    SND.denyClick?.();
    showTooltip('Cannot build on terrain obstacles!', 1800);
    return;
  }
  if (tool === 'wall' || tool === 'spiketrap') {
    if (cell.type !== 'grass' && cell.type !== 'path') {
      SND.denyClick?.();
      showTooltip(tool === 'spiketrap' ? 'Spike traps go on road tiles!' : 'Walls go on grass or road tiles!', 1800);
      return;
    }
  } else {
    if (cell.type !== 'grass') {
      SND.denyClick?.();
      showTooltip('Can only build on green tiles!', 1800);
      return;
    }
  }
  if (occupied.has(key)) {
    SND.denyClick?.();
    showTooltip('Tile already occupied!', 1800);
    return;
  }
  const _unitCost = CFG.STATS[tool]?.unitCost ?? 1;
  const _curUnits = liveDefenderCount();
  const _maxUnits = getMaxDefenders();
  if (!testMode && _curUnits + _unitCost > _maxUnits) {
    SND.denyClick?.();
    showTooltip(`Unit cap! (${_curUnits}/${_maxUnits}) — need ${_unitCost} slot${_unitCost > 1 ? 's' : ''}, only ${_maxUnits - _curUnits} free`, 2500);
    return;
  }
  const cost = CFG.COSTS[tool];
  if (!testMode && gold < cost) {
    SND.denyClick?.();
    showTooltip(`Not enough gold! Need ${cost}🟡`, 2000);
    return;
  }
  if (!testMode) gold -= cost;
  if (!testMode) _runStats.defendersBuilt++;
  occupied.add(key);

  if      (tool === 'wall')      buildWall(col, row);
  else if (tool === 'tower')     buildTower(col, row);
  else if (tool === 'catapult')  buildCatapult(col, row);
  else if (tool === 'mage')      buildMage(col, row);
  else if (tool === 'ballista')  buildBallista(col, row);
  else if (tool === 'spiketrap') buildSpikeTrap(col, row);
  else if (['knight','swordsman','spearman','archer'].includes(tool)) buildSoldier(col, row, tool);

  updateHUD();

  // Walls get a heavier stone-on-stone thunk; every other unit gets its own signature deploy cue
  if (tool === 'wall') SND.wallPlace(); else SND.placeUnit?.(tool);
  const names = { wall:'Wall', tower:'Crystal Tower', catapult:'Catapult', swordsman:'Swordsman', knight:'Knight', spearman:'Spearman', archer:'Archer', mage:'Mage', ballista:'Ballista', spiketrap:'Spike Trap' };
  showTooltip(`${names[tool]} built! (${cost}🟡)`, 1500);
}

// ─────────────────────────────────────────────
//  PROJECTILE SYSTEM
// ─────────────────────────────────────────────
// Mesh pool: reuse projectile meshes instead of allocating/GCing every shot.
// Also pools enemy projectiles (eArrow, eMagic, eRock) which used to bypass the
// pool entirely — wave 12+ with many archers/mages was allocating + GCing hundreds
// of meshes per minute.
const _projPool = {
  bolt: [], arrow: [], orb: [], bbolt: [], rock: [],
  enemyArrow: [], eMagic: [], enemyRock: [],
};
function _acquireProjMesh(type) {
  const pool = _projPool[type];
  if (pool && pool.length > 0) {
    const m = pool.pop();
    m.visible = true;
    m.rotation.set(0, 0, 0);   // clear orientation left over from the mesh's previous flight
    return m;
  }
  if (type === 'bolt')       return new THREE.Mesh(GEO.pBolt,   M.bolt);
  if (type === 'arrow')      return new THREE.Mesh(GEO.pArrow,  M.arrowMat);
  if (type === 'orb')        return new THREE.Mesh(GEO.pOrb,    M.orbMat);
  if (type === 'bbolt')      return new THREE.Mesh(GEO.pBBolt,  M.bBoltMat);
  if (type === 'enemyArrow') return new THREE.Mesh(GEO.pEArrow, M.enemyArrow);
  if (type === 'eMagic')     return new THREE.Mesh(GEO.pEMagic, M.orcMagicMat);
  if (type === 'enemyRock')  return new THREE.Mesh(GEO.pERock,  M.enemyRock);
  return new THREE.Mesh(GEO.pRock, M.rockMat);
}
function _releaseProjMesh(m, type) {
  scene.remove(m); m.visible = false;
  const pool = _projPool[type];
  if (pool && pool.length < 24) pool.push(m);
}
function fireProjectile(type, source, target, aoeRadius) {
  // Per-projectile audio — distinct sounds for each weapon class for instant ID by ear
  if      (type === 'bolt')  { SND.bolt();         muzzleFlash.color.setHex(0x00d4ff); muzzleFlash.intensity = 4.5; }
  else if (type === 'arrow') { SND.arrow();        muzzleFlash.color.setHex(0xffdd88); muzzleFlash.intensity = 2.0; }
  else if (type === 'orb')   { SND.mageCast();     muzzleFlash.color.setHex(0xcc55ff); muzzleFlash.intensity = 3.5; }
  else if (type === 'bbolt') { SND.ballistaShot(); muzzleFlash.color.setHex(0xddaa00); muzzleFlash.intensity = 4.0; }
  else                       { SND.catapultFire(); muzzleFlash.color.setHex(0xff8800); muzzleFlash.intensity = 5.5; }
  const projMesh = _acquireProjMesh(type);
  projMesh.castShadow = false;
  const yOff = source.type === 'tower' ? 2.45 : source.type === 'catapult' ? 1.3 : source.type === 'wall' ? 2.6
             : source.type === 'mage' ? 1.80 : source.type === 'ballista' ? 0.80 : 1.1;
  muzzleFlash.position.copy(source.group.position).setY(source.group.position.y + yOff);
  projMesh.position.copy(source.group.position).setY(source.group.position.y + yOff);
  scene.add(projMesh);
  const stat = CFG.STATS[source.type] || {};
  projectiles.push({
    mesh: projMesh, target, type,
    aoeRadius: aoeRadius || 0, alive: true,
    speed: source.pSpeed || stat.pSpeed || 8,
    dmg: source.dmg || stat.dmg || 1,
    sourceType: source.type,
    sourceDef: source,
    slowOnHit: source.type === 'mage' ? { duration: 2.5, amount: 0.4 } : null,
    pierceCount: source.type === 'ballista' ? 2 : 0,
    piercedTargets: source.type === 'ballista' ? new Set() : null,
    _prevX: projMesh.position.x, _prevZ: projMesh.position.z,
  });
}

// AoE splash: damage every live orc within `radius` of `center`, excluding `primary`
// (which already took the direct hit). Awards kill pips to `sourceDef`. Shared by
// direct catapult/wall hits and the last-position detonation path.
function _projectileSplash(center, radius, dmg, sourceDef, primary) {
  const r2 = radius * radius;
  for (const o of orcs) {
    if (!o.alive || o === primary) continue;
    if (o.group.position.distanceToSquared(center) >= r2) continue;
    dealDamage(o, dmg);
    if (!o.alive && sourceDef) { sourceDef.kills = (sourceDef.kills || 0) + 1; updateKillPips(sourceDef); }
  }
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (!p.alive) {
      // Both player and enemy projectiles flow through the same pool now.
      _releaseProjMesh(p.mesh, p.type);
      projectiles.splice(i, 1); continue;
    }

    // ── Resolve aim point (no per-frame allocation; reuses module temps) ──
    // If a homing target dies mid-flight but this is a player AoE shot, coast to the
    // target's last-known position and still detonate there — fixes catapult/wall splash
    // shots "fizzling" in mid-air when their primary target dies just before impact.
    const aimAlive = !!(p.target && p.target.alive);
    if (aimAlive) {
      const yAim = p.isEnemyProjectile ? 0.8 : (0.8 * (p.target.scale || 1));
      const tp = p.target.group.position;
      _projTgt.set(tp.x, tp.y + yAim, tp.z);
      p._lx = _projTgt.x; p._ly = _projTgt.y; p._lz = _projTgt.z;   // remember impact point
    } else if (p.aoeRadius > 0 && !p.isEnemyProjectile && p._lx !== undefined) {
      _projTgt.set(p._lx, p._ly, p._lz);
    } else {
      p.alive = false; continue;
    }
    const targetPos = _projTgt;
    const dir = _projDir.copy(targetPos).sub(p.mesh.position);
    const dist = dir.length();
    const step = p.speed * dt;

    if (dist < 0.35 || step >= dist) {
      if (p.isEnemyProjectile) {
        dealDefenderDamage(p.target, p.dmg, p.shooter);
        // AoE for enemy rocks
        if (p.aoeRadius > 0) {
          const aoeR2 = p.aoeRadius * p.aoeRadius;
          defenders.forEach(d => {
            if (d !== p.target && d.alive && d.group.position.distanceToSquared(p.mesh.position) < aoeR2) {
              dealDefenderDamage(d, Math.floor(p.dmg * 0.6), p.shooter);
            }
          });
        }
        // OrcMage curse: 40% rate reduction for 3s
        if (p.type === 'eMagic' && p.target.alive) {
          p.target.cursed = true; p.target.cursedTimer = 3.0;
          SND.curseHit();
        }
        const _eHitClr = p.type === 'eMagic' ? 0xff2200 : 0xff4400;
        spawnHitParticles(p.mesh.position.clone(), _eHitClr);
      } else {
        if (p.type === 'rock') SND.rockHit();
        // Direct hit on the primary — skipped if it died and we coasted to its last position.
        if (aimAlive) {
          dealDamage(p.target, p.dmg);
          if (!p.target.alive && p.sourceDef) { p.sourceDef.kills = (p.sourceDef.kills || 0) + 1; updateKillPips(p.sourceDef); }
          if (p.slowOnHit && p.target.alive) {           // mage orb slow debuff
            p.target.slowTimer = p.slowOnHit.duration;
            p.target.slowAmount = p.slowOnHit.amount;
            SND.magicHit();
          }
        }
        // Splash (catapult / upgraded wall) — excludes the primary, which already took a hit.
        if (p.aoeRadius > 0) {
          _projectileSplash(p.mesh.position, p.aoeRadius, p.dmg, p.sourceDef, p.target);
          spawnImpactRing(p.mesh.position, 0xff8800);
          triggerShake(0.3);
        }
        spawnHitParticles(p.mesh.position.clone(),
          p.type === 'bolt'  ? 0x00d4ff :
          p.type === 'orb'   ? 0xcc55ff :
          p.type === 'bbolt' ? 0xddaa00 :
          p.type === 'rock'  ? 0x888898 : 0xd4a070);
        // Ballista piercing — only when we actually struck a live target; find the next
        // enemy roughly along the bolt's heading and re-aim.
        if (p.pierceCount > 0 && aimAlive) {
          p.piercedTargets.add(p.target);
          p.pierceCount--;
          const fwdLen = Math.sqrt(dir.x*dir.x + dir.z*dir.z) || 1;
          const fwdX = dir.x / fwdLen, fwdZ = dir.z / fwdLen;
          let nextTarget = null, bestDot = -Infinity;
          for (const o of orcs) {
            if (!o.alive || p.piercedTargets.has(o)) continue;
            const ox = o.group.position.x - p.mesh.position.x;
            const oz = o.group.position.z - p.mesh.position.z;
            const d2 = ox*ox + oz*oz;
            if (d2 > 225) continue; // 15 units max
            const dot = (ox * fwdX + oz * fwdZ) / (Math.sqrt(d2) || 1);
            if (dot > 0.6 && dot > bestDot) { bestDot = dot; nextTarget = o; }
          }
          if (nextTarget) { p.target = nextTarget; continue; } // re-aim at next
        }
      }
      p.alive = false;
      continue;
    }

    dir.normalize().multiplyScalar(step);
    p.mesh.position.add(dir);

    // Wall collision — player projectiles are stopped by player-placed walls.
    // Use swept segment (prevPos → newPos) so fast projectiles can't tunnel through.
    if (!p.isEnemyProjectile) {
      const nx = p.mesh.position.x, nz = p.mesh.position.z;
      const ox = p._prevX ?? nx, oz = p._prevZ ?? nz;
      const sx = p.sourceDef ? p.sourceDef.group.position.x : ox;
      const sz = p.sourceDef ? p.sourceDef.group.position.z : oz;
      const sdx = nx - ox, sdz = nz - oz;
      const slen2 = sdx*sdx + sdz*sdz;
      for (const d of defenders) {
        if (!d.alive || d.type !== 'wall') continue;
        // Skip walls within 1.5 units of the shooter (don't self-block)
        const dsx = d.col - sx, dsz = d.row - sz;
        if (dsx*dsx + dsz*dsz < 2.25) continue;
        // Closest point on movement segment to wall center
        let closeDist2;
        if (slen2 < 0.0001) {
          const ex = nx - d.col, ez = nz - d.row;
          closeDist2 = ex*ex + ez*ez;
        } else {
          const wx = d.col - ox, wz = d.row - oz;
          const t = Math.max(0, Math.min(1, (wx*sdx + wz*sdz) / slen2));
          const cx = ox + t*sdx - d.col, cz = oz + t*sdz - d.row;
          closeDist2 = cx*cx + cz*cz;
        }
        if (closeDist2 < 0.6*0.6) { p.alive = false; break; }
      }
      p._prevX = nx; p._prevZ = nz;
      if (!p.alive) continue;
    }

    if (p.type === 'arrow' || p.type === 'enemyArrow' || p.type === 'bbolt') {
      // Orient tip toward target along the Z-axis
      p.mesh.lookAt(targetPos);
    } else if (p.type === 'orb' || p.type === 'eMagic') {
      p.mesh.rotation.x += dt * 4;
      p.mesh.rotation.y += dt * 5;
      p.mesh.rotation.z += dt * 3;
    } else {
      p.mesh.rotation.x += dt * 8;
      p.mesh.rotation.y += dt * 6;
    }
  }
}

function dealDamage(orc, dmg, attacker = null) {
  if (!orc.alive) return;
  const _dmg = lastStandActive ? dmg * 3 : dmg;
  orc.hp -= _dmg;
  window._testOnEnemyDamaged?.(orc, _dmg);
  spawnDmgPopup(_dmg, posAbove(orc.group.position, 1.4));
  orc.hitFlashTimer = 0.14;
  orc.hitRecoilT = 1.0;
  orc.hitRecoilDir = (Math.random() < 0.5) ? 1 : -1;
  orc.hitLeanX = -0.20; // backward lean-away from impact
  orc.hitFlashMeshes.forEach(m => {
    if (!m.userData.origEmissive) {
      // Clone material(s) so this enemy's flash doesn't affect all others of the same type
      if (Array.isArray(m.material)) {
        m.material = m.material.map(mat => mat.clone());
        m.userData.origEmissive = m.material[0].emissive ? m.material[0].emissive.clone() : new THREE.Color(0);
      } else {
        m.material = m.material.clone();
        m.userData.origEmissive = m.material.emissive ? m.material.emissive.clone() : new THREE.Color(0);
      }
    }
    _forMats(m, mat => { if (mat.emissive) mat.emissive.set(0xff2200); mat.emissiveIntensity = 2.2; });
  });
  // Full-body flash: lazily clone and flash every remaining voxel mesh on this enemy
  if (!orc._extraFlashReady) {
    orc._extraFlashReady = true;
    const extra = [];
    orc.group.traverse(child => {
      if (!child.isMesh || child.material?.isMeshBasicMaterial) return;
      if (orc.hitFlashMeshes.includes(child)) return;
      if (Array.isArray(child.material)) {
        child.material = child.material.map(m => m.clone());
        child.userData.origEmissive = child.material[0].emissive?.clone() ?? new THREE.Color(0);
      } else {
        child.material = child.material.clone();
        child.userData.origEmissive = child.material.emissive?.clone() ?? new THREE.Color(0);
      }
      extra.push(child);
    });
    orc._extraFlashMeshes = extra;
  }
  if (orc._extraFlashMeshes) {
    orc._extraFlashMeshes.forEach(m => {
      _forMats(m, mat => { if (mat.emissive) mat.emissive.set(0xff2200); mat.emissiveIntensity = 1.0; });
    });
  }
  if (orc.hp > 0) {
    SND.enemyHit();
    const _now = Date.now();
    if (_now - (orc._lastHurtMs||0) > 350) { orc._lastHurtMs = _now; SND.hurtEnemy(orc.type); }
    // Small impact sparks — 4 cubes max, skipped when vfx queue is busy to keep budget sane
    if (vfx.length < 120) spawnHitParticles(posAbove(orc.group.position, 0.7), 0xff3300, 4);
  }
  // Counter-attack the defender that struck this enemy (skip if defDmg === 0)
  if (orc.hp > 0 && attacker?.alive) {
    const counterDmg = CFG.ORC_TYPES[orc.type]?.defDmg ?? 1;
    if (counterDmg > 0) dealDefenderDamage(attacker, counterDmg);
    // Melee hit → immediately snap into fight state so enemy turns to engage the attacker.
    // Skip if castle-attacking (that block never reaches fightingDefender handler).
    if (!orc.attackingCastle &&
        (attacker.type === 'knight' || attacker.type === 'swordsman' || attacker.type === 'spearman')) {
      const curF = orc.fightingDefender;
      const curIsMelee = curF && (curF.type === 'knight' || curF.type === 'swordsman' || curF.type === 'spearman');
      if (!curIsMelee) {
        if (curF) releaseAttackSlot(curF, orc);
        orc.attackSlot       = acquireAttackSlot(attacker, orc);
        orc.fightingDefender = attacker;
        orc.chasingDefender  = null;
        orc.defAttackTimer   = 0;
        orc.swingPhase = 0; orc.swingHit = false; orc.swingDamageReady = false;
      }
    }
  }
  if (orc.hp <= 0) {
    if (attacker) { attacker.kills = (attacker.kills || 0) + 1; updateKillPips(attacker); }
    if (orc.fightingDefender) { releaseAttackSlot(orc.fightingDefender, orc); orc.fightingDefender = null; orc.attackSlot = -1; }
    orc.alive = false;
    orc.dying = true;
    orc.deathTimer = 0;
    orc.deathDir = Math.random() < 0.5 ? 1 : -1;
    if (orc.hpBar) { orc.hpBar.bg.visible = false; orc.hpBar.fg.visible = false; }
    SND.dieEnemy(orc.type);
    kills++;
    // Achievements: lifetime kill count + boss-killed flags
    _bumpStat('kills', 1);
    if (orc.isLevelBoss) {
      _unlockAchievement('bossKill');
      // Flawless: no defender deaths during this wave AND boss is now dead
      if (waveDefDeaths === 0) _unlockAchievement('flawlessBoss');
    }
    gold += orc.reward;
    _runStats.goldEarned += orc.reward;
    SND.goldGain();  // throttled — coin tinkle on reward
    window._testOnEnemyKilled?.(orc);
    updateHUD();
    spawnGoldPopup(orc.reward, posAbove(orc.group.position, 1.2));
    // Themed death particles — colour keyed to enemy type for instant read
    const _deathColor = { skeleton: 0xddddb0, wolf: 0x99889a,
      spider: 0x440011, troll: 0x4aaa00, boss: 0x9900dd, orcMage: 0xdd2200,
      cyclops: 0xcc7700, exploder: 0xff5500, healerOrc: 0x44ff88 }[orc.type] ?? 0x44bb22;
    spawnHitParticles(posAbove(orc.group.position, 0.8), _deathColor);
    spawnVoxelDebris(orc.group);
    // Spider: leave a web zone that slows enemies passing through.
    // Built as a real web shape (radial spokes + concentric rings) so it reads as
    // "spider silk" instead of a generic white circle. All meshes share one material
    // so opacity fade-out still updates with a single assignment.
    if (orc.type === 'spider') {
      const wPos = orc.group.position.clone();
      const wMat = new THREE.MeshBasicMaterial({ color: 0xd8e0e6, transparent: true, opacity: 0.55, depthWrite: false });
      const wGroup = new THREE.Group();
      // Concentric rings at increasing radii
      const rings = [[0.32, 0.36], [0.66, 0.70], [1.00, 1.04], [1.32, 1.36]];
      for (const [inner, outer] of rings) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 22), wMat);
        ring.rotation.x = -Math.PI / 2;
        wGroup.add(ring);
      }
      // 8 radial spokes through the centre
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 2.74), wMat);
        spoke.rotation.y = angle;
        spoke.position.y = 0.01;
        wGroup.add(spoke);
      }
      wGroup.position.set(wPos.x, 0.02, wPos.z);
      scene.add(wGroup);
      webZones.push({ mesh: wGroup, mat: wMat, pos: wPos, timer: 8.0, radius: 1.4 });
    }
    // Red enemy detonation: exploder, orcMage, and the Flame Tyrant boss all detonate on death.
    // Read from the orc itself first (per-unit overrides like level-boss explosions) then fall back
    // to the enemy-type CFG defaults.
    const _eTypeCfg = CFG.ORC_TYPES[orc.type];
    const _explodes = (_eTypeCfg?.explodesOnDeath) || orc.explodesOnDeath;
    if (_explodes) {
      const epos = orc.group.position.clone();
      const eRadius = orc.explodeRadius ?? _eTypeCfg?.explodeRadius ?? 2.5;
      const eDmg    = orc.explodeDmg    ?? _eTypeCfg?.explodeDmg    ?? 6;
      orcs.forEach(other => {
        if (other !== orc && other.alive && other.group.position.distanceTo(epos) < eRadius)
          dealDamage(other, eDmg);
      });
      defenders.forEach(d => {
        if (d.alive && d.group.position.distanceTo(epos) < eRadius)
          dealDefenderDamage(d, eDmg);
      });
      spawnImpactRing(epos, 0xff6600);
      spawnHitParticles(epos.clone().setY(epos.y + 0.5), 0xff8800);
      // Bigger radius → beefier shake (capped) so boss detonation feels meatier than a lone exploder
      triggerShake(Math.min(0.9, 0.35 + eRadius * 0.08));
      SND.explode();
    }
    // Feature 7: kill streak
    const now = Date.now();
    if (now - lastKillTime < 2000) streakCount++; else streakCount = 1;
    lastKillTime = now;
    if (streakCount >= 5) {
      const bonus = 5 + streakCount;
      gold += bonus;
      _runStats.goldEarned += bonus;
      spawnGoldPopup(bonus, posAbove(orc.group.position, 2.1));
      if (streakCount % 5 === 0) showTooltip(`🔥 ${streakCount} KILL STREAK! +${bonus}🟡`, 1500);
    }
  }
}

function dealDefenderDamage(def, dmg, attacker = null) {
  if (!def || !def.alive) return;
  if (attacker?.type) SND.enemyAttack(attacker.type);
  def.hp -= dmg;
  // Let melee defenders remember who's hitting them so they can fight back
  if (attacker && (def.type === 'knight' || def.type === 'spearman' || def.type === 'swordsman')) {
    def.attackedBy = attacker;
    // Immediately counter-attack the attacker
    if (def.alive && def.hp > 0 && attacker.alive) {
      const counterDmg = CFG.STATS[def.type]?.dmg || 1;
      dealDamage(attacker, counterDmg);
    }
  }
  // Skeleton: apply venom sting — poisons defender for 4s
  if (attacker?.type === 'skeleton' && def.type !== 'wall' && def.type !== 'spiketrap') {
    def.poisonTimer = 4.0;
    def.poisonDps   = 0.8; // damage per second
  }
  // Hit flash + stagger
  def.hitFlashTimer = 0.14;
  def.hitRecoilT    = 1.0;
  def.hitRecoilDir  = (Math.random() < 0.5) ? 1 : -1;
  if (!def.hitFlashMeshes) {
    def.hitFlashMeshes = [];
    def.group.traverse(c => {
      if (c.isMesh) {
        if (Array.isArray(c.material)) {
          c.material = c.material.map(mat => mat.clone());
          c.userData.origEmissive = c.material[0].emissive ? c.material[0].emissive.clone() : new THREE.Color(0);
          c.userData.origColor = null;
        } else {
          c.material = c.material.clone();
          c.userData.origEmissive = c.material.emissive ? c.material.emissive.clone() : new THREE.Color(0);
          c.userData.origColor = c.material.color ? c.material.color.clone() : null;
        }
        def.hitFlashMeshes.push(c);
      }
    });
  }
  def.hitFlashMeshes.forEach(m => {
    _forMats(m, mat => { if (mat.emissive) mat.emissive.set(0xff2200); mat.emissiveIntensity = 1.8; });
  });
  // Progressively darken building stone as it takes damage
  const isBuilding = def.type === 'wall' || def.type === 'tower' || def.type === 'catapult';
  if (isBuilding) {
    const pct = Math.max(0, def.hp / def.maxHp);
    const darken = 1 - (1 - pct) * 0.62;
    def.hitFlashMeshes.forEach(m => {
      if (m.userData.origColor) m.material.color.copy(m.userData.origColor).multiplyScalar(darken);
    });
  }
  if (def.hpBar) {
    const pct = Math.max(0, def.hp / def.maxHp);
    def.hpBar.fg.scale.x = pct;
    def.hpBar.fg.position.x = (pct - 1) * 0.325;
    def.hpBar.fg.material.color.setHSL(pct * 0.33, 1.0, 0.5);
  }
  if (def.hp > 0 && !isBuilding) {
    const _dn = Date.now();
    if (_dn - (def._lastHurtMs||0) > 350) { def._lastHurtMs = _dn; SND.hurtDefender(def.type); }
  }
  if (def.hp <= 0) {
    def.alive = false;
    def.dying = true;
    def.deathTimer = 0;
    def._deathStartMs = performance.now();
    def.deathDir = Math.random() < 0.5 ? 1 : -1;
    if (def.hpBar) { def.hpBar.bg.visible = false; def.hpBar.fg.visible = false; }
    if (def.type === 'wall')                              { SND.wallCrumble(); _rebuildWallCache(); }
    else if (def.type === 'tower' || def.type === 'catapult') SND.towerFall();
    else                                                      SND.dieDefender(def.type);
    if (def.type !== 'wall') waveDefDeaths++;
    // If tower dies, also kill its stationed archer
    occupied.delete(`${def.col},${def.row}`);
    spawnHitParticles(posAbove(def.group.position, 1), 0xff6600);
    window._testOnDefenderKilled?.(def);
  }
}

function findClosestDefender(pos, range) {
  let best = null, bestD2 = range * range;
  for (const d of defenders) {
    if (!d.alive || d.type === 'wall') continue;
    const d2 = pos.distanceToSquared(d.group.position);
    if (d2 <= bestD2) { best = d; bestD2 = d2; }
  }
  return best;
}

function fireEnemyArrow(orc, defender) {
  SND.enemyArrow();
  const m = _acquireProjMesh('enemyArrow');
  m.position.copy(orc.group.position).setY(orc.group.position.y + 1.1 * orc.scale);
  scene.add(m);
  const dmg = CFG.ORC_TYPES[orc.type].shootDmg || 1;
  projectiles.push({ mesh: m, target: defender, type: 'enemyArrow',
    aoeRadius: 0, alive: true, speed: 11, dmg, isEnemyProjectile: true, shooter: orc });
}

function fireEnemyMagic(orc, defender) {
  SND.enemyArrow();
  const m = _acquireProjMesh('eMagic');
  m.position.copy(orc.group.position).setY(orc.group.position.y + 1.6 * orc.scale);
  scene.add(m);
  const dmg = CFG.ORC_TYPES[orc.type].shootDmg || 3;
  projectiles.push({ mesh: m, target: defender, type: 'eMagic',
    aoeRadius: 0, alive: true, speed: 8, dmg, isEnemyProjectile: true, shooter: orc });
}

function fireEnemyRock(orc, defender) {
  SND.enemyRock();
  const m = _acquireProjMesh('enemyRock');
  m.position.copy(orc.group.position).setY(orc.group.position.y + 1.5 * orc.scale);
  scene.add(m);
  const dmg = CFG.ORC_TYPES[orc.type].shootDmg || 3;
  const aoe = CFG.ORC_TYPES[orc.type].aoe || 0;
  projectiles.push({ mesh: m, target: defender, type: 'enemyRock',
    aoeRadius: aoe, alive: true, speed: 7, dmg, isEnemyProjectile: true, shooter: orc });
}

// ─────────────────────────────────────────────
//  UPDATE DEFENDERS
// ─────────────────────────────────────────────
// Reused per-frame buffer of walking soldiers used by the per-soldier separation loop.
// Avoids re-filtering all defenders + per-iteration type check for every soldier every frame.
const _walkingSoldiers = [];

function updateDefenders(dt, t) {
  // Refresh the walking-soldier buffer once per frame — this is the input to the separation
  // loop inside _walk, which used to iterate every defender and filter by type each pass.
  _walkingSoldiers.length = 0;
  for (const d of defenders) {
    if (!d.alive) continue;
    const dt_ = d.type;
    if (dt_ === 'knight' || dt_ === 'swordsman' || dt_ === 'spearman' || dt_ === 'archer') {
      _walkingSoldiers.push(d);
    }
  }
  // Animate dying defenders, then remove them
  for (let i = defenders.length - 1; i >= 0; i--) {
    const d = defenders[i];
    if (!d.alive) {
      if (!d.dying) {
        if (d._rallyMarker) { scene.remove(d._rallyMarker); d._rallyMarker = null; }
        scene.remove(d.group); disposeGroup(d.group); defenders.splice(i, 1); continue;
      }
      d.deathTimer = d._deathStartMs ? (performance.now() - d._deathStartMs) / 1000 : d.deathTimer + dt;
      const isSoldier = d.type === 'knight' || d.type === 'swordsman' || d.type === 'spearman' || d.type === 'archer';
      const TOTAL = isSoldier ? 0.70 : 0.55;
      const f = Math.min(1, d.deathTimer / TOTAL);
      if (isSoldier) {
        // Soldiers fall sideways and sink into ground
        d.group.rotation.z = d.deathDir * f * (Math.PI / 2);
        d.group.position.y = -f * 0.35;
      } else {
        // Wall / tower / catapult: burst crumble particles then vanish
        if (!d.crumbleSpawned) { d.crumbleSpawned = true; spawnCrumbleParticles(d.group.position); }
        d.group.scale.setScalar(Math.max(0, 1 - d.deathTimer * 7));
      }
      if (d.deathTimer >= TOTAL) {
        if (d._rallyMarker) { scene.remove(d._rallyMarker); d._rallyMarker = null; }
        scene.remove(d.group); disposeGroup(d.group); defenders.splice(i, 1);
      }
    }
  }

  for (const d of defenders) {
    if (!d.alive) continue;

    if (d.animScale < 1) {
      // Use real elapsed time so spawn animation works even when game is paused
      d.animScale = Math.min(1, (performance.now() - d.spawnTime) / 350);
      const s = easeOutBounce(d.animScale);
      d.group.scale.set(s, s, s);
    }

    updateDefHit(d, dt); // flash + stagger — runs for ALL types before any continue

    if (d.type === 'wall') {
      // Subtle idle breathing — tells the player the block is watchful, not dead.
      // Value kept tiny (≤0.014u) so it whispers rather than jitters.
      d._idleTime = (d._idleTime || 0) + dt;
      if ((d.hitRecoilT || 0) <= 0) {
        d.group.position.y = Math.abs(Math.sin(d._idleTime * 0.55 + d.col * 0.3)) * 0.014;
      }
      continue;
    }

    // ── ACTIVE MELEE STATE MACHINE (knight / swordsman / spearman) ──────────────────
    if (d.type === 'knight' || d.type === 'swordsman' || d.type === 'spearman') {
      if (!d.state) d.state = 'idle';
      d.idleTime += dt * 1.5;
      if (d.cooldown > 0) d.cooldown -= dt * (hasteWaves > 0 ? 1.3 : 1.0);
      if (d.attackedBy && !d.attackedBy.alive) d.attackedBy = null;

      // Target died → find next or go home
      if (d.chaseTarget && !d.chaseTarget.alive) {
        d.chaseTarget = null;
        if (d.state === 'chasing' || d.state === 'fighting') {
          d.chaseTarget = findClosestOrc(d.group.position, 6.0) || null;
          d.state = d.chaseTarget ? 'chasing' : 'returning';
        }
      }

      // Attacked while idle → immediately engage attacker
      if (d.attackedBy?.alive && (d.state === 'idle' || d.state === 'returning')) {
        d.chaseTarget = d.attackedBy; d.state = 'chasing';
      }

      // Shared walk helper — moves d.group toward (dx,dz) delta and plays walk anim
      const _walk = (dx, dz) => {
        // Freeze movement during hit-reaction; stagger rotation is handled by updateDefHit
        if ((d.hitRecoilT || 0) > 0) return;
        const len = Math.sqrt(dx*dx + dz*dz) || 1;
        // Per-type walk speed: knight in plate trudges (2.3), spearman medium (2.7), swordsman agile (3.0)
        const baseSpd = d.type === 'knight' ? 2.3 : d.type === 'spearman' ? 2.7 : 3.0;
        const spd = baseSpd * dt;
        d.group.position.x += (dx / len) * spd;
        d.group.position.z += (dz / len) * spd;
        // Collide with trees, rocks, and buildings
        pushFromStatics(d.group.position, 0.32);
        pushFromBuildings(d.group.position, 0.32, d);
        // Push apart from other walking soldiers — iterates pre-filtered _walkingSoldiers
        // (built once per frame in updateDefenders) so we skip the per-iteration type check.
        const minD = 0.62;
        const minD2 = minD * minD;
        for (let si = 0; si < _walkingSoldiers.length; si++) {
          const other = _walkingSoldiers[si];
          if (other === d) continue;
          const odx = d.group.position.x - other.group.position.x;
          const odz = d.group.position.z - other.group.position.z;
          const od2 = odx * odx + odz * odz;
          if (od2 < minD2 && od2 > 0.0001) {
            const od = Math.sqrt(od2);
            d.group.position.x += (odx / od) * (minD - od) * 0.5;
            d.group.position.z += (odz / od) * (minD - od) * 0.5;
          }
        }
        d.group.rotation.y = Math.atan2(dx, dz);
        // Knight adopts heavier forward lean; swordsman stays springy, spearman middle
        d.group.rotation.x = d.type === 'knight' ? 0.13 : 0.09;
        // Gait frequency tracks walk speed — slower legs for knight, quicker for swordsman
        const s  = d.idleTime * (5.5 * (baseSpd / 2.8));
        const ss = Math.sin(s);
        const sc = Math.cos(s * 0.5);
        d.group.rotation.z = sc * 0.058;                        // hip rock at half gait frequency
        d.group.position.y = ss * ss * 0.12;                    // quadratic — weight on ground, quick lift
        if (d.legL) { d.legL.position.y = 0.28 + ss*0.16; d.legL.rotation.x =  ss*0.62; d.legL.rotation.z =  ss*0.05; }
        if (d.legR) { d.legR.position.y = 0.28 - ss*0.16; d.legR.rotation.x = -ss*0.62; d.legR.rotation.z = -ss*0.05; }
        // Type-specific arm behaviour during walk
        if (d.type === 'knight') {
          // Shield arm held semi-firm; sword arm pumps strongly
          if (d.armL) { d.armL.rotation.x =  ss*0.42; d.armL.rotation.z =  0.28 + sc*0.07; }
          if (d.armR) { d.armR.rotation.x = -ss*0.84; d.armR.rotation.z = -sc*0.11; }
        } else if (d.type === 'spearman') {
          // Spear arm held upright and forward; off-hand pumps
          if (d.armL) { d.armL.rotation.x =  ss*0.85; d.armL.rotation.z =  sc*0.10; }
          if (d.armR) { d.armR.rotation.x = -0.28 - ss*0.44; d.armR.rotation.z = -sc*0.09; }
        } else {
          if (d.armL) { d.armL.rotation.x =  ss*0.80; d.armL.rotation.z =  sc*0.11; }
          if (d.armR) { d.armR.rotation.x = -ss*0.80; d.armR.rotation.z = -sc*0.11; }
        }
      };

      // Extend attack range when unit is pressed against a building that blocks its path
      let effectiveRange = d.range;
      for (const b of defenders) {
        if (!b.alive || b === d) continue;
        if (b.type !== 'tower' && b.type !== 'catapult' && b.type !== 'wall') continue;
        const bdx = d.group.position.x - b.col, bdz = d.group.position.z - b.row;
        if (bdx*bdx + bdz*bdz < 0.9*0.9) { effectiveRange = d.range + 1.8; break; }
      }

      // Rally point: if set via the defender panel, this becomes the soldier's "home" for
      // idle stance and any return path. The spawn (col, row) is untouched — clearing the
      // rally returns them home cleanly.
      const _homeX = (d.rallyX != null) ? d.rallyX : d.col;
      const _homeZ = (d.rallyZ != null) ? d.rallyZ : d.row;

      // ── IDLE ──
      if (d.state === 'idle') {
        d.group.position.x = _homeX; d.group.position.z = _homeZ;
        d.group.rotation.x = 0;
        const breath = Math.sin(d.idleTime * 0.82);
        const ws     = Math.sin(d.idleTime * 0.50);
        const ws2    = Math.sin(d.idleTime * 0.33 + 0.8);
        const slow   = Math.sin(d.idleTime * 0.20);  // slow look-around
        const bob    = Math.sin(d.idleTime * 0.95);  // body bob frequency

        // Gentle body bob — soldier shifts weight while standing at ready
        d.group.position.y = Math.max(0, bob * 0.06);
        // Layered weight shift — more visible than before
        d.group.rotation.z = ws * 0.055 + ws2 * 0.022;
        // Slow look toward incoming path, slight head-turn
        d.group.rotation.y = -Math.PI / 2 + slow * 0.14;

        // Legs: real weight shift — one foot lifts as the other plants
        if (d.legL) { d.legL.rotation.x =  ws * 0.22; d.legL.position.y = 0.28 + ws * 0.09; }
        if (d.legR) { d.legR.rotation.x = -ws * 0.22; d.legR.position.y = 0.28 - ws * 0.09; }

        // Arms: type-specific idle stance
        const s2 = Math.sin(d.idleTime * 0.62 + 1.2);
        if (d.type === 'knight') {
          // Knight: sword raised slightly, shield arm braced high
          if (d.armL) { d.armL.rotation.x = -0.38 + breath * 0.16; d.armL.rotation.z =  0.30 + s2 * 0.10; }
          if (d.armR) { d.armR.rotation.x = -0.22 - breath * 0.14; d.armR.rotation.z = -0.18 - s2 * 0.08; }
        } else if (d.type === 'spearman') {
          // Spearman: rear hand grips shaft, forward hand guides tip upward
          if (d.armL) { d.armL.rotation.x =  0.30 + breath * 0.14; d.armL.rotation.z =  0.16 + s2 * 0.08; }
          if (d.armR) { d.armR.rotation.x = -0.55 + breath * 0.12; d.armR.rotation.z = -0.12 - s2 * 0.07; }
        } else {
          // Swordsman: sword at hip-ready, off-hand hanging relaxed
          if (d.armL) { d.armL.rotation.x = -0.22 + breath * 0.14; d.armL.rotation.z =  0.22 + s2 * 0.10; }
          if (d.armR) { d.armR.rotation.x =  0.16 - breath * 0.14; d.armR.rotation.z = -s2 * 0.10; }
        }

        const scan = findClosestOrc(d.group.position, 6.0);
        if (scan) { d.chaseTarget = scan; d.state = 'chasing'; }

      // ── CHASING ──
      } else if (d.state === 'chasing') {
        const tx = d.chaseTarget.group.position.x, tz = d.chaseTarget.group.position.z;
        const dx = tx - d.group.position.x, dz = tz - d.group.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        if (dist <= effectiveRange) { d.state = 'fighting'; }
        else { _walk(dx, dz); }

      // ── FIGHTING ──
      } else if (d.state === 'fighting') {
        const tx = d.chaseTarget.group.position.x, tz = d.chaseTarget.group.position.z;
        const dx = tx - d.group.position.x, dz = tz - d.group.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        if (dist > effectiveRange + 1.2) {
          d.state = 'chasing';
        } else {
          d.group.rotation.y = Math.atan2(dx, dz);
          if (d.cooldown <= 0) {
            if (d.type === 'knight') SND.knightSlash(); else if (d.type === 'spearman') SND.spearThrust(); else if (d.type === 'swordsman') SND.swordsmanSwing(); else SND.sword();
            dealDamage(d.chaseTarget, d.dmg, d);
            d.cooldown = 1 / d.rate;
            if (d.chaseTarget.alive) {
              // dealDamage already snapped fightingDefender; just clear stale chasingDefender
              if (!d.chaseTarget.fightingDefender) {
                d.chaseTarget.chasingDefender = null;
              } else if (d.chaseTarget.fightingDefender.type === 'tower' || d.chaseTarget.fightingDefender.type === 'catapult') {
                releaseAttackSlot(d.chaseTarget.fightingDefender, d.chaseTarget);
                d.chaseTarget.attackSlot = acquireAttackSlot(d, d.chaseTarget);
                d.chaseTarget.fightingDefender = d; d.chaseTarget.chasingDefender = null; d.chaseTarget.defAttackTimer = 0;
              }
              const kl = dist || 1;
              d.chaseTarget.group.position.x += (dx/kl)*0.12;
              d.chaseTarget.group.position.z += (dz/kl)*0.12;
              pushFromStatics(d.chaseTarget.group.position, 0.28 + 0.12 * (d.chaseTarget.scale || 1));
            }
            const cp = d.group.position.clone().lerp(d.chaseTarget.group.position, 0.6).setY(d.group.position.y + 0.9);
            spawnHitParticles(cp, 0xffee55); spawnImpactRing(cp, 0xffffaa);
            d.swingPhase = 1.0;
            d.lungeT = 1.0; d.lunge_dx = dx; d.lunge_dz = dz;
            d._lunge_baseX = d.group.position.x; d._lunge_baseZ = d.group.position.z;
          }
          // Lunge animation — XZ step only, stays on ground; cancelled during hit-reaction
          if ((d.lungeT||0) > 0) {
            d.lungeT = Math.max(0, d.lungeT - dt*6);
            if ((d.hitRecoilT || 0) <= 0) {
              const lunge = Math.sin(d.lungeT * Math.PI) * 0.30;
              const ll = Math.sqrt(d.lunge_dx*d.lunge_dx + d.lunge_dz*d.lunge_dz) || 1;
              d.group.position.x = (d._lunge_baseX ?? d.col) + (d.lunge_dx/ll)*lunge;
              d.group.position.z = (d._lunge_baseZ ?? d.row) + (d.lunge_dz/ll)*lunge;
            }
          }
          d.group.position.y = 0; // always grounded

          // Swing animation — plays in full alongside lunge
          if ((d.swingPhase||0) > 0) {
            d.swingPhase = Math.max(0, d.swingPhase - dt*3.2);
            const sw = Math.sin(d.swingPhase * Math.PI);
            if (d.type === 'knight' || d.type === 'swordsman') {
              const t2raw = 1 - d.swingPhase;
              const t2 = t2raw * t2raw * (3 - 2 * t2raw); // smoothstep ease
              if (d.armR) { d.armR.rotation.x = -0.9 + t2*2.7; d.armR.rotation.z = -0.4 + t2*0.9; }
              if (d.armL) { d.armL.rotation.z = sw*0.32; }
              d.group.rotation.y += (d.swingPhase - 0.5) * 0.24;
              d.group.rotation.z = sw * 0.15;
            } else {
              // Spear parented to armR — positive rotation.x drives tip forward toward enemy
              if (d.armR) { d.armR.rotation.x = sw * 1.4; d.armR.rotation.z = sw * 0.08; }
              if (d.armL) { d.armL.rotation.x = sw * 0.55; d.armL.rotation.z = sw * 0.06; }
              d.group.rotation.x = sw * 0.22;
              d.group.rotation.z = sw * 0.10;
            }
          } else {
            d.group.rotation.z = Math.sin(d.idleTime*0.55)*0.016;
            const b2 = Math.sin(d.idleTime*0.9), s2 = Math.sin(d.idleTime*0.75+1.1);
            if (d.armL) { d.armL.rotation.x = -0.18 + b2*0.07; d.armL.rotation.z =  0.16 + s2*0.04; }
            if (d.armR) { d.armR.rotation.x =  0.12 - b2*0.07; d.armR.rotation.z = -s2*0.04; }
          }
        }

      // ── RETURNING ── (also serves rally march — destination is _homeX/_homeZ)
      } else if (d.state === 'returning') {
        const dx = _homeX - d.group.position.x, dz = _homeZ - d.group.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        if (dist < 0.15) {
          d.group.position.set(_homeX, 0, _homeZ);
          d.group.rotation.set(0, 0, 0);
          d.state = 'idle';
        } else {
          // While walking to a rally point, soldiers still aggro on close enemies — so they
          // can defend along the route. Returning soldiers without a rally do the same.
          const newTgt = findClosestOrc(d.group.position, 6.0);
          if (newTgt) { d.chaseTarget = newTgt; d.state = 'chasing'; }
          else { _walk(dx, dz); }
        }
      }
      // ── Knight shield-block pose — shield arm snaps up to cover body during hit reaction ──
      // Runs after all pose calculations so it wins over walk/idle/fighting armL values.
      if (d.type === 'knight' && ((d.hitRecoilT || 0) > 0 || (d.hitFlashTimer || 0) > 0.05)) {
        const block = Math.max((d.hitRecoilT || 0), Math.min(1, (d.hitFlashTimer || 0) * 3));
        // Shield arm raises high & across chest; sword arm tucks in
        if (d.armL) { d.armL.rotation.x = -0.38 - block * 0.75; d.armL.rotation.z = 0.30 + block * 0.70; }
        if (d.armR) { d.armR.rotation.x = -0.22 - block * 0.40; d.armR.rotation.z = -0.18 - block * 0.12; }
        d.group.rotation.x = (d.group.rotation.x || 0) - block * 0.10; // slight crouch behind shield
      }
      continue; // skip static cooldown/attack logic below
    }
    // ────────────────────────────────────────────────────────────────────────

    if (d.type === 'knight' || d.type === 'swordsman' || d.type === 'spearman' || d.type === 'archer') {
      d.idleTime += dt * 1.5;

      // Clear stale attacker reference
      if (d.attackedBy && !d.attackedBy.alive) d.attackedBy = null;

      // Keep facing last combat target (or current attacker) while on cooldown
      const facePriority = (d.attackedBy?.alive) ? d.attackedBy : d.faceTarget;
      if (facePriority && facePriority.alive) {
        const fx = facePriority.group.position.x - d.col;
        const fz = facePriority.group.position.z - d.row;
        d.group.rotation.y = Math.atan2(fx, fz);
      } else if (d.faceTarget && !d.faceTarget.alive) {
        d.faceTarget = null;
      }

      // Frame-driven lunge (steps toward enemy on strike, springs back)
      if ((d.lungeT || 0) > 0) {
        d.lungeT = Math.max(0, d.lungeT - dt * 6);
        const lunge = Math.sin(d.lungeT * Math.PI) * 0.30;
        const len = Math.sqrt(d.lunge_dx*d.lunge_dx + d.lunge_dz*d.lunge_dz) || 1;
        d.group.position.x = d.col + (d.lunge_dx / len) * lunge;
        d.group.position.z = d.row + (d.lunge_dz / len) * lunge;
      } else {
        // Idle weight shift (no lunge active)
        const wshift  = Math.sin(d.idleTime * 0.55);
        const wshift2 = Math.sin(d.idleTime * 0.33 + 0.9);
        const ibob    = Math.sin(d.idleTime * 0.95);
        d.group.position.y = Math.max(0, ibob * 0.05);
        d.group.rotation.z = wshift * 0.050 + wshift2 * 0.020;
        if (d.legL) { d.legL.rotation.x =  wshift * 0.20; d.legL.position.y = 0.28 + wshift * 0.08; }
        if (d.legR) { d.legR.rotation.x = -wshift * 0.20; d.legR.position.y = 0.28 - wshift * 0.08; }
      }

      // Archer: armL holds bow, armR draws string — both string halves animate
      if (d.type === 'archer') {
        // aimBlend: 0 = low-ready (bow at ground), 1 = on-target (bow raised and drawn)
        const archerHasTarget = d.cooldown > 0 || !!findClosestOrc(d.group.position, d.range);
        d.aimBlend = (d.aimBlend ?? 0) + ((archerHasTarget ? 1 : 0) - (d.aimBlend ?? 0)) * Math.min(1, dt * 4);
        // drawAim: tracks the draw cycle within the cooldown window
        const drawAim = d.cooldown > 0 ? Math.max(0, 1 - d.cooldown * d.rate) : 1;
        const effDraw = drawAim * d.aimBlend;
        // Bow arm: lerp from low-ready (0.65) to aimed (-0.88)
        if (d.armL) { d.armL.rotation.x = 0.65 - d.aimBlend * 1.53; d.armL.rotation.z = 0.10 * d.aimBlend; }
        // Draw arm: relaxed (0.3) → extended (-0.52) → pulled back (+0.40)
        let drawX = 0.3 + d.aimBlend * (-0.82) + effDraw * 0.92;
        if ((d.drawPhase || 0) > 0) {
          d.drawPhase = Math.max(0, d.drawPhase - dt * 6);
          drawX -= Math.sin(d.drawPhase * Math.PI) * 0.55;
        }
        if (d.armR) {
          d.armR.rotation.x = drawX;
          d.armR.rotation.z = -effDraw * 0.26; // elbow lifts as drawn
          d.armR.rotation.y =  effDraw * 0.18; // elbow swings back and out
        }
        d.group.rotation.z += effDraw * 0.05; // body leans slightly into draw
        // Bow string: midpoint pulls backward (away from enemy) as draw increases
        if (d.weapon && d.weapon.userData.strUp) {
          let strMidX = 0.07 - effDraw * 0.17; // +0.07 at rest → -0.10 fully drawn
          if ((d.drawPhase || 0) > 0) {
            strMidX += Math.sin(d.drawPhase * Math.PI) * 0.10; // release overshoot
          }
          const tipX    = 0.045;
          const strCtrX = (tipX + strMidX) * 0.5;
          const strAng  = Math.atan2(tipX - strMidX, 0.48);
          d.weapon.userData.strUp.position.x = strCtrX;
          d.weapon.userData.strUp.rotation.z =  strAng;
          d.weapon.userData.strDn.position.x = strCtrX;
          d.weapon.userData.strDn.rotation.z = -strAng;
          d.weapon.rotation.z = effDraw * 0.05; // bow limbs flex under tension
        }
        // ── Archer flinch when hit — draw fumbles, bow arm drops, body leans back ──
        if ((d.hitRecoilT || 0) > 0) {
          const flinch = Math.sin(d.hitRecoilT * Math.PI);
          // Bow arm slaps down & folds in; draw arm releases forward as the string slips
          if (d.armL) { d.armL.rotation.x = 0.65 + flinch * 0.55; d.armL.rotation.z = 0.10 + flinch * 0.38; }
          if (d.armR) { d.armR.rotation.x = 0.30 + flinch * 0.45; d.armR.rotation.z =  flinch * 0.24; d.armR.rotation.y = 0; }
          d.group.rotation.x = -flinch * 0.14;  // torso snaps back from the impact
          d.aimBlend = Math.max(0, d.aimBlend - dt * 2);  // aim is lost — recover on next shot
          d.drawPhase = 0;
        }
      } else {
        // Frame-driven sword swing / spear thrust
        if ((d.swingPhase || 0) > 0) {
          d.swingPhase = Math.max(0, d.swingPhase - dt * 3.2);
          const sw = Math.sin(d.swingPhase * Math.PI); // bell: 0→1→0
          if (d.type === 'knight' || d.type === 'swordsman') {
            const tRaw = 1 - d.swingPhase; // 0=wind-up cocked, 1=follow-through
            const t = tRaw * tRaw * (3 - 2 * tRaw); // smoothstep ease
            // Diagonal slash: arm raised-back → swings down-and-across (keeps blade from going flat)
            if (d.armR) { d.armR.rotation.x = -0.9 + t * 2.7; d.armR.rotation.z = -0.4 + t * 0.9; }
            if (d.armL) { d.armL.rotation.z = sw * 0.3; } // shield arm braces into swing
            d.group.rotation.y += (d.swingPhase - 0.5) * 0.22; // body twists: wind-up→release
          } else {
            // Spearman: positive rotation.x drives tip forward toward enemy
            if (d.armR) { d.armR.rotation.x = sw * 1.4; d.armR.rotation.z = sw * 0.08; }
            if (d.armL) { d.armL.rotation.x = sw * 0.55; d.armL.rotation.z = sw * 0.06; }
            d.group.rotation.x = sw * 0.20;
            d.group.rotation.z = sw * 0.09;
          }
        } else {
          // Arms breathe and sway out of phase with the body
          const breath2 = Math.sin(d.idleTime * 0.82);
          const sway2   = Math.sin(d.idleTime * 0.62 + 1.2);
          if (d.type === 'knight') {
            if (d.armL) { d.armL.rotation.x = -0.38 + breath2 * 0.16; d.armL.rotation.z =  0.30 + sway2 * 0.10; }
            if (d.armR) { d.armR.rotation.x = -0.22 - breath2 * 0.14; d.armR.rotation.z = -0.18 - sway2 * 0.08; }
          } else if (d.type === 'spearman') {
            if (d.armL) { d.armL.rotation.x =  0.30 + breath2 * 0.14; d.armL.rotation.z =  0.16 + sway2 * 0.08; }
            if (d.armR) { d.armR.rotation.x = -0.55 + breath2 * 0.12; d.armR.rotation.z = -0.12 - sway2 * 0.07; }
          } else {  // swordsman
            if (d.armL) { d.armL.rotation.x = -0.22 + breath2 * 0.16; d.armL.rotation.z =  0.24 + sway2 * 0.10; }
            if (d.armR) { d.armR.rotation.x =  0.18 - breath2 * 0.14; d.armR.rotation.z = -sway2 * 0.10; }
          }
        }
      }
    }

    if (d.type === 'tower' && d.crystal) {
      d._floatTime = (d._floatTime || 0) + dt;
      const target = findClosestOrc(d.group.position, d.range);
      if (target) {
        const dx = target.group.position.x - d.group.position.x;
        const dz = target.group.position.z - d.group.position.z;
        d.crystal.rotation.y = Math.atan2(dx, dz);
      } else {
        d.crystal.rotation.y += dt * 1.2;
      }
      d.crystal.position.y = d.crystal.userData.floatBase + Math.sin(d._floatTime * 2 + d.col) * 0.1;
      // Fire flash — crystal scales up briefly, base rocks back from the shot
      if ((d.firePhase || 0) > 0) {
        d.firePhase = Math.max(0, d.firePhase - dt * 4);
        const flash = Math.sin(d.firePhase * Math.PI); // bell 0→1→0
        const scl = 1 + flash * 0.28;
        if (d.crystalParts) {
          for (const p of d.crystalParts) p.scale.set(scl, scl, scl);
        }
        d.crystal.position.y += flash * 0.08;
        // Base stays anchored — no rocking/sinking on fire
      } else {
        if (d.crystalParts) {
          for (const p of d.crystalParts) { if (p.scale.x !== 1) p.scale.set(1, 1, 1); }
        }
      }
    }

    if (d.type === 'catapult') {
      const catTgt = findClosestOrc(d.group.position, d.range);
      if (catTgt) {
        const cta = Math.atan2(catTgt.group.position.x - d.group.position.x, catTgt.group.position.z - d.group.position.z);
        d.group.rotation.y += (cta - d.group.rotation.y) * Math.min(1, dt * 2.5);
      } else {
        d.scanTime = (d.scanTime || 0) + dt;
        d.group.rotation.y = Math.sin(d.scanTime * 0.35) * 0.45;
      }
      if (d.armAnim > 0) {
        d.armAnim -= dt * 3;
        if (d.armAnim < 0) d.armAnim = 0;
        d.armGroup.rotation.x = d.armAnim * Math.PI;
      }
    } else if (d.type === 'wall' && d.wallArmGroup && (d.armAnim || 0) > 0) {
      d.armAnim -= dt * 3;
      if (d.armAnim < 0) d.armAnim = 0;
      d.wallArmGroup.rotation.x = d.armAnim * Math.PI;
    }

    if (d.type === 'mage') {
      d.idleTime += dt;
      const breath = Math.sin(d.idleTime * 0.85);
      const sway   = Math.sin(d.idleTime * 0.50);
      d.group.position.y = Math.abs(Math.sin(d.idleTime * 0.4)) * 0.03;
      d.group.rotation.z = sway * 0.025;
      const mageTgt = findClosestOrc(d.group.position, d.range);
      if (mageTgt) {
        const mta = Math.atan2(mageTgt.group.position.x - d.group.position.x, mageTgt.group.position.z - d.group.position.z);
        d.group.rotation.y += (mta - d.group.rotation.y) * Math.min(1, dt * 3);
      }
      if (d.armL) { d.armL.rotation.x = breath * 0.08; d.armL.rotation.z =  0.10 + sway * 0.06; }
      // Orb + hat tip gentle pulse — always breathing
      const orbIdle = 1 + Math.sin(d.idleTime * 1.8) * 0.06;
      if (d.orbBase) d.orbBase.scale.setScalar(orbIdle);
      if (d.orbTip)  d.orbTip.scale.setScalar(orbIdle);
      if (d.hatTip)  d.hatTip.scale.setScalar(1 + Math.sin(d.idleTime * 1.6 + 1.1) * 0.08);
      if ((d.castPhase || 0) > 0) {
        d.castPhase = Math.max(0, d.castPhase - dt * 2.5);
        const cp = Math.sin(d.castPhase * Math.PI);
        if (d.armR) { d.armR.rotation.x = -0.65 * cp; d.armR.rotation.z = -0.20 * cp - sway * 0.04; }
        // Surge the orb on cast
        const orbPulse = orbIdle + cp * 0.55;
        if (d.orbBase) d.orbBase.scale.setScalar(orbPulse);
        if (d.orbTip)  d.orbTip.scale.setScalar(orbPulse);
        if (d.hatTip)  d.hatTip.scale.setScalar(1 + cp * 0.35);
      } else {
        if (d.armR) { d.armR.rotation.x = 0.12 - breath * 0.08; d.armR.rotation.z = -sway * 0.04; }
      }
    }

    if (d.type === 'ballista' && d.pivot) {
      // Slow scan when no target; snaps to target on fire
      const bTarget = findClosestOrc(d.group.position, d.range);
      if (!bTarget) {
        d.scanTime = (d.scanTime || 0) + dt;
        d.pivot.rotation.y = Math.sin(d.scanTime * 0.55) * 0.65;
      } else {
        const stx = bTarget.group.position.x - d.group.position.x;
        const stz = bTarget.group.position.z - d.group.position.z;
        const targetAngle = Math.atan2(stx, stz);
        d.pivot.rotation.y += (targetAngle - d.pivot.rotation.y) * Math.min(1, dt * 4);
      }
      // Bow flex on fire — string snaps forward, bow arms relax briefly
      if ((d.firePhase || 0) > 0) {
        d.firePhase = Math.max(0, d.firePhase - dt * 5);
        const snap = Math.sin(d.firePhase * Math.PI);        // 0→1→0 bell
        const rel  = 1 - d.firePhase;                         // 0 at fire → 1 settled
        // String snaps forward (toward +z barrel tip) then returns
        if (d.string) d.string.position.z = 0.20 + snap * 0.20;
        // Bow arms straighten forward (rotation.y) then spring back
        const flex = snap * 0.28;
        if (d.bowL) d.bowL.rotation.y = -flex;
        if (d.bowR) d.bowR.rotation.y =  flex;
      } else {
        // Settle on idle
        if (d.string && d.string.position.z !== 0.20) d.string.position.z = 0.20;
        if (d.bowL && d.bowL.rotation.y !== 0) d.bowL.rotation.y = 0;
        if (d.bowR && d.bowR.rotation.y !== 0) d.bowR.rotation.y = 0;
      }
    }

    // ── Spike trap: passive AoE slow + damage without projectiles ──
    if (d.type === 'spiketrap') {
      d._idleTime = (d._idleTime || 0) + dt;
      // Per-frame spike animation — pop up briefly when triggered, then settle
      if (d.triggerPhase > 0) {
        d.triggerPhase = Math.max(0, d.triggerPhase - dt * 3.5);
        const pop = Math.sin(d.triggerPhase * Math.PI); // bell 0→1→0
        if (d.spikeGroups) {
          for (let si = 0; si < d.spikeGroups.length; si++) {
            // Stagger each spike slightly (seed by index for varied pop)
            const offset = (si * 0.08) % 0.5;
            const localPhase = Math.max(0, d.triggerPhase - offset);
            const localPop = Math.sin(localPhase * Math.PI);
            d.spikeGroups[si].position.y = localPop * 0.18;
            d.spikeGroups[si].scale.y = 1 + localPop * 0.35;
          }
        }
      } else if (d.spikeGroups) {
        // Armed idle breathing — each spike pulses slightly out of phase.
        // Tells the player "still live, still waiting".
        for (let si = 0; si < d.spikeGroups.length; si++) {
          const phase = d._idleTime * 1.3 + si * 0.7;
          d.spikeGroups[si].scale.y = 1 + Math.sin(phase) * 0.05;
          d.spikeGroups[si].position.y = 0;
        }
      }
      const canDmg = d.cooldown <= 0;
      if (!canDmg) d.cooldown -= dt;
      let hit = false;
      const r2 = d.range * d.range;
      for (const o of orcs) {
        if (!o.alive) continue;
        if (d.group.position.distanceToSquared(o.group.position) < r2 && !_wallBlocksPath(d.group.position, o.group.position)) {
          // Spike trap slow nerfed (was 0.45) so traps don't make ballistas god-tier.
          o.slowTimer = 0.25;
          o.slowAmount = 0.28;
          if (canDmg) {
            dealDamage(o, d.dmg, d);
            if (!o.alive) { d.kills = (d.kills || 0) + 1; updateKillPips(d); }
            hit = true;
            d.triggerPhase = 1.0; // trigger the spike pop animation
            SND.spikeTrigger();
          }
        }
      }
      if (hit) d.cooldown = 1 / d.rate;
      continue;
    }

    const _rateScale = (hasteWaves > 0 ? 1.3 : 1.0) * (d.cursed ? 0.6 : 1.0);
    if (d.cooldown > 0) { d.cooldown -= dt * _rateScale; continue; }
    if (d.type === 'wall' && (d.level || 1) < 2) continue; // non-upgraded walls don't shoot

    // For melee defenders: fight back the enemy currently hitting us first, else closest
    let closest;
    if ((d.type === 'knight' || d.type === 'swordsman' || d.type === 'spearman') && d.attackedBy?.alive) {
      const _atkMax = d.range * 1.4;
      const atkDist2 = d.group.position.distanceToSquared(d.attackedBy.group.position);
      closest = (atkDist2 <= _atkMax * _atkMax && !_wallBlocksPath(d.group.position, d.attackedBy.group.position))
        ? d.attackedBy : findClosestOrc(d.group.position, d.range);
    } else {
      closest = findClosestOrc(d.group.position, d.range);
    }
    if (!closest) continue;

    if (d.type === 'tower') {
      fireProjectile('bolt', d, closest);
      d.cooldown = 1 / d.rate;
      d.firePhase = 1.0; // crystal flash-pulse
    } else if (d.type === 'catapult') {
      fireProjectile('rock', d, closest, d.aoe);
      d.armAnim = 1;
      d.cooldown = 1 / d.rate;
    } else if (d.type === 'archer') {
      fireProjectile('arrow', d, closest);
      d.cooldown = 1 / d.rate;
      const adx = closest.group.position.x - d.group.position.x;
      const adz = closest.group.position.z - d.group.position.z;
      d.group.rotation.y = Math.atan2(adx, adz);
      d.drawPhase = 1.0; // trigger bow-draw animation
    } else if (d.type === 'mage') {
      fireProjectile('orb', d, closest);
      d.cooldown = 1 / d.rate;
      const mdx = closest.group.position.x - d.group.position.x;
      const mdz = closest.group.position.z - d.group.position.z;
      d.group.rotation.y = Math.atan2(mdx, mdz);
      d.castPhase = 1.0;
    } else if (d.type === 'ballista') {
      fireProjectile('bbolt', d, closest);
      d.cooldown = 1 / d.rate;
      const bdx = closest.group.position.x - d.group.position.x;
      const bdz = closest.group.position.z - d.group.position.z;
      if (d.pivot) d.pivot.rotation.y = Math.atan2(bdx, bdz);
      d.firePhase = 1.0; // bow/string snap-forward
    } else if (d.type === 'wall' && d.level >= 2) {
      if (d.level === 2) {
        fireProjectile('arrow', d, closest);
        d.cooldown = 1 / d.rate;
        if (d.upgradeVisual) {
          const adx = closest.group.position.x - d.group.position.x;
          const adz = closest.group.position.z - d.group.position.z;
          d.upgradeVisual.rotation.y = Math.atan2(adx, adz);
        }
      } else {
        fireProjectile('rock', d, closest, d.aoe);
        d.armAnim = 1;
        d.cooldown = 1 / d.rate;
      }
    } else if (d.type === 'knight' || d.type === 'swordsman' || d.type === 'spearman') {
      if (d.type === 'knight') SND.knightSlash(); else if (d.type === 'spearman') SND.spearThrust(); else SND.swordsmanSwing();
      dealDamage(closest, d.dmg, d);
      if (!closest.alive) { d.kills = (d.kills || 0) + 1; updateKillPips(d); }
      d.cooldown = 1 / d.rate;
      // dealDamage already handles the snap-to-fight for non-castle, non-wall-blocked enemies.
      // This block handles the remaining cases: override tower/catapult targets, and clear chasingDefender.
      if (closest.alive) {
        if (closest.fightingDefender &&
            (closest.fightingDefender.type === 'tower' || closest.fightingDefender.type === 'catapult')) {
          releaseAttackSlot(closest.fightingDefender, closest);
          closest.attackSlot       = acquireAttackSlot(d, closest);
          closest.fightingDefender = d;
          closest.chasingDefender  = null;
          closest.defAttackTimer   = 0;
        } else if (!closest.fightingDefender) {
          closest.chasingDefender = null; // dealDamage set fightingDefender; clear stale chase
        }
      }
      const dx = closest.group.position.x - d.group.position.x;
      const dz = closest.group.position.z - d.group.position.z;
      d.group.rotation.y = Math.atan2(dx, dz);
      d.faceTarget = closest;
      // Frame-driven swing + lunge — no setTimeout
      d.swingPhase = 1.0;
      d.lungeT     = 1.0;
      d.lunge_dx   = dx;
      d.lunge_dz   = dz;
      // Clash VFX at contact midpoint
      const clashPos = d.group.position.clone().lerp(closest.group.position, 0.6).setY(d.group.position.y + 0.9);
      spawnHitParticles(clashPos, 0xffee55);
      spawnImpactRing(clashPos, 0xffffaa);
      // Tiny knockback jolt on struck enemy
      if (closest.alive) {
        const kLen = Math.sqrt(dx*dx + dz*dz) || 1;
        closest.group.position.x += (dx / kLen) * 0.12;
        closest.group.position.z += (dz / kLen) * 0.12;
      }
    }
  }
}

// Push a world-space position out of trees/rocks (modifies pos in-place)
function pushFromStatics(pos, unitR) {
  for (const obs of staticObstacles) {
    const dx = pos.x - obs.x, dz = pos.z - obs.z;
    const d2 = dx * dx + dz * dz;
    const minD = unitR + obs.r;
    if (d2 < minD * minD && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      pos.x += (dx / d) * (minD - d);
      pos.z += (dz / d) * (minD - d);
    }
  }
}

// Push a world-space position out of placed buildings (towers, catapults, walls)
// Returns true when the attacker is close enough for its weapon to reach the target.
// Uses direct centre-to-centre distance so it is reliable regardless of facing jitter.
function weaponInRange(attacker, target, reach) {
  const r = (reach != null ? reach : (0.75 + 0.3 * (attacker.scale || 1))) + 1.2;
  const dx = target.group.position.x - attacker.group.position.x;
  const dz = target.group.position.z - attacker.group.position.z;
  return (dx * dx + dz * dz) <= r * r;
}

function pushFromBuildings(pos, unitR, skipDef = null) {
  for (const def of defenders) {
    if (!def.alive) continue;
    if (def.type !== 'tower' && def.type !== 'catapult' && def.type !== 'wall') continue;
    const dx = pos.x - def.col, dz = pos.z - def.row;
    const d2 = dx * dx + dz * dz;
    // Target being chased/attacked (skipDef) uses a tight 0.48 radius — enough to keep
    // the orc outside the actual 1-tile mesh during lunge animations, but close enough
    // for melee attacks to still land. Other buildings use 0.56 for a comfortable buffer.
    const buildRadius = (def === skipDef) ? 0.48 : 0.56;
    const minD = unitR + buildRadius;
    if (d2 < minD * minD && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      pos.x += (dx / d) * (minD - d);
      pos.z += (dz / d) * (minD - d);
    }
  }
}

function findClosestOrc(pos, range) {
  let best = null, bestD2 = range * range;
  for (const o of orcs) {
    if (!o.alive) continue;
    const d2 = pos.distanceToSquared(o.group.position);
    if (d2 <= bestD2 && !_wallBlocksPath(pos, o.group.position)) { best = o; bestD2 = d2; }
  }
  return best;
}

// ─────────────────────────────────────────────
//  VFX
// ─────────────────────────────────────────────
function spawnHitParticles(pos, color, count) {
  count = count ?? (9 + Math.floor(Math.random() * 5));
  for (let i = 0; i < count; i++) {
    const pMesh = new THREE.Mesh(GEO.particle, new THREE.MeshBasicMaterial({ color: color || 0x00d4ff }));
    pMesh.position.copy(pos);
    scene.add(pMesh);
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 6,
      Math.random() * 5.5 + 1.5,
      (Math.random() - 0.5) * 6
    );
    vfx.push({ mesh: pMesh, vel, life: 0.65, maxLife: 0.65, isParticle: true });
  }
}

// ─────────────────────────────────────────────
//  CASTLE-HIT HANDLER (extracted)
//  Used by all four enemy-castle-impact branches. Single source of truth for
//  HP damage + crumble FX + Last Stand trigger + game over.
// ─────────────────────────────────────────────
function _handleCastleHit(o) {
  const wasInLastStand = lastStandActive;
  if (!testMode || castleSceneActive) {
    castleHp = Math.max(0, castleHp - o.castleDmg);
    updateHUD();
    updateCastleHPBar();
    updateCastleHPMesh();
  }
  spawnCrumbleParticles(o.group.position.clone().add(_tmpV3a.set(0.6, 0.5, 0)));
  o.alive = false;
  window._testOnEnemyEscaped?.(o);
  // While in last-stand, every subsequent hit deserves a bigger shake than normal —
  // it's the climactic moment, and visual escalation helps the player feel the danger.
  if (wasInLastStand) triggerShake(0.95);
  if (castleHp <= 0) {
    if (!lastStandActive && defenders.some(d => d.alive && d.type !== 'wall')) {
      lastStandActive = true;
      lastStandTimer = 30;
      castleHp = 1;
      updateCastleHPBar();
      updateCastleHPMesh();
      elLastStand?.classList.add('active');
      elLastStandTimer?.classList.add('active');
      showTooltip('⚔️ LAST STAND! 30 seconds, defenders deal 3× damage!', 4500);
      triggerShake(1.2);
    } else if (!lastStandActive && !testMode) {
      triggerGameOver();
    }
  }
}

function spawnCrumbleParticles(pos) {
  const colors = [0x8899aa, 0x6677aa, 0x99aabb, 0x556677, 0xaabbcc, 0x445566];
  const count = 22 + Math.floor(Math.random() * 10);
  for (let i = 0; i < count; i++) {
    const size = 0.07 + Math.random() * 0.28;
    const geo = new THREE.BoxGeometry(size, size * (0.6 + Math.random() * 0.8), size * (0.7 + Math.random() * 0.6));
    const col = colors[Math.floor(Math.random() * colors.length)];
    const pMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col }));
    pMesh.position.set(
      pos.x + (Math.random() - 0.5) * 0.9,
      pos.y + 0.3 + Math.random() * 2.0,
      pos.z + (Math.random() - 0.5) * 0.9
    );
    pMesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    scene.add(pMesh);
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 7,
      Math.random() * 5.5 + 1.5,
      (Math.random() - 0.5) * 7
    );
    vfx.push({ mesh: pMesh, vel, life: 0.85 + Math.random() * 0.3, maxLife: 1.15, isParticle: true, _ownsGeo: true });
  }
}

// ─────────────────────────────────────────────
//  VOXEL DEBRIS EXPLOSION
//  Shatters an enemy group into its constituent colored cubes on death.
// ─────────────────────────────────────────────
function spawnVoxelDebris(group) {
  if (vfx.length > 160) return; // skip if VFX budget full
  const wPos = new THREE.Vector3(), wQuat = new THREE.Quaternion(), wScale = new THREE.Vector3();
  let debrisCount = 0;
  group.traverse(child => {
    if (!child.isMesh || child.geometry?.type !== 'BoxGeometry') return;
    if (debrisCount++ >= 20) return; // cap per-enemy debris count
    child.getWorldPosition(wPos);
    child.getWorldQuaternion(wQuat);
    child.getWorldScale(wScale);
    const { width: w, height: h, depth: d } = child.geometry.parameters;
    const geo = new THREE.BoxGeometry(
      Math.max(0.04, w * Math.abs(wScale.x)),
      Math.max(0.04, h * Math.abs(wScale.y)),
      Math.max(0.04, d * Math.abs(wScale.z))
    );
    const src = Array.isArray(child.material) ? child.material[0] : child.material;
    const mat = new THREE.MeshStandardMaterial({
      color: src.color ? src.color.clone() : new THREE.Color(0x888888),
      flatShading: true, transparent: true, opacity: 1.0,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(wPos); m.quaternion.copy(wQuat);
    scene.add(m);
    const ang = Math.random() * Math.PI * 2;
    const spd = 1.8 + Math.random() * 3.5;
    const maxLife = 0.7 + Math.random() * 0.55;
    vfx.push({
      mesh: m, isDebris: true,
      vel: new THREE.Vector3(Math.cos(ang) * spd, 1.5 + Math.random() * 3.5, Math.sin(ang) * spd),
      spin: new THREE.Vector3((Math.random()-0.5)*14, (Math.random()-0.5)*14, (Math.random()-0.5)*14),
      life: maxLife, maxLife,
      _ownsGeo: true,
    });
  });
}

function updateVFX(dt) {
  for (let i = vfx.length - 1; i >= 0; i--) {
    const p = vfx[i];
    p.life -= dt;
    if (p.life <= 0) {
      // Always own materials (created fresh per VFX). Geometry is owned for rings/debris/crumble
      // but SHARED for hit particles (GEO.particle), so only dispose when _ownsGeo is set.
      if (p._ownsGeo && p.mesh.geometry) p.mesh.geometry.dispose();
      if (p.mesh.material) p.mesh.material.dispose();
      scene.remove(p.mesh);
      vfx.splice(i, 1);
      continue;
    }
    if (p.isRing) {
      const t = 1 - p.life / p.maxLife;
      const s = p.startScale + (p.endScale - p.startScale) * t;
      p.mesh.scale.setScalar(s);
      p.mesh.material.opacity = 0.85 * (p.life / p.maxLife);
    } else if (p.isDebris) {
      // Voxel debris: gravity + angular tumble + late fade
      p.vel.y -= 9.8 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
      const fade = p.life / p.maxLife;
      if (fade < 0.35) p.mesh.material.opacity = fade / 0.35;
    } else {
      p.vel.y -= 9 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const s = Math.max(0.01, p.life / p.maxLife);
      p.mesh.scale.setScalar(s);
    }
  }
}

function updateWebZones(dt) {
  for (let i = webZones.length - 1; i >= 0; i--) {
    const w = webZones[i];
    w.timer -= dt;
    if (w.timer <= 0) {
      scene.remove(w.mesh);
      // Web is a Group of meshes sharing one material — dispose each child geometry
      // then the shared material once.
      w.mesh.traverse(c => { if (c.geometry) c.geometry.dispose(); });
      w.mat.dispose();
      webZones.splice(i, 1); continue;
    }
    w.mat.opacity = 0.55 * (w.timer / 8.0);
    const wR2 = w.radius * w.radius;
    for (const o of orcs) {
      if (!o.alive) continue;
      if (o.group.position.distanceToSquared(w.pos) < wR2) {
        o.slowTimer  = Math.max(o.slowTimer, 0.35);
        o.slowAmount = Math.min(o.slowAmount, 0.35);
      }
    }
  }
}

// ─────────────────────────────────────────────
//  WAVE SPAWNER — 12 designed waves + scaling
// ─────────────────────────────────────────────
// Pure base composition for a wave — ordered [type, count] pairs, no randomness,
// no side effects. buildSpawnQueue() turns this into the actual spawn queue
// (cluster-shuffle, elite rolls, pacing); the next-wave preview HUD reads it
// directly so the player can see what's coming and build counters in advance.
function waveComposition(waveNum) {
  const comp = [];
  const add = (type, n) => comp.push([type, n]);

  // Waves 1-12: hand-tuned progression
  // Early (1-4):  learn the basics, manageable with minimal defenses
  // Mid   (5-8):  requires layered coverage, ranged threats introduced
  // Late  (9-12): elite enemies, must have comprehensive overlapping defenses
  // Tactical-difficulty pass: bigger waves, mixed compositions earlier, ranged threats from wave 3 on.
  if      (waveNum === 1)  {
    add('grunt',12); add('skeleton',5);
  }
  else if (waveNum === 2)  {
    add('grunt',12); add('skeleton',8); add('wolf',4); add('brute',1);
  }
  else if (waveNum === 3)  {
    add('grunt',8); add('skeleton',7); add('wolf',5); add('brute',3); add('enemyArcher',2);                             // bows arrive early — must build cover
  }
  else if (waveNum === 4)  {
    add('grunt',6); add('skeleton',6); add('brute',5); add('wolf',5); add('spider',4); add('enemyArcher',4); add('exploder',3);
  }
  else if (waveNum === 5)  {
    add('grunt',5); add('skeleton',6); add('brute',6); add('wolf',5); add('spider',6); add('enemyArcher',5); add('troll',2); add('exploder',4); add('healerOrc',1);
  }
  else if (waveNum === 6)  {
    add('grunt',4); add('skeleton',4); add('brute',5); add('wolf',5); add('spider',6); add('enemyArcher',4); add('troll',2); add('orcMage',2); add('exploder',4); add('healerOrc',2);
  }
  else if (waveNum === 7)  {
    add('skeleton',4); add('brute',5); add('wolf',5); add('spider',6); add('troll',3); add('boss',1); add('enemyArcher',5); add('orcMage',3); add('exploder',4); add('healerOrc',3);
  }
  else if (waveNum === 8)  {
    add('skeleton',4); add('brute',6); add('wolf',5); add('spider',7); add('troll',3); add('boss',2); add('enemyArcher',5); add('orcMage',3); add('cyclops',1); add('exploder',4); add('healerOrc',3);
  }
  else if (waveNum === 9)  {
    add('brute',6); add('wolf',6); add('spider',7); add('troll',5); add('boss',2); add('enemyArcher',5); add('orcMage',4); add('cyclops',2); add('exploder',5); add('healerOrc',3); add('rockTroll',1);
  }
  else if (waveNum === 10) {
    add('brute',6); add('wolf',6); add('spider',8); add('troll',5); add('boss',3); add('enemyArcher',5); add('orcMage',4); add('cyclops',2); add('exploder',5); add('healerOrc',4); add('rockTroll',2);
  }
  else if (waveNum === 11) {
    add('brute',7); add('wolf',7); add('spider',9); add('troll',6); add('boss',3); add('enemyArcher',5); add('orcMage',5); add('cyclops',3); add('exploder',6); add('healerOrc',4); add('rockTroll',2);
  }
  else if (waveNum === 12) {
    add('brute',7); add('wolf',7); add('spider',10); add('troll',6); add('boss',4); add('enemyArcher',5); add('orcMage',6); add('cyclops',4); add('exploder',6); add('healerOrc',5); add('rockTroll',3);
  }
  else {
    // Beyond wave 12: steeper escalation — each type grows ~0.7 per wave
    const n = waveNum - 12;
    add('brute',      5 + Math.ceil(n * 0.85));
    add('wolf',       5 + Math.ceil(n * 0.85));
    add('spider',     6 + Math.ceil(n * 0.95));
    add('troll',      4 + Math.ceil(n * 0.65));
    add('boss',       3 + Math.ceil(n * 0.55));
    add('enemyArcher',4 + Math.ceil(n * 0.55));
    add('orcMage',    4 + Math.ceil(n * 0.65));
    add('cyclops',    2 + Math.ceil(n * 0.35));
    add('exploder',   3 + Math.ceil(n * 0.55));
    add('healerOrc',  2 + Math.ceil(n * 0.4));
    add('rockTroll',  1 + Math.ceil(n * 0.3));
  }
  return comp;
}

function buildSpawnQueue(waveNum) {
  const q = [];
  for (const [type, n] of waveComposition(waveNum)) {
    for (let i = 0; i < n; i++) q.push(type);
  }

  // Cluster-shuffle: group into cohorts of 2–3 enemies (preserving add() order internally)
  // then shuffle the COHORTS. Result: small packs of same-type enemies arrive together
  // ("a pack of wolves", "a squad of archers") instead of random soup. Much more readable
  // and creates tactical mini-moments the player can react to.
  const cohorts = [];
  let idx = 0;
  while (idx < q.length) {
    const size = 2 + Math.floor(Math.random() * 2); // 2 or 3
    cohorts.push(q.slice(idx, idx + size));
    idx += size;
  }
  for (let i = cohorts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cohorts[i], cohorts[j]] = [cohorts[j], cohorts[i]];
  }
  q.length = 0;
  for (const c of cohorts) for (const e of c) q.push(e);

  // Siege waves (divisible by 5): elite chance scales with wave so late sieges are gauntlets.
  // Wave 5 → 28%, wave 10 → 35%, wave 15 → 42%, capped at 50%.
  if (waveNum % 5 === 0) {
    const eliteChance = Math.min(0.50, 0.28 + Math.floor(waveNum / 5 - 1) * 0.07);
    for (let i = 0; i < q.length; i++) {
      if (!q[i].startsWith('elite:') && Math.random() < eliteChance) q[i] = 'elite:' + q[i];
    }
  }
  // Bonus: any wave 8+ has a 12% chance per enemy to become elite — keeps non-siege waves interesting too
  else if (waveNum >= 8) {
    for (let i = 0; i < q.length; i++) {
      if (!q[i].startsWith('elite:') && Math.random() < 0.12) q[i] = 'elite:' + q[i];
    }
  }

  // Mini-wave pacing: pause markers every ~10 enemies (was 8) — fewer breathers, tighter pressure
  if (q.length >= 12) {
    const gapSize = 10;
    const paced = [];
    for (let i = 0; i < q.length; i++) {
      paced.push(q[i]);
      if ((i + 1) % gapSize === 0 && i < q.length - 1) paced.push('pause');
    }
    return paced;
  }
  return q;
}

function updateSpawner(dt) {
  if (!waveActive || spawnQueue.length === 0) return;
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    const type = spawnQueue[spawnQueue.length - 1];
    if (type === 'pause') {
      spawnQueue.pop();
      spawnTimer = 1.8;                         // shorter breather between cohorts (was 2.2)
      updateHUD();
      return;
    }
    spawnQueue.pop();
    spawnOrc(type);
    updateHUD();
    // Enemies spawn faster in later waves — minimum tightened from 0.65s → 0.50s for late-game pressure
    spawnTimer = Math.max(0.50, CFG.SPAWN_INTERVAL - (wave - 1) * 0.05);
  }
}

/** Timed enemy spawner for test panel "Simulate Wave" buttons.
 *  Mirrors updateSpawner but uses _spawnArenaEnemy (arena lanes, not real PATHS).
 */
function updateTestSpawner(dt) {
  if (_testSpawnQueue.length === 0) return;
  _testSpawnTimer -= dt;
  if (_testSpawnTimer > 0) return;
  const type = _testSpawnQueue[_testSpawnQueue.length - 1];
  if (type === 'pause') {
    _testSpawnQueue.pop();
    _testSpawnTimer = 1.8;
    return;
  }
  _testSpawnQueue.pop();
  _spawnArenaEnemy(type, ARENA.c0 + 2);
  _testSpawnTimer = Math.max(0.50, CFG.SPAWN_INTERVAL - (_testSpawnWave - 1) * 0.05);
}

function checkWaveEnd() {
  if (!waveActive) return;
  if (spawnQueue.some(t => t !== 'pause')) return; // still enemies to spawn
  if (orcs.some(o => o.alive)) return;
  waveActive = false;
  // Release all lingering attack slots so defenders aren't locked between waves
  for (const o of orcs) {
    if (o.fightingDefender) { releaseAttackSlot(o.fightingDefender, o); o.fightingDefender = null; o.attackSlot = -1; }
  }
  SND.waveComplete();

  // Clutch save: clearing the wave DURING Last Stand ends the countdown with a
  // celebration instead of silently letting the timer run out mid-breather.
  if (lastStandActive) {
    lastStandActive = false;
    lastStandTimer = 0;
    elLastStand?.classList.remove('active');
    elLastStandTimer?.classList.remove('active');
    castleHp = Math.max(castleHp, Math.floor(CFG.CASTLE_MAX_HP * 0.1)); // survive with 10% HP
    updateCastleHPBar(); updateCastleHPMesh();
    showTooltip('🛡️ LAST STAND HELD! The castle endures — 10% HP restored', 3500);
  }

  // Feature 3: star rating — 3 independent criteria
  const starNoDmg   = castleHp >= waveStartHp;                               // castle took 0 damage
  const starNoLoss  = waveDefDeaths === 0;                                    // no defenders lost
  const timeLimit   = (20 + wave * 10) * (wave % 5 === 0 ? 1.4 : 1.0);      // seconds; siege waves get +40%
  const starFast    = (Date.now() - waveStartTime) / 1000 <= timeLimit;      // cleared in time
  const waveStars   = (starNoDmg ? 1 : 0) + (starNoLoss ? 1 : 0) + (starFast ? 1 : 0);
  totalStars += waveStars;
  // Track per-wave performance for this level — used to compute the level's overall star rating
  if (currentLevel && currentLevel.id !== 'endless') levelWaveStars.push(waveStars);
  // levelStarsEarned is now computed from castle HP at level end, not accumulated per-wave
  const criteria = [
    { label: 'Castle safe',   earned: starNoDmg,  icon: '🏰' },
    { label: 'No losses',     earned: starNoLoss, icon: '🛡️' },
    { label: 'Swift victory', earned: starFast,   icon: '⚡' },
  ];
  showWaveStars(wave, waveStars, criteria);

  // Feature 6: decrement haste
  if (hasteWaves > 0) hasteWaves--;

  // Castle HP regeneration between waves (5% of max, max 15 HP)
  const hpRegen = Math.min(15, Math.floor(CFG.CASTLE_MAX_HP * 0.05));
  if (castleHp > 0 && castleHp < CFG.CASTLE_MAX_HP) {
    castleHp = Math.min(CFG.CASTLE_MAX_HP, castleHp + hpRegen);
    updateCastleHPMesh();
  }

  // Feature 6: double bonus
  let bonus = 20 + wave * 10;
  if (doubleBonusWave) { bonus *= 2; doubleBonusWave = false; }
  gold += bonus;
  _runStats.goldEarned += bonus;

  // ── Endless mode: milestone bonuses every 5 waves ──
  // Gives the player a satisfying compound reward as they push deeper into endless,
  // and lets them feel scored progress beyond just the wave counter.
  if (currentLevel && currentLevel.id === 'endless') {
    if (wave > 0 && wave % 10 === 0) {
      // Every 10 waves: big bonus + bump max-defenders cap
      const milestoneGold = 200;
      gold += milestoneGold;
      CFG.MAX_DEFENDERS = Math.min(40, (CFG.MAX_DEFENDERS || 14) + 1);
      showTooltip(`🏆 WAVE ${wave} MILESTONE!  +${milestoneGold}🟡  +1 max defender`, 3200);
    } else if (wave > 0 && wave % 5 === 0) {
      // Every 5 waves: gold reward
      const milestoneGold = 75;
      gold += milestoneGold;
      showTooltip(`✨ Wave ${wave} streak  +${milestoneGold}🟡 bonus`, 2400);
    }
  }
  updateHUD();

  // Feature 4: check new unlocks
  for (const [tool, unlockWave] of Object.entries(UNLOCK_WAVES)) {
    if (!UNLOCKED.has(tool) && wave >= unlockWave) {
      UNLOCKED.add(tool);
      showTooltip(`🔓 ${tool.charAt(0).toUpperCase() + tool.slice(1)} unlocked!`, 2500);
    }
  }
  updateUnlockUI();

  // ── Level completion check: last wave of a level? ──
  if (currentLevel && currentLevel.id !== 'endless' && wave >= currentLevel.endWave) {
    // Compute 3-star rating from per-wave performance combined with castle HP retention.
    // The player must both play well across ALL waves and protect the castle.
    const hpPct = castleHp / CFG.CASTLE_MAX_HP;
    const nWaves = levelWaveStars.length || 1;
    const avgWaveStars = levelWaveStars.reduce((a, b) => a + b, 0) / nWaves;
    const minWaveStars = levelWaveStars.length ? Math.min(...levelWaveStars) : 0;
    // 3★: excellent throughout — every wave earned 2+ stars AND avg ≥ 2.5 AND HP ≥ 50%
    // 2★: solid run — avg wave stars ≥ 1.5 AND HP ≥ 25% (or pristine HP ≥ 90%)
    // 1★: completed the level at all
    let stars = 1;
    if (avgWaveStars >= 2.5 && minWaveStars >= 2 && hpPct >= 0.5) stars = 3;
    else if (avgWaveStars >= 1.5 && hpPct >= 0.25) stars = 2;
    else if (hpPct >= 0.9) stars = 2; // fallback: pristine castle = at least 2★ even if waves were sloppy
    levelStarsEarned = stars;
    const prev = levelProgress[String(currentLevel.id)] || { bestStars: 0, completed: false };
    const prevCompleted = prev.completed;
    // Capture clear time + previous best for THIS difficulty BEFORE recordLevelResult mutates it,
    // so we can tell the player whether they just beat their personal best time.
    const runMs = _levelElapsedMs();
    const prevBestTime = prev.bestTimes?.[currentDifficulty] || null;
    const isNewBestTime = stars >= 1 && (!prevBestTime || runMs < prevBestTime);
    const { isNewRecord } = recordLevelResult(currentLevel.id, levelStarsEarned);
    const unlockedNext   = !prevCompleted && levelStarsEarned >= 1;
    showTooltip(`Wave ${wave} complete! +${bonus}🟡 gold bonus`, 2400);
    // Give the wave-stars popup a moment to show before the level-complete modal takes over.
    // Store the handle so mode-switches / level-select can cancel this before it fires.
    const _lvlSnapshot = currentLevel;
    if (_levelCompleteTimer) clearTimeout(_levelCompleteTimer);
    _levelCompleteTimer = setTimeout(() => {
      _levelCompleteTimer = null;
      // Re-check: player may have exited to level-select or switched modes during the delay
      if (!currentLevel || currentLevel !== _lvlSnapshot) return;
      showLevelComplete(_lvlSnapshot, levelStarsEarned, isNewRecord, unlockedNext, {
        runMs, prevBestTime, isNewBestTime,
      });
    }, 1800);
    return;
  }

  // Feature 6: merchant.
  // Endless/free play: every 3rd wave (not siege waves). Story levels: before the
  // final wave of each level — the old `wave % 3` rule NEVER fired in story mode
  // because every level's endWave is a multiple of 3, so the merchant was
  // accidentally endless-only.
  const inLevel = currentLevel && currentLevel.id !== 'endless';
  const isLastOfLevel = inLevel && wave >= currentLevel.endWave;
  const merchantDue = inLevel
    ? (wave === currentLevel.endWave - 1)             // story: breather before the boss wave
    : (wave % 3 === 0 && wave % 5 !== 0);             // endless/free play: unchanged cadence
  if (merchantDue && !isLastOfLevel) {
    showMerchant();
  } else {
    document.getElementById('btn-start').disabled = false;
    updateHUD(); // re-run now that Start is live: ready-pulse + next-wave preview
  }

  showTooltip(`Wave ${wave} complete! +${bonus}🟡 gold bonus`, 3000);

  // In endless / pre-level modes: pre-apply next wave's layout/biome so the player builds on the right grid.
  // Inside a level, the biome and layout are fixed for the whole level — skip the rotation.
  if (!currentLevel || currentLevel.id === 'endless') {
    const nextWave      = wave + 1;
    const nextLayoutIdx = nextWave <= 3 ? 0 : 1 + Math.floor((nextWave - 4) / 3) % (LAYOUT_WAYPOINTS.length - 1);
    const nextBiomeIdx  = Math.floor((nextWave - 1) / 3) % BIOMES.length;
    if (nextLayoutIdx !== activeLayoutIdx && !_mePaths.some(p => p.length > 0)) applyLayout(nextLayoutIdx);
    if (nextBiomeIdx  !== activeBiomeIdx)  applyBiome(nextBiomeIdx);
  }
}

// ─────────────────────────────────────────────
//  GHOST PREVIEW + RANGE RING
// ─────────────────────────────────────────────
let tileMeshesArr = [];

const ghostMesh = new THREE.Mesh(box(0.85, 1.8, 0.85), M.ghost);
ghostMesh.visible = false;
scene.add(ghostMesh);

// Flat ring shown under ghost / hovered defender to show attack range
const rangeRingMesh = new THREE.Mesh(
  new THREE.RingGeometry(0.91, 1.0, 8),
  new THREE.MeshBasicMaterial({ color: 0x00ccff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
);
rangeRingMesh.rotation.x = -Math.PI / 2;
rangeRingMesh.position.y = 0.08;
rangeRingMesh.visible = false;
scene.add(rangeRingMesh);

const raycaster = new THREE.Raycaster();
const mouseNDC  = new THREE.Vector2();
let ghostCol = -1, ghostRow = -1;

// ─────────────────────────────────────────────
//  FLOATING GOLD POPUPS
// ─────────────────────────────────────────────
// worldPos must be a disposable Vector3 (callers should pass posAbove(...) or .clone())
// Gold popups: same-frame accumulator. A burst of 30 kills doesn't spawn 30 DOM
// nodes — same-frame popups merge into one with a stacked amount. Negative
// (refund/penalty) popups bypass the merge so the player still sees them clearly.
let _goldPopupAccum = 0;
let _goldPopupTimer = 0;
let _goldPopupLastPos = null;
function spawnGoldPopup(amount, worldPos) {
  if (amount < 0) { _flushGoldPopup(amount, worldPos); return; }
  _goldPopupAccum += amount;
  _goldPopupLastPos = worldPos;
  if (_goldPopupTimer) return;
  _goldPopupTimer = setTimeout(() => {
    _goldPopupTimer = 0;
    _flushGoldPopup(_goldPopupAccum, _goldPopupLastPos);
    _goldPopupAccum = 0;
    _goldPopupLastPos = null;
  }, 80); // batch a single frame's worth (~5 frames at 60fps)
}
function _flushGoldPopup(amount, worldPos) {
  if (!worldPos || amount === 0) return;
  worldPos.project(camera);
  const x = (worldPos.x *  0.5 + 0.5) * window.innerWidth;
  const y = Math.max(68 + 58 + 4, (-worldPos.y * 0.5 + 0.5) * window.innerHeight);
  const el = document.createElement('div');
  el.className = 'gold-popup';
  el.textContent = amount < 0 ? `${amount}🟡` : `+${amount}🟡`;
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  document.body.appendChild(el);
  setTimeout(() => { el.style.transform = 'translateY(-58px)'; el.style.opacity = '0'; }, 16);
  setTimeout(() => el.remove(), 950);
}

let _dmgPopupThrottle = 0;
function spawnDmgPopup(amount, worldPos) {
  const now = performance.now();
  if (now - _dmgPopupThrottle < 40) return; // cap at ~25 popups/s globally
  _dmgPopupThrottle = now;
  worldPos.project(camera);
  if (Math.abs(worldPos.z) > 1) return; // behind camera
  const x = (worldPos.x *  0.5 + 0.5) * window.innerWidth  + (Math.random() - 0.5) * 18;
  // Clamp so the popup never floats up into the HUD (68px tall, travels 44px)
  const y = Math.max(68 + 44 + 4, (-worldPos.y * 0.5 + 0.5) * window.innerHeight + (Math.random() - 0.5) * 8);
  const el = document.createElement('div');
  el.className = 'dmg-popup';
  el.textContent = `-${Math.ceil(amount)}`;
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  document.body.appendChild(el);
  setTimeout(() => { el.style.transform = 'translateY(-44px)'; el.style.opacity = '0'; }, 16);
  setTimeout(() => el.remove(), 750);
}

function updateGhostPreview() {
  rangeRingMesh.visible = false;
  raycaster.setFromCamera(mouseNDC, camera);
  const hits = raycaster.intersectObjects(tileMeshesArr);

  // Enemy placement ghost — orange preview on any non-castle tile
  if (selectedEnemyType) {
    if (hits.length === 0) { ghostMesh.visible = false; return; }
    const { col, row } = hits[0].object.userData;
    const cell = grid[`${col},${row}`];
    if (!cell || cell.type === 'castle') { ghostMesh.visible = false; return; }
    ghostMesh.material = M.ghostEnemy;
    ghostMesh.position.set(col, 0.9, row);
    ghostMesh.visible = true;
    return;
  }

  if (!selectedTool) {
    ghostMesh.visible = false;
    // Hover over an existing defender → show its range ring
    if (hits.length > 0) {
      const { col, row } = hits[0].object.userData;
      const def = defenders.find(d => d.col === col && d.row === row && d.alive);
      if (def) {
        const range = def.range ?? CFG.STATS[def.type]?.range;
        if (range) {
          rangeRingMesh.position.set(col, 0.08, row);
          rangeRingMesh.scale.setScalar(range);
          rangeRingMesh.visible = true;
        }
      }
    }
    return;
  }

  if (hits.length === 0) { ghostMesh.visible = false; return; }
  const { col, row } = hits[0].object.userData;
  ghostCol = col; ghostRow = row;
  const key = `${col},${row}`;
  const cell = grid[key];
  const isPathTool = selectedTool === 'wall' || selectedTool === 'spiketrap';
  let canPlace = cell && !occupied.has(key) && gold >= (CFG.COSTS[selectedTool] || 0) && cell.type !== 'castle' &&
    (isPathTool ? (cell.type === 'grass' || cell.type === 'path') : cell.type === 'grass');


  ghostMesh.material = canPlace ? M.ghost : M.ghostNo;
  ghostMesh.position.set(col, 0.9, row);
  ghostMesh.visible = true;

  // Show range ring for ranged tools
  const range = CFG.STATS[selectedTool]?.range;
  if (range) {
    rangeRingMesh.position.set(col, 0.08, row);
    rangeRingMesh.scale.setScalar(range);
    rangeRingMesh.visible = true;
  }
}

// ─────────────────────────────────────────────
//  UI FUNCTIONS
// ─────────────────────────────────────────────
const elMana        = document.getElementById('mana-val');
const elWaveVal     = document.getElementById('wave-val');
const elKillsVal    = document.getElementById('kills-val');
const elUnitsVal    = document.getElementById('units-val');
const elEnemiesHud  = document.getElementById('hud-enemies');
const elEnemiesVal  = document.getElementById('enemies-val');
const elHPText    = document.getElementById('castle-hp-text');
const elHPFill    = document.getElementById('castle-hp-fill');
// Last-stand UI (cached once — these were re-looked-up every castle hit / every frame during last-stand)
const elLastStand       = document.getElementById('last-stand');
const elLastStandTimer  = document.getElementById('last-stand-timer');
const elLastStandSecs   = document.getElementById('last-stand-secs');
const elTooltip   = document.getElementById('tooltip');
const _buildCards = document.querySelectorAll('.build-card');
const elBanner    = document.getElementById('wave-banner');
const elBannerNum = document.getElementById('banner-num');
const elGameOver  = document.getElementById('game-over');
const elGoStats   = document.getElementById('go-stats');
const elBtnStart  = document.getElementById('btn-start');

// ── Next-wave preview ────────────────────────────────────────────────────────
// Shown between waves (whenever Start Wave is ready) so the player can scout the
// incoming composition and build counters before committing. Reads the pure
// waveComposition() — elite rolls and siege extras stay a surprise, but the tags
// warn about them.
const ENEMY_INFO = {
  grunt:       { icon: '👹', name: 'Grunt' },
  brute:       { icon: '👺', name: 'Brute' },
  boss:        { icon: '👑', name: 'Ogre Champion' },
  troll:       { icon: '🧌', name: 'Troll (regenerates)' },
  skeleton:    { icon: '💀', name: 'Skeleton (fast)' },
  wolf:        { icon: '🐺', name: 'Wolf (fast)' },
  spider:      { icon: '🕷️', name: 'Spider (very fast, webs)' },
  cyclops:     { icon: '👁️', name: 'Cyclops (melee crusher)' },
  enemyArcher: { icon: '🏹', name: 'Orc Archer (ranged)' },
  exploder:    { icon: '💣', name: 'Exploder (blows up on death)' },
  healerOrc:   { icon: '💚', name: 'Healer Shaman (heals allies)' },
  orcMage:     { icon: '🔮', name: 'Orc Mage (ranged, explodes)' },
  rockTroll:   { icon: '🗿', name: 'Rock Troll (tank, throws boulders)' },
};
const elWavePreview = document.getElementById('wave-preview');
let _wavePreviewKey = '';
function updateWavePreview() {
  if (!elWavePreview) return;
  const ready = elBtnStart && !elBtnStart.disabled && !waveActive && !gameOver && !testMode;
  if (!ready) {
    if (_wavePreviewKey !== '') { _wavePreviewKey = ''; elWavePreview.classList.remove('visible'); }
    return;
  }
  const next = wave + 1;
  const isBossWave = !!(currentLevel && currentLevel.id !== 'endless'
    && next === currentLevel.endWave && currentLevel.boss);
  // Rebuild the DOM only when the upcoming wave actually changes
  const key = `${next}|${currentLevel?.id ?? 'free'}|${isBossWave}`;
  if (_wavePreviewKey === key) return;
  _wavePreviewKey = key;

  const chips = waveComposition(next).map(([type, n]) => {
    const info = ENEMY_INFO[type] || { icon: '👾', name: type };
    return `<span class="wp-chip" title="${info.name}">${info.icon}<b>×${n}</b></span>`;
  }).join('');
  const tags = [];
  if (next % 5 === 0) tags.push('<span class="wp-tag wp-siege">⚔️ SIEGE — 40% bigger, elites!</span>');
  if (isBossWave)     tags.push(`<span class="wp-tag wp-boss">👑 BOSS — ${currentLevel.boss.name}</span>`);
  elWavePreview.innerHTML =
    `<div class="wp-title">⚔️ Next: Wave ${next}</div>` +
    `<div class="wp-chips">${chips}</div>` +
    (tags.length ? `<div class="wp-tags">${tags.join('')}</div>` : '');
  elWavePreview.classList.add('visible');
}

function getMaxDefenders() {
  return Math.min(26, CFG.MAX_DEFENDERS + wave);
}

function liveDefenderCount() {
  let sum = 0;
  for (const d of defenders) if (d.alive) sum += CFG.STATS[d.type]?.unitCost ?? 1;
  return sum;
}

function updateHUD() {
  elMana.textContent     = gold;
  // Story levels show progress within the level ("2/3"); endless/free show the raw wave
  if (currentLevel && currentLevel.id !== 'endless' && wave >= currentLevel.startWave) {
    const total = currentLevel.endWave - currentLevel.startWave + 1;
    elWaveVal.textContent = `${wave - currentLevel.startWave + 1}/${total}`;
    elWaveVal.title = `Wave ${wave} overall`;
  } else {
    elWaveVal.textContent = wave;
    elWaveVal.title = '';
  }
  elKillsVal.textContent = kills;
  if (gold >= 500) _unlockAchievement('goldHoarder');
  const cur = liveDefenderCount();
  const cap = getMaxDefenders();
  const free = cap - cur;
  elUnitsVal.textContent = `${cur}/${cap}`;
  elUnitsVal.classList.toggle('at-cap', cur >= cap);
  // Enemy count HUD — only during wave
  if (elEnemiesHud && elEnemiesVal) {
    if (waveActive) {
      let _aliveOrcs = 0; for (const o of orcs) if (o.alive) _aliveOrcs++;
      let _queuedOrcs = 0; for (const t of spawnQueue) if (t !== 'pause') _queuedOrcs++;
      const enemiesLeft = _aliveOrcs + _queuedOrcs;
      elEnemiesVal.textContent = enemiesLeft;
      elEnemiesHud.style.display = '';
    } else {
      elEnemiesHud.style.display = 'none';
    }
  }
  // Grey out cards whose unitCost exceeds remaining slots
  _buildCards.forEach(card => {
    const cost = CFG.STATS[card.dataset.tool]?.unitCost ?? 1;
    card.classList.toggle('cap-blocked', cost > free);
  });
  // Affordability visual: grey out cards the player can't afford right now
  if (typeof refreshBuildCardStates === 'function') refreshBuildCardStates();
  // Endless milestone counter — visible only during endless mode, ticks down each wave
  const milestoneEl = document.getElementById('hud-milestone');
  const milestoneVal = document.getElementById('hud-milestone-val');
  if (milestoneEl && milestoneVal) {
    if (currentLevel && currentLevel.id === 'endless') {
      // Next milestone: smallest multiple of 5 strictly greater than current wave
      const nextMilestone = Math.max(5, Math.ceil((wave + 1) / 5) * 5);
      const isMajor = nextMilestone % 10 === 0;
      const wavesLeft = nextMilestone - wave;
      milestoneVal.textContent = `Wave ${nextMilestone}${isMajor ? ' ★' : ''}  (${wavesLeft} left)`;
      milestoneEl.style.display = '';
    } else {
      milestoneEl.style.display = 'none';
    }
  }
  // Pulse the Start button when a wave is ready to launch (idle, between waves) so the
  // player notices they can advance — and discovers the Enter shortcut by association.
  if (elBtnStart) {
    const startReady = !elBtnStart.disabled && !waveActive && !gameOver && !testMode;
    elBtnStart.classList.toggle('ready', startReady);
  }
  updateWavePreview();
  updateCastleHPBar();
}

// Track whether the critical-castle warning has fired this wave so we don't blast
// the alarm sting every time the player takes another hit at low HP.
let _criticalWarned = false;

function updateCastleHPBar() {
  const pct = Math.max(0, castleHp / CFG.CASTLE_MAX_HP);
  elHPText.textContent = `${castleHp} / ${CFG.CASTLE_MAX_HP}`;
  if (elHPFill) {
    elHPFill.style.width = (pct * 100) + '%';
    elHPFill.style.background = `hsl(${Math.round(pct * 120)}, 100%, 42%)`;
  }
  if (pct < 0.25) {
    elHPText.style.animation = 'pulse-castle-hp 0.5s ease-in-out infinite alternate';
    // Fire the alarm once per wave when the threshold is first crossed
    if (!_criticalWarned && waveActive && castleHp > 0) {
      _criticalWarned = true;
      try { SND.criticalCastle?.(); } catch {}
    }
  } else {
    elHPText.style.animation = '';
  }
}

function updateCastleHPMesh() {
  if (!castleHPMesh) return;
  const pct = Math.max(0, castleHp / CFG.CASTLE_MAX_HP);
  castleHPMesh.scale.x = Math.max(0.001, pct);
  castleHPMesh.position.x = 66 - (1 - pct) * CASTLE_BAR_MAX_W * 0.5;
  castleHPMesh.material.color.setHSL(pct * 0.33, 1.0, 0.5); // green → yellow → red
}

let tooltipTimer = null;
let tooltipSwapTimer = null;
let tooltipLastMsg = '';
function showTooltip(msg, ms) {
  clearTimeout(tooltipTimer);
  clearTimeout(tooltipSwapTimer);
  // If the bubble is already visible with a different message, fade out first
  // and only then swap the text — eliminates the jarring "snap" of mid-show replacements.
  const isVisible = !elTooltip.classList.contains('hidden');
  const sameMsg = tooltipLastMsg === msg;
  if (isVisible && !sameMsg) {
    elTooltip.classList.add('hidden');
    tooltipSwapTimer = setTimeout(() => {
      tooltipSwapTimer = null;
      elTooltip.textContent = msg;
      tooltipLastMsg = msg;
      elTooltip.classList.remove('hidden');
      tooltipTimer = setTimeout(() => elTooltip.classList.add('hidden'), ms || 2000);
    }, 160); // matches CSS opacity 0.4s ease — feels instantaneous but no snap
  } else {
    elTooltip.textContent = msg;
    tooltipLastMsg = msg;
    elTooltip.classList.remove('hidden');
    tooltipTimer = setTimeout(() => elTooltip.classList.add('hidden'), ms || 2000);
  }
}

// Achievement toast — pops up top-center for ~3.5s. Multiple unlocks queue up cleanly
// because each toast is its own DOM node that animates and removes itself.
function _showAchievementToast(a) {
  const el = document.createElement('div');
  el.className = 'achievement-toast';
  el.innerHTML =
    `<div class="ach-icon">${a.icon}</div>` +
    `<div class="ach-text"><div class="ach-title">Achievement Unlocked</div>` +
    `<div class="ach-name">${a.name}</div>` +
    `<div class="ach-desc">${a.desc}</div></div>`;
  document.body.appendChild(el);
  // Stack toasts vertically when multiple unlock at once
  const existing = document.querySelectorAll('.achievement-toast').length;
  el.style.top = (16 + (existing - 1) * 88) + 'px';
  // Two-frame defer so the CSS transition fires
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visible')));
  setTimeout(() => el.classList.remove('visible'), 3500);
  setTimeout(() => el.remove(), 4100);
  try { SND.achievement?.(); } catch {}
}

// Persistent banner element references — built once, reused for every wave/boss banner so we
// avoid creating spans on each call. Different layouts hide/show different sub-elements.
const _bannerLeadSpan = document.createElement('span');
const _bannerNumSpan  = document.createElement('span');
_bannerNumSpan.id     = 'banner-num';
const _bannerTrailSpan= document.createElement('span');
_bannerTrailSpan.textContent = '!';
const _bannerBossName = document.createElement('span');
_bannerBossName.id    = 'boss-name';
// Endless-mode "what's coming" subtitle (HORDE / ELITE PACK / BOSS SURGE)
const _bannerSubLabel = document.createElement('span');
_bannerSubLabel.id    = 'banner-sub';
const _elWaveStars    = document.getElementById('wave-stars');

// Returns a short "what to expect" tag for the wave's spawn queue, or '' for a normal wave.
// Reads the *current* spawnQueue (built immediately before the banner shows) so it's accurate.
function _endlessTelegraph(n) {
  if (n < 12) return ''; // beyond the hand-tuned curve
  let bosses = 0, elites = 0, total = 0;
  for (const tok of spawnQueue) {
    if (tok === 'pause') continue;
    total++;
    if (tok === 'boss' || tok === '__levelBoss' || tok === 'cyclops' || tok === 'rockTroll') bosses++;
    if (typeof tok === 'string' && (tok.startsWith('elite:') || tok.startsWith('retinue:'))) elites++;
  }
  if (bosses >= 3) return 'BOSS SURGE';
  if (elites >= 6) return 'ELITE PACK';
  if (total   >= 45) return 'HORDE';
  return '';
}
// _bannerHideTimer and _bannerCleanupTimer are hoisted near the top of the file (before
// resetGameField) so they can be cleared from there without TDZ errors.

function _resetBannerDom() {
  // Detach any prior children so we can re-append in the requested order
  while (elBanner.firstChild) elBanner.removeChild(elBanner.firstChild);
}

function showWaveBanner(n) {
  // Dismiss end-of-wave overlays so they don't stack with the new banner
  _elWaveStars?.classList.remove('visible');
  elTooltip.classList.add('hidden');
  clearTimeout(tooltipTimer);
  clearTimeout(_bannerHideTimer);
  clearTimeout(_bannerCleanupTimer);

  // Clear any leftover boss-fight styling from a prior banner
  elBanner.classList.remove('boss-fight');
  _resetBannerDom();
  const isSiege = n % 5 === 0;
  if (isSiege) {
    elBanner.textContent = `⚔️ SIEGE WAVE ${n}!`;
  } else {
    _bannerLeadSpan.textContent = '⚔️ Wave ';
    _bannerNumSpan.textContent  = n;
    elBanner.appendChild(_bannerLeadSpan);
    elBanner.appendChild(_bannerNumSpan);
    elBanner.appendChild(_bannerTrailSpan);
  }
  // Endless-mode telegraph: append a "what's coming" sub-label after wave 12.
  // Helps the player decide where to spend gold before the wave starts.
  const sub = _endlessTelegraph(n);
  if (sub) {
    _bannerSubLabel.textContent = sub;
    elBanner.appendChild(_bannerSubLabel);
  }
  elBanner.classList.add('visible');
  _bannerHideTimer = setTimeout(() => elBanner.classList.remove('visible'), 2200);
}

// Full-screen dramatic banner for the level-end boss fight.
// Larger, purple-themed, and holds longer than a normal wave banner.
function showBossBanner(name) {
  _elWaveStars?.classList.remove('visible');
  elTooltip.classList.add('hidden');
  clearTimeout(tooltipTimer);
  clearTimeout(_bannerHideTimer);
  clearTimeout(_bannerCleanupTimer);
  _resetBannerDom();
  _bannerLeadSpan.textContent = '⚔️ BOSS FIGHT!';
  _bannerBossName.textContent = name;
  elBanner.appendChild(_bannerLeadSpan);
  elBanner.appendChild(_bannerBossName);
  elBanner.classList.add('boss-fight', 'visible');
  _bannerHideTimer = setTimeout(() => {
    elBanner.classList.remove('visible');
    // Defer class cleanup until the transition settles, then drop the boss-fight styling
    _bannerCleanupTimer = setTimeout(() => elBanner.classList.remove('boss-fight'), 400);
  }, 3200);
}

// Feature 3: show wave star overlay
function showWaveStars(waveNum, stars, criteria) {
  const el       = document.getElementById('wave-stars');
  const titleEl  = document.getElementById('wave-stars-title');
  const rowEl    = document.getElementById('wave-stars-row');
  const critEl   = document.getElementById('wave-stars-criteria');
  titleEl.textContent = `Wave ${waveNum} Complete!`;
  let starStr = '';
  for (let i = 1; i <= 3; i++) starStr += (i <= stars ? '⭐' : '☆');
  rowEl.textContent = starStr;
  if (critEl && criteria) {
    critEl.innerHTML = criteria.map(c =>
      `<span class="star-crit${c.earned ? ' earned' : ''}">${c.earned ? '✓' : '✗'} ${c.icon} ${c.label}</span>`
    ).join('');
  }
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 3000);
}

// Feature 4: update lock overlays on build cards
function updateUnlockUI() {
  for (const [tool, unlockWave] of Object.entries(UNLOCK_WAVES)) {
    const card = document.querySelector(`.build-card[data-tool="${tool}"]`);
    if (!card) continue;
    if (UNLOCKED.has(tool)) {
      // Remove lock overlay if present
      const existing = card.querySelector('.card-lock');
      if (existing) existing.remove();
      card.classList.remove('locked');
    } else {
      // Add lock overlay if not already there
      if (!card.querySelector('.card-lock')) {
        const lockDiv = document.createElement('div');
        lockDiv.className = 'card-lock';
        lockDiv.innerHTML = `<span class="card-lock-icon">🔒</span><span class="card-lock-text">Wave ${unlockWave}</span>`;
        card.appendChild(lockDiv);
      }
      card.classList.add('locked');
    }
  }
}

// Feature 6: merchant modal
const MERCHANT_POOL = [
  { icon: '🟡', name: 'Gold Rush',       desc: '+150 gold',                       apply: () => { gold += 150; updateHUD(); } },
  { icon: '🏰', name: 'Fortress Repair', desc: 'Restore 60 castle HP',            apply: () => { castleHp = Math.min(CFG.CASTLE_MAX_HP, castleHp + 60); updateCastleHPBar(); updateCastleHPMesh(); } },
  { icon: '⚡', name: 'Battle Haste',    desc: 'All defenders +30% attack speed for 3 waves', apply: () => { hasteWaves = 3; } },
  { icon: '🛡️', name: 'Iron Warden',    desc: 'All living defenders healed +20 HP', apply: () => { defenders.forEach(d => { if (d.alive && d.type !== 'wall') { d.hp = Math.min(d.maxHp, d.hp + 20); } }); } },
  { icon: '⚗️', name: 'Alchemist Mix',  desc: '+60 gold + repair 30 HP',          apply: () => { gold += 60; castleHp = Math.min(CFG.CASTLE_MAX_HP, castleHp + 30); updateHUD(); updateCastleHPBar(); updateCastleHPMesh(); } },
  { icon: '💎', name: 'Dragon Hoard',   desc: 'Double gold bonus next wave',       apply: () => { doubleBonusWave = true; } },
];

function showMerchant() {
  const modal = document.getElementById('merchant');
  const offersEl = document.getElementById('merchant-offers');
  offersEl.innerHTML = '';
  elBtnStart.disabled = true;
  // Pick 3 random offers
  const shuffled = [...MERCHANT_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
  shuffled.forEach(offer => {
    const card = document.createElement('div');
    card.className = 'merchant-card';
    card.innerHTML = `<div class="merchant-icon">${offer.icon}</div><div class="merchant-name">${offer.name}</div><div class="merchant-desc">${offer.desc}</div>`;
    card.addEventListener('click', () => {
      offer.apply();
      modal.classList.remove('visible');
      elBtnStart.disabled = false;
      updateHUD(); // refresh ready-pulse + next-wave preview now that Start is live again
      showTooltip(`${offer.icon} ${offer.name} activated!`, 2000);
    });
    offersEl.appendChild(card);
  });
  modal.classList.add('visible');
}

document.getElementById('btn-merchant-skip').addEventListener('click', () => {
  document.getElementById('merchant').classList.remove('visible');
  elBtnStart.disabled = false;
  updateHUD(); // refresh ready-pulse + next-wave preview
});

// Feature 2: persistent high score
function saveHighScore() {
  // Guard JSON.parse — a corrupted save shouldn't crash the game-over flow.
  let prev = null;
  try {
    const raw = localStorage.getItem('tdHighScore');
    if (raw) prev = JSON.parse(raw);
  } catch (err) {
    console.warn('tdHighScore corrupted, resetting:', err);
  }
  const isNew = !prev || wave > prev.wave || (wave === prev.wave && kills > prev.kills);
  if (isNew) {
    try { localStorage.setItem('tdHighScore', JSON.stringify({ wave, kills, schemaVersion: 1 })); } catch {}
  }
  return { isNew, prev };
}

// ── Achievements (persisted in localStorage) ─────────────────────────────────
// Each achievement has: id, name, desc, icon, and a check function called whenever
// relevant stats change. _unlockAchievement is idempotent — it no-ops if already unlocked.
const ACHIEVEMENTS = [
  { id: 'firstBlood',     name: 'First Blood',          desc: 'Defeat your first enemy',           icon: '🩸' },
  { id: 'centurion',      name: 'Centurion',            desc: 'Defeat 100 enemies',                icon: '⚔️' },
  { id: 'slayer1000',     name: 'Slayer of a Thousand', desc: 'Defeat 1000 enemies',               icon: '💀' },
  { id: 'bossKill',       name: 'Giant Slayer',         desc: 'Defeat any level boss',             icon: '👑' },
  { id: 'flawlessBoss',   name: 'Untouchable',          desc: 'Defeat a level boss without losing a defender that wave', icon: '🛡️' },
  { id: 'wallEnjoyer',    name: 'Master Mason',         desc: 'Place 50 walls',                    icon: '🧱' },
  { id: 'goldHoarder',    name: 'Gold Hoarder',         desc: 'Hold 500 gold at once',             icon: '💰' },
  { id: 'level3Star',     name: 'Triple Crown',         desc: 'Earn 3 stars on any level',         icon: '⭐' },
  { id: 'allLevelsClear', name: 'World Tour',           desc: 'Complete all 5 levels',             icon: '🌍' },
  { id: 'allLevels3Star', name: 'Perfect Run',          desc: 'Earn 3 stars on all 5 levels',      icon: '🏆' },
  { id: 'endlessWave20',  name: 'Eternal Defender',     desc: 'Reach wave 20 in endless mode',     icon: '♾️' },
  { id: 'rallyMaster',    name: 'Tactical Genius',      desc: 'Set a soldier rally point',         icon: '🚩' },
];
const _ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));

// In-memory state. unlocked is a Set of ids; stats track running counters.
let achievementState = { unlocked: new Set(), stats: { kills: 0, wallsBuilt: 0 } };

function loadAchievements() {
  const data = loadSave('td_achievements', null);
  if (data) {
    achievementState.unlocked = new Set(data.unlocked || []);
    achievementState.stats    = Object.assign({ kills: 0, wallsBuilt: 0 }, data.stats || {});
  }
}
function saveAchievements() {
  saveSave('td_achievements', {
    unlocked: Array.from(achievementState.unlocked),
    stats:    achievementState.stats,
  });
}

function _unlockAchievement(id) {
  if (achievementState.unlocked.has(id)) return;
  const a = _ACHIEVEMENT_BY_ID[id];
  if (!a) return;
  achievementState.unlocked.add(id);
  saveAchievements();
  _showAchievementToast(a);
}

// Bump a counter and re-check threshold achievements that depend on it.
function _bumpStat(name, delta = 1) {
  achievementState.stats[name] = (achievementState.stats[name] || 0) + delta;
  const v = achievementState.stats[name];
  if (name === 'kills') {
    if (v >= 1)    _unlockAchievement('firstBlood');
    if (v >= 100)  _unlockAchievement('centurion');
    if (v >= 1000) _unlockAchievement('slayer1000');
  } else if (name === 'wallsBuilt') {
    if (v >= 50) _unlockAchievement('wallEnjoyer');
  }
  saveAchievements();
}

function _checkLevelAchievements() {
  // Called after recordLevelResult: any 3-star? all 5 levels completed? all 5 at 3 stars?
  let any3Star = false, all5Clear = true, all5Triple = true;
  for (let i = 1; i <= 5; i++) {
    const p = levelProgress[String(i)];
    if (!p?.completed) all5Clear = false;
    if ((p?.bestStars || 0) >= 3) any3Star = true;
    if ((p?.bestStars || 0) < 3) all5Triple = false;
  }
  if (any3Star)    _unlockAchievement('level3Star');
  if (all5Clear)   _unlockAchievement('allLevelsClear');
  if (all5Triple)  _unlockAchievement('allLevels3Star');
}

// ── Level progression (persisted in localStorage) ──
function loadLevelProgress() {
  const data = loadSave('td_level_progress', null);
  if (data && typeof data === 'object') levelProgress = data;
  // Level 1 is always unlocked
  if (!levelProgress['1']) levelProgress['1'] = { unlocked: true, bestStars: 0, completed: false };
  return levelProgress;
}
function saveLevelProgress() {
  saveSave('td_level_progress', levelProgress);
}
function isLevelUnlocked(id) {
  if (id === 1) return true;
  if (id === 'endless') return !!(levelProgress['5']?.completed);
  const prev = levelProgress[String(id - 1)];
  return !!(prev?.completed);
}
function recordLevelResult(id, stars) {
  const key = String(id);
  const cur = levelProgress[key] || { unlocked: true, bestStars: 0, completed: false };
  // Capture previous completion state BEFORE the mutation below, so we can tell
  // the caller whether this completion was the one that unlocked the next level.
  const prevCompleted = !!cur.completed;
  const isNewRecord = stars > (cur.bestStars || 0);
  if (isNewRecord) cur.bestStars = stars;
  cur.completed = cur.completed || stars >= 1;  // completed if ≥1 star
  cur.unlocked  = true;

  // Track best clear time per difficulty (only if completed with ≥1 star)
  if (stars >= 1 && _levelRunStartMs) {
    const elapsed = _levelElapsedMs();
    cur.bestTimes = cur.bestTimes || {};
    const prevTime = cur.bestTimes[currentDifficulty];
    if (!prevTime || elapsed < prevTime) cur.bestTimes[currentDifficulty] = elapsed;
  }

  levelProgress[key] = cur;
  // Unlock next level if earned ≥1 star
  if (typeof id === 'number' && stars >= 1) {
    const nextKey = String(id + 1);
    if (!levelProgress[nextKey]) levelProgress[nextKey] = { unlocked: true, bestStars: 0, completed: false };
    else levelProgress[nextKey].unlocked = true;
  }
  saveLevelProgress();
  // Achievements: any 3-star + all 5 levels + all 5 at 3 stars
  _checkLevelAchievements();
  return { isNewRecord, unlockedNext: typeof id === 'number' && stars >= 1 && !prevCompleted };
}

// ─────────────────────────────────────────────
//  LEVEL FLOW
// ─────────────────────────────────────────────
// Reset all per-run game state (called when starting a new level or retrying).
// Does NOT reload the page — preserves level progress, settings, unlocks.
// Per-run counters for the game-over summary. Reset with the run; incremented
// at the kill-reward, wave-bonus, and defender-placement sites.
const _runStats = { goldEarned: 0, defendersBuilt: 0, startMs: 0 };

function _resetRunState() {
  gameOver = false;
  waveActive = false;
  castleHp = CFG.CASTLE_MAX_HP;
  kills = 0;
  _runStats.goldEarned = 0;
  _runStats.defendersBuilt = 0;
  _runStats.startMs = Date.now();
  totalStars = 0;
  levelStarsEarned = 0;
  levelWaveStars.length = 0;
  hasteWaves = 0;
  doubleBonusWave = false;
  streakCount = 0;
  lastKillTime = 0;
  rageMultiplier = 1.0;
  lastStandActive = false;
  lastStandTimer = 0;
  // Reset endless milestone-granted defender slots so the next run starts fresh
  CFG.MAX_DEFENDERS = 14;
  spawnQueue.length = 0;
  spawnTimer = 0;
  // Cancel any pending Level Complete modal from a previous run
  if (_levelCompleteTimer) { clearTimeout(_levelCompleteTimer); _levelCompleteTimer = null; }
  // Reset defender unlocks to baseline — wall/tower/swordsman are always available
  UNLOCKED.clear();
  UNLOCKED.add('wall'); UNLOCKED.add('tower'); UNLOCKED.add('swordsman');
  // Hide UI overlays
  if (elGameOver) elGameOver.classList.remove('visible');
  const lc = document.getElementById('level-complete'); if (lc) lc.classList.remove('visible');
  if (elBtnStart) { elBtnStart.disabled = false; elBtnStart.style.display = ''; }
  // Full field clear (quiet — startLevel shows its own tooltip)
  resetGameField({ quiet: true });
  updateCastleHPMesh?.();
  updateCastleHPBar?.();
  updateHUD?.();
}

function startLevel(id) {
  const lvl = (id === 'endless') ? ENDLESS_LEVEL : LEVELS.find(L => L.id === id);
  if (!lvl) return;
  if (!isLevelUnlocked(id)) return;
  applyDifficulty();                    // ensure difficultyMult + music mood reflect the current pick
  _levelRunStartMs = Date.now();        // start clock for "best time"
  currentLevel = lvl;
  hideLevelSelect();
  _resetRunState();
  // Apply biome + layout for this level
  applyLayout(lvl.layout);
  applyBiome(lvl.biome);
  // Per-level base theme (overrides the layout-derived song so each realm sounds distinct)
  try { SND.setSong(LEVEL_SONGS[lvl.id] || 'classic'); } catch {}
  wave = lvl.startWave - 1; // Start button will increment to startWave
  gold = lvl.startGold;
  // Pre-populate unlocks the player would have earned by reaching this wave in normal progression
  for (const [tool, unlockWave] of Object.entries(UNLOCK_WAVES)) {
    if (wave >= unlockWave) UNLOCKED.add(tool);
  }
  updateHUD();
  updateUnlockUI();
  // Make sure the game loop is running (may have been paused on Level Select)
  if (gameSpeed === 0) { gameSpeed = 1; const p = document.getElementById('btn-pause'); if (p) p.textContent = '⏸ Pause'; }
  const diffLabel = DIFFICULTY_PRESETS[currentDifficulty].label;
  showTooltip(`Level ${lvl.id === 'endless' ? '∞' : lvl.id}: ${lvl.name}  •  ${diffLabel}`, 2600);
}

function showLevelSelect(opts = {}) {
  currentLevel = null;
  waveActive = false;
  gameSpeed = 0;
  // Cancel any pending Level Complete modal from a wave that cleared moments ago
  if (_levelCompleteTimer) { clearTimeout(_levelCompleteTimer); _levelCompleteTimer = null; }
  const elLS = document.getElementById('level-select');
  if (!elLS) return;
  if (elGameOver) elGameOver.classList.remove('visible');
  const lc = document.getElementById('level-complete'); if (lc) lc.classList.remove('visible');
  const esc = document.getElementById('esc-menu'); if (esc) esc.classList.remove('open');

  // ── Build world-map nodes (tile terrain + dotted breadcrumb path + numbered tiles) ──
  const map = document.getElementById('ls-map');
  if (map) {
    map.innerHTML = '';

    // Node positions on the winding path (% of container width/height)
    const positions = [
      { x: 14, y: 74 },   // L1 – meadow (bottom-left) – home castle
      { x: 32, y: 34 },   // L2 – desert (upper-left)
      { x: 50, y: 60 },   // L3 – icelands (middle)
      { x: 70, y: 28 },   // L4 – lava (upper-right)
      { x: 88, y: 58 },   // L5 – abyss (bottom-right)
    ];

    // Figure out the next recommended level (first unlocked + not fully 3-starred)
    let nextId = null;
    for (const L of LEVELS) {
      const p = levelProgress[String(L.id)];
      if (isLevelUnlocked(L.id) && (!p || (p.bestStars || 0) < LEVEL_MAX_STARS)) { nextId = L.id; break; }
    }

    // ── ROADMAP PATH: one smooth spline threading the five nodes ──
    // viewBox 0..100 with preserveAspectRatio:none so node %-positions line up exactly.
    const NS = 'http://www.w3.org/2000/svg';
    const pathSvg = document.createElementNS(NS, 'svg');
    pathSvg.setAttribute('class', 'ls-path-svg');
    pathSvg.setAttribute('viewBox', '0 0 100 100');
    pathSvg.setAttribute('preserveAspectRatio', 'none');
    // Catmull-Rom → cubic Bézier for a soft, natural curve through the points.
    const _spline = (pts) => {
      if (pts.length < 2) return '';
      let d = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
        const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
        const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
        d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
      }
      return d;
    };
    const _dPath = _spline(positions);
    const track = document.createElementNS(NS, 'path');
    track.setAttribute('d', _dPath); track.setAttribute('class', 'ls-track');
    pathSvg.appendChild(track);
    const dash = document.createElementNS(NS, 'path');
    dash.setAttribute('d', _dPath); dash.setAttribute('class', 'ls-stripe');
    pathSvg.appendChild(dash);
    map.appendChild(pathSvg);

    // ── Draw level nodes (clean circular biome medallions) ──
    // Per-biome medallion ring colour (matches each realm's theme)
    const _ringColors = ['#6cc24a', '#e0a83a', '#5ab4e0', '#e0542a', '#a85ad8'];
    LEVELS.forEach((L, i) => {
      const pos = positions[i];
      const unlocked  = isLevelUnlocked(L.id);
      const stars     = levelProgress[String(L.id)]?.bestStars || 0;
      const completed = levelProgress[String(L.id)]?.completed || false;
      const isNext    = L.id === nextId;

      const node = document.createElement('div');
      node.className = 'ls-node'
        + (unlocked ? ' unlocked' : ' ls-locked')
        + (completed ? ' done' : '')
        + (isNext ? ' next' : '');
      node.dataset.biome = String(L.biome);
      node.style.left = pos.x + '%';
      node.style.top  = pos.y + '%';
      node.style.setProperty('--ring', _ringColors[L.biome] || '#cf8a10');

      const starsHtml = Array.from({length: LEVEL_MAX_STARS}, (_, si) =>
        `<span class="ls-star${si < stars ? ' earned' : ''}">${si < stars ? '★' : '☆'}</span>`
      ).join('');

      // Best time tag (only shows once the level has been completed at least once on this difficulty)
      const bestMs = (levelProgress[String(L.id)]?.bestTimes || {})[currentDifficulty];
      const bestHtml = (unlocked && bestMs)
        ? `<span class="ls-node-best">⏱ ${_formatTimeMs(bestMs)}</span>` : '';

      node.innerHTML = `
        <div class="ls-tile">
          <span class="ls-tile-icon">${unlocked ? (L.icon || '🚩') : '🔒'}</span>
          <span class="ls-node-num">${L.id}</span>
        </div>
        <div class="ls-node-label">
          <div class="ls-node-name">${unlocked ? L.name : 'Locked'}</div>
          <div class="ls-node-stars">${unlocked ? starsHtml : ''}</div>
          ${unlocked && L.boss ? `<div class="ls-node-boss" title="This realm's final wave is a boss fight">👑 ${L.boss.name}</div>` : ''}
          ${unlocked ? `<div class="ls-node-waves">Waves ${L.startWave}–${L.endWave}</div>` : ''}
          ${bestHtml}
        </div>
      `;

      if (unlocked) {
        node.addEventListener('click', () => { SND.btnClick?.(); startLevel(L.id); });
      }
      map.appendChild(node);
    });

    // ── Endless button (bottom-right) — shows per-difficulty personal best ──
    const endlessUnlocked = isLevelUnlocked('endless');
    const endlessNode = document.createElement('div');
    endlessNode.className = 'ls-endless-btn' + (endlessUnlocked ? ' unlocked' : ' ls-locked');
    if (endlessUnlocked) {
      const best = loadEndlessBest(currentDifficulty);
      const bestLine = best
        ? `<div style="font-size:11px;letter-spacing:0.18em;color:#ffd86a;margin-top:2px;text-shadow:0 1px 0 #2a1400;">🏆 BEST: WAVE ${best.wave}</div>`
        : `<div style="font-size:11px;letter-spacing:0.18em;color:rgba(255,240,200,0.55);margin-top:2px;">— NO RECORD —</div>`;
      endlessNode.innerHTML = `<div>♾️ Endless</div>${bestLine}`;
      endlessNode.addEventListener('click', () => { SND.btnClick?.(); startLevel('endless'); });
    } else {
      endlessNode.textContent = 'Endless (locked)';
    }
    map.appendChild(endlessNode);

    // ── TITLE ──
    const banner = document.createElement('div');
    banner.className = 'ls-title-banner';
    {
      // Aggregate star progress across all story realms — visible without opening Records
      let starSum = 0;
      for (const L of LEVELS) starSum += levelProgress[String(L.id)]?.bestStars || 0;
      const starMax = LEVELS.length * LEVEL_MAX_STARS;
      banner.innerHTML = `Select a Realm<span class="lt-sub">THE FIVE REALMS OF AVALON` +
        (starSum > 0 ? ` &nbsp;·&nbsp; ${starSum} / ${starMax} ⭐` : '') + `</span>`;
    }
    map.appendChild(banner);

    // ── RECORDS BUTTON (top-right) — opens the stats/records screen ──
    const recordsBtn = document.createElement('button');
    recordsBtn.className = 'ls-records-btn';
    recordsBtn.textContent = '📊 RECORDS';
    recordsBtn.addEventListener('click', () => { SND.btnClick?.(); showStats(); });
    map.appendChild(recordsBtn);

    // ── DIFFICULTY SELECTOR (bottom-center pill) ──
    const diffBar = document.createElement('div');
    diffBar.className = 'ls-difficulty';
    diffBar.innerHTML = `
      <span class="lsd-label">DIFFICULTY</span>
      <button class="lsd-btn ${currentDifficulty==='easy'?'active':''}"   data-diff="easy">${DIFFICULTY_PRESETS.easy.icon} ${DIFFICULTY_PRESETS.easy.label}</button>
      <button class="lsd-btn ${currentDifficulty==='normal'?'active':''}" data-diff="normal">${DIFFICULTY_PRESETS.normal.icon} ${DIFFICULTY_PRESETS.normal.label}</button>
      <button class="lsd-btn ${currentDifficulty==='hard'?'active':''}"   data-diff="hard">${DIFFICULTY_PRESETS.hard.icon} ${DIFFICULTY_PRESETS.hard.label}</button>
    `;
    diffBar.querySelectorAll('.lsd-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = btn.dataset.diff;
        if (d === currentDifficulty) return;
        currentDifficulty = d;
        applyDifficulty();
        saveDifficulty();
        SND.btnClick?.();
        // Re-render so personal-best displays update for the new difficulty
        showLevelSelect(opts);
      });
    });
    map.appendChild(diffBar);
  }

  const closeBtn = document.getElementById('ls-close');
  if (closeBtn) closeBtn.style.display = opts.showClose ? '' : 'none';
  elLS.classList.add('visible');
}

function hideLevelSelect() {
  const elLS = document.getElementById('level-select');
  if (elLS) elLS.classList.remove('visible');
}

// ─────────────────────────────────────────────
//  STATS / RECORDS SCREEN
//  Aggregates everything tracked across runs:
//    • lifetime stats (kills, walls)
//    • per-story-level stars + best clear time per difficulty
//    • per-difficulty endless personal best
//    • achievement progress
// ─────────────────────────────────────────────
function showStats() {
  const el = document.getElementById('stats-screen');
  if (!el) return;
  const body = document.getElementById('stats-body');
  if (!body) return;

  // ── Lifetime stats ──
  const lifeKills = achievementState.stats.kills || 0;
  const lifeWalls = achievementState.stats.wallsBuilt || 0;
  const achTotal  = ACHIEVEMENTS.length;
  const achHave   = achievementState.unlocked.size;
  // Story progress: % of available stars earned
  let starsEarned = 0;
  let starsPossible = LEVELS.length * LEVEL_MAX_STARS;
  let levelsCompleted = 0;
  for (const L of LEVELS) {
    const p = levelProgress[String(L.id)];
    if (p?.completed) levelsCompleted++;
    starsEarned += p?.bestStars || 0;
  }
  const completionPct = Math.round((starsEarned / starsPossible) * 100);

  // ── Story table ──
  const diffKeys = ['easy', 'normal', 'hard'];
  const rowsHtml = LEVELS.map(L => {
    const p = levelProgress[String(L.id)] || {};
    const bs = p.bestStars || 0;
    const starsCell = bs > 0
      ? `<span class="st-stars">${'★'.repeat(bs)}<span class="empty">${'★'.repeat(LEVEL_MAX_STARS - bs)}</span></span>`
      : `<span class="st-stars empty">${'★'.repeat(LEVEL_MAX_STARS)}</span>`;
    const timeCells = diffKeys.map(d => {
      const t = p.bestTimes?.[d];
      return t ? `<td>${starsCell}<span class="st-time">${_formatTimeMs(t)}</span></td>`
               : `<td><span class="st-none">—</span></td>`;
    }).join('');
    return `<tr>
      <td class="st-name">${L.icon} ${L.name}</td>
      ${timeCells}
    </tr>`;
  }).join('');

  // ── Endless table ──
  const endlessRows = diffKeys.map(d => {
    const best = loadEndlessBest(d);
    const cls = `se-${d}`;
    if (best) {
      return `<div class="se-diff ${cls}">${DIFFICULTY_PRESETS[d].icon} ${DIFFICULTY_PRESETS[d].label}</div>
              <div class="se-val">Wave ${best.wave} • ${best.kills} kills</div>`;
    }
    return `<div class="se-diff ${cls}">${DIFFICULTY_PRESETS[d].icon} ${DIFFICULTY_PRESETS[d].label}</div>
            <div class="se-val st-none">— no record —</div>`;
  }).join('');

  // ── Achievements grid ──
  // Progress counts for counter-based achievements ("47 / 100" beats a bare lock)
  const ACH_PROGRESS = {
    centurion:   () => [achievementState.stats.kills || 0, 100],
    slayer1000:  () => [achievementState.stats.kills || 0, 1000],
    wallEnjoyer: () => [achievementState.stats.wallsBuilt || 0, 50],
  };
  const achHtml = ACHIEVEMENTS.map(a => {
    const have = achievementState.unlocked.has(a.id);
    let prog = '';
    if (!have && ACH_PROGRESS[a.id]) {
      const [cur, goal] = ACH_PROGRESS[a.id]();
      prog = `<span class="sa-prog">${Math.min(cur, goal)} / ${goal}</span>`;
    }
    return `<div class="stats-ach ${have ? '' : 'locked'}" title="${a.desc}">
      <span class="sa-icon">${have ? a.icon : '🔒'}</span>
      <span class="sa-name">${a.name}</span>${prog}
    </div>`;
  }).join('');

  body.innerHTML = `
    <div class="stats-section">
      <div class="stats-section-title">LIFETIME</div>
      <div class="stats-grid">
        <div><span class="sg-key">Total kills</span>      <span class="sg-val">${lifeKills.toLocaleString()}</span></div>
        <div><span class="sg-key">Walls built</span>      <span class="sg-val">${lifeWalls.toLocaleString()}</span></div>
        <div><span class="sg-key">Levels completed</span> <span class="sg-val">${levelsCompleted} / ${LEVELS.length}</span></div>
        <div><span class="sg-key">Stars earned</span>     <span class="sg-val">${starsEarned} / ${starsPossible} (${completionPct}%)</span></div>
        <div><span class="sg-key">Achievements</span>     <span class="sg-val">${achHave} / ${achTotal}</span></div>
        <div><span class="sg-key">Difficulty</span>       <span class="sg-val">${DIFFICULTY_PRESETS[currentDifficulty].icon} ${DIFFICULTY_PRESETS[currentDifficulty].label}</span></div>
      </div>
    </div>

    <div class="stats-section">
      <div class="stats-section-title">STORY MODE — BEST RUN PER DIFFICULTY</div>
      <table class="stats-table">
        <thead>
          <tr><th class="st-name">Level</th>
              <th>${DIFFICULTY_PRESETS.easy.icon} Easy</th>
              <th>${DIFFICULTY_PRESETS.normal.icon} Normal</th>
              <th>${DIFFICULTY_PRESETS.hard.icon} Hard</th></tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>

    <div class="stats-section">
      <div class="stats-section-title">ENDLESS MODE — PERSONAL BEST</div>
      <div class="stats-endless-row">${endlessRows}</div>
    </div>

    <div class="stats-section">
      <div class="stats-section-title">ACHIEVEMENTS — ${achHave} / ${achTotal}</div>
      <div class="stats-ach-grid">${achHtml}</div>
    </div>
  `;
  el.classList.add('visible');
}
function hideStats() {
  document.getElementById('stats-screen')?.classList.remove('visible');
}

function showLevelComplete(lvl, stars, isNewRecord, unlockedNext, timeInfo = null) {
  const el = document.getElementById('level-complete');
  if (!el) return;
  // Big fanfare on entry — bigger than the per-wave waveComplete sting
  try { SND.levelVictory?.(); } catch {}
  const diffLabel = DIFFICULTY_PRESETS[currentDifficulty].label;
  document.getElementById('lc-title').textContent = `${lvl.icon} ${lvl.name}`;
  document.getElementById('lc-subtitle').textContent = `Level Complete! • ${diffLabel}`;
  const starsRow = Array.from({length: LEVEL_MAX_STARS}, (_, i) => i < stars ? '⭐' : '☆').join('  ');
  document.getElementById('lc-stars-row').textContent = starsRow;
  document.getElementById('lc-stars-label').textContent = `${stars} / ${LEVEL_MAX_STARS} Stars`;

  // Best-time line: shows current run + best record for this difficulty,
  // with a "NEW BEST!" badge when the player beats their previous PB.
  const lcTimeEl = document.getElementById('lc-time');
  if (lcTimeEl) {
    if (timeInfo && timeInfo.runMs > 0) {
      const cur = _formatTimeMs(timeInfo.runMs);
      let html = `⏱ Time: <span class="lct-best">${cur}</span>`;
      if (timeInfo.isNewBestTime) {
        html += `<span class="lct-pb">NEW BEST!</span>`;
        if (timeInfo.prevBestTime) {
          const delta = _formatTimeMs(timeInfo.prevBestTime - timeInfo.runMs);
          html += `<div style="font-size:11px;opacity:0.75;margin-top:2px;letter-spacing:0.10em">previous: ${_formatTimeMs(timeInfo.prevBestTime)}  (–${delta})</div>`;
        }
      } else if (timeInfo.prevBestTime) {
        html += `<div style="font-size:11px;opacity:0.75;margin-top:2px;letter-spacing:0.10em">best: ${_formatTimeMs(timeInfo.prevBestTime)}</div>`;
      }
      lcTimeEl.innerHTML = html;
    } else {
      lcTimeEl.innerHTML = '';
    }
  }

  document.getElementById('lc-record').textContent = isNewRecord ? '🏆 New Star Record!' : '';
  let unlockMsg = '';
  if (unlockedNext) {
    const nextLvl = LEVELS.find(L => L.id === lvl.id + 1);
    if (nextLvl) unlockMsg = `🔓 ${nextLvl.name} unlocked!`;
    else if (lvl.id === 5) unlockMsg = '🏆 Endless Mode unlocked!';
  }
  document.getElementById('lc-unlock').textContent = unlockMsg;
  // Show "Next Level" button if there's a next level and the player earned at least 1 star
  const nextBtn = document.getElementById('lc-next');
  if (nextBtn) {
    const nextLvl = typeof lvl.id === 'number' ? LEVELS.find(L => L.id === lvl.id + 1) : null;
    if (nextLvl && stars >= 1) {
      nextBtn.style.display = '';
      nextBtn.textContent = `▶ ${nextLvl.icon || ''} ${nextLvl.name}`.trim();
      nextBtn.dataset.nextId = String(nextLvl.id);
    } else if (lvl.id === 5 && stars >= 1) {
      nextBtn.style.display = '';
      nextBtn.textContent = '▶ 🏆 Endless Mode';
      nextBtn.dataset.nextId = 'endless';
    } else {
      nextBtn.style.display = 'none';
      nextBtn.dataset.nextId = '';
    }
  }
  el.classList.add('visible');
  gameSpeed = 0;
}

function hideLevelComplete() {
  document.getElementById('level-complete')?.classList.remove('visible');
}

function triggerGameOver() {
  gameOver = true;
  SND.gameOver();
  elGameOver.classList.add('visible');
  elBtnStart.disabled = true;
  // Mode-specific stats line
  const isEndlessRun = currentLevel && currentLevel.id === 'endless';
  const modeLabel = isEndlessRun
    ? `Endless • ${DIFFICULTY_PRESETS[currentDifficulty].label}`
    : (currentLevel ? `${currentLevel.name} • ${DIFFICULTY_PRESETS[currentDifficulty].label}` : `${DIFFICULTY_PRESETS[currentDifficulty].label}`);
  if (elGoStats) elGoStats.textContent = `${modeLabel}  •  Wave ${wave} • ${kills} kills • ${CFG.CASTLE_MAX_HP - castleHp} damage taken`;
  // Run summary — the reward-loop recap a long run deserves
  const elGoSummary = document.getElementById('go-summary');
  if (elGoSummary) {
    const mins = Math.max(0, Math.floor((Date.now() - (_runStats.startMs || Date.now())) / 60000));
    const secs = Math.max(0, Math.floor((Date.now() - (_runStats.startMs || Date.now())) / 1000) % 60);
    elGoSummary.innerHTML =
      `<span>🟡 ${_runStats.goldEarned} gold earned</span>` +
      `<span>🛡️ ${_runStats.defendersBuilt} defenders built</span>` +
      `<span>⏱ ${mins}:${String(secs).padStart(2, '0')} survived</span>`;
  }
  // Retry label: "Retry Level" only makes sense in story mode
  const goRetry = document.getElementById('btn-retry');
  if (goRetry) goRetry.textContent = currentLevel && currentLevel.id !== 'endless' ? '🔄 Retry Level' : '🔄 New Run';
  // Feature 3: show total stars
  const elGoStarsEl = document.getElementById('go-stars');
  if (elGoStarsEl) elGoStarsEl.textContent = `Stars earned: ${totalStars} ⭐`;
  // Personal best — endless gets per-difficulty record, story uses global high score
  const elGoHighscore = document.getElementById('go-highscore');
  if (elGoHighscore) {
    if (isEndlessRun) {
      const res = maybeUpdateEndlessBest();
      if (res?.isNew) {
        elGoHighscore.innerHTML = `🏆 NEW ENDLESS RECORD!<br><span style="font-size:14px;opacity:0.85">${DIFFICULTY_PRESETS[currentDifficulty].label} • Wave ${wave} • ${kills} kills</span>`;
      } else if (res?.prev) {
        elGoHighscore.textContent = `Endless Best (${DIFFICULTY_PRESETS[currentDifficulty].label}): Wave ${res.prev.wave} • ${res.prev.kills} kills`;
      } else {
        elGoHighscore.textContent = '';
      }
    } else {
      const { isNew, prev } = saveHighScore();
      if (isNew) {
        elGoHighscore.textContent = '🏆 New Record!';
      } else if (prev) {
        elGoHighscore.textContent = `Personal Best: Wave ${prev.wave} • ${prev.kills} kills`;
      } else {
        elGoHighscore.textContent = '';
      }
    }
  }
}

// ─────────────────────────────────────────────
//  EASING
// ─────────────────────────────────────────────
function easeOutBounce(x) {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1/d1)       return n1*x*x;
  if (x < 2/d1)       return n1*(x -= 1.5/d1)*x + 0.75;
  if (x < 2.5/d1)     return n1*(x -= 2.25/d1)*x + 0.9375;
  return n1*(x -= 2.625/d1)*x + 0.984375;
}

// ─────────────────────────────────────────────
//  CASTLE DEFENSE TURRETS
//  Three virtual archers on the castle wall face, one per road entrance.
//  They activate whenever enemies enter within CASTLE_TURRET_RANGE.
// ─────────────────────────────────────────────
const CASTLE_TURRET_RANGE = 5.5;
const CASTLE_TURRET_RATE  = 0.55; // arrows per second per turret
const CASTLE_TURRETS = [
  { group: { position: new THREE.Vector3(66, 0, 24) }, type: 'wall', pSpeed: 16, dmg: 1.5, cooldown: 0 },
  { group: { position: new THREE.Vector3(66, 0, 27) }, type: 'wall', pSpeed: 16, dmg: 1.5, cooldown: 0 },
  { group: { position: new THREE.Vector3(66, 0, 30) }, type: 'wall', pSpeed: 16, dmg: 1.5, cooldown: 0 },
];

function updateCastleTurrets(dt) {
  if (!waveActive) return;
  for (const turret of CASTLE_TURRETS) {
    turret.cooldown = Math.max(0, turret.cooldown - dt);
    if (turret.cooldown > 0) continue;
    let best = null, bestDist2 = CASTLE_TURRET_RANGE * CASTLE_TURRET_RANGE;
    for (const o of orcs) {
      if (!o.alive) continue;
      const d2 = turret.group.position.distanceToSquared(o.group.position);
      if (d2 < bestDist2) { best = o; bestDist2 = d2; }
    }
    if (best) {
      fireProjectile('arrow', turret, best);
      turret.cooldown = 1 / CASTLE_TURRET_RATE;
    }
  }
}

// ─────────────────────────────────────────────
//  GAME LOOP
// ─────────────────────────────────────────────
const clock = new THREE.Clock();
let _gameLoopRafId = null; // track pending rAF so enterTestMode can cancel it

// ── Headless / CI mode ──────────────────────────────────────────────────────
// `?headless` skips almost all rendering so the TEST harness can run game
// logic at full speed under software GL (CI containers, headless Chromium,
// where a full render takes 300ms+). One frame per second is still drawn so
// screenshots stay meaningful.
const HEADLESS = new URLSearchParams(window.location.search).has('headless');
let _lastHeadlessRenderMs = 0;
let _defVoiceTimer = 5 + Math.random() * 7;   // seconds until next defender chatter
let _orcVoiceTimer = 3 + Math.random() * 6;   // seconds until next enemy roar
let _intensityCheckTimer = 0;

// MessageChannel-based ticker for test mode — bypasses Chrome's background-tab
// timer throttling (setTimeout ≥ 16ms gets clamped to ~10s in inactive tabs).
// MessageChannel message delivery is never throttled.
const _mcTick = new MessageChannel();
let _mcTickEnabled = false;
let _mcLastFrame = 0;
_mcTick.port1.onmessage = () => {
  if (!_mcTickEnabled) return;
  const now = performance.now();
  if (now - _mcLastFrame >= 16) {
    // 16ms elapsed — run a real frame
    _mcLastFrame = now;
    gameLoop(); // gameLoop calls _scheduleTestTick() at the top, continuing the chain
  } else {
    // Not yet — re-post immediately (MC is never background-throttled)
    _scheduleTestTick();
  }
};
function _scheduleTestTick() { _mcTick.port2.postMessage(null); }
// Non-throttled delay resolved in gameLoop (avoids background setTimeout throttling)
function _testWait(ms) {
  return new Promise(res => { window._waitWatcher = { resolve: res, end: performance.now() + ms }; });
}

function gameLoop() {
  if (!testMode) _gameLoopRafId = requestAnimationFrame(gameLoop);
  else if (_mcTickEnabled) _scheduleTestTick();
  const rawDt = Math.min(clock.getDelta(), 0.05); // wall-clock step — drives ambience (clouds, motes)
  const dt = rawDt * gameSpeed;
  const t  = clock.elapsedTime;
  gameTime += dt;

  if (!gameOver) {
    // Substep the combat simulation so high game speeds stay accurate at low
    // frame rates: a single 0.1-0.2s step makes enemies blow past engagement
    // checks and defenders lose whole attack windows, so 2×/4× play on a slow
    // machine (or the headless test harness) silently favored the attackers.
    // Animations read phase fields, so passing the same `t` per substep is fine.
    const MAX_STEP = 1 / 30;
    let _remaining = dt;
    do {
      const sdt = Math.min(_remaining, MAX_STEP);
      _remaining -= sdt;
      updateSpawner(sdt);
      updateTestSpawner(sdt);
      updateOrcs(sdt, t);
      updateDefenders(sdt, t);
      updateCastleTurrets(sdt);
      updateProjectiles(sdt);
      updateVFX(sdt);
      updateWebZones(sdt);
    } while (_remaining > 1e-9);

    // ── Dynamic music intensity ───────────────────────────────────────────
    _intensityCheckTimer -= dt;
    if (_intensityCheckTimer <= 0) {
      _intensityCheckTimer = 3.5;
      if (!testMode) {
        if (waveActive && !gameOver) {
          const castleRatio = Math.max(0, castleHp / CFG.CASTLE_MAX_HP);
          let liveCount = 0; for (const o of orcs) if (o.alive) liveCount++;
          let score = Math.min((wave - 1) / 15, 0.35)
                    + (1 - castleRatio) * 0.50
                    + Math.min(liveCount / 12, 0.15);
          SND.setIntensity(score < 0.15 ? 0 : score < 0.40 ? 1 : score < 0.65 ? 2 : 3);
        } else {
          SND.setIntensity(0);
        }
      }
    }

    // ── Ambient battlefield voices ────────────────────────────────────────
    if (waveActive && !testMode) {
      _defVoiceTimer -= dt;
      if (_defVoiceTimer <= 0) {
        let _tCount = 0;
        for (const d of defenders) if (d.alive && (d.type==='swordsman'||d.type==='knight'||d.type==='spearman'||d.type==='archer')) _tCount++;
        if (_tCount > 0) {
          let _pick = Math.floor(Math.random() * _tCount), _found = null;
          for (const d of defenders) { if (d.alive && (d.type==='swordsman'||d.type==='knight'||d.type==='spearman'||d.type==='archer')) { if (_pick-- === 0) { _found = d; break; } } }
          if (_found) SND.defVoice(_found.type);
        }
        _defVoiceTimer = 8 + Math.random() * 10;
      }
      _orcVoiceTimer -= dt;
      if (_orcVoiceTimer <= 0) {
        let _oCount = 0;
        for (const o of orcs) if (o.alive) _oCount++;
        if (_oCount > 0) {
          let _pick = Math.floor(Math.random() * _oCount), _found = null;
          for (const o of orcs) { if (o.alive) { if (_pick-- === 0) { _found = o; break; } } }
          if (_found) SND.orcAmbient(_found.type);
        }
        _orcVoiceTimer = 5 + Math.random() * 8;
      }
    }

    if (!testMode) checkWaveEnd();
    window._testInspectorTick?.();
    // TEST.battle watcher — checked every game frame so it fires promptly without setTimeout
    if (window._battleWatcher) {
      const w = window._battleWatcher;
      const killed  = Object.values(w.bs.enemies.killed).reduce((a,b)=>a+b,0);
      const escaped = Object.values(w.bs.enemies.escaped).reduce((a,b)=>a+b,0);
      const allDone = w.totalSpawned === 0 || (killed + escaped) >= w.totalSpawned;
      if (allDone || performance.now() >= w.end) { window._battleWatcher = null; w.resolve(); }
    }
    if (window._waitWatcher && performance.now() >= window._waitWatcher.end) {
      const w = window._waitWatcher; window._waitWatcher = null; w.resolve();
    }
    // Feature 10: last stand countdown
    if (lastStandActive) {
      lastStandTimer -= dt;
      if (elLastStandSecs) elLastStandSecs.textContent = Math.ceil(Math.max(0, lastStandTimer));
      if (lastStandTimer <= 0) {
        lastStandActive = false;
        elLastStand?.classList.remove('active');
        elLastStandTimer?.classList.remove('active');
        if (!testMode) triggerGameOver();
      }
    }

    updateClouds(t);
  updateAmbientParticles(rawDt, t);
  updateDayNight(t);
  M.pathMat.emissiveIntensity = 0.07 + Math.sin(t * 2.5) * 0.04;
    M.waterDeep.emissiveIntensity    = 0.28 + Math.sin(t * 1.7) * 0.12;
    M.waterShallow.emissiveIntensity = 0.18 + Math.sin(t * 1.4 + 0.6) * 0.09;
    waterSurfaces.forEach(ws => {
      ws.mesh.position.y = ws.baseY + Math.sin(t * 1.6 + ws.phase) * 0.012;
      ws.mesh.material.opacity = 0.44 + Math.sin(t * 2.1 + ws.phase) * 0.08;
    });
    torchL.intensity = 1.6 + Math.sin(t * 13.7) * 0.3 + Math.sin(t * 7.3) * 0.2;
    torchR.intensity = 1.6 + Math.sin(t * 11.1) * 0.3 + Math.sin(t * 8.9) * 0.2;
    castleGlow.intensity = 2.2 + Math.sin(t * 2.2) * 0.6 + Math.sin(t * 5.1) * 0.3;
    M.crystal.emissiveIntensity = 1.0 + Math.sin(t * 3.5) * 0.4;
    // Lantern flicker — emissive material + actual point lights
    const lFlicker = 2.0 + Math.sin(t * 8.3) * 0.3 + Math.sin(t * 14.7) * 0.15;
    M.lanternGlow.emissiveIntensity = lFlicker;
    const ptFlicker = 0.9 + Math.sin(t * 8.3) * 0.25 + Math.sin(t * 13.1) * 0.12;
    for (let li = 0; li < lanternLights.length; li++) lanternLights[li].intensity = ptFlicker;
  }

  updateGhostPreview();

  // Screen shake — offset camera, then decay
  if (shakeAmt > 0.002) {
    camera.position.x += (Math.random() - 0.5) * shakeAmt;
    camera.position.y += (Math.random() - 0.5) * shakeAmt * 0.4;
    camera.position.z += (Math.random() - 0.5) * shakeAmt;
    shakeAmt *= 0.78;
  } else {
    shakeAmt = 0;
  }

  // Castle hit flash — same emissive decay as defenders
  if (castleGroup && castleHitTimer > 0) {
    castleHitTimer -= dt;
    const fi = Math.max(0, castleHitTimer * 8);
    castleGroup.userData.hitFlashMeshes.forEach(m => {
      _forMats(m, mat => {
        mat.emissiveIntensity = fi;
        if (castleHitTimer <= 0) {
          if (mat.emissive) mat.emissive.set(m.userData.origEmissive || new THREE.Color(0));
          mat.emissiveIntensity = 0;
        }
      });
    });
    if (castleHitTimer < 0) castleHitTimer = 0;
  }

  // Muzzle flash decay
  if (muzzleFlash.intensity > 0.05) muzzleFlash.intensity *= 0.70;
  else muzzleFlash.intensity = 0;


  // WASD / Space / Shift camera movement — velocity with acceleration & damping
  {
    const zoomFactor = camera.position.distanceTo(controls.target) / 30;
    const accel = 0.55 * zoomFactor, maxSpd = 0.55 * zoomFactor, friction = 0.82;
    const isTyping = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
    // Suspend WASD input while any blocking modal is open — otherwise holding W
    // when a modal pops up causes the camera to drift while the player is reading.
    const modalOpen = (
      document.getElementById('level-select')?.classList.contains('visible') ||
      document.getElementById('level-complete')?.classList.contains('visible') ||
      document.getElementById('stats-screen')?.classList.contains('visible') ||
      document.getElementById('merchant')?.classList.contains('visible') ||
      document.getElementById('game-over')?.classList.contains('visible') ||
      document.getElementById('esc-menu')?.classList.contains('open')
    );
    if (!isTyping && !modalOpen) {
      camera.getWorldDirection(_tmpV3a); _tmpV3a.y = 0; _tmpV3a.normalize();
      _tmpV3b.crossVectors(_tmpV3a, _tmpV3c.set(0, 1, 0)).normalize();
      _tmpV3d.set(0, 0, 0);
      if (_camKeys.has('KeyW')) _tmpV3d.addScaledVector(_tmpV3a,  accel);
      if (_camKeys.has('KeyS')) _tmpV3d.addScaledVector(_tmpV3a, -accel);
      if (_camKeys.has('KeyA')) _tmpV3d.addScaledVector(_tmpV3b, -accel);
      if (_camKeys.has('KeyD')) _tmpV3d.addScaledVector(_tmpV3b,  accel);
      if (_camKeys.has('Space'))      _tmpV3d.y += accel;
      if (_camKeys.has('ShiftLeft') || _camKeys.has('ShiftRight')) _tmpV3d.y -= accel;
      _camVel.add(_tmpV3d);
      if (_camVel.length() > maxSpd) _camVel.setLength(maxSpd);
    } else if (modalOpen) {
      // Clear any latched keys so re-opening the game world doesn't immediately move
      _camVel.set(0, 0, 0);
      _camKeys.clear();
    }
    _camVel.multiplyScalar(friction);
    if (_camVel.lengthSq() > 0.00001) {
      camera.position.add(_camVel);
      controls.target.add(_camVel);
      const minY = 5, maxY = 55;
      if (camera.position.y < minY) { const d = minY - camera.position.y; camera.position.y = minY; controls.target.y += d; }
      if (camera.position.y > maxY) { const d = camera.position.y - maxY; camera.position.y = maxY; controls.target.y -= d; }
    } else {
      _camVel.set(0, 0, 0);
    }
  }

  // Keep panel locked to unit's world position as camera moves
  if (selectedDef && _defPanel.style.display !== 'none') _updateDefPanelPos();

  controls.update();
  // Headless: never render while a TEST battle is in flight — cold software-GL
  // renders can block for multiple seconds (shader compilation), starving the
  // logic loop and making first-after-load battles time out at a tenth speed.
  const _headlessSkip = HEADLESS &&
    (window._battleWatcher || performance.now() - _lastHeadlessRenderMs <= 1000);
  if (!_headlessSkip) {
    if (bloomEnabled) composer.render();
    else renderer.render(scene, camera);
    // Stamp AFTER the render returns: on a cold page a software-GL render can
    // take >1s (shader compilation), and stamping before it meant the 1s gate
    // was already elapsed by the next frame — so EVERY frame rendered and the
    // logic loop crawled at ~1-2Hz. That was the "first battle after load
    // stalls/times out" bug: enemies moved at a tenth speed until shaders
    // warmed. Stamping after guarantees ≥1s of unblocked logic between frames.
    _lastHeadlessRenderMs = performance.now();
  }
}

// ─────────────────────────────────────────────
//  INPUT
// ─────────────────────────────────────────────
let mouseDownX = 0, mouseDownY = 0, mouseDragged = false;
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) { mouseDownX = e.clientX; mouseDownY = e.clientY; mouseDragged = false; }
  // Open a batched undo entry when the stroke starts in editor mode so the whole
  // drag collapses into one Ctrl+Z (regardless of LMB paint or RMB erase).
  if (mapEditorMode && (e.button === 0 || e.button === 2)) {
    _meBeginUndoBatch();
  }
});

canvas.addEventListener('mousemove', (e) => {
  mouseNDC.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  if (e.buttons === 1) {
    const dx = e.clientX - mouseDownX, dy = e.clientY - mouseDownY;
    if (Math.sqrt(dx*dx + dy*dy) > 8) mouseDragged = true; // 8px threshold — tolerates hand tremor
  }
  if (mapEditorMode) {
    const tile = _rayToTile(e.clientX, e.clientY);
    if (tile) _meUpdateHover(tile.col, tile.row);
    else _meRemoveHover();
    // Drag-paint: hold LMB to paint, RMB to erase. Both deduplicate via _mePaintLastKey so
    // repeated mousemove on the same tile is a no-op.
    if (tile && (e.buttons === 1 || e.buttons === 2)) {
      const dragKey = `${tile.col},${tile.row}`;
      if (dragKey !== _mePaintLastKey) {
        _mePaintLastKey = dragKey;
        // Skip the first tile — the initial click/right-click handler already placed/erased it.
        if (_meDragStarted) {
          if (e.buttons === 2) _meApplyTool(tile.col, tile.row, true);
          else                 _meApplyTool(tile.col, tile.row);
        } else {
          _meDragStarted = true;
        }
        mouseDragged = true; // matches click handler's drag-detect threshold
      }
    }
  }
});
let _mePaintLastKey = null;
let _meDragStarted = false;
canvas.addEventListener('mouseup', () => {
  _mePaintLastKey = null;
  _meDragStarted = false;
  // Collapse this stroke's accumulated tile actions into one undo entry
  if (mapEditorMode) _meEndUndoBatch();
});

// Shared helper: cast ray onto the y=0 ground plane → reliable col,row even through tall models
function _rayToTile(clientX, clientY) {
  const ndx =  (clientX / window.innerWidth)  * 2 - 1;
  const ndy = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(_tmpV2.set(ndx, ndy), camera);
  if (!raycaster.ray.intersectPlane(_groundPlane, _tmpV3a)) return null;
  const col = Math.round(_tmpV3a.x), row = Math.round(_tmpV3a.z);
  if (col < 0 || col >= CFG.GRID_W || row < 0 || row >= CFG.GRID_H) return null;
  return { col, row, worldX: _tmpV3a.x, worldZ: _tmpV3a.z };
}

canvas.addEventListener('click', (e) => {
  if (mouseDragged) return; // drag = camera orbit, not placement
  if (gameOver) return;
  if (e.target !== canvas) return;
  if (studioMode && studioTab === 'world') { _worldPickObject(e.clientX, e.clientY); return; }
  if (mapEditorMode) {
    const tile = _rayToTile(e.clientX, e.clientY);
    if (tile) _meApplyTool(tile.col, tile.row);
    return;
  }
  if (testMode && selectedEnemyType) {
    const tile = _rayToTile(e.clientX, e.clientY);
    if (tile) spawnEnemyAtTile(selectedEnemyType, tile.col, tile.row);
    return;
  }
  if (testMode && !selectedTool) { window._testPickUnit?.(e.clientX, e.clientY); return; }
  const tile = _rayToTile(e.clientX, e.clientY);
  if (!tile) return;
  // Rally targeting takes priority — the next world click sets the rally point.
  // We accept any tile (path/grass) so the player can rally to chokepoints freely.
  if (_rallyTargeting && selectedDef && _RALLY_TYPES.has(selectedDef.type)) {
    _setRallyPoint(selectedDef, tile.col, tile.row);
    _rallyTargeting = false;
    _refreshDefPanel();
    return;
  }
  if (!selectedTool) {
    selectDefenderAt(tile.col, tile.row, tile.worldX, tile.worldZ);
  } else {
    place(selectedTool, tile.col, tile.row);
  }
});

document.getElementById('build-panel').addEventListener('click', (e) => {
  if (!selectedTool) return;
  if (!e.target.closest('.build-card')) {
    selectedTool = null;
    _buildCards.forEach(c => c.classList.remove('selected'));
    ghostMesh.visible = false;
  }
});

// ─────────────────────────────────────────────
//  BUILD TOOL SELECTION
//  Centralised so click + hotkey + post-place "stay armed" all share one path.
// ─────────────────────────────────────────────
const _BUILD_NAMES = { wall:'Wall (road or grass)', tower:'Crystal Tower', catapult:'Catapult',
  swordsman:'Swordsman', knight:'Knight', spearman:'Spearman', archer:'Archer',
  mage:'Mage (slows enemies)', ballista:'Ballista (extreme range)', spiketrap:'Spike Trap (road tiles)' };

function selectBuildTool(tool, opts = {}) {
  if (!tool) {
    // Clear selection
    selectedTool = null;
    _buildCards.forEach(c => c.classList.remove('selected'));
    ghostMesh.visible = false;
    if (rangeRingMesh) rangeRingMesh.visible = false;
    if (!opts.silent) showTooltip('Tool deselected', 1200);
    return;
  }
  // Block selection of locked tools
  if (!testMode && !UNLOCKED.has(tool)) {
    showTooltip(`${tool} unlocks at wave ${UNLOCK_WAVES[tool]}`, 1800);
    return;
  }
  // Toggle off if same tool clicked again
  if (selectedTool === tool && !opts.force) {
    return selectBuildTool(null);
  }
  _buildCards.forEach(c => c.classList.remove('selected'));
  selectedTool = tool;
  selectedDef = null;
  if (_defPanel) _defPanel.style.display = 'none';
  const card = document.querySelector(`.build-card[data-tool="${tool}"]`);
  if (card) card.classList.add('selected');
  if (!opts.silent) {
    const cost = CFG.COSTS[tool];
    showTooltip(`${_BUILD_NAMES[tool]} — ${cost}🟡 — click a tile to place`, 2200);
  }
}

_buildCards.forEach(card => {
  card.addEventListener('click', () => {
    const tool = card.dataset.tool;
    selectBuildTool(tool);
  });
});

// ── Affordability + locked-cost visual refresh ──────────────────────────────
// Called from updateHUD() any time gold/wave/unlocks change. Cheap operation
// (10 cards × className twiddle) so doing it on every HUD tick is fine.
function refreshBuildCardStates() {
  // Use cached `_buildCards` NodeList — this fires every updateHUD() call, so
  // a fresh querySelectorAll each tick was wasted DOM traversal.
  _buildCards.forEach(card => {
    const tool = card.dataset.tool;
    const cost = CFG.COSTS[tool] || 0;
    const isLocked = !UNLOCKED.has(tool);
    const cantAfford = !isLocked && gold < cost;
    card.classList.toggle('cantafford', cantAfford);
  });
}

// Global UI click sound — fires for any button/card/swatch in the document
document.addEventListener('mousedown', e => {
  if (e.target.matches('button, .build-card, .stab, .studio-swatch, .unit-type-btn')) SND.btnClick();
}, { capture: true, passive: true });

window.addEventListener('keydown', (e) => {
  if ((e.key === 'b' || e.key === 'B') && !e.ctrlKey && !e.metaKey && !e.altKey) {
    // Ignore while typing (map name, test scripts, layer rename, …) and while a
    // blocking modal is up — 'b' in an input used to yank the player into Studio.
    if (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/i.test(document.activeElement.tagName)) return;
    const modalOpen =
      document.getElementById('level-select')?.classList.contains('visible') ||
      document.getElementById('level-complete')?.classList.contains('visible') ||
      document.getElementById('stats-screen')?.classList.contains('visible') ||
      document.getElementById('merchant')?.classList.contains('visible') ||
      document.getElementById('game-over')?.classList.contains('visible') ||
      document.getElementById('esc-menu')?.classList.contains('open');
    if (modalOpen) return;
    // Route through the mode switcher so test/map modes exit cleanly first —
    // calling enterStudio() directly stacked Studio on top of whatever mode was open.
    if (window._switchToMode) window._switchToMode(studioMode ? 'game' : 'studio');
    else if (studioMode) exitStudio();
    else enterStudio();
    return;
  }
  // ── Studio build-tab keyboard shortcuts ──────────────────────────────────
  if (studioMode && studioTab === 'build') {
    const isInput = document.activeElement?.tagName === 'INPUT';
    if (!isInput) {
      if (e.ctrlKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); _studioUndo(); return; }
      if (e.ctrlKey && (e.key === 'y' || e.key === 'Y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) { e.preventDefault(); _studioRedo(); return; }
      if (studioSel) {
        if (e.key === 'ArrowRight') { e.preventDefault(); _studioNudge('x',  1); return; }
        if (e.key === 'ArrowLeft')  { e.preventDefault(); _studioNudge('x', -1); return; }
        if (e.key === 'ArrowUp')    { e.preventDefault(); e.shiftKey ? _studioNudge('y',  1) : _studioNudge('z', -1); return; }
        if (e.key === 'ArrowDown')  { e.preventDefault(); e.shiftKey ? _studioNudge('y', -1) : _studioNudge('z',  1); return; }
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); _studioDeletePart(); return; }
        if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); _studioDuplicatePart(); return; }
      }
    }
  }
  if (e.key === 'Escape') {
    // Stats / records screen takes priority — close it first
    const statsEl = document.getElementById('stats-screen');
    if (statsEl && statsEl.classList.contains('visible')) {
      hideStats();
      return;
    }
    // Merchant modal next
    const merchantEl = document.getElementById('merchant');
    if (merchantEl && merchantEl.classList.contains('visible')) {
      merchantEl.classList.remove('visible');
      elBtnStart.disabled = false;
      return;
    }
    // If menu is already open, close it (return to current mode)
    if (_escMenu.classList.contains('open')) { _closeEscMenu(); return; }
    // In all modes (game, test, studio, map editor) — open the ESC menu
    selectedEnemyType = null;
    selectedTool = null;
    selectedDef  = null; _defPanel.style.display = 'none';
    _buildCards.forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.test-btn').forEach(b => b.classList.remove('selected'));
    ghostMesh.visible = false;
    _openEscMenu();
  }
});

window.addEventListener('keydown', e => {
  // Prevent page-scroll on Space — but NOT while a button/input/select is focused.
  // Otherwise we'd block the browser's default "Space activates focused button" behavior,
  // breaking accessible keyboard navigation in modals/menus.
  if (e.code === 'Space') {
    const ae = document.activeElement;
    const isFocusable = ae && /^(BUTTON|INPUT|TEXTAREA|SELECT|A)$/i.test(ae.tagName);
    if (!isFocusable) e.preventDefault();
  }
  _camKeys.add(e.code);
});
window.addEventListener('keyup', e => { _camKeys.delete(e.code); });

// ─────────────────────────────────────────────
//  BUILD MODE HOTKEYS
//  • 0-9         → pick the build tool whose card has data-hotkey="N"
//  • Q           → deselect current build tool
//  • U           → upgrade currently selected defender (if affordable)
//  • X / Delete  → sell currently selected defender
//  • R           → set/cancel rally for selected soldier
//  • M           → mute / unmute all audio
//  All ignored while typing in inputs / studio mode / map editor.
// ─────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  // Don't hijack keys while the player is typing somewhere
  if (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/i.test(document.activeElement.tagName)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (studioMode || mapEditorMode) return;
  // Ignore while a modal is open
  const lc = document.getElementById('level-complete');
  const ls = document.getElementById('level-select');
  const ss = document.getElementById('stats-screen');
  const merchant = document.getElementById('merchant');
  if ((lc && lc.classList.contains('visible')) ||
      (ls && ls.classList.contains('visible')) ||
      (ss && ss.classList.contains('visible')) ||
      (merchant && merchant.classList.contains('visible'))) return;

  // Enter → start the next wave (the most-pressed action between waves)
  if (e.key === 'Enter') {
    if (!waveActive && !gameOver && !testMode && elBtnStart && !elBtnStart.disabled) {
      e.preventDefault();
      elBtnStart.click();
    }
    return;
  }
  // P → toggle pause / play (skip in test mode, which drives its own speed slider)
  if (e.key === 'p' || e.key === 'P') {
    if (!testMode) { e.preventDefault(); elBtnPause?.click(); }
    return;
  }
  // M → mute / unmute all audio (defined in _initSettings)
  if (e.key === 'm' || e.key === 'M') {
    e.preventDefault();
    window._toggleGlobalMute?.();
    return;
  }

  // Number keys → build tool by hotkey
  if (e.key >= '0' && e.key <= '9') {
    const card = document.querySelector(`.build-card[data-hotkey="${e.key}"]`);
    if (card) {
      e.preventDefault();
      selectBuildTool(card.dataset.tool);
    }
    return;
  }

  // Q → cancel current tool
  if (e.key === 'q' || e.key === 'Q') {
    if (selectedTool) { e.preventDefault(); selectBuildTool(null); }
    return;
  }

  // Defender-context shortcuts (only when a unit is selected)
  if (selectedDef) {
    if (e.key === 'u' || e.key === 'U') {
      e.preventDefault();
      if (_dpUpgradeBtn && !_dpUpgradeBtn.disabled) _dpUpgradeBtn.click();
      return;
    }
    if (e.key === 'x' || e.key === 'X' || e.key === 'Delete') {
      e.preventDefault();
      if (_dpSellBtn && _dpSellBtn.style.display !== 'none') _dpSellBtn.click();
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      if (_dpRallyBtn && _dpRallyBtn.style.display !== 'none') _dpRallyBtn.click();
      return;
    }
  }
});

// ── MAP EDITOR HOTKEYS ──
// Active only while the editor is open. Cleanly bypassed during gameplay.
window.addEventListener('keydown', (e) => {
  if (!mapEditorMode) return;
  if (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/i.test(document.activeElement.tagName)) return;
  // Ctrl+Z → undo
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault(); _meUndo(); return;
  }
  // Ctrl+Y / Ctrl+Shift+Z → redo
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
    e.preventDefault(); _meRedo(); return;
  }
  // Single-key tool picks: G/D/S/W/L for tile types, T for tree, R for rock,
  // E for erase, P for play test
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const k = e.key.toLowerCase();
  const map = {
    g: 'grass', d: 'dirt', s: 'sand', w: 'water', l: 'lava',
    a: 'pathA', b: 'pathB', c: 'pathC',
    t: 'tree', r: 'rock', e: 'erase',
  };
  if (map[k]) {
    e.preventDefault();
    _meSetTool(map[k]);
    return;
  }
  // P → test play
  if (k === 'p') {
    e.preventDefault();
    document.getElementById('me-play-btn')?.click();
  }
});

// ── Right-click anywhere on the canvas → cancel current build tool ──
// (or quick-erase the hovered tile if we're in the map editor)
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (mapEditorMode) {
    const tile = _rayToTile(e.clientX, e.clientY);
    if (tile) _meApplyTool(tile.col, tile.row, true);
    return;
  }
  if (selectedTool) {
    selectBuildTool(null);
  } else if (selectedDef) {
    selectedDef = null;
    if (_defPanel) _defPanel.style.display = 'none';
  }
});

// ── DRAG-TO-PAINT (walls + spike traps) ──
// Players want to draw chains of walls/traps without re-clicking 20 times.
// We pre-validate each new tile so invalid hovers (water, castle, occupied) silently
// skip instead of spamming "Cannot build here" toasts.
let _paintLastKey = null;
function _canPaintHere(tool, col, row) {
  const key = `${col},${row}`;
  if (occupied.has(key)) return false;
  const cell = grid[key];
  if (!cell) return false;
  if (cell.type === 'castle' || cell.type === 'water' || cell.type === 'scenery') return false;
  if (tool === 'wall' || tool === 'spiketrap') {
    if (cell.type !== 'grass' && cell.type !== 'path') return false;
  } else {
    if (cell.type !== 'grass') return false;
  }
  if (!testMode) {
    if (!UNLOCKED.has(tool)) return false;
    if (gold < (CFG.COSTS[tool] || 0)) return false;
    const slots = CFG.STATS[tool]?.unitCost ?? 1;
    if (liveDefenderCount() + slots > getMaxDefenders()) return false;
  }
  return true;
}
canvas.addEventListener('mousemove', (e) => {
  if (e.buttons !== 1) { _paintLastKey = null; return; }
  if (!selectedTool) return;
  if (selectedTool !== 'wall' && selectedTool !== 'spiketrap') return;
  if (gameOver || mapEditorMode || studioMode) return;
  const tile = _rayToTile(e.clientX, e.clientY);
  if (!tile) return;
  const key = `${tile.col},${tile.row}`;
  if (key === _paintLastKey) return;
  _paintLastKey = key;
  if (!_canPaintHere(selectedTool, tile.col, tile.row)) return;
  place(selectedTool, tile.col, tile.row);
  // Keep the build tool armed for continuous painting (and prevent click handler
  // from re-placing on the final mouseup tile)
  mouseDragged = true;
});
canvas.addEventListener('mouseup', () => { _paintLastKey = null; });

function sellDefenderAt(col, row) {
  const key = `${col},${row}`;
  if (!occupied.has(key)) return;
  const def = defenders.find(d => d.col === col && d.row === row && d.alive);
  if (!def) return;
  if (def.type === 'spiketrap') { showTooltip('Spike traps cannot be sold!', 1800); return; }
  const refund = Math.floor(totalCostPaid(def) * 0.5);
  gold += refund;
  updateHUD();
  if (def.hpBar) { def.hpBar.bg.visible = false; def.hpBar.fg.visible = false; }
  if (def._rallyMarker) { scene.remove(def._rallyMarker); def._rallyMarker = null; }
  occupied.delete(key);
  const sellPos = posAbove(def.group.position, 1.5);
  scene.remove(def.group); disposeGroup(def.group);
  defenders.splice(defenders.indexOf(def), 1);
  if (def.type === 'wall') _rebuildWallCache();
  spawnGoldPopup(refund, sellPos);
  SND.sellRefund();
  showTooltip(`Sold for ${refund}🟡`, 1500);
}

// ─────────────────────────────────────────────
//  DEFENDER PANEL
// ─────────────────────────────────────────────
const _defPanel      = document.getElementById('defender-panel');
const _dpName        = document.getElementById('dp-name');
const _dpStars       = document.getElementById('dp-stars');
const _dpHp          = document.getElementById('dp-hp');
const _dpDmg         = document.getElementById('dp-dmg');
const _dpRng         = document.getElementById('dp-rng');
const _dpRate        = document.getElementById('dp-rate');
const _dpUpgradeBtn  = document.getElementById('dp-upgrade-btn');
const _dpSellBtn     = document.getElementById('dp-sell-btn');
const _dpRallyBtn    = document.getElementById('dp-rally-btn');
const _DP_NAMES      = { wall:'Wall', tower:'Crystal Tower', catapult:'Catapult', swordsman:'Swordsman', knight:'Knight', spearman:'Spearman', archer:'Archer', mage:'Mage', ballista:'Ballista', spiketrap:'Spike Trap' };
// Soldier types that can be rallied. Walls/buildings stay put; spiketrap is on-path only.
const _RALLY_TYPES   = new Set(['knight', 'swordsman', 'spearman', 'archer']);
// When true, the next world click sets the rally point for the currently selected defender.
let _rallyTargeting  = false;

// Shared geometry/material so dropping many rally flags doesn't churn allocations.
const _GEO_RALLY_POLE  = new THREE.BoxGeometry(0.06, 0.85, 0.06);
const _GEO_RALLY_FLAG  = new THREE.BoxGeometry(0.32, 0.22, 0.04);
const _MAT_RALLY_POLE  = new THREE.MeshStandardMaterial({ color: 0x553322, roughness: 0.85 });
const _MAT_RALLY_FLAG  = new THREE.MeshStandardMaterial({ color: 0x44cc55, emissive: 0x227733, emissiveIntensity: 0.5 });

function _buildRallyMarker() {
  // Compact little flag — pole + banner. Faces the camera by default; we just rotate around Y.
  const g = new THREE.Group();
  const pole = new THREE.Mesh(_GEO_RALLY_POLE, _MAT_RALLY_POLE);
  pole.position.y = 0.42;
  const flag = new THREE.Mesh(_GEO_RALLY_FLAG, _MAT_RALLY_FLAG);
  flag.position.set(0.18, 0.68, 0);
  g.add(pole);
  g.add(flag);
  return g;
}

function _setRallyPoint(d, col, row) {
  d.rallyX = col;
  d.rallyZ = row;
  d.state = 'returning'; // marches toward (rallyX, rallyZ) via the existing state branch
  // Drop a flag at the rally tile so the player can see where they sent the soldier.
  if (d._rallyMarker) { scene.remove(d._rallyMarker); }
  d._rallyMarker = _buildRallyMarker();
  d._rallyMarker.position.set(col, 0, row);
  scene.add(d._rallyMarker);
  showTooltip(`Rally set — ${_DP_NAMES[d.type] || d.type} marching out`, 1600);
  _unlockAchievement('rallyMaster');
}

function _clearRallyPoint(d) {
  d.rallyX = null;
  d.rallyZ = null;
  if (d._rallyMarker) {
    scene.remove(d._rallyMarker);
    d._rallyMarker = null;
  }
  // Soldier marches home via the existing 'returning' state — _homeX/_homeZ now resolve to col/row
  d.state = 'returning';
}

function selectDefenderAt(col, row, worldX, worldZ) {
  let def = defenders.find(d => d.col === col && d.row === row && d.alive);
  if (!def && worldX != null) {
    let best = null, bestDist = 1.5;
    for (const d of defenders) {
      if (!d.alive) continue;
      const dx = d.group.position.x - worldX;
      const dz = d.group.position.z - worldZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < bestDist) { best = d; bestDist = dist; }
    }
    def = best;
  }
  selectedDef = def || null;
  if (!selectedDef) { _defPanel.style.display = 'none'; return; }
  SND.selectUnit?.(selectedDef.type);
  _refreshDefPanel();
}

function _refreshDefPanel() {
  const d = selectedDef;
  if (!d || !d.alive) { selectedDef = null; _defPanel.style.display = 'none'; return; }

  _dpName.textContent  = _DP_NAMES[d.type] || d.type;
  const lv = d.level || 1;
  _dpStars.textContent = lv === 3 ? '★★★' : lv === 2 ? '★★' : '★';
  _dpHp.textContent    = `${Math.ceil(d.hp)}/${d.maxHp}`;
  _dpDmg.textContent   = (d.dmg != null && d.rate != null) ? `${Math.round(d.dmg * 10) / 10} (${Math.round(d.dmg * d.rate * 10) / 10}dps)` : d.dmg != null ? Math.round(d.dmg * 10) / 10 : '—';
  _dpRng.textContent   = d.range != null ? d.range.toFixed(1)          : '—';
  _dpRate.textContent  = d.rate  != null ? d.rate.toFixed(1) + '/s'    : '—';
  // Kill counter in name area
  const killCount = d.kills || 0;
  _dpStars.textContent = (lv === 3 ? '★★★' : lv === 2 ? '★★' : '★') + (killCount > 0 ? `  💀${killCount}` : '');

  // Upgrade button
  if (d.type === 'spiketrap' || d.type === 'wall') {
    _dpUpgradeBtn.disabled = true;
    _dpUpgradeBtn.textContent = 'No Upgrade';
  } else if (lv >= 3) {
    _dpUpgradeBtn.disabled = true;
    _dpUpgradeBtn.textContent = 'Max Level';
  } else {
    const isBuilding = ['tower', 'catapult', 'archer', 'mage', 'ballista'].includes(d.type);
    const cost = d.type === 'wall' ? CFG.COSTS.wall * lv : CFG.COSTS[d.type] * lv * (isBuilding ? 2 : 1);
    const killsNeeded = d.type === 'wall' ? (lv === 1 ? 0 : 15) : (lv === 1 ? 10 : 25);
    const myKills = d.kills || 0;
    const killsOk = myKills >= killsNeeded;
    _dpUpgradeBtn.disabled = gold < cost || !killsOk;
    const killTag = killsNeeded > 0 ? ` [${myKills}/${killsNeeded}💀]` : '';
    if (d.type === 'wall') {
      _dpUpgradeBtn.textContent = lv === 1 ? `⬆ Archer  (${cost}🟡)${killTag}` : `⬆ Catapult  (${cost}🟡)${killTag}`;
    } else {
      _dpUpgradeBtn.textContent = `⬆ Lv${lv + 1}  (${cost}🟡)${killTag}`;
    }
  }

  // Sell button
  _dpSellBtn.style.display = d.type === 'spiketrap' ? 'none' : '';
  const refund = Math.floor(totalCostPaid(d) * 0.5);
  _dpSellBtn.textContent = `Sell  +${refund}🟡`;

  // Rally button — only soldiers (knight/swordsman/spearman/archer). Three visual states:
  // (idle): "Set Rally" — click to enter targeting mode
  // (armed): "Cancel Rally" — orange highlight, click to back out of targeting
  // (recall): "🚩 Recall" — soldier currently has a rally; click clears it and they march home
  if (_RALLY_TYPES.has(d.type)) {
    _dpRallyBtn.style.display = '';
    _dpRallyBtn.classList.remove('armed', 'recall');
    if (_rallyTargeting) {
      _dpRallyBtn.classList.add('armed');
      _dpRallyBtn.textContent = '✖ Cancel Rally';
    } else if (d.rallyX != null) {
      _dpRallyBtn.classList.add('recall');
      _dpRallyBtn.textContent = '🚩 Recall';
    } else {
      _dpRallyBtn.textContent = '🚩 Set Rally';
    }
  } else {
    _dpRallyBtn.style.display = 'none';
  }

  _defPanel.style.display = 'block';
  _updateDefPanelPos();
}

function _updateDefPanelPos() {
  const d = selectedDef;
  if (!d || !d.alive || _defPanel.style.display === 'none') return;
  const wp = d.group.position.clone();
  wp.y += d.type === 'tower' ? 1.2 : d.type === 'catapult' ? 1.0 : 0.9;
  wp.project(camera);
  // Hide when behind camera or off-screen
  if (wp.z > 1 || Math.abs(wp.x) > 1.1 || Math.abs(wp.y) > 1.1) {
    _defPanel.style.visibility = 'hidden';
    return;
  }
  _defPanel.style.visibility = 'visible';
  // CSS transform handles centering + upward offset — just pass the anchor point
  const sx = (wp.x *  0.5 + 0.5) * window.innerWidth;
  const sy = (wp.y * -0.5 + 0.5) * window.innerHeight;
  const buildH = document.getElementById('build-panel')?.offsetHeight || 110;
  const maxY = window.innerHeight - buildH - 18;
  _defPanel.style.left = Math.max(90, Math.min(window.innerWidth - 90, sx)) + 'px';
  _defPanel.style.top  = Math.max(72, Math.min(maxY, sy)) + 'px';
}

_dpUpgradeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!selectedDef) return;
  tryUpgradeDefender(selectedDef.col, selectedDef.row);
  _refreshDefPanel(); // refresh stats + button state after upgrade
});

_dpSellBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!selectedDef) return;
  const { col, row } = selectedDef;
  selectedDef = null;
  _defPanel.style.display = 'none';
  sellDefenderAt(col, row);
});

// Rally button cycles three states:
// • Set Rally  → arms targeting; the next world click sets the rally point
// • Cancel Rally (armed) → backs out of targeting without changing the rally
// • Recall      → clears an existing rally; soldier marches back to spawn (col, row)
_dpRallyBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!selectedDef || !_RALLY_TYPES.has(selectedDef.type)) return;
  if (_rallyTargeting) {
    // Was armed → cancel targeting
    _rallyTargeting = false;
  } else if (selectedDef.rallyX != null) {
    // Has a rally → clear it (soldier returns home)
    _clearRallyPoint(selectedDef);
  } else {
    // No rally → arm targeting
    _rallyTargeting = true;
    showTooltip('Click any tile to set rally point. Right-click to cancel.', 2400);
  }
  _refreshDefPanel();
});

document.getElementById('dp-close').addEventListener('click', (e) => {
  e.stopPropagation();
  selectedDef = null;
  _defPanel.style.display = 'none';
});

// Right-click: suppress context menu and cancel rally targeting if armed
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (_rallyTargeting) {
    _rallyTargeting = false;
    _refreshDefPanel();
    showTooltip('Rally cancelled', 1200);
  }
});

// ─────────────────────────────────────────────
//  STUDIO — isolated object builder
// ─────────────────────────────────────────────
const STUDIO_PALETTE = [
  0xffffff, 0xcccccc, 0x888888, 0x333333,
  0xff4444, 0xff8833, 0xffdd22, 0x44cc44,
  0x22aaff, 0x2244cc, 0xaa44ee, 0xff44aa,
  0x8b4513, 0xcd853f, 0xdeb887, 0xfffacd,
  0x2d5a1e, 0x4a8c2d, 0x88bb44, 0xccee88,
  0x112244, 0x224488, 0x4488bb, 0x88bbdd,
];
// [prop, display-label, nudge-step, is-rotation]
const STUDIO_PROPS = [
  ['w','W',0.1,false],['h','H',0.1,false],['d','D',0.1,false],
  ['x','X',0.25,false],['y','Y',0.25,false],['z','Z',0.25,false],
  ['rx','RX',Math.PI/4,true],['ry','RY',Math.PI/4,true],['rz','RZ',Math.PI/4,true],
];
// shape types available in the studio
const STUDIO_SHAPES = [
  { id:'box',     label:'Box',    hint:'W×H×D'       },
  { id:'cyl',     label:'Cyl',    hint:'ØW  H'        },
  { id:'sphere',  label:'Sphere', hint:'ØW'           },
  { id:'cone',    label:'Cone',   hint:'ØW  H'        },
  { id:'torus',   label:'Ring',   hint:'ØW  tube D'   },
  { id:'wedge',   label:'Wedge',  hint:'W×H tri-prism'},
  { id:'pyramid', label:'Pyr',    hint:'W base  H'    },
];

function _studioSnapGeometry(geo) {
  const SNAP = 1 / 16; // 1/16-unit sub-grid = standard Minecraft texel resolution
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, Math.round(pos.getX(i) / SNAP) * SNAP);
    pos.setY(i, Math.round(pos.getY(i) / SNAP) * SNAP);
    pos.setZ(i, Math.round(pos.getZ(i) / SNAP) * SNAP);
  }
  pos.needsUpdate = true;
  return geo;
}

// 16×16 DataTexture with nearest-neighbor filtering + subtle pixel-noise + 1px block border
function _studioMakeVoxelTexture(hexColor) {
  const S = 16;
  const data = new Uint8Array(S * S * 4);
  const r = (hexColor >> 16) & 0xff;
  const g = (hexColor >> 8)  & 0xff;
  const b =  hexColor        & 0xff;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const idx   = (y * S + x) * 4;
      const noise = (((x * 17 + y * 31) ^ (x * y * 3 + 7)) % 13) - 6; // −6..+6
      const dark  = (x === 0 || x === S-1 || y === 0 || y === S-1) ? -20 : 0;
      data[idx]   = Math.min(255, Math.max(0, r + noise + dark));
      data[idx+1] = Math.min(255, Math.max(0, g + noise + dark));
      data[idx+2] = Math.min(255, Math.max(0, b + noise + dark));
      data[idx+3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, S, S);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter  = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function _studioMakeMaterial(hexColor) {
  return new THREE.MeshStandardMaterial({
    map: _studioMakeVoxelTexture(hexColor),
    roughness: 0.88, metalness: 0.0,
    flatShading: true,
    emissive: new THREE.Color(0), emissiveIntensity: 0,
  });
}

function _studioMakeGeometry(shape, w, h, d) {
  const hw = Math.max(0.025, w / 2), hd = Math.max(0.025, d / 2);
  let geo;
  switch (shape) {
    case 'cyl':     geo = new THREE.CylinderGeometry(hw, hw, Math.max(0.05, h), 8, 1); break;
    case 'sphere':  geo = new THREE.IcosahedronGeometry(hw, 1); break; // faceted d80-look
    case 'cone':    geo = new THREE.ConeGeometry(hw, Math.max(0.05, h), 8, 1); break;
    case 'torus':   geo = new THREE.TorusGeometry(hw, Math.max(0.03, hd), 6, 12); break;
    case 'wedge':   geo = new THREE.CylinderGeometry(hw, hw, Math.max(0.05, h), 3, 1); break;
    case 'pyramid': geo = new THREE.ConeGeometry(hw, Math.max(0.05, h), 4, 1); break;
    default:        geo = new THREE.BoxGeometry(Math.max(0.05, w), Math.max(0.05, h), Math.max(0.05, d)); break;
  }
  return _studioSnapGeometry(geo);
}

// ── Studio → game bridge ────────────────────────────────────────────────────
// Rebuild a saved studio object as a self-contained group in the MAIN scene at
// a map tile. Same parts recipe the studio Library saves; hidden layers are
// skipped, matching what the author saw when saving.
function buildStudioObjectGroup(data, col, row) {
  const g = new THREE.Group();
  const hiddenLayers = new Set((data.layers || []).filter(l => l.visible === false).map(l => l.id));
  for (const pd of (data.parts || [])) {
    if (pd.layerId && hiddenLayers.has(pd.layerId)) continue;
    const m = new THREE.Mesh(
      _studioMakeGeometry(pd.shape || 'box', pd.w, pd.h, pd.d),
      _studioMakeMaterial(pd.color || 0x999999),
    );
    m.position.set(pd.x || 0, pd.y || 0, pd.z || 0);
    m.rotation.set(pd.rx || 0, pd.ry || 0, pd.rz || 0);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  g.position.set(col, 0, row);
  scene.add(g);
  return g;
}

function _studioInit() {
  if (_stScene) return; // already initialized

  const canvas = document.getElementById('studio-canvas');
  // antialias OFF — nearest-neighbour pixels stay sharp ("crunchy" voxel look)
  _stRenderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  _stRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  _stRenderer.setSize(window.innerWidth, window.innerHeight);
  _stRenderer.setClearColor(0x060c12, 1);
  // hard shadows (BasicShadowMap = no softening, true voxel-style)
  _stRenderer.shadowMap.enabled = true;
  _stRenderer.shadowMap.type = THREE.BasicShadowMap;

  _stScene = new THREE.Scene();

  _stCamera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
  _stCamera.position.set(4, 4, 6);

  _stControls = new OrbitControls(_stCamera, canvas);
  _stControls.target.set(0, 0.5, 0);
  _stControls.update();

  // low ambient = darker shadow pockets (voxel AO feel)
  _stScene.add(new THREE.AmbientLight(0x8899aa, 0.28));
  const sun = new THREE.DirectionalLight(0xfff8e8, 2.0);
  sun.position.set(6, 12, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left   = -12;
  sun.shadow.camera.right  =  12;
  sun.shadow.camera.top    =  12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.camera.near   = 0.5;
  sun.shadow.camera.far    = 40;
  _stScene.add(sun);
  // dim cool fill from below-back — keeps undersides readable without washing out shadows
  const fill = new THREE.DirectionalLight(0x446688, 0.18);
  fill.position.set(-4, -2, -5);
  _stScene.add(fill);

  _stScene.add(new THREE.GridHelper(16, 32, 0x0a3344, 0x071c28));
  // invisible floor that receives hard block shadows
  const _stFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 22),
    new THREE.ShadowMaterial({ opacity: 0.45 })
  );
  _stFloor.rotation.x = -Math.PI / 2;
  _stFloor.position.y = -0.005;
  _stFloor.receiveShadow = true;
  _stScene.add(_stFloor);

  _stGroup = new THREE.Group();
  _stScene.add(_stGroup);
  _stRaycaster = new THREE.Raycaster();

  // Build color swatches
  const swCont = document.getElementById('studio-colors');
  STUDIO_PALETTE.forEach(hex => {
    const sw = document.createElement('div');
    sw.className = 'studio-swatch';
    sw.dataset.hex = hex;
    sw.style.background = '#' + hex.toString(16).padStart(6, '0');
    sw.addEventListener('click', () => _studioApplyColor(hex));
    swCont.appendChild(sw);
  });

  // Build nudge rows dynamically
  const sections = [
    { label:'Size',     props:['w','h','d'] },
    { label:'Position', props:['x','y','z'] },
    { label:'Rotation', props:['rx','ry','rz'] },
  ];
  const nudgeCont = document.getElementById('studio-nudges');
  sections.forEach(sec => {
    const lbl = document.createElement('div');
    lbl.className = 'studio-section-label';
    lbl.textContent = sec.label;
    nudgeCont.appendChild(lbl);
    sec.props.forEach(prop => {
      const row = document.createElement('div');
      row.className = 'studio-nudge-row';
      row.innerHTML = `
        <span class="studio-prop-label">${STUDIO_PROPS.find(p=>p[0]===prop)[1]}</span>
        <button class="studio-nudge-btn" data-prop="${prop}" data-dir="-1">−</button>
        <span class="studio-nudge-val" id="sv-${prop}">—</span>
        <button class="studio-nudge-btn" data-prop="${prop}" data-dir="1">＋</button>
      `;
      nudgeCont.appendChild(row);
    });
  });
  nudgeCont.querySelectorAll('.studio-nudge-btn').forEach(btn =>
    btn.addEventListener('click', () => _studioNudge(btn.dataset.prop, parseFloat(btn.dataset.dir))));

  // Click detection on studio canvas (click = pointer didn't move much)
  canvas.addEventListener('pointerdown', e => { _stPointerStart = { x:e.clientX, y:e.clientY }; });
  canvas.addEventListener('pointerup', e => {
    if (!_stPointerStart) return;
    const dx = e.clientX - _stPointerStart.x, dy = e.clientY - _stPointerStart.y;
    _stPointerStart = null;
    if (dx*dx + dy*dy > 36) return;
    _studioPickObject(e.clientX, e.clientY);
  });

  // Load saved objects from localStorage (with schema versioning)
  const _ss = loadSave('td_studio_objects', null);
  if (_ss && typeof _ss === 'object') studioSaved = _ss;

  window.addEventListener('resize', () => {
    if (!studioMode) return;
    _stCamera.aspect = window.innerWidth / window.innerHeight;
    _stCamera.updateProjectionMatrix();
    _stRenderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function enterStudio() {
  _studioInit();
  studioMode = true;
  selectedTool = null; selectedDef = null; _defPanel.style.display = 'none';
  ghostMesh.visible = false;
  _buildCards.forEach(c => c.classList.remove('selected'));
  document.getElementById('hud').style.display = 'none';
  document.getElementById('build-panel').style.display = 'none';
  document.getElementById('scroll-hint').style.display = 'none';
  document.getElementById('studio-tab-bar').style.display = 'flex';
  _stLayerEnsureDefault();
  _studioSwitchTab('build');
  showTooltip('Studio — 🔨 Build objects · 🌍 Edit world · ⚔️ Tune units  [B to exit]', 4000);
}

function exitStudio() {
  _worldDeselect();
  studioMode = false;
  // Same reasoning as exitTestMode — clear any stale level/timer state
  currentLevel = null;
  if (_levelCompleteTimer) { clearTimeout(_levelCompleteTimer); _levelCompleteTimer = null; }
  document.getElementById('hud').style.display = '';
  document.getElementById('build-panel').style.display = '';
  document.getElementById('scroll-hint').style.display = '';
  studioTab = 'build';
  _stNudgeActive = false;
  if (studioRafId) { cancelAnimationFrame(studioRafId); studioRafId = null; }
  if (_unitPreviewRafId) { cancelAnimationFrame(_unitPreviewRafId); _unitPreviewRafId = null; }
  _unitPreviewDisposeGroup();
  document.getElementById('studio-tab-bar').style.display  = 'none';
  document.getElementById('studio-canvas').style.display   = 'none';
  document.getElementById('studio-left').style.display     = 'none';
  document.getElementById('studio-right').style.display    = 'none';
  document.getElementById('studio-world-left').style.display  = 'none';
  document.getElementById('studio-units-left').style.display  = 'none';
  document.getElementById('studio-units-right').style.display = 'none';
  document.getElementById('unit-preview-wrap').style.display  = 'none';
}

function _studioSwitchTab(tab) {
  studioTab = tab;
  document.querySelectorAll('.stab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab !== 'world') _worldDeselect();
  const isBuild = tab === 'build';
  const isWorld = tab === 'world';
  const isUnits = tab === 'units';
  document.getElementById('studio-canvas').style.display    = isBuild ? 'block' : 'none';
  document.getElementById('studio-left').style.display      = isBuild ? 'block' : 'none';
  document.getElementById('studio-right').style.display     = isBuild ? 'block' : 'none';
  document.getElementById('studio-world-left').style.display  = isWorld ? 'block' : 'none';
  document.getElementById('studio-units-left').style.display  = isUnits ? 'block' : 'none';
  document.getElementById('studio-units-right').style.display = isUnits ? 'block' : 'none';
  document.getElementById('unit-preview-wrap').style.display  = isUnits ? 'block' : 'none';
  if (!isUnits && _unitPreviewRafId) { cancelAnimationFrame(_unitPreviewRafId); _unitPreviewRafId = null; }
  if (isBuild) { _studioRefreshList(); if (!studioRafId) _studioAnimate(); }
  else { if (studioRafId) { cancelAnimationFrame(studioRafId); studioRafId = null; } _stNudgeActive = false; }
  if (isUnits) _unitLabInitButtons();
}

function _studioAnimate() {
  if (!studioMode || studioTab !== 'build') { studioRafId = null; return; }
  studioRafId = requestAnimationFrame(_studioAnimate);
  _stControls.update();
  _stRenderer.render(_stScene, _stCamera);
}

function _studioPickObject(cx, cy) {
  const canvas = document.getElementById('studio-canvas');
  const r = canvas.getBoundingClientRect();
  const ndx = ((cx - r.left) / r.width)  * 2 - 1;
  const ndy = -((cy - r.top)  / r.height) * 2 + 1;
  _stRaycaster.setFromCamera(new THREE.Vector2(ndx, ndy), _stCamera);
  // Only pick from visible, unlocked layers
  const pickable = studioParts.filter(p => {
    const lay = _stLayers.find(l => l.id === p.layerId);
    return !lay || (lay.visible && !lay.locked);
  });
  const hits = _stRaycaster.intersectObjects(pickable.map(p => p.mesh), false);
  if (!hits.length) { _studioDeselect(); return; }
  const part = pickable.find(p => p.mesh === hits[0].object);
  if (part) _studioSelectPart(part);
}

function _studioSelectPart(part) {
  _studioDeselect();
  studioSel = part;
  part.mesh.material.emissive.setHex(0x0044aa);
  part.mesh.material.emissiveIntensity = 0.7;
  _studioUpdateDisplays();
  document.getElementById('studio-part-section').style.display = 'block';
  const shapeInfo = STUDIO_SHAPES.find(s => s.id === (part.shape || 'box'));
  const lbl = document.getElementById('studio-part-shape');
  if (lbl) lbl.textContent = shapeInfo ? `${shapeInfo.label}  (${shapeInfo.hint})` : '';
  document.querySelectorAll('.studio-swatch').forEach(s =>
    s.classList.toggle('active', parseInt(s.dataset.hex) === part.color));
  _stLayerRefreshUI();
}

function _studioDeselect() {
  if (!studioSel) return;
  studioSel.mesh.material.emissiveIntensity = 0;
  studioSel = null;
  document.getElementById('studio-part-section').style.display = 'none';
  document.querySelectorAll('.studio-swatch').forEach(s => s.classList.remove('active'));
  _stLayerRefreshUI();
}

function _studioUpdateDisplays() {
  if (!studioSel) return;
  const p = studioSel, m = p.mesh;
  STUDIO_PROPS.forEach(([prop,, , isRot]) => {
    const el = document.getElementById(`sv-${prop}`);
    if (!el) return;
    let v;
    if (prop==='w'||prop==='h'||prop==='d') v = p[prop].toFixed(2);
    else if (isRot) v = Math.round(m.rotation[prop.slice(1)] * 180/Math.PI) + '°';
    else v = m.position[prop].toFixed(2);
    el.textContent = v;
  });
}

function _studioNudge(prop, dir) {
  if (!studioSel) return;
  if (!_stNudgeActive) { _studioSnapshot(); _stNudgeActive = true; }
  const p = studioSel, m = p.mesh;
  const step = _studioGetStep(prop);
  if (prop==='w'||prop==='h'||prop==='d') {
    p[prop] = Math.max(0.05, p[prop] + dir * step);
    m.geometry.dispose();
    m.geometry = _studioMakeGeometry(p.shape || 'box', p.w, p.h, p.d);
  } else if (prop==='x'||prop==='y'||prop==='z') {
    m.position[prop] += dir * step;
    if (prop==='y' && m.position.y < 0) m.position.y = 0;
  } else {
    m.rotation[prop.slice(1)] += dir * step;
  }
  _studioUpdateDisplays();
}

function _studioApplyColor(hex) {
  if (!studioSel) return;
  _stNudgeActive = false;
  _studioSnapshot();
  studioSel.color = hex;
  const mat = studioSel.mesh.material;
  if (mat.map) mat.map.dispose();
  mat.map = _studioMakeVoxelTexture(hex);
  mat.emissive.setHex(0x0044aa);
  mat.emissiveIntensity = 0.7;
  mat.needsUpdate = true;
  document.querySelectorAll('.studio-swatch').forEach(s =>
    s.classList.toggle('active', parseInt(s.dataset.hex) === hex));
}

function _studioAddShape(shape) {
  _stNudgeActive = false;
  _stLayerEnsureDefault();
  _studioSnapshot();
  shape = shape || 'box';
  const m = new THREE.Mesh(_studioMakeGeometry(shape, 1, 1, 1), _studioMakeMaterial(0x999999));
  m.position.set(0, 0.5, 0);
  m.castShadow = true;
  m.receiveShadow = true;
  const lid = _stActiveLayerId || _stLayers[0]?.id;
  (_stLayerGroups[lid] || _stGroup).add(m);
  const part = { mesh:m, shape, w:1, h:1, d:1, color:0x999999, layerId: lid };
  studioParts.push(part);
  _studioSelectPart(part);
  _studioUpdatePartCount();
}

function _studioDeletePart() {
  if (!studioSel) return;
  _stNudgeActive = false;
  _studioSnapshot();
  (_stLayerGroups[studioSel.layerId] || _stGroup).remove(studioSel.mesh);
  studioSel.mesh.geometry.dispose();
  if (studioSel.mesh.material.map) studioSel.mesh.material.map.dispose();
  studioSel.mesh.material.dispose();
  studioParts = studioParts.filter(p => p !== studioSel);
  studioSel = null;
  document.getElementById('studio-part-section').style.display = 'none';
  document.querySelectorAll('.studio-swatch').forEach(s => s.classList.remove('active'));
  _studioUpdatePartCount();
  _stLayerRefreshUI();
}

function _studioClearAllNoSnap() {
  studioParts.forEach(p => {
    (_stLayerGroups[p.layerId] || _stGroup).remove(p.mesh);
    p.mesh.geometry.dispose();
    if (p.mesh.material.map) p.mesh.material.map.dispose();
    p.mesh.material.dispose();
  });
  studioParts = [];
  studioSel = null;
  document.getElementById('studio-part-section').style.display = 'none';
  document.querySelectorAll('.studio-swatch').forEach(s => s.classList.remove('active'));
}

// ── Layer system helpers ──────────────────────────────────────────────────────
function _stLayersClear() {
  Object.values(_stLayerGroups).forEach(g => _stGroup.remove(g));
  Object.keys(_stLayerGroups).forEach(k => delete _stLayerGroups[k]);
  _stLayers.length = 0;
  _stActiveLayerId = null;
  _stLayerNextId = 1;
}

function _stLayerCreate(name) {
  const id = _stLayerNextId++;
  _stLayers.push({ id, name: name || `Layer ${id}`, visible: true, locked: false });
  const g = new THREE.Group();
  _stLayerGroups[id] = g;
  _stGroup.add(g);
  return id;
}

function _stLayerEnsureDefault() {
  if (_stLayers.length === 0) {
    const id = _stLayerCreate('Layer 1');
    _stActiveLayerId = id;
    _stLayerRefreshUI();
  }
}

function _stLayerSetActive(id) {
  _stActiveLayerId = id;
  _stLayerRefreshUI();
}

function _stLayerToggleVisible(id) {
  const lay = _stLayers.find(l => l.id === id);
  if (!lay) return;
  lay.visible = !lay.visible;
  if (_stLayerGroups[id]) _stLayerGroups[id].visible = lay.visible;
  _stLayerRefreshUI();
}

function _stLayerToggleLock(id) {
  const lay = _stLayers.find(l => l.id === id);
  if (!lay) return;
  lay.locked = !lay.locked;
  _stLayerRefreshUI();
}

function _stLayerDelete(id) {
  const idx = _stLayers.findIndex(l => l.id === id);
  if (idx === -1) return;
  if (_stLayers.length === 1) { showTooltip('Need at least one layer', 1500); return; }
  const targetIdx = idx > 0 ? idx - 1 : 1;
  const targetId = _stLayers[targetIdx].id;
  studioParts.filter(p => p.layerId === id).forEach(p => {
    p.layerId = targetId;
    (_stLayerGroups[targetId] || _stGroup).add(p.mesh);
  });
  _stGroup.remove(_stLayerGroups[id]);
  delete _stLayerGroups[id];
  _stLayers.splice(idx, 1);
  if (_stActiveLayerId === id) _stActiveLayerId = targetId;
  _stLayerRefreshUI();
}

function _stLayerGetPartCount(id) {
  return studioParts.filter(p => p.layerId === id).length;
}

function _stLayerMoveUp(id) {
  const idx = _stLayers.findIndex(l => l.id === id);
  if (idx <= 0) return;
  [_stLayers[idx - 1], _stLayers[idx]] = [_stLayers[idx], _stLayers[idx - 1]];
  _stLayerRefreshUI();
}

function _stLayerMoveDown(id) {
  const idx = _stLayers.findIndex(l => l.id === id);
  if (idx === -1 || idx >= _stLayers.length - 1) return;
  [_stLayers[idx], _stLayers[idx + 1]] = [_stLayers[idx + 1], _stLayers[idx]];
  _stLayerRefreshUI();
}

function _stMovePartToLayer(targetId) {
  if (!studioSel || studioSel.layerId === targetId) return;
  _studioSnapshot();
  (_stLayerGroups[studioSel.layerId] || _stGroup).remove(studioSel.mesh);
  studioSel.layerId = targetId;
  (_stLayerGroups[targetId] || _stGroup).add(studioSel.mesh);
  _stLayerRefreshUI();
}

function _stLayerRefreshUI() {
  const list = document.getElementById('studio-layer-list');
  if (!list) return;
  list.innerHTML = '';
  [..._stLayers].reverse().forEach(lay => {
    const idx = _stLayers.indexOf(lay); // position in the REAL array (display list is reversed)
    const row = document.createElement('div');
    row.className = 'studio-layer-item' + (lay.id === _stActiveLayerId ? ' active' : '');
    row.dataset.id = lay.id;

    const visBtn = document.createElement('button');
    visBtn.className = 'st-lyr-vis' + (lay.visible ? '' : ' off');
    visBtn.title = lay.visible ? 'Hide layer' : 'Show layer';
    visBtn.textContent = lay.visible ? '👁' : '🚫';
    visBtn.addEventListener('click', e => { e.stopPropagation(); _stLayerToggleVisible(lay.id); });

    const lockBtn = document.createElement('button');
    lockBtn.className = 'st-lyr-lock' + (lay.locked ? ' on' : '');
    lockBtn.title = lay.locked ? 'Unlock layer' : 'Lock layer';
    lockBtn.textContent = lay.locked ? '🔒' : '🔓';
    lockBtn.addEventListener('click', e => { e.stopPropagation(); _stLayerToggleLock(lay.id); });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'st-lyr-name';
    nameSpan.textContent = lay.name;
    nameSpan.title = 'Click to select · Double-click to rename';
    nameSpan.addEventListener('dblclick', e => {
      e.stopPropagation();
      const n = prompt('Rename layer:', lay.name);
      if (n && n.trim()) { lay.name = n.trim(); _stLayerRefreshUI(); }
    });

    const cnt = document.createElement('span');
    cnt.className = 'st-lyr-cnt';
    const c = _stLayerGetPartCount(lay.id);
    cnt.textContent = c || '';
    cnt.title = `${c} part(s)`;

    const upBtn = document.createElement('button');
    upBtn.className = 'st-lyr-ord';
    upBtn.title = 'Move layer up';
    upBtn.textContent = '▲';
    upBtn.disabled = (idx === _stLayers.length - 1); // reversed display, top = last in array
    upBtn.addEventListener('click', e => { e.stopPropagation(); _stLayerMoveDown(lay.id); }); // reversed: visual up = array down

    const dnBtn = document.createElement('button');
    dnBtn.className = 'st-lyr-ord';
    dnBtn.title = 'Move layer down';
    dnBtn.textContent = '▼';
    dnBtn.disabled = (idx === 0);
    dnBtn.addEventListener('click', e => { e.stopPropagation(); _stLayerMoveUp(lay.id); }); // reversed

    const delBtn = document.createElement('button');
    delBtn.className = 'st-lyr-del';
    delBtn.title = 'Delete layer';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', e => { e.stopPropagation(); _stLayerDelete(lay.id); });

    row.addEventListener('click', () => _stLayerSetActive(lay.id));
    row.append(visBtn, lockBtn, nameSpan, cnt, upBtn, dnBtn, delBtn);
    list.appendChild(row);
  });
}

function _studioClearAll() {
  _stNudgeActive = false;
  _studioSnapshot();
  _studioClearAllNoSnap();
  _studioUpdatePartCount();
  _stLayerRefreshUI();
}

function _studioSave() {
  const name = document.getElementById('studio-obj-name').value.trim() || 'Unnamed';
  if (!studioParts.length) { showTooltip('Add some boxes first!', 1800); return; }
  const data = {
    name,
    layers: _stLayers.map(l => ({ id: l.id, name: l.name, visible: l.visible, locked: l.locked })),
    activeLayerId: _stActiveLayerId,
    parts: studioParts.map(p => ({
      shape: p.shape || 'box',
      x:p.mesh.position.x, y:p.mesh.position.y, z:p.mesh.position.z,
      w:p.w, h:p.h, d:p.d,
      rx:p.mesh.rotation.x, ry:p.mesh.rotation.y, rz:p.mesh.rotation.z,
      color:p.color,
      layerId: p.layerId,
    })),
  };
  const i = studioSaved.findIndex(o => o.name === name);
  if (i !== -1) studioSaved[i] = data; else studioSaved.push(data);
  saveSave('td_studio_objects', studioSaved);
  studioLoadedName = name;
  _studioRefreshList();
  showTooltip(`Saved "${name}"`, 1500);
}

function _studioLoad(data) {
  _stNudgeActive = false;
  _studioSnapshot();
  _studioClearAllNoSnap();
  _stLayersClear();
  if (data.layers && data.layers.length) {
    data.layers.forEach(l => {
      _stLayers.push({ id: l.id, name: l.name, visible: l.visible !== false, locked: !!l.locked });
      const g = new THREE.Group();
      g.visible = l.visible !== false;
      _stLayerGroups[l.id] = g;
      _stGroup.add(g);
      if (l.id >= _stLayerNextId) _stLayerNextId = l.id + 1;
    });
    _stActiveLayerId = data.activeLayerId || _stLayers[0].id;
  } else {
    const id = _stLayerCreate('Layer 1');
    _stActiveLayerId = id;
  }
  const fallbackId = _stActiveLayerId;
  data.parts.forEach(pd => {
    const sh = pd.shape || 'box';
    const lid = (pd.layerId && _stLayerGroups[pd.layerId]) ? pd.layerId : fallbackId;
    const m = new THREE.Mesh(_studioMakeGeometry(sh, pd.w, pd.h, pd.d), _studioMakeMaterial(pd.color || 0x999999));
    m.position.set(pd.x, pd.y, pd.z);
    m.rotation.set(pd.rx||0, pd.ry||0, pd.rz||0);
    m.castShadow = true;
    m.receiveShadow = true;
    (_stLayerGroups[lid] || _stGroup).add(m);
    studioParts.push({ mesh:m, shape:sh, w:pd.w, h:pd.h, d:pd.d, color:pd.color||0x999999, layerId: lid });
  });
  document.getElementById('studio-obj-name').value = data.name;
  studioLoadedName = data.name;
  _studioUpdatePartCount();
  _studioUpdateUndoUI();
  _stLayerRefreshUI();
}

function _studioDeleteSaved(name) {
  studioSaved = studioSaved.filter(o => o.name !== name);
  saveSave('td_studio_objects', studioSaved);
  if (studioLoadedName === name) studioLoadedName = null;
  _studioRefreshList();
}

function _studioRefreshList() {
  const list = document.getElementById('studio-obj-list');
  list.innerHTML = '';
  if (!studioSaved.length) {
    list.innerHTML = '<div style="font-size:10px;color:rgba(0,180,160,0.4);text-align:center;padding:4px">No saved objects</div>';
    return;
  }
  studioSaved.forEach(obj => {
    const row = document.createElement('div');
    row.className = 'studio-obj-row';
    const lb = document.createElement('button');
    lb.className = 'studio-obj-load' + (obj.name === studioLoadedName ? ' active' : '');
    lb.textContent = obj.name;
    lb.title = `${obj.parts.length} part(s) · placeable in the Map Editor`;
    lb.addEventListener('click', () => { _studioLoad(obj); _studioRefreshList(); });
    const db = document.createElement('button');
    db.className = 'studio-obj-del';
    db.textContent = '✕';
    db.addEventListener('click', () => _studioDeleteSaved(obj.name));
    row.appendChild(lb); row.appendChild(db);
    list.appendChild(row);
  });
}

// ── Undo / Redo / Duplicate / Step helpers ───────────────────────────────────
function _studioGetStep(prop) {
  const base = (STUDIO_PROPS.find(c => c[0] === prop) || [,,0.1])[2];
  return base * [0.5, 1, 4][_stStepMode];
}

function _studioUpdatePartCount() {
  const el = document.getElementById('studio-part-count');
  if (el) el.textContent = studioParts.length || '';
}

function _studioUpdateUndoUI() {
  const ub = document.getElementById('studio-undo-btn');
  const rb = document.getElementById('studio-redo-btn');
  if (ub) ub.disabled = _stUndoStack.length === 0;
  if (rb) rb.disabled = _stRedoStack.length === 0;
}

function _studioSnapshot() {
  _stUndoStack.push({
    parts: studioParts.map(p => ({
      shape: p.shape || 'box', w: p.w, h: p.h, d: p.d, color: p.color,
      x: p.mesh.position.x, y: p.mesh.position.y, z: p.mesh.position.z,
      rx: p.mesh.rotation.x, ry: p.mesh.rotation.y, rz: p.mesh.rotation.z,
      layerId: p.layerId,
    })),
    layers: _stLayers.map(l => ({ ...l })),
    activeLayerId: _stActiveLayerId,
  });
  if (_stUndoStack.length > 20) _stUndoStack.shift();
  _stRedoStack.length = 0;
  _studioUpdateUndoUI();
}

function _studioCaptureCurrent() {
  return {
    parts: studioParts.map(p => ({
      shape: p.shape || 'box', w: p.w, h: p.h, d: p.d, color: p.color,
      x: p.mesh.position.x, y: p.mesh.position.y, z: p.mesh.position.z,
      rx: p.mesh.rotation.x, ry: p.mesh.rotation.y, rz: p.mesh.rotation.z,
      layerId: p.layerId,
    })),
    layers: _stLayers.map(l => ({ ...l })),
    activeLayerId: _stActiveLayerId,
  };
}

function _studioRestoreState(snap) {
  _studioClearAllNoSnap();
  _stLayersClear();
  const layers = Array.isArray(snap) ? [] : (snap.layers || []);
  const parts  = Array.isArray(snap) ? snap : (snap.parts || []);
  const activeId = Array.isArray(snap) ? null : snap.activeLayerId;
  if (layers.length) {
    layers.forEach(l => {
      _stLayers.push({ id: l.id, name: l.name, visible: l.visible !== false, locked: !!l.locked });
      const g = new THREE.Group();
      g.visible = l.visible !== false;
      _stLayerGroups[l.id] = g;
      _stGroup.add(g);
      if (l.id >= _stLayerNextId) _stLayerNextId = l.id + 1;
    });
    _stActiveLayerId = activeId || _stLayers[0].id;
  } else {
    _stLayerEnsureDefault();
  }
  const fallbackId = _stActiveLayerId;
  parts.forEach(pd => {
    const sh = pd.shape || 'box';
    const lid = (pd.layerId && _stLayerGroups[pd.layerId]) ? pd.layerId : fallbackId;
    const m = new THREE.Mesh(
      _studioMakeGeometry(sh, pd.w, pd.h, pd.d),
      _studioMakeMaterial(pd.color || 0x999999)
    );
    m.position.set(pd.x || 0, Math.max(0, pd.y ?? 0.5), pd.z || 0);
    m.rotation.set(pd.rx || 0, pd.ry || 0, pd.rz || 0);
    m.castShadow = m.receiveShadow = true;
    (_stLayerGroups[lid] || _stGroup).add(m);
    studioParts.push({ mesh: m, shape: sh, w: pd.w, h: pd.h, d: pd.d, color: pd.color || 0x999999, layerId: lid });
  });
  _studioUpdatePartCount();
  _studioUpdateUndoUI();
  _stLayerRefreshUI();
}

function _studioUndo() {
  if (!_stUndoStack.length) return;
  _stRedoStack.push(_studioCaptureCurrent());
  _stNudgeActive = false;
  _studioRestoreState(_stUndoStack.pop());
}

function _studioRedo() {
  if (!_stRedoStack.length) return;
  _stUndoStack.push(_studioCaptureCurrent());
  _stNudgeActive = false;
  _studioRestoreState(_stRedoStack.pop());
}

function _studioDuplicatePart() {
  if (!studioSel) return;
  _stNudgeActive = false;
  _studioSnapshot();
  const p = studioSel;
  const m = new THREE.Mesh(
    _studioMakeGeometry(p.shape || 'box', p.w, p.h, p.d),
    _studioMakeMaterial(p.color)
  );
  m.position.copy(p.mesh.position);
  m.position.x += p.w + 0.2;
  m.rotation.copy(p.mesh.rotation);
  m.castShadow = m.receiveShadow = true;
  const lid = p.layerId || _stActiveLayerId || _stLayers[0]?.id;
  (_stLayerGroups[lid] || _stGroup).add(m);
  const np = { mesh: m, shape: p.shape || 'box', w: p.w, h: p.h, d: p.d, color: p.color, layerId: lid };
  studioParts.push(np);
  _studioSelectPart(np);
  _studioUpdatePartCount();
}

function _studioSetStepMode(mode) {
  _stStepMode = mode;
  document.querySelectorAll('.studio-step-opt').forEach((b, i) =>
    b.classList.toggle('active', i === mode));
}

// ── Event listeners ──────────────────────────────────────────────────────────
document.querySelectorAll('.studio-shape-btn').forEach(btn =>
  btn.addEventListener('click', () => _studioAddShape(btn.dataset.shape)));
document.getElementById('studio-clear-all').addEventListener('click', _studioClearAll);
document.getElementById('studio-delete-part').addEventListener('click', _studioDeletePart);
document.getElementById('studio-save-btn').addEventListener('click', _studioSave);
document.getElementById('studio-exit-btn').addEventListener('click', exitStudio);
document.getElementById('studio-undo-btn').addEventListener('click', _studioUndo);
document.getElementById('studio-redo-btn').addEventListener('click', _studioRedo);
document.getElementById('studio-duplicate-part').addEventListener('click', _studioDuplicatePart);
document.getElementById('studio-add-layer').addEventListener('click', () => {
  _studioSnapshot();
  const id = _stLayerCreate();
  _stLayerSetActive(id);
});
document.querySelectorAll('.studio-step-opt').forEach((b, i) =>
  b.addEventListener('click', () => _studioSetStepMode(i)));

// Tab bar
document.querySelectorAll('.stab').forEach(b =>
  b.addEventListener('click', () => _studioSwitchTab(b.dataset.tab)));
document.getElementById('studio-tab-exit').addEventListener('click', exitStudio);

// ─────────────────────────────────────────────
//  WORLD EDITOR MODE
// ─────────────────────────────────────────────
const _worldRaycaster = new THREE.Raycaster();

function _worldPickObject(cx, cy) {
  const r = canvas.getBoundingClientRect();
  _worldRaycaster.setFromCamera(
    new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1),
    camera
  );
  const filtered = _worldFilter === 'all' ? initialScenery : initialScenery.filter(s => s.type === _worldFilter);
  const roots = filtered.map(s => s.group);
  const hits = _worldRaycaster.intersectObjects(roots, true);
  if (!hits.length) { _worldDeselect(); return; }
  let obj = hits[0].object;
  while (obj.parent && !roots.includes(obj)) obj = obj.parent;
  const item = initialScenery.find(s => s.group === obj);
  if (item) _worldSelectItem(item);
}

function _worldSelectItem(item) {
  _worldDeselect();
  _worldSel = item;
  item.group.traverse(m => {
    if (!m.isMesh || !m.material || !m.material.emissive) return;
    m.userData._wE  = m.material.emissive.getHex();
    m.userData._wEI = m.material.emissiveIntensity;
    m.material.emissive.setHex(0x0066ff);
    m.material.emissiveIntensity = 0.55;
  });
  document.getElementById('world-sel-info').textContent =
    `${item.type || 'object'} at (${item.col}, ${item.row})`;
  document.getElementById('world-transform').style.display = 'block';
  _worldRefreshPanel();
}

function _worldDeselect() {
  if (!_worldSel) return;
  _worldSel.group.traverse(m => {
    if (!m.isMesh || !m.material || !m.material.emissive || m.userData._wE === undefined) return;
    m.material.emissive.setHex(m.userData._wE);
    m.material.emissiveIntensity = m.userData._wEI || 0;
    delete m.userData._wE; delete m.userData._wEI;
  });
  _worldSel = null;
  document.getElementById('world-sel-info').textContent = 'Click any object in scene';
  document.getElementById('world-transform').style.display = 'none';
}

function _worldRefreshPanel() {
  if (!_worldSel) return;
  const g = _worldSel.group;
  document.getElementById('world-px').textContent = g.position.x.toFixed(2);
  document.getElementById('world-py').textContent = g.position.y.toFixed(2);
  document.getElementById('world-pz').textContent = g.position.z.toFixed(2);
  document.getElementById('world-ps').textContent = g.scale.x.toFixed(2);
}

function _worldNudge(axis, dir) {
  if (!_worldSel) return;
  _worldSel.group.position[axis] = +(_worldSel.group.position[axis] + dir * 0.25).toFixed(2);
  _worldRefreshPanel();
}

function _worldRotate(dir) {
  if (!_worldSel) return;
  _worldSel.group.rotation.y += dir * Math.PI / 2;
}

function _worldScale(dir) {
  if (!_worldSel) return;
  const s = Math.max(0.1, +(_worldSel.group.scale.x + dir * 0.1).toFixed(2));
  _worldSel.group.scale.setScalar(s);
  _worldRefreshPanel();
}

function _worldDelete() {
  if (!_worldSel) return;
  const item = _worldSel;
  _worldDeselect();
  scene.remove(item.group);
  disposeGroup(item.group);
  const idx = initialScenery.indexOf(item);
  if (idx !== -1) initialScenery.splice(idx, 1);
}

// World editor event listeners
document.querySelectorAll('.world-nudge-btn').forEach(btn =>
  btn.addEventListener('click', () => _worldNudge(btn.dataset.axis, parseFloat(btn.dataset.dir))));
document.getElementById('world-rot-l').addEventListener('click', () => _worldRotate(-1));
document.getElementById('world-rot-r').addEventListener('click', () => _worldRotate(1));
document.getElementById('world-scale-d').addEventListener('click', () => _worldScale(-1));
document.getElementById('world-scale-u').addEventListener('click', () => _worldScale(1));
document.getElementById('world-delete-btn').addEventListener('click', _worldDelete);
document.querySelectorAll('.world-filter').forEach(b =>
  b.addEventListener('click', () => {
    _worldFilter = b.dataset.cat;
    document.querySelectorAll('.world-filter').forEach(x => x.classList.toggle('active', x === b));
    _worldDeselect();
  }));

// ─────────────────────────────────────────────
//  UNIT LAB MODE
// ─────────────────────────────────────────────
const _UNIT_DEF_TYPES = ['wall','tower','catapult','archer','swordsman','knight','spearman','mage','ballista','spiketrap'];
const _UNIT_ORC_KEYS  = Object.keys(CFG.ORC_TYPES);

const _DEF_STAT_CFG = {
  hp:    { label:'HP',      step:1,   min:1,   max:100 },
  range: { label:'Range',   step:0.5, min:0.5, max:14  },
  rate:  { label:'Rate/s',  step:0.1, min:0.1, max:3.5 },
  dmg:   { label:'Damage',  step:1,   min:1,   max:22  },
  aoe:   { label:'AoE r',   step:0.1, min:0.1, max:6   },
};
const _ORC_STAT_CFG = {
  hp:        { label:'HP',       step:1,   min:1,   max:80  },
  speed:     { label:'Speed',    step:0.1, min:0.1, max:9   },
  reward:    { label:'Gold',     step:1,   min:0,   max:80  },
  castleDmg: { label:'Cst.Dmg', step:1,   min:0,   max:60  },
  wallDmg:   { label:'Wal.Dmg', step:1,   min:0,   max:20  },
  defDmg:    { label:'Def.Dmg', step:1,   min:0,   max:8   },
  defRate:   { label:'Def.Rate',step:0.1, min:0.1, max:2.5 },
};

let _unitLabInited = false;
function _unitLabInitButtons() {
  if (_unitLabInited) return;
  _unitLabInited = true;
  const defGrid = document.getElementById('units-def-grid');
  _UNIT_DEF_TYPES.forEach(t => {
    const b = document.createElement('button');
    b.className = 'unit-type-btn'; b.dataset.utype = t; b.dataset.ucat = 'defender';
    b.textContent = t.charAt(0).toUpperCase() + t.slice(1);
    b.addEventListener('click', () => _unitLabSelect(t, 'defender'));
    defGrid.appendChild(b);
  });
  const orcGrid = document.getElementById('units-orc-grid');
  _UNIT_ORC_KEYS.forEach(t => {
    const b = document.createElement('button');
    b.className = 'unit-type-btn'; b.dataset.utype = t; b.dataset.ucat = 'enemy';
    // Readable label from the camelCase key ("enemyArcher" -> "Enemy Archer")
    const nice = t.replace(/([A-Z])/g, ' $1');
    b.textContent = nice.charAt(0).toUpperCase() + nice.slice(1);
    b.title = b.textContent;
    b.addEventListener('click', () => _unitLabSelect(t, 'enemy'));
    orcGrid.appendChild(b);
  });
}

function _unitLabSelect(type, cat) {
  _unitLabType = type; _unitLabCat = cat;
  document.querySelectorAll('.unit-type-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.utype === type && b.dataset.ucat === cat));
  const displayName = type.charAt(0).toUpperCase() + type.slice(1).replace(/([A-Z])/g, ' $1');
  document.getElementById('units-type-name').textContent = displayName;
  const lbl = document.getElementById('unit-preview-label');
  if (lbl) lbl.textContent = displayName;
  _unitLabBuildStats();
  _unitPreviewShowUnit(type, cat);
}

function _unitLabBuildStats() {
  const area = document.getElementById('units-stat-area');
  area.innerHTML = '';
  const statObj  = _unitLabCat === 'defender' ? CFG.STATS[_unitLabType] : CFG.ORC_TYPES[_unitLabType];
  if (!statObj) return;
  const defaults = _unitLabCat === 'defender' ? _UNIT_DEF_DEFAULTS[_unitLabType] : _UNIT_ORC_DEFAULTS[_unitLabType];
  const cfgMap   = _unitLabCat === 'defender' ? _DEF_STAT_CFG : _ORC_STAT_CFG;
  Object.entries(cfgMap).forEach(([stat, cfg]) => {
    if (!(stat in statObj)) return;
    const isInt    = cfg.step >= 1;
    const val      = isInt ? Math.round(statObj[stat]) : statObj[stat].toFixed(1);
    const modified = defaults && defaults[stat] !== undefined && statObj[stat] !== defaults[stat];
    const pct      = cfg.max ? Math.min(100, (statObj[stat] / cfg.max) * 100).toFixed(1) : 0;
    const row = document.createElement('div');
    row.className = 'unit-stat-row' + (modified ? ' unit-stat-modified' : '');
    row.innerHTML = `
      <span class="unit-stat-label">${cfg.label}</span>
      <button class="unit-stat-nudge" data-stat="${stat}" data-dir="-1">−</button>
      <span class="unit-stat-val" id="usv-${stat}">${val}</span>
      <button class="unit-stat-nudge" data-stat="${stat}" data-dir="1">＋</button>
      <div class="unit-stat-bar-wrap"><div class="unit-stat-bar" id="usb-${stat}" style="width:${pct}%"></div></div>`;
    area.appendChild(row);
  });
  // DPS computed row (defenders with dmg + rate only)
  if (_unitLabCat === 'defender' && statObj.dmg != null && statObj.rate != null) {
    const dps = (statObj.dmg * statObj.rate).toFixed(1);
    const dpsRow = document.createElement('div');
    dpsRow.className = 'unit-dps-row';
    dpsRow.id = 'unit-dps-row';
    dpsRow.innerHTML = `<span class="unit-dps-label">DPS (dmg × rate)</span><span class="unit-dps-val" id="unit-dps-val">${dps}</span>`;
    area.appendChild(dpsRow);
  }
  const resetBtn = document.createElement('button');
  resetBtn.className = 'unit-reset-btn';
  resetBtn.textContent = 'Reset to Default';
  resetBtn.addEventListener('click', _unitLabReset);
  area.appendChild(resetBtn);
  area.querySelectorAll('.unit-stat-nudge').forEach(btn =>
    btn.addEventListener('click', () => _unitLabNudge(btn.dataset.stat, parseFloat(btn.dataset.dir))));
}

function _unitLabNudge(stat, dir) {
  const statObj  = _unitLabCat === 'defender' ? CFG.STATS[_unitLabType] : CFG.ORC_TYPES[_unitLabType];
  if (!statObj || !(stat in statObj)) return;
  const cfg      = (_unitLabCat === 'defender' ? _DEF_STAT_CFG : _ORC_STAT_CFG)[stat];
  const isInt    = cfg.step >= 1;
  statObj[stat]  = Math.max(cfg.min, +(statObj[stat] + dir * cfg.step).toFixed(isInt ? 0 : 1));
  const el       = document.getElementById(`usv-${stat}`);
  if (el) {
    el.textContent = isInt ? Math.round(statObj[stat]) : statObj[stat].toFixed(1);
    const defaults  = _unitLabCat === 'defender' ? _UNIT_DEF_DEFAULTS[_unitLabType] : _UNIT_ORC_DEFAULTS[_unitLabType];
    const modified  = defaults && defaults[stat] !== undefined && statObj[stat] !== defaults[stat];
    const row       = el.closest('.unit-stat-row');
    row?.classList.toggle('unit-stat-modified', modified);
    // Update bar
    if (cfg.max) {
      const bar = document.getElementById(`usb-${stat}`);
      if (bar) bar.style.width = Math.min(100, (statObj[stat] / cfg.max) * 100).toFixed(1) + '%';
    }
  }
  // Update DPS display
  if (_unitLabCat === 'defender') {
    const s = CFG.STATS[_unitLabType];
    if (s?.dmg != null && s?.rate != null) {
      const dv = document.getElementById('unit-dps-val');
      if (dv) dv.textContent = (s.dmg * s.rate).toFixed(1);
    }
  }
}

function _unitLabReset() {
  const statObj  = _unitLabCat === 'defender' ? CFG.STATS[_unitLabType] : CFG.ORC_TYPES[_unitLabType];
  const defaults = _unitLabCat === 'defender' ? _UNIT_DEF_DEFAULTS[_unitLabType] : _UNIT_ORC_DEFAULTS[_unitLabType];
  if (!statObj || !defaults) return;
  Object.keys(defaults).forEach(k => { if (k in statObj) statObj[k] = defaults[k]; });
  _unitLabBuildStats();
}

// ─────────────────────────────────────────────
//  UNIT PREVIEW (dark room)
// ─────────────────────────────────────────────
function _unitPreviewInit() {
  if (_unitPreviewRenderer) return;
  const canvas = document.getElementById('unit-preview-canvas');
  if (!canvas) return;
  const w = canvas.offsetWidth  || 400;
  const h = canvas.offsetHeight || 260;
  _unitPreviewRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  _unitPreviewRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  _unitPreviewRenderer.setSize(w, h, false);
  _unitPreviewRenderer.setClearColor(0x030608, 1);
  _unitPreviewRenderer.shadowMap.enabled = true;
  _unitPreviewRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

  _unitPreviewScene = new THREE.Scene();
  _unitPreviewScene.fog = new THREE.Fog(0x030608, 8, 22);

  _unitPreviewCamera = new THREE.PerspectiveCamera(42, w / h, 0.01, 40);
  _unitPreviewCamera.position.set(1.5, 2.1, 3.4);
  _unitPreviewCamera.lookAt(0, 0.85, 0);

  // Very dim ambient — keeps edges dark
  _unitPreviewScene.add(new THREE.AmbientLight(0x0a1a2a, 0.6));
  // Hemisphere fallback: guarantees the model is never pure black even when the
  // spotlight/shadow path degrades (software GL, weak GPUs). Dim enough that the
  // spotlight still dominates the look on real hardware.
  _unitPreviewScene.add(new THREE.HemisphereLight(0x33465e, 0x141a22, 1.1));

  // Main warm spotlight from above-front — the "cutoff room" beam
  const spot = new THREE.SpotLight(0xfff3d0, 6.0, 14, Math.PI / 9, 0.3, 1.4);
  spot.position.set(0.4, 8, 3.0);
  spot.target.position.set(0, 0.7, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.width  = 512;
  spot.shadow.mapSize.height = 512;
  _unitPreviewScene.add(spot);
  _unitPreviewScene.add(spot.target);

  // Cool blue rim light from behind-left
  const rim = new THREE.DirectionalLight(0x2255aa, 1.0);
  rim.position.set(-3, 3, -3);
  _unitPreviewScene.add(rim);

  // Shadow-catching floor disc
  const floorGeo = new THREE.CylinderGeometry(3, 3, 0.02, 48);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x060d14, roughness: 1, metalness: 0 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  _unitPreviewScene.add(floor);
}

function _buildPreviewGroup(type, cat) {
  if (cat === 'defender') {
    const before = defenders.length;
    if      (type === 'wall')      buildWall(0, 0);
    else if (type === 'tower')     buildTower(0, 0);
    else if (type === 'catapult')  buildCatapult(0, 0);
    else if (type === 'mage')      buildMage(0, 0);
    else if (type === 'ballista')  buildBallista(0, 0);
    else if (type === 'spiketrap') buildSpikeTrap(0, 0);
    else                           buildSoldier(0, 0, type);
    if (defenders.length > before) {
      const def = defenders.pop();
      scene.remove(def.group);
      return def.group;
    }
  } else {
    const before  = orcs.length;
    const dPath   = [[0, 0]];
    const fns = {
      grunt:       () => spawnGenericOrc('grunt',  dPath),
      brute:       () => spawnGenericOrc('brute',  dPath),
      boss:        () => spawnGenericOrc('boss',   dPath),
      troll:       () => spawnTroll(dPath),
      rockTroll:   () => spawnRockTroll(dPath),
      skeleton:    () => spawnSkeleton(dPath),
      wolf:        () => spawnWolf(dPath),
      spider:      () => spawnSpider(dPath),
      cyclops:     () => spawnCyclops(dPath),
      enemyArcher: () => spawnEnemyArcher(dPath),
      exploder:    () => spawnExploder(dPath),
      healerOrc:   () => spawnHealerOrc(dPath),
      orcMage:     () => spawnOrcMage(dPath),
    };
    if (fns[type]) {
      fns[type]();
      if (orcs.length > before) {
        const orc = orcs.pop();
        scene.remove(orc.group);
        return orc.group;
      }
    }
  }
  return null;
}

function _unitPreviewDisposeGroup() {
  if (!_unitPreviewGroup) return;
  if (_unitPreviewScene) _unitPreviewScene.remove(_unitPreviewGroup);
  // Preview groups are built from the live unit builders, so they reference the
  // SHARED M.* palette materials (and their shared grain maps). Only dispose
  // geometry and genuinely unique materials — never shared ones, or the next
  // in-game render of that material would show an empty (disposed) texture.
  _unitPreviewGroup.traverse(child => {
    if (!child.isMesh) return;
    child.geometry?.dispose();
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach(m => {
      if (!m || _SHARED_MATERIALS.has(m)) return;
      if (m.map && !_SHARED_MATERIALS.has(m)) m.map.dispose();
      m.dispose();
    });
  });
  _unitPreviewGroup = null;
}

function _unitPreviewShowUnit(type, cat) {
  _unitPreviewInit();
  if (!_unitPreviewScene) return;
  _unitPreviewDisposeGroup();
  const g = _buildPreviewGroup(type, cat);
  if (!g) return;
  // Normalise: reset to world-space coords (units are built at 0.01 scale)
  g.position.set(0, 0, 0);
  g.rotation.set(0, 0, 0);
  g.scale.set(1, 1, 1);
  // Hide HP bars (sprites / canvas-texture meshes)
  g.traverse(child => {
    if (child.isSprite) { child.visible = false; return; }
    if (child.isMesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      if (mats.some(m => m.map instanceof THREE.CanvasTexture)) child.visible = false;
    }
  });
  g.traverse(c => { if (c.isMesh) c.castShadow = true; });
  _unitPreviewGroup = g;
  _unitPreviewScene.add(g);
  if (!_unitPreviewRafId) _unitPreviewAnimate();
}

function _unitPreviewAnimate() {
  if (!_unitPreviewRenderer || !studioMode || studioTab !== 'units') {
    _unitPreviewRafId = null;
    return;
  }
  _unitPreviewRafId = requestAnimationFrame(_unitPreviewAnimate);
  if (_unitPreviewGroup) _unitPreviewGroup.rotation.y += 0.007;
  // Responsive resize
  const c = _unitPreviewRenderer.domElement;
  const pw = c.clientWidth, ph = c.clientHeight;
  if (pw > 0 && ph > 0 && (c.width !== pw || c.height !== ph)) {
    _unitPreviewRenderer.setSize(pw, ph, false);
    _unitPreviewCamera.aspect = pw / ph;
    _unitPreviewCamera.updateProjectionMatrix();
  }
  _unitPreviewRenderer.render(_unitPreviewScene, _unitPreviewCamera);
}

// ─────────────────────────────────────────────
//  MAP EDITOR
// ─────────────────────────────────────────────
const _mePanel      = document.getElementById('map-editor-panel');
const _btnMapEditor = document.getElementById('btn-map-editor');
const _meMapList    = document.getElementById('me-map-list');
const _meNameInput  = document.getElementById('me-name-input');

// Simple seeded PRNG (mulberry32) — same seed → same building/rock shape
function _meSeededRng(seed) {
  let s = seed >>> 0;
  return function() {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Build a ghost (transparent) preview group for the given tool
function _meBuildGhost(tool) {
  const g = new THREE.Group();
  // Tile-type tools get a flat color-coded square so the player can see what
  // will be painted at the hovered tile. Object tools get a translucent silhouette.
  const TILE_COLORS = {
    grass: 0x6dbb3a, dirt: 0x9a6a3c, sand: 0xe0b866, water: 0x2e6bb0, lava: 0xd85022,
    pathA: 0x8a3acf, pathB: 0xcf8a30, pathC: 0x3a8acf,
    erase: 0xff3322,
  };
  if (TILE_COLORS[tool] !== undefined) {
    const flatMat = new THREE.MeshBasicMaterial({
      color: TILE_COLORS[tool], transparent: true, opacity: tool === 'erase' ? 0.35 : 0.55,
      depthWrite: false
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), flatMat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.04;
    g.add(m);
    // Add a thin outline so the hovered tile pops on busy backgrounds
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.0, 1.0)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
    );
    edges.rotation.x = -Math.PI / 2;
    edges.position.y = 0.05;
    g.add(edges);
    return g;
  }
  const ghostMat = new THREE.MeshStandardMaterial({ color: 0x00ccff, transparent: true, opacity: 0.35, depthWrite: false });
  const addBox = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), ghostMat);
    m.position.set(x, y, z); g.add(m);
  };
  if (tool === 'tree' || tool === 'pine') {
    addBox(0.34, 0.5, 0.34, 0, 0.25, 0);
    addBox(1.05, 0.52, 1.05, 0, 1.1, 0);
    addBox(0.66, 0.60, 0.66, 0, 2.0, 0);
    addBox(0.22, 0.34, 0.22, 0, 2.78, 0);
  } else if (tool === 'palm') {
    addBox(0.22, 1.6, 0.22, 0, 0.8, 0);
    addBox(1.2, 0.20, 1.2, 0, 1.7, 0);
  } else if (tool === 'cactus') {
    addBox(0.30, 1.2, 0.30, 0, 0.6, 0);
    addBox(0.18, 0.5, 0.18, 0.32, 0.8, 0);
  } else if (tool === 'deadtree') {
    addBox(0.22, 1.5, 0.22, 0, 0.75, 0);
    addBox(0.6, 0.15, 0.15, 0.25, 1.4, 0);
  } else if (tool === 'mushroom') {
    addBox(0.18, 0.34, 0.18, 0, 0.17, 0);
    addBox(0.55, 0.18, 0.55, 0, 0.42, 0);
  } else if (tool === 'rock') {
    addBox(0.45, 0.36, 0.4, 0, 0.18, 0);
  } else if (tool === 'building' || tool === 'cottage' || tool === 'farmhouse' || tool === 'tavern') {
    addBox(1.1, 1.0, 0.9, 0, 0.5, 0);
    addBox(1.2, 0.45, 1.1, 0, 1.22, 0);
  } else if (tool === 'windmill' || tool === 'watchtower') {
    addBox(0.9, 2.6, 0.9, 0, 1.3, 0);
  } else if (tool === 'blacksmith') {
    addBox(1.3, 0.9, 1.0, 0, 0.45, 0);
    addBox(1.4, 0.35, 1.1, 0, 1.07, 0);
  } else if (tool === 'chapel') {
    addBox(0.8, 1.3, 1.1, 0, 0.65, 0);
    addBox(0.45, 0.6, 0.45, 0, 1.6, 0.3);
  } else if (tool === 'lantern') {
    addBox(0.052, 1.08, 0.052, 0, 0.57, 0);
    addBox(0.09, 0.28, 0.09, 0, 0.82, 0.35);
  } else if (tool === 'well') {
    addBox(0.72, 0.43, 0.72, 0, 0.215, 0);
    addBox(0.62, 0.07, 0.62, 0, 0.89, 0);
  } else if (tool && tool.startsWith('custom:')) {
    // Studio object: generic crate silhouette (actual footprint varies per build)
    addBox(0.9, 0.9, 0.9, 0, 0.45, 0);
    addBox(0.5, 0.3, 0.5, 0, 1.05, 0);
  }
  return g;
}

// Remove the current hover ghost from the scene
function _meRemoveHover() {
  if (_meHoverMesh) { scene.remove(_meHoverMesh); _meHoverMesh = null; }
}

// Update hover ghost position. Tracks the active tool so switching tools rebuilds the ghost.
let _meHoverTool = null;
function _meUpdateHover(col, row) {
  if (_meActiveTool !== _meHoverTool) {
    // Tool changed → rebuild ghost (different shape/color)
    _meRemoveHover();
    _meHoverTool = _meActiveTool;
  }
  if (!_meHoverMesh) {
    _meHoverMesh = _meBuildGhost(_meActiveTool);
    scene.add(_meHoverMesh);
  }
  _meHoverMesh.position.set(col, 0, row);
}

// Place the active tool at a tile
// Tile-type tool names and their materials/types
const ME_TILE_TOOLS = {
  grass:  { mat: () => M.grassA,   type: 'grass' },
  dirt:   { mat: () => M.meDirt,   type: 'grass' }, // walkable as grass
  sand:   { mat: () => M.meSand,   type: 'grass' },
  water:  { mat: () => M.waterDeep, type: 'water' },
  lava:   { mat: () => M.meLava,   type: 'grass' }, // visual lava, walkable
  pathA:  { mat: () => M.pathMat,  type: 'path',  pathIdx: 0 },
  pathB:  { mat: () => M.mePathB,  type: 'path',  pathIdx: 1 },
  pathC:  { mat: () => M.mePathC,  type: 'path',  pathIdx: 2 },
};

// Studio-object defs embedded in the currently loaded map (name -> recipe).
// Makes saved maps self-contained: they render even if the studio library
// entry was deleted, and survive export/import to another browser.
let _meCustomDefs = {};
function _meGetStudioObject(name) {
  const lib = loadSave('td_studio_objects', null);
  const fromLib = Array.isArray(lib) ? lib.find(o => o.name === name) : null;
  return fromLib || _meCustomDefs[name] || null;
}

// Apply the active tool across the brush footprint. Brush >1 applies only to
// plain tile tools and erase — paths need deliberate single-tile routing, and
// objects would collide with their own footprints.
function _meApplyTool(col, row, forceErase = false) {
  const erase = forceErase || _meActiveTool === 'erase';
  const td = ME_TILE_TOOLS[_meActiveTool];
  const brushable = erase || (td && td.pathIdx === undefined);
  const size = brushable ? _meBrushSize : 1;
  const apply = erase ? _meEraseAt : _mePlaceAt;
  if (size === 1) { apply(col, row); return; }
  const o0 = -Math.floor((size - 1) / 2);
  // Single click with a wide brush: batch the stamp so one Ctrl+Z reverses it all
  const ownBatch = !_meUndoBatch;
  if (ownBatch) _meBeginUndoBatch();
  for (let dc = 0; dc < size; dc++) {
    for (let dr = 0; dr < size; dr++) apply(col + o0 + dc, row + o0 + dr);
  }
  if (ownBatch) _meEndUndoBatch();
}

function _mePlaceAt(col, row) {
  if (_meActiveTool === 'erase') { _meEraseAt(col, row); return; }

  const cell = grid[`${col},${row}`];
  if (!cell || cell.type === 'castle') return;

  // Tile painting tools
  if (ME_TILE_TOOLS[_meActiveTool]) {
    const td = ME_TILE_TOOLS[_meActiveTool];
    const key = `${col},${row}`;
    // Skip if already painting the same tool — keeps undo stack clean during drag-paint
    if (_meTileOverrides[key]?.newType === _meActiveTool) return;
    // Snapshot pre-state for undo
    const prevOverride = _meTileOverrides[key] ? { ...(_meTileOverrides[key]) } : null;
    const prevMat = cell.mesh.material;
    const prevType = cell.type;
    const prevPath = (() => {
      const out = [];
      for (let pi = 0; pi < 3; pi++) if (_mePathTiles[pi][key]) out.push(pi);
      return out;
    })();
    // Remove existing object at this tile first (and remember it for undo)
    const erasedObj = _meCaptureObjectAt(col, row);
    if (erasedObj) _meEraseObject(col, row);

    // Save override (only if not already overridden — preserve original)
    if (!_meTileOverrides[key]) {
      _meTileOverrides[key] = { origMat: cell.mesh.material, origType: cell.type };
    }
    cell.mesh.material = td.mat();
    cell.type = td.type;
    _meTileOverrides[key].newType = _meActiveTool;
    // A tile belongs to at most ONE lane: painting lane B (or a plain tile) over
    // an A tile removes it from A — previously it lingered in both path arrays.
    const removedFromLanes = [];
    for (let pi2 = 0; pi2 < 3; pi2++) {
      if (pi2 !== td.pathIdx && _mePathTiles[pi2][key]) {
        delete _mePathTiles[pi2][key];
        _mePaths[pi2] = _mePaths[pi2].filter(([c,r]) => !(c===col && r===row));
        removedFromLanes.push(pi2);
      }
    }
    // For path tools, track path tile membership
    if (td.pathIdx !== undefined) {
      const pi = td.pathIdx;
      if (!_mePathTiles[pi][key]) {
        _mePathTiles[pi][key] = true;
        _mePaths[pi].push([col, row]);
      }
    }
    // Update PATHS and PATH_SET so enemies walk on these
    if (td.pathIdx !== undefined || removedFromLanes.length) _meRebuildPaths();
    const paintedTool = _meActiveTool;
    _mePushUndo(() => {
      // Reverse: restore old material/type, restore object, fix path arrays
      cell.mesh.material = prevMat;
      cell.type = prevType;
      if (prevOverride) _meTileOverrides[key] = prevOverride;
      else delete _meTileOverrides[key];
      // Drop path entry if we added one
      if (td.pathIdx !== undefined && !prevPath.includes(td.pathIdx)) {
        delete _mePathTiles[td.pathIdx][key];
        _mePaths[td.pathIdx] = _mePaths[td.pathIdx].filter(([c,r]) => !(c===col && r===row));
      }
      // Restore membership in lanes this paint evicted the tile from
      for (const pi2 of removedFromLanes) {
        if (!_mePathTiles[pi2][key]) { _mePathTiles[pi2][key] = true; _mePaths[pi2].push([col, row]); }
      }
      _meRebuildPaths();
      if (erasedObj) _meRestoreObject(erasedObj);
    }, () => {
      // Redo: re-run the same paint with the original tool (guarded by _meReplaying,
      // so the replay records no new undo entry)
      const t0 = _meActiveTool;
      _meActiveTool = paintedTool;
      try { _mePlaceAt(col, row); } finally { _meActiveTool = t0; }
    });
    return;
  }

  // Object placement tools — prevent stacking on same cell
  if (_meItems.some(i => i.col === col && i.row === row)) return;
  if (initialScenery.some(s => s.col === col && s.row === row)) return;
  if (cell.type === 'path' || cell.type === 'water') return;

  const seed = (col * 7919 + row * 6271 + Date.now()) >>> 0;
  const rng  = _meSeededRng(seed);
  const scale = 0.85 + rng() * 0.3;
  let group = null;

  if (_meActiveTool === 'tree')      group = buildTree(col, row, scale);
  else if (_meActiveTool === 'pine') group = buildPine(col, row, scale);
  else if (_meActiveTool === 'palm') group = buildPalm(col, row, scale);
  else if (_meActiveTool === 'cactus') group = buildCactus(col, row, scale);
  else if (_meActiveTool === 'deadtree') group = buildDeadTree(col, row, scale);
  else if (_meActiveTool === 'mushroom') group = buildMushroom(col, row, scale);
  else if (_meActiveTool === 'rock')        group = buildRock(col, row, scale, _meSeededRng(seed));
  else if (_meActiveTool === 'building')    group = buildFantasyBuilding(col, row, _meSeededRng(seed));
  else if (_meActiveTool === 'cottage')     group = buildMedievalCottage(col, row, _meSeededRng(seed));
  else if (_meActiveTool === 'farmhouse')   group = buildFarmhouse(col, row, _meSeededRng(seed));
  else if (_meActiveTool === 'windmill')    group = buildWindmill(col, row, _meSeededRng(seed));
  else if (_meActiveTool === 'blacksmith')  group = buildBlacksmith(col, row, _meSeededRng(seed));
  else if (_meActiveTool === 'tavern')      group = buildTavern(col, row, _meSeededRng(seed));
  else if (_meActiveTool === 'chapel')      group = buildChapel(col, row, _meSeededRng(seed));
  else if (_meActiveTool === 'watchtower')  group = buildWatchtower(col, row, _meSeededRng(seed));
  else if (_meActiveTool === 'lantern') {
    const lamp = makeLanternMesh();
    lamp.position.set(col, 0, row);
    scene.add(lamp);
    group = lamp;
    if (cell && cell.type === 'grass') cell.type = 'scenery';
    staticObstacles.push({ x: col, z: row, r: 0.18 });
  }
  else if (_meActiveTool === 'well') group = buildWell(col, row, _meSeededRng(seed));
  else if (_meActiveTool.startsWith('custom:')) {
    // Studio-built object placed as a map prop
    const objName = _meActiveTool.slice(7);
    const objData = _meGetStudioObject(objName);
    if (!objData) { showTooltip(`Studio object "${objName}" not found — rebuild it in the Studio`, 2200); return; }
    group = buildStudioObjectGroup(objData, col, row);
    staticObstacles.push({ x: col, z: row, r: 0.4 });
    if (cell.type === 'grass') cell.type = 'scenery';
  }

  if (group) {
    group.userData.meItem = true;
    const item = { type: _meActiveTool, col, row, scale, seed, group };
    _meItems.push(item);
    // Captured by undo so redo can restore the EXACT same object (same group,
    // same obstacle) rather than rebuilding a differently-seeded one.
    let _rmObs = null, _wasScenery = false;
    _mePushUndo(() => {
      // Reverse: remove the placed object exactly as erase would
      scene.remove(item.group);
      const i = _meItems.indexOf(item);
      if (i !== -1) _meItems.splice(i, 1);
      const si = staticObstacles.findIndex(o => Math.abs(o.x - col) < 0.5 && Math.abs(o.z - row) < 0.5);
      if (si !== -1) { _rmObs = staticObstacles[si]; staticObstacles.splice(si, 1); }
      const cell2 = grid[`${col},${row}`];
      _wasScenery = !!(cell2 && cell2.type === 'scenery');
      if (_wasScenery) cell2.type = 'grass';
    }, () => {
      scene.add(item.group);
      _meItems.push(item);
      if (_rmObs) staticObstacles.push(_rmObs);
      const cell2 = grid[`${col},${row}`];
      if (_wasScenery && cell2) cell2.type = 'scenery';
    });
  }
}

// Capture full state of an object/initialScenery item at a tile so undo can restore it
function _meCaptureObjectAt(col, row) {
  const i = _meItems.find(x => x.col === col && x.row === row);
  if (i) return { kind: 'meItem', item: i };
  const s = initialScenery.find(x => x.col === col && x.row === row);
  if (s) return { kind: 'initialScenery', item: s };
  return null;
}
function _meRestoreObject(captured) {
  if (!captured) return;
  scene.add(captured.item.group);
  if (captured.kind === 'meItem')          _meItems.push(captured.item);
  else if (captured.kind === 'initialScenery') initialScenery.push(captured.item);
}

// Order a lane's tiles into a walkable chain: start at the spawn-most (lowest col)
// tile, then greedily hop to the nearest remaining tile. Freehand paint order —
// scribbles, backtracks, painting the middle first — becomes a sane spawn→castle
// route instead of enemies teleporting between tiles in raw click order.
function _meOrderPathTiles(tiles) {
  if (tiles.length < 3) return tiles.slice();
  const rest = tiles.slice();
  let idx = 0;
  for (let i = 1; i < rest.length; i++) {
    if (rest[i][0] < rest[idx][0] || (rest[i][0] === rest[idx][0] && rest[i][1] < rest[idx][1])) idx = i;
  }
  const out = [rest.splice(idx, 1)[0]];
  while (rest.length) {
    const [cc, cr] = out[out.length - 1];
    let best = 0, bestD = Infinity;
    for (let i = 0; i < rest.length; i++) {
      const d = Math.abs(rest[i][0] - cc) + Math.abs(rest[i][1] - cr);
      if (d < bestD) { bestD = d; best = i; }
    }
    out.push(rest.splice(best, 1)[0]);
  }
  return out;
}

// Pre-flight report for Test Play: human-readable warnings about lanes that will
// play badly (gaps, wrong start/end). Informative, never blocking.
function _meValidatePaths() {
  const laneNames = ['A', 'B', 'C'];
  const warnings = [];
  let any = false;
  for (let pi = 0; pi < 3; pi++) {
    if (!_mePaths[pi].length) continue;
    any = true;
    const tiles = _meOrderPathTiles(_mePaths[pi]);
    const L = laneNames[pi];
    if (tiles.length < 8) warnings.push(`Path ${L} is very short (${tiles.length} tile${tiles.length === 1 ? '' : 's'})`);
    let gaps = 0;
    for (let i = 1; i < tiles.length; i++) {
      const d = Math.max(Math.abs(tiles[i][0] - tiles[i-1][0]), Math.abs(tiles[i][1] - tiles[i-1][1]));
      if (d > 1) gaps++;
    }
    if (gaps) warnings.push(`Path ${L} has ${gaps} gap${gaps > 1 ? 's' : ''} — enemies will jump ${gaps > 1 ? 'them' : 'it'}`);
    if (tiles[0][0] > 4) warnings.push(`Path ${L} doesn't start at the left (spawn) edge`);
    if (tiles[tiles.length - 1][0] < 58) warnings.push(`Path ${L} doesn't reach the castle side`);
  }
  return { any, warnings };
}

// Rebuild PATHS[0/1/2] and PATH_SET from the editor's path tile data
function _meRebuildPaths() {
  const allPathKeys = new Set();
  for (let pi = 0; pi < 3; pi++) {
    PATHS[pi] = _meOrderPathTiles(_mePaths[pi]);
    _mePaths[pi].forEach(([c,r]) => allPathKeys.add(`${c},${r}`));
  }
  // Merge with pre-existing PATH_SET (layout paths) — don't wipe game paths
  // Actually replace PATH_SET entirely with editor paths if any exist, otherwise keep layout
  if (_mePaths.some(p => p.length > 0)) {
    PATH_SET = allPathKeys;
  }
}

// Erase only a placed scenery OBJECT at a tile (not tile type)
function _meEraseObject(col, row) {
  // Check editor-placed items first
  const idx = _meItems.findIndex(i => i.col === col && i.row === row);
  if (idx !== -1) {
    const item = _meItems[idx];
    scene.remove(item.group);
    const si = staticObstacles.findIndex(o => Math.abs(o.x - col) < 0.5 && Math.abs(o.z - row) < 0.5);
    if (si !== -1) staticObstacles.splice(si, 1);
    const cell = grid[`${col},${row}`];
    if (cell && cell.type === 'scenery') cell.type = 'grass';
    _meItems.splice(idx, 1);
    return;
  }
  // Check initial (pre-placed) scenery
  const ii = initialScenery.findIndex(s => s.col === col && s.row === row);
  if (ii !== -1) {
    const item = initialScenery[ii];
    scene.remove(item.group);
    const si = staticObstacles.findIndex(o => Math.abs(o.x - col) < 0.5 && Math.abs(o.z - row) < 0.5);
    if (si !== -1) staticObstacles.splice(si, 1);
    const cell = grid[`${col},${row}`];
    if (cell && cell.type === 'scenery') cell.type = 'grass';
    initialScenery.splice(ii, 1);
  }
}

// Erase whatever is on the tile: object first, then tile override, then path
function _meEraseAt(col, row) {
  const key = `${col},${row}`;
  // Snapshot for undo BEFORE we mutate anything
  const undoActions = [];
  // 1a. Remove editor-placed object
  const objIdx = _meItems.findIndex(i => i.col === col && i.row === row);
  if (objIdx !== -1) {
    const item = _meItems[objIdx];
    scene.remove(item.group);
    const si = staticObstacles.findIndex(o => Math.abs(o.x - col) < 0.5 && Math.abs(o.z - row) < 0.5);
    let removedObs = null;
    if (si !== -1) { removedObs = staticObstacles[si]; staticObstacles.splice(si, 1); }
    _meItems.splice(objIdx, 1);
    undoActions.push(() => {
      scene.add(item.group);
      _meItems.push(item);
      if (removedObs) staticObstacles.push(removedObs);
    });
  }
  // 1b. Remove initial (pre-placed) scenery object
  const initIdx = initialScenery.findIndex(s => s.col === col && s.row === row);
  if (initIdx !== -1) {
    const item = initialScenery[initIdx];
    scene.remove(item.group);
    const si = staticObstacles.findIndex(o => Math.abs(o.x - col) < 0.5 && Math.abs(o.z - row) < 0.5);
    let removedObs = null;
    if (si !== -1) { removedObs = staticObstacles[si]; staticObstacles.splice(si, 1); }
    const cell = grid[key];
    const wasScenery = cell && cell.type === 'scenery';
    if (wasScenery) cell.type = 'grass';
    initialScenery.splice(initIdx, 1);
    undoActions.push(() => {
      scene.add(item.group);
      initialScenery.push(item);
      if (removedObs) staticObstacles.push(removedObs);
      if (wasScenery && cell) cell.type = 'scenery';
    });
  }
  // 1c. Remove path lanterns near this tile (within 1 tile radius).
  // Keep the lamp objects alive (no dispose) so the undo entry can restore
  // them — they used to be disposed with no undo action, so Ctrl+Z after an
  // erase silently lost every nearby lantern.
  const removedLamps = [];
  for (let i = lanternGroup.children.length - 1; i >= 0; i--) {
    const lamp = lanternGroup.children[i];
    if (Math.abs(lamp.position.x - col) < 1.0 && Math.abs(lamp.position.z - row) < 1.0) {
      const lampLights = [];
      lamp.traverse(child => {
        if (child.isLight) {
          const li = lanternLights.indexOf(child);
          if (li !== -1) { lampLights.push(child); lanternLights.splice(li, 1); }
        }
      });
      lanternGroup.remove(lamp);
      removedLamps.push({ lamp, lights: lampLights });
    }
  }
  if (removedLamps.length) {
    undoActions.push(() => {
      for (const { lamp, lights } of removedLamps) {
        lanternGroup.add(lamp);
        for (const l of lights) lanternLights.push(l);
      }
    });
  }
  // 2. Restore tile override
  if (_meTileOverrides[key]) {
    const ov = _meTileOverrides[key];
    const ovSnapshot = { ...ov };
    const cell = grid[key];
    const newMat = cell?.mesh.material;
    const newType = cell?.type;
    if (cell) { cell.mesh.material = ov.origMat; cell.type = ov.origType; }
    delete _meTileOverrides[key];
    undoActions.push(() => {
      _meTileOverrides[key] = ovSnapshot;
      if (cell) { cell.mesh.material = newMat; cell.type = newType; }
    });
  }
  // 3. Remove from path arrays
  const removedPaths = [];
  for (let pi = 0; pi < 3; pi++) {
    if (_mePathTiles[pi][key]) {
      removedPaths.push(pi);
      delete _mePathTiles[pi][key];
      _mePaths[pi] = _mePaths[pi].filter(([c,r]) => !(c===col && r===row));
    }
  }
  if (removedPaths.length) {
    undoActions.push(() => {
      for (const pi of removedPaths) {
        _mePathTiles[pi][key] = true;
        _mePaths[pi].push([col, row]);
      }
      _meRebuildPaths();
    });
  }
  _meRebuildPaths();

  // Group all sub-undos into a single undo entry — one Ctrl+Z reverses the whole erase.
  // Redo simply re-runs the erase on the restored state (guarded by _meReplaying so
  // the replay records nothing new).
  if (undoActions.length) {
    _mePushUndo(
      () => { for (let i = undoActions.length - 1; i >= 0; i--) undoActions[i](); },
      () => { _meEraseAt(col, row); },
    );
  }
}

function _meClearAll() {
  // Remove editor-placed objects
  for (const item of _meItems) scene.remove(item.group);
  _meItems.length = 0;

  // Remove all initial scenery (trees, rocks, buildings, wells, border trees)
  for (const item of initialScenery) {
    scene.remove(item.group);
    disposeGroup(item.group);
  }
  initialScenery.length = 0;
  _biomeTreeSpots.length = 0;

  // Remove all path lanterns and their lights
  for (let i = lanternGroup.children.length - 1; i >= 0; i--) {
    disposeGroup(lanternGroup.children[i]);
    lanternGroup.remove(lanternGroup.children[i]);
  }
  lanternLights.length = 0;

  // Remove all hill meshes
  for (const m of hillMeshes) { m.geometry.dispose(); scene.remove(m); }
  hillMeshes.length = 0;

  // Restore pond tiles to grass and remove water surface planes
  for (const pc of pondCells) {
    const cell = grid[`${pc.col},${pc.row}`];
    if (cell) {
      cell.mesh.material = pc.origMat;
      cell.mesh.position.y = -0.15;
      cell.type = 'grass';
    }
  }
  pondCells.length = 0;
  for (const ws of waterSurfaces) { ws.mesh.geometry.dispose(); scene.remove(ws.mesh); }
  waterSurfaces.length = 0;

  // Clear all static obstacles (all scenery is gone)
  staticObstacles.length = 0;

  // Restore tile overrides (editor tile paints)
  for (const key of Object.keys(_meTileOverrides)) {
    const ov = _meTileOverrides[key];
    const cell = grid[key];
    if (cell) { cell.mesh.material = ov.origMat; cell.type = ov.origType; }
  }
  _meTileOverrides = {};

  // Clear editor paths
  _mePaths = [[], [], []];
  _mePathTiles = [{}, {}, {}];
  _meRebuildPaths();
}

function _meSaveMap(name) {
  if (!name.trim()) return;
  const data = {
    name: name.trim(),
    biome: activeBiomeIdx,
    items: _meItems.map(({ type, col, row, scale, seed }) => ({ type, col, row, scale, seed })),
    tileOverrides: Object.entries(_meTileOverrides).map(([key, ov]) => {
      const [col, row] = key.split(',').map(Number);
      return { col, row, newType: ov.newType };
    }),
    paths: _mePaths.map(p => p.map(([c,r]) => [c,r])),
  };
  // Embed the recipes for any studio objects this map uses, so the map file is
  // self-contained (shareable via export, robust to library deletions)
  const usedCustom = [...new Set(_meItems.filter(i => i.type.startsWith('custom:')).map(i => i.type.slice(7)))];
  if (usedCustom.length) {
    data.customDefs = {};
    for (const n of usedCustom) {
      const d = _meGetStudioObject(n);
      if (d) data.customDefs[n] = { name: d.name, layers: d.layers, parts: d.parts };
    }
  }
  const existing = _meSavedMaps.findIndex(m => m.name === data.name);
  if (existing !== -1) _meSavedMaps[existing] = data;
  else _meSavedMaps.push(data);
  saveSave('td_saved_maps', _meSavedMaps);
  _meLoadedName = data.name;
  _meRefreshMapList();
}

function _meLoadMap(data) {
  _meClearAll();
  _meCustomDefs = data.customDefs || {};
  if (data.biome >= 0) {
    activeBiomeIdx = -1;
    applyBiome(data.biome);
    document.querySelectorAll('.me-biome-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.biome) === data.biome);
    });
  }
  // Restore tile overrides
  for (const ov of (data.tileOverrides || [])) {
    const key = `${ov.col},${ov.row}`;
    const cell = grid[key];
    if (!cell) continue;
    const td = ME_TILE_TOOLS[ov.newType];
    if (!td) continue;
    if (!_meTileOverrides[key]) _meTileOverrides[key] = { origMat: cell.mesh.material, origType: cell.type };
    cell.mesh.material = td.mat();
    cell.type = td.type;
    _meTileOverrides[key].newType = ov.newType;
  }
  // Restore paths
  _mePaths = [[], [], []];
  _mePathTiles = [{}, {}, {}];
  for (let pi = 0; pi < 3; pi++) {
    for (const [c, r] of (data.paths?.[pi] || [])) {
      const key = `${c},${r}`;
      _mePaths[pi].push([c, r]);
      _mePathTiles[pi][key] = true;
    }
  }
  _meRebuildPaths();
  // Restore objects
  for (const item of (data.items || [])) {
    const rng = _meSeededRng(item.seed);
    const cell = grid[`${item.col},${item.row}`];
    if (!cell) continue;
    let group = null;
    if (item.type === 'tree')      group = buildTree(item.col, item.row, item.scale);
    else if (item.type === 'pine') group = buildPine(item.col, item.row, item.scale);
    else if (item.type === 'palm') group = buildPalm(item.col, item.row, item.scale);
    else if (item.type === 'cactus') group = buildCactus(item.col, item.row, item.scale);
    else if (item.type === 'deadtree') group = buildDeadTree(item.col, item.row, item.scale);
    else if (item.type === 'mushroom') group = buildMushroom(item.col, item.row, item.scale);
    else if (item.type === 'rock')        group = buildRock(item.col, item.row, item.scale, _meSeededRng(item.seed));
    else if (item.type === 'building')    group = buildFantasyBuilding(item.col, item.row, _meSeededRng(item.seed));
    else if (item.type === 'cottage')     group = buildMedievalCottage(item.col, item.row, _meSeededRng(item.seed));
    else if (item.type === 'farmhouse')   group = buildFarmhouse(item.col, item.row, _meSeededRng(item.seed));
    else if (item.type === 'windmill')    group = buildWindmill(item.col, item.row, _meSeededRng(item.seed));
    else if (item.type === 'blacksmith')  group = buildBlacksmith(item.col, item.row, _meSeededRng(item.seed));
    else if (item.type === 'tavern')      group = buildTavern(item.col, item.row, _meSeededRng(item.seed));
    else if (item.type === 'chapel')      group = buildChapel(item.col, item.row, _meSeededRng(item.seed));
    else if (item.type === 'watchtower')  group = buildWatchtower(item.col, item.row, _meSeededRng(item.seed));
    else if (item.type === 'lantern') {
      const lamp = makeLanternMesh();
      lamp.position.set(item.col, 0, item.row);
      scene.add(lamp);
      group = lamp;
      if (cell && cell.type === 'grass') cell.type = 'scenery';
      staticObstacles.push({ x: item.col, z: item.row, r: 0.18 });
    }
    else if (item.type === 'well') group = buildWell(item.col, item.row, _meSeededRng(item.seed));
    else if (item.type && item.type.startsWith('custom:')) {
      const objData = _meGetStudioObject(item.type.slice(7));
      if (objData) {
        group = buildStudioObjectGroup(objData, item.col, item.row);
        staticObstacles.push({ x: item.col, z: item.row, r: 0.4 });
        if (cell.type === 'grass') cell.type = 'scenery';
      }
    }
    if (group) { group.userData.meItem = true; _meItems.push({ ...item, group }); }
  }
  // Rebuild path lanterns (Clear All removed them)
  buildPathLanterns();
  _meLoadedName = data.name;
  _meNameInput.value = data.name;
}

// Delete a saved map by name
function _meDeleteMap(name) {
  _meSavedMaps = _meSavedMaps.filter(m => m.name !== name);
  saveSave('td_saved_maps', _meSavedMaps);
  if (_meLoadedName === name) _meLoadedName = null;
  _meRefreshMapList();
}

// Re-render the saved maps list
function _meRefreshMapList() {
  _meMapList.innerHTML = '';
  if (_meSavedMaps.length === 0) {
    _meMapList.innerHTML = '<div style="font-size:10px;color:rgba(0,180,220,0.4);text-align:center;padding:4px">No saved maps</div>';
    return;
  }
  for (const map of _meSavedMaps) {
    const row = document.createElement('div');
    row.className = 'me-map-entry';
    const loadBtn = document.createElement('button');
    loadBtn.className = 'me-map-load-btn' + (map.name === _meLoadedName ? ' active' : '');
    loadBtn.textContent = map.name;
    loadBtn.title = `Biome: ${BIOMES[map.biome]?.name ?? '?'} · ${map.items.length} objects`;
    loadBtn.addEventListener('click', () => { _meLoadMap(map); _meRefreshMapList(); });
    const delBtn = document.createElement('button');
    delBtn.className = 'me-map-del-btn';
    delBtn.textContent = '✕';
    delBtn.title = 'Delete map (click twice)';
    delBtn.addEventListener('click', (e) => _meArmConfirm(e.currentTarget, () => _meDeleteMap(map.name)));
    row.appendChild(loadBtn); row.appendChild(delBtn);
    _meMapList.appendChild(row);
  }
}

// Set the active placement tool
function _meSetTool(tool) {
  _meActiveTool = tool;
  _meRemoveHover();
  // Sync panel buttons
  document.querySelectorAll('.me-tool-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.meTool === tool);
  });
}

function enterMapEditorMode() {
  if (studioMode) exitStudio();
  mapEditorMode = true;
  _meUndoStack.length = 0; // fresh undo/redo stacks each session
  _meRedoStack.length = 0;
  const _retBtn = document.getElementById('me-return-btn');
  if (_retBtn) _retBtn.style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  document.getElementById('build-panel').style.display = 'none';
  document.getElementById('scroll-hint').style.display = 'none';
  _mePanel.style.display = 'block';
  _btnMapEditor.classList.add('active');
  selectedTool = null;
  selectedDef = null; _defPanel.style.display = 'none';
  _buildCards.forEach(c => c.classList.remove('selected'));
  ghostMesh.visible = false;
  // Load saved maps from localStorage (with schema versioning)
  const _sm = loadSave('td_saved_maps', null);
  if (Array.isArray(_sm)) _meSavedMaps = _sm;
  _meRefreshMapList();
  // Custom (studio-built) object tools — rebuilt each entry, library may have changed
  const customGrid = document.getElementById('me-custom-grid');
  if (customGrid) {
    customGrid.innerHTML = '';
    const lib = loadSave('td_studio_objects', null);
    if (!Array.isArray(lib) || !lib.length) {
      customGrid.innerHTML = '<div style="font-size:10px;color:rgba(0,180,220,0.45);padding:2px 0;line-height:1.4">Build objects in the Studio (ESC menu) — they become placeable here</div>';
    } else {
      lib.forEach(o => {
        const btn = document.createElement('button');
        btn.className = 'me-tool-btn';
        btn.dataset.meTool = 'custom:' + o.name;
        btn.textContent = '📦 ' + o.name;
        btn.title = `${o.parts?.length ?? 0} part(s) — built in Studio`;
        btn.addEventListener('click', () => _meSetTool('custom:' + o.name));
        customGrid.appendChild(btn);
      });
    }
  }
  // Biome buttons
  const biomeGrid = document.getElementById('me-biome-grid');
  if (!biomeGrid.children.length) {
    BIOMES.forEach((b, i) => {
      const btn = document.createElement('button');
      btn.className = 'me-biome-btn' + (i === activeBiomeIdx ? ' active' : '');
      btn.textContent = b.name;
      btn.dataset.biome = i;
      btn.addEventListener('click', () => {
        activeBiomeIdx = -1;
        applyBiome(i);
        document.querySelectorAll('.me-biome-btn').forEach(x => x.classList.toggle('active', parseInt(x.dataset.biome) === i));
      });
      biomeGrid.appendChild(btn);
    });
  }
  showTooltip('Map Editor — drag-paint tiles · right-click erases · Ctrl+Z / Ctrl+Y undo-redo · paths auto-connect · P test play', 5500);
}

function exitMapEditorMode() {
  mapEditorMode = false;
  // Same reasoning as exitTestMode — clear any stale level/timer state
  currentLevel = null;
  if (_levelCompleteTimer) { clearTimeout(_levelCompleteTimer); _levelCompleteTimer = null; }
  _meRemoveHover();
  _mePanel.style.display = 'none';
  _btnMapEditor.classList.remove('active');
  document.getElementById('hud').style.display = '';
  document.getElementById('build-panel').style.display = '';
  document.getElementById('scroll-hint').style.display = '';
}

// Wire up map editor panel controls
_btnMapEditor.addEventListener('click', () => {
  if (mapEditorMode) exitMapEditorMode(); else enterMapEditorMode();
});

document.querySelectorAll('.me-tool-btn').forEach(btn => {
  btn.addEventListener('click', () => _meSetTool(btn.dataset.meTool));
});

document.getElementById('me-save-btn').addEventListener('click', () => {
  _meSaveMap(_meNameInput.value || 'Unnamed Map');
  showTooltip('Map saved!', 1500);
});

// Two-click confirm for destructive buttons: first click arms ("Sure?"), a second
// click within 2.5s fires. Less jarring than a modal, but stops fatal misclicks.
function _meArmConfirm(btn, run) {
  if (btn.dataset.armed) {
    clearTimeout(+btn.dataset.armT);
    delete btn.dataset.armed;
    btn.textContent = btn.dataset.origLabel;
    btn.classList.remove('me-armed');
    run();
    return;
  }
  btn.dataset.origLabel = btn.textContent;
  btn.dataset.armed = '1';
  btn.classList.add('me-armed');
  btn.textContent = '⚠ Sure?';
  btn.dataset.armT = setTimeout(() => {
    delete btn.dataset.armed;
    btn.textContent = btn.dataset.origLabel;
    btn.classList.remove('me-armed');
  }, 2500);
}

document.getElementById('me-clear-btn').addEventListener('click', (e) => {
  _meArmConfirm(e.currentTarget, () => {
    _meClearAll();
    showTooltip('Cleared everything — only castle and path tiles remain', 1800);
  });
});

document.getElementById('me-exit-btn').addEventListener('click', () => exitMapEditorMode());

// Test-play: drop the player into the current map at wave 1 with starter gold.
// We don't run a full level — this is a sandbox test of the layout. Player can
// return to the editor via the ESC menu.
document.getElementById('me-play-btn')?.addEventListener('click', () => {
  // Pre-flight path check BEFORE leaving the editor so the author sees problems
  const v = _meValidatePaths();
  exitMapEditorMode();
  _resetRunState();
  // Pre-seed all unlocks so the player can test all tools on their custom map
  for (const tool of Object.keys(UNLOCK_WAVES)) UNLOCKED.add(tool);
  updateUnlockUI();
  wave = 0;
  gold = 200;
  updateHUD();
  if (gameSpeed === 0) gameSpeed = 1;
  // Floating "Back to Editor" button — the return path used to be buried in the ESC menu
  const retBtn = document.getElementById('me-return-btn');
  if (retBtn) retBtn.style.display = 'block';
  if (!v.any) {
    showTooltip('Test Play — no custom paths drawn, using the default roads • press Start', 4000);
  } else if (v.warnings.length) {
    const shown = v.warnings.slice(0, 2).join(' · ');
    showTooltip(`⚠ ${shown}${v.warnings.length > 2 ? ` (+${v.warnings.length - 2} more)` : ''} — starting anyway`, 5000);
  } else {
    showTooltip('Test Play — your custom map • press Start to launch wave 1', 3500);
  }
});

// Return from test play straight back into the editor (map state survives the trip)
document.getElementById('me-return-btn')?.addEventListener('click', () => {
  document.getElementById('me-return-btn').style.display = 'none';
  window._switchToMode('map');
});

document.getElementById('me-undo-btn')?.addEventListener('click', () => _meUndo());
document.getElementById('me-redo-btn')?.addEventListener('click', () => _meRedo());

// Brush size buttons (1×1 / 2×2 / 3×3 — applies to plain tiles and erase)
document.querySelectorAll('.me-brush-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    _meBrushSize = parseInt(btn.dataset.brush) || 1;
    document.querySelectorAll('.me-brush-btn').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.brush) === _meBrushSize));
  });
});

document.getElementById('me-export-btn').addEventListener('click', () => {
  if (_meSavedMaps.length === 0) { showTooltip('No saved maps to export', 1800); return; }
  const blob = new Blob([JSON.stringify(_meSavedMaps, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'td_maps.json'; a.click();
  URL.revokeObjectURL(url);
  showTooltip(`Exported ${_meSavedMaps.length} map(s)`, 1800);
});

document.getElementById('me-import-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (!Array.isArray(imported)) throw new Error();
      let added = 0;
      for (const map of imported) {
        if (map.name && !_meSavedMaps.find(m => m.name === map.name)) {
          _meSavedMaps.push(map); added++;
        }
      }
      saveSave('td_saved_maps', _meSavedMaps);
      _meRefreshMapList();
      showTooltip(`Imported ${added} new map(s)`, 2000);
    } catch { showTooltip('Import failed — invalid file', 2000); }
  };
  reader.readAsText(file);
  e.target.value = '';
});


// Spawn an enemy and place it at the exact clicked tile (col, row).
// If the tile is off the path row, the enemy walks toward the path before continuing normally.
function spawnEnemyAtTile(type, col, row) {
  spawnOrc(type);
  const o = orcs[orcs.length - 1];
  if (!o) return;
  // Find path index closest to clicked column
  let bestIdx = 0, bestDist = Infinity;
  for (let i = 0; i < o.path.length - 1; i++) {
    const d = Math.abs(o.path[i][0] - col);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  o.pathIndex = bestIdx;
  o.progress  = 0;
  // Place at the exact clicked tile
  o.group.position.x = col;
  o.group.position.z = row;
  // If off the path row, set flag so the movement code doesn't snap it back immediately
  const pathRow = o.path[0][1];
  if (Math.abs(row - pathRow) > 0.5) o.testOffPath = true;
}

// ─────────────────────────────────────────────
//  TEST ARENA — closed-off dev environment
// ─────────────────────────────────────────────
const ARENA = { c0: 8, c1: 57, r0: 19, r1: 35, pathRow: 27 };
let arenaGroup    = null;
let savedTestLayoutIdx = 0;
let castleSceneActive = false; // true = camera shows castle, right wall open, castle HP tracked
let _arenaLanes = 1;       // 1 / 2 / 3 — number of active test paths
let _arenaLanePaths = [];  // expandPath results, one per active lane
let _laneRR = 0;           // round-robin counter for even lane distribution

/** Return the Z-row for each lane given the current lane count. */
function _getArenaLaneRows(count) {
  if (count === 1) return [27];
  if (count === 2) return [24, 30];
  return [22, 27, 32];
}

/**
 * Spawn one enemy of `type` at horizontal position `col`, distributing
 * across lanes in round-robin order.  Uses the stored _arenaLanePaths so
 * each enemy is guaranteed to start on its own lane row.
 */
function _spawnArenaEnemy(type, col) {
  if (!_arenaLanePaths.length) { spawnEnemyAtTile(type, col, ARENA.pathRow); return; }
  const laneIdx  = _laneRR % _arenaLanePaths.length;
  _laneRR++;
  const lanePath = _arenaLanePaths[laneIdx];
  const laneRow  = lanePath[0][1];
  // Temporarily pin all PATHS to this lane so spawnOrc always picks it
  const saved = [PATHS[0], PATHS[1], PATHS[2]];
  PATHS[0] = PATHS[1] = PATHS[2] = lanePath;
  spawnOrc(type);
  PATHS[0] = saved[0]; PATHS[1] = saved[1]; PATHS[2] = saved[2];
  const o = orcs[orcs.length - 1];
  if (!o) return;
  // Stagger for real: arena lanes are straight 1-tile steps (path index ==
  // column), so aligning pathIndex to the requested column actually places the
  // enemy there. The old teleport (position.x = col with pathIndex 0) was
  // undone one frame later by the path-interpolation snap, so every enemy
  // silently started at column 0 regardless of the requested stagger.
  o.pathIndex = Math.max(0, Math.min(lanePath.length - 2, Math.round(col)));
  o.progress  = 0;
  o.group.position.x = lanePath[o.pathIndex][0];
  o.group.position.z = laneRow;
}

function _buildArena(forCastle = false) {
  if (arenaGroup) {
    if (arenaGroup.userData.forCastle === forCastle && arenaGroup.userData.lanes === _arenaLanes) { scene.add(arenaGroup); return; }
    // Mode or lane count changed — dispose and rebuild
    scene.remove(arenaGroup);
    arenaGroup.traverse(c => { if (c.isMesh) c.geometry?.dispose(); });
    arenaGroup = null;
  }
  arenaGroup = new THREE.Group();
  arenaGroup.userData.forCastle = forCastle;
  arenaGroup.userData.lanes     = _arenaLanes;

  const { c0, c1, r0, r1, pathRow } = ARENA;
  const wallH = 2.4, wallT = 0.55;
  const W  = c1 - c0 + 1;           // 50
  const D  = r1 - r0 + 1;           // 17
  const cx = (c0 + c1) / 2;         // 32.5
  const cz = (r0 + r1) / 2;         // 27
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x4a5c6e });
  const capMat  = new THREE.MeshLambertMaterial({ color: 0x7a8e9e });

  function addSeg(x, z, wx, wz) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(wx, wallH, wz), wallMat);
    m.position.set(x, wallH / 2, z);
    m.castShadow = m.receiveShadow = true;
    arenaGroup.add(m);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(wx + 0.1, 0.2, wz + 0.1), capMat);
    cap.position.set(x, wallH + 0.1, z);
    arenaGroup.add(cap);
    // Crenellations on long axis
    const steps = Math.round(Math.max(wx, wz) / 1.5);
    for (let i = 0; i < steps; i++) {
      if (i % 2 === 0) continue;
      const cr = new THREE.Mesh(new THREE.BoxGeometry(
        wx > wz ? (wx / steps) * 0.7 : 0.45,
        0.38,
        wz > wx ? (wz / steps) * 0.7 : 0.45
      ), capMat);
      const t = ((i + 0.5) / steps - 0.5);
      cr.position.set(x + (wx > wz ? t * wx : 0), wallH + 0.29, z + (wz > wx ? t * wz : 0));
      arenaGroup.add(cr);
    }
  }

  // Top / bottom full-width walls
  addSeg(cx, r0 - wallT / 2, W + wallT * 2, wallT);
  addSeg(cx, r1 + wallT / 2, W + wallT * 2, wallT);

  // Left & right walls — one gap (row ± 1) per active lane
  const laneRows = _getArenaLaneRows(_arenaLanes);
  // Build list of solid wall intervals between / around lane gaps
  const wallIntervals = [];
  let cursor = r0;
  for (const lr of laneRows) {
    const gapTop = lr - 1, gapBot = lr + 1;
    if (gapTop > cursor) wallIntervals.push([cursor, gapTop]);
    cursor = gapBot;
  }
  if (cursor < r1) wallIntervals.push([cursor, r1]);
  for (const [wTop, wBot] of wallIntervals) {
    const segH = wBot - wTop, segZ = (wTop + wBot) / 2;
    if (segH > 0) {
      addSeg(c0 - wallT / 2, segZ, wallT, segH);
      if (!forCastle) addSeg(c1 + wallT / 2, segZ, wallT, segH);
    }
  }

  // Corner towers
  const towerMat = new THREE.MeshLambertMaterial({ color: 0x3a4c5e });
  for (const [tc, tr] of [[c0, r0], [c1, r0], [c0, r1], [c1, r1]]) {
    if (forCastle && tc === c1) continue; // right corner towers not needed — castle wall takes over
    const ox = tc === c0 ? -wallT / 2 : wallT / 2;
    const oz = tr === r0 ? -wallT / 2 : wallT / 2;
    const tw = new THREE.Mesh(new THREE.BoxGeometry(1.5, wallH + 1.1, 1.5), towerMat);
    tw.position.set(tc + ox, (wallH + 1.1) / 2, tr + oz);
    tw.castShadow = true;
    arenaGroup.add(tw);
    const tc2 = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.25, 1.7), capMat);
    tc2.position.set(tw.position.x, wallH + 1.1 + 0.125, tw.position.z);
    arenaGroup.add(tc2);
  }

  if (!forCastle) {
    // Zone overlays (not needed in castle scene — full path is visible)
    const halfW = (c1 - c0) / 2;
    const makeZone = (color, xCenter) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(halfW, D),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.09, depthWrite: false })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(xCenter, 0.01, cz);
      arenaGroup.add(m);
    };
    makeZone(0xff2200, c0 + halfW / 2);       // enemy side — red
    makeZone(0x2255ff, c0 + halfW * 1.5);     // defender side — blue

    // Zone edge lines
    const lineMat = mat => new THREE.MeshBasicMaterial({ color: mat, transparent: true, opacity: 0.5 });
    const eLine = new THREE.Mesh(new THREE.BoxGeometry(halfW - 0.5, 0.05, 0.25), lineMat(0xff4400));
    eLine.position.set(c0 + halfW / 2, 0.03, r0 + 0.2); arenaGroup.add(eLine);
    const dLine = new THREE.Mesh(new THREE.BoxGeometry(halfW - 0.5, 0.05, 0.25), lineMat(0x4488ff));
    dLine.position.set(c0 + halfW * 1.5, 0.03, r0 + 0.2); arenaGroup.add(dLine);

    // Divider line between zones
    const divider = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, D - 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 }));
    divider.position.set(cx, 0.03, cz); arenaGroup.add(divider);
  }

  // Spawn flags (left entry — one per active lane)
  const postMat = new THREE.MeshLambertMaterial({ color: 0x552200 });
  const flagMat = new THREE.MeshLambertMaterial({ color: 0xdd2200 });
  for (const lr of _getArenaLaneRows(_arenaLanes)) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.8, 0.16), postMat);
    post.position.set(c0 - 2.2, 1.9, lr); arenaGroup.add(post);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.08), flagMat);
    flag.position.set(c0 - 1.7, 3.7, lr); arenaGroup.add(flag);
  }

  scene.add(arenaGroup);
}

function _removeArena() {
  if (arenaGroup) scene.remove(arenaGroup);
}

function _applyTestPath() {
  // Revert current path tiles to grass
  PATH_SET.forEach(key => {
    const cell = grid[key];
    if (cell && cell.type === 'path') { cell.type = 'grass'; cell.mesh.material = M.grassA; }
  });

  // Build one straight path per lane row
  const laneRows = _getArenaLaneRows(_arenaLanes);
  _arenaLanePaths = laneRows.map(row => expandPath([[0, row], [65, row]]));
  _laneRR = 0; // reset round-robin whenever paths change

  // Assign to PATHS[0/1/2].  spawnOrc filters for length>0, so unused slots are set to []
  // to ensure equal spawn probability per lane (avoids bias for the 2-lane case).
  PATHS[0] = _arenaLanePaths[0];
  PATHS[1] = _arenaLanePaths[1] ?? [];
  PATHS[2] = _arenaLanePaths[2] ?? [];

  // Mark all lane tiles as path
  PATH_SET = new Set([...PATHS[0], ...PATHS[1], ...PATHS[2]].map(([c, r]) => `${c},${r}`));
  PATH_SET.forEach(key => {
    const cell = grid[key];
    if (cell && cell.type !== 'castle' && cell.type !== 'scenery' && cell.type !== 'water') {
      cell.type = 'path'; cell.mesh.material = M.pathMat;
    }
  });
  // Mark activeLayoutIdx as invalid so applyLayout() won't short-circuit on exit
  activeLayoutIdx = -1;
  buildPathLanterns();
}

// ──────────��─────────────────────���────────────
//  TEST OPTIMIZER HELPERS
// ────────────────────���────────────────────���───

/**
 * Build a [[type, col, row], ...] placement list for `count` defenders of
 * `type` centred around `centerCol`.  Rows are chosen to flank path lanes
 * (never on the path itself).  Units fill a tight grid: col, col±2, col±4 …
 * alternating across flank rows.
 */
function _buildFormation(type, count, centerCol) {
  const defRows = _arenaLanes === 1 ? [26, 28] :
                  _arenaLanes === 2 ? [23, 25, 29, 31] :
                                      [21, 23, 25, 29, 31, 33];
  const colOffsets = [0, 2, -2, 4, -4, 6, -6, 8, -8, 10, -10];
  const out = [];
  for (let i = 0; i < count; i++) {
    const rowIdx = i % defRows.length;
    const colIdx = Math.floor(i / defRows.length);
    const c = Math.max(ARENA.c0 + 2, Math.min(ARENA.c1 - 2,
                centerCol + colOffsets[colIdx % colOffsets.length]));
    out.push([type, c, defRows[rowIdx]]);
  }
  return out;
}

/**
 * Comparator for battle results: WIN > PARTIAL > LOSS,
 * then fewer escaped, then more HP remaining, then lower cost.
 */
function _cmpOutcome(a, b) {
  const score = { WIN: 3, PARTIAL: 1, LOSS: 0, TIMEOUT: -1 };
  const dv = (score[b.verdict] ?? 0) - (score[a.verdict] ?? 0);
  if (dv !== 0) return dv;
  const de = a.escaped - b.escaped;
  if (de !== 0) return de;
  const dh = b.hpPct - a.hpPct;
  if (dh !== 0) return dh;
  return a.cost - b.cost;
}

// ─────────────────────────────────────────────
//  TEST MODE PANEL
// ─────────────────────────────────────────────
(function initTestPanel() {
  const panel          = document.getElementById('test-panel');
  const btnTest        = document.getElementById('btn-test');
  const enemyContainer = document.getElementById('test-enemy-btns');
  const defContainer   = document.getElementById('test-def-btns');
  const inspector      = document.getElementById('test-inspector');
  const inspName       = document.getElementById('test-insp-name');
  const inspFields     = document.getElementById('test-insp-fields');
  const speedSlider    = document.getElementById('test-speed-slider');
  const speedValEl     = document.getElementById('test-speed-val');

  const ENEMY_TYPES = [
    { type: 'grunt',       label: 'Grunt'      },
    { type: 'skeleton',    label: 'Skeleton'   },
    { type: 'troll',       label: 'Troll'      },
    { type: 'rockTroll',   label: 'RockTroll'  },
    { type: 'brute',       label: 'Brute'      },
    { type: 'boss',        label: 'Boss'       },
    { type: 'wolf',        label: 'Wolf'       },
    { type: 'spider',      label: 'Spider'     },
    { type: 'enemyArcher', label: 'EnemyArcher'},
    { type: 'orcMage',     label: 'OrcMage'    },
    { type: 'cyclops',     label: 'Cyclops'    },
    { type: 'exploder',    label: 'Exploder'   },
    { type: 'healerOrc',   label: 'HealerOrc'  },
  ];
  const DEF_TYPES = [
    { type: 'wall',      label: 'Wall'      },
    { type: 'tower',     label: 'Tower'     },
    { type: 'catapult',  label: 'Catapult'  },
    { type: 'swordsman', label: 'Swordsman' },
    { type: 'knight',    label: 'Knight'    },
    { type: 'spearman',  label: 'Spearman'  },
    { type: 'archer',    label: 'Archer'    },
    { type: 'mage',      label: 'Mage'      },
    { type: 'ballista',  label: 'Ballista'  },
    { type: 'spiketrap', label: 'SpikeTrap' },
  ];

  // Shared deselect helpers
  let activeEnemyBtn = null;
  let activeDefBtn   = null;

  function deselEnemyTool() {
    if (activeEnemyBtn) { activeEnemyBtn.classList.remove('selected'); activeEnemyBtn = null; }
    selectedEnemyType = null;
  }
  function deselDefTool() {
    if (activeDefBtn) { activeDefBtn.classList.remove('selected'); activeDefBtn = null; }
    selectedTool = null;
    ghostMesh.visible = false;
    _buildCards.forEach(c => c.classList.remove('selected'));
  }

  // Enemy placement buttons — select → click tile to place
  for (const { type, label } of ENEMY_TYPES) {
    const btn = document.createElement('button');
    btn.className = 'test-btn test-enemy';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      if (selectedEnemyType === type) { deselEnemyTool(); return; }
      deselDefTool();
      deselEnemyTool();
      selectedEnemyType = type;
      activeEnemyBtn = btn;
      btn.classList.add('selected');
      showTooltip(`${label} selected — click any tile to place`, 2000);
    });
    enemyContainer.appendChild(btn);
  }

  // Defender select buttons
  for (const { type, label } of DEF_TYPES) {
    const btn = document.createElement('button');
    btn.className = 'test-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      if (selectedTool === type) { deselDefTool(); return; }
      deselEnemyTool();
      deselDefTool();
      selectedTool = type;
      activeDefBtn = btn;
      btn.classList.add('selected');
      _buildCards.forEach(c => c.classList.toggle('selected', c.dataset.tool === type));
      showTooltip(`${label} selected — click any grass tile to place`, 2000);
    });
    defContainer.appendChild(btn);
  }

  // Speed slider
  speedSlider.addEventListener('input', () => {
    const v = parseFloat(speedSlider.value);
    if (gameSpeed > 0) gameSpeed = v; // don't unpause if manually paused
    speedValEl.textContent = v.toFixed(2).replace(/\.?0+$/, '') + '×';
    document.querySelectorAll('.test-speed-preset').forEach(b => b.classList.toggle('active', parseFloat(b.dataset.v) === v));
  });

  // Speed preset buttons
  document.querySelectorAll('.test-speed-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = parseFloat(btn.dataset.v);
      gameSpeed = v;
      speedSlider.value = v;
      speedValEl.textContent = v + '×';
      document.querySelectorAll('.test-speed-preset').forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  // Lane selector buttons
  document.querySelectorAll('.test-lane-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = parseInt(btn.dataset.lanes);
      if (n === _arenaLanes) return;
      _arenaLanes = n;
      clearField();
      _applyTestPath();
      _buildArena(castleSceneActive);
      document.querySelectorAll('.test-lane-btn').forEach(b => b.classList.toggle('active', b === btn));
      showTooltip(`${n}-lane arena active`, 1200);
    });
  });

  // ── Wave spawn buttons ──────────────────────
  const waveContainer = document.getElementById('test-wave-btns');
  for (let wn = 1; wn <= 12; wn++) {
    const btn = document.createElement('button');
    btn.className = 'test-wave-btn';
    btn.textContent = `W${wn}`;
    btn.title = `Spawn wave ${wn} enemy composition across 3 lanes`;
    btn.addEventListener('click', () => {
      // Clear existing enemies and projectiles (keep defenders)
      for (let i = orcs.length - 1; i >= 0; i--) {
        scene.remove(orcs[i].group); disposeGroup(orcs[i].group);
      }
      orcs.length = 0;
      for (const p of projectiles) { scene.remove(p.mesh); if (p.mesh?.geometry) p.mesh.geometry.dispose(); }
      projectiles.length = 0;
      // Switch to 3 lanes if not already
      if (_arenaLanes !== 3) {
        _arenaLanes = 3;
        _applyTestPath();
        _buildArena(castleSceneActive);
        document.querySelectorAll('.test-lane-btn').forEach(b =>
          b.classList.toggle('active', parseInt(b.dataset.lanes) === 3));
      }
      // Spawn wave composition distributed across all 3 lanes
      _laneRR = 0;
      const q = buildSpawnQueue(wn).filter(t => t !== 'pause');
      const col = ARENA.c0 + 2;
      q.forEach((type, i) => _spawnArenaEnemy(type, col + i * 1.4));
      showTooltip(`Wave ${wn} — ${q.length} enemies across 3 lanes`, 1800);
    });
    waveContainer.appendChild(btn);
  }

  // ── Simulate Wave buttons (timed, mirrors real game spawner) ──────────────
  const simContainer = document.getElementById('test-sim-btns');
  for (let wn = 1; wn <= 12; wn++) {
    const btn = document.createElement('button');
    btn.className = 'test-sim-btn';
    btn.textContent = `W${wn}`;
    btn.title = `Simulate wave ${wn} with real spawn timing across 3 lanes`;
    btn.addEventListener('click', () => {
      // Clear existing enemies, projectiles, and any pending timed spawn
      for (let i = orcs.length - 1; i >= 0; i--) {
        scene.remove(orcs[i].group); disposeGroup(orcs[i].group);
      }
      orcs.length = 0;
      for (const p of projectiles) { scene.remove(p.mesh); if (p.mesh?.geometry) p.mesh.geometry.dispose(); }
      projectiles.length = 0;
      _testSpawnQueue.length = 0;
      // Switch to 3 lanes if not already
      if (_arenaLanes !== 3) {
        _arenaLanes = 3;
        _applyTestPath();
        _buildArena(castleSceneActive);
        document.querySelectorAll('.test-lane-btn').forEach(b =>
          b.classList.toggle('active', parseInt(b.dataset.lanes) === 3));
      }
      // Queue real wave composition (with pause markers for group gaps)
      _laneRR = 0;
      _testSpawnWave = wn;
      _testSpawnQueue = buildSpawnQueue(wn); // keep pause markers for realistic pacing
      _testSpawnTimer = 0;
      const total = _testSpawnQueue.filter(t => t !== 'pause').length;
      showTooltip(`Wave ${wn} — ${total} enemies, real timing (${(CFG.SPAWN_INTERVAL).toFixed(2)}s/enemy)`, 2200);
    });
    simContainer.appendChild(btn);
  }

  // ── Difficulty selector ──────────────────────────────────────────────────
  let _balRunning = false;
  let _origCFG   = null;

  const _DIFF_PRESETS = {
    easy:   { hp: 0.7,  speed: 0.85 },
    normal: { hp: 1.0,  speed: 1.0  },
    hard:   { hp: 1.4,  speed: 1.2  },
  };
  document.querySelectorAll('.test-diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = _DIFF_PRESETS[btn.dataset.diff];
      if (!d) return;
      difficultyMult.hp    = d.hp;
      difficultyMult.speed = d.speed;
      document.querySelectorAll('.test-diff-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.diff === btn.dataset.diff));
      showTooltip(`Difficulty: ${btn.dataset.diff} (HP×${d.hp} spd×${d.speed})`, 1800);
    });
  });

  // ── Balance check button ──────────────────────────────────────────────────
  document.getElementById('bal-run-btn')?.addEventListener('click', () => _runBalanceCheck());

  // ── Stat Tweaker controls ─────────────────────────────────────────────────
  _ensureOrigCFG();
  _applySavedTweaks();
  _buildStatTweaker();

  const _tweakerBody   = document.getElementById('tweaker-body');
  const _tweakerToggle = document.getElementById('tweaker-toggle');
  const _tweakerReset  = document.getElementById('tweaker-reset');

  _tweakerToggle?.addEventListener('click', () => {
    const open = _tweakerBody.style.display !== 'none';
    _tweakerBody.style.display = open ? 'none' : 'block';
    _tweakerToggle.textContent = open ? '▶ show' : '▼ hide';
  });

  _tweakerReset?.addEventListener('click', () => {
    if (!_origCFG) return;
    for (const [type, orig] of Object.entries(_origCFG.STATS)) {
      for (const [k, v] of Object.entries(orig)) {
        if (typeof CFG.STATS[type]?.[k] === 'number') CFG.STATS[type][k] = v;
      }
      for (const d of defenders) {
        if (d.type !== type) continue;
        if (orig.dmg   !== undefined) d.dmg   = orig.dmg;
        if (orig.range !== undefined) d.range = orig.range;
        if (orig.rate  !== undefined) d.rate  = orig.rate;
        if (orig.hp    !== undefined) { d.maxHp = orig.hp; d.hp = Math.min(d.hp, orig.hp); }
      }
    }
    for (const [type, orig] of Object.entries(_origCFG.ORC_TYPES)) {
      for (const [k, v] of Object.entries(orig)) {
        if (typeof CFG.ORC_TYPES[type]?.[k] === 'number') CFG.ORC_TYPES[type][k] = v;
      }
    }
    try { localStorage.removeItem('td_stat_tweaks'); } catch {} // clear persisted tweaks too
    _buildStatTweaker();
    showTooltip('Stats reset to defaults', 1500);
  });

  // ── Stats inspector ────────────────────────
  let inspectedUnit = null;

  function makeField(label, getValue, setValue, step = 1) {
    const row = document.createElement('div');
    row.className = 'test-insp-row';
    const lbl = document.createElement('span');
    lbl.className = 'test-insp-label';
    lbl.textContent = label;
    const inp = document.createElement('input');
    inp.className = 'test-insp-input';
    inp.type = 'number';
    inp.step = step;
    inp.value = getValue();
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value);
      if (!isNaN(v)) setValue(v);
    });
    // Refresh value each frame (HP changes as unit takes damage)
    inp._refresh = () => { if (document.activeElement !== inp) inp.value = getValue(); };
    row.append(lbl, inp);
    inspFields.appendChild(row);
    return inp;
  }

  function showInspector(unit, isEnemy) {
    inspectedUnit = unit;
    inspector.style.display = 'block';
    inspName.textContent = unit.type;
    inspFields.innerHTML = '';
    if (isEnemy) {
      makeField('HP',    () => Math.round(unit.hp),            v => { unit.hp = v; });
      makeField('MaxHP', () => Math.round(unit.maxHp),         v => { unit.maxHp = v; });
      makeField('Speed', () => unit.speed.toFixed(2),          v => { unit.speed = v; }, 0.1);
    } else {
      makeField('HP',    () => Math.round(unit.hp),            v => { unit.hp = v; });
      makeField('MaxHP', () => Math.round(unit.maxHp),         v => { unit.maxHp = v; });
      makeField('DMG',   () => unit.dmg,                       v => { unit.dmg = v; });
      makeField('Range', () => (unit.range ?? 0).toFixed(1),   v => { unit.range = v; }, 0.5);
      makeField('Rate',  () => (unit.rate  ?? 0).toFixed(2),   v => { unit.rate  = v; }, 0.1);
      // Read-only DPS display
      const dpsRow = document.createElement('div');
      dpsRow.className = 'test-insp-row';
      const dpsLbl = document.createElement('span');
      dpsLbl.className = 'test-insp-label';
      dpsLbl.textContent = 'DPS';
      const dpsVal = document.createElement('span');
      dpsVal.className = 'test-insp-dps';
      dpsVal.textContent = ((unit.dmg ?? 0) * (unit.rate ?? 0)).toFixed(2);
      dpsVal._refresh = () => { dpsVal.textContent = ((unit.dmg ?? 0) * (unit.rate ?? 0)).toFixed(2); };
      dpsRow.append(dpsLbl, dpsVal);
      inspFields.appendChild(dpsRow);
    }
  }

  function hideInspector() { inspector.style.display = 'none'; inspectedUnit = null; }

  // Refresh inspector fields each frame
  window._testInspectorTick = () => {
    if (!inspectedUnit || !inspector.style.display || inspector.style.display === 'none') return;
    if (!(inspectedUnit.alive ?? true)) { hideInspector(); return; }
    inspFields.querySelectorAll('.test-insp-input, .test-insp-dps').forEach(inp => inp._refresh?.());
  };

  // Raycast click → unit inspector
  window._testPickUnit = (clientX, clientY) => {
    if (!testMode || selectedTool) return false;
    const ndx = (clientX / window.innerWidth) * 2 - 1;
    const ndy = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(ndx, ndy), camera);
    for (const d of defenders) {
      if (!d.alive) continue;
      const ms = []; d.group.traverse(m => { if (m.isMesh) ms.push(m); });
      if (raycaster.intersectObjects(ms, false).length) { showInspector(d, false); return true; }
    }
    for (const o of orcs) {
      if (!o.alive) continue;
      const ms = []; o.group.traverse(m => { if (m.isMesh) ms.push(m); });
      if (raycaster.intersectObjects(ms, false).length) { showInspector(o, true); return true; }
    }
    hideInspector();
    return false;
  };

  // ── Script Runner ──────────────────────────
  const scriptArea    = document.getElementById('test-script-area');
  const btnScriptRun  = document.getElementById('test-script-run');
  const btnScriptStop = document.getElementById('test-script-stop');
  const scriptStatus  = document.getElementById('test-script-status');
  const presetsCtr    = document.getElementById('test-script-presets');

  let _scriptAbort   = false;
  let _scriptRunning = false;

  const SCRIPT_PRESETS = [
    { label: 'Grunt Wave',
      code: `await speed(2);\nfor (let i = 0; i < 8; i++) { spawn('grunt'); await wait(0.5); }` },
    { label: 'Boss Test',
      code: `place('knight', 40, 26); place('archer', 42, 26); place('spearman', 44, 26);\nplace('knight', 40, 28); place('archer', 42, 28);\nawait wait(0.4);\nspawn('boss'); await wait(0.5); spawn('brute', 3);` },
    { label: 'All Types',
      code: `const types = ['grunt','skeleton','brute','wolf','spider','troll',\n  'enemyArcher','orcMage','cyclops','boss','exploder','healerOrc'];\nfor (const t of types) { spawn(t); await wait(0.35); }` },
    { label: 'Stress Test',
      code: `await speed(3);\nfor (let i = 0; i < 25; i++) {\n  spawn('grunt'); spawn('skeleton');\n  await wait(0.12);\n}` },
    // ── Optimizer presets ──
    { label: 'Optimize 200g',
      code: `// Find best single-type & 2-type combo within 200g\n// vs early/mid threat — results in console + /test-result\nawait TEST.optimize(\n  [['grunt',6],['brute',3],['wolf',3]],\n  { budget:200, speed:3, timeout:18 }\n);` },
    { label: 'Optimize Wave 8',
      code: `// Optimize vs real wave 8 composition\nawait TEST.optimizeWave(8, { budget:280, speed:3, timeout:20 });` },
    { label: 'Optimize 3-Lane W10',
      code: `// 3-lane optimizer vs wave 10\nTEST.lanes(3);\nawait TEST.optimizeWave(10, {\n  budget:400, speed:3, timeout:25,\n  testCols:[32,37,42,47]\n});` },
    // ── Wave-simulation presets (use real buildSpawnQueue compositions) ──
    { label: 'Wave 5  (3 lanes)',
      code: `// Real wave 5 composition across 3 lanes\n// (lanes sit on rows 22/27/32 — walls block ON the lanes, units flank them)\nTEST.lanes(3);\nplace('wall',36,22); place('wall',36,27); place('wall',36,32);\nplace('tower',38,21); place('tower',38,26); place('tower',38,31);\nplace('archer',40,23); place('archer',40,28); place('archer',40,33);\nawait TEST.wave(5, { speed:2, timeout:50 });` },
    { label: 'Wave 10 (3 lanes)',
      code: `// Real wave 10 — full elite mix across 3 lanes\n// (lanes sit on rows 22/27/32 — walls block ON the lanes, units flank them)\nTEST.lanes(3);\nplace('wall',34,22); place('wall',34,27); place('wall',34,32);\nplace('tower',36,21); place('tower',36,26); place('tower',36,31);\nplace('archer',38,23); place('archer',38,28); place('archer',38,33);\nplace('knight',40,21); place('knight',40,26); place('knight',40,31);\nawait TEST.wave(10, { speed:2, timeout:70 });` },
    { label: '3-Lane Sweep',
      code: `// Compare single-lane vs 3-lane with same defenders\nTEST.lanes(1);\nawait TEST.battle({ label:'1-lane', defenders:[['tower',38,26],['archer',40,26],['knight',42,26]], enemies:[['grunt',8],['brute',4],['wolf',4]], speed:2, timeout:30 });\nawait _testWait(1200);\nTEST.lanes(3);\nawait TEST.battle({ label:'3-lane', defenders:[['tower',38,21],['tower',38,26],['tower',38,31],['archer',40,23],['archer',40,28],['archer',40,33]], enemies:[['grunt',8],['brute',4],['wolf',4]], speed:2, timeout:30 });` },
  ];

  for (const p of SCRIPT_PRESETS) {
    const btn = document.createElement('button');
    btn.className = 'test-script-preset';
    btn.textContent = p.label;
    btn.addEventListener('click', () => {
      scriptArea.value = p.code;
      scriptStatus.textContent = '';
      scriptStatus.className = '';
    });
    presetsCtr.appendChild(btn);
  }

  function setScriptStatus(msg, isErr = false) {
    scriptStatus.textContent = msg;
    scriptStatus.className = isErr ? 'error' : '';
  }

  const _placeOuter = place; // capture before script API shadows it

  async function runScript(code) {
    if (_scriptRunning) { setScriptStatus('Still running — stop first', true); return; }
    _scriptAbort   = false;
    _scriptRunning = true;
    btnScriptRun.disabled = true;
    setScriptStatus('⏳ Running…');

    const api = {
      spawn:  (type, count = 1) => {
        const col = ARENA.c0 + 2;
        for (let i = 0; i < count; i++) _spawnArenaEnemy(type, col + i * 1.8);
      },
      enemy:  (type, col, row) => spawnEnemyAtTile(type, col, row),
      place:  (type, col, row) => _placeOuter(type, col, row),
      clear:  () => clearField(),
      wait:   (secs) => new Promise((res, rej) => {
        const end = performance.now() + secs * 1000;
        function tick() {
          if (_scriptAbort) { rej(new Error('aborted')); return; }
          if (performance.now() >= end) { res(); return; }
          setTimeout(tick, 16);
        }
        setTimeout(tick, 16);
      }),
      speed:  (n) => {
        gameSpeed = n;
        speedSlider.value = n;
        speedValEl.textContent = Number(n).toFixed(n % 1 ? 1 : 0) + '×';
      },
      pause:  () => { gameSpeed = 0; },
      resume: () => { gameSpeed = parseFloat(speedSlider.value) || 1; },
      log:    (msg) => setScriptStatus(String(msg)),
    };

    try {
      const fn = new Function(...Object.keys(api),
        `"use strict"; return (async () => {\n${code}\n})();`);
      await fn(...Object.values(api));
      if (!_scriptAbort) setScriptStatus('✓ Done');
      else setScriptStatus('■ Stopped');
    } catch (err) {
      if (err.message === 'aborted') setScriptStatus('■ Stopped');
      else setScriptStatus('✗ ' + err.message, true);
    } finally {
      _scriptRunning = false;
      btnScriptRun.disabled = false;
    }
  }

  btnScriptRun.addEventListener('click', () => runScript(scriptArea.value));
  btnScriptStop.addEventListener('click', () => { _scriptAbort = true; });
  scriptArea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runScript(scriptArea.value); }
  });

  // ── Battle Stats Tracker ───────────────────
  const resultBox     = document.getElementById('test-result-box');
  const resultVerdict = document.getElementById('test-result-verdict');
  const resultRows    = document.getElementById('test-result-rows');
  const logBox        = document.getElementById('test-log-box');

  let _bs = null; // active battle stats

  function _bsReset() {
    // Snapshot current HP of persisted defenders (for multiWave where clearFirst=false).
    // For fresh battles (clearFirst=true), defenders is empty here so the map is empty,
    // and _bsResult falls back to d.maxHp which equals hp at placement time.
    const defHpAtStart = new Map(defenders.map(d => [d, d.hp]));
    _bs = {
      startTime: performance.now(),
      enemies:   { spawned: {}, killed: {}, escaped: {} },
      defenders: { placed: [], killed: 0, snapshots: [] },
      goldEarned: 0,
      castleDmgDealt: 0,
      firstKillAt: null,
      lastKillAt: null,
      damageByType: {},  // damage dealt to each enemy type (for weakness analysis)
      defHpAtStart,      // hp of each defender at battle start (for incremental hpLost)
    };
    if (logBox)    logBox.innerHTML = '';
    if (resultBox) resultBox.style.display = 'none';
  }

  function _logEntry(text, cls) {
    if (!logBox) return;
    const el = document.createElement('div');
    el.className = cls;
    el.textContent = text;
    logBox.appendChild(el);
    logBox.scrollTop = logBox.scrollHeight;
    // Keep at most 60 lines
    while (logBox.children.length > 60) logBox.removeChild(logBox.firstChild);
  }

  function _bsResult() {
    if (!_bs) return null;
    const dur = ((performance.now() - _bs.startTime) / 1000).toFixed(1);
    const killed  = Object.values(_bs.enemies.killed).reduce((a, b) => a + b, 0);
    const escaped = Object.values(_bs.enemies.escaped).reduce((a, b) => a + b, 0);
    const spawned = Object.values(_bs.enemies.spawned).reduce((a, b) => a + b, 0);
    // Use HP-at-battle-start snapshot so multiWave doesn't inflate hpLost with prior-wave damage
    const hpLost = defenders.reduce((sum, d) => {
      const startHp = _bs.defHpAtStart.get(d) ?? d.maxHp;
      return sum + Math.max(0, startHp - Math.max(0, d.hp));
    }, 0) + _bs.defenders.snapshots.reduce((sum, s) => sum + (s.hpLostThisBattle ?? 0), 0);
    const totalStartHp = defenders.reduce((sum, d) => sum + (_bs.defHpAtStart.get(d) ?? d.maxHp), 0)
      + _bs.defenders.snapshots.reduce((sum, s) => sum + (s.hpLostThisBattle ?? 0), 0);
    // TIMEOUT: enemies spawned but none resolved (killed or escaped) — the battle
    // stalled (e.g. rare arena warm-up race right after page load). Without this
    // a stalled battle reads as a flawless WIN and poisons sweep/optimizer rankings.
    const verdict = (spawned > 0 && killed === 0 && escaped === 0) ? 'TIMEOUT'
      : escaped === 0 ? 'WIN' : killed === 0 ? 'LOSS' : 'PARTIAL';

    // Per-defender snapshot: merge live defenders with killed ones (which are
    // spliced from the array after their death animation finishes)
    const defStats = defenders.map(d => ({
      type: d.type, col: d.col, row: d.row,
      kills: d.kills || 0,
      hpRemaining: Math.max(0, Math.round(d.hp)),
      hpPct: d.maxHp > 0 ? Math.round(Math.max(0, d.hp) / d.maxHp * 100) : 0,
    })).concat(_bs.defenders.snapshots);
    const killsByType = {};
    for (const s of defStats) killsByType[s.type] = (killsByType[s.type] || 0) + s.kills;

    // Cost & efficiency
    const costTotal = _bs.defenders.placed.reduce((sum, p) => sum + (CFG.COSTS[p.type] || 0), 0);
    const killEfficiency = costTotal > 0 ? Math.round(killed / costTotal * 100) / 100 : 0;

    return {
      verdict, duration: parseFloat(dur), spawned, killed, escaped,
      defKilled: _bs.defenders.killed,
      hpLost: Math.round(hpLost),
      hpPct: totalStartHp > 0 ? Math.round((1 - hpLost / totalStartHp) * 100) : 100,
      goldEarned: _bs.goldEarned,
      castleDmgDealt: _bs.castleDmgDealt,
      firstKillAt: _bs.firstKillAt,
      lastKillAt: _bs.lastKillAt,
      costTotal,
      killEfficiency,
      killsByType,
      damageByType: { ..._bs.damageByType },
      defStats,
      breakdown: {
        enemies:   { spawned: {..._bs.enemies.spawned}, killed: {..._bs.enemies.killed}, escaped: {..._bs.enemies.escaped} },
        defenders: { placed: [..._bs.defenders.placed], killed: _bs.defenders.killed },
      },
    };
  }

  function _showResult(r) {
    if (!resultBox) return;
    resultBox.style.display = 'block';
    resultVerdict.textContent = r.verdict;
    resultVerdict.className = r.verdict.toLowerCase();
    const _fs = _funScore(r);
    resultRows.innerHTML =
      `enemies  ${r.killed}/${r.spawned} killed  ${r.escaped} escaped\n` +
      `defenders  ${r.defKilled} killed  ${r.hpLost} HP lost  (${r.hpPct}% remain)\n` +
      `castle dmg  ${r.castleDmgDealt}    cost  ${r.costTotal}g\n` +
      `gold earned  ${r.goldEarned}    time  ${r.duration}s\n` +
      `fun factor  ${_fs}/100`;
  }

  // Wire hooks — called from game code via window._testOn*
  window._testOnEnemyKilled = (orc) => {
    if (!_bs) return;
    _bs.enemies.killed[orc.type] = (_bs.enemies.killed[orc.type] || 0) + 1;
    _bs.goldEarned += orc.reward;
    const t = (performance.now() - _bs.startTime) / 1000;
    if (_bs.firstKillAt === null) _bs.firstKillAt = Math.round(t * 10) / 10;
    _bs.lastKillAt = Math.round(t * 10) / 10;
    _logEntry(`[${t.toFixed(1)}s] killed ${orc.type} (+${orc.reward}g)`, 'test-log-kill');
  };
  window._testOnDefenderKilled = (def) => {
    if (!_bs) return;
    _bs.defenders.killed++;
    // Record how much HP this defender had at the start of this battle
    // (for correct hpLost in multiWave where defenders carry over with reduced HP)
    const hpLostThisBattle = _bs.defHpAtStart.get(def) ?? def.maxHp;
    // Snapshot before the death animation removes it from the defenders array
    _bs.defenders.snapshots.push({
      type: def.type, col: def.col, row: def.row,
      kills: def.kills || 0, hpRemaining: 0, hpPct: 0,
      hpLostThisBattle,
    });
    const t = ((performance.now() - _bs.startTime) / 1000).toFixed(1);
    _logEntry(`[${t}s] ${def.type} defender died`, 'test-log-defdie');
  };
  window._testOnEnemyEscaped = (orc) => {
    if (!_bs) return;
    _bs.enemies.escaped[orc.type] = (_bs.enemies.escaped[orc.type] || 0) + 1;
    _bs.castleDmgDealt += orc.castleDmg || 0;
    const t = ((performance.now() - _bs.startTime) / 1000).toFixed(1);
    _logEntry(`[${t}s] ${orc.type} ESCAPED (castleDmg ${orc.castleDmg})`, 'test-log-escape');
  };
  window._testOnEnemyDamaged = (orc, dmg) => {
    if (!_bs) return;
    _bs.damageByType[orc.type] = (_bs.damageByType[orc.type] || 0) + dmg;
  };

  // Expose SND for debugging from console / test scripts
  window.SND = SND;

  // ── Balance Testing Helpers ──────────────────────────────────────────────

  /**
   * Fun-factor score 0–100: measures how engaging/tense a battle was.
   * A perfect shutout scores ~40 (safe but dull). Sweet spot: win with
   * 20-65% castle damage and some defender losses scores 85-100.
   */
  function _funScore(r) {
    const dmgPct  = Math.min(1, (r.castleDmgDealt || 0) / CFG.CASTLE_MAX_HP);
    const killRate = r.spawned > 0 ? r.killed / r.spawned : 0;
    let score = 0;
    if (r.verdict === 'WIN') {
      score = 55;
      if      (dmgPct >= 0.2 && dmgPct <= 0.65) score += 30; // dramatic but survivable
      else if (dmgPct >= 0.05)                   score += 15; // some pressure
      else if (dmgPct === 0 && r.escaped === 0)  score  = 40; // clean but dull
      score += Math.min(10, (r.defKilled || 0) * 5);          // defender losses add tension
      if (r.escaped > 0 && r.escaped <= 2)       score += 5;  // nail-biter close call
    } else if (r.verdict === 'PARTIAL') {
      score = 30 + Math.round(killRate * 20);
      if (dmgPct >= 0.4) score += 10;
    } else { // LOSS
      score = Math.round(killRate * 20);
    }
    return Math.min(100, Math.max(0, Math.round(score)));
  }

  /** Snapshot CFG defaults once so Reset All can restore them */
  function _ensureOrigCFG() {
    if (_origCFG) return;
    _origCFG = {
      STATS:     JSON.parse(JSON.stringify(CFG.STATS)),
      ORC_TYPES: JSON.parse(JSON.stringify(CFG.ORC_TYPES)),
    };
  }

  // ── Tweak persistence: only the DIFFS vs the shipped defaults are stored,
  // so a game-balance update in a new build wins wherever the player didn't
  // explicitly tweak that exact stat.
  function _saveTweaks() {
    if (!_origCFG) return;
    const diff = { STATS: {}, ORC_TYPES: {} };
    for (const [grp, cfg, orig] of [['STATS', CFG.STATS, _origCFG.STATS], ['ORC_TYPES', CFG.ORC_TYPES, _origCFG.ORC_TYPES]]) {
      for (const [type, stats] of Object.entries(cfg)) {
        for (const [k, v] of Object.entries(stats)) {
          if (typeof v === 'number' && typeof orig[type]?.[k] === 'number' && Math.abs(v - orig[type][k]) > 0.0001) {
            (diff[grp][type] = diff[grp][type] || {})[k] = v;
          }
        }
      }
    }
    if (!Object.keys(diff.STATS).length && !Object.keys(diff.ORC_TYPES).length) {
      try { localStorage.removeItem('td_stat_tweaks'); } catch {}
    } else {
      saveSave('td_stat_tweaks', diff);
    }
  }
  function _applySavedTweaks() {
    const t = loadSave('td_stat_tweaks', null);
    if (!t) return;
    let applied = 0;
    for (const [grp, cfg] of [['STATS', CFG.STATS], ['ORC_TYPES', CFG.ORC_TYPES]]) {
      for (const [type, stats] of Object.entries(t[grp] || {})) {
        for (const [k, v] of Object.entries(stats)) {
          if (typeof cfg[type]?.[k] === 'number' && typeof v === 'number') { cfg[type][k] = v; applied++; }
        }
      }
    }
    if (applied) showTooltip(`🔧 ${applied} saved stat tweak${applied > 1 ? 's' : ''} applied (Test Arena → Reset to clear)`, 3500);
  }

  /** Build/rebuild the stat tweaker panel from current CFG values */
  function _buildStatTweaker() {
    _ensureOrigCFG();
    const defRows = document.getElementById('tweaker-def-rows');
    const orcRows = document.getElementById('tweaker-orc-rows');
    if (!defRows || !orcRows) return;
    defRows.innerHTML = '';
    orcRows.innerHTML = '';

    const DEF_TWEAKS = [
      { type: 'tower',     stats: [['dmg',1,0],['rate',0.1,2],['range',0.5,1]] },
      { type: 'catapult',  stats: [['dmg',1,0],['rate',0.05,2],['range',0.5,1]] },
      { type: 'archer',    stats: [['dmg',1,0],['rate',0.25,2],['range',0.5,1]] },
      { type: 'swordsman', stats: [['dmg',1,0],['rate',0.2,2],['range',0.5,1]] },
      { type: 'knight',    stats: [['dmg',1,0],['rate',0.1,2],['hp',5,0]] },
      { type: 'spearman',  stats: [['dmg',1,0],['rate',0.1,2],['range',0.5,1]] },
      { type: 'mage',      stats: [['dmg',1,0],['rate',0.1,2],['range',0.5,1]] },
      { type: 'ballista',  stats: [['dmg',2,0],['rate',0.05,2],['range',1.0,1]] },
    ];
    const ENC_TWEAKS = [
      { type: 'grunt',     stats: [['hp',1,0],['speed',0.1,2]] },
      { type: 'brute',     stats: [['hp',1,0],['speed',0.1,2]] },
      { type: 'skeleton',  stats: [['hp',1,0],['speed',0.25,2]] },
      { type: 'wolf',      stats: [['hp',1,0],['speed',0.25,2]] },
      { type: 'boss',      stats: [['hp',2,0],['speed',0.05,2]] },
      { type: 'troll',     stats: [['hp',2,0],['speed',0.05,2]] },
      { type: 'cyclops',   stats: [['hp',2,0],['speed',0.05,2]] },
      { type: 'rockTroll', stats: [['hp',5,0],['speed',0.05,2]] },
    ];

    function _makeControl(cfgObj, statKey, step, decimals, isEnemy) {
      const wrap = document.createElement('div');
      wrap.className = 'tweak-stat';
      const lbl = document.createElement('span');
      lbl.className = 'tweak-label';
      lbl.textContent = statKey;
      const minus = document.createElement('button');
      minus.className = 'tweak-minus';
      minus.textContent = '−';
      const valEl = document.createElement('span');
      valEl.className = 'tweak-val';
      const plus = document.createElement('button');
      plus.className = 'tweak-plus';
      plus.textContent = '+';

      const orig = isEnemy
        ? _origCFG.ORC_TYPES[cfgObj._tweakType]?.[statKey]
        : _origCFG.STATS[cfgObj._tweakType]?.[statKey];

      function refresh() {
        const v = cfgObj[statKey];
        valEl.textContent = decimals > 0 ? v.toFixed(decimals) : String(v);
        valEl.classList.toggle('changed', orig !== undefined && Math.abs(v - orig) > 0.0001);
      }
      function adjust(delta) {
        cfgObj[statKey] = Math.max(0.01, Math.round((cfgObj[statKey] + delta) * 1000) / 1000);
        if (!isEnemy) {
          for (const d of defenders) {
            if (d.type === cfgObj._tweakType) d[statKey] = cfgObj[statKey];
          }
        }
        refresh();
        _saveTweaks(); // persist so balance experiments survive reloads
      }
      minus.addEventListener('click', () => adjust(-step));
      plus.addEventListener('click',  () => adjust( step));
      refresh();
      wrap.append(lbl, minus, valEl, plus);
      return wrap;
    }

    function _makeTweakRow(cfgObj, type, stats, isEnemy) {
      cfgObj._tweakType = type;
      const row = document.createElement('div');
      row.className = 'tweak-row';
      const typeLbl = document.createElement('span');
      typeLbl.className = 'tweak-type';
      typeLbl.textContent = type;
      row.appendChild(typeLbl);
      for (const [statKey, step, decimals] of stats) {
        if (cfgObj[statKey] !== undefined) {
          row.appendChild(_makeControl(cfgObj, statKey, step, decimals, isEnemy));
        }
      }
      return row;
    }

    for (const { type, stats } of DEF_TWEAKS) {
      if (CFG.STATS[type]) defRows.appendChild(_makeTweakRow(CFG.STATS[type], type, stats, false));
    }
    for (const { type, stats } of ENC_TWEAKS) {
      if (CFG.ORC_TYPES[type]) orcRows.appendChild(_makeTweakRow(CFG.ORC_TYPES[type], type, stats, true));
    }
  }

  /** Run waves 1–12 against the current field layout and render the color-coded grid */
  async function _runBalanceCheck() {
    if (_balRunning) return;
    _balRunning = true;
    if (!testMode) enterTestMode();

    const balGrid    = document.getElementById('bal-grid');
    const balSummary = document.getElementById('bal-summary');
    const balRunBtn  = document.getElementById('bal-run-btn');
    const balRunning = document.getElementById('bal-running');
    if (!balGrid || !balSummary || !balRunBtn) { _balRunning = false; return; }

    // Snapshot current field (type + position)
    const defSnapshot = defenders.filter(d => d.alive).map(d => [d.type, d.col, d.row]);
    if (defSnapshot.length === 0) {
      balSummary.innerHTML = '<span style="color:#ff8844">Place defenders first, then run the balance check.</span>';
      _balRunning = false;
      return;
    }

    balRunBtn.disabled = true;
    if (balRunning) balRunning.textContent = '⏳ testing...';
    balSummary.innerHTML = '';

    // Build 12 placeholder cells
    balGrid.innerHTML = '';
    const cells = [];
    for (let w = 1; w <= 12; w++) {
      const cell = document.createElement('div');
      cell.className = 'bal-cell pending';
      cell.innerHTML = `<div class="bal-wave">W${w}</div><div class="bal-verdict">–</div><div class="bal-fun"></div>`;
      balGrid.appendChild(cell);
      cells.push(cell);
    }

    // Ensure 3-lane arena for realistic multi-path testing
    if (_arenaLanes !== 3) window.TEST.lanes(3);

    const results = [];
    for (let wn = 1; wn <= 12; wn++) {
      cells[wn - 1].className = 'bal-cell running';
      cells[wn - 1].querySelector('.bal-verdict').textContent = '…';

      const q = buildSpawnQueue(wn);
      const counts = {};
      for (const t of q) { if (t !== 'pause') counts[t] = (counts[t] || 0) + 1; }
      const eneCfg = Object.entries(counts).map(([type, n]) => [type, n]);

      const r = await window.TEST.battle({
        label: `bal_w${wn}`,
        defenders: defSnapshot,
        enemies:   eneCfg,
        speed:     3,
        timeout:   60,
        clearFirst: true,
      });

      const fun = _funScore(r);
      results.push({ wave: wn, verdict: r.verdict, escaped: r.escaped,
        castleDmg: r.castleDmgDealt, fun, hpPct: r.hpPct });

      const cls  = r.verdict === 'WIN' ? 'win' : r.verdict === 'PARTIAL' ? 'partial' : 'loss';
      const icon = r.verdict === 'WIN' ? '✓' : r.verdict === 'PARTIAL' ? '~' : '✗';
      const escTxt = r.escaped > 0 ? ` ${r.escaped}e` : '';
      cells[wn - 1].className = `bal-cell ${cls}`;
      cells[wn - 1].innerHTML =
        `<div class="bal-wave">W${wn}</div>` +
        `<div class="bal-verdict">${icon}${escTxt}</div>` +
        `<div class="bal-fun">★${fun}</div>`;
    }

    const wins    = results.filter(r => r.verdict === 'WIN').length;
    const partial = results.filter(r => r.verdict === 'PARTIAL').length;
    const losses  = results.filter(r => r.verdict === 'LOSS').length;
    const avgFun  = Math.round(results.reduce((s, r) => s + r.fun, 0) / results.length);
    balSummary.innerHTML =
      `<span class="bal-sum-win">✓ ${wins}W</span>  ` +
      `<span class="bal-sum-partial">~ ${partial}P</span>  ` +
      `<span class="bal-sum-loss">✗ ${losses}L</span>  ` +
      `  avg fun: <strong style="color:#aaccff">${avgFun}/100</strong>`;

    if (balRunning) balRunning.textContent = '';
    balRunBtn.disabled = false;
    _balRunning = false;
  }

  // Dev hook: expose core render objects so the headless test harness can drive
  // the camera for close-up model inspection (companion to window.TEST).
  window._DEV = {
    scene, camera, controls, THREE,
    get orcs() { return orcs; },
    get defenders() { return defenders; },
    // Map-editor internals for automated editor testing
    me: {
      setTool: _meSetTool,
      apply: _meApplyTool,
      undo: _meUndo,
      redo: _meRedo,
      validate: _meValidatePaths,
      order: _meOrderPathTiles,
      setBrush: (n) => { _meBrushSize = n; },
      get paths() { return _mePaths; },
      get gamePaths() { return PATHS; },
      get overrides() { return _meTileOverrides; },
      get items() { return _meItems; },
    },
  };

  // Expose global TEST API for browser console and terminal-driven scripts
  window.TEST = {
    /** Run a script string. Auto-enters test mode if needed. */
    run:    async (code) => {
      if (!testMode) enterTestMode();
      await runScript(code);
    },
    /** Stop the currently running script */
    stop:   () => { _scriptAbort = true; },
    /** Force-kill a stuck script (resets _scriptRunning so new scripts can run) */
    kill:   () => { _scriptAbort = true; _scriptRunning = false; window._battleWatcher = null; window._waitWatcher = null; },
    /** Spawn enemy on the path, distributed across all active lanes  e.g. TEST.spawn('grunt', 5) */
    spawn:  (type, count = 1) => {
      if (!testMode) enterTestMode();
      const col = ARENA.c0 + 2;
      for (let i = 0; i < count; i++) _spawnArenaEnemy(type, col + i * 1.8);
    },
    /** Place enemy at exact tile  e.g. TEST.enemy('boss', 20, 27) */
    enemy:  (type, col, row) => { if (!testMode) enterTestMode(); spawnEnemyAtTile(type, col, row); },
    /** Place defender at tile  e.g. TEST.place('knight', 40, 27) */
    place:  (type, col, row) => { if (!testMode) enterTestMode(); _placeOuter(type, col, row); },
    /** Remove all units */
    clear:  () => clearField(),
    /** Set game speed  e.g. TEST.speed(2) */
    speed:  (n) => {
      gameSpeed = n;
      if (speedSlider) {
        speedSlider.value = n;
        speedValEl.textContent = n + '×';
        document.querySelectorAll('.test-speed-preset').forEach(b => b.classList.toggle('active', parseFloat(b.dataset.v) === n));
      }
    },
    /** Enter test mode */
    enter:  () => { if (!testMode) enterTestMode(); },
    /** Exit test mode */
    exit:   () => { if (testMode) exitTestMode(); },
    /** Current battle stats snapshot */
    stats:  () => _bsResult(),
    /**
     * Run a complete named battle and return a JSON result.
     * config: {
     *   label?:     string,
     *   defenders?: [[type, col, row], ...],
     *            — NOTE: place defenders at row 26 or 28 (NOT path row 27) so they
     *              shoot from the side. Row 27 = ON the path = enemies melee them instead.
     *   enemies?:   [[type, count?], ...],  — spawned left→right on path row 27
     *   speed?:     number (default 2),
     *   timeout?:   number seconds (default 25),
     *   clearFirst?: boolean (default true),
     * }
     * Returns: { verdict, killed, escaped, defKilled, hpLost, goldEarned, duration, breakdown }
     *
     * Example:
     *   const r = await TEST.battle({
     *     label: 'tower_vs_grunts',
     *     defenders: [['tower', 40, 26]],   // row 26 or 28 — NOT 27 (path)
     *     enemies: [['grunt', 10]],
     *     speed: 2,
     *   });
     *   console.log(r.verdict, r.killed, r.escaped);
     */
    battle: async (config = {}) => {
      const {
        label = 'battle',
        defenders: defCfg = [],
        enemies:   eneCfg = [],
        speed:     spd    = 2,
        timeout            = 25,
        clearFirst         = true,
      } = config;

      if (!testMode) enterTestMode();
      if (clearFirst) clearField();
      _bsReset();
      _logEntry(`--- ${label} ---`, 'test-log-info');

      // Place defenders
      for (const [type, col, row] of defCfg) {
        _placeOuter(type, col, row);
        _bs.defenders.placed.push({ type, col, row });
      }

      // Set speed
      gameSpeed = spd;
      speedSlider.value = spd;
      speedValEl.textContent = spd + '×';
      document.querySelectorAll('.test-speed-preset').forEach(b => b.classList.toggle('active', parseFloat(b.dataset.v) === spd));

      // Small settle delay (game-loop-based to avoid background tab throttling)
      await _testWait(200);

      // Count total enemies to spawn (for the allDone check) — capped by ARENA_SPAWN_CAP below
      const totalSpawnedRaw = eneCfg.reduce((s, e) => {
        const [, count = 1] = Array.isArray(e) ? e : [e, 1];
        return s + count;
      }, 0);
      // Cap must match ARENA_SPAWN_CAP (22 per lane) — a flat 22 made multi-lane
      // battles resolve as soon as the first 22 enemies finished, ignoring the rest.
      const totalSpawned = Math.min(totalSpawnedRaw, 22 * _arenaLanes);

      // Spawn enemies with column stagger — cap scales with lane count (22 per lane)
      // so multi-lane battles can handle full wave compositions without truncation.
      const ARENA_SPAWN_CAP = 22 * _arenaLanes;
      _laneRR = 0; // reset round-robin so enemies distribute evenly from lane 0
      let col0 = ARENA.c0 + 2;
      let spawnedTotal = 0;
      for (const entry of eneCfg) {
        const [type, count = 1] = Array.isArray(entry) ? entry : [entry, 1];
        for (let i = 0; i < count; i++) {
          if (spawnedTotal >= ARENA_SPAWN_CAP) break;
          _spawnArenaEnemy(type, col0 + i * 1.8);
          _bs.enemies.spawned[type] = (_bs.enemies.spawned[type] || 0) + 1;
          spawnedTotal++;
        }
        col0 += count * 1.8 + 1;
        if (spawnedTotal >= ARENA_SPAWN_CAP) break;
      }

      // Wait until all spawned enemies are resolved — checked each game frame via _battleWatcher
      // (avoids setTimeout throttling in background tabs)
      await new Promise(res => {
        window._battleWatcher = { resolve: res, end: performance.now() + timeout * 1000, totalSpawned, bs: _bs };
      });

      const result = _bsResult();
      result.label = label;
      result.timestamp = new Date().toISOString();

      _showResult(result);

      // Push to /test-result so terminal can read it
      fetch('/test-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      }).catch(() => {});

      console.log(`[TEST] ${label}:`, result.verdict,
        `| ${result.killed}/${result.spawned} killed | ${result.escaped} escaped`,
        `| defKilled:${result.defKilled} hpLost:${result.hpLost} | ${result.duration}s`);

      return result;
    },

    /**
     * Run multiple battle configs sequentially and print a comparison table.
     * Example:
     *   await TEST.compare([
     *     { label:'tower', defenders:[['tower',40,26]], enemies:[['grunt',10]] },
     *     { label:'archer', defenders:[['archer',40,26]], enemies:[['grunt',10]] },
     *   ]);
     */
    compare: async (scenarios, opts = {}) => {
      const { speed = 2, timeout = 20, pauseBetween = 1.5 } = opts;
      const results = [];
      for (const s of scenarios) {
        const r = await window.TEST.battle({ speed, timeout, ...s });
        results.push(r);
        await _testWait(pauseBetween * 1000);
      }
      console.table(results.map(r => ({
        label:      r.label,
        verdict:    r.verdict,
        killed:     r.killed,
        escaped:    r.escaped,
        defKilled:  r.defKilled,
        hpPct:      r.hpPct + '%',
        castleDmg:  r.castleDmgDealt,
        cost:       r.costTotal,
        killEff:    r.killEfficiency,
        gold:       r.goldEarned,
        time:       r.duration + 's',
      })));
      return results;
    },

    /**
     * Run the same battle N times and return averaged stats (handles RNG variance).
     * Example:
     *   const s = await TEST.battleN({ label:'tower_vs_grunts', defenders:[['tower',40,26]], enemies:[['grunt',8]] }, 5);
     *   console.log(s.wins, s.avgKilled, s.avgHpLost);
     */
    battleN: async (config = {}, n = 3) => {
      const results = [];
      for (let i = 0; i < n; i++) {
        const r = await window.TEST.battle({ ...config, label: `${config.label || 'battle'}#${i+1}` });
        results.push(r);
        if (i < n - 1) await _testWait(800);
      }
      const _avg = key => results.reduce((s, r) => s + (r[key] || 0), 0) / n;
      const _std = key => {
        const avg = _avg(key);
        return Math.round(Math.sqrt(results.reduce((s, r) => s + Math.pow((r[key] || 0) - avg, 2), 0) / n) * 10) / 10;
      };
      const summary = {
        label:         config.label || 'battle',
        n,
        wins:          results.filter(r => r.verdict === 'WIN').length,
        partials:      results.filter(r => r.verdict === 'PARTIAL').length,
        losses:        results.filter(r => r.verdict === 'LOSS').length,
        avgKilled:     Math.round(_avg('killed') * 10) / 10,
        stdKilled:     _std('killed'),
        avgEscaped:    Math.round(_avg('escaped') * 10) / 10,
        stdEscaped:    _std('escaped'),
        avgHpLost:     Math.round(_avg('hpLost')),
        stdHpLost:     _std('hpLost'),
        avgHpPct:      Math.round(_avg('hpPct')),
        avgCastleDmg:  Math.round(_avg('castleDmgDealt')),
        stdCastleDmg:  _std('castleDmgDealt'),
        avgGold:       Math.round(_avg('goldEarned')),
        avgDuration:   Math.round(_avg('duration') * 10) / 10,
        costTotal:     results[0]?.costTotal || 0,
        killEfficiency: Math.round(_avg('killEfficiency') * 100) / 100,
        runs: results,
      };
      console.log(`[TEST.battleN] ${summary.label} ×${n}: ${summary.wins}W/${summary.partials}P/${summary.losses}L` +
        ` | killed=${summary.avgKilled} escaped=${summary.avgEscaped}` +
        ` | hpLost=${summary.avgHpLost} (${summary.avgHpPct}% remain)` +
        ` | castleDmg=${summary.avgCastleDmg} cost=${summary.costTotal}`);
      fetch('/test-result', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(summary),
      }).catch(() => {});
      return summary;
    },

    /**
     * Run a matrix of defender-sets vs enemy-sets and print a comparison table.
     * defSets:  [[label, [[type,col,row],...]], ...]
     * eneSets:  [[label, [[type,count],...]], ...]
     * opts:     { speed, timeout, n }  — n>1 uses battleN averaging
     * Example:
     *   await TEST.sweep(
     *     [['tower', [['tower',40,26]]], ['archer', [['archer',40,26]]]],
     *     [['grunts', [['grunt',8]]], ['brutes', [['brute',4]]]],
     *     { n: 3 }
     *   );
     */
    sweep: async (defSets, eneSets, opts = {}) => {
      const { speed = 2, timeout = 25, n = 1 } = opts;
      const rows = [];
      for (const [defLabel, defCfg] of defSets) {
        for (const [eneLabel, eneCfg] of eneSets) {
          const label = `${defLabel}_vs_${eneLabel}`;
          let row;
          if (n > 1) {
            const s = await window.TEST.battleN({ label, defenders: defCfg, enemies: eneCfg, speed, timeout }, n);
            row = { def: defLabel, ene: eneLabel,
              wins: `${s.wins}/${n}`, avgKilled: s.avgKilled, avgEscaped: s.avgEscaped,
              avgHpPct: s.avgHpPct + '%', avgCastleDmg: s.avgCastleDmg,
              cost: s.costTotal, killEff: s.killEfficiency };
          } else {
            const r = await window.TEST.battle({ label, defenders: defCfg, enemies: eneCfg, speed, timeout });
            row = { def: defLabel, ene: eneLabel,
              verdict: r.verdict, killed: r.killed, escaped: r.escaped,
              hpPct: r.hpPct + '%', castleDmg: r.castleDmgDealt,
              cost: r.costTotal, killEff: r.killEfficiency };
          }
          rows.push(row);
          await _testWait(800);
        }
      }
      console.table(rows);
      fetch('/test-result', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rows),
      }).catch(() => {});
      return rows;
    },

    /**
     * Switch the number of active test lanes (1 / 2 / 3) and rebuild the arena.
     * Enemies spawned via TEST.spawn / TEST.battle are distributed round-robin across lanes.
     * Use 3 lanes to match the real game's 3-road layout.
     * Example:  TEST.lanes(3);  await TEST.wave(8, { defenders:[...] });
     */
    lanes: (count) => {
      if (!testMode) enterTestMode();
      const n = Math.max(1, Math.min(3, Math.round(count)));
      if (n === _arenaLanes) return;
      _arenaLanes = n;
      clearField();
      _applyTestPath();
      _buildArena(castleSceneActive);
      // Update lane button active state
      document.querySelectorAll('.test-lane-btn').forEach(b =>
        b.classList.toggle('active', parseInt(b.dataset.lanes) === n));
      showTooltip(`${n}-lane arena — ${_getArenaLaneRows(n).join(', ')} rows`, 1800);
    },

    /**
     * Simulate a real game wave using the hand-tuned buildSpawnQueue composition.
     * With multiple lanes active, enemies are spread across all lanes (like the real game).
     * opts: { defenders, speed, timeout, label }
     * Example:
     *   TEST.lanes(3);
     *   await TEST.wave(5, { defenders:[['tower',40,26],['archer',38,28]] });
     */
    wave: async (waveNum, opts = {}) => {
      const { defenders: defCfg = [], speed = 2, timeout = 60, label } = opts;
      const q = buildSpawnQueue(waveNum);
      const counts = {};
      for (const t of q) { if (t !== 'pause') counts[t] = (counts[t] || 0) + 1; }
      const eneCfg = Object.entries(counts).map(([type, n]) => [type, n]);
      return window.TEST.battle({
        label: label || `wave${waveNum}`,
        defenders: defCfg,
        enemies: eneCfg,
        speed, timeout,
      });
    },

    /**
     * Simulate consecutive waves with defenders persisting between them (carry-over HP/kills).
     * waveNums: array of wave numbers, e.g. [1, 2, 3]
     * Example:
     *   await TEST.multiWave([['tower',40,26],['archer',38,28]], [1,2,3,4,5]);
     */
    multiWave: async (defCfg, waveNums, opts = {}) => {
      const { speed = 2, timeout = 60 } = opts;
      const waveResults = [];
      let firstWave = true;
      for (const waveNum of waveNums) {
        const q = buildSpawnQueue(waveNum);
        const counts = {};
        for (const t of q) { if (t !== 'pause') counts[t] = (counts[t] || 0) + 1; }
        const eneCfg = Object.entries(counts).map(([type, n]) => [type, n]);
        const r = await window.TEST.battle({
          label: `wave${waveNum}`,
          defenders: firstWave ? defCfg : [],  // place defenders only on first wave
          enemies: eneCfg,
          speed, timeout,
          clearFirst: firstWave,               // clear only before first wave
        });
        waveResults.push({ wave: waveNum, verdict: r.verdict, killed: r.killed, escaped: r.escaped,
          defKilled: r.defKilled, hpPct: r.hpPct + '%', castleDmg: r.castleDmgDealt,
          goldEarned: r.goldEarned, duration: r.duration + 's' });
        firstWave = false;
        await _testWait(1000);
      }
      console.table(waveResults);
      fetch('/test-result', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(waveResults),
      }).catch(() => {});
      return waveResults;
    },

    /**
     * Test each enemy type against a defender setup to discover weaknesses.
     * Returns results + a weaknesses list (enemy types that escaped).
     * Example:
     *   const { weaknesses } = await TEST.findWeakness([['tower',40,26],['archer',38,28]], null, { count: 5 });
     */
    findWeakness: async (defCfg, enemyTypes, opts = {}) => {
      const { speed = 2, timeout = 25, count = 5 } = opts;
      const types = enemyTypes || Object.keys(CFG.ORC_TYPES);
      const scenarios = types.map(type => ({
        label: type,
        defenders: defCfg,
        enemies: [[type, count]],
      }));
      const results = await window.TEST.compare(scenarios, { speed, timeout });
      const weaknesses = results
        .filter(r => r.verdict !== 'WIN')
        .map(r => ({ type: r.label, verdict: r.verdict, escaped: r.escaped, castleDmg: r.castleDmgDealt }));
      if (weaknesses.length) {
        console.warn('[TEST.findWeakness] Weaknesses:', weaknesses.map(w => `${w.type}(${w.verdict})`).join(', '));
      } else {
        console.log('[TEST.findWeakness] No weaknesses found — all enemy types contained!');
      }
      const summary = { results, weaknesses };
      fetch('/test-result', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(summary),
      }).catch(() => {});
      return summary;
    },

    /**
     * Test a single defender type at multiple column positions to find optimal placement.
     * cols: array of column numbers, or a count (generates evenly-spaced columns in arena).
     * Example:
     *   await TEST.placementSweep('tower', [['brute',4]], [25,30,35,40,45,50], 26);
     */
    placementSweep: async (defType, enemies, cols, row = 26, opts = {}) => {
      const { speed = 2, timeout = 25 } = opts;
      const colList = Array.isArray(cols)
        ? cols
        : Array.from({ length: cols || 7 }, (_, i) => ARENA.c0 + 4 + Math.round(i * (ARENA.c1 - ARENA.c0 - 8) / ((cols || 7) - 1)));
      const eneCfg = enemies.map(e => Array.isArray(e) ? e : [e, 1]);
      const scenarios = colList.map(c => ({
        label: `${defType}@c${c}`,
        defenders: [[defType, c, row]],
        enemies: eneCfg,
      }));
      return window.TEST.compare(scenarios, { speed, timeout });
    },

    /**
     * Find the minimum cost single-type setup that can WIN against the given enemies.
     * Returns a sorted table of {type, count, cost, killEff} for each defender type.
     * Example:
     *   await TEST.minCost([['brute',6],['wolf',4]], null, { maxCount: 8 });
     */
    minCost: async (enemies, defTypes, opts = {}) => {
      const { speed = 2, timeout = 25, maxCount = 10, col = 40, rows = [26, 28] } = opts;
      const types = defTypes || Object.keys(CFG.COSTS).filter(t => t !== 'wall');
      const eneCfg = enemies.map(e => Array.isArray(e) ? e : [e, 1]);
      const results = [];
      for (const type of types) {
        let won = false;
        for (let n = 1; n <= maxCount; n++) {
          const defenders = [];
          for (let i = 0; i < n; i++) {
            const c = col + (i % 3) - 1;
            const r = rows[Math.floor(i / 3) % rows.length];
            defenders.push([type, c, r]);
          }
          const r = await window.TEST.battle({ label: `minCost_${type}×${n}`, defenders, enemies: eneCfg, speed, timeout });
          if (r.verdict === 'WIN') {
            results.push({ type, count: n, cost: n * (CFG.COSTS[type] || 0), killEff: r.killEfficiency });
            won = true;
            break;
          }
          await _testWait(400);
        }
        if (!won) results.push({ type, count: null, cost: Infinity, killEff: 0 });
      }
      results.sort((a, b) => a.cost - b.cost);
      console.table(results);
      fetch('/test-result', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(results),
      }).catch(() => {});
      return results;
    },

    /**
     * Compare how many of each defender type you can afford for a fixed gold budget.
     * Useful for "I have 100g, what's the best single-type buy?"
     * Example:
     *   await TEST.compareSameGold(100, [['grunt',10],['brute',4]]);
     */
    compareSameGold: async (budget, enemies, opts = {}) => {
      const { speed = 2, timeout = 25, col = 40, defTypes } = opts;
      const types = defTypes || ['tower', 'archer', 'swordsman', 'knight', 'spearman', 'catapult'];
      const eneCfg = enemies.map(e => Array.isArray(e) ? e : [e, 1]);
      const scenarios = [];
      for (const type of types) {
        const cost = CFG.COSTS[type] || 1;
        const count = Math.floor(budget / cost);
        if (count === 0) continue;
        const defenders = [];
        for (let i = 0; i < count; i++) {
          const c = col + (i % 5) - 2;
          const r = i < Math.ceil(count / 2) ? 26 : 28;
          defenders.push([type, c, r]);
        }
        scenarios.push({
          label: `${count}×${type}(${count * cost}g)`,
          defenders,
          enemies: eneCfg,
        });
      }
      return window.TEST.compare(scenarios, { speed, timeout });
    },

    /**
     * Automatically find the best defender configuration for the given enemies
     * within a gold budget. Three phases:
     *   1. Screen every defender type (max count) at a fixed column.
     *   2. Column-sweep the top 3 performers (cols 33/38/43/48).
     *   3. Test 2-type mixes using each pair of top 3 at their best columns.
     *
     * enemies: [[type, count], ...]  OR  'wave5' (resolved via buildSpawnQueue)
     * opts: { budget=200, speed=3, timeout=18, col=40, testCols }
     * Returns: { best, top10, rankings }
     *
     * Example:
     *   await TEST.optimize([['grunt',8],['brute',4]], { budget:200, speed:3 });
     *   await TEST.optimize('wave8', { budget:300 });
     */
    optimize: async (enemies, opts = {}) => {
      const { budget = 200, speed = 3, timeout = 18, col = 40,
              testCols = [33, 38, 43, 48] } = opts;
      if (!testMode) enterTestMode();

      // Resolve 'waveN' shorthand to enemy config
      let eneCfg;
      if (typeof enemies === 'string' && enemies.startsWith('wave')) {
        const wn = parseInt(enemies.slice(4));
        const q = buildSpawnQueue(wn);
        const cnts = {};
        for (const t of q) { if (t !== 'pause') cnts[t] = (cnts[t] || 0) + 1; }
        eneCfg = Object.entries(cnts).map(([t, n]) => [t, n]);
        console.log(`[OPTIMIZE] wave${wn}:`, Object.fromEntries(eneCfg));
      } else {
        eneCfg = enemies.map(e => Array.isArray(e) ? e : [e, 1]);
      }

      const DEF_TYPES = Object.keys(CFG.COSTS).filter(t => t !== 'wall' && (CFG.COSTS[t] || 0) > 0);
      const all = [];

      // ── Phase 1: single-type screening ────────────────────────────────────
      console.log(`[OPTIMIZE] Phase 1 — screening ${DEF_TYPES.length} types at col ${col}`);
      const phase1 = [];
      for (const type of DEF_TYPES) {
        const cost = CFG.COSTS[type];
        const count = Math.floor(budget / cost);
        if (count === 0) continue;
        const defenders = _buildFormation(type, count, col);
        const r = await window.TEST.battle({ label: `${type}×${count}@${col}`, defenders, enemies: eneCfg, speed, timeout });
        const entry = { phase: 1, type, count, col, cost: count * cost, ...r };
        phase1.push(entry); all.push(entry);
        console.log(`  ${type}×${count}: ${r.verdict}  escaped:${r.escaped}  hp:${r.hpPct}%`);
        await _testWait(350);
      }
      phase1.sort(_cmpOutcome);

      // ── Phase 2: column sweep for top 3 types ─────────────────────────────
      const top3Types = [...new Set(phase1.slice(0, 3).map(e => e.type))];
      console.log(`[OPTIMIZE] Phase 2 — column sweep: [${top3Types.join(', ')}] @ cols ${testCols.join(',')}`);
      const bestColPerType = {};
      for (const type of top3Types) {
        const cost = CFG.COSTS[type];
        const count = Math.floor(budget / cost);
        let bestEntry = null;
        for (const c of testCols) {
          const defenders = _buildFormation(type, count, c);
          const r = await window.TEST.battle({ label: `${type}×${count}@${c}`, defenders, enemies: eneCfg, speed, timeout });
          const entry = { phase: 2, type, count, col: c, cost: count * cost, ...r };
          all.push(entry);
          if (!bestEntry || _cmpOutcome(entry, bestEntry) < 0) bestEntry = entry;
          await _testWait(350);
        }
        bestColPerType[type] = bestEntry;
        console.log(`  ${type} best col: ${bestEntry.col} → ${bestEntry.verdict}`);
      }

      // ── Phase 3: 2-type mixes at best columns ─────────────────────────────
      console.log('[OPTIMIZE] Phase 3 — 2-type mixes');
      for (let i = 0; i < top3Types.length; i++) {
        for (let j = i + 1; j < top3Types.length; j++) {
          const tA = top3Types[i], tB = top3Types[j];
          const cA = CFG.COSTS[tA], cB = CFG.COSTS[tB];
          const colA = bestColPerType[tA]?.col ?? col;
          const colB = colA <= 40 ? colA + 4 : colA - 4;
          const budgetA = Math.round(budget * 0.55);
          const countA = Math.floor(budgetA / cA); if (countA === 0) continue;
          const countB = Math.floor((budget - countA * cA) / cB); if (countB === 0) continue;
          const defenders = [
            ..._buildFormation(tA, countA, colA),
            ..._buildFormation(tB, countB, colB),
          ];
          const lbl = `${tA}×${countA}+${tB}×${countB}`;
          const r = await window.TEST.battle({ label: lbl, defenders, enemies: eneCfg, speed, timeout });
          const entry = { phase: 3, type: lbl, count: countA + countB,
                          col: colA, cost: countA * cA + countB * cB, ...r };
          all.push(entry);
          console.log(`  ${lbl}: ${r.verdict}  escaped:${r.escaped}  hp:${r.hpPct}%`);
          await _testWait(350);
        }
      }

      all.sort(_cmpOutcome);
      const best = all[0];

      console.log('\n[OPTIMIZE] ══ FINAL RANKINGS ══');
      console.table(all.slice(0, 12).map(r => ({
        config:   r.label,
        ph:       r.phase,
        verdict:  r.verdict,
        escaped:  r.escaped,
        hp:       r.hpPct + '%',
        defDied:  r.defKilled,
        cost:     r.cost,
        killEff:  r.killEfficiency,
      })));
      console.log(`[OPTIMIZE] WINNER: "${best?.label}"  ${best?.verdict}  escaped:${best?.escaped}  hp:${best?.hpPct}%  cost:${best?.cost}g`);

      const resultObj = {
        best: { config: best?.label, verdict: best?.verdict, escaped: best?.escaped,
                hpPct: best?.hpPct, cost: best?.cost, defenders: best?.breakdown?.defenders?.placed ?? [] },
        top10: all.slice(0, 10).map(r => ({
          config: r.label, phase: r.phase, verdict: r.verdict,
          escaped: r.escaped, hpPct: r.hpPct, cost: r.cost, killEff: r.killEfficiency,
        })),
        budget, total_battles: all.length,
      };
      fetch('/test-result', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resultObj) }).catch(() => {});
      return { best, rankings: all };
    },

    /**
     * Convenience wrapper: optimize against a real game wave composition.
     * Example:  await TEST.optimizeWave(8, { budget:300, speed:3 });
     */
    optimizeWave: async (waveNum, opts = {}) => {
      return window.TEST.optimize(`wave${waveNum}`, opts);
    },

    /**
     * Toggle (or set) castle scene mode — shows full path to real castle with live HP bar.
     * enable: true=on, false=off, omit=toggle
     * Example:
     *   await TEST.castleScene(true);
     *   await TEST.battle({ defenders:[['tower',35,26]], enemies:[['grunt',10]], timeout:40 });
     */
    castleScene: (enable = null) => {
      if (!testMode) enterTestMode();
      const want = enable === null ? !castleSceneActive : Boolean(enable);
      if (want === castleSceneActive) return;
      castleSceneActive = want;
      const btn = document.getElementById('test-castle-scene');
      if (btn) btn.classList.toggle('active', castleSceneActive);
      const header = document.getElementById('test-header');
      if (header) header.textContent = castleSceneActive ? '🏰 Test Arena (Castle Scene)' : '🧪 Test Arena';
      clearField();
      _buildArena(castleSceneActive);
      if (castleSceneActive) {
        controls.target.set(38, 2, ARENA.pathRow);
        camera.position.set(38, 36, 74);
        showTooltip('Castle Scene — enemies walk full path to the castle (HP tracked)', 2500);
      } else {
        controls.target.set(33, 0, ARENA.pathRow);
        camera.position.set(33, 26, 52);
      }
      controls.update();
    },

    /** Print help */
    help:   () => console.log([
      'window.TEST API:',
      '  TEST.run(code)               — run async script string',
      '  TEST.stop()                  — abort running script',
      '  TEST.spawn(type, n)          — spawn n enemies on path',
      '  TEST.enemy(type, c, r)       — place enemy at tile (col, row)',
      '  TEST.place(type, c, r)       — place defender at tile (use row 26/28)',
      '  TEST.clear()                 — remove all units',
      '  TEST.speed(n)                — set game speed',
      '  TEST.enter() / .exit()       — toggle test mode',
      '  TEST.stats()                 — snapshot of current battle stats',
      '',
      '  TEST.battle(config)          — run one named battle, returns result',
      '    config: { label, defenders:[[type,col,row],...], enemies:[[type,n],...],',
      '             speed, timeout, clearFirst }',
      '    result: { verdict, killed, escaped, defKilled, hpLost, hpPct,',
      '              castleDmgDealt, costTotal, killEfficiency, killsByType,',
      '              defStats:[{type,kills,hpPct,hpRemaining},...],',
      '              goldEarned, firstKillAt, lastKillAt, duration }',
      '',
      '  TEST.battleN(config, n=3)    — run N times, return averaged stats',
      '    result: { wins, partials, losses, avgKilled, stdKilled, avgEscaped, stdEscaped,',
      '              avgHpLost, stdHpLost, avgHpPct, avgCastleDmg, stdCastleDmg,',
      '              avgGold, avgDuration, costTotal, killEfficiency, runs:[] }',
      '',
      '  TEST.compare(scenarios, opts) — run list of battles, console.table',
      '    opts: { speed, timeout, pauseBetween }',
      '',
      '  TEST.sweep(defSets, eneSets, opts) — run NxM matchup matrix',
      '    defSets: [[label, [[type,col,row],...]], ...]',
      '    eneSets: [[label, [[type,count],...]], ...]',
      '    opts: { speed, timeout, n }  — n>1 averages each cell',
      '',
      '  TEST.lanes(n)                — set 1/2/3 active lanes; enemies distribute round-robin',
      '',
      '  TEST.wave(waveNum, opts)     — simulate a real game wave (uses buildSpawnQueue)',
      '    opts: { defenders, speed, timeout, label }',
      '    tip: call TEST.lanes(3) first to match the real 3-road game layout',
      '',
      '  TEST.multiWave(defCfg, waveNums, opts) — consecutive waves, defenders persist',
      '    waveNums: [1,2,3,...], opts: { speed, timeout }',
      '',
      '  TEST.findWeakness(defCfg, enemyTypes, opts) — find which enemies slip through',
      '    opts: { speed, timeout, count }  — returns { results, weaknesses }',
      '',
      '  TEST.placementSweep(defType, enemies, cols, row, opts) — optimal column search',
      '    cols: array of column numbers (or a count for auto-spacing)',
      '',
      '  TEST.minCost(enemies, defTypes, opts) — min cost single-type config to WIN',
      '    opts: { speed, timeout, maxCount, col, rows }',
      '',
      '  TEST.compareSameGold(budget, enemies, opts) — compare types at same gold budget',
      '    opts: { speed, timeout, col, defTypes }',
      '',
      '  TEST.optimize(enemies, opts)   — auto-find best unit combo within gold budget',
      '    enemies: [[type,count],...] or "wave8"',
      '    opts: { budget=200, speed=3, timeout=18, col=40, testCols=[33,38,43,48] }',
      '    → 3 phases: single-type screen → column sweep (top 3) → 2-type mix',
      '    result: { best:{config,verdict,escaped,hpPct,cost}, top10:[], rankings:[] }',
      '',
      '  TEST.optimizeWave(waveNum, opts)  — shorthand: optimize vs buildSpawnQueue(n)',
      '',
      '  TEST.castleScene(enable?)  — toggle/set castle scene mode',
      '    true = open right wall, camera pulls back to show castle, castle HP enabled',
      '    false = arena mode (default), true = castle mode, omit = toggle',
      '',
      '  result.damageByType — damage dealt to each enemy type (for weakness analysis)',
      '',
      '  From terminal (while dev server running):',
      "  curl -s -X POST http://localhost:5173/test-run \\",
      "    -H 'Content-Type: application/json' \\",
      "    --data-raw '{\"script\":\"...\"}' && curl -s http://localhost:5173/test-result",
      '',
      '  GET /test-history  — array of last 50 battle results (persists across runs)',
    ].join('\n')),

    /**
     * Set difficulty level — scales enemy HP and speed for subsequent spawns.
     * level: 'easy' | 'normal' | 'hard'
     * Easy:   HP×0.7  spd×0.85
     * Normal: HP×1.0  spd×1.0  (default)
     * Hard:   HP×1.4  spd×1.2
     */
    setDiff: (level) => {
      const d = _DIFF_PRESETS[level];
      if (!d) { console.warn('TEST.setDiff: use easy | normal | hard'); return; }
      difficultyMult.hp    = d.hp;
      difficultyMult.speed = d.speed;
      document.querySelectorAll('.test-diff-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.diff === level));
      showTooltip(`Difficulty: ${level} (HP×${d.hp} spd×${d.speed})`, 1800);
    },

    /**
     * Run the 12-wave balance check against the current field layout.
     * Equivalent to clicking ▶ Run Waves 1–12 in the panel.
     */
    balance: () => _runBalanceCheck(),
  };

  // ── Enter / Exit ───────────────────────────
  function clearField() {
    for (const o of orcs) { scene.remove(o.group); disposeGroup(o.group); }
    orcs.length = 0;
    for (const d of defenders) {
      scene.remove(d.group); disposeGroup(d.group);
      if (d._rallyMarker) { scene.remove(d._rallyMarker); d._rallyMarker = null; }
    }
    defenders.length = 0;
    _rallyTargeting = false;
    _wallCache.length = 0;
    occupied.clear();
    for (const p of projectiles) { scene.remove(p.mesh); if (p.mesh?.geometry) p.mesh.geometry.dispose(); }
    projectiles.length = 0;
    hideInspector();
    // In castle scene mode, restore castle HP to full so each battle starts fresh
    if (castleSceneActive) { castleHp = CFG.CASTLE_MAX_HP; updateCastleHPBar(); updateCastleHPMesh(); }
    updateHUD();
  }

  // Game UI elements to hide during test mode
  const gameOnlyEls = [
    document.getElementById('hud'),
    document.getElementById('build-panel'),
    document.getElementById('btn-start'),
    document.getElementById('btn-pause'),
    document.getElementById('btn-speed'),
    document.getElementById('scroll-hint'),
  ];

  /** Dismiss all transient game overlays (wave banner, stars, merchant, last-stand, etc.) */
  function _dismissAllOverlays() {
    document.getElementById('wave-banner').classList.remove('visible');
    document.getElementById('wave-stars').classList.remove('visible');
    const merchantEl = document.getElementById('merchant');
    if (merchantEl.classList.contains('visible')) {
      merchantEl.classList.remove('visible');
      // The merchant disables Start while it is up. Force-closing it here must
      // re-enable the button, or the run soft-locks: enter test mode while the
      // merchant was open and Start stayed dead for the rest of the session.
      if (!gameOver) elBtnStart.disabled = false;
    }
    document.getElementById('game-over').classList.remove('visible');
    elLastStand?.classList.remove('active');
    elLastStandTimer?.classList.remove('active');
    document.getElementById('esc-menu').classList.remove('open');
  }

  /** Flash to black, run fn(), then fade back — makes mode switches feel smooth. */
  const _modeTransEl = document.getElementById('mode-transition');
  let _modeFlashing = false;
  function _modeFlash(fn) {
    if (_modeFlashing) return; // prevent double-trigger during animation
    _modeFlashing = true;
    _modeTransEl.classList.add('fading');
    setTimeout(() => {
      fn();
      // Two rAF so the browser has painted the new scene before fading back in
      requestAnimationFrame(() => requestAnimationFrame(() => {
        _modeTransEl.classList.remove('fading');
        _modeFlashing = false;
      }));
    }, 210);
  }

  function enterTestMode() {
    // Stop the real-game spawner so no enemies spawn on real paths while in test mode
    waveActive = false;
    spawnQueue.length = 0;
    spawnTimer = 0;
    _testSpawnQueue.length = 0;

    // Dismiss any in-flight overlays so they don't show over the test arena
    _dismissAllOverlays();
    lastStandActive = false; lastStandTimer = 0;

    // Cancel any pending rAF so we can switch to setTimeout-based loop (works in background tabs)
    if (_gameLoopRafId) { cancelAnimationFrame(_gameLoopRafId); _gameLoopRafId = null; }
    testMode = true;
    _mcTickEnabled = true;
    _scheduleTestTick(); // kick off MessageChannel-driven loop (never throttled in background)
    btnTest.classList.add('active');
    panel.style.display = 'block';

    // Hide game-only UI so nothing overlaps
    gameOnlyEls.forEach(el => { if (el) el.style.display = 'none'; });
    ghostMesh.visible = false;
    selectedTool = null;
    selectedDef = null; _defPanel.style.display = 'none';
    _buildCards.forEach(c => c.classList.remove('selected'));

    savedTestLayoutIdx = activeLayoutIdx >= 0 ? activeLayoutIdx : 0;
    resetGameField();
    _applyTestPath();
    _buildArena(castleSceneActive);

    // Reset castle HP so the bar doesn't look broken
    castleHp = CFG.CASTLE_MAX_HP;
    updateCastleHPBar(); updateCastleHPMesh();

    Object.keys(UNLOCK_WAVES).forEach(t => UNLOCKED.add(t));
    updateUnlockUI();

    // Snap camera to arena or castle view
    if (castleSceneActive) {
      controls.target.set(38, 2, ARENA.pathRow);
      camera.position.set(38, 36, 74);
    } else {
      controls.target.set(33, 0, ARENA.pathRow);
      camera.position.set(33, 26, 52);
    }
    controls.update();

    speedSlider.value = 1;
    speedValEl.textContent = '1×';
    gameSpeed = 1;
    document.querySelectorAll('.test-speed-preset').forEach(b => b.classList.toggle('active', b.dataset.v === '1'));
    document.querySelectorAll('.test-lane-btn').forEach(b => b.classList.toggle('active', b.dataset.lanes === '1'));

    showTooltip('Test Arena — place defenders (right) then spawn enemies (left)', 3000);
  }

  function exitTestMode() {
    // Clear any pending timed spawns from test panel
    _testSpawnQueue.length = 0;
    waveActive = false;
    spawnQueue.length = 0;

    // Dropping out of test mode means we are NOT resuming an interrupted level —
    // clear currentLevel so Retry/Resume don't reference a stale campaign run.
    currentLevel = null;
    if (_levelCompleteTimer) { clearTimeout(_levelCompleteTimer); _levelCompleteTimer = null; }

    // Dismiss any overlays that may have appeared during test
    _dismissAllOverlays();

    testMode = false;
    _mcTickEnabled = false; // stop MessageChannel ticker
    _gameLoopRafId = requestAnimationFrame(gameLoop); // restart rAF chain
    // Test-arena speeds (0×–8× via slider/presets/TEST.battle) must not leak into
    // the normal game, which only knows 0/1/2 — reset to 1× and sync the buttons.
    gameSpeed = 1;
    if (elBtnPause) elBtnPause.textContent = '⏸ Pause';
    if (elBtnSpeed) elBtnSpeed.textContent = '⏩ 2×';
    castleSceneActive = false;
    _arenaLanes = 1;
    _arenaLanePaths = [];
    _laneRR = 0;
    btnTest.classList.remove('active');
    panel.style.display = 'none';
    deselEnemyTool();
    deselDefTool();
    hideInspector();

    // Restore game UI
    gameOnlyEls.forEach(el => { if (el) el.style.display = ''; });
    ghostMesh.visible = false;

    _removeArena();
    clearField();

    // Restore castle HP
    castleHp = CFG.CASTLE_MAX_HP;
    updateCastleHPBar(); updateCastleHPMesh();

    applyLayout(savedTestLayoutIdx);

    // Restore UNLOCKED to baseline + whatever the player had earned by current wave
    // (enterTestMode force-unlocks everything for sandbox; we must undo that here)
    UNLOCKED.clear();
    UNLOCKED.add('wall'); UNLOCKED.add('tower'); UNLOCKED.add('swordsman');
    for (const [tool, unlockWave] of Object.entries(UNLOCK_WAVES)) {
      if (wave >= unlockWave) UNLOCKED.add(tool);
    }
    updateUnlockUI();

    // Restore default camera
    controls.target.set(32, 0, 27);
    camera.position.set(32, 38, 68);
    controls.update();

    showTooltip('Returned to normal game', 1500);
  }

  document.getElementById('test-castle-scene').addEventListener('click', () => window.TEST.castleScene());

  btnTest.addEventListener('click', () => {
    if (testMode) _modeFlash(exitTestMode);
    else          _modeFlash(enterTestMode);
  });
  document.getElementById('test-exit').addEventListener('click', () => _modeFlash(exitTestMode));
  document.getElementById('test-clear').addEventListener('click', () => { clearField(); _bsReset(); showTooltip('Field cleared!', 1000); });

  /**
   * Public mode switcher — called from ESC menu handlers (outside this IIFE).
   * target: 'test' | 'studio' | 'map' | 'game'
   * Switches use flash when test mode is involved; others switch immediately.
   */
  window._switchToMode = function(target) {
    const isTest   = target === 'test';
    const isStudio = target === 'studio';
    const isMap    = target === 'map';
    // Use flash transition whenever test mode is entering or leaving
    const needsFlash = testMode || isTest;
    const doSwitch = () => {
      if (testMode)        exitTestMode();
      else if (studioMode) exitStudio();
      else if (mapEditorMode) exitMapEditorMode();
      if (isTest)   enterTestMode();
      else if (isStudio) enterStudio();
      else if (isMap)    enterMapEditorMode();
      // 'game' = just exit current mode (already done above)
    };
    if (needsFlash) _modeFlash(doSwitch);
    else            doSwitch();
  };
})();

// ── Terminal API: listen for scripts pushed from /test-run endpoint (dev only) ──
if (import.meta.env.DEV) {
  const _sse = new EventSource('/test-events');
  _sse.onmessage = (e) => {
    try {
      const { script, enter = true, _force } = JSON.parse(e.data);
      if (script) {
        // _force=true bypasses _scriptRunning so reload/stop/kill commands always work
        if (_force) { eval(script); return; } // eslint-disable-line no-eval
        // Auto-kill any stuck script before running a new one from the terminal
        window.TEST?.kill();
        if (enter && !testMode) document.getElementById('btn-test')?.click();
        window.TEST?.run(script);
      }
    } catch {}
  };
  _sse.onerror = () => {}; // silently ignore if plugin not loaded
}


const elBtnSpeed = document.getElementById('btn-speed');
const elBtnPause = document.getElementById('btn-pause');

elBtnPause.addEventListener('click', () => {
  if (_escMenu.classList.contains('open')) return;
  if (gameSpeed === 0) { gameSpeed = 1; elBtnPause.textContent = '⏸ Pause'; }
  else                 { gameSpeed = 0; elBtnPause.textContent = '▶ Play'; }
});

// ── ESC MENU ──
const _escMenu   = document.getElementById('esc-menu');
const _elBtnMenu = document.getElementById('btn-menu');
let _speedBeforePause = 1;
function _openEscMenu() {
  _speedBeforePause = gameSpeed;
  _escMenu.classList.add('open');
  _elBtnMenu.classList.add('active');
  // Only pause the game in normal game mode; special modes handle their own speed
  if (!testMode && !studioMode && !mapEditorMode) {
    gameSpeed = 0;
    elBtnPause.textContent = '▶ Play';
  }
  const cur = testMode ? 'test' : studioMode ? 'studio' : mapEditorMode ? 'map' : '';
  const inSpecialMode = cur !== '';
  // Highlight whichever mode is currently active
  document.querySelectorAll('.esc-btn[data-mode]').forEach(b =>
    b.classList.toggle('mode-active', b.dataset.mode === cur && inSpecialMode));
  // Resume label reflects context
  const resumeEl = document.getElementById('esc-resume');
  if (resumeEl) resumeEl.textContent = cur === 'test'   ? '▶ Resume Test Arena' :
                                        cur === 'studio' ? '▶ Resume Studio' :
                                        cur === 'map'    ? '▶ Resume Map Editor' : '▶ Resume';
  // "Return to Game" only shown in special modes; game settings hidden in special modes
  document.getElementById('esc-return-game').style.display = inSpecialMode ? '' : 'none';
  document.getElementById('esc-game-settings').style.display = inSpecialMode ? 'none' : '';
}
function _closeEscMenu() {
  _escMenu.classList.remove('open');
  _elBtnMenu.classList.remove('active');
  if (!testMode && !studioMode && !mapEditorMode) {
    gameSpeed = _speedBeforePause;
    elBtnPause.textContent = _speedBeforePause === 0 ? '▶ Play' : '⏸ Pause';
    elBtnSpeed.textContent = _speedBeforePause === 2 ? '1× Normal' : '⏩ 2×';
  }
}
function _toggleEscMenu() { _escMenu.classList.contains('open') ? _closeEscMenu() : _openEscMenu(); }

_elBtnMenu.addEventListener('click', _toggleEscMenu);
_escMenu.addEventListener('click', (e) => { if (e.target === _escMenu) _closeEscMenu(); });

document.getElementById('esc-resume').addEventListener('click', _closeEscMenu);

document.getElementById('esc-return-game').addEventListener('click', () => {
  _closeEscMenu();
  window._switchToMode('game');
});

document.getElementById('esc-level-select')?.addEventListener('click', () => {
  _closeEscMenu();
  // If we're in a special mode (studio/map/test), return to game first
  if (studioMode || mapEditorMode || testMode) window._switchToMode('game');
  // Show with Close option — the run is preserved until the player picks a new level
  const hasActiveRun = currentLevel || waveActive || (wave > 0 && !gameOver);
  showLevelSelect({ showClose: !!hasActiveRun });
});

// Mode buttons: clicking enters that mode from any context; clicking again (when already active) returns to game
document.getElementById('esc-builder').addEventListener('click', () => {
  _closeEscMenu();
  window._switchToMode(studioMode ? 'game' : 'studio');
});

document.getElementById('esc-me-fullpanel').addEventListener('click', () => {
  _closeEscMenu();
  window._switchToMode(mapEditorMode ? 'game' : 'map');
});

document.getElementById('esc-test').addEventListener('click', () => {
  _closeEscMenu();
  window._switchToMode(testMode ? 'game' : 'test');
});

// ── DIFFICULTY MODE ───────────────────────────────────────────────────
// Routes through the SAME path as the level-select pill (currentDifficulty +
// applyDifficulty + saveDifficulty). The old handler set stale hardcoded
// multipliers directly, skipped rewardMult/persistence/HUD, and desynced the
// difficulty that records (best times, endless bests) are keyed under.
document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const d = btn.dataset.diff;
    if (!DIFFICULTY_PRESETS[d]) return;
    currentDifficulty = d;
    applyDifficulty();
    saveDifficulty();
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.toggle('active', b.dataset.diff === d));
    const p = DIFFICULTY_PRESETS[d];
    showTooltip(`${p.icon} ${p.label} mode — applies to newly spawned enemies`, 2000);
    _closeEscMenu();
  });
});
// Keep the esc-menu buttons in sync with the persisted difficulty at load
document.querySelectorAll('.diff-btn').forEach(b => b.classList.toggle('active', b.dataset.diff === currentDifficulty));

// ── SETTINGS (volume sliders) ─────────────────────────────────────────
(function _initSettings() {
  // Guard JSON.parse — corrupted save must not break the sliders & SFX wiring.
  let saved = {};
  try {
    const raw = localStorage.getItem('td_settings');
    if (raw) saved = JSON.parse(raw) || {};
  } catch (err) {
    console.warn('td_settings corrupted, using defaults:', err);
  }
  const sfxDef   = saved.sfx   != null ? saved.sfx   : 32;
  const musicDef = saved.music > 0     ? saved.music : 40;
  let sfxMuted   = !!saved.sfxMuted;
  let musicMuted = !!saved.musicMuted;

  const sfxSlider   = document.getElementById('sfx-slider');
  const musicSlider = document.getElementById('music-slider');
  const sfxValEl    = document.getElementById('sfx-val');
  const musicValEl  = document.getElementById('music-val');
  const sfxMuteBtn   = document.getElementById('sfx-mute');
  const musicMuteBtn = document.getElementById('music-mute');

  sfxSlider.value   = sfxDef;
  musicSlider.value = musicDef;
  sfxValEl.textContent   = sfxDef;
  musicValEl.textContent = musicDef;

  function _save() {
    saveSave('td_settings', {
      sfx:   +sfxSlider.value,
      music: +musicSlider.value,
      sfxMuted, musicMuted,
      bloom: bloomEnabled,
    });
  }

  // Mute is a layer on top of the sliders: the slider keeps its value, mute
  // just gates the output, so unmuting restores the exact previous volume.
  function _applyVolumes() {
    SND.setSfxVol(sfxMuted ? 0 : sfxSlider.value / 100);
    SND.setMusicVol(musicMuted ? 0 : musicSlider.value / 100);
    if (sfxMuteBtn) {
      sfxMuteBtn.textContent = sfxMuted ? '🔇' : '🔊';
      sfxMuteBtn.classList.toggle('muted', sfxMuted);
    }
    if (musicMuteBtn) {
      musicMuteBtn.textContent = musicMuted ? '🔇' : '🎵';
      musicMuteBtn.classList.toggle('muted', musicMuted);
    }
  }
  _applyVolumes();

  sfxSlider.addEventListener('input', () => {
    sfxValEl.textContent = sfxSlider.value;
    if (+sfxSlider.value > 0) sfxMuted = false; // dragging the slider implies "I want sound"
    _applyVolumes();
    _save();
  });
  musicSlider.addEventListener('input', () => {
    musicValEl.textContent = musicSlider.value;
    if (+musicSlider.value > 0) musicMuted = false;
    _applyVolumes();
    _save();
  });
  sfxMuteBtn?.addEventListener('click', () => { sfxMuted = !sfxMuted; _applyVolumes(); _save(); });
  musicMuteBtn?.addEventListener('click', () => { musicMuted = !musicMuted; _applyVolumes(); _save(); });

  // ── Glow FX (bloom) toggle — module-scoped bloomEnabled drives the render path ──
  const bloomBtn = document.getElementById('bloom-toggle');
  const bloomVal = document.getElementById('bloom-val');
  bloomEnabled = saved.bloom !== false; // default ON
  function _applyBloomUI() {
    if (bloomVal) bloomVal.textContent = bloomEnabled ? 'On' : 'Off';
    bloomBtn?.classList.toggle('muted', !bloomEnabled);
  }
  _applyBloomUI();
  bloomBtn?.addEventListener('click', () => {
    bloomEnabled = !bloomEnabled;
    _applyBloomUI();
    _save();
  });

  // Global mute hotkey: M toggles everything at once. Exposed for the keydown
  // handler (which lives outside this closure and filters out typing contexts).
  window._toggleGlobalMute = () => {
    const anyOn = !sfxMuted || !musicMuted;
    sfxMuted = musicMuted = anyOn; // if anything is audible → mute all; else unmute all
    _applyVolumes();
    _save();
    showTooltip(anyOn ? '🔇 Muted — press M to unmute' : '🔊 Sound on', 1600);
  };

  // Start music / unlock AudioContext on first user interaction
  // Uses a repeating listener until the context is confirmed running (handles the case
  // where the context was created in a non-gesture context and needs a real click to resume)
  function _unlockAudio() {
    SND.startMusic();
    // Keep listening until the AudioContext is actually running
    if (!SND.isRunning()) return;
    document.removeEventListener('click', _unlockAudio, { capture: true });
  }
  document.addEventListener('click', _unlockAudio, { capture: true });
})();

elBtnSpeed.addEventListener('click', () => {
  if (_escMenu.classList.contains('open')) return;
  if (gameSpeed !== 0) gameSpeed = gameSpeed === 1 ? 2 : 1;
  elBtnSpeed.textContent = gameSpeed === 2 ? '1× Normal' : '⏩ 2×';
});

elBtnStart.addEventListener('click', () => {
  if (waveActive || gameOver || testMode) return;
  wave++;
  // Feature 9: rage scaling after wave 10 — capped at 2.0×
  if (wave > 10) {
    rageMultiplier = Math.min(2.0, 1.0 + (wave - 10) * 0.05);
    setTimeout(() => {
      if (waveActive) showTooltip(`⚡ RAGE ×${rageMultiplier.toFixed(2)} — Enemies are ${Math.round((rageMultiplier - 1) * 100)}% stronger & faster!`, 3500);
    }, 1200);
  }
  // Inside a level, the layout + biome are fixed (set in startLevel). Only rotate
  // when playing endless/no-level mode, so level themes don't get overwritten.
  // layoutChanged/biomeChanged stay false in level mode — they're read again at the
  // bottom of startWave for the banner tooltip (referencing them there used to throw:
  // they were block-scoped to this if, killing the tail of every wave start).
  const inLevelNonEndless = currentLevel && currentLevel.id !== 'endless';
  let layoutIdx = activeLayoutIdx, biomeIdx = activeBiomeIdx;
  let layoutChanged = false, biomeChanged = false;
  if (!inLevelNonEndless) {
    // Waves 1-3: Blitz (short paths, fast action). Wave 4+: cycle through longer layouts.
    layoutIdx = wave <= 3 ? 0 : 1 + Math.floor((wave - 4) / 3) % (LAYOUT_WAYPOINTS.length - 1);
    biomeIdx  = Math.floor((wave - 1) / 3) % BIOMES.length;
    layoutChanged = layoutIdx !== activeLayoutIdx;
    biomeChanged  = biomeIdx  !== activeBiomeIdx;
    const hasEditorPaths = _mePaths.some(p => p.length > 0);
    if (layoutChanged && !hasEditorPaths) {
      applyLayout(layoutIdx);
      const _songMap = {'Blitz':'blitz','Classic Winding':'classic','Wide Sweeps':'wide','Comb':'comb','Switchback':'switchback'};
      SND.setSong(_songMap[LAYOUT_WAYPOINTS[layoutIdx].name] || 'blitz');
    }
    if (biomeChanged)  applyBiome(biomeIdx);
  } else {
    // In a story level — keep the level's own theme (set in startLevel); don't let the
    // layout-derived song override it. setSong is idempotent so this is a cheap no-op.
    SND.setSong(LEVEL_SONGS[currentLevel.id] || 'classic');
  }
  spawnQueue = buildSpawnQueue(wave);
  // Feature 5: siege wave — add 40% more enemies
  const isSiegeWave = wave % 5 === 0;
  if (isSiegeWave) {
    const realEnemies = spawnQueue.filter(t => t !== 'pause');
    const extra = Math.floor(realEnemies.length * 0.4);
    const shuffledSlice = [...realEnemies].sort(() => Math.random() - 0.5).slice(0, extra);
    spawnQueue = spawnQueue.concat(shuffledSlice);
  }
  // Level end-boss fight: the last wave of each level is restructured as a proper boss fight.
  // ── Intro: the regular wave is trimmed (~50%) so it's a lighter opener, not overwhelming
  //    alongside the boss encounter
  // ── Retinue: 2 elite brutes + 1 elite troll arrive as the boss's royal guard
  // ── Boss: the unique level boss spawns last, behind a dramatic "BOSS FIGHT" banner
  // spawnQueue pops from the end, so items at index 0 spawn last — build the sequence by
  // unshifting in reverse order of appearance.
  if (currentLevel && currentLevel.id !== 'endless'
      && wave === currentLevel.endWave
      && currentLevel.boss) {
    // Trim the regular wave by ~40% (drop items from the SPAWN-FIRST end, i.e. the end of the array)
    const realCount = spawnQueue.filter(t => t !== 'pause').length;
    const keepCount = Math.max(3, Math.ceil(realCount * 0.55));
    // Walk from end (spawn-first) keeping only keepCount real enemies, preserving pause markers
    const trimmed = [];
    let kept = 0;
    for (let i = spawnQueue.length - 1; i >= 0; i--) {
      const tok = spawnQueue[i];
      if (tok === 'pause') { trimmed.unshift(tok); continue; }
      if (kept < keepCount) { trimmed.unshift(tok); kept++; }
    }
    spawnQueue = trimmed;
    // After the intro wave → pause → boss retinue (elite guard) → pause → boss
    // Unshift order is REVERSE of spawn order (pop from end).
    spawnQueue.unshift('pause');           // pause after regular wave
    // 'retinue:*' tokens lock onto the boss's path (chosen when the first retinue member spawns)
    spawnQueue.unshift('retinue:brute');   // retinue #1 (spawns first of the three)
    spawnQueue.unshift('retinue:brute');   // retinue #2
    spawnQueue.unshift('retinue:troll');   // retinue #3 (the big one)
    spawnQueue.unshift('pause');           // dramatic pause before boss
    spawnQueue.unshift('__levelBoss');     // boss spawns last — banner triggers inside spawnLevelBoss
  }
  spawnTimer = 0;
  waveActive = true;
  // Reset per-wave path distribution tracker so balanced selection starts fresh
  _pathSpawnCounts = [0, 0, 0];
  _forcedSpawnPath = null;
  // Re-arm the critical-castle alarm so it can fire once if HP dips below 25% this wave
  _criticalWarned = false;
  // Endless mode: reaching wave 20 unlocks "Eternal Defender"
  if (currentLevel?.id === 'endless' && wave >= 20) _unlockAchievement('endlessWave20');
  waveStartHp   = castleHp;
  waveDefDeaths = 0;
  waveStartTime = Date.now();
  SND.waveStart();
  elBtnStart.disabled = true;
  updateHUD();
  showWaveBanner(wave);
  const biomeSuffix  = biomeChanged  ? ` ⚑ ${BIOMES[biomeIdx].name} biome!`         : '';
  const layoutSuffix = layoutChanged ? ` — Layout: ${LAYOUT_WAYPOINTS[layoutIdx].name}` : '';
  // Delay tooltip until after the wave banner has finished popping in (~350ms)
  setTimeout(() => {
    if (isSiegeWave) {
      const _sc = spawnQueue.filter(t => t !== 'pause').length;
      showTooltip(`⚔️ SIEGE WAVE! 40% more enemies! ${_sc} enemies across 3 roads`, 3000);
    } else {
      const _sc = spawnQueue.filter(t => t !== 'pause').length;
      showTooltip(`Wave ${wave} incoming! ${_sc} enemies across 3 roads${biomeSuffix}${layoutSuffix}`, 3000);
    }
  }, 350);
});

document.getElementById('btn-retry').addEventListener('click', () => {
  SND.btnClick?.();
  if (currentLevel) startLevel(currentLevel.id);
  else window.location.reload();
});
document.getElementById('btn-go-levels')?.addEventListener('click', () => {
  SND.btnClick?.();
  _resetRunState();
  showLevelSelect();
});
document.getElementById('lc-levels')?.addEventListener('click', () => {
  SND.btnClick?.();
  hideLevelComplete();
  showLevelSelect();
});
document.getElementById('lc-replay')?.addEventListener('click', () => {
  SND.btnClick?.();
  hideLevelComplete();
  if (currentLevel) startLevel(currentLevel.id);
});
document.getElementById('lc-next')?.addEventListener('click', (e) => {
  SND.btnClick?.();
  const raw = e.currentTarget.dataset.nextId;
  if (!raw) return;
  hideLevelComplete();
  const nextId = raw === 'endless' ? 'endless' : parseInt(raw, 10);
  startLevel(nextId);
});
document.getElementById('ls-close')?.addEventListener('click', () => {
  SND.btnClick?.();
  hideLevelSelect();
  if (gameSpeed === 0) gameSpeed = 1;
});

// Stats screen — close button + click-on-backdrop + ESC
document.getElementById('stats-close')?.addEventListener('click', () => {
  SND.btnClick?.();
  hideStats();
});
document.getElementById('stats-screen')?.addEventListener('click', (e) => {
  // Click outside the box (on the dimmed backdrop) closes the screen
  if (e.target.id === 'stats-screen') hideStats();
});

// Debounced resize — dragging the window edge fires hundreds of events; we only
// need to act once the user stops dragging (or 80ms later, whichever's sooner).
let _resizeRAF = 0;
let _resizeT   = 0;
window.addEventListener('resize', () => {
  if (_resizeT) clearTimeout(_resizeT);
  _resizeT = setTimeout(() => {
    _resizeT = 0;
    if (_resizeRAF) cancelAnimationFrame(_resizeRAF);
    _resizeRAF = requestAnimationFrame(() => {
      _resizeRAF = 0;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
      bloomPass.setSize(window.innerWidth, window.innerHeight);
    });
  }, 80);
});

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
M.pathMat.map = makeCobbleTex();
M.pathMat.needsUpdate = true;
// Map editor tile textures
M.mePathB.map = makeCobbleTexB(); M.mePathB.color.setHex(0xffffff); M.mePathB.needsUpdate = true;
M.mePathC.map = makeCobbleTexC(); M.mePathC.color.setHex(0xffffff); M.mePathC.needsUpdate = true;
M.meDirt.map  = makeDirtTex();  M.meDirt.color.setHex(0xffffff);  M.meDirt.needsUpdate  = true;
M.meSand.map  = makeSandTex();  M.meSand.color.setHex(0xffffff);  M.meSand.needsUpdate  = true;
M.meLava.map  = makeLavaTex();  M.meLava.color.setHex(0xffffff);  M.meLava.needsUpdate  = true;
buildSky();
applyBiome(0);
initLayout(0);
buildGrid();
buildPathLanterns();
tileMeshesArr = Object.values(grid).map(c => c.mesh);
buildScenery();
castleGroup = buildCastle();
updateHUD();
updateCastleHPMesh();
updateUnlockUI(); // Feature 4: show initial lock overlays
_gameLoopRafId = requestAnimationFrame(gameLoop);

// ── Initial screen: show Level Select unless a special mode was requested via URL ──
loadLevelProgress();
loadAchievements();
loadDifficulty();
{
  const urlParams = new URLSearchParams(window.location.search);
  const skipMenu = urlParams.has('test') || urlParams.has('studio') || urlParams.has('map') || urlParams.has('nomenu') || urlParams.has('headless');
  if (skipMenu) {
    showTooltip('3 roads! Place Walls on roads to block enemies — they\'ll fight through!', 6000);
    // ?studio / ?map / ?test previously only skipped the menu — actually enter the mode
    if      (urlParams.has('studio')) window._switchToMode('studio');
    else if (urlParams.has('map'))    window._switchToMode('map');
    else if (urlParams.has('test'))   window._switchToMode('test');
  } else {
    showLevelSelect();
  }
}
