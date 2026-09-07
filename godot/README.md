# DefendCastle — Godot 4 port

Target: **mobile / console export**, which is why this exists — the web build can't reach those.

Ported from `../src/main.js` (18,056 lines of three.js) and `../index.html` (3,306 lines of
UI markup, 210 element ids).

## Run

    godot --path godot                                              # play it
    godot --headless --path godot --script tests/test_logic.gd      # logic unit tests   (74 checks)
    godot --headless --path godot tests/sim_runner.tscn             # integration sim  (248 checks)
    godot --path godot --resolution 1600x900 tests/visual_review.tscn -- --quick  # visual review

## Scope

This is the **playable game**: the campaign, every unit, persistence, achievements, stats,
merchant, endless mode, and the interface needed to play it. The three original developer
tools (Studio, Map Editor, Test Arena) remain outside the Godot runtime.

### What is here

| area | state |
|---|---|
| 15 enemy types | all, with their distinct behaviours (see below) |
| 10 defender types | all, plus the 3-level upgrade path and wall→archer→catapult promotion |
| 5 campaign levels | all layouts, biomes, start gold, wave ranges, and level bosses |
| combat | attack slots, wall blocking and line-of-sight, projectiles with travel time, splash, pierce, slow |
| economy | costs, unit-slot cap, upgrades, sell refunds, wave bounties, three difficulties |
| interface | field-journal HUD, illustrated build bar, defender panel, rally points, realm map, archive, merchant, win/lose |
| audio | 49 sound effects + 11 music tracks, **baked from the original JS engine** |
| wave system | the full hand-tuned table (waves 1-12), elites, siege bonuses, rage scaling, cohort pacing, and the boss finale |
| Last Stand | the castle's first fall is survivable: 1 HP, 3x defender damage, 30 seconds to hold |
| persistence | difficulty, level unlocks, star/kill/time records — JSON under `user://`, schema-versioned, and surfaced in the level select |
| presentation | fantasy-diorama terrain shaders, biome palettes, faceted foliage, citadel landmark, tactical rings, responsive framing |

### Files

| file | what |
|---|---|
| `scripts/config.gd` | balance tables, layouts, levels, biomes — ported verbatim from `CFG` |
| `scripts/waves.gd` | `buildSpawnQueue` port — hand-tuned table + late-wave formula |
| `scripts/voxel.gd` | box/material primitives, cached by size and colour |
| `scripts/models.gd` | the voxel model library: every enemy, defender and structure |
| `scripts/enemy.gd` | the enemy state machine — walk / wall / chase / fight / castle |
| `scripts/defender.gd` | emplacements, the walking-soldier state machine, and the spike trap |
| `scripts/projectile.gd` | homing shots, splash, pierce, slow-on-hit |
| `scripts/audio.gd` | pooled playback of the baked audio |
| `scripts/save_data.gd` | durable campaign meta-progress (difficulty, unlocks, records) |
| `scripts/battlefield_art.gd` | pure presentation builders for terrain, strata, foliage and citadel art |
| `scripts/tactical_markers.gd` | selection/range rings and placement feedback |
| `scenes/main.gd` | the game controller: board, economy, wave clock, spatial queries |
| `scenes/ui.gd` | the whole interface, built as Control nodes |
| `scenes/ui_art.gd` | lightweight illustrated icons for units, realms and archive cards |
| `shaders/` | terrain, water, tactical-ring and diorama-stage shaders |
| `tools/bake_audio.sh` | re-bakes the audio from `src/main.js` |

## Why it's built this way

- **Ground is a `MultiMesh`, not 3,888 nodes.** Node count is the thing that hurts on
  mobile; the JS build merges its ground for the same reason.
- **Voxel meshes and materials are cached by size and colour.** The JS build learned this
  the hard way (`_particleMatCache`): a fresh material per box is thousands of resources
  instead of dozens.
- **The spawner holds the QUEUE above `MAX_LIVE_ENEMIES`** rather than dropping enemies —
  same fix as the JS side, so wave content is unchanged but entity count stays bounded.
- **The enemy state machine is ported exactly; the animation is not.** `updateOrcs()` is
  ~1,650 lines, almost all of it per-type limb posing (a wolf rears onto its front paws, a
  skeleton's jaw snaps). The state machine underneath is what the balance depends on, so
  that is faithful, while animation is driven generically off each model's parts.
- **Wave totals and upgrade prices are asserted against numbers measured from the running
  JS build**, so the two implementations can't silently diverge.

## Audio: baked, not reimplemented

The JS sound engine is 1,585 lines of Web Audio — oscillators scheduled by `setTimeout` and
a data-driven chip-tune engine. Godot's `AudioStreamGenerator` is a different model, and
running a software synth per frame is the wrong trade on a phone.

So `tools/bake_audio.sh` slices the **unmodified** `SND` module straight out of
`src/main.js` and runs it against an `OfflineAudioContext`, recording what it produces.
Three shims make that work:

- `currentTime` — offline contexts report 0 until they render, but every helper schedules
  relative to it, so a Proxy reports a virtual clock instead.
- `setTimeout` — offline rendering is instantaneous, so real timers never fire and every
  delayed layer (and the whole music engine, which re-schedules itself tick by tick) would
  be silently dropped. Callbacks are queued against the virtual clock and drained in order.
- `start()` / `stop()` — `src.start()` with no argument means "now", which offline is
  literally t=0. Without defaulting these to the virtual clock, every note of every track
  lands on the same sample: measured peak 57 instead of 0.17.

Because the module itself is untouched, changing a sound in `src/main.js` and re-running the
script updates the Godot build. Levels are set with one gain per group, so the engine's own
relative balance between sounds survives.

## Enemy behaviours ported

grunt · brute · boss · troll (regenerates) · skeleton (phases through walls at 35% speed) ·
wolf · spider · cyclops (melee aura) · enemyArcher (shoots, swings in melee instead) ·
exploder (detonates on death) · healerOrc (heals allies on an interval) · orcMage (ranged +
detonates) · rockTroll (regenerates, throws splash boulders) · plus the five named level
bosses with their ground-slam AoE.

## The fidelity audit

The first pass of this port was written from a selective reading of the JS, and its tests
only pinned waves 1-3. A subsequent audit compared every ported subsystem against the
source line by line. It found a cluster of real divergences, all since fixed and now
covered by tests:

| divergence | what it did |
|---|---|
| Hand-tuned wave table stopped at wave 5 | waves 6-12 fell through to the late-game formula — **wave 6 sent 55 enemies instead of 38**, and introduced cyclops and rock trolls two levels early. Waves 6-12 are entirely inside the campaign, so this was the wrong fight in levels 2, 3 and 4 |
| Late-wave formula coefficients were wrong | wave 30 was 147 enemies instead of 164 |
| **Elite enemies** missing entirely | no 2x-HP, 1.3x-speed, 2x-reward variants on siege waves or from wave 8 |
| **Siege waves** got no +40% bonus | every fifth wave was far too light |
| **Rage scaling** missing | enemies should reach 1.25x speed by wave 15 — all of Dreadworld and The Abyss |
| Spawn interval never tightened | flat 1.15 s/enemy instead of decaying to a 0.50 s floor, so late waves trickled |
| **Boss finale** missing | the JS trims the opener to 55%, then pause -> two elite brutes + one elite troll -> pause -> boss, all locked to one road. The port just spawned the full wave and then a boss |
| Sell refund was 70% | should be 50%; misplacement cost almost nothing |
| Castle no-build zone was 9 whole columns | should be the 6x9 keep footprint — a strip of buildable ground was silently deleted |
| Trees did not block building | scenery tiles are unbuildable in the original |
| Spike traps were road-only | the JS allows them on grass too |
| `find_closest_defender` filter was **inverted** | it skipped spike traps and shot walls; the JS does the opposite, so enemy archers wasted fire on stonework |
| Fighting soldiers re-acquired a target | they must hit the unit they walked to, or `effective_range` (+1.8) and the +1.2 disengage hysteresis are unreachable and the soldier swings at nothing |
| No counter-attacks | enemies did not hit back at what damaged them, and melee defenders did not riposte when struck |
| **Skeleton venom** missing | 0.8 dps for 4 s on non-wall defenders |
| **Orc-mage curse** missing | struck defenders should reload 40% slower for 3 s |
| **Spider webs** missing | a dead spider leaves an 8 s slowing zone |
| **Kill streaks** missing | five kills inside 2 s should start paying bonus gold |
| Ballista pierce chose the nearest body | should be the most head-on target within 15 units |
| Enemy projectile speeds, boss scale, boss slam wind-up, HP/reward rounding | all slightly off |

Two of these deserve singling out. The **inverted target filter** and the
**re-acquiring soldier** were both cases of code that looked right and passed every
existing test while doing the opposite of the original. And the counter-attack pair had a
trap in it: the JS terminates the counter/riposte exchange by *not* propagating the
attacker, and a faithful-looking port that does propagate it recurses until one side dies.

## The audit, round two

The first audit's two largest reviewers — the enemy state machine and whole-port
integration — were killed by a session limit before finishing, so the biggest ported
subsystem had never actually been reviewed. A second pass covered them and found the
worst bugs in the project, including two the whole test suite was blind to:

| divergence | what it did |
|---|---|
| **Spike traps wedged every enemy that touched one** | the trap has 9,999 HP and ignores damage, so an enemy that latched onto it stood there forever. Since the wave-end check waits for an empty field, one trap could hang a wave permanently |
| **Any shot dragged its target off the road** | a hit from a tower, archer, mage or ballista pulled the enemy out of the lane to charge the shooter, from any range and through walls. A single ballista could empty the road and pull the whole wave onto itself |
| Enemy projectiles dereferenced a freed shooter | a hit was lost to a runtime error whenever the shooter died mid-flight |
| Selling a wall left its attackers stuck on it | `sell()` erased the defender but never marked it dead, so a blocked column never re-opened |
| Only towers and catapults were ever hunted | the JS sweeps 6.5 tiles for **any** defender; archers, mages, ballistas and back-line troops were simply walked past |
| No queue-breaking | followers never adopted a leader's target, so they piled up behind a fight instead of fanning out around it |
| Grunt berserk never fired | the flag and its sound were both present; nothing ever set it |
| Enemies waited a full attack period before their first swing | and stood idle while sliding into their spread slot at a wall |
| A dead target sent the enemy back to the road | instead of re-acquiring, so killing one defender teleported the attacker away from the three beside it |
| Trolls regenerated mid-fight | regeneration and the healer aura are walk-only in the original |
| Chasers ignored walls built across the charge | and walked through towers, walls and trees |
| Last Stand was scored as a loss on the expiry frame | the countdown ran before the wave-end check that would have saved the run |

The first two share one root cause, and it is worth naming: **the unit that gets kill
credit is not the unit the enemy should react to.** The JS keeps them apart by calling
`dealDamage()` with no attacker from every projectile path, and gating the turn-and-engage
on the attacker being a melee soldier. Collapsing those two ideas into one `source`
argument produced both bugs at once. `damage_enemy()` now takes `credit` and `provoker`
separately.

There was a trap in the fix, too: the counter-attack and the riposte call each other, and
the JS terminates the exchange by *not* propagating the attacker. A faithful-looking port
that does propagate it recurses until one side dies — which is what a test caught when a
32 HP swordsman came out of a single 1-damage hit on -1 HP.

## The world art layer

The last large block of the source was the art: ~1,770 lines of three.js that draw the
ground, the scenery and the sky. It is now ported into three standalone modules, each a
pure static builder with no scene-tree or autoload dependency:

| file | what it ports |
|---|---|
| `scripts/ground_tex.gd` | `makeGroundTex` and the cobble/dirt/sand/lava makers (js 1085-1705) |
| `scripts/buildings.gd` | the seven medieval buildings and the well (js 2645-3128) |
| `scripts/nature.gd` | hills, rocks, ponds, lanterns, clouds, road kerbs (js 1782-1826, 2018-2138, 2419-2645) |

**The textures had to be rewritten, not translated.** The JS draws into an HTML canvas with
`fillRect`, radial gradients, ellipses and quadratic strokes. Godot has no canvas, so the
blobs, cracks and grass-blade passes are rasterised into an `Image` by hand — a radial blob
is a per-pixel linear falloff composite, a stroke is a distance-to-segment test inside the
segment's bounding box. They render at 256² rather than 512²: per-pixel work in GDScript is
far slower than the browser's canvas, and all fourteen textures for a level now build in
**493 ms**, once, at load.

Two integration decisions worth recording, because both are departures from the JS:

- **The grass is one textured plane, not 3,888 tiles.** A 256px texture repeated on every
  1x1 tile reads as obvious tiling; at one repeat per eight tiles the detail sits at about
  the scale the original has. Road tiles keep their per-tile slab, because cobble is
  small-scale enough that a repeat per tile looks right.
- **Clouds sit beyond the far edge of the board, not over it.** The JS scatters them across
  the whole map, which works because its camera sits lower. At this port's 58-degree
  top-down pitch anything above the playfield projects straight onto it — the first render
  had white slabs covering the road. A cloud that hides what the player is defending is not
  atmosphere, it is an obstruction.

Scenery now also **claims its tile**: ponds, hills, buildings, rocks and trees all mark
themselves unbuildable, matching the JS `cell.type = 'scenery'`. That changed the board
enough to break six tests that had hard-coded a coordinate, so the suite now spirals
outward from an intended tile to find a legal one.

## The deferred tier

The original scope call was "playable core first, the rest layers on later". This is the
rest:

| feature | notes |
|---|---|
| **Endless mode** | a sixth level that never ends, from wave 16 on the Switchback layout. Milestone gold every 5 waves; every 10 also grants a defender slot |
| **The merchant** | all six offers, three drawn between waves — never on a siege wave, never on a level's last wave |
| **Achievements** | all twelve, persisted with level progress, toasted one at a time |
| **Records screen** | per-level stars, best time, most kills, plus the achievement list |
| **Biome atmosphere** | the 160 drifting motes, all seven moods — pollen, dust, snow, embers, ash, void motes, neon |

Two details from the JS worth keeping:

- **The endless slot reward has to RAISE the cap, not bump the base.** `getMaxDefenders`
  clamps to a hard 26, and that clamp already binds from wave 12 — four waves before
  endless starts. The JS bumped `CFG.MAX_DEFENDERS` and the reward silently did nothing
  every ten waves. It is a separate `endless_bonus_slots` term here.
- **Haste and the orc-mage curse multiply into one reload scale**, exactly as the JS
  composes them: `(haste ? 1.3 : 1) * (cursed ? 0.6 : 1)`.

## Verified

251 checks pass — 74 logic, 177 integration. The integration sim instantiates the real game
scene and drives it by hand at a fixed step, so it exercises the whole stack without a
renderer. It covers, among others: every enemy type reaching the castle or dying without
wedging; walls blocking, breaking and reopening the road; a level actually being won; an
undefended castle actually falling; and every cue the game fires having an audio file
behind it. Every campaign wave total is asserted against a number measured from the JS,
and each mechanic recovered by the audit has its own direct assertion.

A note on what that coverage is for. Three separate gaps in this port were code that
existed, compiled, and passed every test while doing nothing or the opposite of the
original: an inverted target filter, a soldier that re-acquired instead of striking, and a
save layer whose records the menu never read. None were visible without either reading the
source side by side or asserting the behaviour directly. The suite now does both.

The look has been checked by rendering — `tests/screenshot.tscn` plays a scripted run and
writes PNGs. That is how the missing build bar, the off-screen anchors and the castle
overhanging the board edge were caught; none of them were visible to the headless tests.

## Camera

The board is 72x54 tiles. Framed whole, a unit is about twenty pixels and a soldier
stepping two tiles to meet an enemy is a barely visible twitch — which reads as "the
units don't move". Zoom is therefore a gameplay feature, not a convenience:

| input | action |
|---|---|
| mouse wheel | zoom toward the cursor, 100%-500% |
| `+` / `-` / `0` | zoom in, out, reset |
| middle-drag, arrow keys | pan (only meaningful above 100%) |
| pinch / two-finger drag | zoom and pan on the mobile target |
| the `-  100%  +` control | same, for touch; click the percentage to reset |

Panning is clamped so the view can never slide off the board, and the clamp shrinks to
zero as you zoom out, so 100% is always exactly the framed view. A new level resets it.

## A note on rallying an archer

The JS lists the archer in `_RALLY_TYPES` and shows it a rally button, but its state
machine is gated to knight/swordsman/spearman and the archer's own branch is pure
animation — so setting an archer's rally point in the original does precisely nothing.
The port reproduced that faithfully, which meant a unit the game invited you to move
refused to move.

This is the one place the port **deliberately diverges**: a rallied archer now marches to
its post. It still never breaks off to chase — it is a stationary shooter, and only the
three melee troops hunt.

## Known gaps

- **The developer tools are not ported** — Studio (the in-game voxel editor), the Map
  Editor, the Test Arena and the TEST automation harness, about 3,700 lines. This was the
  original scope decision: Godot's own editor covers most of what Studio and the Map
  Editor exist to do.

- **Elite enemies reuse the base model** at 1.15x with gold eyes and the amber HP-bar
  backing; the JS also gives them their own body material.
- **`.import` files are gitignored** (a pre-existing choice). A fresh clone therefore needs
  one editor pass — `godot --headless --path godot --editor --quit` — before the audio
  resolves in an export.
