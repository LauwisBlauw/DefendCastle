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
}

const COSTS := {
    "wall": 14, "tower": 36, "catapult": 62, "swordsman": 22, "knight": 75,
    "spearman": 34, "archer": 55, "mage": 50, "ballista": 80, "spiketrap": 18,
}

## Enemies. speed is tiles/sec — a grunt crosses a range-6 bubble in ~3.5s, which is
## what makes low-dps defenders unable to finish anything (see the JS wall-upgrade notes).
const ORC_TYPES := {
    "grunt":       {"speed": 3.4,  "hp": 18, "reward": 7,  "castleDmg": 10, "scale": 0.77},
    "brute":       {"speed": 2.93, "hp": 26, "reward": 20, "castleDmg": 26, "scale": 0.90},
    "skeleton":    {"speed": 5.4,  "hp": 14, "reward": 6,  "castleDmg": 12, "scale": 0.70},
    "wolf":        {"speed": 6.1,  "hp": 22, "reward": 14, "castleDmg": 18, "scale": 0.70},
    "spider":      {"speed": 7.6,  "hp": 14, "reward": 10, "castleDmg": 12, "scale": 0.56},
    "enemyArcher": {"speed": 2.55, "hp": 11, "reward": 14, "castleDmg": 14, "scale": 0.77},
}

## Level 1 "Blitz" layout — three lanes, all exiting near the castle at x=65.
const LAYOUT_BLITZ := {
    "a": [[0,10],[20,10],[20,16],[40,16],[40,24],[65,24]],
    "b": [[0,27],[18,27],[18,21],[40,21],[40,27],[65,27]],
    "c": [[0,44],[20,44],[20,38],[40,38],[40,30],[65,30]],
}

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
