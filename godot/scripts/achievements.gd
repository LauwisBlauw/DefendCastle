class_name Achievements
extends RefCounted
## The twelve achievements and their unlock rules, ported from src/main.js
## (ACHIEVEMENTS, loadAchievements/saveAchievements, _unlockAchievement, _bumpStat,
## _checkLevelAchievements).
##
## This is a plain value object the caller owns — NOT an autoload. The JS version wrote
## to localStorage and popped a toast from inside every unlock, which is why nothing
## about it could be exercised without a storage layer and a DOM. Here the rules are the
## whole class: persistence is two plain Dictionaries (_init / to_dict), and every
## mutator hands back the ids it just flipped so the caller can toast exactly those.
## Nothing in here reaches for SaveData, Cfg or Snd.
##
## The JS table carried an emoji icon per entry. Those are dropped: the export targets
## disagree about which of them exist (the variation-selector ones — ⚔️ 🛡️ ⚗️ ♾️ — come
## back as tofu on Android, and the fallback desktop font substitutes at a different
## size, so a list of them never lines up). Each entry instead carries `tag`, a two- to
## four-character uppercase badge picked so the twelve are separable at a glance in a
## list: counter achievements read as their own threshold ("100", "1K", "W50", "W20"),
## one-shot events as a word stem ("BOSS", "RLY").

## The full table. Each entry: {"id", "name", "desc", "tag"}. Ids, names and
## descriptions are verbatim from the JS ACHIEVEMENTS array.
const ALL := [
    {"id": "firstBlood",     "name": "First Blood",          "desc": "Defeat your first enemy",                                 "tag": "1ST"},
    {"id": "centurion",      "name": "Centurion",            "desc": "Defeat 100 enemies",                                     "tag": "100"},
    {"id": "slayer1000",     "name": "Slayer of a Thousand", "desc": "Defeat 1000 enemies",                                    "tag": "1K"},
    {"id": "bossKill",       "name": "Giant Slayer",         "desc": "Defeat any level boss",                                  "tag": "BOSS"},
    {"id": "flawlessBoss",   "name": "Untouchable",          "desc": "Defeat a level boss without losing a defender that wave", "tag": "FLW"},
    {"id": "wallEnjoyer",    "name": "Master Mason",         "desc": "Place 50 walls",                                         "tag": "W50"},
    {"id": "goldHoarder",    "name": "Gold Hoarder",         "desc": "Hold 500 gold at once",                                  "tag": "AU"},
    {"id": "level3Star",     "name": "Triple Crown",         "desc": "Earn 3 stars on any level",                              "tag": "3ST"},
    {"id": "allLevelsClear", "name": "World Tour",           "desc": "Complete all 5 levels",                                  "tag": "ALL"},
    {"id": "allLevels3Star", "name": "Perfect Run",          "desc": "Earn 3 stars on all 5 levels",                           "tag": "MAX"},
    {"id": "endlessWave20",  "name": "Eternal Defender",     "desc": "Reach wave 20 in endless mode",                          "tag": "W20"},
    {"id": "rallyMaster",    "name": "Tactical Genius",      "desc": "Set a soldier rally point",                              "tag": "RLY"},
]

## Counter names. Spelled as in the JS save document so a browser save imports as-is.
const STAT_KILLS := "kills"
const STAT_WALLS := "wallsBuilt"

# Thresholds, all read off the JS unlock sites rather than the description strings.
const T_CENTURION := 100
const T_SLAYER := 1000
const T_WALLS := 50
const T_GOLD := 500          ## updateHUD(): gold >= 500 at any instant
const T_ENDLESS_WAVE := 20   ## startWave(): endless level, wave >= 20
const T_STARS := 3

## Self-reference used only by self_test(): a static function cannot say `new()`
## unqualified, and naming the class there breaks a bare `--check-only --script` run,
## where the global class table has not been built yet.
const _SELF := preload("res://scripts/achievements.gd")

var _unlocked: Array[String] = []
var _stats: Dictionary = {}

## Fresh state, or a restore of a to_dict() document.
func _init(saved: Dictionary = {}) -> void:
    _stats = {STAT_KILLS: 0, STAT_WALLS: 0}
    var s: Variant = saved.get("stats", {})
    if s is Dictionary:
        for k in s:
            # JSON round-trips integers as floats; anything non-numeric is a corrupt
            # save and is left at the default rather than poisoning a threshold test.
            var v: Variant = s[k]
            if v is int or v is float:
                _stats[String(k)] = int(v)
    var u: Variant = saved.get("unlocked", [])
    if u is Array:
        for raw in u:
            var id := String(raw)
            # Ids not in the current table are dropped. A save written by a build with
            # a different table would otherwise inflate unlocked_count() forever, and
            # the achievements screen would have a row it cannot render.
            if _index_of(id) >= 0 and not _unlocked.has(id):
                _unlocked.append(id)

## Serialise for SaveData: {"unlocked": [ids], "stats": {...}}.
func to_dict() -> Dictionary:
    return {"unlocked": _unlocked.duplicate(), "stats": _stats.duplicate()}

## Add to a counter and re-check every threshold that depends on it.
## Returns the ids newly unlocked by this call.
func bump(stat_name: String, amount: int = 1) -> Array[String]:
    return _set_stat(stat_name, stat(stat_name) + amount)

## Returns [id] if this call is what unlocked it, [] if it was already unlocked or the
## id is not in the table (the JS _unlockAchievement is likewise a no-op for both).
func unlock(id: String) -> Array[String]:
    var out: Array[String] = []
    if _unlock(id):
        out.append(id)
    return out

## The single hook for everything that is not a plain counter. Event names and their
## `value` argument, with the JS site each came from:
##   "kill"             value = running kill total   (onEnemyKilled)
##   "boss_killed"      -                            (onEnemyKilled, orc.isLevelBoss)
##   "flawless_boss"    -                            (same, gated on waveDefDeaths == 0)
##   "wall_built"       value = walls placed, or 0 for one  (placeDefender)
##   "gold_held"        value = current gold         (updateHUD)
##   "level_stars"      value = stars earned         (_checkLevelAchievements)
##   "all_levels_clear" -                            (_checkLevelAchievements)
##   "all_levels_3star" -                            (_checkLevelAchievements)
##   "endless_wave"     value = wave number          (startWave)
##   "rally_set"        -                            (_setRallyPoint)
## The three level events are deliberately separate rather than one "level result":
## the JS scans all five levels' saved progress and fires whichever of the three now
## holds, so the caller — which owns that progress table — does the scan and reports.
func note_event(event: String, value: int = 0) -> Array[String]:
    var out: Array[String] = []
    match event:
        "kill":
            # The caller passes its running total, not a delta, so replaying a HUD
            # refresh cannot double-count and a total loaded from a save cannot be
            # walked backwards by a counter that restarted at zero.
            if value > 0:
                return _set_stat(STAT_KILLS, maxi(stat(STAT_KILLS), value))
            return bump(STAT_KILLS, 1)
        "wall_built":
            return bump(STAT_WALLS, maxi(1, value))
        "boss_killed":
            _try(out, true, "bossKill")
        "flawless_boss":
            _try(out, true, "flawlessBoss")
        "gold_held":
            _try(out, value >= T_GOLD, "goldHoarder")
        "level_stars":
            _try(out, value >= T_STARS, "level3Star")
        "all_levels_clear":
            _try(out, true, "allLevelsClear")
        "all_levels_3star":
            _try(out, true, "allLevels3Star")
        "endless_wave":
            _try(out, value >= T_ENDLESS_WAVE, "endlessWave20")
        "rally_set":
            _try(out, true, "rallyMaster")
        _:
            push_warning("Achievements: unknown event '%s'" % event)
    return out

func is_unlocked(id: String) -> bool:
    return _unlocked.has(id)

func stat(stat_name: String) -> int:
    return int(_stats.get(stat_name, 0))

func unlocked_count() -> int:
    return _unlocked.size()

## The table row for `id`, or {} if unknown. The row is the constant — read only.
func entry(id: String) -> Dictionary:
    var i := _index_of(id)
    if i < 0:
        return {}
    var row: Dictionary = ALL[i]
    return row

# ── internals ────────────────────────────────────────────────────────────────

static func _index_of(id: String) -> int:
    for i in ALL.size():
        if ALL[i]["id"] == id:
            return i
    return -1

func _unlock(id: String) -> bool:
    if _unlocked.has(id) or _index_of(id) < 0:
        return false
    _unlocked.append(id)
    return true

## Unlock `id` when `cond` holds, appending to `out` only if this call is what flipped
## it. Every threshold is re-tested on every bump — like the JS — so a save restored
## above a threshold still awards it on the next relevant event.
func _try(out: Array[String], cond: bool, id: String) -> void:
    if cond and _unlock(id):
        out.append(id)

func _set_stat(stat_name: String, value: int) -> Array[String]:
    _stats[stat_name] = value
    var out: Array[String] = []
    if stat_name == STAT_KILLS:
        _try(out, value >= 1, "firstBlood")
        _try(out, value >= T_CENTURION, "centurion")
        _try(out, value >= T_SLAYER, "slayer1000")
    elif stat_name == STAT_WALLS:
        _try(out, value >= T_WALLS, "wallEnjoyer")
    return out

# ── self check ───────────────────────────────────────────────────────────────

## Returns [passed, failed] — exercised by the project test suite.
static func self_test() -> Array:
    # A lambda captures by value, but Array is a reference type, so the tally survives.
    var res := [0, 0]
    var ok := func(label: String, cond: bool) -> void:
        if cond:
            res[0] += 1
        else:
            res[1] += 1
            print("  FAIL  Achievements.self_test: ", label)

    # Results are compared element-wise rather than with `==`, so that the typed
    # Array[String] coming back from the API never has to be `==`-compatible with an
    # untyped literal for the assertion to mean what it reads as.
    var same := func(got: Array, want: Array) -> bool:
        if got.size() != want.size():
            return false
        for i in got.size():
            if got[i] != want[i]:
                return false
        return true

    var a := _SELF.new()
    ok.call("fresh state has nothing unlocked", a.unlocked_count() == 0 and a.stat(STAT_KILLS) == 0)
    ok.call("first blood fires on the first kill", same.call(a.note_event("kill", 1), ["firstBlood"]))
    ok.call("first blood does not fire twice", same.call(a.note_event("kill", 2), []))
    ok.call("and it stayed unlocked", a.is_unlocked("firstBlood"))

    var b := _SELF.new()
    ok.call("99 kills is not yet Centurion", same.call(b.note_event("kill", 99), ["firstBlood"]))
    ok.call("centurion still locked at 99", not b.is_unlocked("centurion"))
    ok.call("centurion fires at exactly 100", same.call(b.note_event("kill", 100), ["centurion"]))
    ok.call("centurion does not re-report at 101", same.call(b.note_event("kill", 101), []))
    ok.call("999 kills is not yet Slayer", same.call(b.note_event("kill", 999), []))
    ok.call("slayer fires at exactly 1000", same.call(b.note_event("kill", 1000), ["slayer1000"]))
    ok.call("a lower running total does not rewind the counter", b.stat(STAT_KILLS) == 1000)

    # Walls come in one at a time from placeDefender, so the counter has to survive
    # across calls — this is the case the JS got right and a naive port loses.
    var c := _SELF.new()
    var early_unlock := false
    for i in 49:
        if not c.bump(STAT_WALLS).is_empty():
            early_unlock = true
    ok.call("walls accumulate across calls", c.stat(STAT_WALLS) == 49)
    ok.call("no wall unlock before 50", not early_unlock)
    ok.call("master mason fires on the 50th wall", same.call(c.bump(STAT_WALLS), ["wallEnjoyer"]))
    ok.call("bump never re-reports an unlocked id", same.call(c.bump(STAT_WALLS, 25), []))
    ok.call("unlock() is idempotent too", same.call(c.unlock("wallEnjoyer"), []))

    # Round trip through the exact JSON path SaveData uses — the ints come back as
    # floats, which is what makes the int() coercion in _init load-bearing.
    var doc: Variant = JSON.parse_string(JSON.stringify(c.to_dict()))
    var d := _SELF.new(doc)
    ok.call("round trip preserves unlocked ids", d.is_unlocked("wallEnjoyer") and d.unlocked_count() == c.unlocked_count())
    ok.call("round trip preserves stats", d.stat(STAT_WALLS) == 75)
    ok.call("round trip drops nothing else in", d.unlocked_count() == 1)
    ok.call("restored state still does not re-report", same.call(d.bump(STAT_WALLS), []))

    var e := _SELF.new()
    ok.call("499 gold is not Gold Hoarder", same.call(e.note_event("gold_held", 499), []))
    ok.call("500 gold is", same.call(e.note_event("gold_held", 500), ["goldHoarder"]))
    ok.call("2 stars is not Triple Crown", same.call(e.note_event("level_stars", 2), []))
    ok.call("3 stars is", same.call(e.note_event("level_stars", 3), ["level3Star"]))
    ok.call("endless wave 19 is not Eternal Defender", same.call(e.note_event("endless_wave", 19), []))
    ok.call("endless wave 20 is", same.call(e.note_event("endless_wave", 20), ["endlessWave20"]))
    ok.call("one-shot events fire once", same.call(e.note_event("boss_killed"), ["bossKill"]) and same.call(e.note_event("boss_killed"), []))
    ok.call("unknown ids are ignored", same.call(e.unlock("notAnAchievement"), []) and e.unlocked_count() == 4)
    ok.call("unknown ids are not restored from a save", _SELF.new({"unlocked": ["ghost", "bossKill"]}).unlocked_count() == 1)

    # Every remaining event name is exercised at least once: a typo in a match arm
    # would otherwise surface only as an unlock that silently never fires in a build.
    var f := _SELF.new()
    ok.call("wall_built counts a single wall", same.call(f.note_event("wall_built"), []) and f.stat(STAT_WALLS) == 1)
    ok.call("flawless_boss unlocks Untouchable", same.call(f.note_event("flawless_boss"), ["flawlessBoss"]))
    ok.call("all_levels_clear unlocks World Tour", same.call(f.note_event("all_levels_clear"), ["allLevelsClear"]))
    ok.call("all_levels_3star unlocks Perfect Run", same.call(f.note_event("all_levels_3star"), ["allLevels3Star"]))
    ok.call("rally_set unlocks Tactical Genius", same.call(f.note_event("rally_set"), ["rallyMaster"]))

    var ids := {}
    var tags := {}
    for row in ALL:
        ids[row["id"]] = true
        tags[row["tag"]] = true
    ok.call("table has twelve entries", ALL.size() == 12)
    ok.call("ids are unique", ids.size() == 12)
    ok.call("tags are unique and legible", tags.size() == 12 and not tags.has(""))
    ok.call("entry() finds a row and misses cleanly", _SELF.new().entry("centurion")["tag"] == "100" and _SELF.new().entry("nope").is_empty())

    return [res[0], res[1]]
