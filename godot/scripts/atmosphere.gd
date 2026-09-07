class_name Atmosphere
extends RefCounted
## Biome atmosphere — 160 slow-drifting motes whose colour and motion match the realm:
## meadow pollen, desert dust, falling snow, rising embers, drifting ash, void motes,
## neon sparkles.
##
## The JS build is a THREE.Points cloud with a PointsMaterial. Godot has no cheap
## equivalent, so this is a MultiMeshInstance3D over a cached Voxel.box_mesh: one draw
## call for all 160 motes, which is the only number that matters on the mobile target.
## GPUParticles3D is deliberately not used — the drift is an explicit wrap-around
## formula that has to reproduce the JS frame for frame, and a process shader cannot
## express it.

const COUNT := 160

## The seven moods, lifted verbatim from _AIR_BIOME. Index order matches Cfg.BIOMES;
## the seventh (Vibe) has no entry in Cfg.BIOMES yet but exists in the JS table, so it
## is kept here rather than silently dropped — create() wraps the index over this table
## exactly like the JS `idx % _AIR_BIOME.length`.
const MOODS := [
    {"color": "f0ffb0", "op": 0.45, "size": 0.13, "vx": 0.25, "vy":  0.18, "sway": 0.6},  # Meadow — pollen
    {"color": "eed9a0", "op": 0.38, "size": 0.13, "vx": 1.10, "vy":  0.05, "sway": 0.4},  # Desert — wind-blown dust
    {"color": "ffffff", "op": 0.60, "size": 0.15, "vx": 0.25, "vy": -0.85, "sway": 0.7},  # Icelands — falling snow
    {"color": "ffa843", "op": 0.55, "size": 0.14, "vx": 0.15, "vy":  0.65, "sway": 0.5},  # Lava — rising embers
    {"color": "998d88", "op": 0.40, "size": 0.14, "vx": 0.30, "vy": -0.30, "sway": 0.4},  # Mordor — drifting ash
    {"color": "c77dff", "op": 0.50, "size": 0.14, "vx": 0.20, "vy":  0.30, "sway": 0.8},  # Doom — void motes
    {"color": "7df9ff", "op": 0.55, "size": 0.14, "vx": 0.40, "vy":  0.25, "sway": 1.0},  # Vibe — neon sparkles
]

# Wrap bounds, verbatim from updateAtmosphere(). The spawn box is slightly narrower in
# y (0.4 .. 8.0) than the wrap range, which is the JS behaviour too.
const X_MIN := -5.0
const X_MAX := 77.0
const Y_MIN := 0.3
const Y_MAX := 8.4
const Z_MIN := -5.0
const Z_MAX := 59.0

## 160 motes drifting over the whole board. biome_index selects the mood.
static func create(biome_index: int, rng: RandomNumberGenerator) -> MultiMeshInstance3D:
    var mood: Dictionary = MOODS[posmod(biome_index, MOODS.size())]

    var base := PackedVector3Array()
    var phase := PackedFloat32Array()
    var spd := PackedFloat32Array()
    base.resize(COUNT)
    phase.resize(COUNT)
    spd.resize(COUNT)
    # rng draws stay in the JS order (x, y, z, phase, speed) so a given seed produces
    # the same cloud in both builds.
    for i in COUNT:
        base[i] = Vector3(
            rng.randf() * 82.0 - 5.0,
            0.4 + rng.randf() * 7.6,
            rng.randf() * 64.0 - 5.0)
        phase[i] = rng.randf() * TAU
        spd[i] = 0.6 + rng.randf() * 0.8

    var mm := MultiMesh.new()
    mm.transform_format = MultiMesh.TRANSFORM_3D
    mm.mesh = Voxel.box_mesh(Vector3.ONE * float(mood["size"]))
    mm.instance_count = COUNT
    # Without this the server recomputes the cloud's bounds on every transform write —
    # 160 writes a frame, for a volume we already know.
    mm.custom_aabb = _board_aabb()

    var node := MultiMeshInstance3D.new()
    node.multimesh = mm
    # ghost_mat is unshaded + TRANSPARENCY_ALPHA; with the default DEPTH_DRAW_OPAQUE_ONLY
    # that already means no depth write, so the motes haze over the board instead of
    # occluding it. Nothing is overridden on the returned material — it is shared cache.
    node.material_override = Voxel.ghost_mat(Color(mood["color"]), float(mood["op"]))
    node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    # The JS sets frustumCulled = false. The equivalent here is a hand-set AABB spanning
    # the whole wrap volume, so the cloud is never culled while any of the board is in
    # view — the per-frame transforms would otherwise shrink it to wherever the motes are.
    node.custom_aabb = _board_aabb()

    node.set_meta("air_base", base)
    node.set_meta("air_phase", phase)
    node.set_meta("air_spd", spd)
    node.set_meta("air_vx", float(mood["vx"]))
    node.set_meta("air_vy", float(mood["vy"]))
    node.set_meta("air_sway", float(mood["sway"]))

    update(node, 0.0)
    return node

## Advance the drift. `t` is elapsed seconds; the caller passes its own clock so
## this stays correct in headless tests that drive time by hand.
static func update(node: MultiMeshInstance3D, t: float) -> void:
    if node == null or node.multimesh == null or not node.has_meta("air_base"):
        return
    # The drift is computed inline rather than through positions_at(). Calling that from
    # here allocated a fresh 160-element PackedVector3Array on every rendered frame — and
    # this runs on the RENDER clock, so it kept doing it while the game was paused.
    var base: PackedVector3Array = node.get_meta("air_base")
    var phase: PackedFloat32Array = node.get_meta("air_phase")
    var spd: PackedFloat32Array = node.get_meta("air_spd")
    var vx: float = node.get_meta("air_vx")
    var vy: float = node.get_meta("air_vy")
    var sway: float = node.get_meta("air_sway")
    var mm := node.multimesh
    var xf := Transform3D.IDENTITY
    for i in mini(base.size(), mm.instance_count):
        var s: float = spd[i]
        var ph: float = phase[i]
        var b: Vector3 = base[i]
        xf.origin = Vector3(
            _wrap(b.x + vx * t * s + sin(t * 0.5 + ph) * sway, X_MIN, X_MAX),
            _wrap(b.y + vy * t * s, Y_MIN, Y_MAX),
            _wrap(b.z + sin(t * 0.3 + ph) * sway * 0.7, Z_MIN, Z_MAX))
        mm.set_instance_transform(i, xf)

## Where every mote is at time `t`, computed from the stored base/phase/speed.
##
## Split out of update() so it is TESTABLE: the headless dummy renderer does not retain
## MultiMesh instance transforms, so reading them back after update() always yields the
## identity and asserts nothing. This returns the same values update() writes.
static func positions_at(node: MultiMeshInstance3D, t: float) -> PackedVector3Array:
    var out := PackedVector3Array()
    if node == null or not node.has_meta("air_base"):
        return out
    var base: PackedVector3Array = node.get_meta("air_base")
    var phase: PackedFloat32Array = node.get_meta("air_phase")
    var spd: PackedFloat32Array = node.get_meta("air_spd")
    var vx: float = node.get_meta("air_vx")
    var vy: float = node.get_meta("air_vy")
    var sway: float = node.get_meta("air_sway")
    out.resize(base.size())
    for i in base.size():
        var s: float = spd[i]
        var ph: float = phase[i]
        var b: Vector3 = base[i]
        out[i] = Vector3(
            _wrap(b.x + vx * t * s + sin(t * 0.5 + ph) * sway, X_MIN, X_MAX),
            _wrap(b.y + vy * t * s, Y_MIN, Y_MAX),
            _wrap(b.z + sin(t * 0.3 + ph) * sway * 0.7, Z_MIN, Z_MAX))
    return out

## _airWrap: a true modulo into [min, max), so a mote leaving one edge re-enters the
## other. A clamp would pile every mote against the wall instead.
static func _wrap(v: float, vmin: float, vmax: float) -> float:
    return fposmod(v - vmin, vmax - vmin) + vmin

static func _board_aabb() -> AABB:
    return AABB(Vector3(X_MIN, Y_MIN, Z_MIN),
        Vector3(X_MAX - X_MIN, Y_MAX - Y_MIN, Z_MAX - Z_MIN))
