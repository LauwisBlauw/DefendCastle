class_name Defender
extends Node3D
## A tower. Acquires the closest living enemy in range and fires on a cooldown.
## Projectiles are instant-hit here (the JS build has travel time); the slice keeps
## targeting + cooldown faithful because that is what the balance numbers depend on.

var type_name: String = "tower"
var range_r: float = 6.5
var rate: float = 1.05
var dmg: float = 3.0
var cooldown: float = 0.0
var kills: int = 0
var alive: bool = true

var _muzzle: MeshInstance3D
var _fire_flash: float = 0.0
var _enemies_ref: Callable

signal fired(from: Vector3, to: Vector3)

func setup(t: String, enemies_provider: Callable) -> void:
    type_name = t
    var s: Dictionary = Cfg.STATS.get(t, Cfg.STATS["tower"])
    range_r = float(s.get("range", 6.5))
    rate = float(s.get("rate", 1.0))
    dmg = float(s.get("dmg", 1))
    _enemies_ref = enemies_provider
    _build()

func _build() -> void:
    var stone := Color(0.42, 0.44, 0.50)
    var dark := Color(0.28, 0.30, 0.36)
    add_child(Voxel.box(Vector3(0.96, 0.16, 0.96), dark, Vector3(0, 0.08, 0)))
    add_child(Voxel.box(Vector3(0.78, 1.5, 0.78), stone, Vector3(0, 0.9, 0)))
    for c in [Vector3(0.34, 0, 0.34), Vector3(0.34, 0, -0.34), Vector3(-0.34, 0, 0.34), Vector3(-0.34, 0, -0.34)]:
        add_child(Voxel.box(Vector3(0.16, 1.9, 0.16), dark, Vector3(c.x, 1.05, c.z)))
    # crystal — the emitter, and the bit that flashes on fire
    _muzzle = Voxel.box(Vector3(0.3, 0.34, 0.3), Color(0.30, 0.85, 1.0), Vector3(0, 1.9, 0))
    var m := StandardMaterial3D.new()
    m.albedo_color = Color(0.30, 0.85, 1.0)
    m.emission_enabled = true
    m.emission = Color(0.15, 0.65, 1.0)
    m.emission_energy_multiplier = 1.2
    _muzzle.material_override = m
    add_child(_muzzle)

func _process(delta: float) -> void:
    if not alive:
        return
    if cooldown > 0.0:
        cooldown -= delta
    if _fire_flash > 0.0:
        _fire_flash = maxf(0.0, _fire_flash - delta * 4.0)
        _muzzle.scale = Vector3.ONE * (1.0 + _fire_flash * 0.5)
    if cooldown > 0.0 or not _enemies_ref.is_valid():
        return
    var target := _closest_in_range()
    if target == null:
        return
    cooldown = 1.0 / rate
    _fire_flash = 1.0
    fired.emit(_muzzle.global_position, target.global_position)
    target.take_damage(dmg)
    if not target.alive:
        kills += 1

func _closest_in_range() -> Enemy:
    var best: Enemy = null
    var best_d := range_r * range_r
    for e in _enemies_ref.call():
        if e == null or not is_instance_valid(e) or not e.alive:
            continue
        var d: float = global_position.distance_squared_to(e.global_position)
        if d <= best_d:
            best_d = d
            best = e
    return best
