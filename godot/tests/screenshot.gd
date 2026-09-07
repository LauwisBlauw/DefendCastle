extends Node
## Fast, rendered visual regression review. It deliberately runs only with a real
## display renderer: Godot's headless/dummy driver cannot produce a trustworthy image.
##
##   godot --path godot --resolution 1600x900 tests/visual_review.tscn -- --quick
##
## Every run writes to its own directory under tests/shots/, so a review never replaces
## another person's captures. SaveData is redirected before Main enters the tree; visual
## setup may unlock achievements, but it can only write to the disposable review file.

const OUTPUT_ROOT := "res://tests/shots"
const TIMEOUT_SECONDS := 45.0
const SIM_STEP := 1.0 / 30.0

var _game: Node = null
var _ui: Node = null
var _finished := false
var _quick := false
var _output_dir := ""
var _previous_save_path := ""
var _review_save_path := ""

func _ready() -> void:
    _quick = OS.get_cmdline_user_args().has("--quick")
    if _uses_dummy_renderer():
        _finish(3, "visual-review: --headless uses Godot's dummy renderer; run with a display renderer")
        return
    if not _make_output_dir():
        return
    _isolate_save_data()
    get_tree().create_timer(TIMEOUT_SECONDS).timeout.connect(_on_timeout)
    await _run_review()

## A Viewport texture under --headless can exist while containing no rendered frame.
## Refuse it explicitly instead of silently writing blank PNGs or waiting forever for
## RenderingServer.frame_post_draw.
func _uses_dummy_renderer() -> bool:
    return OS.has_feature("headless") or DisplayServer.get_name().to_lower() == "headless"

func _make_output_dir() -> bool:
    var stamp := "%d_%d" % [OS.get_process_id(), Time.get_ticks_usec()]
    _output_dir = "%s/visual_review_%s" % [OUTPUT_ROOT, stamp]
    var err := DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(_output_dir))
    if err != OK:
        _finish(4, "visual-review: could not create %s (error %d)" % [_output_dir, err])
        return false
    return true

## Main currently persists through the SaveData autoload. Redirect its storage BEFORE
## instantiating Main, then remove only this uniquely named temporary file on exit.
func _isolate_save_data() -> void:
    _previous_save_path = SaveData.storage_path()
    _review_save_path = "user://_visual_review_%d_%d.json" % [OS.get_process_id(), Time.get_ticks_usec()]
    SaveData.set_storage_path(_review_save_path, true)
    SaveData.erase_storage()

func _restore_save_data() -> void:
    if _review_save_path == "":
        return
    # erase_storage is path-bound by SaveData, so this cannot remove the player's save.
    SaveData.erase_storage()
    SaveData.set_storage_path(_previous_save_path, true)
    _review_save_path = ""

func _run_review() -> void:
    if not await _boot_game():
        return

    # 1. The real opening state: title, campaign cards, and the menu overlay.
    if not await _capture("01_menu"):
        return

    # 2. A populated board makes placement silhouettes and HUD density reviewable.
    _prepare_level(1)
    _build_showcase_defence()
    _advance_sim(0.55)
    _quiet_transient_ui()
    if not await _capture("02_overview_defenders"):
        return

    # 3–4. Reuse the tableau for a close fight and its selected-defender affordance.
    _seed_closeup_battle()
    _advance_sim(0.5 if _quick else 0.9)
    _quiet_transient_ui()
    if not await _capture("03_closeup_battle"):
        return
    _select_showcase_defender()
    if _finished:
        return
    if not await _capture("04_selected_defender"):
        return

    # 5–6. Biome coverage catches lighting, sky, ground, and scenery regressions.
    _prepare_level(3)
    _build_light_defence()
    _advance_sim(0.45)
    _quiet_transient_ui()
    if not await _capture("05_level3_frozen_reach"):
        return
    _prepare_level(5)
    _build_light_defence()
    _seed_abyss_boss()
    _advance_sim(0.5)
    _quiet_transient_ui()
    if not await _capture("06_level5_abyss"):
        return

    _finish(0, "visual-review: 6 screenshots written to %s" % ProjectSettings.globalize_path(_output_dir))

func _boot_game() -> bool:
    var main_scene: PackedScene = load("res://scenes/main.tscn")
    if main_scene == null:
        _finish(5, "visual-review: could not load scenes/main.tscn")
        return false
    _game = main_scene.instantiate()
    # A useful marker for any future controller-side persistence guard. The storage
    # isolation above is the active guard today, and is set before _game enters the tree.
    _game.set_meta("visual_review", true)
    # _ready runs while ShotRunner's parent is still building its child list. Deferring
    # avoids Godot rejecting a direct root add (and then rendering a blank viewport).
    get_tree().root.add_child.call_deferred(_game)
    await get_tree().process_frame
    await get_tree().process_frame
    if not _game.is_inside_tree() or not _game.has_method("start_level"):
        _finish(5, "visual-review: Main failed to enter the tree (check game script compilation)")
        return false
    _ui = _game.get_node_or_null("UI")
    if _ui == null or not _ui.has_method("show_level_select"):
        _finish(5, "visual-review: Main did not provide its UI node")
        return false
    return true

func _prepare_level(level_id: int) -> void:
    if _ui != null:
        _ui._overlay.visible = false
    _game.start_level(level_id)
    _game.running = false
    # This covers the tableau but stays below the gold-hoarder achievement threshold,
    # keeping the review frames free of an unrelated unlock toast.
    _game.gold = 490
    # A high wave only raises the visual test's unit cap; it does not advance a run.
    _game.wave = maxi(_game.wave, 10)
    for tool in ["tower", "catapult", "archer", "swordsman", "knight", "spearman", "mage", "ballista", "wall", "spiketrap"]:
        if tool not in _game.unlocked:
            _game.unlocked.append(tool)
    _game.state_changed.emit()

func _build_showcase_defence() -> void:
    var middle: Array = _game.lanes[1]
    var plan := [
        ["tower", middle[18] + Vector2i(0, -2)],
        ["spiketrap", middle[21]],
        ["catapult", middle[24] + Vector2i(0, 3)],
        ["wall", middle[28]],
        ["archer", middle[30] + Vector2i(0, -2)],
        ["mage", middle[34] + Vector2i(0, 2)],
        ["ballista", middle[38] + Vector2i(0, -3)],
        ["knight", middle[30] + Vector2i(0, 2)],
        ["swordsman", middle[34] + Vector2i(0, -2)],
        ["spearman", middle[38] + Vector2i(0, 2)],
    ]
    for item in plan:
        _place_near(str(item[0]), item[1])
    var upper: Array = _game.lanes[0]
    var lower: Array = _game.lanes[2]
    _place_near("tower", upper[28] + Vector2i(0, -2))
    _place_near("tower", lower[28] + Vector2i(0, 2))
    _game.state_changed.emit()

func _build_light_defence() -> void:
    var middle: Array = _game.lanes[1]
    _place_near("tower", middle[22] + Vector2i(0, -2))
    _place_near("mage", middle[29] + Vector2i(0, 2))
    _place_near("wall", middle[33])
    _place_near("catapult", middle[38] + Vector2i(0, -3))
    _game.state_changed.emit()

## Scenery can claim an intended tile. Search locally so a visual test survives a
## harmless tree/rock placement change without silently losing half its tableau.
func _place_near(tool: String, desired: Vector2i) -> bool:
    for radius in range(0, 5):
        for dx in range(-radius, radius + 1):
            for dz in range(-radius, radius + 1):
                if _game.place(tool, desired.x + dx, desired.y + dz):
                    return true
    push_warning("visual-review: could not place %s near %s" % [tool, desired])
    return false

func _seed_closeup_battle() -> void:
    var lane: Array = _game.lanes[1]
    _game.set_zoom(3.1, Vector2(lane[29].x, lane[29].y))
    var enemies := ["grunt", "wolf", "skeleton", "brute", "enemyArcher", "troll"]
    var path_indices := [20, 22, 24, 26, 18, 16]
    for i in range(enemies.size()):
        var enemy = _game._spawn(enemies[i])
        if enemy == null:
            continue
        var idx: int = path_indices[i]
        enemy.lane_id = 1
        enemy.path = lane
        enemy.path_index = idx
        enemy.progress = 0.0
        enemy.position = Vector3(lane[idx].x, 0.0, lane[idx].y)
        # The preview needs a stable scrum, not a kill that starts a particle tween
        # just as the next biome clears its temporary scene nodes.
        enemy.max_hp *= 10.0
        enemy.hp = enemy.max_hp
    _game.state_changed.emit()

func _seed_abyss_boss() -> void:
    var lane: Array = _game.lanes[1]
    _game.set_zoom(1.55, Vector2(lane[38].x, lane[38].y))
    var boss = _game._spawn("boss", _game.level_def.get("boss", {}), false, true)
    if boss != null:
        var idx := 25
        boss.lane_id = 1
        boss.path = lane
        boss.path_index = idx
        boss.progress = 0.0
        boss.position = Vector3(lane[idx].x, 0.0, lane[idx].y)
    _game.state_changed.emit()

func _select_showcase_defender() -> void:
    for defender in _game.defenders:
        if defender.type_name == "tower":
            defender.kills = 14
            _game.selected_defender = defender
            _game.state_changed.emit()
            return
    _finish(6, "visual-review: no tower was available for the selection panel")

func _quiet_transient_ui() -> void:
    if _ui == null:
        return
    if _ui._toast != null:
        _ui._toast.visible = false
    if _ui._toast_box != null:
        _ui._toast_box.visible = false
    if _ui._ach_lbl != null:
        _ui._ach_lbl.visible = false
    if _ui._ach_box != null:
        _ui._ach_box.visible = false
    _ui._achievement_queue.clear()
    _ui._achievement_showing = false

## Fixed simulation steps make the battle frame repeatable and avoid the old minute-long
## wall-clock wait. Keep Main paused while stepping so the render clock cannot add ticks.
func _advance_sim(seconds: float) -> void:
    var was_running: bool = _game.running
    _game.running = false
    for _i in range(ceili(seconds / SIM_STEP)):
        _game.tick(SIM_STEP)
    _game.running = was_running

func _settle(frame_count: int = 2) -> void:
    var count := 1 if _quick else frame_count
    for _i in range(count):
        await get_tree().process_frame

func _capture(name: String) -> bool:
    if _finished:
        return false
    await _settle(2)
    if _finished:
        return false
    # This is intentionally reachable only with a real renderer (checked in _ready).
    await RenderingServer.frame_post_draw
    var image: Image = get_viewport().get_texture().get_image()
    if image == null or image.is_empty():
        _finish(7, "visual-review: %s produced no rendered pixels" % name)
        return false
    var path := "%s/%s.png" % [_output_dir, name]
    var err := image.save_png(path)
    if err != OK:
        _finish(7, "visual-review: failed to save %s (error %d)" % [path, err])
        return false
    print("visual-review: shot: ", name)
    return true

func _on_timeout() -> void:
    _finish(8, "visual-review: timed out after %d seconds" % int(TIMEOUT_SECONDS))

func _finish(exit_code: int, message: String) -> void:
    if _finished:
        return
    _finished = true
    print(message)
    _restore_save_data()
    get_tree().quit(exit_code)
