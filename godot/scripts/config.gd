extends Node
## Balance tables, ported verbatim from src/main.js CFG.
## Values are copied EXACTLY — including the rebalance done on the JS side — so the
## two builds stay comparable and the wave/economy tests can assert against numbers
## measured from the original.

const GRID_W := 72
const GRID_H := 54
const CASTLE_MAX_HP := 280
const SPAWN_INTERVAL := 1.15
const MAX_DEFENDERS := 14
const MAX_LIVE_ENEMIES := 200   ## spawner holds above this (see JS updateSpawner)
## The keep's actual footprint. The port previously blocked every column from 63 east,
## which is nine full columns of the board instead of this 6x9 block — it silently
## deleted a strip of buildable ground the original gives the player.
const CASTLE_C0 := 66
const CASTLE_C1 := 71
const CASTLE_R0 := 23
const CASTLE_R1 := 31

static func is_castle_tile(col: int, row: int) -> bool:
    return col >= CASTLE_C0 and col <= CASTLE_C1 and row >= CASTLE_R0 and row <= CASTLE_R1

## Defenders. maxSlots = how many enemies may engage one unit at once;
## unitCost = slots consumed against MAX_DEFENDERS.
const STATS := {
    "tower":     {"range": 6.5, "rate": 1.05, "dmg": 3, "pSpeed": 12, "hp": 35, "maxSlots": 8, "unitCost": 1},
    "catapult":  {"range": 8.5, "rate": 0.4,  "dmg": 8, "pSpeed": 6,  "aoe": 1.9, "hp": 35, "maxSlots": 8, "unitCost": 2},
    "archer":    {"range": 8.0, "rate": 1.9,  "dmg": 3, "pSpeed": 18, "hp": 30, "maxSlots": 4, "unitCost": 1},
    "swordsman": {"range": 2.5, "rate": 2.4,  "dmg": 2, "hp": 32, "maxSlots": 2, "unitCost": 1},
    "knight":    {"range": 1.8, "rate": 1.6,  "dmg": 5, "hp": 65, "maxSlots": 4, "unitCost": 3},
    "spearman":  {"range": 2.8, "rate": 1.1,  "dmg": 5, "hp": 32, "maxSlots": 3, "unitCost": 2},
    "wall":      {"hp": 40, "unitCost": 0},
    "mage":      {"range": 6.5, "rate": 1.05, "dmg": 4, "pSpeed": 9,  "hp": 30, "maxSlots": 8, "unitCost": 1},
    "ballista":  {"range": 10.0, "rate": 0.3, "dmg": 12, "pSpeed": 22, "hp": 30, "maxSlots": 6, "unitCost": 2},
    "spiketrap": {"range": 0.75, "rate": 2.0, "dmg": 1, "hp": 9999, "unitCost": 1},
}

const COSTS := {
    "wall": 14, "tower": 36, "catapult": 62, "swordsman": 22, "knight": 75,
    "spearman": 34, "archer": 55, "mage": 50, "ballista": 80, "spiketrap": 18,
}

## Per-upgrade-level multipliers, applied cumulatively. Verbatim from CFG.UPGRADE_STATS.
const UPGRADE_STATS := {
    "tower":     {"dmg": 1.35, "range": 1.15, "rate": 1.25, "hp": 1.40},
    "catapult":  {"dmg": 1.35, "range": 1.15, "rate": 1.25, "hp": 1.40},
    "archer":    {"dmg": 1.35, "range": 1.15, "rate": 1.25, "hp": 1.40},
    "swordsman": {"dmg": 1.30, "range": 1.10, "rate": 1.20, "hp": 1.35},
    "knight":    {"dmg": 1.30, "range": 1.10, "rate": 1.20, "hp": 1.35},
    "spearman":  {"dmg": 1.30, "range": 1.15, "rate": 1.20, "hp": 1.35},
    "mage":      {"dmg": 1.35, "range": 1.20, "rate": 1.25, "hp": 1.40},
    "ballista":  {"dmg": 1.40, "range": 1.20, "rate": 1.30, "hp": 1.40},
}

## Ranged defenders fire a travelling projectile; the rest swing in melee.
const PROJECTILE_TYPES := {
    "tower": "arrow", "archer": "arrow", "ballista": "bolt",
    "catapult": "rock", "mage": "magic",
}

## Enemies. speed is tiles/sec — a grunt crosses a range-6 bubble in ~3.5s, which is
## what makes low-dps defenders unable to finish anything (see the JS wall-upgrade notes).
##  wallDmg/defDmg/defRate drive the melee attack on blocking structures.
##  shootRange/shootRate/shootDmg mark a ranged enemy; regens/healsNearby/explodesOnDeath
##  are the special behaviours.
const ORC_TYPES := {
    "grunt":       {"speed": 3.4,  "hp": 18, "reward": 7,  "castleDmg": 10, "scale": 0.77, "wallDmg": 4,  "defDmg": 1, "defRate": 1.5},
    "brute":       {"speed": 2.93, "hp": 26, "reward": 20, "castleDmg": 26, "scale": 0.90, "wallDmg": 7,  "defDmg": 3, "defRate": 0.8},
    "boss":        {"speed": 1.85, "hp": 50, "reward": 52, "castleDmg": 48, "scale": 0.65, "wallDmg": 14, "defDmg": 6, "defRate": 0.9},
    "troll":       {"speed": 2.05, "hp": 54, "reward": 44, "castleDmg": 36, "scale": 1.00, "wallDmg": 10, "defDmg": 4, "defRate": 0.7,
                    "regens": true},
    "skeleton":    {"speed": 5.4,  "hp": 14, "reward": 6,  "castleDmg": 12, "scale": 0.70, "wallDmg": 0,  "defDmg": 1, "defRate": 1.6},
    "wolf":        {"speed": 6.1,  "hp": 22, "reward": 14, "castleDmg": 18, "scale": 0.70, "wallDmg": 5,  "defDmg": 2, "defRate": 1.1},
    "spider":      {"speed": 7.6,  "hp": 14, "reward": 10, "castleDmg": 12, "scale": 0.56, "wallDmg": 2,  "defDmg": 1, "defRate": 1.3},
    "cyclops":     {"speed": 2.30, "hp": 70, "reward": 72, "castleDmg": 58, "scale": 0.85, "wallDmg": 18, "defDmg": 5, "defRate": 0.7,
                    "meleeRange": 2.4, "meleeRate": 0.7, "meleeDmg": 4},
    "enemyArcher": {"speed": 2.55, "hp": 11, "reward": 14, "castleDmg": 14, "scale": 0.77, "wallDmg": 2,  "defDmg": 2, "defRate": 0.9,
                    "shootRange": 8.0, "shootRate": 1.2, "shootDmg": 3},
    "exploder":    {"speed": 2.6,  "hp": 14, "reward": 14, "castleDmg": 20, "scale": 0.78, "wallDmg": 6,  "defDmg": 2, "defRate": 0.9,
                    "explodesOnDeath": true, "explodeRadius": 2.7, "explodeDmg": 9},
    "healerOrc":   {"speed": 2.05, "hp": 22, "reward": 22, "castleDmg": 14, "scale": 0.80, "wallDmg": 4,  "defDmg": 1, "defRate": 0.8,
                    "healsNearby": true, "healRadius": 3.4, "healAmount": 5, "healInterval": 1.8},
    "orcMage":     {"speed": 1.75, "hp": 34, "reward": 30, "castleDmg": 22, "scale": 0.85, "wallDmg": 1,  "defDmg": 0, "defRate": 0.5,
                    "shootRange": 9.0, "shootRate": 0.65, "shootDmg": 5,
                    "explodesOnDeath": true, "explodeRadius": 3.0, "explodeDmg": 9},
    "rockTroll":   {"speed": 1.45, "hp": 95, "reward": 80, "castleDmg": 52, "scale": 1.10, "wallDmg": 18, "defDmg": 5, "defRate": 0.5,
                    "regens": true,
                    "shootRange": 7.0, "shootRate": 0.32, "shootDmg": 12, "aoe": 1.3},
}

## hp/speed/reward scaling per difficulty, verbatim from DIFFICULTY_PRESETS.
const DIFFICULTY := {
    "easy":   {"hp": 0.85, "speed": 0.95, "rewardMult": 0.85, "label": "Easy"},
    "normal": {"hp": 1.00, "speed": 1.00, "rewardMult": 1.00, "label": "Normal"},
    "hard":   {"hp": 1.25, "speed": 1.10, "rewardMult": 1.25, "label": "Hard"},
}

## All five campaign layouts, verbatim from LAYOUT_WAYPOINTS. Every lane ends at the
## castle mouth (x=65) so the three roads converge on one defended point.
const LAYOUTS := [
    {"name": "Blitz",
     "a": [[0,10],[20,10],[20,16],[40,16],[40,24],[65,24]],
     "b": [[0,27],[18,27],[18,21],[40,21],[40,27],[65,27]],
     "c": [[0,44],[20,44],[20,38],[40,38],[40,30],[65,30]]},
    {"name": "Classic Winding",
     "a": [[0,7],[12,7],[12,2],[26,2],[26,12],[40,12],[40,3],[54,3],[54,17],[62,17],[62,24],[65,24]],
     "b": [[0,27],[14,27],[14,21],[30,21],[30,28],[46,28],[46,21],[58,21],[58,27],[65,27]],
     "c": [[0,47],[10,47],[10,52],[24,52],[24,41],[38,41],[38,51],[52,51],[52,38],[62,38],[62,30],[65,30]]},
    {"name": "Wide Sweeps",
     "a": [[0,4],[18,4],[18,15],[34,15],[34,4],[50,4],[50,16],[62,16],[62,24],[65,24]],
     "b": [[0,27],[16,27],[16,19],[32,19],[32,29],[50,29],[50,22],[60,22],[60,27],[65,27]],
     "c": [[0,50],[16,50],[16,40],[32,40],[32,51],[50,51],[50,39],[62,39],[62,30],[65,30]]},
    {"name": "Comb",
     "a": [[0,8],[10,8],[10,2],[24,2],[24,12],[38,12],[38,2],[52,2],[52,15],[62,15],[62,24],[65,24]],
     "b": [[0,27],[12,27],[12,20],[26,20],[26,30],[42,30],[42,20],[56,20],[56,27],[65,27]],
     "c": [[0,46],[10,46],[10,52],[26,52],[26,42],[40,42],[40,52],[56,52],[56,38],[62,38],[62,30],[65,30]]},
    {"name": "Switchback",
     "a": [[0,6],[14,6],[14,15],[30,15],[30,5],[46,5],[46,15],[58,15],[58,17],[62,17],[62,24],[65,24]],
     "b": [[0,27],[12,27],[12,21],[30,21],[30,29],[48,29],[48,21],[60,21],[60,27],[65,27]],
     "c": [[0,48],[12,48],[12,38],[30,38],[30,50],[48,50],[48,37],[62,37],[62,30],[65,30]]},
]

## Campaign levels, verbatim from LEVELS. Each spans three waves of the global curve,
## so wave numbers are absolute — level 3 starts at wave 7, not wave 1.
const LEVELS := [
    {"id": 1, "name": "Green Fields",   "biome": 0, "layout": 0, "startWave": 1,  "endWave": 3,  "startGold": 100,
     "boss": {"name": "Gorthak the Warlord", "scale": 1.45, "hpMult": 3.0, "rewardMult": 6, "castleDmgMult": 1.5,
              "bodyColor": "3a0a3a", "eyeColor": "ff0040", "slamRange": 3.0, "slamRate": 0.55, "slamDmg": 6, "aggroRange": 6.5}},
    {"id": 2, "name": "Desert Outpost", "biome": 1, "layout": 1, "startWave": 4,  "endWave": 6,  "startGold": 160,
     "boss": {"name": "Sarathi the Sand Emir", "scale": 1.50, "hpMult": 3.5, "rewardMult": 7, "castleDmgMult": 1.7,
              "bodyColor": "8a5a2a", "eyeColor": "ffaa22", "slamRange": 3.2, "slamRate": 0.60, "slamDmg": 7, "aggroRange": 7.0}},
    {"id": 3, "name": "Frozen Reach",   "biome": 2, "layout": 2, "startWave": 7,  "endWave": 9,  "startGold": 240,
     "boss": {"name": "Krivus the Frost King", "scale": 1.55, "hpMult": 4.0, "rewardMult": 8, "castleDmgMult": 1.8,
              "bodyColor": "2a5a8a", "eyeColor": "88ccff", "slamRange": 3.4, "slamRate": 0.65, "slamDmg": 8, "aggroRange": 7.5}},
    {"id": 4, "name": "Dreadworld",     "biome": 3, "layout": 3, "startWave": 10, "endWave": 12, "startGold": 340,
     "boss": {"name": "Ignarok the Flame Tyrant", "scale": 1.60, "hpMult": 4.5, "rewardMult": 9, "castleDmgMult": 2.0,
              "bodyColor": "6a1a0a", "eyeColor": "ff6600", "slamRange": 3.6, "slamRate": 0.70, "slamDmg": 10, "aggroRange": 8.0,
              "explodesOnDeath": true, "explodeRadius": 4.5, "explodeDmg": 14}},
    {"id": 5, "name": "The Abyss",      "biome": 4, "layout": 4, "startWave": 13, "endWave": 15, "startGold": 460,
     "boss": {"name": "Vhalzur the Void Sovereign", "scale": 1.70, "hpMult": 5.5, "rewardMult": 12, "castleDmgMult": 2.2,
              "bodyColor": "0a0210", "eyeColor": "aa22ff", "slamRange": 3.8, "slamRate": 0.80, "slamDmg": 12, "aggroRange": 9.0}},
]

## Biome palettes. The JS biome carries fog/lighting/tree tables too; the port keeps the
## colours that actually drive the look of the board and the sky.
## Gameplay-side biome data only. Ground, road and sky COLOUR live in
## BattlefieldArt.PALETTES, which the shader pipeline reads directly — keeping a second
## colour table here meant edits to it changed nothing and looked like they should.
const BIOMES := [
    {"name": "Meadow", "torch": "ff8820", "water": {"deep": "1a5c9a", "shallow": "2a7abf", "surf": "3a9fe0"},   
     "hill": "3a8040", "trees": ["tree", "tree", "tree", "pine"]},
    {"name": "Desert", "torch": "ff6600", "water": {"deep": "c4a030", "shallow": "d4b040", "surf": "e0c060"},   
     "hill": "b89050", "trees": ["cactus", "cactus", "deadtree", "palm"]},
    {"name": "Icelands", "torch": "88ccff", "water": {"deep": "8ab8e0", "shallow": "aad0f0", "surf": "c8e8ff"}, 
     "hill": "c0d8f0", "trees": ["pine", "pine", "deadtree"]},
    {"name": "Lava", "torch": "ff5500", "water": {"deep": "ff5500", "shallow": "ff7700", "surf": "ff9900"},     
     "hill": "2a0c00", "trees": ["deadtree", "deadtree", "mushroom"]},
    {"name": "Mordor", "torch": "dd7722", "water": {"deep": "1a1208", "shallow": "221a10", "surf": "2a2010"},   
     "hill": "2a2018", "trees": ["deadtree", "deadtree", "mushroom"]},
    {"name": "Doom", "torch": "ff0044", "water": {"deep": "550022", "shallow": "770033", "surf": "aa0044"},     
     "hill": "150010", "trees": ["deadtree", "mushroom", "mushroom"]},
]

## Densify waypoints into per-tile steps. Direct port of expandPath() — walks x first,
## then z, so corners are square rather than diagonal.
static func expand_path(waypoints: Array) -> Array[Vector2i]:
    var pts: Array[Vector2i] = []
    for i in range(waypoints.size() - 1):
        var c: int = waypoints[i][0]
        var r: int = waypoints[i][1]
        var tc: int = waypoints[i + 1][0]
        var tr: int = waypoints[i + 1][1]
        while c != tc:
            pts.append(Vector2i(c, r))
            c += 1 if tc > c else -1
        while r != tr:
            pts.append(Vector2i(c, r))
            r += 1 if tr > r else -1
    var last: Array = waypoints[waypoints.size() - 1]
    pts.append(Vector2i(last[0], last[1]))
    return pts

## All three lanes of a layout, densified.
static func layout_lanes(layout_idx: int) -> Array:
    var out: Array = []
    var def: Dictionary = LAYOUTS[layout_idx]
    for k in ["a", "b", "c"]:
        out.append(expand_path(def[k]))
    return out

## Endless is a sixth level that never ends: it picks up at wave 16, on the Switchback
## layout and the Doom palette, and only stops when the castle falls. endWave is -1 to
## mean "no end" — the campaign completion check tests for it explicitly.
const ENDLESS_LEVEL := {
    "id": 99, "name": "Endless", "biome": 5, "layout": 4,
    "startWave": 16, "endWave": -1, "startGold": 600,
}

static func is_endless(level: Dictionary) -> bool:
    return int(level.get("endWave", 0)) < 0

static func level_by_id(id: int) -> Dictionary:
    if id == int(ENDLESS_LEVEL["id"]):
        return ENDLESS_LEVEL
    for l in LEVELS:
        if l["id"] == id:
            return l
    return {}


## Which types are emplacements rather than troops. Upgrade cost doubles for these,
## and it is the split the JS uses in both tryUpgradeDefender and totalCostPaid.
const BUILDING_TYPES := ["tower", "catapult", "archer", "mage", "ballista"]
const MAX_LEVEL := 3

## Gold to take a defender from `level` to `level+1`.
## Port of `CFG.COSTS[type] * level * (isBuilding ? 2 : 1)`.
static func upgrade_cost(type: String, level: int) -> int:
    var mult: int = 2 if type in BUILDING_TYPES else 1
    return int(COSTS.get(type, 0)) * level * mult

## Kills the unit must have scored before it may upgrade. Port of `killsNeeded`.
## A plain wall can never score a kill, so its first upgrade is deliberately kill-free.
static func upgrade_kills_needed(type: String, level: int) -> int:
    if type == "wall":
        return 0 if level == 1 else 15
    return 10 if level == 1 else 25

## Total gold sunk into a defender at its current level — base cost plus every upgrade
## paid. Port of totalCostPaid(); drives the sell refund.
static func total_cost_paid(type: String, level: int) -> int:
    var base: int = int(COSTS.get(type, 0))
    if level <= 1:
        return base
    var mult: int = 1 if type == "wall" else (2 if type in BUILDING_TYPES else 1)
    if level == 2:
        return base + base * mult
    return base + base * mult + base * 2 * mult

## A wall does not have range/rate/dmg at all, so the generic UPGRADE_STATS multipliers
## would be scaling fallback defaults into meaningless numbers. It gets assigned combat
## stats outright instead — deliberately weaker than the real Archer and Catapult,
## because a wall is 14g and costs ZERO unit slots.
const WALL_UPGRADE := {
    2: {"dmg": 3.0, "range": 6.0, "rate": 0.9},
    3: {"dmg": 7.0, "range": 7.0, "rate": 0.4, "aoe": 1.7},
}
