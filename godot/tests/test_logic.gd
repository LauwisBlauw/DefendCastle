extends SceneTree
## Headless verification of the ported logic layer.
##   godot --headless --script tests/test_logic.gd
##
## The wave assertions compare against totals MEASURED from the running JS build
## (by extracting buildSpawnQueue and running it over waves 1..200), so this is a
## real cross-implementation check, not a restatement of the GDScript.

var _pass := 0
var _fail := 0

func _ok(name: String, cond: bool, detail := "") -> void:
    if cond:
        _pass += 1
        print("  PASS  ", name)
    else:
        _fail += 1
        print("  FAIL  ", name, "  ", detail)

func _init() -> void:
    print("\n=== logic core ===")
    _test_path_expansion()
    _test_all_layouts()
    _test_wave_table()
    _test_elite_and_pacing()
    _test_boss_finale()
    _test_endless_scale()
    _test_economy()
    _test_upgrade_economy()
    print("\n%d passed, %d failed" % [_pass, _fail])
    quit(1 if _fail > 0 else 0)

func _test_path_expansion() -> void:
    var Config = load("res://scripts/config.gd")
    var p: Array = Config.expand_path(Config.LAYOUTS[0]["a"])
    _ok("lane A starts at the west edge", p[0] == Vector2i(0, 10), str(p[0]))
    _ok("lane A ends at the castle (65,24)", p[p.size() - 1] == Vector2i(65, 24), str(p[p.size() - 1]))
    # every step must be exactly one tile, orthogonally — diagonal steps would let
    # enemies cut corners through walls
    var bad := 0
    for i in range(p.size() - 1):
        var d: Vector2i = p[i + 1] - p[i]
        if abs(d.x) + abs(d.y) != 1:
            bad += 1
    _ok("path is contiguous, no diagonal steps", bad == 0, "%d bad steps" % bad)
    _ok("all three lanes expand", Config.expand_path(Config.LAYOUTS[0]["b"]).size() > 0
        and Config.expand_path(Config.LAYOUTS[0]["c"]).size() > 0)

## The five campaign layouts all have to obey the same rules the enemy walker assumes:
## contiguous orthogonal steps, starting at the west edge, ending at the castle mouth.
func _test_all_layouts() -> void:
    var Config = load("res://scripts/config.gd")
    for li in range(Config.LAYOUTS.size()):
        var name: String = Config.LAYOUTS[li]["name"]
        var lanes: Array = Config.layout_lanes(li)
        _ok("%s has three lanes" % name, lanes.size() == 3)
        var all_ok := true
        var ends_at_castle := true
        for lane in lanes:
            if lane[0].x != 0:
                all_ok = false
            if lane[lane.size() - 1].x != 65:
                ends_at_castle = false
            for i in range(lane.size() - 1):
                var d: Vector2i = lane[i + 1] - lane[i]
                if abs(d.x) + abs(d.y) != 1:
                    all_ok = false
        _ok("%s lanes are contiguous and start at the west edge" % name, all_ok)
        _ok("%s lanes all end at the castle mouth" % name, ends_at_castle)

## Upgrade pricing is the one place where a wrong constant silently unbalances the
## whole economy, so the exact JS numbers are pinned here.
func _test_upgrade_economy() -> void:
    var Config = load("res://scripts/config.gd")
    # Emplacements pay double: tower base 36 -> 72 for lv2, 144 for lv3.
    _ok("tower lv1->2 costs 72", Config.upgrade_cost("tower", 1) == 72, str(Config.upgrade_cost("tower", 1)))
    _ok("tower lv2->3 costs 144", Config.upgrade_cost("tower", 2) == 144, str(Config.upgrade_cost("tower", 2)))
    # Troops pay single: knight base 75.
    _ok("knight lv1->2 costs 75", Config.upgrade_cost("knight", 1) == 75, str(Config.upgrade_cost("knight", 1)))
    _ok("knight lv2->3 costs 150", Config.upgrade_cost("knight", 2) == 150, str(Config.upgrade_cost("knight", 2)))
    # Total invested drives the sell refund.
    _ok("tower total at lv1 is base", Config.total_cost_paid("tower", 1) == 36)
    _ok("tower total at lv3 is 36+72+144", Config.total_cost_paid("tower", 3) == 252, str(Config.total_cost_paid("tower", 3)))
    _ok("wall total at lv3 is 14+14+28", Config.total_cost_paid("wall", 3) == 56, str(Config.total_cost_paid("wall", 3)))
    # A plain wall can never score a kill, so its first upgrade must be kill-free.
    _ok("wall lv1 upgrade needs no kills", Config.upgrade_kills_needed("wall", 1) == 0)
    _ok("wall lv2 upgrade needs 15 kills", Config.upgrade_kills_needed("wall", 2) == 15)
    _ok("tower lv1 upgrade needs 10 kills", Config.upgrade_kills_needed("tower", 1) == 10)
    _ok("tower lv2 upgrade needs 25 kills", Config.upgrade_kills_needed("tower", 2) == 25)

func _test_endless_scale() -> void:
    var W = load("res://scripts/waves.gd")
    _ok("campaign waves are never scaled", is_equal_approx(W.endless_hp_scale(10, false), 1.0))
    _ok("endless wave 15 is the baseline", is_equal_approx(W.endless_hp_scale(15, true), 1.0))
    _ok("endless wave 30 is 1.6x", is_equal_approx(W.endless_hp_scale(30, true), 1.6))
    _ok("endless scale caps at 3x", is_equal_approx(W.endless_hp_scale(500, true), 3.0))

func _test_economy() -> void:
    var C = load("res://scripts/config.gd")
    # Level 1 starts with 100g; it must afford something from its unlocked set,
    # otherwise the opening move is impossible (checked on the JS side too).
    var start_gold := 100
    var affordable := 0
    for t in ["wall", "tower", "swordsman"]:
        if C.COSTS[t] <= start_gold:
            affordable += 1
    _ok("level 1 can afford its whole starting set", affordable == 3)
    _ok("a wall costs no unit slot", C.STATS["wall"]["unitCost"] == 0)
    _ok("knight is the most slot-hungry unit", C.STATS["knight"]["unitCost"] == 3)

## Every campaign wave total, measured directly from the JS buildSpawnQueue table.
## Waves 1-12 are hand-tuned in the original; the port previously only carried 1-5 and
## fell through to the late-wave formula for 6-12, which sits ENTIRELY inside the
## campaign — wave 6 became 55 enemies instead of 38, and introduced cyclops and rock
## trolls two levels early. These numbers are the guard against that regressing.
const JS_WAVE_TOTALS := {
    1: 17, 2: 25, 3: 25, 4: 33, 5: 40, 6: 38, 7: 39,
    8: 43, 9: 46, 10: 50, 11: 57, 12: 63,
}
## The late-wave formula, also measured from the JS.
const JS_LATE_TOTALS := {13: 50, 15: 63, 20: 98, 30: 164}

## Types the JS does NOT introduce until a given wave. Spawning them earlier is a
## difficulty break, not a rounding difference.
const JS_FIRST_APPEARANCE := {
    "enemyArcher": 3, "spider": 4, "exploder": 4, "troll": 5, "healerOrc": 5,
    "orcMage": 6, "boss": 7, "cyclops": 8, "rockTroll": 9,
}

func _test_wave_table() -> void:
    var W = load("res://scripts/waves.gd")
    for w in JS_WAVE_TOTALS:
        var got: int = W.total_for_wave(w)
        _ok("wave %d total matches JS (%d)" % [w, JS_WAVE_TOTALS[w]],
            got == JS_WAVE_TOTALS[w], "got %d" % got)
    for w in JS_LATE_TOTALS:
        var got2: int = W.total_for_wave(w)
        _ok("late wave %d total matches JS (%d)" % [w, JS_LATE_TOTALS[w]],
            got2 == JS_LATE_TOTALS[w], "got %d" % got2)

    # No enemy type may appear before the wave the JS first introduces it.
    var early: Array[String] = []
    for type in JS_FIRST_APPEARANCE:
        var first: int = int(JS_FIRST_APPEARANCE[type])
        for w in range(1, first):
            if W.wave_counts(w).has(type):
                early.append("%s at wave %d (JS: %d)" % [type, w, first])
    _ok("no enemy type arrives before its JS debut wave", early.is_empty(), str(early))

func _test_elite_and_pacing() -> void:
    var W = load("res://scripts/waves.gd")
    # Elite chance: siege waves escalate, wave 8+ gets a flat 12%, earlier waves none.
    _ok("no elites before wave 5", W.elite_chance(4) == 0.0, str(W.elite_chance(4)))
    _ok("wave 5 siege elite chance is 28%", absf(W.elite_chance(5) - 0.28) < 0.001, str(W.elite_chance(5)))
    _ok("wave 10 siege elite chance is 35%", absf(W.elite_chance(10) - 0.35) < 0.001, str(W.elite_chance(10)))
    _ok("wave 15 siege elite chance is 42%", absf(W.elite_chance(15) - 0.42) < 0.001, str(W.elite_chance(15)))
    _ok("elite chance caps at 50%", W.elite_chance(50) <= 0.5001, str(W.elite_chance(50)))
    _ok("wave 8 non-siege elite chance is 12%", absf(W.elite_chance(8) - 0.12) < 0.001, str(W.elite_chance(8)))
    _ok("wave 6 has no elites (before the wave-8 rule)", W.elite_chance(6) == 0.0, str(W.elite_chance(6)))

    # Rage: enemy speed scales after wave 10, capped at 2x.
    _ok("no rage at wave 10", W.rage_multiplier(10) == 1.0)
    _ok("rage at wave 12 is 1.10", absf(W.rage_multiplier(12) - 1.10) < 0.001, str(W.rage_multiplier(12)))
    _ok("rage at wave 15 is 1.25", absf(W.rage_multiplier(15) - 1.25) < 0.001, str(W.rage_multiplier(15)))
    _ok("rage caps at 2.0", W.rage_multiplier(99) == 2.0)

    # Pacing: a breather every 10 enemies on waves big enough to warrant one.
    var rng := RandomNumberGenerator.new()
    rng.seed = 12345
    var q: Array = W.build_queue(6, rng)
    var pauses := 0
    var reals := 0
    for t in q:
        if t == "pause": pauses += 1
        else: reals += 1
    _ok("wave 6 queue holds every enemy (%d)" % reals, reals == JS_WAVE_TOTALS[6], "got %d" % reals)
    _ok("wave 6 queue is paced with breathers (%d)" % pauses, pauses == int((reals - 1) / 10), "got %d" % pauses)

    # Siege bonus adds 40% more bodies.
    rng.seed = 999
    var base: Array = W.build_queue(10, rng)
    var sieged: Array = W.apply_siege_bonus(base, 10, rng)
    var base_real := 0
    for t in base:
        if t != "pause": base_real += 1
    var siege_real := 0
    for t in sieged:
        if t != "pause": siege_real += 1
    _ok("siege wave adds 40%% more enemies (%d -> %d)" % [base_real, siege_real],
        siege_real == base_real + int(floor(base_real * 0.4)), "got %d" % siege_real)
    rng.seed = 999
    var not_sieged: Array = W.apply_siege_bonus(W.build_queue(11, rng), 11, rng)
    var ns_real := 0
    for t in not_sieged:
        if t != "pause": ns_real += 1
    _ok("a non-siege wave is left alone", ns_real == W.total_for_wave(11), "got %d" % ns_real)

func _test_boss_finale() -> void:
    var W = load("res://scripts/waves.gd")
    var rng := RandomNumberGenerator.new()
    rng.seed = 4242
    var base: Array = W.build_queue(3, rng)
    var base_real := 0
    for t in base:
        if t != "pause": base_real += 1
    var finale: Array = W.apply_boss_finale(base)

    # The queue drains from the BACK, so index 0 spawns LAST.
    _ok("the boss spawns last", finale[0] == "__levelBoss", str(finale.slice(0, 3)))
    _ok("a dramatic pause precedes the boss", finale[1] == "pause", str(finale[1]))
    _ok("three retinue guards escort the boss",
        finale[2] == "retinue:troll" and finale[3] == "retinue:brute" and finale[4] == "retinue:brute",
        str(finale.slice(2, 5)))
    _ok("a pause separates the opener from the retinue", finale[5] == "pause", str(finale[5]))

    var kept := 0
    for t in finale:
        if t != "pause" and not t.begins_with("retinue:") and t != "__levelBoss":
            kept += 1
    var expect: int = maxi(3, ceili(base_real * 0.55))
    _ok("the opening wave is trimmed to ~55%% (%d of %d)" % [kept, base_real],
        kept == expect, "expected %d got %d" % [expect, kept])
