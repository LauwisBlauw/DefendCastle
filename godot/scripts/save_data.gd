extends Node
## Durable campaign meta-progress.
##
## Gameplay state deliberately stays in Main; this autoload only owns data that must
## survive a restart.  Keeping it in one JSON document gives the Godot port the same
## durable difficulty / level-record behaviour as the browser build without coupling
## the game controller to FileAccess details.


const SCHEMA_VERSION := 1
const DEFAULT_SAVE_PATH := "user://defend_castle_progress.json"
const DIFFICULTIES: Array[String] = ["easy", "normal", "hard"]
const CAMPAIGN_LEVEL_COUNT := 5
const MAX_STARS := 3

var _save_path := DEFAULT_SAVE_PATH
var _data: Dictionary = {}

func _ready() -> void:
    load_data()

## Tests may select their own file, but production progress is always kept under
## user:// so it is writable on desktop, mobile and exported builds.
func set_storage_path(path: String, reload: bool = true) -> void:
    if not path.begins_with("user://"):
        push_error("SaveData only accepts user:// storage paths")
        return
    _save_path = path
    if reload:
        load_data()

func storage_path() -> String:
    return _save_path

func load_data() -> void:
    _data = _default_data()
    if not FileAccess.file_exists(_save_path):
        return
    var file := FileAccess.open(_save_path, FileAccess.READ)
    if file == null:
        push_warning("Could not open campaign save: %s" % _save_path)
        return
    var parsed: Variant = JSON.parse_string(file.get_as_text())
    if parsed is Dictionary:
        _data = parsed
    else:
        push_warning("Campaign save is invalid; using fresh progress")
    _normalise_data()

func save_data() -> bool:
    _normalise_data()
    var file := FileAccess.open(_save_path, FileAccess.WRITE)
    if file == null:
        push_warning("Could not write campaign save: %s" % _save_path)
        return false
    file.store_string(JSON.stringify(_data, "\t"))
    return true

## A narrowly-scoped cleanup hook for the headless save tests.  It is intentionally
## path-bound, so it cannot erase arbitrary files.
func erase_storage() -> void:
    if FileAccess.file_exists(_save_path):
        DirAccess.remove_absolute(ProjectSettings.globalize_path(_save_path))
    _data = _default_data()

func get_difficulty() -> String:
    var value := str(_data.get("difficulty", "normal"))
    return value if value in DIFFICULTIES else "normal"

func set_difficulty(value: String) -> bool:
    if value not in DIFFICULTIES:
        return false
    if get_difficulty() == value:
        return true
    _data["difficulty"] = value
    return save_data()

func is_level_unlocked(level_id: int) -> bool:
    if level_id == 1:
        return true
    if level_id < 1 or level_id > CAMPAIGN_LEVEL_COUNT:
        return false
    # This mirrors the browser port: a realm opens only after the preceding realm
    # is completed, rather than trusting a stale/edited `unlocked` flag.
    var previous := get_level_progress(level_id - 1)
    return bool(previous.get("completed", false))

func get_level_progress(level_id: int) -> Dictionary:
    if level_id < 1 or level_id > CAMPAIGN_LEVEL_COUNT:
        return {}
    var levels: Dictionary = _data.get("levels", {})
    var entry: Variant = levels.get(str(level_id), _default_level(level_id == 1))
    if not (entry is Dictionary):
        return _default_level(level_id == 1)
    return entry.duplicate(true)

func get_campaign_progress() -> Dictionary:
    var campaign: Variant = _data.get("campaign", {})
    if campaign is Dictionary:
        return campaign.duplicate(true)
    return _campaign_summary()

## Records a completed level.  Star records are campaign-wide, while clear times
## are separated by the difficulty the run began on (as in the original build).
func record_level_result(level_id: int, stars: int, elapsed_seconds: float,
        kill_count: int, run_difficulty: String) -> Dictionary:
    if level_id < 1 or level_id > CAMPAIGN_LEVEL_COUNT:
        return {}
    var difficulty := run_difficulty if run_difficulty in DIFFICULTIES else get_difficulty()
    var levels: Dictionary = _data["levels"]
    var key := str(level_id)
    var entry: Dictionary = _entry_for(level_id)
    var earned := clampi(stars, 0, MAX_STARS)
    var previous_stars: int = int(entry.get("best_stars", 0))
    var previous_kills: int = int(entry.get("best_kills", 0))
    var times: Dictionary = entry.get("best_times", {}).duplicate(true)
    var had_time: bool = times.has(difficulty)
    var previous_time: float = float(times.get(difficulty, 0.0))

    var is_new_star_record := earned > previous_stars
    var is_new_kill_record := maxi(0, kill_count) > previous_kills
    var is_new_time_record := false
    if earned >= 1:
        entry["completed"] = true
        entry["unlocked"] = true
        if is_new_star_record:
            entry["best_stars"] = earned
        if is_new_kill_record:
            entry["best_kills"] = maxi(0, kill_count)
        # Zero is a valid simulated duration in a test, so presence — not truthiness
        # — distinguishes an unset time from an actual record.
        var elapsed := maxf(0.0, elapsed_seconds)
        if not had_time or elapsed < previous_time:
            times[difficulty] = elapsed
            is_new_time_record = true
        entry["best_times"] = times
    levels[key] = entry

    var unlocked_next := false
    if earned >= 1 and level_id < CAMPAIGN_LEVEL_COUNT:
        var next_key := str(level_id + 1)
        var next_entry: Dictionary = _entry_for(level_id + 1)
        unlocked_next = not bool(next_entry.get("unlocked", false))
        next_entry["unlocked"] = true
        levels[next_key] = next_entry

    _refresh_campaign_summary()
    save_data()
    var campaign := get_campaign_progress()
    return {
        "is_new_star_record": is_new_star_record,
        "is_new_kill_record": is_new_kill_record,
        "is_new_time_record": is_new_time_record,
        "previous_best_stars": previous_stars,
        "previous_best_kills": previous_kills,
        "previous_best_time": previous_time if had_time else -1.0,
        "unlocked_next": unlocked_next,
        "campaign_complete": bool(campaign.get("completed", false)),
        "campaign_stars": int(campaign.get("best_stars", 0)),
    }

## A loss can still establish a useful kills record, but it never changes unlocks,
## stars or clear-time records.
func record_level_attempt(level_id: int, kill_count: int) -> Dictionary:
    if level_id < 1 or level_id > CAMPAIGN_LEVEL_COUNT:
        return {}
    var levels: Dictionary = _data["levels"]
    var key := str(level_id)
    var entry: Dictionary = _entry_for(level_id)
    var previous_kills: int = int(entry.get("best_kills", 0))
    var new_kills := maxi(0, kill_count)
    var is_new_kill_record := new_kills > previous_kills
    if is_new_kill_record:
        entry["best_kills"] = new_kills
        levels[key] = entry
        _refresh_campaign_summary()
        save_data()
    return {
        "is_new_kill_record": is_new_kill_record,
        "previous_best_kills": previous_kills,
    }

func format_time(seconds: float) -> String:
    var total_seconds := maxi(0, floori(seconds))
    var minutes := total_seconds / 60
    var remainder := total_seconds % 60
    return "%d:%02d" % [minutes, remainder] if minutes > 0 else "%ds" % remainder

## Achievements ride in the same save file as level progress; they are a plain
## Dictionary so the Achievements class never has to reach for an autoload itself.
func get_achievements() -> Dictionary:
    return _data.get("achievements", {})

func set_achievements(value: Dictionary) -> bool:
    _data["achievements"] = value
    return save_data()

func _default_data() -> Dictionary:
    var levels := {}
    for level_id in range(1, CAMPAIGN_LEVEL_COUNT + 1):
        levels[str(level_id)] = _default_level(level_id == 1)
    return {
        "schema_version": SCHEMA_VERSION,
        "difficulty": "normal",
        "levels": levels,
        "campaign": _campaign_summary_for(levels),
    }

func _default_level(unlocked: bool) -> Dictionary:
    return {
        "unlocked": unlocked,
        "completed": false,
        "best_stars": 0,
        "best_kills": 0,
        "best_times": {},
    }

func _entry_for(level_id: int) -> Dictionary:
    var levels: Dictionary = _data["levels"]
    var raw: Variant = levels.get(str(level_id), _default_level(level_id == 1))
    if raw is Dictionary:
        return raw.duplicate(true)
    return _default_level(level_id == 1)

func _normalise_data() -> void:
    if not (_data is Dictionary):
        _data = {}
    var raw_levels: Variant = _data.get("levels", {})
    var source_levels: Dictionary = raw_levels if raw_levels is Dictionary else {}
    var levels := {}
    for level_id in range(1, CAMPAIGN_LEVEL_COUNT + 1):
        var key := str(level_id)
        var raw_entry: Variant = source_levels.get(key, {})
        var entry: Dictionary = raw_entry.duplicate(true) if raw_entry is Dictionary else {}
        var stars := clampi(int(entry.get("best_stars", 0)), 0, MAX_STARS)
        var kills := maxi(0, int(entry.get("best_kills", 0)))
        var raw_times: Variant = entry.get("best_times", {})
        var times := {}
        if raw_times is Dictionary:
            for difficulty in DIFFICULTIES:
                if raw_times.has(difficulty):
                    var raw_time: Variant = raw_times[difficulty]
                    if typeof(raw_time) == TYPE_INT or typeof(raw_time) == TYPE_FLOAT:
                        times[difficulty] = maxf(0.0, float(raw_time))
        var completed := bool(entry.get("completed", false)) or stars >= 1
        # Completion is canonical; `unlocked` remains in the file for transparent
        # inspection and forward compatibility, but cannot create a skipped level.
        var unlocked := level_id == 1
        if level_id > 1:
            unlocked = bool(levels[str(level_id - 1)].get("completed", false))
        levels[key] = {
            "unlocked": unlocked,
            "completed": completed,
            "best_stars": stars,
            "best_kills": kills,
            "best_times": times,
        }
    _data = {
        "schema_version": SCHEMA_VERSION,
        "difficulty": get_difficulty(),
        "levels": levels,
        "campaign": _campaign_summary_for(levels),
    }

func _refresh_campaign_summary() -> void:
    _data["campaign"] = _campaign_summary_for(_data["levels"])

func _campaign_summary() -> Dictionary:
    var levels: Dictionary = _data.get("levels", {})
    return _campaign_summary_for(levels)

func _campaign_summary_for(levels: Dictionary) -> Dictionary:
    var stars := 0
    var kills := 0
    var completed_levels := 0
    for level_id in range(1, CAMPAIGN_LEVEL_COUNT + 1):
        var entry: Variant = levels.get(str(level_id), {})
        if entry is Dictionary:
            stars += clampi(int(entry.get("best_stars", 0)), 0, MAX_STARS)
            kills += maxi(0, int(entry.get("best_kills", 0)))
            if bool(entry.get("completed", false)):
                completed_levels += 1
    return {
        "best_stars": stars,
        "max_stars": CAMPAIGN_LEVEL_COUNT * MAX_STARS,
        "best_kills": kills,
        "completed_levels": completed_levels,
        "completed": completed_levels == CAMPAIGN_LEVEL_COUNT,
    }
