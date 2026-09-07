extends Node
## Wave composition, ported from buildSpawnQueue() in src/main.js.
##
## The JS version is a hand-tuned table for waves 1-12 and a formula beyond it. Both are
## kept here so the curve is identical. Campaign levels span waves 1-15, so waves 6-12
## are ENTIRELY inside the campaign — getting them from the formula instead of the table
## is not a late-game rounding difference, it is the wrong fight in levels 2, 3 and 4.
##
## The queue is built in JS ORDER: it is consumed with pop_back(), so the LAST element
## spawns FIRST and index 0 spawns LAST. The boss sequence depends on that, because the
## JS builds it with unshift().
##
## Tokens in the returned queue:
##   "<type>"          a plain enemy
##   "elite:<type>"    2x hp, 1.3x speed, 2x reward, 1.15x scale
##   "retinue:<type>"  an elite that also locks onto the boss's lane
##   "pause"           a breather between cohorts
##   "__levelBoss"     the level's named boss

## Hand-tuned waves 1-12, verbatim from the JS table.
const HAND_TUNED := {
    1:  {"grunt": 12, "skeleton": 5},
    2:  {"grunt": 12, "skeleton": 8, "wolf": 4, "brute": 1},
    3:  {"grunt": 8, "skeleton": 7, "wolf": 5, "brute": 3, "enemyArcher": 2},
    4:  {"grunt": 6, "skeleton": 6, "brute": 5, "wolf": 5, "spider": 4, "enemyArcher": 4, "exploder": 3},
    5:  {"grunt": 5, "skeleton": 6, "brute": 6, "wolf": 5, "spider": 6, "enemyArcher": 5, "troll": 2, "exploder": 4, "healerOrc": 1},
    6:  {"grunt": 4, "skeleton": 4, "brute": 5, "wolf": 5, "spider": 6, "enemyArcher": 4, "troll": 2, "orcMage": 2, "exploder": 4, "healerOrc": 2},
    7:  {"skeleton": 4, "brute": 5, "wolf": 5, "spider": 6, "troll": 3, "boss": 1, "enemyArcher": 5, "orcMage": 3, "exploder": 4, "healerOrc": 3},
    8:  {"skeleton": 4, "brute": 6, "wolf": 5, "spider": 7, "troll": 3, "boss": 2, "enemyArcher": 5, "orcMage": 3, "cyclops": 1, "exploder": 4, "healerOrc": 3},
    9:  {"brute": 6, "wolf": 6, "spider": 7, "troll": 5, "boss": 2, "enemyArcher": 5, "orcMage": 4, "cyclops": 2, "exploder": 5, "healerOrc": 3, "rockTroll": 1},
    10: {"brute": 6, "wolf": 6, "spider": 8, "troll": 5, "boss": 3, "enemyArcher": 5, "orcMage": 4, "cyclops": 2, "exploder": 5, "healerOrc": 4, "rockTroll": 2},
    11: {"brute": 7, "wolf": 7, "spider": 9, "troll": 6, "boss": 3, "enemyArcher": 5, "orcMage": 5, "cyclops": 3, "exploder": 6, "healerOrc": 4, "rockTroll": 2},
    12: {"brute": 7, "wolf": 7, "spider": 10, "troll": 6, "boss": 4, "enemyArcher": 5, "orcMage": 6, "cyclops": 4, "exploder": 6, "healerOrc": 5, "rockTroll": 3},
}

const GAP_SIZE := 10          ## a "pause" token after every N enemies
const PAUSE_SECONDS := 1.8    ## how long that breather lasts, from updateSpawner

## Total real (non-pause) enemies for a wave. Kept separate from the queue build so tests
## can assert counts without depending on shuffle order.
static func wave_counts(wave_num: int) -> Dictionary:
    if HAND_TUNED.has(wave_num):
        return HAND_TUNED[wave_num].duplicate()
    # Beyond wave 12 the JS scales every type linearly with n = wave - 12.
    var n: int = wave_num - 12
    return {
        "brute":       5 + ceili(n * 0.85),
        "wolf":        5 + ceili(n * 0.85),
        "spider":      6 + ceili(n * 0.95),
        "troll":       4 + ceili(n * 0.65),
        "boss":        3 + ceili(n * 0.55),
        "enemyArcher": 4 + ceili(n * 0.55),
        "orcMage":     4 + ceili(n * 0.65),
        "cyclops":     2 + ceili(n * 0.35),
        "exploder":    3 + ceili(n * 0.55),
        "healerOrc":   2 + ceili(n * 0.4),
        "rockTroll":   1 + ceili(n * 0.3),
    }

static func total_for_wave(wave_num: int) -> int:
    var t := 0
    var counts := wave_counts(wave_num)
    for k in counts:
        t += counts[k]
    return t

## Elite promotion chance for a wave. Siege waves (every 5th) escalate 28% -> 50%;
## every other wave from 8 on has a flat 12% so non-siege waves stay interesting.
static func elite_chance(wave_num: int) -> float:
    if wave_num % 5 == 0:
        return minf(0.50, 0.28 + floorf(wave_num / 5.0 - 1.0) * 0.07)
    if wave_num >= 8:
        return 0.12
    return 0.0

## Enemy speed multiplier from the rage mechanic — after wave 10 the horde gets faster,
## capped at 2x. Campaign levels 4 and 5 sit entirely inside this range.
static func rage_multiplier(wave_num: int) -> float:
    if wave_num <= 10:
        return 1.0
    return minf(2.0, 1.0 + (wave_num - 10) * 0.05)

## The full spawn queue: cluster-shuffled, elite-marked, and paced with pause markers.
## rng is injectable purely so tests are reproducible.
static func build_queue(wave_num: int, rng: RandomNumberGenerator = null) -> Array[String]:
    var r := rng
    if r == null:
        r = RandomNumberGenerator.new()
        r.randomize()
    var flat: Array[String] = []
    var counts := wave_counts(wave_num)
    for type in counts:
        for i in range(counts[type]):
            flat.append(type)

    # Group into cohorts of 2-3, then shuffle the COHORTS rather than the individuals, so
    # same-type packs arrive together ("a pack of wolves") instead of random soup.
    var cohorts: Array = []
    var idx := 0
    while idx < flat.size():
        var size: int = 2 + r.randi_range(0, 1)
        cohorts.append(flat.slice(idx, mini(idx + size, flat.size())))
        idx += size
    for i in range(cohorts.size() - 1, 0, -1):
        var j := r.randi_range(0, i)
        var tmp = cohorts[i]
        cohorts[i] = cohorts[j]
        cohorts[j] = tmp
    var q: Array[String] = []
    for c in cohorts:
        for e in c:
            q.append(e)

    # Elite promotion.
    var chance := elite_chance(wave_num)
    if chance > 0.0:
        for i in range(q.size()):
            if not q[i].begins_with("elite:") and r.randf() < chance:
                q[i] = "elite:" + q[i]

    # Mini-wave pacing: a breather every GAP_SIZE enemies, but only on waves big enough
    # to need one.
    if q.size() >= 12:
        var paced: Array[String] = []
        for i in range(q.size()):
            paced.append(q[i])
            if (i + 1) % GAP_SIZE == 0 and i < q.size() - 1:
                paced.append("pause")
        return paced
    return q

## Siege waves (every 5th) get 40% more enemies, drawn at random from the wave's own
## composition. Appended to the END, which is the spawn-FIRST end.
static func apply_siege_bonus(q: Array[String], wave_num: int, rng: RandomNumberGenerator = null) -> Array[String]:
    if wave_num % 5 != 0:
        return q
    var r := rng
    if r == null:
        r = RandomNumberGenerator.new()
        r.randomize()
    var real: Array[String] = []
    for t in q:
        if t != "pause":
            real.append(t)
    var extra: int = int(floor(real.size() * 0.4))
    if extra <= 0:
        return q
    var pool := real.duplicate()
    for i in range(pool.size() - 1, 0, -1):
        var j := r.randi_range(0, i)
        var tmp = pool[i]
        pool[i] = pool[j]
        pool[j] = tmp
    var out := q.duplicate()
    for i in range(mini(extra, pool.size())):
        out.append(pool[i])
    return out

## Restructure the level's final wave into a proper boss fight:
##   a trimmed regular wave, a pause, three elite retinue guards, a pause, then the boss.
## The queue drains from the BACK, so the sequence is built by pushing to the FRONT in
## reverse order of appearance.
static func apply_boss_finale(q: Array[String]) -> Array[String]:
    var real_count := 0
    for t in q:
        if t != "pause":
            real_count += 1
    # Keep ~55% of the opener so it is a lighter warm-up, not a second wave on top of a boss.
    var keep: int = maxi(3, ceili(real_count * 0.55))
    var trimmed: Array[String] = []
    var kept := 0
    for i in range(q.size() - 1, -1, -1):
        var tok: String = q[i]
        if tok == "pause":
            trimmed.push_front(tok)
        elif kept < keep:
            trimmed.push_front(tok)
            kept += 1
    trimmed.push_front("pause")
    trimmed.push_front("retinue:brute")
    trimmed.push_front("retinue:brute")
    trimmed.push_front("retinue:troll")
    trimmed.push_front("pause")
    trimmed.push_front("__levelBoss")
    return trimmed

## Endless-only per-enemy escalation, ported from _endlessHpScale(). Campaign waves
## (<=15) are untouched; +4%/wave past 15, capped at 3x.
static func endless_hp_scale(wave_num: int, is_endless: bool) -> float:
    if not is_endless:
        return 1.0
    return minf(3.0, 1.0 + maxf(0.0, wave_num - 15) * 0.04)
