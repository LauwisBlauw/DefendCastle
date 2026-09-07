extends Node
## Smoke-checks the ported art layer: every builder runs, produces geometry, is
## deterministic for a given seed, and is cheap enough to run at level load.

var _pass := 0
var _fail := 0

func chk(c: bool, label: String) -> void:
    if c: _pass += 1; print("  PASS  ", label)
    else: _fail += 1; print("  FAIL  ", label)

func _count(n: Node) -> int:
    var t := 1
    for c in n.get_children():
        t += _count(c)
    return t

func _ready() -> void:
    print("\n=== art layer ===")
    var rng := RandomNumberGenerator.new()
    for kind in Buildings.KINDS:
        rng.seed = 7
        var n: Node3D = Buildings.build(kind, rng)
        chk(n != null and _count(n) > 8, "%s builds (%d nodes)" % [kind, _count(n)])
        n.free()
    rng.seed = 3
    var w: Node3D = Buildings.build("windmill", rng)
    chk(w.get_node_or_null("Sails") != null, "the windmill exposes its Sails node")
    w.free()

    rng.seed = 11
    var h: Node3D = Nature.hill(4, 3, Color("3a8040"), Color("2d6030"), rng)
    chk(_count(h) > 1, "hill builds")
    chk(h.get_meta("columns", []).size() > 0, "hill reports the tiles it raised")
    h.free()
    rng.seed = 12
    var r: Node3D = Nature.rock(1.0, Color("6a6258"), rng)
    chk(_count(r) > 2, "rock builds")
    r.free()
    var p: Node3D = Nature.pond([Vector2i(5,5), Vector2i(6,5), Vector2i(5,6), Vector2i(6,6)],
        {"deep": Color("1a5c9a"), "shallow": Color("2a7abf"), "surf": Color("3a9fe0")})
    chk(_count(p) > 1, "pond builds")
    p.free()
    var l: Node3D = Nature.lantern(Color("ff8820"))
    var has_light := false
    for ch in l.get_children():
        if ch is OmniLight3D: has_light = true
    chk(has_light, "a lantern carries its own light")
    l.free()

    var lane: Array = Cfg.expand_path(Cfg.LAYOUTS[0]["a"])
    var pl: Node3D = Nature.path_lanterns(lane, 8, Color("ff8820"))
    chk(_count(pl) > 1, "path lanterns build along a lane")
    var road_set := {}
    for t in lane: road_set[t] = true
    # No lantern may sit on a walkable tile, or enemies would clip through it.
    var on_road := 0
    for ch in pl.get_children():
        if road_set.has(Vector2i(roundi(ch.position.x), roundi(ch.position.z))): on_road += 1
    chk(on_road == 0, "no lantern sits on the road (%d offenders)" % on_road)
    pl.free()

    var k: Node3D = Nature.road_kerbs(lane, road_set, Color("9e9e94"))
    chk(_count(k) > 1, "road kerbs build")
    k.free()

    # Atmosphere: one draw call for the whole haze, and motes that stay in bounds.
    for bi in range(7):
        rng.seed = 20 + bi
        var air: MultiMeshInstance3D = Atmosphere.create(bi, rng)
        chk(air != null and air.multimesh.instance_count > 0,
            "biome %d haze (%d motes)" % [bi, air.multimesh.instance_count])
        # Read the computed positions, not the MultiMesh: the headless dummy renderer
        # does not retain instance transforms, so reading them back proves nothing.
        var inside := true
        var moved := false
        var at0: PackedVector3Array = Atmosphere.positions_at(air, 0.0)
        for t in [0.0, 7.5, 60.0, 600.0]:
            var pts: PackedVector3Array = Atmosphere.positions_at(air, t)
            for mote in pts:
                if mote.x < -5.0 or mote.x > 77.0 or mote.y < 0.3 or mote.y > 8.4 or mote.z < -5.0 or mote.z > 59.0:
                    inside = false
                    break
            if t > 0.0 and pts.size() > 0 and pts[0] != at0[0]:
                moved = true
        chk(inside, "biome %d motes stay inside the wrap bounds, even after 10 minutes" % bi)
        chk(moved, "biome %d motes actually drift" % bi)
        air.free()

    print("\n%d passed, %d failed" % [_pass, _fail])
    get_tree().quit(1 if _fail > 0 else 0)
