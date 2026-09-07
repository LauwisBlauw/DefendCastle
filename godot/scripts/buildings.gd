class_name Buildings
extends RefCounted
## The medieval village props — the seven scenery buildings plus the well.
##
## Ported from the JS `_mb*` builders. Each one is boxes only, built at local origin
## with its footprint centred on (0,0) and its floor on y=0, so the caller can place
## and spin it freely — the JS `_wrapMB` did exactly that (position, random yaw, then
## push a static obstacle), and keeping the split means the placement rules live with
## the level generator instead of in here.
##
## Colours are the JS `M.town*` palette verbatim.

## Every building kind this module can produce.
const KINDS := ["cottage", "farmhouse", "windmill", "blacksmith", "tavern", "chapel", "watchtower", "well"]

# ── Town palette (M.town* in the JS) ─────────────────────────────────────────
const C_STONE   := Color("8a8070")
const C_STONE_D := Color("58504a")
const C_PLASTER := Color("ddd4b8")
const C_PLANKS  := Color("6a4c28")
const C_BEAM    := Color("3a2510")
const C_DOOR    := Color("4a3020")
const C_SIGN    := Color("6a4820")
const C_THATCH  := Color("b8904a")
const C_THATCH_D := Color("8a6a30")
const C_TILE_R  := Color("8a3018")
const C_ROOF    := Color("7a3520")
const C_IRON    := Color("282830")
const C_METAL   := Color("3c3c4a")
const C_WIN     := Color("ffe090")
const C_WIN_GLOW := Color("ffaa00")
const C_FORGE   := Color("ff5500")
const C_FORGE_GLOW := Color("ff2200")

## The JS pushes the same obstacle radius for every building it wraps; only the well
## is smaller. Units path around these, so the value is gameplay, not art.
const R_BUILDING := 0.60
const R_WELL := 0.42


# ═════════════════════════════════════════════════════════════════════════════
#  PUBLIC API
# ═════════════════════════════════════════════════════════════════════════════

## Build one, unpositioned and unrotated, at local origin. The caller places it.
static func build(kind: String, rng: RandomNumberGenerator) -> Node3D:
    var g := Node3D.new()
    g.name = kind.capitalize()
    match kind:
        "cottage":    _cottage(g, rng)
        "farmhouse":  _farmhouse(g, rng)
        "windmill":   _windmill(g, rng)
        "blacksmith": _blacksmith(g, rng)
        "tavern":     _tavern(g, rng)
        "chapel":     _chapel(g, rng)
        "watchtower": _watchtower(g, rng)
        "well":       _well(g)
        _:            _cottage(g, rng)
    return g


## Pick one at random from KINDS, excluding "well" which the JS places separately.
static func build_random(rng: RandomNumberGenerator) -> Node3D:
    var pool := KINDS.slice(0, KINDS.size() - 1)
    var kind: String = pool[int(rng.randf() * pool.size())]
    return build(kind, rng)




# ═════════════════════════════════════════════════════════════════════════════
#  HELPERS
# ═════════════════════════════════════════════════════════════════════════════

static func _add(parent: Node3D, size: Vector3, color: Color, pos: Vector3) -> MeshInstance3D:
    var mi := Voxel.box(size, color, pos)
    parent.add_child(mi)
    return mi


## Beams that are not axis-aligned (roof braces, windmill blades) are the only rotated
## boxes in the whole village, so they get their own helper rather than a rotation
## argument on _add that 200 other calls would have to pass zero for.
static func _add_rot(parent: Node3D, size: Vector3, color: Color, pos: Vector3, rot_z: float) -> MeshInstance3D:
    var mi := _add(parent, size, color, pos)
    mi.rotation.z = rot_z
    return mi


## Lit windows. Every one in the village shares a single emissive material, which is
## why they go through here instead of Voxel.box.
static func _add_win(parent: Node3D, size: Vector3, pos: Vector3) -> MeshInstance3D:
    var mi := _add(parent, size, C_WIN, pos)
    mi.material_override = Voxel.emissive_mat(C_WIN, C_WIN_GLOW, 1.4)
    return mi


## The shared half-timbered facade: corner posts, two rails and a crossed pair of
## braces, applied to the face at z = dz. Cottage and tavern both dress their fronts
## and backs with it, which is what makes them read as the same village.
static func _timber_front(g: Node3D, w: float, h: float, dz: float, base_h: float) -> void:
    for px in [-w * 0.5, w * 0.5]:
        _add(g, Vector3(0.065, h, 0.065), C_BEAM, Vector3(px, h * 0.5, dz))
    for ry in [base_h + 0.02, h - 0.07]:
        _add(g, Vector3(w + 0.06, 0.065, 0.065), C_BEAM, Vector3(0, ry, dz))
    var u_h := h - base_h
    var diag_len := sqrt(pow(w * 0.44, 2.0) + pow(u_h * 0.46, 2.0))
    var diag_ang := atan2(u_h * 0.46, w * 0.44)
    for side in [-1.0, 1.0]:
        _add_rot(g, Vector3(diag_len, 0.055, 0.055), C_BEAM,
            Vector3(0, base_h + u_h * 0.5, dz), diag_ang * side)


## Every roof in the village is a stack of shrinking slabs — cheaper than a real
## pitched mesh and it keeps the chunky voxel read at the game camera distance.
static func _slab_roof(g: Node3D, w: float, d: float, color: Color,
        steps: int, y0: float, step_h: float, spread: float) -> void:
    for s in range(steps):
        var t := 1.0 - float(s) / float(steps)
        _add(g, Vector3(w * t * spread, step_h, d * t * spread), color,
            Vector3(0, y0 + s * step_h, 0))


# ═════════════════════════════════════════════════════════════════════════════
#  BUILDERS
# ═════════════════════════════════════════════════════════════════════════════

## 1. Cottage — stone base, plaster upper, half-timbered on all four faces, steep
## thatch and an oversized chimney. The workhorse: the level generator places more
## of these than everything else combined.
static func _cottage(g: Node3D, rng: RandomNumberGenerator) -> void:
    var w := 1.0 + rng.randf() * 0.28
    var d := 0.72 + rng.randf() * 0.22
    var h := 0.92 + rng.randf() * 0.28
    var base_h := 0.28

    _add(g, Vector3(w + 0.1, 0.12, d + 0.1), C_STONE_D, Vector3(0, 0.06, 0))
    _add(g, Vector3(w, base_h, d), C_STONE, Vector3(0, 0.12 + base_h * 0.5, 0))
    var u_h := h - 0.12 - base_h
    _add(g, Vector3(w, u_h, d), C_PLASTER, Vector3(0, 0.12 + base_h + u_h * 0.5, 0))

    for dz in [d * 0.5, -d * 0.5]:
        _timber_front(g, w, h, dz, 0.12 + base_h)
    # Side framing: corner posts doubled on both faces, plus rails running in z.
    for pz in [d * 0.5, -d * 0.5]:
        for px in [-w * 0.5, w * 0.5]:
            _add(g, Vector3(0.065, h, 0.065), C_BEAM, Vector3(px, h * 0.5, pz))
    for ry in [0.12 + base_h, h - 0.07]:
        for px in [-w * 0.5, w * 0.5]:
            _add(g, Vector3(0.065, 0.065, d + 0.06), C_BEAM, Vector3(px, ry, 0))

    _slab_roof(g, w, d, C_THATCH, 5, h, 0.15, 1.3)
    _add(g, Vector3(0.12, 0.10, d * 0.18), C_THATCH_D, Vector3(0, h + 5 * 0.15 - 0.02, 0))

    var ch_x := w * (0.28 if rng.randf() > 0.5 else -0.28)
    var ch_h := 0.42 + rng.randf() * 0.22
    _add(g, Vector3(0.22, h + ch_h, 0.22), C_STONE, Vector3(ch_x, (h + ch_h) * 0.5, 0))
    _add(g, Vector3(0.26, 0.07, 0.26), C_STONE, Vector3(ch_x, h + ch_h, 0))
    _add(g, Vector3(0.11, 0.14, 0.11), C_STONE_D, Vector3(ch_x, h + ch_h + 0.10, 0))

    var w_y := 0.12 + base_h + u_h * 0.52
    var win_xs := [w * 0.26]
    if w > 1.0:
        win_xs.append(-w * 0.26)
    for wx in win_xs:
        var fz := d * 0.5 + 0.02
        _add_win(g, Vector3(0.21, 0.25, 0.06), Vector3(wx, w_y, fz))
        _add(g, Vector3(0.26, 0.055, 0.065), C_BEAM, Vector3(wx, w_y - 0.15, fz))
        _add(g, Vector3(0.26, 0.055, 0.065), C_BEAM, Vector3(wx, w_y + 0.15, fz))
        _add(g, Vector3(0.055, 0.26, 0.065), C_BEAM, Vector3(wx - 0.13, w_y, fz))
        _add(g, Vector3(0.055, 0.26, 0.065), C_BEAM, Vector3(wx + 0.13, w_y, fz))

    var d_w := 0.27
    var d_h := 0.44
    _add(g, Vector3(d_w, d_h, 0.06), C_DOOR, Vector3(0, d_h * 0.5, d * 0.5 + 0.02))
    for dy in [0.10, 0.30]:
        _add(g, Vector3(d_w + 0.02, 0.04, 0.07), C_IRON, Vector3(0, dy, d * 0.5 + 0.03))
    _add(g, Vector3(d_w + 0.10, 0.11, 0.08), C_STONE, Vector3(0, d_h + 0.055, d * 0.5 + 0.02))
    _add(g, Vector3(0.36, 0.07, 0.18), C_STONE_D, Vector3(0, 0.035, d * 0.5 + 0.12))


## 2. Farmhouse — wider and lower than the cottage, plank-walled barn framing, with
## hay bales and a fence stub outside so it reads as a working yard.
static func _farmhouse(g: Node3D, rng: RandomNumberGenerator) -> void:
    var w := 1.35 + rng.randf() * 0.25
    var d := 1.0 + rng.randf() * 0.2
    var h := 0.82 + rng.randf() * 0.18

    _add(g, Vector3(w + 0.12, 0.13, d + 0.12), C_STONE_D, Vector3(0, 0.065, 0))
    _add(g, Vector3(w, 0.30, d), C_STONE, Vector3(0, 0.13 + 0.15, 0))
    var u_h := h - 0.13 - 0.30
    _add(g, Vector3(w, u_h, d), C_PLANKS, Vector3(0, 0.43 + u_h * 0.5, 0))

    for px in [-w * 0.5, w * 0.5]:
        _add(g, Vector3(0.09, h + 0.12, 0.09), C_BEAM, Vector3(px, (h + 0.12) * 0.5, 0))
    for ry in [0.42, h - 0.06]:
        _add(g, Vector3(w + 0.10, 0.08, 0.08), C_BEAM, Vector3(0, ry, d * 0.5 + 0.01))
        _add(g, Vector3(w + 0.10, 0.08, 0.08), C_BEAM, Vector3(0, ry, -d * 0.5 - 0.01))
    # King-post truss: a shallow V across the gable front.
    var rise := (h - 0.42) * 0.36
    for dx in [w * 0.3, -w * 0.3]:
        var b_len: float = sqrt(dx * dx + rise * rise) + 0.1
        _add_rot(g, Vector3(b_len, 0.07, 0.07), C_BEAM,
            Vector3(dx * 0.5, 0.42 + (h - 0.42) * 0.18, d * 0.5 + 0.02),
            atan2(rise, dx) * (-1.0 if dx > 0.0 else 1.0))

    _slab_roof(g, w, d, C_THATCH, 3, h, 0.18, 1.32)
    _add(g, Vector3(w * 0.14, 0.10, d * 0.3), C_THATCH_D, Vector3(0, h + 3 * 0.18 - 0.02, 0))

    var d_h := 0.52
    var d_w := 0.52
    for i in range(2):
        var dx := (-d_w * 0.5) if i == 0 else (d_w * 0.5)
        _add(g, Vector3(d_w, d_h, 0.065), C_PLANKS, Vector3(dx, d_h * 0.5, d * 0.5 + 0.02))
        var hinge := dx + (d_w * 0.5 - 0.02 if i == 0 else -d_w * 0.5 + 0.02)
        _add(g, Vector3(0.04, d_h + 0.04, 0.075), C_IRON, Vector3(hinge, d_h * 0.5, d * 0.5 + 0.03))
    _add(g, Vector3(d_w * 2.1, 0.10, 0.08), C_BEAM, Vector3(0, d_h + 0.05, d * 0.5 + 0.02))
    _add_win(g, Vector3(0.24, 0.20, 0.06), Vector3(w * 0.32, 0.43 + u_h * 0.5, d * 0.5 + 0.02))

    for hz in [d * 0.5 + 0.22, d * 0.5 + 0.46]:
        var hx := w * 0.52 + 0.15
        _add(g, Vector3(0.28, 0.28, 0.28), C_THATCH, Vector3(hx, 0.14, hz))
        _add(g, Vector3(0.30, 0.055, 0.06), C_BEAM, Vector3(hx, 0.18, hz))

    for fi in range(3):
        _add(g, Vector3(0.06, 0.36, 0.06), C_BEAM, Vector3(-w * 0.5 - 0.06, 0.18, -d * 0.5 + fi * 0.34))
    _add(g, Vector3(0.05, 0.06, d * 0.55), C_BEAM, Vector3(-w * 0.5 - 0.06, 0.26, -d * 0.25))


## 3. Windmill — the village's tallest landmark. The blades live under a child named
## "Sails"; the caller spins that node about its LOCAL Z to animate them (this module
## has no _process and never touches the tree).
static func _windmill(g: Node3D, rng: RandomNumberGenerator) -> void:
    var t_r := 0.56 + rng.randf() * 0.14
    var h := 2.2 + rng.randf() * 0.7

    # Tapered tower: three stacked sections, each narrower than the one below.
    for sec in [Vector3(1.0, 0.0, 0.38), Vector3(0.88, 0.38, 0.36), Vector3(0.76, 0.74, 0.26)]:
        _add(g, Vector3(t_r * 2.0 * sec.x, h * sec.z, t_r * 2.0 * sec.x), C_STONE,
            Vector3(0, h * sec.y + h * sec.z * 0.5, 0))

    for qi in range(4):
        var ang := qi * PI * 0.5 + PI * 0.25
        _add(g, Vector3(0.10, h * 0.62, 0.10), C_STONE_D,
            Vector3(cos(ang) * t_r * 0.95, h * 0.31, sin(ang) * t_r * 0.95))

    _add(g, Vector3(t_r * 2.1, 0.15, t_r * 2.1), C_BEAM, Vector3(0, h + 0.04, 0))
    _slab_roof(g, t_r, t_r, C_THATCH, 6, h + 0.15, 0.14, 1.85)

    _add(g, Vector3(0.28, 0.46, 0.07), C_DOOR, Vector3(0, 0.23, t_r + 0.02))
    _add(g, Vector3(0.36, 0.12, 0.08), C_STONE, Vector3(0, 0.52, t_r + 0.02))
    for wi in range(3):
        _add_win(g, Vector3(0.09, 0.30, 0.07), Vector3(0, h * (0.25 + wi * 0.22), t_r * 0.76 + 0.01))

    var hub_y := h * 0.62
    var hub_z := t_r * 0.76 + 0.10
    _add(g, Vector3(0.18, 0.18, 0.18), C_IRON, Vector3(0, hub_y, hub_z + 0.02))

    var sails := Node3D.new()
    sails.name = "Sails"
    sails.position = Vector3(0, hub_y, hub_z)
    g.add_child(sails)
    var sail_len := 1.05 + rng.randf() * 0.28
    var sail_angle := rng.randf() * PI * 0.25
    # Two crossed arms, not four: the JS loops 4 quarter-turns over boxes centred on
    # the hub, so half of them land exactly on top of the other half. One arm per axis
    # gives the identical silhouette at half the geometry, and the planks are parented
    # to the arm so they turn with it instead of staying upright.
    for ai in range(2):
        var ang := ai * PI * 0.5 + sail_angle
        var arm := Node3D.new()
        arm.rotation.z = ang
        sails.add_child(arm)
        _add(arm, Vector3(0.075, sail_len * 1.1, 0.075), C_BEAM, Vector3.ZERO)
        for pi in range(3):
            _add(arm, Vector3(0.14, sail_len * 0.78, 0.04), C_PLANKS, Vector3((pi - 1) * 0.16, 0, 0.04))
        _add_rot(sails, Vector3(sail_len * 0.55, 0.055, 0.055), C_BEAM, Vector3.ZERO, ang + PI * 0.25)

    _add(g, Vector3(t_r * 2.3, 0.10, t_r * 2.3), C_PLANKS, Vector3(0, 0.05, 0))


## 4. Blacksmith — all stone, heavy chimney, and the one emissive forge mouth that
## makes it identifiable from across the map at night.
static func _blacksmith(g: Node3D, rng: RandomNumberGenerator) -> void:
    var w := 1.2 + rng.randf() * 0.25
    var d := 0.92 + rng.randf() * 0.2
    var h := 0.76 + rng.randf() * 0.22

    _add(g, Vector3(w + 0.12, 0.14, d + 0.12), C_STONE_D, Vector3(0, 0.07, 0))
    _add(g, Vector3(w, h, d), C_STONE, Vector3(0, 0.14 + h * 0.5, 0))
    for px in [-w * 0.5, w * 0.5]:
        _add(g, Vector3(0.10, h + 0.14, 0.10), C_BEAM, Vector3(px, (h + 0.14) * 0.5, 0))
    _add(g, Vector3(w + 0.10, 0.10, 0.10), C_BEAM, Vector3(0, h + 0.09, d * 0.5))

    _slab_roof(g, w, d, C_THATCH, 3, h + 0.14, 0.16, 1.38)

    var ch_h := 0.65 + rng.randf() * 0.3
    var ch_x := -w * 0.30
    _add(g, Vector3(0.30, h + 0.14 + ch_h, 0.30), C_STONE, Vector3(ch_x, (h + 0.14 + ch_h) * 0.5, 0))
    _add(g, Vector3(0.36, 0.08, 0.36), C_STONE_D, Vector3(ch_x, h + 0.14 + ch_h, 0))
    var glow := _add(g, Vector3(0.12, 0.10, 0.32), C_FORGE, Vector3(ch_x, 0.18, 0))
    glow.material_override = Voxel.emissive_mat(C_FORGE, C_FORGE_GLOW, 1.8)

    var d_h := 0.56
    var d_w := 0.28
    for dx in [-d_w * 0.5, d_w * 0.5]:
        _add(g, Vector3(d_w, d_h, 0.07), C_DOOR, Vector3(dx, d_h * 0.5 + 0.14, d * 0.5 + 0.02))
        for sy in [0.22, 0.50]:
            _add(g, Vector3(d_w + 0.02, 0.05, 0.08), C_IRON, Vector3(dx, sy + 0.14, d * 0.5 + 0.03))
    _add(g, Vector3(d_w * 2 + 0.14, 0.12, 0.10), C_BEAM, Vector3(0, d_h + 0.21, d * 0.5 + 0.02))

    var win_x := w * 0.32
    var win_y := 0.14 + h * 0.62
    _add_win(g, Vector3(0.22, 0.20, 0.06), Vector3(win_x, win_y, d * 0.5 + 0.02))
    for bi in range(-1, 2):
        _add(g, Vector3(0.04, 0.22, 0.07), C_IRON, Vector3(win_x + bi * 0.07, win_y, d * 0.5 + 0.02))

    # Anvil on its stump, plus a barrel — the props that sell the trade.
    var ax := w * 0.45
    var az := d * 0.5 + 0.26
    _add(g, Vector3(0.20, 0.18, 0.20), C_BEAM, Vector3(ax, 0.09 + 0.14, az))
    _add(g, Vector3(0.22, 0.09, 0.16), C_IRON, Vector3(ax, 0.045 + 0.14, az))
    _add(g, Vector3(0.18, 0.08, 0.13), C_IRON, Vector3(ax, 0.17 + 0.14, az))
    _add(g, Vector3(0.10, 0.06, 0.08), C_METAL, Vector3(ax + 0.12, 0.15 + 0.14, az))
    _add(g, Vector3(0.18, 0.24, 0.18), C_BEAM, Vector3(-w * 0.44, 0.12 + 0.14, d * 0.5 + 0.20))
    _add(g, Vector3(0.20, 0.04, 0.20), C_STONE_D, Vector3(-w * 0.44, 0.26 + 0.14, d * 0.5 + 0.20))


## 5. Tavern — two storeys, the upper one jettied out over the lower on all sides,
## with a tiled roof and a hanging sign. The overhang is the whole point: it is what
## separates it from the cottage at a glance.
static func _tavern(g: Node3D, rng: RandomNumberGenerator) -> void:
    var w := 1.1 + rng.randf() * 0.3
    var d := 0.82 + rng.randf() * 0.25
    var h1 := 0.72
    var h2 := 0.68 + rng.randf() * 0.2

    _add(g, Vector3(w + 0.10, 0.13, d + 0.10), C_STONE_D, Vector3(0, 0.065, 0))
    _add(g, Vector3(w, h1, d), C_STONE, Vector3(0, 0.13 + h1 * 0.5, 0))
    _add(g, Vector3(w + 0.22, 0.10, d + 0.22), C_BEAM, Vector3(0, 0.13 + h1, 0))

    var ow := w + 0.20
    var od := d + 0.20
    _add(g, Vector3(ow, h2, od), C_PLASTER, Vector3(0, 0.13 + h1 + h2 * 0.5 + 0.10, 0))
    var u_base := 0.13 + h1 + 0.10
    _timber_front(g, ow, u_base + h2, d * 0.5 + 0.12, u_base)
    for px in [-w * 0.5 - 0.10, w * 0.5 + 0.10]:
        var post_h := 0.13 + h1 + h2 + 0.14
        _add(g, Vector3(0.07, post_h, 0.07), C_BEAM, Vector3(px, post_h * 0.5, 0))

    _slab_roof(g, ow, od, C_TILE_R, 5, 0.13 + h1 + h2 + 0.10, 0.14, 1.18)

    var ch_h := 0.38 + rng.randf() * 0.18
    var ch_base := 0.13 + h1 + h2 + 0.10
    _add(g, Vector3(0.20, ch_base + ch_h, 0.20), C_STONE, Vector3(w * 0.28, (ch_base + ch_h) * 0.5, 0))
    _add(g, Vector3(0.24, 0.07, 0.24), C_STONE_D, Vector3(w * 0.28, ch_base + ch_h, 0))

    var g_wy := 0.13 + h1 * 0.55
    for wx in [-w * 0.28, w * 0.28]:
        _add_win(g, Vector3(0.22, 0.28, 0.06), Vector3(wx, g_wy, d * 0.5 + 0.02))
        _add(g, Vector3(0.26, 0.055, 0.065), C_BEAM, Vector3(wx, g_wy - 0.17, d * 0.5 + 0.02))
        _add(g, Vector3(0.26, 0.055, 0.065), C_BEAM, Vector3(wx, g_wy + 0.17, d * 0.5 + 0.02))
    _add(g, Vector3(0.28, 0.52, 0.07), C_DOOR, Vector3(0, 0.26 + 0.13, d * 0.5 + 0.02))
    _add(g, Vector3(0.36, 0.13, 0.08), C_STONE, Vector3(0, 0.65 + 0.13, d * 0.5 + 0.02))

    var u_wy := 0.13 + h1 + 0.10 + h2 * 0.52
    for wx in [-w * 0.34, 0.0, w * 0.34]:
        _add_win(g, Vector3(0.20, 0.26, 0.06), Vector3(wx, u_wy, od * 0.5 + 0.02))
        _add(g, Vector3(0.24, 0.055, 0.065), C_BEAM, Vector3(wx, u_wy - 0.15, od * 0.5 + 0.02))

    var sx := w * 0.44
    _add(g, Vector3(0.055, 0.38, 0.055), C_BEAM, Vector3(sx, 0.13 + h1 + 0.30, d * 0.5 + 0.16))
    _add(g, Vector3(0.055, 0.055, 0.30), C_BEAM, Vector3(sx, 0.13 + h1 + 0.44, d * 0.5 + 0.16))
    _add(g, Vector3(0.38, 0.18, 0.06), C_SIGN, Vector3(sx, 0.13 + h1 + 0.26, d * 0.5 + 0.30))

    _add(g, Vector3(0.38, 0.07, 0.16), C_STONE_D, Vector3(0, 0.035, d * 0.5 + 0.12))
    for bx in [-w * 0.46, w * 0.46]:
        _add(g, Vector3(0.17, 0.26, 0.17), C_BEAM, Vector3(bx, 0.14, d * 0.5 + 0.18))
        _add(g, Vector3(0.19, 0.04, 0.19), C_STONE_D, Vector3(bx, 0.29, d * 0.5 + 0.18))


## 6. Stone chapel — narrow, tall, quoined, with a bell tower over the entrance and a
## cross on the ridge.
static func _chapel(g: Node3D, rng: RandomNumberGenerator) -> void:
    var w := 0.72 + rng.randf() * 0.14
    var d := 1.05 + rng.randf() * 0.25
    var h := 1.15 + rng.randf() * 0.35

    _add(g, Vector3(w + 0.10, 0.14, d + 0.10), C_STONE_D, Vector3(0, 0.07, 0))
    _add(g, Vector3(w, h, d), C_STONE, Vector3(0, 0.14 + h * 0.5, 0))
    for px in [w * 0.5, -w * 0.5]:
        for pz in [d * 0.5, -d * 0.5]:
            _add(g, Vector3(0.10, h + 0.14, 0.10), C_STONE_D, Vector3(px, (h + 0.14) * 0.5, pz))

    _slab_roof(g, w, d, C_TILE_R, 6, h + 0.14, 0.14, 1.20)

    var bt_w := w * 0.56
    var bt_h := 0.52 + rng.randf() * 0.18
    var bt_base := h + 0.14
    var bt_z := d * 0.5 - bt_w * 0.45
    _add(g, Vector3(bt_w, bt_h, bt_w), C_STONE, Vector3(0, bt_base + bt_h * 0.5, bt_z))
    _add_win(g, Vector3(bt_w * 0.45, bt_h * 0.5, 0.06), Vector3(0, bt_base + bt_h * 0.6, bt_z + bt_w * 0.5))
    for s in range(4):
        var t := 1.0 - float(s) / 4.0
        _add(g, Vector3(bt_w * t * 1.12, 0.12, bt_w * t * 1.12), C_TILE_R,
            Vector3(0, bt_base + bt_h + s * 0.12, bt_z))

    var peak_y := h + 0.14 + 6 * 0.14
    _add(g, Vector3(0.06, 0.32, 0.06), C_BEAM, Vector3(0, peak_y + 0.16, 0))
    _add(g, Vector3(0.26, 0.06, 0.06), C_BEAM, Vector3(0, peak_y + 0.26, 0))

    # Lancet windows: one on the gable front, one per side wall. The JS puts the side
    # pair at x = ±0.32w, which is buried inside the nave and never shows — they sit on
    # the wall face here instead, thin axis turned to match.
    var w_y := 0.14 + h * 0.52
    _add_win(g, Vector3(0.15, 0.34, 0.06), Vector3(0, w_y, d * 0.5 + 0.02))
    _add_win(g, Vector3(0.15, 0.10, 0.06), Vector3(0, w_y + 0.24, d * 0.5 + 0.02))
    for px in [w * 0.5 + 0.01, -w * 0.5 - 0.01]:
        _add_win(g, Vector3(0.06, 0.34, 0.15), Vector3(px, w_y, 0))
        _add_win(g, Vector3(0.06, 0.10, 0.15), Vector3(px, w_y + 0.24, 0))

    var d_h := 0.48
    var d_w := 0.24
    _add(g, Vector3(d_w, d_h, 0.07), C_DOOR, Vector3(0, 0.14 + d_h * 0.5, d * 0.5 + 0.02))
    _add(g, Vector3(d_w + 0.12, 0.14, 0.09), C_STONE, Vector3(0, 0.14 + d_h + 0.07, d * 0.5 + 0.02))
    _add(g, Vector3(0.40, 0.07, 0.18), C_STONE_D, Vector3(0, 0.035, d * 0.5 + 0.12))


## 7. Watchtower — the other tall landmark. Square, battlemented, with arrow slits on
## every face so it reads from any approach angle.
static func _watchtower(g: Node3D, rng: RandomNumberGenerator) -> void:
    var t_w := 0.70 + rng.randf() * 0.18
    var h := 2.4 + rng.randf() * 0.8

    _add(g, Vector3(t_w, h * 0.6, t_w), C_STONE, Vector3(0, h * 0.3, 0))
    _add(g, Vector3(t_w * 0.92, h * 0.4, t_w * 0.92), C_STONE, Vector3(0, h * 0.8, 0))
    for ry in [h * 0.33, h * 0.66]:
        _add(g, Vector3(t_w + 0.06, 0.07, t_w + 0.06), C_STONE_D, Vector3(0, ry, 0))

    var pw := t_w + 0.22
    _add(g, Vector3(pw, 0.16, pw), C_STONE, Vector3(0, h + 0.08, 0))

    for face in range(4):
        var ang := face * PI * 0.5
        var fx := cos(ang) * pw * 0.5
        var fz := sin(ang) * pw * 0.5
        for mi in range(-1, 2):
            var tx := cos(ang + PI * 0.5) * mi * pw * 0.28
            var tz := sin(ang + PI * 0.5) * mi * pw * 0.28
            _add(g, Vector3(0.18, 0.30, 0.18), C_STONE, Vector3(fx + tx, h + 0.31, fz + tz))
        # The slit's thin axis has to follow the face normal, hence the size swap.
        var slit_size := Vector3(0.09, 0.28, t_w * 0.5) if face % 2 == 0 else Vector3(t_w * 0.5, 0.28, 0.09)
        _add_win(g, slit_size, Vector3(fx * 0.72, h * 0.55, fz * 0.72))

    _slab_roof(g, t_w, t_w, C_TILE_R, 5, h + 0.16, 0.16, 0.9)

    var d_h := 0.50
    var d_w := 0.24
    _add(g, Vector3(d_w, d_h, 0.08), C_DOOR, Vector3(0, d_h * 0.5, t_w * 0.5 + 0.02))
    for bi in range(-1, 2):
        _add(g, Vector3(0.04, d_h, 0.09), C_IRON, Vector3(bi * 0.08, d_h * 0.5, t_w * 0.5 + 0.03))
    _add(g, Vector3(d_w + 0.14, 0.14, 0.10), C_STONE, Vector3(0, d_h + 0.07, t_w * 0.5 + 0.02))

    for wy in [h * 0.35, h * 0.65]:
        _add_win(g, Vector3(0.09, 0.28, 0.08), Vector3(0, wy, t_w * 0.5 + 0.01))


## 8. Well — placed on its own by the JS rather than through the random building pool,
## and the only prop with a smaller obstacle radius. Takes no rng: it is identical
## every time, the yaw the caller applies is the only variation.
static func _well(g: Node3D) -> void:
    for sx in [0.25, -0.25]:
        for sz in [0.25, -0.25]:
            _add(g, Vector3(0.2, 0.4, 0.2), C_STONE, Vector3(sx, 0.2, sz))
    _add(g, Vector3(0.72, 0.06, 0.72), C_STONE, Vector3(0, 0.43, 0))
    for px in [-0.28, 0.28]:
        _add(g, Vector3(0.07, 0.46, 0.07), C_BEAM, Vector3(px, 0.66, 0))
    _add(g, Vector3(0.62, 0.07, 0.07), C_BEAM, Vector3(0, 0.89, 0))
    _add(g, Vector3(0.7, 0.06, 0.18), C_ROOF, Vector3(0, 0.95, 0))
    _add(g, Vector3(0.18, 0.06, 0.7), C_ROOF, Vector3(0, 0.95, 0))
    _add(g, Vector3(0.03, 0.26, 0.03), C_BEAM, Vector3(0, 0.76, 0))
    _add(g, Vector3(0.1, 0.1, 0.1), C_METAL, Vector3(0, 0.6, 0))
