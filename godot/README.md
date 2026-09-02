# DefendCastle — Godot 4 port (vertical slice)

Target: **mobile / console export**, which is why this exists — the web build can't reach those.

**Status: vertical slice, not a port.** One level, one enemy path system, one defender,
wave spawning, touch/click placement. Deliberately small, so the architecture can be
judged before committing to the remaining ~20k lines.

## Run

    godot --path godot                       # play it
    godot --headless --path godot --script tests/test_logic.gd     # logic unit tests
    godot --headless --path godot tests/sim_runner.tscn            # integration sim

## What's here

| file | what |
|---|---|
| `scripts/config.gd` | balance tables ported verbatim from `src/main.js` CFG |
| `scripts/waves.gd` | `buildSpawnQueue` port — hand-tuned table + late-wave formula |
| `scripts/voxel.gd` | the art layer: `box()` → `BoxMesh`, materials/meshes cached |
| `scripts/enemy.gd` | path-walking enemy (advances by tile index + progress) |
| `scripts/defender.gd` | tower: range acquisition, cooldown, damage |
| `scenes/main.gd` | level 1 (Blitz), 3 lanes, ground, castle, spawner, placement |
| `tests/` | headless logic + integration tests |

## Why it's built this way

- **Ground is `MultiMesh`, not 3,888 nodes.** Node count is the thing that hurts on
  mobile; the JS build merges its ground for the same reason.
- **Voxel meshes and materials are cached by size/colour.** The JS build learned this
  the hard way (`_particleMatCache`); a fresh material per box is thousands of
  resources instead of dozens. Currently 11 materials / 36 meshes for the whole scene.
- **The spawner holds the QUEUE above `MAX_LIVE_ENEMIES`** rather than dropping
  enemies — same fix as the JS side, so wave content is unchanged but entity count
  stays bounded.
- **Wave totals are asserted against numbers measured from the running JS build**, so
  the two implementations can't silently diverge.

## Not ported yet

The honest remainder, measured from the JS source:

- **714 DOM touchpoints** (`getElementById`, listeners, `innerHTML`, `classList`) →
  all UI must be rebuilt as `Control` nodes. This is the single largest chunk and has
  no mechanical mapping.
- **The Web Audio music engine** (55 audio-node constructions): oscillators scheduled
  by `setTimeout`. Godot's `AudioStreamGenerator` is a different model.
- Map editor, Studio, Test Arena.
- Remaining enemy/defender types, upgrades, endless, saves, achievements.
- ~850 of the 889 voxel builders (mechanical, just volume).

## Caveat

Everything above was verified **headlessly**. Nothing visual has been looked at — no
rendering, no feel. Open it in the editor before trusting the camera framing, scale or
colours.
