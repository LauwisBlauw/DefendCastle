extends Node3D
## The game controller. This is the port of the JS module scope: it owns the board, the
## entity lists, the economy and the wave clock, and it answers all the spatial queries
## that enemies and defenders ask (`find_closest_enemy`, `wall_at`, `wall_blocks_path`).
##
## Update order matches the JS gameLoop exactly, because several behaviours depend on
## it — a defender that fires before the spawner runs sees a different world than one
## that fires after.

signal state_changed                     ## HUD refresh cue
signal notice(text: String, ms: int)     ## transient tooltip
signal wave_started(n: int)
signal level_finished(won: bool, stars: int)
signal last_stand_changed(active: bool, seconds: float)
signal merchant_offered(offers: Array)
signal achievements_unlocked(ids: Array)
signal view_changed(zoom: float)

const UNLOCK_WAVES := {
	"archer": 3, "spearman": 6, "knight": 8, "catapult": 9,
	"spiketrap": 2, "ballista": 5, "mage": 7,
}
const ALWAYS_UNLOCKED := ["wall", "tower", "swordsman"]
const UNIT_NAMES := {
	"wall": "Wall", "tower": "Crystal Tower", "catapult": "Catapult",
	"swordsman": "Swordsman", "knight": "Knight", "spearman": "Spearman",
	"archer": "Archer", "mage": "Mage", "ballista": "Ballista", "spiketrap": "Spike Trap",
}

# ── entity lists ─────────────────────────────────────────────────────────────
var enemies: Array[Enemy] = []
var defenders: Array[Defender] = []
var projectiles: Array[Projectile] = []

# ── run state ────────────────────────────────────────────────────────────────
var gold: int = 100
var castle_hp: int = Cfg.CASTLE_MAX_HP
var wave: int = 0
var kills: int = 0
var difficulty: String = "normal"
var level_def: Dictionary = {}
var unlocked: Array[String] = []
var selected_tool: String = "tower"
var selected_defender: Defender = null
var rally_arm: bool = false      ## next board tap sets the selected soldier's rally point
var running: bool = false
## Last Stand: the castle's first fall is survivable. It drops to 1 HP, defenders hit
## three times as hard for 30 seconds, and holding out to the end of the wave saves the
## run. Only armed if something other than a wall still stands — with nothing left to
## fight with, the countdown would just be a slower way to lose.
var last_stand_active: bool = false
var last_stand_timer: float = 0.0
var game_speed: float = 1.0

# ── board ────────────────────────────────────────────────────────────────────
var lanes: Array = []
var _road: Dictionary = {}               ## Vector2i -> true
var _occupied: Dictionary = {}           ## Vector2i -> Defender
var _wall_cache: Array[Defender] = []
var _scenery: Dictionary = {}            ## Vector2i -> true; trees and rocks block building
var _lane_counts: Array[int] = [0, 0, 0] ## balanced lane pick, reset each wave
var _boss_lane: int = -1                 ## boss + retinue share one road
var _streak: int = 0                     ## kill streak, for the bonus gold
var _last_kill_ms: int = 0
var _web_zones: Array = []               ## spider death webs: {pos, timer, node}
var _windmill_sails: Array[Node3D] = []  ## turned in _process; the builders have no _process
var _air: MultiMeshInstance3D = null     ## biome haze; advanced against the render clock
var _air_time: float = 0.0
var haste_waves: int = 0                 ## merchant Battle Haste: defenders reload 30% faster
var double_bonus_wave: bool = false      ## merchant Dragon Hoard: next wave bounty doubles
var endless_bonus_slots: int = 0         ## endless milestones RAISE the unit ceiling
var achievements: Achievements = null    ## loaded once, persisted whenever something fires

## The merchant's stock. Three are offered at a time, between waves.
const MERCHANT_POOL := [
	{"id": "gold", "name": "Gold Rush", "desc": "+150 gold"},
	{"id": "repair", "name": "Fortress Repair", "desc": "Restore 60 castle HP"},
	{"id": "haste", "name": "Battle Haste", "desc": "All defenders +30% attack speed for 3 waves"},
	{"id": "warden", "name": "Iron Warden", "desc": "All living defenders healed +20 HP"},
	{"id": "alchemy", "name": "Alchemist Mix", "desc": "+60 gold and repair 30 HP"},
	{"id": "hoard", "name": "Dragon Hoard", "desc": "Double the gold bonus next wave"},
]
var _biome: Dictionary = {}

# ── wave clock ───────────────────────────────────────────────────────────────
var _queue: Array[String] = []
var _spawn_timer: float = 0.0
var _lane_rr: int = 0
var _wave_active: bool = false
var _wave_start_hp: int = 0
var _wave_start_time: float = 0.0
var _wave_def_deaths: int = 0
var _sim_clock: float = 0.0
var _boss_pending: bool = false
var _level_wave_stars: Array[int] = []
var _level_run_started_at: float = 0.0
var _level_run_difficulty: String = "normal"
## The UI reads this immediately after level_finished without widening that signal's
## public signature (the headless integration suite deliberately listens to two args).
var last_level_result: Dictionary = {}

## Headless sims drive tick() by hand while the SceneTree is not iterating, so
## scene-tree timers never fire and tracers would accumulate forever. Off in tests.
var visual_fx: bool = true

var _world: Node3D
var _fx: Node3D
var _shots: Node3D
var _ghost: Node3D = null
var _range_ring: MeshInstance3D = null
var _ghost_tile: MeshInstance3D = null
var _camera: Camera3D = null
var _hp_glow: OmniLight3D = null

## Route newly-earned achievements to the UI and write them straight back to disk. They
## are cheap and rare, so there is no reason to batch the save and risk losing them.
func _award(ids: Array) -> void:
	if ids.is_empty():
		return
	SaveData.set_achievements(achievements.to_dict())
	achievements_unlocked.emit(ids)

func _ready() -> void:
	_world = Node3D.new(); add_child(_world)
	_fx = Node3D.new(); add_child(_fx)
	_shots = Node3D.new(); add_child(_shots)
	achievements = Achievements.new(SaveData.get_achievements())
	_build_lighting()
	_place_camera()
	var markers := preload("res://scripts/tactical_markers.gd").new()
	markers.game = self
	add_child(markers)
	if Engine.is_editor_hint():
		return
	difficulty = SaveData.get_difficulty()
	var ui := get_node_or_null("UI")
	start_level(1)
	if ui != null:
		ui.bind(self)
		# Open on the menu rather than dropping the player straight into a level.
		ui.show_level_select()
		running = false

# ═══════════════════════════════════════════════════════════════════════════
#  LEVEL SETUP
# ═══════════════════════════════════════════════════════════════════════════

func start_level(level_id: int) -> void:
	level_def = Cfg.level_by_id(level_id)
	if level_def.is_empty():
		push_error("no such level: %d" % level_id)
		return
	_clear_field()
	_biome = Cfg.BIOMES[int(level_def["biome"])]
	lanes = Cfg.layout_lanes(int(level_def["layout"]))
	_road.clear()
	for li in lanes.size():
		for t in lanes[li]:
			_road[t] = true
	gold = int(level_def["startGold"])
	castle_hp = Cfg.CASTLE_MAX_HP
	wave = int(level_def["startWave"]) - 1
	kills = 0
	_level_wave_stars.clear()
	_sim_clock = 0.0
	_level_run_started_at = _sim_clock
	_level_run_difficulty = difficulty
	last_level_result = {}
	unlocked = []
	for t in ALWAYS_UNLOCKED:
		unlocked.append(t)
	# Levels past the first start mid-campaign, so everything whose unlock wave has
	# already gone by is available from the outset.
	for t in UNLOCK_WAVES:
		if wave >= int(UNLOCK_WAVES[t]):
			unlocked.append(t)
	_build_world()
	reset_view()
	_pan_hint_shown = false
	rng.seed = run_seed if run_seed != 0 else randi()
	running = true
	Snd.play_level_music(int(level_def.get("id", 1)))
	state_changed.emit()

## The menu is the only player-facing difficulty selector.  Keeping the mutation
## here makes a future settings screen inherit persistence automatically.
func set_difficulty(value: String) -> bool:
	if not Cfg.DIFFICULTY.has(value):
		return false
	difficulty = value
	var saved: bool = SaveData.set_difficulty(value)
	state_changed.emit()
	return saved

func _clear_field() -> void:
	for e in enemies:
		if is_instance_valid(e):
			e.queue_free()
	for d in defenders:
		if is_instance_valid(d):
			d.queue_free()
	for p in projectiles:
		if is_instance_valid(p):
			p.queue_free()
	enemies.clear()
	defenders.clear()
	projectiles.clear()
	_wall_cache.clear()
	_occupied.clear()
	_queue.clear()
	_web_zones.clear()
	haste_waves = 0
	double_bonus_wave = false
	endless_bonus_slots = 0
	if last_stand_active:
		last_stand_changed.emit(false, 0.0)   # the banner outlives the level otherwise
	last_stand_active = false
	last_stand_timer = 0.0
	_streak = 0
	_boss_lane = -1
	_lane_counts = [0, 0, 0]
	_wave_active = false
	selected_defender = null
	for c in _world.get_children():
		c.queue_free()
	for c in _fx.get_children():
		c.queue_free()

func _build_world() -> void:
	_build_ground()
	_build_castle()
	_build_scenery()
	_apply_biome_sky()

## The ground is ONE textured plane plus a MultiMesh of road slabs, rather than 3,888
## MeshInstance3D tiles. Node count is what hurts on mobile, and the JS build merges its
## ground for the same reason.
##
## The grass is a single plane with the biome texture tiled across it, because a 256px
## texture repeated on every 1x1 tile reads as obvious tiling; at one repeat per eight
## tiles the detail sits at roughly the scale the original has. Road tiles keep their
## per-tile slab — cobble is small-scale enough that a repeat per tile looks right.
func _build_ground() -> void:
	var biome_index: int = int(level_def.get("biome", 0))
	_world.add_child(BattlefieldArt.foundation(biome_index))

	var plane := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(Cfg.GRID_W + 2, Cfg.GRID_H + 2)
	plane.mesh = pm
	plane.position = Vector3(Cfg.GRID_W * 0.5 - 0.5, 0.0, Cfg.GRID_H * 0.5 - 0.5)
	plane.material_override = BattlefieldArt.terrain_material(biome_index)
	_world.add_child(plane)

	var road_tiles: Array = _road.keys()
	if road_tiles.is_empty():
		return
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = Voxel.box_mesh(Vector3(1, 0.3, 1))
	mm.instance_count = road_tiles.size()
	for i in road_tiles.size():
		var t: Vector2i = road_tiles[i]
		mm.set_instance_transform(i, Transform3D(Basis(), Vector3(t.x, -0.14, t.y)))
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = BattlefieldArt.terrain_material(biome_index, true)
	_world.add_child(mmi)

	# Kerb stones lining the road, and lanterns spaced along it.
	for lane in lanes:
		var kerb := Nature.road_kerbs(lane, _road, Color(BattlefieldArt.palette(biome_index)["road_dark"]))
		kerb.position.y = 0.15
		_world.add_child(kerb)
		_world.add_child(Nature.path_lanterns(lane, 9, Color(_biome["torch"])))

func _build_castle() -> void:
	_world.add_child(BattlefieldArt.castle())
	# The keep glow shifts from cyan to red as the castle is worn down — the player's
	# peripheral read on how the run is going.
	_hp_glow = OmniLight3D.new()
	_hp_glow.position = Vector3(64, 4, 27)
	_hp_glow.omni_range = 7.0
	_hp_glow.light_color = Color("00d4ff")
	_hp_glow.light_energy = 0.8
	_world.add_child(_hp_glow)

## Trees and rocks off the road. Seeded per level so a level always looks the same, and
## kept clear of the lanes and the buildable margin around them.
## Everything that decorates the board and blocks building on its tile. Seeded per level,
## so a level always looks the same, and kept two tiles clear of every lane so nothing
## crowds the road the player has to defend.
##
## Order matters: ponds and hills claim large areas first, then buildings, then the small
## props fill in around them. Reversing it leaves buildings with nowhere to sit.
func _build_scenery() -> void:
	_scenery.clear()
	_windmill_sails.clear()
	_air = null
	_air_time = 0.0
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(_biome["name"]) + int(level_def.get("id", 1)) * 7919

	var blocked := {}
	for t in _road:
		for dc in range(-2, 3):
			for dr in range(-2, 3):
				blocked[Vector2i(t.x + dc, t.y + dr)] = true

	var water: Dictionary = {
		"deep": Color(_biome["water"]["deep"]),
		"shallow": Color(_biome["water"]["shallow"]),
		"surf": Color(_biome["water"]["surf"]),
	}

	# ── ponds ──
	for _i in range(rng.randi_range(1, 3)):
		var cells := _free_blob(rng, blocked, rng.randi_range(6, 14))
		if cells.size() < 4:
			continue
		var pond := Nature.pond(cells, water)
		# The original water surface was below the unbroken ground plane. Lift only
		# the decorative water layer; the occupied cells and game board stay identical.
		pond.position.y = 0.13
		var water_surface := pond.get_node_or_null("Surf") as MultiMeshInstance3D
		if water_surface != null:
			var water_mat := ShaderMaterial.new()
			water_mat.shader = BattlefieldArt.WATER_SHADER
			water_mat.set_shader_parameter("water_color", water["shallow"])
			water_surface.material_override = water_mat
		_world.add_child(pond)
		for c in cells:
			_claim(c, blocked)

	# ── hills ──
	for _i in range(rng.randi_range(2, 4)):
		var spot := _free_spot(rng, blocked, 4)
		if spot.x < 0:
			continue
		var radius: int = rng.randi_range(2, 4)
		var ground_color := Color(BattlefieldArt.palette(int(level_def.get("biome", 0)))["dark"])
		var h: Node3D = Nature.hill(radius, rng.randi_range(2, 3),
			ground_color.lightened(0.08), ground_color.darkened(0.20), rng)
		h.position = Vector3(spot.x, 0, spot.y)
		_world.add_child(h)
		for col in h.get_meta("columns", []):
			_claim(Vector2i(spot.x + col.x, spot.y + col.y), blocked)

	# ── a hamlet of medieval buildings ──
	for _i in range(rng.randi_range(5, 9)):
		var spot := _free_spot(rng, blocked, 2)
		if spot.x < 0:
			continue
		var b: Node3D = Buildings.build_random(rng)
		b.position = Vector3(spot.x, 0, spot.y)
		b.rotation.y = rng.randf() * TAU
		_world.add_child(b)
		var sails: Node3D = b.get_node_or_null("Sails")
		if sails != null:
			_windmill_sails.append(sails)
		_claim(spot, blocked)
		for dc in range(-1, 2):
			for dr in range(-1, 2):
				_claim(Vector2i(spot.x + dc, spot.y + dr), blocked)

	var well_spot := _free_spot(rng, blocked, 2)
	if well_spot.x >= 0:
		var w: Node3D = Buildings.build("well", rng)
		w.position = Vector3(well_spot.x, 0, well_spot.y)
		_world.add_child(w)
		_claim(well_spot, blocked)

	# ── rocks and trees fill whatever is left ──
	for _i in range(rng.randi_range(8, 16)):
		var spot := _free_spot(rng, blocked, 1)
		if spot.x < 0:
			continue
		var r: Node3D = Nature.rock(rng.randf_range(0.7, 1.4), Color(_biome["hill"]).darkened(0.15), rng)
		r.position = Vector3(spot.x, 0, spot.y)
		_world.add_child(r)
		_claim(spot, blocked)

	var placed := 0
	var attempts := 0
	while placed < 110 and attempts < 2000:
		attempts += 1
		var spot := _free_spot(rng, blocked, 1)
		if spot.x < 0:
			continue
		var kind: String = _biome["trees"][rng.randi() % _biome["trees"].size()]
		_world.add_child(_make_tree(kind, spot.x, spot.y, rng))
		_claim(spot, blocked)
		placed += 1

	# Clouds sit BEYOND the far edge of the board rather than over it. The JS can scatter
	# them across the whole map because its camera sits lower; at this port's 58-degree
	# top-down pitch anything above the playfield projects straight onto it, and a cloud
	# that hides the road the player is defending is not atmosphere, it is an obstruction.
	# Biome haze — pollen, dust, snow, embers, ash, void motes or neon, by realm.
	_air = Atmosphere.create(int(level_def.get("biome", 0)), rng)
	_world.add_child(_air)

	# The miniature is staged on a quiet backdrop; floating sky blocks would be
	# clipped by the upper edge of this camera. Biome motes provide the atmosphere.

## Mark a tile as taken, both for further scenery placement and for the build rules.
func _claim(cell: Vector2i, blocked: Dictionary) -> void:
	blocked[cell] = true
	_scenery[cell] = true

## A free tile with `margin` clear tiles around it, or (-1,-1) after enough tries.
func _free_spot(rng: RandomNumberGenerator, blocked: Dictionary, margin: int) -> Vector2i:
	for _try in range(60):
		var c: int = rng.randi_range(1, 60)
		var r: int = rng.randi_range(1, Cfg.GRID_H - 2)
		var ok := true
		for dc in range(-margin, margin + 1):
			for dr in range(-margin, margin + 1):
				if blocked.has(Vector2i(c + dc, r + dr)):
					ok = false
					break
			if not ok:
				break
		if ok:
			return Vector2i(c, r)
	return Vector2i(-1, -1)

## A contiguous free patch, grown outward from a seed tile — used for pond shapes.
func _free_blob(rng: RandomNumberGenerator, blocked: Dictionary, target: int) -> Array:
	var origin := _free_spot(rng, blocked, 2)
	if origin.x < 0:
		return []
	var cells: Array = [origin]
	var frontier: Array = [origin]
	while cells.size() < target and not frontier.is_empty():
		var from: Vector2i = frontier[rng.randi() % frontier.size()]
		var dirs: Array[Vector2i] = [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]
		var n: Vector2i = from + dirs[rng.randi() % 4]
		if blocked.has(n) or cells.has(n) or n.x < 1 or n.x > 60 or n.y < 1 or n.y >= Cfg.GRID_H - 1:
			frontier.erase(from)
			continue
		cells.append(n)
		frontier.append(n)
	return cells

## Colour comes from BattlefieldArt.PALETTES via the biome index — the shader palette
## is the single source of truth for how the world looks. This used to take foliage and
## trunk colours from Cfg.BIOMES and silently discard them, which left two tables
## claiming to define tree colour and only one of them mattering.
func _make_tree(kind: String, c: int, r: int, rng: RandomNumberGenerator) -> Node3D:
	var g := BattlefieldArt.tree(kind, int(level_def.get("biome", 0)), c * 7919 + r * 37)
	g.position = Vector3(c, 0, r)
	# Preserve the original RNG consumption so presentation changes never shuffle
	# occupied scenery tiles or the buildable spaces between them.
	var s: float = rng.randf_range(0.8, 1.25)
	g.scale = Vector3(s, s, s)
	g.rotation.y = rng.randf() * TAU
	return g

func _apply_biome_sky() -> void:
	var p := BattlefieldArt.palette(int(level_def.get("biome", 0)))
	for c in get_children():
		if c is WorldEnvironment:
			var env: Environment = c.environment
			env.background_color = Color(p["sky"])
			env.ambient_light_color = Color(p["ambient"])
		elif c is DirectionalLight3D and c.name == "KeyLight":
			c.light_color = Color(p["sun"])

func _build_lighting() -> void:
	var sun := DirectionalLight3D.new()
	sun.name = "KeyLight"
	sun.rotation_degrees = Vector3(-48, -38, 0)
	sun.light_energy = 1.20
	sun.light_angular_distance = 1.8
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	sun.directional_shadow_max_distance = 160.0
	sun.shadow_bias = 0.035
	add_child(sun)
	var fill := DirectionalLight3D.new()
	fill.name = "CoolRimLight"
	fill.rotation_degrees = Vector3(-35, 140, 0)
	fill.light_color = Color("a9d3de")
	fill.light_energy = 0.35
	add_child(fill)
	var we := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.42, 0.66, 0.85)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.60, 0.72, 0.85)
	env.ambient_light_energy = 0.48
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 1.0
	env.ssao_enabled = true
	env.ssao_radius = 1.5
	env.ssao_intensity = 1.5
	env.ssao_light_affect = 0.15
	env.glow_enabled = true
	env.glow_intensity = 0.45
	env.glow_bloom = 0.04
	env.glow_hdr_threshold = 1.7
	# Fog is off: at this camera pitch it greys the far half of the board without adding
	# depth. The JS drives per-biome fog, but it renders at a much lower angle.
	env.fog_enabled = false
	we.environment = env
	add_child(we)

func _place_camera() -> void:
	_camera = Camera3D.new()
	_camera.fov = 32
	add_child(_camera)   # must be in the tree BEFORE look_at(); Godot refuses it otherwise
	_frame_board(_camera)
	get_viewport().size_changed.connect(func():
		_frame_board(_camera)
		_apply_view())

# ── zoom and pan ─────────────────────────────────────────────────────────────
## 1.0 is the whole board on screen — the framing _frame_board solves for. Above that
## the camera closes in, and `_pan` slides the point it looks at.
##
## The board is 72x54 tiles on a screen maybe 1600px wide, so a unit is about twenty
## pixels and a soldier stepping two tiles to meet an enemy is a barely visible twitch.
## Zoom is what makes the unit AI legible; without it the game reads as static.
var zoom: float = 1.0
var _pan := Vector2.ZERO          ## offset of the look-at point, in tiles
var _fit_dist: float = 60.0       ## distance that frames the whole board at zoom 1
var _cam_pitch: float = 0.0
var _drag_from := Vector2.ZERO
var _dragging := false
var _pan_hint_shown := false

## Every random choice the SIMULATION makes goes through this, never the global randi().
## Lane assignment and the merchant draw were using the global generator, which made runs
## irreproducible — and made one marginal test in the suite fail roughly one run in ten
## while passing every time in isolation. A seeded generator makes a failing run
## replayable from its seed.
var rng := RandomNumberGenerator.new()
var run_seed: int = 0            ## 0 means "pick one"; tests set it to pin a run
var _lmb_down := false
var _lmb_dragged := false
var _lmb_from := Vector2.ZERO

## How far the pointer must travel before a press stops being a click and becomes a
## drag. Small enough that a deliberate drag responds at once, large enough that the
## shake in a normal click never costs the player a placement.
const DRAG_THRESHOLD_PX := 6.0

const ZOOM_MIN := 1.0
const ZOOM_MAX := 5.0
const ZOOM_STEP := 1.18

func set_zoom(z: float, focus_tile := Vector2.INF) -> void:
	var before: float = zoom
	zoom = clampf(z, ZOOM_MIN, ZOOM_MAX)
	# Zoom toward the cursor rather than the screen centre: pull the focused tile's
	# offset from the current centre in proportion to how much closer we just got, so
	# the tile under the pointer stays put.
	if focus_tile != Vector2.INF and before > 0.0:
		var centre := Vector2(Cfg.GRID_W * 0.5, Cfg.GRID_H * 0.5) + _pan
		var off: Vector2 = focus_tile - centre
		_pan += off * (1.0 - before / zoom)
	_apply_view()

func zoom_in(focus_tile := Vector2.INF) -> void:
	set_zoom(zoom * ZOOM_STEP, focus_tile)

func zoom_out(focus_tile := Vector2.INF) -> void:
	set_zoom(zoom / ZOOM_STEP, focus_tile)

func reset_view() -> void:
	zoom = 1.0
	_pan = Vector2.ZERO
	_apply_view()

func pan_by(delta_tiles: Vector2) -> void:
	_pan += delta_tiles
	_apply_view()

## Re-seat the camera for the current zoom and pan, clamping the pan so the view can
## never slide off the board — at zoom 1 there is nowhere to go, and the clamp shrinks
## smoothly to zero as you zoom back out.
func _apply_view() -> void:
	if _camera == null:
		return
	var half_w: float = Cfg.GRID_W * 0.5 * (1.0 - 1.0 / zoom)
	var half_h: float = Cfg.GRID_H * 0.5 * (1.0 - 1.0 / zoom)
	_pan.x = clampf(_pan.x, -half_w, half_w)
	_pan.y = clampf(_pan.y, -half_h, half_h)
	var target := Vector3(Cfg.GRID_W * 0.5 + _pan.x, 0.0, Cfg.GRID_H * 0.5 + _pan.y)
	_apply_cam(_camera, target, _cam_pitch, _fit_dist / zoom)
	view_changed.emit(zoom)

## Frame the whole board. Computing a distance from the board size and the fov
## UNDER-shoots, because perspective makes the NEAR edge far wider on screen than the
## centre distance implies, so the bottom and sides bleed off frame. This instead
## positions the camera and then VERIFIES by projecting the four ground corners,
## backing off until they all land inside the viewport. Self-correcting, so it holds
## for any aspect ratio — which is the whole point on phones and TVs.
func _frame_board(cam: Camera3D) -> void:
	const PITCH_DEG := 42.0
	const PAD := 0.04
	var center := Vector3(Cfg.GRID_W * 0.5, 0.0, Cfg.GRID_H * 0.5)
	var pitch := deg_to_rad(PITCH_DEG)
	var corners := [
		Vector3(-2, 0, -2), Vector3(Cfg.GRID_W + 1, 0, -2),
		Vector3(-2, -3.5, Cfg.GRID_H + 1), Vector3(Cfg.GRID_W + 1, -3.5, Cfg.GRID_H + 1),
	]
	var vp: Vector2 = get_viewport().get_visible_rect().size
	if vp.x < 1.0 or vp.y < 1.0:
		vp = Vector2(1280, 720)      # headless viewport reports zero; assume the default
	# Binary search rather than stepping outward by a fixed factor: the old 6%-per-step
	# loop overshot by up to 6%, which is what left the board floating in a sea of sky.
	var lo := 10.0
	var hi: float = maxf(Cfg.GRID_W, Cfg.GRID_H) * 2.5
	# Portrait and ultrawide windows need more than the desktop-derived bound. Grow the
	# search ceiling before solving so every aspect ratio gets a real fit, not a clipped
	# board at the fallback distance.
	while not _corners_fit(cam, center, pitch, hi, corners, vp, PAD) and hi < 2000.0:
		hi *= 1.35
	for _i in range(28):
		var mid: float = (lo + hi) * 0.5
		if _corners_fit(cam, center, pitch, mid, corners, vp, PAD):
			hi = mid
		else:
			lo = mid
	_fit_dist = hi
	_cam_pitch = pitch
	_apply_cam(cam, center + Vector3(_pan.x, 0.0, _pan.y), pitch, hi / zoom)

func _corners_fit(cam: Camera3D, center: Vector3, pitch: float, dist: float,
				  corners: Array, vp: Vector2, pad: float) -> bool:
	_apply_cam(cam, center, pitch, dist)
	for c in corners:
		if cam.is_position_behind(c):
			return false
		var sp: Vector2 = cam.unproject_position(c)
		if sp.x < vp.x * pad or sp.x > vp.x * (1.0 - pad) \
		or sp.y < vp.y * 0.13 or sp.y > vp.y * 0.84:
			return false
	return true

func _apply_cam(cam: Camera3D, center: Vector3, pitch: float, dist: float) -> void:
	# A small western yaw exposes the gatehouse and the sides of the miniatures.
	var horizontal := dist * cos(pitch)
	cam.position = center + Vector3(-0.19 * horizontal, dist * sin(pitch), 0.982 * horizontal)
	cam.look_at(center, Vector3.UP)
	# Optical shift reserves room for the build dock without pitching the board away.
	cam.v_offset = -dist * 0.025
	cam.force_update_transform()

# ═══════════════════════════════════════════════════════════════════════════
#  MAIN LOOP — order matters, see the file header
# ═══════════════════════════════════════════════════════════════════════════

func _process(delta: float) -> void:
	_pan_from_keys(delta)
	# The builders are pure and have no _process of their own, so the sails are turned
	# here. Real time, not sim time: they keep turning while the game is paused.
	for sails in _windmill_sails:
		if is_instance_valid(sails):
			sails.rotation.z += delta * 0.6
	# Both of these run on the RENDER clock, not the sim clock: the world should keep
	# breathing while the game is paused or the player is reading a modal.
	if _air != null and is_instance_valid(_air):
		_air_time += delta
		Atmosphere.update(_air, _air_time)
	if running:
		tick(delta * game_speed)

func tick(dt: float) -> void:
	_sim_clock += dt
	_update_spawner(dt)
	# Descending index rather than a copy. Nothing here REMOVES from these arrays —
	# removal is deferred entirely to _reap() below — but spawning appends, and
	# iterating backwards tolerates that without duplicating three arrays every frame.
	for i in range(enemies.size() - 1, -1, -1):
		if i < enemies.size() and is_instance_valid(enemies[i]):
			enemies[i].tick(dt)
	for i in range(defenders.size() - 1, -1, -1):
		if i < defenders.size() and is_instance_valid(defenders[i]):
			defenders[i].tick(dt)
	for i in range(projectiles.size() - 1, -1, -1):
		if i < projectiles.size() and is_instance_valid(projectiles[i]):
			projectiles[i].tick(dt)
	_tick_web_zones(dt)
	_reap()
	# Wave-end is settled FIRST. If the last enemy died on this frame it clears the Last
	# Stand and restores the castle, and the countdown below must not then fire — holding
	# the line to the end of the wave is the win condition, so a run saved on the expiry
	# frame has to count as saved.
	_check_wave_end()
	if last_stand_active:
		last_stand_timer -= dt
		last_stand_changed.emit(true, last_stand_timer)
		if last_stand_timer <= 0.0:
			_lose()

## Sweep finished entities. Kept as one pass after every system has run, so nothing
## holds a reference to a node that was freed mid-frame.
func _reap() -> void:
	for i in range(enemies.size() - 1, -1, -1):
		var e: Enemy = enemies[i]
		if not is_instance_valid(e):
			enemies.remove_at(i)
		elif e.is_finished_dying():
			enemies.remove_at(i)
			e.queue_free()
	for i in range(defenders.size() - 1, -1, -1):
		var d: Defender = defenders[i]
		if not is_instance_valid(d):
			defenders.remove_at(i)
		elif d.is_finished_dying():
			_occupied.erase(Vector2i(d.col, d.row))
			defenders.remove_at(i)
			if selected_defender == d:
				selected_defender = null
			d.queue_free()
			_rebuild_wall_cache()
			state_changed.emit()
	for i in range(projectiles.size() - 1, -1, -1):
		var p: Projectile = projectiles[i]
		if not is_instance_valid(p):
			projectiles.remove_at(i)
		elif not p.alive:
			projectiles.remove_at(i)
			p.queue_free()

# ═══════════════════════════════════════════════════════════════════════════
#  WAVES
# ═══════════════════════════════════════════════════════════════════════════

func start_wave() -> void:
	if _wave_active or not running:
		return
	wave += 1
	# The queue is consumed with pop_back(), so the LAST element spawns FIRST and index 0
	# spawns LAST — the same convention the JS uses, which is what lets the boss finale be
	# assembled by pushing to the front.
	_queue = Waves.build_queue(wave, rng)
	_queue = Waves.apply_siege_bonus(_queue, wave)
	if not level_def.is_empty() and wave >= int(level_def.get("endWave", 0)) and level_def.has("boss"):
		_queue = Waves.apply_boss_finale(_queue)
	_lane_counts = [0, 0, 0]
	_boss_lane = -1
	_wave_active = true
	_spawn_timer = 0.0
	_wave_start_hp = castle_hp
	_wave_start_time = _sim_clock
	_wave_def_deaths = 0
	# The level's final wave carries that level's boss.
	_boss_pending = false      # the boss is a token in the queue now, not a separate gate
	Snd.play("wave_start")
	wave_started.emit(wave)
	state_changed.emit()

func _update_spawner(dt: float) -> void:
	if not _wave_active:
		return
	if _queue.is_empty():
		return
	# Live-enemy soft cap: hold the QUEUE rather than dropping enemies, so wave content
	# is unchanged but the entity count stays bounded.
	if enemies.size() >= Cfg.MAX_LIVE_ENEMIES:
		return
	_spawn_timer -= dt
	if _spawn_timer > 0.0:
		return
	var token: String = _queue.pop_back()
	if token == "pause":
		_spawn_timer = Waves.PAUSE_SECONDS      # a breather between cohorts
		return
	# Reinforcements arrive faster every wave, down to a 0.50s floor reached at wave 14.
	# A flat interval made late waves a trickle and blunted every AoE unit.
	_spawn_timer = maxf(0.50, Cfg.SPAWN_INTERVAL - (wave - 1) * 0.05)
	_spawn_token(token)

## Decode one queue token. "elite:" doubles the unit, "retinue:" also locks it onto the
## boss's road, "__levelBoss" is the level's named boss.
func _spawn_token(token: String) -> void:
	if token == "__levelBoss":
		_spawn_boss()
		return
	var elite := false
	var force_boss_lane := false
	var type := token
	if type.begins_with("retinue:"):
		elite = true
		force_boss_lane = true
		type = type.substr(8)
	elif type.begins_with("elite:"):
		elite = true
		type = type.substr(6)
	_spawn(type, {}, elite, force_boss_lane)

## Balanced lane pick: the road with the fewest spawns so far, ties broken at random.
## The boss and its retinue instead share one road, chosen once, so the finale arrives
## as a column rather than three separate trickles.
func _pick_lane(force_boss_lane: bool) -> int:
	if force_boss_lane:
		if _boss_lane < 0:
			_boss_lane = rng.randi() % lanes.size()
		return _boss_lane
	var lowest: int = _lane_counts[0]
	for c in _lane_counts:
		lowest = mini(lowest, c)
	var candidates: Array[int] = []
	for i in range(lanes.size()):
		if _lane_counts[i] == lowest:
			candidates.append(i)
	var pick: int = candidates[rng.randi() % candidates.size()]
	_lane_counts[pick] += 1
	return pick

func _spawn(type: String, boss: Dictionary = {}, elite: bool = false,
			force_boss_lane: bool = false) -> Enemy:
	if not Cfg.ORC_TYPES.has(type):
		return null
	var lane_idx: int = _pick_lane(force_boss_lane)
	var e := Enemy.new()
	add_child(e)
	var diff: Dictionary = Cfg.DIFFICULTY[difficulty]
	e.lane_id = lane_idx
	e.setup(type, lanes[lane_idx], self,
		float(diff["hp"]) * Waves.endless_hp_scale(wave, false),
		float(diff["speed"]) * Waves.rage_multiplier(wave), boss, elite)
	e.reached_castle.connect(_on_castle_hit)
	e.died.connect(_on_enemy_died)
	enemies.append(e)
	return e

func _spawn_boss() -> void:
	var b: Dictionary = level_def.get("boss", {})
	if b.is_empty():
		return
	var e: Enemy = _spawn("boss", b, false, true)
	if e != null:
		Snd.play("boss_spawn")
		notice.emit("⚔  %s approaches!" % b.get("name", "Boss"), 3200)

func _live_enemy_count() -> int:
	var n := 0
	for e in enemies:
		if e.alive:
			n += 1
	return n

func _check_wave_end() -> void:
	if not _wave_active:
		return
	for t in _queue:
		if t != "pause":
			return        # still content to spawn
	if _live_enemy_count() > 0:
		return
	_wave_active = false
	# Snapshot the castle's TRUE end-of-wave HP before the Last Stand restore below can
	# raise it. The star check reads this, so restoring first would let a wave that ground
	# the castle down to 1 HP earn the "castle took no damage" star.
	var hp_for_stars: int = castle_hp

	# Surviving Last Stand is the win condition — holding the line to the end of the wave
	# ends it. The castle is pulled off 1 HP to a quarter of maximum: enough to keep
	# playing, still a real wound, and never a downgrade if something already healed past it.
	if last_stand_active:
		last_stand_active = false
		last_stand_timer = 0.0
		castle_hp = maxi(castle_hp, int(round(Cfg.CASTLE_MAX_HP * 0.25)))
		_update_castle_glow()
		last_stand_changed.emit(false, 0.0)
		notice.emit("🛡  LAST STAND HELD! The castle endures — walls partly restored", 4200)

	# Release lingering attack slots so defenders are not locked between waves.
	for d in defenders:
		d._slots.clear()

	# Star rating: three independent criteria, scored against the wave's own start state.
	var star_no_dmg: bool = hp_for_stars >= _wave_start_hp
	var star_no_loss: bool = _wave_def_deaths == 0
	var time_limit: float = (20.0 + wave * 10.0) * (1.4 if wave % 5 == 0 else 1.0)
	var star_fast: bool = (_sim_clock - _wave_start_time) <= time_limit
	var stars: int = int(star_no_dmg) + int(star_no_loss) + int(star_fast)
	_level_wave_stars.append(stars)

	# Castle regenerates a little between waves — 5% of max, capped at 15.
	var regen: int = mini(15, int(Cfg.CASTLE_MAX_HP * 0.05))
	if castle_hp > 0 and castle_hp < Cfg.CASTLE_MAX_HP:
		castle_hp = mini(Cfg.CASTLE_MAX_HP, castle_hp + regen)
	if haste_waves > 0:
		haste_waves -= 1
	var bounty: int = 20 + wave * 10
	if double_bonus_wave:
		bounty *= 2
		double_bonus_wave = false
	gold += bounty
	_award(achievements.note_event("gold_held", gold))

	for tool in UNLOCK_WAVES:
		if tool not in unlocked and wave >= int(UNLOCK_WAVES[tool]):
			unlocked.append(tool)
			notice.emit("🔓 %s unlocked!" % UNIT_NAMES.get(tool, tool), 2500)

	_update_castle_glow()
	Snd.play("wave_complete")
	state_changed.emit()

	if Cfg.is_endless(level_def):
		_endless_milestones()
		notice.emit("Wave %d survived  +%d gold" % [wave, bounty], 2600)
		_maybe_offer_merchant()
	elif wave >= int(level_def["endWave"]):
		_finish_level()
	else:
		notice.emit("Wave %d cleared — %s  +%d gold" % [wave, "★".repeat(stars) + "☆".repeat(3 - stars), bounty], 2600)
		_maybe_offer_merchant()

## Endless pays out every fifth wave, and every tenth also raises the unit ceiling.
func _endless_milestones() -> void:
	if wave <= 0:
		return
	_award(achievements.note_event("endless_wave", wave))
	if wave % 10 == 0:
		gold += 200
		endless_bonus_slots += 1
		notice.emit("WAVE %d MILESTONE  +200 gold  +1 max defender" % wave, 3200)
		state_changed.emit()
	elif wave % 5 == 0:
		gold += 75
		notice.emit("Wave %d streak  +75 gold" % wave, 2400)

## Every third wave, but never a siege wave and never the wave that ends a level — the
## offer would collide with the level-complete screen.
func _maybe_offer_merchant() -> void:
	if wave % 3 != 0 or wave % 5 == 0:
		return
	var pool: Array = MERCHANT_POOL.duplicate()
	# Fisher-Yates through the seeded generator; Array.shuffle() uses the global one.
	for i in range(pool.size() - 1, 0, -1):
		var j: int = rng.randi_range(0, i)
		var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp
	merchant_offered.emit(pool.slice(0, 3))

## Apply one merchant offer. Called by the UI when the player picks a card.
func take_merchant_offer(id: String) -> void:
	match id:
		"gold":
			gold += 150
		"repair":
			castle_hp = mini(Cfg.CASTLE_MAX_HP, castle_hp + 60)
			_update_castle_glow()
		"haste":
			haste_waves = 3
		"warden":
			for d in defenders:
				if d.alive and d.type_name != "wall":
					d.hp = minf(d.max_hp, d.hp + 20.0)
					d._refresh_hp_bar()
		"alchemy":
			gold += 60
			castle_hp = mini(Cfg.CASTLE_MAX_HP, castle_hp + 30)
			_update_castle_glow()
		"hoard":
			double_bonus_wave = true
	Snd.play("gold_gain")
	state_changed.emit()

## 3★ needs a strong run AND a healthy castle; 1★ is just finishing. Port of the JS
## level-completion rating.
func _finish_level() -> void:
	running = false
	var hp_pct: float = float(castle_hp) / float(Cfg.CASTLE_MAX_HP)
	var n: int = maxi(_level_wave_stars.size(), 1)
	var total := 0
	var lowest := 3
	for s in _level_wave_stars:
		total += s
		lowest = mini(lowest, s)
	var avg: float = float(total) / float(n)
	var stars := 1
	if lowest >= 2 and avg >= 2.5 and hp_pct >= 0.5:
		stars = 3
	elif (avg >= 1.5 and hp_pct >= 0.25) or hp_pct >= 0.9:
		stars = 2
	var level_id: int = int(level_def.get("id", 0))
	last_level_result = SaveData.record_level_result(
		level_id,
		stars,
		maxf(0.0, _sim_clock - _level_run_started_at),
		kills,
		_level_run_difficulty)
	Snd.play("level_victory")
	var earned: Array = achievements.note_event("level_stars", stars)
	var campaign: Dictionary = SaveData.get_campaign_progress()
	if int(campaign.get("completed", 0)) >= Cfg.LEVELS.size():
		earned.append_array(achievements.note_event("all_levels_clear"))
	if int(campaign.get("stars", 0)) >= Cfg.LEVELS.size() * Cfg.MAX_LEVEL:
		earned.append_array(achievements.note_event("all_levels_3star"))
	_award(earned)
	level_finished.emit(true, stars)

# ═══════════════════════════════════════════════════════════════════════════
#  PLACEMENT
# ═══════════════════════════════════════════════════════════════════════════

## The hard 26 clamp already binds from wave 12, four waves before endless starts, so a
## milestone slot has to RAISE the ceiling to have any effect at all — the JS learned this
## the hard way, where the reward was promised every ten waves and never once delivered.
func max_defenders() -> int:
	return mini(26 + endless_bonus_slots, Cfg.MAX_DEFENDERS + wave)

func used_slots() -> int:
	var sum := 0
	for d in defenders:
		if d.alive:
			sum += int(Cfg.STATS.get(d.type_name, {}).get("unitCost", 1))
	return sum

## Returns "" if the tile is legal for this tool, otherwise the refusal message.
func placement_error(tool: String, col: int, row: int) -> String:
	if col < 0 or row < 0 or col >= Cfg.GRID_W or row >= Cfg.GRID_H:
		return "Outside the field!"
	if tool not in unlocked:
		return "Unlocks at wave %d!" % int(UNLOCK_WAVES.get(tool, 0))
	if Cfg.is_castle_tile(col, row):
		return "Cannot build inside the castle!"
	var cell := Vector2i(col, row)
	if _scenery.has(cell):
		return "Cannot build on terrain obstacles!"
	var on_road: bool = _road.has(cell)
	# Walls AND spike traps may both go on grass or road; everything else is grass only.
	# Restricting traps to the road removed the JS's grass-side ambush placements.
	if tool == "spiketrap" or tool == "wall":
		pass
	elif on_road:
		return "Can only build on green tiles!"
	if _occupied.has(cell):
		return "Tile already occupied!"
	var unit_cost: int = int(Cfg.STATS.get(tool, {}).get("unitCost", 1))
	var used: int = used_slots()
	if used + unit_cost > max_defenders():
		return "Unit cap! (%d/%d) — needs %d slot%s" % [used, max_defenders(), unit_cost, "" if unit_cost == 1 else "s"]
	if gold < int(Cfg.COSTS.get(tool, 9999)):
		return "Not enough gold! Need %d" % int(Cfg.COSTS.get(tool, 0))
	return ""

func place(tool: String, col: int, row: int) -> bool:
	var err: String = placement_error(tool, col, row)
	if err != "":
		Snd.play("deny_click")
		notice.emit(err, 1800)
		return false
	gold -= int(Cfg.COSTS[tool])
	Snd.play("wall_place" if tool == "wall" else "build")
	var d := Defender.new()
	add_child(d)
	d.setup(tool, col, row, self)
	d.died.connect(_on_defender_died)
	defenders.append(d)
	_occupied[Vector2i(col, row)] = d
	if tool == "wall":
		_rebuild_wall_cache()
	notice.emit("%s built!  −%d gold" % [UNIT_NAMES.get(tool, tool), int(Cfg.COSTS[tool])], 1400)
	var built: Array = achievements.note_event("gold_held", gold)
	if tool == "wall":
		built.append_array(achievements.bump("wallsBuilt"))
		built.append_array(achievements.note_event("wall_built", achievements.stat("wallsBuilt")))
	_award(built)
	state_changed.emit()
	return true

func sell(d: Defender) -> void:
	if d == null or not d.alive:
		return
	if d.type_name == "spiketrap":
		notice.emit("Spike traps cannot be sold!", 1800)
		return
	var refund: int = d.sell_value()
	gold += refund
	_occupied.erase(Vector2i(d.col, d.row))
	defenders.erase(d)
	if selected_defender == d:
		selected_defender = null
	# Cut every enemy loose before the node goes. Selling only erased it from the array
	# and queue_free()d it — but queue_free is deferred and `alive` stayed true, so
	# anything mid-fight with it kept swinging at a wall that no longer existed, and a
	# blocked column never re-opened. Death already does this; selling has to as well.
	d.alive = false
	for e in enemies:
		if is_instance_valid(e):
			e.on_target_lost(d)
	d.queue_free()
	_rebuild_wall_cache()
	Snd.play("gold_gain")   # the JS engine has no dedicated sell cue; coins is the closest
	notice.emit("Sold for %d gold" % refund, 1500)
	state_changed.emit()

func upgrade(d: Defender) -> void:
	if d == null:
		return
	var err: String = d.try_upgrade()
	if err != "":
		Snd.play("deny_click")
		notice.emit(err, 1800)
	else:
		Snd.play("upgrade")
		notice.emit("Upgraded to level %d!" % d.level, 1600)
	state_changed.emit()

## Send a soldier to hold a different tile. Its spawn (col,row) is left untouched, so
## clearing the rally marches it back home cleanly.
func set_rally(d: Defender, tile: Vector2i) -> void:
	if d == null or not d.can_rally():
		return
	_award(achievements.note_event("rally_set"))
	d.rally = Vector2(tile.x, tile.y)
	d.state = Defender.SoldierState.RETURNING
	Snd.play("rally_set")
	rally_arm = false
	notice.emit("Rally point set", 1400)
	state_changed.emit()

func clear_rally(d: Defender) -> void:
	if d == null:
		return
	d.rally = Vector2.INF
	d.state = Defender.SoldierState.RETURNING
	Snd.play("rally_clear")
	notice.emit("Rally cleared — returning to post", 1400)
	state_changed.emit()

func defender_at(col: int, row: int) -> Defender:
	return _occupied.get(Vector2i(col, row), null)

func _rebuild_wall_cache() -> void:
	_wall_cache.clear()
	for d in defenders:
		if d.alive and d.type_name == "wall":
			_wall_cache.append(d)

# ═══════════════════════════════════════════════════════════════════════════
#  SPATIAL QUERIES — the interface enemies and defenders call into
# ═══════════════════════════════════════════════════════════════════════════

func wall_at(col: int, row: int) -> Defender:
	for d in _wall_cache:
		if d.alive and d.col == col and d.row == row:
			return d
	return null

## True if a living wall sits on the segment between two points. Walls within 0.6 units
## of the origin are ignored — the attacker may be standing flush against one.
func wall_blocks_path(from_pos: Vector3, to_pos: Vector3) -> bool:
	var dx: float = to_pos.x - from_pos.x
	var dz: float = to_pos.z - from_pos.z
	var len2: float = dx * dx + dz * dz
	if len2 < 0.01:
		return false
	for d in _wall_cache:
		if not d.alive:
			continue
		var wx: float = d.col - from_pos.x
		var wz: float = d.row - from_pos.z
		if wx * wx + wz * wz < 0.36:
			continue
		var t: float = clampf((wx * dx + wz * dz) / len2, 0.0, 1.0)
		var cx: float = from_pos.x + t * dx - d.col
		var cz: float = from_pos.z + t * dz - d.row
		if cx * cx + cz * cz < 0.36:
			return true
	return false

func find_closest_enemy(pos: Vector3, r: float) -> Enemy:
	var best: Enemy = null
	var best_d2: float = r * r
	for o in enemies:
		if not o.alive:
			continue
		var d2: float = pos.distance_squared_to(o.global_position)
		if d2 <= best_d2 and not wall_blocks_path(pos, o.global_position):
			best = o
			best_d2 = d2
	return best

## Melee targets only. Walls are handled by the path-blocking code, and a spiketrap is
## a floor hazard with hp 9999 — while it was targetable, any enemy that wandered onto
## one latched on and hammered an invulnerable object forever, never advancing and
## never dying.
func find_defender_in_range(pos: Vector3, r: float) -> Defender:
	var best: Defender = null
	var best_d2: float = r * r
	for d in defenders:
		if not d.alive or d.type_name == "wall" or d.type_name == "spiketrap":
			continue
		var d2: float = pos.distance_squared_to(d.global_position)
		if d2 <= best_d2 and not wall_blocks_path(pos, d.global_position):
			best = d
			best_d2 = d2
	return best

## Any defender, for ranged enemies — they will happily shoot a wall.
func find_closest_defender(pos: Vector3, r: float) -> Defender:
	var best: Defender = null
	var best_d2: float = r * r
	for d in defenders:
		# Only WALLS are excluded here. The port had this inverted — it skipped spike
		# traps and happily shot walls, so archers wasted their fire on stonework and
		# never threatened the traps the JS lets them destroy.
		if not d.alive or d.type_name == "wall":
			continue
		var d2: float = pos.distance_squared_to(d.global_position)
		if d2 <= best_d2:
			best = d
			best_d2 = d2
	return best

func find_tower_in_range(pos: Vector3, r: float) -> Defender:
	var best: Defender = null
	var best_d2: float = r * r
	for d in defenders:
		if not d.alive or (d.type_name != "tower" and d.type_name != "catapult"):
			continue
		var d2: float = pos.distance_squared_to(d.global_position)
		if d2 <= best_d2:
			best = d
			best_d2 = d2
	return best

# ═══════════════════════════════════════════════════════════════════════════
#  DAMAGE + EVENTS
# ═══════════════════════════════════════════════════════════════════════════

## `credit` scores the kill; `provoker` is what the enemy REACTS to. They are usually
## different: a projectile credits the emplacement that fired it, but the enemy must not
## turn and charge that emplacement — the JS makes the shooter anonymous by calling
## dealDamage() with no attacker at all, and only a melee soldier passes itself.
func damage_enemy(e: Enemy, amount: float, credit: Defender = null,
				  provoker: Defender = null) -> void:
	if e == null or not e.alive:
		return
	Snd.play("enemy_hit")
	e.take_damage(amount * (3.0 if last_stand_active else 1.0), provoker)
	if not e.alive and credit != null and is_instance_valid(credit):
		credit.kills += 1

func damage_defender(d: Defender, amount: float, attacker: Enemy = null) -> void:
	if d == null or not d.alive:
		return
	if attacker != null:
		Snd.play_enemy_attack(attacker.type_name)
	else:
		Snd.play("wall_hit" if d.type_name == "wall" else "hit")
	d.take_damage(amount, attacker)

func launch_projectile(src: Defender, tgt: Enemy, kind: String, d: float, splash: float) -> void:
	var p := Projectile.new()
	_shots.add_child(p)
	var y_off: float = 2.45 if src.type_name == "tower" else (2.6 if src.type_name == "wall" else \
					   (1.3 if src.type_name == "catapult" else (1.8 if src.type_name == "mage" else 1.1)))
	p.global_position = src.global_position + Vector3(0, y_off, 0)
	match kind:
		"bolt": Snd.play("bolt")
		"arrow": Snd.play("arrow")
		"rock": Snd.play("catapult_fire")
		"magic": Snd.play("mage_cast")
		_: Snd.play("ballista_shot")
	p.setup_player_shot(src, tgt, kind, d, splash, self)
	projectiles.append(p)

func fire_enemy_shot(src: Enemy, tgt: Defender, d: float, enemy_type: String) -> void:
	var kind := "eArrow"
	var splash := 0.0
	if enemy_type == "orcMage":
		kind = "eMagic"
	elif enemy_type == "rockTroll":
		kind = "eRock"
		splash = float(Cfg.ORC_TYPES["rockTroll"].get("aoe", 1.3))
	var p := Projectile.new()
	_shots.add_child(p)
	p.global_position = src.global_position + Vector3(0, 1.1 * src.scale_f, 0)
	Snd.play("enemy_rock" if kind == "eRock" else "enemy_arrow")
	p.setup_enemy_shot(src, tgt, kind, d, splash, self)
	projectiles.append(p)

func _on_enemy_died(e: Enemy) -> void:
	kills += 1
	var earned: Array = achievements.note_event("kill", achievements.stat("kills") + 1)
	earned.append_array(achievements.bump("kills"))
	if e.is_level_boss:
		earned.append_array(achievements.note_event("boss_killed"))
		if _wave_def_deaths == 0:
			earned.append_array(achievements.note_event("flawless_boss"))
	_award(earned)
	# Round, don't truncate — on Easy (x0.85) truncation quietly shaves a coin off almost
	# every kill, which compounds over a 40-enemy wave.
	gold += int(round(e.reward * float(Cfg.DIFFICULTY[difficulty]["rewardMult"])))
	_award_streak(e)
	if e.type_name == "spider":
		_spawn_web_zone(e.global_position)
	Snd.play("big_enemy_die" if e.is_level_boss or e.max_hp >= 50.0 else "enemy_die")
	if e.explodes_on_death:
		_detonate(e)
	spawn_hit_particles(e.global_position + Vector3(0, 0.7, 0), Color("aa2222"))
	state_changed.emit()

## Exploder, orcMage and the Flame Tyrant all detonate on death, hurting both sides.
func _detonate(e: Enemy) -> void:
	var at: Vector3 = e.global_position
	var r: float = e.explode_radius
	for o in enemies:
		if o != e and o.alive and o.global_position.distance_to(at) < r:
			damage_enemy(o, e.explode_dmg)
	for d in defenders:
		if d.alive and d.global_position.distance_to(at) < r:
			damage_defender(d, e.explode_dmg)
	Snd.play("explode")
	spawn_impact_ring(at, Color("ff6600"))
	spawn_hit_particles(at + Vector3(0, 0.5, 0), Color("ff8800"))

func _on_defender_died(_d: Defender) -> void:
	Snd.play("defender_die")
	_wave_def_deaths += 1
	_rebuild_wall_cache()
	state_changed.emit()

func _on_castle_hit(e: Enemy) -> void:
	castle_hp = maxi(0, castle_hp - e.castle_dmg)
	Snd.play("critical_castle" if castle_hp < Cfg.CASTLE_MAX_HP * 0.25 else "castle_hit")
	_update_castle_glow()
	state_changed.emit()
	if castle_hp > 0 or not running:
		return
	if not last_stand_active and _has_fighting_defender():
		last_stand_active = true
		last_stand_timer = 30.0
		castle_hp = 1
		_update_castle_glow()
		last_stand_changed.emit(true, last_stand_timer)
		notice.emit("⚔  LAST STAND!  30 seconds — defenders deal 3× damage!", 4500)
		state_changed.emit()
		return
	if not last_stand_active:
		_lose()

## A wall cannot kill anything, so it is not a reason to grant the reprieve.
func _has_fighting_defender() -> bool:
	for d in defenders:
		if d.alive and d.type_name != "wall":
			return true
	return false

func _lose() -> void:
	running = false
	last_stand_active = false
	last_stand_timer = 0.0
	last_stand_changed.emit(false, 0.0)
	last_level_result = SaveData.record_level_attempt(int(level_def.get("id", 0)), kills)
	Snd.stop_music()
	Snd.play("game_over")
	level_finished.emit(false, 0)

## Kills landing inside 2 seconds of each other build a streak; from the fifth on, each
## one pays a bonus. It is what rewards holding a choke point instead of trickling kills.
func _award_streak(e: Enemy) -> void:
	var now: int = Time.get_ticks_msec()
	_streak = _streak + 1 if now - _last_kill_ms < 2000 else 1
	_last_kill_ms = now
	if _streak >= 5:
		var bonus: int = 5 + _streak
		gold += bonus
		if _streak % 5 == 0:
			notice.emit("🔥 %d KILL STREAK!  +%d gold" % [_streak, bonus], 1500)

## A dead spider leaves webbing that slows whatever walks through it for 8 seconds.
func _spawn_web_zone(at: Vector3) -> void:
	var node: Node3D = null
	if visual_fx:
		node = Node3D.new()
		node.position = Vector3(at.x, 0.02, at.z)
		# radial spokes, so it reads as silk rather than a white disc
		for i in range(6):
			var spoke := Voxel.box(Vector3(0.06, 0.02, 2.6), Color("d8e0e6"))
			spoke.material_override = Voxel.ghost_mat(Color("d8e0e6"), 0.55)
			spoke.rotation.y = i * PI / 6.0
			node.add_child(spoke)
		for r in [0.9, 1.7]:
			for i in range(12):
				var seg := Voxel.box(Vector3(0.05, 0.02, 0.5), Color("d8e0e6"))
				seg.material_override = Voxel.ghost_mat(Color("d8e0e6"), 0.55)
				seg.position = Vector3(sin(i * TAU / 12.0) * r, 0, cos(i * TAU / 12.0) * r)
				seg.rotation.y = i * TAU / 12.0 + PI / 2.0
				node.add_child(seg)
		_fx.add_child(node)
	_web_zones.append({"pos": at, "timer": 8.0, "node": node})

## Webs take the MAX of any existing slow rather than assigning, so a web cannot shorten
## a mage's stronger chill — the one place the JS deliberately combines instead of setting.
func _tick_web_zones(dt: float) -> void:
	for i in range(_web_zones.size() - 1, -1, -1):
		var w: Dictionary = _web_zones[i]
		w["timer"] -= dt
		if w["timer"] <= 0.0:
			if w["node"] != null and is_instance_valid(w["node"]):
				w["node"].queue_free()
			_web_zones.remove_at(i)
			continue
		var r2 := 1.96          # radius 1.4
		for o in enemies:
			if o.alive and o.global_position.distance_squared_to(w["pos"]) < r2:
				o.apply_slow(0.35, 0.35, true)

## Shove a unit out of anything solid it has walked into. Only needed off the road —
## the lane keeps walking enemies clear on its own, but a charging one solves its own
## collisions, and without this it strolls through towers, walls and trees.
##
## Only the nine cells around the unit are consulted. Scanning every defender and all
## ~130 scenery tiles for every unit every frame is 26,000 checks a frame at a full
## wave, which is enough on its own to stall a headless sim.
func push_out_of_buildings(unit: Node3D, radius: float, ignore: Defender = null) -> void:
	var cx: int = roundi(unit.position.x)
	var cz: int = roundi(unit.position.z)
	for dc in range(-1, 2):
		for dr in range(-1, 2):
			var cell := Vector2i(cx + dc, cz + dr)
			var solid := false
			var d: Defender = _occupied.get(cell, null)
			if d != null and is_instance_valid(d) and d.alive and d != ignore \
			and d.type_name != "spiketrap":       # a floor hazard is walked over
				solid = true
			elif _scenery.has(cell):
				solid = true
			if not solid:
				continue
			var off := Vector2(unit.position.x - cell.x, unit.position.z - cell.y)
			var min_d: float = radius + 0.45
			var dist: float = off.length()
			if dist < 0.0001:
				unit.position.x += min_d      # exactly centred: shove it off deterministically
				continue
			if dist < min_d:
				unit.position.x += (off.x / dist) * (min_d - dist)
				unit.position.z += (off.y / dist) * (min_d - dist)

func on_boss_slam(at: Vector3) -> void:
	Snd.play("boss_slam")
	spawn_impact_ring(at, Color("ff2244"))

func _update_castle_glow() -> void:
	if _hp_glow == null:
		return
	var pct: float = float(castle_hp) / float(Cfg.CASTLE_MAX_HP)
	if pct > 0.5:
		_hp_glow.light_color = Color("7bd5cf"); _hp_glow.light_energy = 0.8
	elif pct > 0.25:
		_hp_glow.light_color = Color("eeb65f"); _hp_glow.light_energy = 1.5
	else:
		_hp_glow.light_color = Color("ed6353"); _hp_glow.light_energy = 2.2

# ═══════════════════════════════════════════════════════════════════════════
#  VFX — cheap, pooled-by-lifetime, and skipped entirely in headless sims
# ═══════════════════════════════════════════════════════════════════════════

func spawn_hit_particles(at: Vector3, color: Color, count: int = 7) -> void:
	if not visual_fx:
		return
	for i in range(count):
		var m := Voxel.box(Vector3(0.11, 0.11, 0.11), color)
		m.position = at + Vector3(randf_range(-0.2, 0.2), randf_range(-0.1, 0.3), randf_range(-0.2, 0.2))
		_fx.add_child(m)
		var vel := Vector3(randf_range(-1.4, 1.4), randf_range(1.0, 2.6), randf_range(-1.4, 1.4))
		var tw := create_tween()
		tw.set_parallel(true)
		tw.tween_property(m, "position", m.position + vel * 0.35, 0.35)
		tw.tween_property(m, "scale", Vector3.ZERO, 0.35)
		tw.chain().tween_callback(func(): if is_instance_valid(m): m.queue_free())
		# A level switch frees these mid-flight; kill the tween with the node.
		m.tree_exiting.connect(func(): if tw.is_valid(): tw.kill())

func spawn_impact_ring(at: Vector3, color: Color) -> void:
	if not visual_fx:
		return
	var ring := MeshInstance3D.new()
	ring.mesh = _ring_mesh()
	# The fade needs its OWN material. Tweening through Voxel.ghost_mat() minted a fresh
	# cached material for every two-decimal alpha the tween passed through — about seventy
	# per ring colour, retained forever in a static cache built to prevent exactly that.
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(color.r, color.g, color.b, 0.7)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ring.material_override = mat
	ring.position = at + Vector3(0, 0.12, 0)
	_fx.add_child(ring)
	var tw := create_tween()
	tw.set_parallel(true)
	tw.tween_property(ring, "scale", Vector3(4.5, 1.0, 4.5), 0.42)
	tw.tween_property(mat, "albedo_color:a", 0.0, 0.42)
	# A level switch can free the ring mid-fade; kill the tween with the node so no
	# callback retains a dangling reference.
	ring.tree_exiting.connect(func(): if tw.is_valid(): tw.kill())
	tw.chain().tween_callback(func(): if is_instance_valid(ring): ring.queue_free())

## One torus shared by every impact ring, on the same principle as Voxel.box_mesh().
static var _shared_ring_mesh: TorusMesh = null
func _ring_mesh() -> TorusMesh:
	if _shared_ring_mesh == null:
		_shared_ring_mesh = TorusMesh.new()
		_shared_ring_mesh.inner_radius = 0.5
		_shared_ring_mesh.outer_radius = 0.7
	return _shared_ring_mesh

# ═══════════════════════════════════════════════════════════════════════════
#  INPUT
# ═══════════════════════════════════════════════════════════════════════════

## Screen point -> board tile. Returns Vector2i(-1,-1) when the ray misses the ground.
func tile_at_screen(screen_pos: Vector2) -> Vector2i:
	# This board's OWN camera, not the viewport's current one. A level switch can leave
	# the previous camera alive for a frame, and picking through it lands the click on
	# the wrong tile — the headless sim, which keeps several boards in one viewport,
	# hits that every time.
	var cam: Camera3D = _camera if is_instance_valid(_camera) else get_viewport().get_camera_3d()
	if cam == null:
		return Vector2i(-1, -1)
	var from := cam.project_ray_origin(screen_pos)
	var dir := cam.project_ray_normal(screen_pos)
	if absf(dir.y) < 0.0001:
		return Vector2i(-1, -1)
	var t: float = -from.y / dir.y
	if t < 0.0:
		return Vector2i(-1, -1)
	var hit: Vector3 = from + dir * t
	return Vector2i(roundi(hit.x), roundi(hit.z))

func tap(tile: Vector2i) -> void:
	if tile.x < 0:
		return
	if rally_arm and selected_defender != null and is_instance_valid(selected_defender) \
	and selected_defender.can_rally():
		set_rally(selected_defender, tile)
		return
	var existing: Defender = defender_at(tile.x, tile.y)
	if existing != null:
		selected_defender = existing
		rally_arm = false
		state_changed.emit()
		return
	selected_defender = null
	rally_arm = false
	place(selected_tool, tile.x, tile.y)

## Translucent footprint under the cursor, plus the range bubble for ranged tools —
## the player needs to see coverage BEFORE paying for it.
func update_ghost(tile: Vector2i) -> void:
	if not visual_fx:
		return
	if _ghost == null:
		_ghost = Node3D.new()
		add_child(_ghost)
		_range_ring = preload("res://scripts/tactical_markers.gd").disc(Color("7dcfc6"))
		_ghost.add_child(_range_ring)
		_ghost_tile = preload("res://scripts/tactical_markers.gd").disc(Color("efd195"), true)
		_ghost_tile.scale = Vector3(0.52, 1, 0.52)
		_ghost_tile.position.y = 0.01
		_ghost.add_child(_ghost_tile)
	if tile.x < 0 or tile.y < 0 or tile.x >= Cfg.GRID_W or tile.y >= Cfg.GRID_H or not running:
		_ghost.visible = false
		return
	_ghost.visible = true
	_ghost.position = Vector3(tile.x, 0.05, tile.y)
	var ok: bool = placement_error(selected_tool, tile.x, tile.y) == ""
	var col := Color("7dcfc6") if ok else Color("ee8774")
	var r: float = float(Cfg.STATS.get(selected_tool, {}).get("range", 0.0))
	_range_ring.visible = r > 0.0
	if r > 0.0:
		_range_ring.scale = Vector3(r, 1.0, r)
	_range_ring.material_override.set_shader_parameter("ring_color", col)
	_ghost_tile.material_override.set_shader_parameter("ring_color", col)

# ── input ────────────────────────────────────────────────────────────────────
## emulate_mouse_from_touch is on, so one handler covers desktop and the mobile target.
func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		match event.button_index:
			MOUSE_BUTTON_WHEEL_UP:
				zoom_in(_tile_at_screen_f(event.position))
				return
			MOUSE_BUTTON_WHEEL_DOWN:
				zoom_out(_tile_at_screen_f(event.position))
				return
			MOUSE_BUTTON_WHEEL_LEFT:
				pan_by(Vector2(-_wheel_pan_tiles(), 0.0))
				return
			MOUSE_BUTTON_WHEEL_RIGHT:
				pan_by(Vector2(_wheel_pan_tiles(), 0.0))
				return

	# Left-drag pans the board, but a left CLICK still places a unit — so the action has
	# to move from press to RELEASE, and only fire if the pointer never travelled far
	# enough to count as a drag.
	#
	# The drag is only armed when there is somewhere to pan. At 100% the whole board is
	# framed and the clamp swallows any movement, so arming it there would do nothing
	# visible while silently eating the placement the player was actually making.
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			_lmb_down = true
			_lmb_dragged = false
			_lmb_from = event.position
			_drag_from = event.position
		else:
			if _lmb_down and not _lmb_dragged:
				tap(tile_at_screen(event.position))
			_lmb_down = false
			_lmb_dragged = false
			Input.set_default_cursor_shape(Input.CURSOR_ARROW)
		return
	if event is InputEventMouseMotion and _lmb_down:
		if not _lmb_dragged:
			if event.position.distance_to(_lmb_from) < DRAG_THRESHOLD_PX:
				update_ghost(tile_at_screen(event.position))
				return
			if zoom <= ZOOM_MIN + 0.001:
				# Nowhere to pan. Leave the click intact and explain, once, but only for a
				# deliberate drag — nagging on every twitchy placement would be worse.
				if not _pan_hint_shown and event.position.distance_to(_lmb_from) > 48.0:
					_pan_hint_shown = true
					notice.emit("The whole board is in view — zoom in to drag it around", 2600)
				update_ghost(tile_at_screen(event.position))
				return
			_lmb_dragged = true
			_drag_from = _lmb_from
			Input.set_default_cursor_shape(Input.CURSOR_DRAG)
			_ghost_visible(false)
		_drag_view(event.position)
		return

	# Middle-drag pans too, at any zoom and without the click-vs-drag ambiguity.
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_MIDDLE:
		_dragging = event.pressed
		_drag_from = event.position
		return
	if event is InputEventMouseMotion and _dragging:
		_drag_view(event.position)
		return

	# Trackpad gestures. A two-finger drag never becomes a mouse event, so it has to be
	# handled directly — and macOS only emits these for a real trackpad, so a mouse wheel
	# still falls through to the zoom branch above.
	if event is InputEventMagnifyGesture:          # pinch
		set_zoom(zoom * event.factor, _tile_at_screen_f(event.position))
		return
	if event is InputEventPanGesture:              # two fingers down, dragging
		# At 100% the whole board is already framed, so the clamp swallows the gesture
		# entirely and it reads as broken. Say why, once, rather than doing nothing.
		if zoom <= ZOOM_MIN + 0.001:
			if not _pan_hint_shown:
				_pan_hint_shown = true
				notice.emit("The whole board is in view — zoom in to pan around it", 2600)
			return
		# Convert the gesture to BOARD tiles rather than scaling pixels by a constant.
		# A fixed factor drifts away from the fingers as you zoom — at 300% the board
		# moves three times too far for the same swipe.
		pan_by(-_screen_delta_to_tiles(event.delta * PAN_GESTURE_PIXELS))
		return

	if event is InputEventMouseMotion:
		update_ghost(tile_at_screen(event.position))
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_RIGHT:
			# Right-click sells, matching the JS build's shortcut.
			var t: Vector2i = tile_at_screen(event.position)
			var d: Defender = defender_at(t.x, t.y)
			if d != null:
				sell(d)
	elif event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_SPACE:
				start_wave()
			KEY_ESCAPE:
				var ui := get_node_or_null("UI")
				if ui != null:
					ui.show_level_select()
					running = false
			KEY_U:
				if selected_defender != null:
					upgrade(selected_defender)
			KEY_S:
				if selected_defender != null:
					sell(selected_defender)
			KEY_EQUAL, KEY_KP_ADD:
				zoom_in()
			KEY_MINUS, KEY_KP_SUBTRACT:
				zoom_out()
			KEY_0, KEY_KP_0:
				reset_view()

## Keyboard panning is polled rather than event-driven so holding a key glides instead
## of repeating at the OS key-repeat rate.
func _pan_from_keys(delta: float) -> void:
	if zoom <= ZOOM_MIN + 0.001:
		return
	# Arrows only, deliberately: S already sells the selected defender, and a WASD scheme
	# that silently drops S would be worse than not offering WASD at all.
	var dir := Vector2.ZERO
	if Input.is_key_pressed(KEY_LEFT):
		dir.x -= 1.0
	if Input.is_key_pressed(KEY_RIGHT):
		dir.x += 1.0
	if Input.is_key_pressed(KEY_UP):
		dir.y -= 1.0
	if Input.is_key_pressed(KEY_DOWN):
		dir.y += 1.0
	if dir != Vector2.ZERO:
		pan_by(dir.normalized() * delta * 26.0 / zoom)

## Drag the board so the tile under the pointer stays under the pointer. Re-projecting
## each step keeps it exact at any zoom, rather than accumulating scaled pixels.
func _drag_view(to_pos: Vector2) -> void:
	var from: Vector2 = _tile_at_screen_f(_drag_from)
	var to: Vector2 = _tile_at_screen_f(to_pos)
	if from != Vector2.INF and to != Vector2.INF:
		pan_by(from - to)
	_drag_from = to_pos

func _ghost_visible(v: bool) -> void:
	if _ghost != null and is_instance_valid(_ghost):
		_ghost.visible = v

## How far a trackpad pan gesture carries. Godot reports its delta in scroll units, not
## pixels, so this converts to something screen-sized before the world projection.
const PAN_GESTURE_PIXELS := 22.0

## A screen-space delta expressed in board tiles, measured on the ground plane through
## the live camera. Because it re-projects every time, one finger-width of swipe covers
## the same amount of BOARD at every zoom level, which is what makes the gesture feel
## attached to the terrain rather than to the screen.
func _screen_delta_to_tiles(delta: Vector2) -> Vector2:
	var vp: Vector2 = get_viewport().get_visible_rect().size
	if vp.x < 1.0 or vp.y < 1.0:
		return Vector2.ZERO
	var mid: Vector2 = vp * 0.5
	var a: Vector2 = _tile_at_screen_f(mid)
	var b: Vector2 = _tile_at_screen_f(mid + delta)
	if a == Vector2.INF or b == Vector2.INF:
		return Vector2.ZERO
	return b - a

## One notch of a horizontal wheel, in tiles — scaled so it covers the same fraction of
## the visible board however far in you are.
func _wheel_pan_tiles() -> float:
	return Cfg.GRID_W * 0.06 / zoom

## Board position under a screen point, as a float rather than a rounded tile — zooming
## toward the cursor needs sub-tile precision or the view jitters as you scroll.
func _tile_at_screen_f(screen_pos: Vector2) -> Vector2:
	# This board's OWN camera, not the viewport's current one. A level switch can leave
	# the previous camera alive for a frame, and picking through it lands the click on
	# the wrong tile — the headless sim, which keeps several boards in one viewport,
	# hits that every time.
	var cam: Camera3D = _camera if is_instance_valid(_camera) else get_viewport().get_camera_3d()
	if cam == null:
		return Vector2.INF
	var from := cam.project_ray_origin(screen_pos)
	var dir := cam.project_ray_normal(screen_pos)
	if absf(dir.y) < 0.0001:
		return Vector2.INF
	var t: float = -from.y / dir.y
	if t < 0.0:
		return Vector2.INF
	var hit: Vector3 = from + dir * t
	return Vector2(hit.x, hit.z)
