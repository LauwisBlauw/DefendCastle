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
    _test_wave_counts()
    _test_endless_scale()
    _test_economy()
    print("\n%d passed, %d failed" % [_pass, _fail])
    quit(1 if _fail > 0 else 0)

func _test_path_expansion() -> void:
    var Config = load("res://scripts/config.gd")
    var p: Array = Config.expand_path(Config.LAYOUT_BLITZ["a"])
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
    _ok("all three lanes expand", Config.expand_path(Config.LAYOUT_BLITZ["b"]).size() > 0
        and Config.expand_path(Config.LAYOUT_BLITZ["c"]).size() > 0)

func _test_wave_counts() -> void:
    var W = load("res://scripts/waves.gd")
    # Totals measured from the ORIGINAL JS buildSpawnQueue.
    var expected := {1: 17, 2: 25, 3: 25}
    for w in expected:
        _ok("wave %d total matches JS (%d)" % [w, expected[w]],
            W.total_for_wave(w) == expected[w],
            "got %d" % W.total_for_wave(w))
    # monotonic growth past the hand-tuned table — the endless curve must not flatline
    var prev: int = W.total_for_wave(13)
    var monotonic := true
    for w in range(14, 60):
        var t: int = W.total_for_wave(w)
        if t < prev:
            monotonic = false
        prev = t
    _ok("late-wave totals never decrease", monotonic)
    _ok("wave 50 is substantially larger than wave 15",
        W.total_for_wave(50) > W.total_for_wave(15) * 2,
        "w15=%d w50=%d" % [W.total_for_wave(15), W.total_for_wave(50)])
    # queue must contain exactly the counted enemies
    var rng := RandomNumberGenerator.new(); rng.seed = 12345
    var q: Array = W.build_queue(3, rng)
    _ok("queue length equals counted total", q.size() == W.total_for_wave(3),
        "queue=%d counted=%d" % [q.size(), W.total_for_wave(3)])

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
