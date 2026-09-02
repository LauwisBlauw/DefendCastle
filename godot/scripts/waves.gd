extends Node
## Wave composition, ported from buildSpawnQueue() in src/main.js.
##
## The JS version is a hand-tuned table for waves 1-12 and a formula beyond it. This
## keeps BOTH so the curve is identical; the headless test asserts the resulting counts
## match numbers measured from the running JS build.
##
## The cluster-shuffle at the end matters for feel: enemies arrive in same-type packs
## ("a pack of wolves") rather than random soup. It uses an injectable RNG so tests can
## be deterministic.

## Hand-tuned early waves, verbatim from the JS table.
const HAND_TUNED := {
    1:  {"grunt": 12, "skeleton": 5},
    2:  {"grunt": 12, "skeleton": 8, "wolf": 4, "brute": 1},
    3:  {"grunt": 8, "skeleton": 7, "wolf": 5, "brute": 3, "enemyArcher": 2},
    4:  {"grunt": 6, "skeleton": 6, "brute": 5, "wolf": 5, "spider": 4, "enemyArcher": 4, "exploder": 3},
    5:  {"grunt": 5, "skeleton": 6, "brute": 6, "wolf": 5, "spider": 6, "enemyArcher": 5, "troll": 2, "exploder": 4, "healerOrc": 1},
}

## Total real (non-pause) enemies for a wave. Kept separate from the queue build so the
## test can assert counts without depending on shuffle order.
static func wave_counts(wave_num: int) -> Dictionary:
    if HAND_TUNED.has(wave_num):
        return HAND_TUNED[wave_num].duplicate()
    # Beyond the hand-tuned table the JS scales every type linearly with n = wave-12.
    var n: int = max(1, wave_num - 12)
    return {
        "brute":       6 + ceili(n * 0.6),
        "wolf":        6 + ceili(n * 0.6),
        "spider":      8 + ceili(n * 0.7),
        "troll":       5 + ceili(n * 0.5),
        "boss":        3 + ceili(n * 0.3),
        "enemyArcher": 4 + ceili(n * 0.55),
        "orcMage":     4 + ceili(n * 0.65),
        "cyclops":     2 + ceili(n * 0.35),
        "exploder":    3 + ceili(n * 0.55),
        "healerOrc":   2 + ceili(n * 0.4),
        "rockTroll":   1 + ceili(n * 0.3),
    }

static func total_for_wave(wave_num: int) -> int:
    var t := 0
    for k in wave_counts(wave_num):
        t += wave_counts(wave_num)[k]
    return t

## Flat spawn list, cluster-shuffled into cohorts of 2-3 so same-type packs arrive
## together. rng is injectable purely so tests are reproducible.
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
    # group into cohorts, then shuffle the COHORTS (not the individuals)
    var cohorts: Array = []
    var idx := 0
    while idx < flat.size():
        var size: int = 2 + r.randi_range(0, 1)
        cohorts.append(flat.slice(idx, min(idx + size, flat.size())))
        idx += size
    for i in range(cohorts.size() - 1, 0, -1):
        var j := r.randi_range(0, i)
        var tmp = cohorts[i]; cohorts[i] = cohorts[j]; cohorts[j] = tmp
    var out: Array[String] = []
    for c in cohorts:
        for e in c:
            out.append(e)
    return out

## Endless-only per-enemy escalation, ported from _endlessHpScale(). Campaign waves
## (<=15) are untouched; +4%/wave past 15, capped at 3x.
static func endless_hp_scale(wave_num: int, is_endless: bool) -> float:
    if not is_endless:
        return 1.0
    return minf(3.0, 1.0 + maxf(0.0, wave_num - 15) * 0.04)
