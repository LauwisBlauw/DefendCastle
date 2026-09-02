extends Node
## Headless integration test that runs under the NORMAL main loop, so the SceneTree
## iterates and _process/_ready/timers all behave exactly as they do in a real session.
## Run:  godot --headless --path . tests/sim_runner.tscn
##
## (An earlier attempt drove _process by hand from a `--script` SceneTree. That mode
## never iterates the tree, so awaits never resolved and scene timers never fired —
## the harness hung, not the game. Worth recording: the bug was in the test.)

var main: Node3D
var _fails := 0
var _elapsed := 0.0
var _phase := "boot"
var _gold_after_build := 0
const MAX_SECONDS := 120.0

func _ok(n: String, c: bool, d := "") -> void:
    print(("  PASS  " if c else "  FAIL  ") + n + ("  " + d if not c else ""))
    if not c: _fails += 1

func _ready() -> void:
    main = load("res://scenes/main.tscn").instantiate()
    add_child(main)
    print("\n=== headless integration: level 1, one wave ===")
    _ok("scene instantiated", main != null)
    _ok("three lanes built", main.lanes.size() == 3, str(main.lanes.size()))
    _ok("lane A reaches the castle", main.lanes[0][main.lanes[0].size()-1] == Vector2i(65, 24))

    var placed := 0
    for x in [22, 26, 30, 34]:
        if main.place_defender(x, 25, "tower"): placed += 1
    _ok("towers placed (gold-limited)", placed >= 2, "placed %d, gold %d" % [placed, main.gold])
    _ok("cannot build on the road",
        not main.place_defender(main.lanes[1][5].x, main.lanes[1][5].y, "tower"))
    _gold_after_build = main.gold
    main.start_wave()
    _ok("wave started", main.wave == 1)
    _phase = "running"

func _process(delta: float) -> void:
    if _phase != "running": return
    _elapsed += delta
    var done: bool = (not main._wave_active) and main.enemies.is_empty() and _elapsed > 1.0
    if not done and _elapsed < MAX_SECONDS: return
    _phase = "done"

    var leaked: int = Cfg.CASTLE_MAX_HP - main.castle_hp
    print("    -> %.1fs sim   kills=%d  leaked_hp=%d  gold=%d  live=%d"
        % [_elapsed, main.kills, leaked, main.gold, main.enemies.size()])
    _ok("wave terminated (did not hang)", not main._wave_active,
        "still active after %.0fs" % _elapsed)
    _ok("field cleared", main.enemies.is_empty(), "%d left" % main.enemies.size())
    _ok("towers scored kills", main.kills > 0, "kills=%d" % main.kills)
    _ok("kills paid gold", main.gold > _gold_after_build, "%d -> %d" % [_gold_after_build, main.gold])
    var st: Dictionary = Voxel.cache_stats()
    print("    -> voxel cache: %d materials, %d box meshes (shared)" % [st["materials"], st["meshes"]])
    _ok("voxel resources cached, not per-box", st["meshes"] < 40, str(st))
    print("\n%s" % ("ALL PASSED" if _fails == 0 else "%d FAILED" % _fails))
    get_tree().quit(1 if _fails > 0 else 0)
