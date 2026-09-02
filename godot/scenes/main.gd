extends Node3D
## Vertical slice: level 1 (Blitz), three lanes, grunts + skeletons, tower placement.
## Deliberately NOT a full port — it exists to prove the architecture end to end and to
## be looked at in the editor.

const TILE_GRASS_A := Color(0.28, 0.55, 0.24)
const TILE_GRASS_B := Color(0.31, 0.59, 0.26)
const TILE_ROAD    := Color(0.62, 0.62, 0.58)

var enemies: Array[Enemy] = []
var defenders: Array[Defender] = []
var lanes: Array = []
var gold: int = 100
var castle_hp: int = Cfg.CASTLE_MAX_HP
var wave: int = 0
var kills: int = 0
var _queue: Array[String] = []
var _spawn_timer: float = 0.0
var _lane_rr: int = 0
var _wave_active: bool = false
var _road: Dictionary = {}
## Headless sims drive _process by hand while the SceneTree is not iterating, so
## scene-tree timers never fire. Tracers would then accumulate forever. Off in tests.
var visual_fx: bool = true

@onready var _shots: Node3D = $Shots
@onready var _hud: Label = $UI/HUD

func _ready() -> void:
    for k in ["a", "b", "c"]:
        lanes.append(Cfg.expand_path(Cfg.LAYOUT_BLITZ[k]))
    _build_ground()
    _build_castle()
    _place_camera()
    _refresh_hud()

func _build_ground() -> void:
    # Roads first so the lookup exists while tiling.
    for lane in lanes:
        for t in lane:
            _road[t] = true
    # One MultiMesh per colour instead of 72*54 = 3888 MeshInstance3D nodes. The JS
    # build merges its ground for the same reason; on mobile the node count is the
    # thing that hurts, so this is the port's most important structural change.
    var groups := {TILE_GRASS_A: [], TILE_GRASS_B: [], TILE_ROAD: []}
    for c in range(Cfg.GRID_W):
        for r in range(Cfg.GRID_H):
            var key: Color = TILE_ROAD if _road.has(Vector2i(c, r)) else (TILE_GRASS_A if (c + r) % 2 == 0 else TILE_GRASS_B)
            groups[key].append(Vector3(c, -0.15, r))
    for color in groups:
        var positions: Array = groups[color]
        if positions.is_empty():
            continue
        var mm := MultiMesh.new()
        mm.transform_format = MultiMesh.TRANSFORM_3D
        mm.mesh = Voxel.box_mesh(Vector3(1, 0.3, 1))
        mm.instance_count = positions.size()
        for i in positions.size():
            mm.set_instance_transform(i, Transform3D(Basis(), positions[i]))
        var mmi := MultiMeshInstance3D.new()
        mmi.multimesh = mm
        mmi.material_override = Voxel.mat(color)
        add_child(mmi)

func _build_castle() -> void:
    var castle := Node3D.new()
    castle.position = Vector3(68, 0, 27)
    var stone := Color(0.34, 0.38, 0.52)
    castle.add_child(Voxel.box(Vector3(5, 4, 8), stone, Vector3(0, 2, 0)))
    for z in [-3.0, 0.0, 3.0]:
        castle.add_child(Voxel.box(Vector3(1.6, 6.5, 1.6), Color(0.28, 0.32, 0.46), Vector3(-1.2, 3.2, z)))
    add_child(castle)

func _place_camera() -> void:
    var cam := Camera3D.new()
    cam.fov = 55
    add_child(cam)   # must be in the tree BEFORE look_at(); otherwise Godot refuses it
    cam.position = Vector3(30, 34, 62)
    cam.look_at(Vector3(34, 0, 27), Vector3.UP)
    var sun := DirectionalLight3D.new()
    sun.rotation_degrees = Vector3(-52, -35, 0)
    sun.light_energy = 1.15
    sun.shadow_enabled = true
    add_child(sun)
    var amb := WorldEnvironment.new()
    var env := Environment.new()
    env.background_mode = Environment.BG_COLOR
    env.background_color = Color(0.42, 0.66, 0.85)
    env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
    env.ambient_light_color = Color(0.60, 0.72, 0.85)
    env.ambient_light_energy = 0.85
    amb.environment = env
    add_child(amb)

func start_wave() -> void:
    if _wave_active:
        return
    wave += 1
    _queue = Waves.build_queue(wave)
    _wave_active = true
    _spawn_timer = 0.0
    _refresh_hud()

func _process(delta: float) -> void:
    _update_spawner(delta)
    for e in enemies.duplicate():
        if not is_instance_valid(e) or not e.alive:
            enemies.erase(e)
            if is_instance_valid(e):
                e.queue_free()
    if _wave_active and _queue.is_empty() and enemies.is_empty():
        _wave_active = false
        _refresh_hud()

func _update_spawner(delta: float) -> void:
    if not _wave_active or _queue.is_empty():
        return
    # Live-enemy soft cap, ported from the JS fix: hold the QUEUE rather than dropping
    # enemies, so wave content is unchanged but the entity count stays bounded.
    if enemies.size() >= Cfg.MAX_LIVE_ENEMIES:
        return
    _spawn_timer -= delta
    if _spawn_timer > 0.0:
        return
    _spawn_timer = Cfg.SPAWN_INTERVAL
    var type: String = _queue.pop_back()
    if not Cfg.ORC_TYPES.has(type):
        return   # slice only models a subset of enemy types
    var lane: Array[Vector2i] = lanes[_lane_rr % lanes.size()]
    _lane_rr += 1
    var e := Enemy.new()
    add_child(e)
    e.setup(type, lane, Waves.endless_hp_scale(wave, false))
    e.reached_castle.connect(_on_leak)
    e.died.connect(_on_kill)
    enemies.append(e)

func _on_leak(e: Enemy) -> void:
    castle_hp = maxi(0, castle_hp - e.castle_dmg)
    _refresh_hud()

func _on_kill(e: Enemy) -> void:
    kills += 1
    gold += e.reward
    _refresh_hud()

func place_defender(col: int, row: int, type := "tower") -> bool:
    if _road.has(Vector2i(col, row)):
        return false
    var cost: int = Cfg.COSTS.get(type, 999)
    if gold < cost:
        return false
    var slots := 0
    for d in defenders:
        slots += int(Cfg.STATS[d.type_name].get("unitCost", 1))
    if slots + int(Cfg.STATS[type].get("unitCost", 1)) > Cfg.MAX_DEFENDERS:
        return false
    gold -= cost
    var d := Defender.new()
    add_child(d)
    d.setup(type, func(): return enemies)
    d.position = Vector3(col, 0, row)
    d.fired.connect(_on_shot)
    defenders.append(d)
    _refresh_hud()
    return true

func _on_shot(from: Vector3, to: Vector3) -> void:
    if not visual_fx:
        return
    # cheap tracer so firing is visible without a projectile system
    var line := Voxel.box(Vector3(0.12, 0.12, from.distance_to(to)), Color(0.4, 0.9, 1.0))
    line.position = (from + to) * 0.5
    line.look_at_from_position(line.position, to, Vector3.UP)
    _shots.add_child(line)
    get_tree().create_timer(0.06).timeout.connect(func():
        if is_instance_valid(line): line.queue_free())

func _unhandled_input(event: InputEvent) -> void:
    # emulate_mouse_from_touch is on, so this covers both desktop and the mobile target
    if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
        var cam := get_viewport().get_camera_3d()
        if cam == null:
            return
        var from := cam.project_ray_origin(event.position)
        var dir := cam.project_ray_normal(event.position)
        if absf(dir.y) < 0.0001:
            return
        var t := -from.y / dir.y          # intersect the y=0 ground plane
        if t < 0.0:
            return
        var hit := from + dir * t
        place_defender(roundi(hit.x), roundi(hit.z))
    elif event is InputEventKey and event.pressed and event.keycode == KEY_SPACE:
        start_wave()

func _refresh_hud() -> void:
    if _hud:
        _hud.text = "Gold %d    Castle %d/%d    Wave %d    Kills %d    Units %d/%d\n[Space] start wave    [Click/Tap] place tower (%dg)" % [
            gold, castle_hp, Cfg.CASTLE_MAX_HP, wave, kills, defenders.size(), Cfg.MAX_DEFENDERS, Cfg.COSTS["tower"]]
