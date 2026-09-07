class_name Projectile
extends Node3D
## A shot in flight. Homes on its target; if that target dies mid-flight an AoE shot
## coasts to the last-known impact point and still detonates rather than fizzling in
## mid-air, which is what the JS does and what makes catapults feel reliable.

const SPEC := {
    "arrow":  {"size": Vector3(0.09, 0.09, 0.42), "color": "ffdd88", "glow": 0.0},
    "bolt":   {"size": Vector3(0.13, 0.13, 0.46), "color": "55e6ff", "glow": 2.2},
    "bbolt":  {"size": Vector3(0.14, 0.14, 0.70), "color": "ffcc44", "glow": 1.6},
    "rock":   {"size": Vector3(0.30, 0.30, 0.30), "color": "99752a", "glow": 0.0},
    "magic":  {"size": Vector3(0.24, 0.24, 0.24), "color": "cc66ff", "glow": 2.6},
    "eArrow": {"size": Vector3(0.08, 0.08, 0.38), "color": "cc9955", "glow": 0.0},
    "eMagic": {"size": Vector3(0.22, 0.22, 0.22), "color": "ff3322", "glow": 2.4},
    "eRock":  {"size": Vector3(0.32, 0.32, 0.32), "color": "6a6258", "glow": 0.0},
}

var kind: String = "arrow"
var speed: float = 12.0
var dmg: float = 3.0
var aoe: float = 0.0
var alive: bool = true
var from_enemy: bool = false

var target_enemy: Enemy = null
var target_def: Defender = null
var source_def: Defender = null
var source_enemy: Enemy = null

var pierce_left: int = 0
var _pierced: Array = []
var _slow: Dictionary = {}
var _last_seen := Vector3.ZERO
var _has_last := false
var _game: Node = null

func setup_player_shot(src: Defender, tgt: Enemy, k: String, d: float, splash: float, game: Node) -> void:
    kind = k
    dmg = d
    aoe = splash
    source_def = src
    target_enemy = tgt
    _game = game
    # A wall has no pSpeed in the stats table, and the JS falls back to 8 for it — a 12
    # default made upgraded-wall shots outrun the archer they are modelled on.
    speed = float(Cfg.STATS.get(src.type_name, {}).get("pSpeed", 8))
    # A mage orb chills what it hits; a ballista bolt punches through two extra bodies.
    if src.type_name == "mage":
        _slow = {"duration": 2.5, "amount": 0.4}
    if src.type_name == "ballista":
        pierce_left = 2
    _build()

func setup_enemy_shot(src: Enemy, tgt: Defender, k: String, d: float, splash: float, game: Node) -> void:
    kind = k
    dmg = d
    aoe = splash
    from_enemy = true
    source_enemy = src
    target_def = tgt
    _game = game
    speed = 11.0 if k == "eArrow" else (8.0 if k == "eMagic" else 7.0)
    _build()

func _build() -> void:
    var spec: Dictionary = SPEC.get(kind, SPEC["arrow"])
    var mi := Voxel.box(spec["size"], Color(spec["color"]))
    if float(spec["glow"]) > 0.0:
        mi.material_override = Voxel.emissive_mat(Color(spec["color"]), Color(spec["color"]), float(spec["glow"]))
    add_child(mi)

func _aim_point() -> Vector3:
    if from_enemy:
        if target_def != null and is_instance_valid(target_def) and target_def.alive:
            _last_seen = target_def.global_position + Vector3(0, 0.8, 0)
            _has_last = true
            return _last_seen
    else:
        if target_enemy != null and is_instance_valid(target_enemy) and target_enemy.alive:
            _last_seen = target_enemy.global_position + Vector3(0, 0.8 * target_enemy.scale_f, 0)
            _has_last = true
            return _last_seen
    # Target gone. A splash shot coasts to where it last saw them; a direct shot fizzles.
    if aoe > 0.0 and _has_last:
        return _last_seen
    alive = false
    return global_position

func tick(dt: float) -> void:
    if not alive:
        return
    var aim: Vector3 = _aim_point()
    if not alive:
        return
    var dir: Vector3 = aim - global_position
    var dist: float = dir.length()
    var step: float = speed * dt
    if dist < 0.35 or step >= dist:
        _impact(aim)
        return
    global_position += dir.normalized() * step
    look_at(global_position + dir, Vector3.UP, true)

func _impact(at: Vector3) -> void:
    if from_enemy:
        _impact_on_defenders(at)
    else:
        _impact_on_enemies(at)

func _impact_on_enemies(at: Vector3) -> void:
    var primary: Enemy = target_enemy
    if primary != null and is_instance_valid(primary) and primary.alive:
        _game.damage_enemy(primary, dmg, source_def, null)
        if not _slow.is_empty():
            primary.apply_slow(_slow["duration"], _slow["amount"], false)
        # A ballista bolt keeps going through up to two more bodies before it stops.
        if pierce_left > 0:
            _pierced.append(primary)
            pierce_left -= 1
            var next: Enemy = _next_pierce_target()
            if next != null:
                target_enemy = next
                return
    if aoe > 0.0:
        var r2: float = aoe * aoe
        for o in _game.enemies:
            if not o.alive or o == primary:
                continue
            if o.global_position.distance_squared_to(at) < r2:
                _game.damage_enemy(o, dmg, source_def, null)
        _game.spawn_impact_ring(at, Color("ff8800"))
    _game.spawn_hit_particles(at, Color(SPEC.get(kind, SPEC["arrow"])["color"]))
    alive = false

## Look ahead along the FLIGHT LINE for the next body to punch through — the most
## head-on target within 15 units, not merely the nearest. Picking the nearest let a bolt
## turn almost backwards to chase a body beside it, which is not what a ballista does.
func _next_pierce_target() -> Enemy:
    var fwd := -global_transform.basis.z
    var fwd2 := Vector2(fwd.x, fwd.z)
    if fwd2.length_squared() < 0.0001:
        return null
    fwd2 = fwd2.normalized()
    var best: Enemy = null
    var best_dot := -INF
    for o in _game.enemies:
        if not o.alive or o in _pierced:
            continue
        var off := Vector2(o.global_position.x - global_position.x, o.global_position.z - global_position.z)
        var d2: float = off.length_squared()
        if d2 > 225.0 or d2 < 0.0001:       # 15 units max
            continue
        var dot: float = off.normalized().dot(fwd2)
        if dot > 0.6 and dot > best_dot:
            best_dot = dot
            best = o
    return best

func _impact_on_defenders(at: Vector3) -> void:
    var shooter: Enemy = source_enemy if is_instance_valid(source_enemy) else null
    if target_def != null and is_instance_valid(target_def) and target_def.alive:
        _game.damage_defender(target_def, dmg, shooter)
        # An orc-mage bolt curses what it hits: 40% slower reload for 3 seconds.
        if kind == "eMagic" and target_def.alive:
            target_def.apply_curse(3.0)
    if aoe > 0.0:
        var r2: float = aoe * aoe
        for d in _game.defenders:
            if d.alive and d != target_def and d.global_position.distance_squared_to(at) < r2:
                _game.damage_defender(d, floorf(dmg * 0.6), shooter)
    _game.spawn_hit_particles(at, Color("ff4400"))
    alive = false
