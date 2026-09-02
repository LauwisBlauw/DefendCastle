class_name Enemy
extends Node3D
## A path-walking enemy. Direct port of the JS orc: it advances along the densified
## tile path by (pathIndex, progress) rather than by free movement, so it can never
## drift off the road.

var type_name: String = "grunt"
var hp: float = 18.0
var max_hp: float = 18.0
var speed: float = 3.4
var castle_dmg: int = 10
var reward: int = 7
var alive: bool = true

var _path: Array[Vector2i] = []
var _path_index: int = 0
var _progress: float = 0.0
var _anim_time: float = 0.0
var _legs: Array[MeshInstance3D] = []

signal reached_castle(e: Enemy)
signal died(e: Enemy)

func setup(t: String, path: Array[Vector2i], hp_scale: float = 1.0) -> void:
    type_name = t
    _path = path
    var s: Dictionary = Cfg.ORC_TYPES.get(t, Cfg.ORC_TYPES["grunt"])
    max_hp = float(s["hp"]) * hp_scale
    hp = max_hp
    speed = float(s["speed"])
    castle_dmg = int(s["castleDmg"])
    reward = int(s["reward"])
    _build(float(s["scale"]))
    if _path.size() > 0:
        position = Vector3(_path[0].x, 0, _path[0].y)

func _build(scale_f: float) -> void:
    var skin := Color(0.20, 0.55, 0.20)
    var dark := Color(0.13, 0.38, 0.14)
    add_child(Voxel.box(Vector3(0.55, 0.58, 0.38) * scale_f, skin, Vector3(0, 0.68, 0) * scale_f))
    add_child(Voxel.box(Vector3(0.44, 0.44, 0.44) * scale_f, skin, Vector3(0, 1.17, 0) * scale_f))
    for sx in [0.16, -0.16]:
        var leg := Voxel.box(Vector3(0.2, 0.38, 0.2) * scale_f, dark, Vector3(sx, 0.19, 0) * scale_f)
        add_child(leg)
        _legs.append(leg)
    for sx in [0.4, -0.4]:
        add_child(Voxel.box(Vector3(0.24, 0.44, 0.24) * scale_f, skin, Vector3(sx, 0.62, 0) * scale_f))

func take_damage(dmg: float) -> void:
    if not alive:
        return
    hp -= dmg
    if hp <= 0.0:
        alive = false
        died.emit(self)

func _process(delta: float) -> void:
    if not alive or _path.is_empty():
        return
    _progress += speed * delta
    while _progress >= 1.0 and _path_index < _path.size() - 1:
        _progress -= 1.0
        _path_index += 1
    if _path_index >= _path.size() - 1:
        alive = false
        reached_castle.emit(self)
        return
    var a := _path[_path_index]
    var b := _path[_path_index + 1]
    var from := Vector3(a.x, 0, a.y)
    var to := Vector3(b.x, 0, b.y)
    position = from.lerp(to, _progress)
    # Face along the SEGMENT, not toward the target tile. Aiming at the tile made
    # origin == target once _progress reached 1.0, which Godot rejects — and because
    # that happens every time an enemy lands exactly on a tile, it errored every few
    # frames for every enemy on the field.
    var seg := to - from
    if seg.length_squared() > 0.000001:
        look_at(global_position + seg, Vector3.UP, true)
    # stepped walk cycle — matches the JS stepAnim() flipbook feel
    _anim_time += delta * 5.5
    var swing: float = sin(_anim_time) * 0.11
    if _legs.size() == 2:
        _legs[0].position.y = 0.19 + swing
        _legs[1].position.y = 0.19 - swing
    position.y = abs(sin(_anim_time)) * 0.06
