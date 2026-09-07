class_name Nature
extends RefCounted
## Terrain features and atmosphere props: hills, boulders, ponds, path lanterns, drifting
## clouds and the kerb stones that give the road a shoulder. Ported from the JS
## buildHill / buildRock / buildPond / makeLanternMesh / buildClouds / rebuildRoadKerbs.
##
## Every builder is pure: it takes its colours and its RandomNumberGenerator and hands
## back a detached Node3D at the origin. The caller positions it, parents it, and owns
## any per-frame motion. Nothing here reads the grid, because the grid lives in main.gd
## and these have to be testable standalone.
##
## Randomness comes ONLY from the passed rng. Levels are generated per-seed and must look
## identical run to run, so a stray randf() would make a level drift between sessions.
##
## Ground convention, inherited from the JS build and from main.gd's _build_ground(): the
## ground is a 0.3-tall slab centred at y = -0.15, so the walkable surface is y = 0.
const GROUND_Y := -0.15

# ── Hill ─────────────────────────────────────────────────────────────────────
const HILL_STEP := 0.42     # one "block" of elevation
const HILL_CAP  := 0.22     # thickness of the grass layer capping each column

# ── Kerb ─────────────────────────────────────────────────────────────────────
## The stone sits just INSIDE the road tile (0.44 from centre, 0.10 wide) rather than
## straddling the boundary — a kerb spilling onto the grass would clip walls and towers
## placed on the adjacent buildable tile.
const KERB_IN := 0.44
const KERB_W  := 0.10
const KERB_H  := 0.11

## Random box dimensions would defeat Voxel.box_mesh()'s size cache — 130 boulders of
## eight boxes each is a thousand one-off BoxMeshes. Snapping to a coarse step keeps the
## silhouettes irregular while collapsing the cache back to a few dozen entries.
static func _q(v: float, step := 0.02) -> float:
    return round(v / step) * step

## MultiMesh over a unit cube, one draw call per colour layer. Positions carry their own
## scale, which is how the JS InstancedMesh layers work and the reason a 40-column hill
## costs the same as a 4-column one.
static func _slab_layer(boxes: Array, color: Color, mat: StandardMaterial3D = null) -> MultiMeshInstance3D:
    var mm := MultiMesh.new()
    mm.transform_format = MultiMesh.TRANSFORM_3D
    mm.mesh = Voxel.box_mesh(Vector3.ONE)
    mm.instance_count = boxes.size()
    for i in boxes.size():
        var b: Array = boxes[i]                       # [size: Vector3, pos: Vector3]
        mm.set_instance_transform(i, Transform3D(Basis.IDENTITY.scaled(b[0]), b[1]))
    var mmi := MultiMeshInstance3D.new()
    mmi.multimesh = mm
    mmi.material_override = mat if mat != null else Voxel.mat(color)
    return mmi


# ═════════════════════════════════════════════════════════════════════════════
#  TERRAIN
# ═════════════════════════════════════════════════════════════════════════════

## A stepped voxel mound: square columns of whole blocks, grass-capped over a dark body,
## so it terraces the way Minecraft terrain does instead of sloping smoothly.
##
## `height` is the peak in blocks (~0.42 units each); `color_a` caps the columns and
## `color_b` is the body beneath, matching the JS biome `hill: [grass, dark]` pair.
##
## The tiles the mound actually raised are stashed on the root as meta "columns" (an
## Array of Vector2i offsets from the hill centre). The caller needs them to reserve
## those tiles — the JS returns the same list — or units end up standing on thin air.
static func hill(radius: int, height: int, color_a: Color, color_b: Color, rng: RandomNumberGenerator) -> Node3D:
    var root := Node3D.new()
    root.name = "Hill"
    var bodies: Array = []
    var caps: Array = []
    var columns: Array = []
    var reach := float(radius) + 0.4
    for dc in range(-radius, radius + 1):
        for dr in range(-radius, radius + 1):
            var dist := Vector2(dc, dr).length()
            if dist > reach:
                continue
            var t: float = maxf(0.0, 1.0 - dist / reach)
            var dome := t * t * (3.0 - 2.0 * t)                # smoothstep falloff
            # Jitter breaks the perfect circle so hills read as natural landforms.
            var blocks := int(round(height * dome + (rng.randf() - 0.5) * 0.9))
            if blocks < 1:
                continue
            columns.append(Vector2i(dc, dr))
            var top := blocks * HILL_STEP                       # top surface above ground
            var body_h: float = maxf(0.02, top - HILL_CAP - GROUND_Y)
            bodies.append([Vector3(1.0, body_h, 1.0), Vector3(dc, GROUND_Y + body_h * 0.5, dr)])
            # Cap slightly oversized so it reads as a distinct grass layer, not a seam.
            caps.append([Vector3(1.02, HILL_CAP, 1.02), Vector3(dc, top - HILL_CAP * 0.5, dr)])
    root.set_meta("columns", columns)
    if columns.is_empty():
        return root
    root.add_child(_slab_layer(bodies, color_b))
    root.add_child(_slab_layer(caps, color_a))
    return root


## A clustered boulder: one tilted main mass, up to two leaning chunks, and a scatter of
## pebbles. The darker second tone is derived from `color` rather than passed in, the same
## 0.72 multiply the JS uses to tint kerbs off the road colour.
static func rock(scale: float, color: Color, rng: RandomNumberGenerator) -> Node3D:
    var root := Node3D.new()
    root.name = "Rock"
    root.scale = Vector3(scale, scale, scale)
    var dark := color.darkened(0.28)

    var bw := _q(0.28 + rng.randf() * 0.24)
    var bh := _q(0.18 + rng.randf() * 0.24)
    var bd := _q(0.22 + rng.randf() * 0.20)
    var main := Voxel.box(Vector3(bw, bh, bd), color, Vector3(0, bh * 0.5 - 0.04, 0))
    main.rotation.y = rng.randf() * PI
    main.rotation.z = (rng.randf() - 0.5) * 0.25
    root.add_child(main)

    if rng.randf() > 0.3:
        var w2 := _q(0.14 + rng.randf() * 0.16)
        var h2 := _q(0.10 + rng.randf() * 0.15)
        var chunk := Voxel.box(Vector3(w2, h2, _q(w2 * 0.88)), dark,
            Vector3((rng.randf() - 0.5) * 0.38, h2 * 0.5 - 0.04, (rng.randf() - 0.5) * 0.32))
        chunk.rotation.y = rng.randf() * PI
        chunk.rotation.z = (rng.randf() - 0.5) * 0.30
        root.add_child(chunk)

    if rng.randf() > 0.55:
        var w3 := _q(0.09 + rng.randf() * 0.10)
        var h3 := _q(0.08 + rng.randf() * 0.10)
        var top := Voxel.box(Vector3(w3, h3, w3), color,
            Vector3((rng.randf() - 0.5) * 0.25, bh * 0.7 + h3 * 0.5, (rng.randf() - 0.5) * 0.20))
        top.rotation.y = rng.randf() * TAU
        root.add_child(top)

    for _i in range(2 + int(rng.randf() * 5)):
        var pw := _q(0.05 + rng.randf() * 0.09)
        var ph := _q(0.03 + rng.randf() * 0.06)
        var peb := Voxel.box(Vector3(pw, ph, _q(pw * 0.85)), dark,
            Vector3((rng.randf() - 0.5) * 0.70, ph * 0.5 - 0.01, (rng.randf() - 0.5) * 0.65))
        peb.rotation.y = rng.randf() * TAU
        root.add_child(peb)
    return root


## cells is an Array of Vector2i tiles the pond covers. water is a Dictionary with
## "deep", "shallow" and "surf" Color entries, mirroring the JS biome water palette.
##
## The bed sits at y = -0.22, sunk below the surrounding ground slab, with the rim tiles
## (those with at least one non-pond neighbour) in the shallow tone so the pond reads as
## having depth rather than as a flat blue patch.
##
## The translucent surface is a separate child named "Surf" — the JS bobs each surf quad
## on a per-tile phase; here the caller can bob the whole node, which is one transform
## instead of one per tile and indistinguishable at the game camera distance. Surf alpha
## comes from the colour's own alpha when it carries one, else the JS default of 0.52.
static func pond(cells: Array, water: Dictionary) -> Node3D:
    var root := Node3D.new()
    root.name = "Pond"
    if cells.is_empty():
        return root
    var deep: Color = water.get("deep", Color("1a5c9a"))
    var shallow: Color = water.get("shallow", Color("2a7abf"))
    var surf: Color = water.get("surf", Color("3a9fe0"))

    var in_pond := {}
    for c in cells:
        in_pond[Vector2i(c)] = true

    var deep_boxes: Array = []
    var shallow_boxes: Array = []
    var surf_boxes: Array = []
    for c in cells:
        var t := Vector2i(c)
        var rim := false
        for d: Vector2i in [Vector2i(0, -1), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(1, 0)]:
            if not in_pond.has(t + d):
                rim = true
                break
        var bed: Array = [Vector3(1.0, 0.3, 1.0), Vector3(t.x, -0.22, t.y)]
        if rim:
            shallow_boxes.append(bed)
        else:
            deep_boxes.append(bed)
        surf_boxes.append([Vector3(0.92, 0.02, 0.92), Vector3(t.x, -0.06, t.y)])

    # Water self-glows faintly in the JS (emissive at 0.2–0.3), which is what keeps a
    # pond visible at night when the only other light is the lanterns.
    if not deep_boxes.is_empty():
        root.add_child(_slab_layer(deep_boxes, deep, Voxel.emissive_mat(deep, deep.darkened(0.6), 0.3)))
    if not shallow_boxes.is_empty():
        root.add_child(_slab_layer(shallow_boxes, shallow, Voxel.emissive_mat(shallow, shallow.darkened(0.6), 0.2)))
    var alpha: float = surf.a if surf.a < 1.0 else 0.52
    var surf_node := _slab_layer(surf_boxes, surf, Voxel.ghost_mat(surf, alpha))
    surf_node.name = "Surf"
    surf_node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    root.add_child(surf_node)
    return root


# ═════════════════════════════════════════════════════════════════════════════
#  LANTERNS
# ═════════════════════════════════════════════════════════════════════════════

const LANTERN_POST := Color("1a1a22")
## How far off the lane centre the post is planted. Beyond the tile boundary, so it sits
## clearly on grass rather than half-swallowed by the road.
const LANTERN_OFFSET := 0.9

## A single lantern: post, glass and a small OmniLight3D. glow_color drives both the
## emissive glass and the light. The cage hangs forward on +Z, so the caller yaws the
## whole node to aim the lamp over the road.
##
## The light is deliberately short-ranged and shadowless. A map carries on the order of a
## hundred of these; a hundred shadow-casting omnis at the JS radius of 6 would cost more
## than the rest of the scene put together on the mobile export target.
static func lantern(glow_color: Color) -> Node3D:
    var root := Node3D.new()
    root.name = "Lantern"
    var post := LANTERN_POST
    root.add_child(Voxel.box(Vector3(0.13, 0.05, 0.13), post, Vector3(0, 0.025, 0)))   # base plate
    root.add_child(Voxel.box(Vector3(0.052, 1.08, 0.052), post, Vector3(0, 0.57, 0)))
    root.add_child(Voxel.box(Vector3(0.09, 0.04, 0.09), post, Vector3(0, 0.55, 0)))    # mid ring
    root.add_child(Voxel.box(Vector3(0.04, 0.04, 0.34), post, Vector3(0, 1.07, 0.17))) # arm
    root.add_child(Voxel.box(Vector3(0.07, 0.07, 0.07), post, Vector3(0, 1.07, 0.35))) # elbow
    root.add_child(Voxel.box(Vector3(0.04, 0.12, 0.04), post, Vector3(0, 1.0, 0.35)))  # drop
    for cx: float in [0.08, -0.08]:
        for cz: float in [0.08, -0.08]:
            root.add_child(Voxel.box(Vector3(0.025, 0.28, 0.025), post, Vector3(cx, 0.82, 0.35 + cz)))
    # Four glass panes forming the cage faces. These ARE the visible flame — the JS also
    # has an inner glow core, but behind opaque panes it never reaches the camera.
    var glass := Voxel.emissive_mat(glow_color.lightened(0.35), glow_color, 1.8)
    for face: Vector2 in [Vector2(0, 0.08), Vector2(0, -0.08), Vector2(0.08, 0), Vector2(-0.08, 0)]:
        var pane := Voxel.box(
            Vector3(0.16 if is_zero_approx(face.x) else 0.02, 0.22, 0.16 if is_zero_approx(face.y) else 0.02),
            glow_color, Vector3(face.x, 0.82, 0.35 + face.y))
        pane.material_override = glass
        pane.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
        root.add_child(pane)
    root.add_child(Voxel.box(Vector3(0.22, 0.05, 0.22), post, Vector3(0, 0.975, 0.35))) # cap
    root.add_child(Voxel.box(Vector3(0.06, 0.05, 0.06), post, Vector3(0, 1.01, 0.35)))  # finial
    root.add_child(Voxel.box(Vector3(0.03, 0.10, 0.03), post, Vector3(0, 1.065, 0.35)))

    var light := OmniLight3D.new()
    light.name = "Glow"
    light.position = Vector3(0, 0.88, 0.38)
    light.light_color = glow_color
    light.light_energy = 1.1
    light.omni_range = 4.0
    light.shadow_enabled = false
    root.add_child(light)
    return root


## Lanterns spaced every `spacing` tiles along a densified lane, offset to the side of the
## road so they never sit on a walkable tile. `lane` is an Array of Vector2i (or Vector2)
## tiles in travel order; the first few and last couple are skipped so a lamp never lands
## on the spawn mouth or in the castle gate.
##
## At a corner the perpendicular can point back along the route, so each lamp tries its
## preferred side first and falls back to the other; if both land on lane tiles the lamp
## is skipped entirely rather than planted in the road.
##
## Each lamp carries meta "tile" (the Vector2i it stands on, so the caller can mark that
## cell unbuildable and add post collision) and meta "flicker_phase". The phase is derived
## from the tile rather than drawn from an rng, exactly as in the JS: a layout rebuild has
## to reproduce the same lighting instead of reshuffling every flame.
static func path_lanterns(lane: Array, spacing: int, glow_color: Color) -> Node3D:
    var root := Node3D.new()
    root.name = "PathLanterns"
    if lane.size() < 8 or spacing < 1:
        return root
    var on_lane := {}
    for p in lane:
        on_lane[Vector2i(roundi(p.x), roundi(p.y))] = true

    var i := 5
    while i < lane.size() - 2:
        var here := Vector2(lane[i].x, lane[i].y)
        var ahead := Vector2(lane[mini(i + 1, lane.size() - 1)].x, lane[mini(i + 1, lane.size() - 1)].y)
        var fwd := ahead - here
        if fwd.length() < 0.0001:
            fwd = Vector2(1, 0)
        fwd = fwd.normalized()
        var perp := Vector2(-fwd.y, fwd.x)
        var preferred := 1.0 if (i / spacing) % 2 == 0 else -1.0

        var side := 0.0
        for s: float in [preferred, -preferred]:
            var probe := here + perp * s * LANTERN_OFFSET
            if not on_lane.has(Vector2i(roundi(probe.x), roundi(probe.y))):
                side = s
                break
        if side == 0.0:
            i += spacing
            continue

        var at := here + perp * side * LANTERN_OFFSET
        var lamp := lantern(glow_color)
        lamp.position = Vector3(at.x, 0, at.y)
        # Yaw so the cage arm reaches back over the road rather than out into the field.
        lamp.rotation.y = atan2(-(perp.x * side), -(perp.y * side))
        lamp.set_meta("tile", Vector2i(roundi(at.x), roundi(at.y)))
        lamp.set_meta("flicker_phase", fmod(here.x * 12.9898 + here.y * 78.233, PI) * 2.0)
        root.add_child(lamp)
        i += spacing
    return root


# ═════════════════════════════════════════════════════════════════════════════
#  ATMOSPHERE
# ═════════════════════════════════════════════════════════════════════════════

## Cloud slabs at height y. Returns a root whose children the caller drifts along +x,
## wrapping at wrap_x — each child carries meta "speed" in units/second, and the root
## carries meta "respawn_x", the x to snap a cloud back to once it passes wrap_x:
##
##     for c in root.get_children():
##         c.position.x += c.get_meta("speed") * delta
##         if c.position.x > wrap_x:
##             c.position.x = root.get_meta("respawn_x")
##
## Drive it off real time, not game time, so the sky keeps moving on menus and while
## paused — the JS does this deliberately and the world feels dead without it.
const CLOUD_RESPAWN_X := -30.0
static func clouds(count: int, y: float, wrap_x: float, rng: RandomNumberGenerator) -> Node3D:
    var root := Node3D.new()
    root.name = "Clouds"
    root.set_meta("respawn_x", CLOUD_RESPAWN_X)
    # Near-white and opaque. The JS runs these at 0.94 alpha, but overlapping transparent
    # slabs sort badly and cost fill rate for a difference nobody can see against sky.
    var white := Color("f4f8ff")
    for _i in range(count):
        var g := Node3D.new()
        var bx := 0.0
        for _b in range(3 + int(rng.randf() * 3)):
            var w := _q(2.4 + rng.randf() * 2.8, 0.2)
            var h := _q(0.7 + rng.randf() * 0.5, 0.1)
            var d := _q(1.8 + rng.randf() * 2.2, 0.2)
            g.add_child(Voxel.box(Vector3(w, h, d), white,
                Vector3(bx, (rng.randf() - 0.5) * 0.36, (rng.randf() - 0.5) * 1.6)))
            bx += w * 0.55
        g.position = Vector3(
            rng.randf_range(CLOUD_RESPAWN_X, wrap_x),
            y + (rng.randf() - 0.5) * 5.0,
            rng.randf_range(-4.0, 58.0))
        g.set_meta("speed", 0.35 + rng.randf() * 0.45)
        root.add_child(g)
    return root


## Low kerb stones lining a lane's edges. road_cells is a Dictionary keyed by Vector2i
## (the caller's road set) so a neighbour that is also road leaves the join open — the
## stones then trace the outline of the whole route instead of boxing in every square.
##
## A densified lane revisits tiles, so edges are de-duplicated by their half-step position;
## without that a corner would stack three coincident stones and z-fight.
static func road_kerbs(lane: Array, road_cells: Dictionary, color: Color) -> Node3D:
    var root := Node3D.new()
    root.name = "RoadKerbs"
    var seen := {}
    var boxes: Array = []
    for p in lane:
        var t := Vector2i(roundi(p.x), roundi(p.y))
        for d: Vector2i in [Vector2i(0, -1), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(1, 0)]:
            if road_cells.has(t + d):
                continue
            var key := Vector2i(t.x * 2 + d.x, t.y * 2 + d.y)
            if seen.has(key):
                continue
            seen[key] = true
            # East/west edges run along Z and are thin in X; north/south the other way.
            var thin_x := d.x != 0
            boxes.append([
                Vector3(KERB_W if thin_x else 1.0, KERB_H, 1.0 if thin_x else KERB_W),
                Vector3(t.x + d.x * KERB_IN, GROUND_Y + KERB_H * 0.5, t.y + d.y * KERB_IN)])
    if boxes.is_empty():
        return root
    root.add_child(_slab_layer(boxes, color))
    return root
