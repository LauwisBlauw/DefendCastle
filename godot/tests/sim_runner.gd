extends Node
## Headless integration sim. Instantiates the REAL game scene and drives tick() by hand
## at a fixed step, so the whole stack — spawner, enemy state machine, defenders,
## projectiles, economy — is exercised without a renderer.
##
## This is the test that catches the bugs unit tests cannot: an enemy that wedges
## against a wall forever, a defender that never acquires, a wave that never ends.

const STEP := 1.0 / 60.0

var _pass := 0
var _fail := 0

func _ready() -> void:
    # The gameplay checks also award achievements and win levels. Isolate them
    # before the FIRST game is instantiated, not only in the save-specific tests.
    var player_save: String = SaveData.storage_path()
    var test_save := "user://_sim_review_%d.json" % OS.get_process_id()
    SaveData.set_storage_path(test_save)
    print("\n=== integration sim ===")
    _sim_wave_clears()
    _sim_walls_block_and_break()
    _sim_all_enemy_types_reach_or_die()
    _sim_defender_kills_and_upgrades()
    _sim_economy_and_placement_rules()
    _sim_all_levels_build()
    _sim_boss_and_level_completion()
    _sim_defeat()
    _sim_special_abilities()
    _sim_restored_mechanics()
    _sim_targeting_gate()
    _sim_recovered_ai()
    _sim_last_stand()
    _sim_persistence()
    _sim_progress_integration()
    _sim_menu_reads_progress()
    _sim_endless_and_merchant()
    _sim_achievements()
    _sim_camera_and_rally()
    _sim_trackpad_pan()
    _sim_left_drag()
    _sim_audio()
    print("\n%d passed, %d failed" % [_pass, _fail])
    SaveData.erase_storage()
    SaveData.set_storage_path(player_save)
    get_tree().quit(1 if _fail > 0 else 0)

## The level's last wave must produce the level boss, and clearing it must finish the
## level rather than rolling on into the next wave.
func _sim_boss_and_level_completion() -> void:
    print("\n-- the boss spawns on the final wave and the level completes --")
    var g = _new_game(1)
    var finished := {"hit": false, "won": false, "stars": 0}
    g.level_finished.connect(func(won, stars):
        finished["hit"] = true
        finished["won"] = won
        finished["stars"] = stars)

    # Overwhelming defence, so the run is decided by the level logic and not by dice.
    g.gold = 999999
    for t in ["archer", "spiketrap", "ballista", "mage", "spearman", "knight", "catapult"]:
        if t not in g.unlocked:
            g.unlocked.append(t)
    var placed := 0
    for lane_i in range(3):
        var lane: Array = g.lanes[lane_i]
        for step in [14, 22, 30, 38, 46]:
            var t: Vector2i = lane[step]
            if g.place("ballista", t.x, t.y - 2):
                placed += 1
            if g.place("ballista", t.x, t.y + 2):
                placed += 1
    check(placed >= 6, "a heavy defence was placed (%d emplacements, capped by unit slots)" % placed)

    var saw_boss := false
    for w in range(3):
        g.start_wave()
        for i in range(int(240.0 / STEP)):
            g.tick(STEP)
            for e in g.enemies:
                if e.is_level_boss:
                    saw_boss = true
            if not g._wave_active:
                break
        if finished["hit"]:
            break
    check(saw_boss, "the level boss spawned on the final wave")
    check(finished["hit"], "level_finished fired")
    check(finished["won"], "the level was won with a heavy defence")
    check(finished["stars"] >= 1, "at least one star awarded (%d)" % finished["stars"])
    check(not g.running, "the run stops once the level is finished")
    _drop(g)

## The opposite end: no defences at all must reach a real game over, not a stalemate.
func _sim_defeat() -> void:
    print("\n-- an undefended castle actually falls --")
    var g = _new_game(1)
    var lost := {"hit": false, "won": true}
    g.level_finished.connect(func(won, _stars):
        lost["hit"] = true
        lost["won"] = won)
    for w in range(6):
        g.start_wave()
        for i in range(int(300.0 / STEP)):
            g.tick(STEP)
            if lost["hit"] or not g._wave_active:
                break
        if lost["hit"]:
            break
    check(lost["hit"], "level_finished fired on defeat")
    check(not lost["won"], "it was reported as a loss")
    check(g.castle_hp == 0, "the castle is at zero")
    _drop(g)

## The behaviours that make each enemy type distinct, checked in isolation.
func _sim_special_abilities() -> void:
    print("\n-- special enemy behaviours --")

    # Skeletons phase through walls instead of stopping to hit them.
    var g = _new_game(1)
    g.gold = 9999
    var lane: Array = g.lanes[0]
    g.place("wall", lane[10].x, lane[10].y)
    g._wave_active = true
    g._queue = [] as Array[String]
    var skel = g._spawn("skeleton")
    var passed_wall := false
    for i in range(int(60.0 / STEP)):
        g.tick(STEP)
        if skel.path_index > 12:
            passed_wall = true
            break
        if not skel.alive:
            break
    check(passed_wall, "a skeleton phases through a wall")
    _drop(g)

    # A troll regenerates; a grunt does not.
    g = _new_game(1)
    g._wave_active = true
    g._queue = [] as Array[String]
    var troll = g._spawn("troll")
    troll.hp = 10.0
    _run(g, 6.0)
    check(troll.hp > 10.0, "a troll regenerates (%.1f)" % troll.hp)
    _drop(g)

    # A healer lifts a wounded ally.
    g = _new_game(1)
    g._wave_active = true
    g._queue = [] as Array[String]
    var healer = g._spawn("healerOrc")
    var hurt = g._spawn("grunt")
    hurt.path = healer.path
    hurt.lane_id = healer.lane_id
    hurt.path_index = healer.path_index
    hurt.progress = healer.progress
    hurt.position = healer.position
    hurt.hp = 4.0
    var before: float = hurt.hp
    _run(g, 5.0)
    check(hurt.hp > before, "a healer orc heals a wounded ally (%.1f -> %.1f)" % [before, hurt.hp])
    _drop(g)

    # An exploder damages what is around it when it dies.
    g = _new_game(1)
    g.gold = 9999
    check(g.place("tower", 10, 14), "test tower placed on grass beside lane A")
    var tower = g.defender_at(10, 14)
    g._wave_active = true
    g._queue = [] as Array[String]
    var bomber = g._spawn("exploder")
    bomber.position = Vector3(10, 0, 15)
    var hp_before: float = tower.hp
    g.damage_enemy(bomber, 999.0)
    check(tower.hp < hp_before, "an exploder damages a nearby defender on death (%.0f -> %.0f)" % [hp_before, tower.hp])
    _drop(g)

    # A mage's orb slows what it hits.
    g = _new_game(1)
    g._wave_active = true
    g._queue = [] as Array[String]
    var victim = g._spawn("grunt")
    victim.apply_slow(2.0, 0.4)
    var p0: float = victim.progress + victim.path_index
    _run(g, 1.0)
    var moved_slow: float = (victim.progress + victim.path_index) - p0
    _drop(g)
    g = _new_game(1)
    g._wave_active = true
    g._queue = [] as Array[String]
    var control = g._spawn("grunt")
    var q0: float = control.progress + control.path_index
    _run(g, 1.0)
    var moved_fast: float = (control.progress + control.path_index) - q0
    check(moved_slow < moved_fast * 0.6, "a slowed enemy moves markedly less (%.2f vs %.2f tiles)" % [moved_slow, moved_fast])
    _drop(g)

## The audio is BAKED from the JS engine rather than reimplemented, so the thing worth
## checking is that every cue the game actually fires has a file behind it — a missing
## one is silent at runtime and nothing complains.
func _sim_audio() -> void:
    print("\n-- baked audio --")
    var sfx := DirAccess.get_files_at("res://audio/sfx")
    var music := DirAccess.get_files_at("res://audio/music")
    var n_sfx := 0
    for f in sfx:
        if f.ends_with(".wav"):
            n_sfx += 1
    var n_mus := 0
    for f in music:
        if f.ends_with(".ogg"):
            n_mus += 1
    check(n_sfx >= 45, "sound effects are present (%d files)" % n_sfx)
    check(n_mus >= 10, "music tracks are present (%d files)" % n_mus)

    # Every name passed to Snd.play() anywhere in the codebase must resolve to a file.
    var cues: Array[String] = []
    for path in ["res://scenes/main.gd", "res://scripts/defender.gd", "res://scripts/enemy.gd", "res://scenes/ui.gd"]:
        var src := FileAccess.get_file_as_string(path)
        var re := RegEx.new()
        re.compile("Snd\\.play\\(\"([a-z_]+)\"")
        for m in re.search_all(src):
            var cue: String = m.get_string(1)
            if cue not in cues:
                cues.append(cue)
    var missing: Array[String] = []
    for cue in cues:
        if not ResourceLoader.exists("res://audio/sfx/%s.wav" % cue):
            missing.append(cue)
    check(cues.size() >= 15, "the game fires a real set of cues (%d distinct)" % cues.size())
    check(missing.is_empty(), "every cue the game fires has a file (missing: %s)" % str(missing))

    # And the streams actually load and carry audio.
    var loaded := 0
    var empty: Array[String] = []
    for cue in cues:
        var st = load("res://audio/sfx/%s.wav" % cue)
        if st != null:
            loaded += 1
            if st.get_length() <= 0.005:
                empty.append(cue)
    check(loaded == cues.size(), "every cue's stream loads (%d/%d)" % [loaded, cues.size()])
    check(empty.is_empty(), "no cue is an empty file (%s)" % str(empty))

    var track = load("res://audio/music/wide.ogg")
    check(track != null, "a music track loads")
    check(track != null and track.get_length() > 20.0, "the track is a real tune, not a stub (%.1fs)" % (track.get_length() if track else 0.0))
    check(Snd.LEVEL_SONGS.size() == 5, "every campaign level is mapped to a track")
    for lid in Snd.LEVEL_SONGS:
        var t: String = Snd.LEVEL_SONGS[lid]
        check(ResourceLoader.exists("res://audio/music/%s.ogg" % t), "level %d track '%s' exists" % [lid, t])

## The mechanics recovered by the fidelity audit. Each of these was silently absent from
## the port and invisible to the earlier tests, so each gets a direct assertion.
func _sim_restored_mechanics() -> void:
    print("\n-- mechanics recovered from the JS --")

    # Elite enemies: double hp, 1.3x speed, double reward, 1.15x scale.
    var g = _new_game(1)
    g._wave_active = true
    g._queue = [] as Array[String]
    var plain = g._spawn("grunt")
    var elite = g._spawn("grunt", {}, true)
    check(elite.max_hp == plain.max_hp * 2.0, "an elite has double HP (%.0f vs %.0f)" % [elite.max_hp, plain.max_hp])
    check(absf(elite.speed - plain.speed * 1.3) < 0.001, "an elite is 30% faster")
    check(elite.reward == plain.reward * 2, "an elite is worth double")
    check(absf(elite.scale_f - plain.scale_f * 1.15) < 0.001, "an elite is 15% larger")
    _drop(g)

    # Rage: enemies spawned after wave 10 are faster.
    g = _new_game(5)
    g._wave_active = true
    g._queue = [] as Array[String]
    g.wave = 10
    var calm = g._spawn("grunt")
    g.wave = 15
    var raging = g._spawn("grunt")
    check(absf(raging.speed - calm.speed * 1.25) < 0.001,
        "wave 15 enemies move 25%% faster than wave 10 (%.2f vs %.2f)" % [raging.speed, calm.speed])
    _drop(g)

    # Counter-attack: an enemy hits back at whatever damaged it.
    g = _new_game(1)
    g.gold = 9999
    var sat: Vector2i = _place_near(g, "swordsman", 10, 14)
    var sword = g.defender_at(sat.x, sat.y)
    g._wave_active = true
    g._queue = [] as Array[String]
    var foe = g._spawn("brute")
    foe.position = Vector3(10, 0, 15)
    var sword_hp: float = sword.hp
    # credit AND provoker — a melee strike is both.
    g.damage_enemy(foe, 1.0, sword, sword)
    check(sword.hp < sword_hp, "an enemy counter-attacks the unit that hit it (%.0f -> %.0f)" % [sword_hp, sword.hp])
    check(foe.state == Enemy.State.FIGHT, "and turns to engage it")
    _drop(g)

    # Riposte: a melee defender hits back the instant it is struck.
    g = _new_game(1)
    g.gold = 9999
    g.unlocked.append("knight")      # knight unlocks at wave 8; this runs before wave 1
    var kat: Vector2i = _place_near(g, "knight", 10, 14)
    check(kat.x >= 0, "test knight placed")
    var knight = g.defender_at(kat.x, kat.y)
    g._wave_active = true
    g._queue = [] as Array[String]
    var attacker = g._spawn("grunt")
    attacker.position = Vector3(10, 0, 15)
    var foe_hp: float = attacker.hp
    g.damage_defender(knight, 1.0, attacker)
    check(attacker.hp < foe_hp, "a knight ripostes when struck (%.0f -> %.0f)" % [foe_hp, attacker.hp])
    _drop(g)

    # Skeleton venom: a lingering poison that keeps ticking after the bite.
    g = _new_game(1)
    g.gold = 9999
    var tat: Vector2i = _place_near(g, "tower", 10, 14)
    var tower = g.defender_at(tat.x, tat.y)
    g._wave_active = true
    g._queue = [] as Array[String]
    var skel = g._spawn("skeleton")
    g.damage_defender(tower, 1.0, skel)
    var after_bite: float = tower.hp
    _run(g, 2.0)
    check(tower.hp < after_bite, "skeleton venom keeps damaging after the bite (%.1f -> %.1f)" % [after_bite, tower.hp])
    # A wall is immune to it.
    g.place("wall", 12, 14)
    var wall = g.defender_at(12, 14)
    g.damage_defender(wall, 1.0, skel)
    var wall_hp: float = wall.hp
    _run(g, 2.0)
    check(wall.hp == wall_hp, "a wall is immune to venom")
    _drop(g)

    # Orc-mage curse: the struck unit reloads 40% slower.
    g = _new_game(1)
    g.gold = 9999
    var t2at: Vector2i = _place_near(g, "tower", 10, 14)
    var t2 = g.defender_at(t2at.x, t2at.y)
    t2.apply_curse(3.0)
    t2.cooldown = 1.0
    _run(g, 0.5)
    check(t2.cooldown > 0.65, "a cursed unit reloads 40%% slower (%.2f left, uncursed would be ~0.50)" % t2.cooldown)
    _drop(g)

    # Spider webs slow whatever walks through them.
    g = _new_game(1)
    g._wave_active = true
    g._queue = [] as Array[String]
    var spider = g._spawn("spider")
    var web_at: Vector3 = spider.global_position
    g.damage_enemy(spider, 999.0)
    check(g._web_zones.size() == 1, "a dead spider leaves a web")
    var walker = g._spawn("grunt")
    # Put the walker ON the web. Setting .position alone is not enough — the walk state
    # re-derives position from (path_index, progress) every tick, so it would snap back
    # to the lane start before the web could touch it.
    walker.path = spider.path
    walker.lane_id = spider.lane_id
    walker.path_index = spider.path_index
    walker.progress = spider.progress
    walker.position = web_at
    g._tick_web_zones(0.05)
    check(walker._slow_amount < 1.0, "the web slows an enemy standing in it (%.2f)" % walker._slow_amount)
    _drop(g)

    # Kill streak bonus gold.
    g = _new_game(1)
    g._wave_active = true
    g._queue = [] as Array[String]
    var before_gold: int = g.gold
    var reward_total := 0
    for i in range(6):
        var v = g._spawn("grunt")
        reward_total += int(round(v.reward * float(Cfg.DIFFICULTY[g.difficulty]["rewardMult"])))
        g.damage_enemy(v, 999.0)
    check(g.gold > before_gold + reward_total,
        "a kill streak pays a bonus beyond the base rewards (+%d vs %d base)" % [g.gold - before_gold, reward_total])
    _drop(g)

    # The boss finale: trimmed opener, retinue, then the boss, all on one road.
    g = _new_game(1)
    g.wave = 2
    g.start_wave()
    var has_boss := false
    var retinue := 0
    for t in g._queue:
        if t == "__levelBoss": has_boss = true
        elif t.begins_with("retinue:"): retinue += 1
    check(has_boss, "the final wave queues the level boss")
    check(retinue == 3, "the boss brings three retinue guards (%d)" % retinue)
    var lanes_used := {}
    for i in range(int(400.0 / STEP)):
        g.tick(STEP)
        for e in g.enemies:
            if e.is_level_boss or e.is_elite:
                lanes_used[e.lane_id] = true
        if g.enemies.size() > 0 and lanes_used.size() > 0 and not g._wave_active:
            break
    check(lanes_used.size() <= 1, "the boss column shares one road (%d lanes used)" % lanes_used.size())
    _drop(g)

    # Ranged enemies shoot a blocking wall rather than punching it.
    g = _new_game(1)
    g.gold = 9999
    var lane: Array = g.lanes[0]
    g.place("wall", lane[10].x, lane[10].y)
    var w2 = g.defender_at(lane[10].x, lane[10].y)
    g._wave_active = true
    g._queue = [] as Array[String]
    # Lane choice is least-loaded now, not round-robin — bias the counts so the archer
    # is guaranteed onto the lane the wall stands on.
    g._lane_counts = [0, 99, 99] as Array[int]
    var archer_foe = g._spawn("enemyArcher")
    var shot := false
    for i in range(int(40.0 / STEP)):
        g.tick(STEP)
        if g.projectiles.size() > 0:
            shot = true
            break
        if not w2.alive:
            break
    check(shot, "an enemy archer shoots a wall that blocks it")
    _drop(g)

## Last Stand: the castle's first fall is survivable IF something is still fighting.
func _sim_last_stand() -> void:
    print("\n-- last stand --")

    # With a live defender, hitting zero grants the reprieve rather than ending the run.
    var g = _new_game(1)
    var finished := {"hit": false}
    g.level_finished.connect(func(_w, _s): finished["hit"] = true)
    g.gold = 9999
    g.place("tower", 10, 14)
    g._wave_active = true
    g._queue = [] as Array[String]
    var e = g._spawn("grunt")
    g.castle_hp = 5
    g._on_castle_hit(e)
    check(g.last_stand_active, "hitting zero with a live defender arms Last Stand")
    check(g.castle_hp == 1, "the castle is left on 1 HP (%d)" % g.castle_hp)
    check(absf(g.last_stand_timer - 30.0) < 0.001, "the countdown starts at 30s")
    check(not finished["hit"], "the run is not over")

    # Defenders hit three times as hard while it lasts.
    var foe = g._spawn("grunt")
    var before: float = foe.hp
    g.damage_enemy(foe, 2.0)
    check(absf((before - foe.hp) - 6.0) < 0.001,
        "defenders deal 3x damage during Last Stand (%.0f dealt for a 2 hit)" % (before - foe.hp))

    # Holding to the end of the wave releases it and restores a quarter of the castle.
    for o in g.enemies.duplicate():
        g.damage_enemy(o, 9999.0)
    _run(g, 2.0)
    g._check_wave_end()
    check(not g.last_stand_active, "clearing the wave releases Last Stand")
    # The restore lifts it to a quarter (70), and THEN the ordinary between-waves regen
    # adds min(15, 5% of max) = 14 on top — the same order as the JS checkWaveEnd.
    var expect_hp: int = int(round(Cfg.CASTLE_MAX_HP * 0.25)) + mini(15, int(Cfg.CASTLE_MAX_HP * 0.05))
    check(g.castle_hp == expect_hp,
        "the castle is restored to a quarter plus wave regen (%d, expected %d)" % [g.castle_hp, expect_hp])
    check(not finished["hit"], "surviving Last Stand is not a loss")
    _drop(g)

    # Letting the timer run out loses the run.
    g = _new_game(1)
    var lost := {"hit": false, "won": true}
    g.level_finished.connect(func(w, _s):
        lost["hit"] = true
        lost["won"] = w)
    g.gold = 9999
    g.place("tower", 10, 14)
    g._wave_active = true
    g._queue = [] as Array[String]
    var e2 = g._spawn("grunt")
    g.castle_hp = 5
    g._on_castle_hit(e2)
    check(g.last_stand_active, "Last Stand armed for the timeout case")
    # Clearing the wave would RELEASE Last Stand, which is the other exit. Close the wave
    # so the countdown is the only thing that can end this run.
    g._wave_active = false
    _run(g, 31.0)
    check(lost["hit"] and not lost["won"], "letting the countdown expire loses the run")
    _drop(g)

    # With only walls left there is nothing to fight with, so no reprieve is granted.
    g = _new_game(1)
    var lost2 := {"hit": false}
    g.level_finished.connect(func(_w, _s): lost2["hit"] = true)
    g.gold = 9999
    var lane: Array = g.lanes[0]
    g.place("wall", lane[8].x, lane[8].y)
    g._wave_active = true
    g._queue = [] as Array[String]
    var e3 = g._spawn("grunt")
    g.castle_hp = 5
    g._on_castle_hit(e3)
    check(not g.last_stand_active, "walls alone do not arm Last Stand")
    check(lost2["hit"], "and the run ends immediately")
    _drop(g)

## The campaign save is 11 KB of autoload wired into the controller at six call sites,
## including the loss path, and had no coverage at all.
func _sim_persistence() -> void:
    print("\n-- campaign persistence --")
    SaveData.set_storage_path("user://_test_progress.json")
    SaveData.erase_storage()

    check(SaveData.get_difficulty() == "normal", "difficulty defaults to normal")
    check(SaveData.set_difficulty("hard"), "a valid difficulty is accepted")
    check(SaveData.get_difficulty() == "hard", "and is remembered")
    check(not SaveData.set_difficulty("nightmare"), "an unknown difficulty is refused")
    check(SaveData.get_difficulty() == "hard", "and does not clobber the stored value")

    # Reloading from disk must return what was written.
    SaveData.load_data()
    check(SaveData.get_difficulty() == "hard", "difficulty survives a reload")

    # Unlock chain: only level 1 is open until its predecessor is completed.
    check(SaveData.is_level_unlocked(1), "level 1 is always unlocked")
    check(not SaveData.is_level_unlocked(2), "level 2 starts locked")
    SaveData.record_level_result(1, 3, 42.0, 120, "hard")
    check(SaveData.is_level_unlocked(2), "clearing level 1 unlocks level 2")
    check(not SaveData.is_level_unlocked(3), "but not level 3")
    check(not SaveData.is_level_unlocked(99), "an out-of-range level is never unlocked")

    var p: Dictionary = SaveData.get_level_progress(1)
    check(bool(p.get("completed", false)), "level 1 is recorded completed")
    check(int(p.get("best_stars", 0)) == 3, "its star record is kept (%s)" % str(p.get("best_stars")))

    # A worse run must not erode an existing record.
    SaveData.record_level_result(1, 1, 900.0, 5, "hard")
    var p2: Dictionary = SaveData.get_level_progress(1)
    check(int(p2.get("best_stars", 0)) == 3, "a worse run does not lower the star record (%s)" % str(p2.get("best_stars")))

    # A corrupt file must not take the game down.
    var f := FileAccess.open("user://_test_progress.json", FileAccess.WRITE)
    f.store_string("{ this is not json")
    f.close()
    SaveData.load_data()
    check(SaveData.get_difficulty() in ["easy", "normal", "hard"],
        "a corrupt save falls back to valid defaults")
    check(SaveData.is_level_unlocked(1), "and level 1 is still playable")

    # It must refuse to write outside user://.
    var before_path: String = SaveData.storage_path()
    SaveData.set_storage_path("res://nope.json")
    check(SaveData.storage_path() == before_path, "a non-user:// storage path is refused")

    SaveData.erase_storage()

## End to end: does actually WINNING a level record it? The save layer had unit coverage
## but nothing checked that the game controller ever calls it on the win path, which is
## exactly the kind of gap that leaves data written by nobody.
func _sim_progress_integration() -> void:
    print("\n-- progress recorded from real play --")
    SaveData.set_storage_path("user://_test_integration.json")
    SaveData.erase_storage()

    check(not SaveData.is_level_unlocked(2), "level 2 starts locked")

    var g = _new_game(1)
    var done := {"hit": false, "won": false, "stars": 0}
    g.level_finished.connect(func(won, stars):
        done["hit"] = true
        done["won"] = won
        done["stars"] = stars)

    # Overwhelming defence so the outcome is decided by the level logic, not by dice.
    g.gold = 999999
    for t in ["archer", "spiketrap", "ballista", "mage", "spearman", "knight", "catapult"]:
        if t not in g.unlocked:
            g.unlocked.append(t)
    for lane_i in range(3):
        var lane: Array = g.lanes[lane_i]
        for step in [14, 22, 30, 38, 46]:
            var t: Vector2i = lane[step]
            g.place("ballista", t.x, t.y - 2)
            g.place("ballista", t.x, t.y + 2)

    for w in range(3):
        g.start_wave()
        for i in range(int(300.0 / STEP)):
            g.tick(STEP)
            if not g._wave_active:
                break
        if done["hit"]:
            break
    check(done["hit"] and done["won"], "level 1 was won")

    var prog: Dictionary = SaveData.get_level_progress(1)
    check(bool(prog.get("completed", false)), "the win is recorded as completed")
    check(int(prog.get("best_stars", 0)) == done["stars"],
        "the star rating is stored (%s, run earned %d)" % [str(prog.get("best_stars")), done["stars"]])
    check(int(prog.get("best_kills", 0)) > 0, "the kill record is stored (%s)" % str(prog.get("best_kills")))
    check(SaveData.is_level_unlocked(2), "winning level 1 unlocks level 2")

    # And it must survive a reload, not just live in memory.
    SaveData.load_data()
    check(SaveData.is_level_unlocked(2), "the unlock survives a reload")
    _drop(g)

    # A LOSS must also be recorded — the controller calls record_level_attempt on defeat.
    SaveData.erase_storage()
    var g2 = _new_game(1)
    var lost := {"hit": false}
    g2.level_finished.connect(func(_w, _s): lost["hit"] = true)
    for w in range(6):
        g2.start_wave()
        for i in range(int(300.0 / STEP)):
            g2.tick(STEP)
            if lost["hit"] or not g2._wave_active:
                break
        if lost["hit"]:
            break
    check(lost["hit"], "an undefended run reaches defeat")
    check(not SaveData.is_level_unlocked(2), "losing does not unlock the next realm")
    _drop(g2)

    SaveData.erase_storage()

## The menu must actually READ what the save layer writes. It previously listed every
## realm as playable and assigned game.difficulty directly, bypassing the setter that
## persists it — the data was written by the controller and read by nobody.
func _sim_menu_reads_progress() -> void:
    print("\n-- the menu reflects saved progress --")
    SaveData.set_storage_path("user://_test_menu.json")
    SaveData.erase_storage()

    var src := FileAccess.get_file_as_string("res://scenes/ui.gd")
    check(src.contains("SaveData.is_level_unlocked"), "level select consults the unlock state")
    check(src.contains("SaveData.get_level_progress"), "level select reads stored records")
    check(src.contains("game.set_difficulty("), "difficulty goes through the persisting setter")
    check(not src.contains("game.difficulty = key"), "and no longer assigns the field directly")

    # Choosing a difficulty through the controller must survive a reload.
    var g = _new_game(1)
    check(g.set_difficulty("hard"), "the controller accepts a difficulty change")
    SaveData.load_data()
    check(SaveData.get_difficulty() == "hard", "the choice is on disk after a reload")
    check(not g.set_difficulty("nightmare"), "an invalid difficulty is refused")
    _drop(g)
    SaveData.erase_storage()

## Scenery now claims tiles, so a hard-coded coordinate is no longer guaranteed legal.
## Spiral out from the intended spot and return where it actually landed, or (-1,-1).
func _place_near(g, tool: String, col: int, row: int, max_r := 6) -> Vector2i:
    for r in range(0, max_r):
        for dc in range(-r, r + 1):
            for dr in range(-r, r + 1):
                if g.place(tool, col + dc, row + dr):
                    return Vector2i(col + dc, row + dr)
    return Vector2i(-1, -1)

func _sim_endless_and_merchant() -> void:
    print("\n-- endless mode and the merchant --")
    var g = _new_game(int(Cfg.ENDLESS_LEVEL["id"]))
    check(Cfg.is_endless(g.level_def), "endless is flagged as endless")
    check(g.wave == 15, "endless picks up at wave 16 (starts on 15)")
    check(g.gold == 600, "endless starts with 600 gold")

    # A campaign level ends; endless never does.
    g.wave = 20
    g._wave_active = true
    g._queue = [] as Array[String]
    var finished: Array = []
    g.level_finished.connect(func(_w, _s): finished.append(true))
    g._check_wave_end()
    check(finished.is_empty(), "endless never finishes a level")

    # Milestones: every 10th wave raises the ceiling, every 5th pays out.
    # The wave-20 check above already granted one, so measure the DELTA rather than
    # assuming this is the first.
    var slots_before: int = g.endless_bonus_slots
    var before_cap: int = g.max_defenders()
    g.wave = 30
    g._wave_active = true
    g._queue = [] as Array[String]
    var gold_before: int = g.gold
    g._check_wave_end()
    check(g.endless_bonus_slots == slots_before + 1, "wave 30 grants a milestone slot")
    check(g.max_defenders() == before_cap + 1, "the slot actually raises the cap (%d -> %d)" % [before_cap, g.max_defenders()])
    check(g.gold > gold_before, "and pays a milestone bonus")
    _drop(g)

    # Merchant offers three of the six, and each one has an effect.
    g = _new_game(1)
    var offered: Array = []
    g.merchant_offered.connect(func(o): offered.append_array(o))
    g.wave = 3
    g._maybe_offer_merchant()
    check(offered.size() == 3, "the merchant offers three cards (%d)" % offered.size())
    var ids := {}
    for o in offered:
        ids[o["id"]] = true
    check(ids.size() == 3, "and they are three DIFFERENT cards")
    offered.clear()
    g.wave = 5
    g._maybe_offer_merchant()
    check(offered.is_empty(), "no merchant on a siege wave")
    g.wave = 4
    g._maybe_offer_merchant()
    check(offered.is_empty(), "no merchant on a non-third wave")

    var g0: int = g.gold
    g.take_merchant_offer("gold")
    check(g.gold == g0 + 150, "Gold Rush pays 150")
    g.castle_hp = 100
    g.take_merchant_offer("repair")
    check(g.castle_hp == 160, "Fortress Repair restores 60 HP")
    g.take_merchant_offer("haste")
    check(g.haste_waves == 3, "Battle Haste lasts three waves")
    g.take_merchant_offer("hoard")
    check(g.double_bonus_wave, "Dragon Hoard arms the doubled bounty")
    # ...and the doubled bounty is actually paid, once.
    g.wave = 4
    g._wave_active = true
    g._queue = [] as Array[String]
    var gb: int = g.gold
    g._check_wave_end()
    check(g.gold - gb >= (20 + 4 * 10) * 2, "the next wave pays double (%d)" % (g.gold - gb))
    check(not g.double_bonus_wave, "and the doubling is spent")
    _drop(g)

func _sim_achievements() -> void:
    print("\n-- achievements --")
    var res: Array = Achievements.self_test()
    check(res[1] == 0, "the achievement module self-test passes (%d/%d)" % [res[0], res[0] + res[1]])

    var g = _new_game(1)
    var fired: Array = []
    g.achievements_unlocked.connect(func(ids): fired.append_array(ids))
    g._wave_active = true
    g._queue = [] as Array[String]
    var e = g._spawn("grunt")
    g.damage_enemy(e, 999.0)
    check("firstBlood" in fired, "the first kill earns First Blood")

    # Walls accumulate toward Master Mason, and the counter survives a save round-trip.
    g.gold = 999999
    g.unlocked.append("wall")
    var walls := 0
    for c in range(2, 60):
        for r in [3, 6]:
            if g.place("wall", c, r):
                walls += 1
            if walls >= 50:
                break
        if walls >= 50:
            break
    check(g.achievements.stat("wallsBuilt") >= 50, "50 walls counted (%d)" % g.achievements.stat("wallsBuilt"))
    check(g.achievements.is_unlocked("wallEnjoyer"), "Master Mason unlocked")
    var round_trip = Achievements.new(g.achievements.to_dict())
    check(round_trip.is_unlocked("wallEnjoyer"), "achievements survive a save round-trip")
    check(round_trip.stat("wallsBuilt") == g.achievements.stat("wallsBuilt"), "and so do the counters")
    _drop(g)

func _sim_camera_and_rally() -> void:
    print("\n-- zoom, pan and rally --")
    var g = _new_game(1)

    check(absf(g.zoom - 1.0) < 0.001, "a level starts framed at 100%")
    var fit_pos: Vector3 = g._camera.position
    g.zoom_in()
    check(g.zoom > 1.0, "zooming in raises the zoom (%.2f)" % g.zoom)
    check(g._camera.position.distance_to(Vector3(Cfg.GRID_W * 0.5, 0, Cfg.GRID_H * 0.5))
        < fit_pos.distance_to(Vector3(Cfg.GRID_W * 0.5, 0, Cfg.GRID_H * 0.5)),
        "and actually moves the camera closer")
    for i in range(40):
        g.zoom_in()
    check(g.zoom <= g.ZOOM_MAX + 0.001, "zoom is capped at %.1fx (got %.2f)" % [g.ZOOM_MAX, g.zoom])
    for i in range(60):
        g.zoom_out()
    check(absf(g.zoom - g.ZOOM_MIN) < 0.001, "zoom bottoms out at the framed view")
    check(g._camera.position.distance_to(fit_pos) < 0.01, "and returns to exactly the framed position")

    # Panning must never let the view leave the board.
    g.set_zoom(3.0)
    g.pan_by(Vector2(9999, 9999))
    var t1: Vector2 = Vector2(g._camera.position.x, g._camera.position.z)
    g.pan_by(Vector2(9999, 9999))
    var t2: Vector2 = Vector2(g._camera.position.x, g._camera.position.z)
    check(t1.distance_to(t2) < 0.01, "panning clamps at the board edge")
    var half_w: float = Cfg.GRID_W * 0.5 * (1.0 - 1.0 / 3.0)
    check(absf(g._pan.x) <= half_w + 0.01, "the clamp scales with zoom (%.1f <= %.1f)" % [g._pan.x, half_w])

    # Zooming back out has to release the pan, or the board sits off-centre at 100%.
    g.set_zoom(1.0)
    check(g._pan.length() < 0.01, "zooming back out re-centres the board")

    # A new level starts framed again, whatever the last one was left at.
    g.set_zoom(4.0)
    g.pan_by(Vector2(10, 10))
    g.start_level(2)
    check(absf(g.zoom - 1.0) < 0.001 and g._pan.length() < 0.01, "a new level resets the view")
    _drop(g)

    # Rally: the order has to actually move the unit.
    for kind in ["swordsman", "knight", "spearman", "archer"]:
        g = _new_game(1)
        g.gold = 999999
        g.unlocked.append(kind)
        check(g.place(kind, 12, 14), "%s placed" % kind)
        var d = g.defender_at(12, 14)
        var home: Vector3 = d.position
        g.set_rally(d, Vector2i(20, 22))
        check(d.rally == Vector2(20, 22), "%s takes the rally point" % kind)
        for i in range(int(30.0 / STEP)):
            g.tick(STEP)
            if d.position.distance_to(Vector3(20, 0, 22)) < 0.4:
                break
        check(d.position.distance_to(Vector3(20, 0, 22)) < 0.6,
            "%s marches to its rally point (ended %.1f tiles away)" % [kind, d.position.distance_to(Vector3(20, 0, 22))])
        # ...and clearing it marches them home again.
        g.clear_rally(d)
        for i in range(int(30.0 / STEP)):
            g.tick(STEP)
            if d.position.distance_to(home) < 0.4:
                break
        check(d.position.distance_to(home) < 0.6, "%s marches back when the rally is cleared" % kind)
        _drop(g)

    # An archer holds its post: it must NOT abandon its tile to chase.
    g = _new_game(1)
    g.gold = 999999
    g.unlocked.append("archer")
    var lane: Array = g.lanes[0]
    g.place("archer", lane[20].x, lane[20].y - 4)
    var arc = g.defender_at(lane[20].x, lane[20].y - 4)
    var post: Vector3 = arc.position
    g.start_wave()
    var strayed := 0.0
    for i in range(int(40.0 / STEP)):
        g.tick(STEP)
        if not arc.alive:
            break
        strayed = maxf(strayed, arc.position.distance_to(post))
    check(strayed < 0.5, "an un-rallied archer holds its post (strayed %.2f)" % strayed)
    _drop(g)

## Trackpad panning. The gesture has to track the fingers at every zoom, which a fixed
## pixels-to-tiles constant cannot do.
func _sim_trackpad_pan() -> void:
    print("\n-- trackpad two-finger pan --")
    var g = _new_game(1)

    # At 100% there is nowhere to pan; the gesture must be inert, not jittery.
    var before: Vector2 = g._pan
    g.pan_by(g._screen_delta_to_tiles(Vector2(120, 0)))
    check(g._pan == before, "a pan gesture does nothing while the board is fully framed")

    # Zoomed in, the same swipe must move the board — and by the same amount of BOARD
    # whatever the zoom, which is the whole point of projecting rather than scaling.
    g.set_zoom(2.0)
    var d2: Vector2 = g._screen_delta_to_tiles(Vector2(120, 0))
    g.set_zoom(4.0)
    var d4: Vector2 = g._screen_delta_to_tiles(Vector2(120, 0))
    check(d2.length() > 0.01, "a swipe maps to real board distance at 200%% (%.2f tiles)" % d2.length())
    check(d4.length() < d2.length(), "and covers less board the further you zoom in (%.2f < %.2f)" % [d4.length(), d2.length()])

    # The same swipe should shift the view by the same number of PIXELS at any zoom.
    # d * zoom is that invariant: half the board distance at twice the magnification.
    check(absf(d2.length() * 2.0 - d4.length() * 4.0) < 0.35,
        "so the board tracks the fingers on screen (%.2f vs %.2f)" % [d2.length() * 2.0, d4.length() * 4.0])

    g.set_zoom(3.0)
    var p0: Vector2 = g._pan
    g.pan_by(g._screen_delta_to_tiles(Vector2(150, 90)))
    check(g._pan != p0, "the gesture actually moves the view when zoomed in")
    _drop(g)

## Left-drag pans, but a left CLICK must still place. Getting the threshold wrong in
## either direction is punishing: too small and every placement is eaten by a twitch,
## too large and the board feels stuck.
func _sim_left_drag() -> void:
    print("\n-- left-drag to pan --")
    var g = _new_game(1)
    g.gold = 999999

    # Synthesise the real event sequence rather than calling the handlers directly, so
    # the click-vs-drag decision itself is what is under test.
    var press := InputEventMouseButton.new()
    press.button_index = MOUSE_BUTTON_LEFT
    press.pressed = true
    var release := InputEventMouseButton.new()
    release.button_index = MOUSE_BUTTON_LEFT
    release.pressed = false
    var motion := InputEventMouseMotion.new()

    # A clean click places.
    var centre := Vector2(800, 450)
    var tile: Vector2i = g.tile_at_screen(centre)
    press.position = centre
    release.position = centre
    g._unhandled_input(press)
    g._unhandled_input(release)
    check(g.defender_at(tile.x, tile.y) != null, "a clean left click still places a unit")

    # A click that wobbles a pixel or two must still place. The unit lands on the tile
    # under the RELEASE point, not the press point — the ghost tracks the cursor, so a
    # wobble across a tile boundary placing on the new tile is correct.
    var spot := Vector2(700, 400)
    var wobble: Vector2 = spot + Vector2(3, 2)
    var tile2: Vector2i = g.tile_at_screen(wobble)
    press.position = spot
    g._unhandled_input(press)
    motion.position = wobble
    g._unhandled_input(motion)
    check(not g._lmb_dragged, "a 3px wobble is not treated as a drag")
    release.position = wobble
    g._unhandled_input(release)
    check(g.defender_at(tile2.x, tile2.y) != null, "and the click still places")

    # Zoomed in, a real drag pans and places nothing.
    g.set_zoom(3.0)
    var pan_before: Vector2 = g._pan
    var start := Vector2(900, 500)
    var drag_tile: Vector2i = g.tile_at_screen(start)
    press.position = start
    g._unhandled_input(press)
    for i in range(1, 7):
        motion.position = start + Vector2(-30.0 * i, -18.0 * i)
        g._unhandled_input(motion)
    release.position = start + Vector2(-180, -108)
    g._unhandled_input(release)
    check(g._pan != pan_before, "dragging with the left button pans the board")
    check(g.defender_at(drag_tile.x, drag_tile.y) == null, "and places nothing")

    # Back at 100% a drag must NOT eat the placement — there is nowhere to pan, so the
    # gesture stays a click.
    g.reset_view()
    var flat := Vector2(600, 500)
    press.position = flat
    g._unhandled_input(press)
    for i in range(1, 6):
        motion.position = flat + Vector2(40.0 * i, 0)
        g._unhandled_input(motion)
    var end_pos: Vector2 = flat + Vector2(200, 0)
    var end_tile: Vector2i = g.tile_at_screen(end_pos)
    release.position = end_pos
    g._unhandled_input(release)
    check(g.defender_at(end_tile.x, end_tile.y) != null,
        "at 100% a drag still places, because there is nothing to pan")
    _drop(g)

func check(cond: bool, label: String) -> void:
    if cond:
        _pass += 1
        print("  PASS  ", label)
    else:
        _fail += 1
        print("  FAIL  ", label)

## Build a game instance with rendering side effects disabled.
func _new_game(level_id: int = 1) -> Node:
    var g = load("res://scenes/main.gd").new()
    g.visual_fx = false
    # Pin the run. Lane assignment and the merchant draw are random, and with the global
    # generator one marginal check failed about one run in ten while passing every time
    # in isolation — the worst kind of failure, because it looks like a real regression.
    g.run_seed = 20260907
    add_child(g)
    g.start_level(level_id)
    return g

func _run(g: Node, seconds: float) -> void:
    var steps := int(seconds / STEP)
    for i in steps:
        g.tick(STEP)

func _drop(g: Node) -> void:
    g.queue_free()

# ─────────────────────────────────────────────────────────────────────────────

func _sim_wave_clears() -> void:
    print("\n-- a wave with no defences leaks, and the wave still ends --")
    var g = _new_game(1)
    g.start_wave()
    check(g._wave_active, "wave starts active")
    _run(g, 180.0)
    check(not g._wave_active, "wave ends within 180s even with zero defenders")
    check(g.castle_hp < Cfg.CASTLE_MAX_HP, "undefended castle takes damage")
    check(g.enemies.is_empty(), "no enemies left on the field")
    _drop(g)

func _sim_walls_block_and_break() -> void:
    print("\n-- a wall stops the column, gets chewed through, then the road reopens --")
    var g = _new_game(1)
    var lane: Array = g.lanes[0]
    var tile: Vector2i = lane[12]
    g.gold = 9999
    var ok: bool = g.place("wall", tile.x, tile.y)
    check(ok, "a wall may be placed on a road tile")
    var wall = g.defender_at(tile.x, tile.y)
    check(wall != null and wall.type_name == "wall", "wall is registered on its tile")
    check(g.wall_at(tile.x, tile.y) == wall, "wall_at() finds it")

    # Spawn grunts directly rather than starting a real wave. Wave 1 contains skeletons,
    # which PHASE THROUGH walls by design, and the queue is cluster-shuffled — so a
    # wave-driven version of this test passes or fails on the dice.
    g._wave_active = true
    g._queue = [] as Array[String]
    for i in range(6):
        g._lane_rr = 0            # force every one onto the lane the wall sits on
        g._spawn("grunt")

    # Sample continuously rather than at one instant: six grunts do ~36 dmg/s between
    # them, so a 40 HP wall is gone about a second after they arrive — a single snapshot
    # lands either side of that window depending on separation jitter.
    var peak_blocked := 0
    for i in range(int(12.0 / STEP)):
        g.tick(STEP)
        var n := 0
        for e in g.enemies:
            if e.alive and e.state == Enemy.State.WALL:
                n += 1
        peak_blocked = maxi(peak_blocked, n)
    check(peak_blocked > 0, "grunts stack up against the wall (peak %d blocked)" % peak_blocked)
    check(wall.hp < wall.max_hp, "the wall took damage (%d/%d)" % [int(wall.hp), int(wall.max_hp)])

    _run(g, 40.0)
    check(not wall.alive, "the wall is eventually destroyed")
    _run(g, 60.0)
    var still_blocked := 0
    for e in g.enemies:
        if e.alive and e.state == Enemy.State.WALL:
            still_blocked += 1
    check(still_blocked == 0, "nothing is still stuck on the dead wall")
    _drop(g)

## The wedge bug this guards against: an enemy that latches onto something it can never
## kill sits at "N killed, M remaining" forever and the wave never ends.
func _sim_all_enemy_types_reach_or_die() -> void:
    print("\n-- every enemy type either reaches the castle or dies; none wedge --")
    for type in Cfg.ORC_TYPES:
        var g = _new_game(1)
        g.gold = 9999
        # A spike trap is the classic wedge: hp 9999, cannot be killed, sits on the road.
        var lane: Array = g.lanes[0]
        g.place("spiketrap", lane[10].x, lane[10].y)
        g._wave_active = true
        g._queue = [] as Array[String]
        var e = g._spawn(type)
        check(e != null, "%s spawns" % type)
        var settled := false
        for i in range(int(200.0 / STEP)):
            g.tick(STEP)
            if not e.alive or e.state == Enemy.State.CASTLE:
                settled = true
                break
        check(settled, "%s reaches the castle or dies (never wedges)" % type)
        _drop(g)

func _sim_defender_kills_and_upgrades() -> void:
    print("\n-- a tower acquires, fires, kills, and can be upgraded --")
    var g = _new_game(1)
    g.gold = 9999
    var lane: Array = g.lanes[0]
    # Place beside the road, a few tiles in, where the column will walk past it.
    var t: Vector2i = lane[20]
    var ok: bool = g.place("tower", t.x, t.y - 2)
    check(ok, "a tower may be placed on grass")
    var tower = g.defender_at(t.x, t.y - 2)
    g.start_wave()
    _run(g, 30.0)
    check(tower.kills > 0, "the tower scored kills (%d)" % tower.kills)
    check(g.kills > 0, "the run kill counter moved (%d)" % g.kills)

    tower.kills = 30
    g.gold = 9999
    var before_range: float = tower.range_r
    var err: String = tower.try_upgrade()
    check(err == "", "upgrade is accepted when kills and gold suffice (got %s)" % ("''" if err == "" else err))
    check(tower.level == 2, "tower is level 2")
    check(tower.range_r > before_range, "upgrade actually raised range (%.2f -> %.2f)" % [before_range, tower.range_r])
    _drop(g)

func _sim_economy_and_placement_rules() -> void:
    print("\n-- placement rules and the economy hold --")
    var g = _new_game(1)
    var lane: Array = g.lanes[0]
    var road: Vector2i = lane[8]

    g.gold = 0
    check(g.placement_error("tower", 5, 5) != "", "cannot build with no gold")
    g.gold = 9999
    g.unlocked.append("spiketrap")   # unlocks at wave 2; this test runs before wave 1
    check(g.placement_error("tower", road.x, road.y) != "", "a tower cannot go on the road")
    check(g.placement_error("wall", road.x, road.y) == "", "a wall can go on the road")
    # The JS gates walls and spike traps identically: grass OR road. Restricting traps to
    # the road removed the grass-side ambush placements the original allows.
    check(g.placement_error("spiketrap", 5, 5) == "", "a spike trap can go on grass")
    check(g.placement_error("spiketrap", road.x, road.y) == "", "a spike trap can go on the road")
    check(g.placement_error("knight", 5, 5) != "", "a locked unit is refused")
    # The keep is a 6x9 block, not nine whole columns — the port used to delete a strip
    # of buildable ground the original gives the player.
    check(g.placement_error("tower", 68, 27) != "", "cannot build inside the keep")
    check(g.placement_error("tower", 64, 10) == "", "the column west of the keep is buildable")
    check(g.placement_error("tower", 68, 5) == "", "ground north of the keep is buildable")
    # Trees occupy their tile.
    var blocked_by_tree := false
    for cell in g._scenery:
        if g.placement_error("tower", cell.x, cell.y) != "":
            blocked_by_tree = true
            break
    check(g._scenery.size() > 0, "scenery was placed (%d tiles)" % g._scenery.size())
    check(blocked_by_tree, "a tree makes its tile unbuildable")

    var before: int = g.gold
    g.place("tower", 5, 5)
    check(g.gold == before - int(Cfg.COSTS["tower"]), "placing charges exactly the listed cost")
    check(g.placement_error("tower", 5, 5) != "", "the tile is now occupied")

    var d = g.defender_at(5, 5)
    var refund: int = d.sell_value()
    var g2: int = g.gold
    g.sell(d)
    check(g.gold == g2 + refund, "selling refunds the quoted amount")
    check(g.defender_at(5, 5) == null, "the tile frees up after selling")

    # Selling a wall an enemy is hammering has to release it, or the column stays
    # wedged on a structure that is no longer there.
    var lane2: Array = g.lanes[0]
    g.gold = 9999
    g.place("wall", lane2[10].x, lane2[10].y)
    var doomed = g.defender_at(lane2[10].x, lane2[10].y)
    g._wave_active = true
    g._queue = [] as Array[String]
    g._lane_counts = [0, 99, 99] as Array[int]
    var stuck = g._spawn("grunt")
    for i in range(int(30.0 / STEP)):
        g.tick(STEP)
        if stuck.state == Enemy.State.WALL:
            break
    check(stuck.state == Enemy.State.WALL, "an enemy is blocked on the wall")
    g.sell(doomed)
    g.tick(STEP)
    check(stuck.state != Enemy.State.WALL, "selling the wall releases it")

    # Unit slots, not gold, are the real constraint in a long run.
    g.gold = 999999
    var placed := 0
    for c in range(2, 40):
        if g.place("tower", c, 5):
            placed += 1
    check(g.used_slots() <= g.max_defenders(), "the unit cap is never exceeded (%d/%d)" % [g.used_slots(), g.max_defenders()])
    _drop(g)

func _sim_all_levels_build() -> void:
    print("\n-- every campaign level builds and runs --")
    for lvl in Cfg.LEVELS:
        var g = _new_game(int(lvl["id"]))
        check(g.lanes.size() == 3, "%s has three lanes" % lvl["name"])
        check(g.wave == int(lvl["startWave"]) - 1, "%s starts before wave %d" % [lvl["name"], lvl["startWave"]])
        check(g.gold == int(lvl["startGold"]), "%s starts with %d gold" % [lvl["name"], lvl["startGold"]])
        g.start_wave()
        _run(g, 12.0)
        check(g.enemies.size() > 0, "%s spawns enemies" % lvl["name"])
        var on_road := true
        for e in g.enemies:
            if e.state == Enemy.State.WALK and not g._road.has(Vector2i(roundi(e.position.x), roundi(e.position.z))):
                on_road = false
                break
        check(on_road, "%s: walking enemies stay on the road" % lvl["name"])
        _drop(g)

## The bugs the round-2 audit found. Both breaks-play cases came from one mistake —
## treating "who gets kill credit" and "who the enemy reacts to" as the same thing — so
## each direction of that gate gets its own assertion.
func _sim_targeting_gate() -> void:
    print("\n-- who an enemy reacts to --")

    # A spike trap must never become a melee target. It has 9999 HP and ignores damage,
    # so an enemy that latches onto one stands there forever and the wave never ends.
    var g = _new_game(1)
    g.gold = 9999
    g.unlocked.append("spiketrap")
    var lane: Array = g.lanes[0]
    check(g.place("spiketrap", lane[10].x, lane[10].y), "trap placed on the road")
    g._wave_active = true
    g._queue = [] as Array[String]
    g._lane_counts = [0, 99, 99] as Array[int]
    var e = g._spawn("grunt")
    var settled := false
    for i in range(int(120.0 / STEP)):
        g.tick(STEP)
        if not e.alive or e.state == Enemy.State.CASTLE:
            settled = true
            break
    check(settled, "an enemy walks over a spike trap instead of wedging on it")
    _drop(g)

    # A shot must not drag its target off the lane. Only the tower/catapult aggro sweep
    # may do that, and it is line-of-sight gated; being hit is not aggro.
    g = _new_game(1)
    g.gold = 9999
    g.unlocked.append("ballista")
    lane = g.lanes[0]
    # Far enough off the road that neither the melee radius nor the 6.5 sweep reaches it.
    var far_row: int = lane[20].y - 9
    var at: Vector2i = _place_near(g, "ballista", lane[20].x, far_row, 3)
    check(at.x >= 0, "ballista placed well off the road")
    var bal = g.defender_at(at.x, at.y)
    g._wave_active = true
    g._queue = [] as Array[String]
    g._lane_counts = [0, 99, 99] as Array[int]
    var walker = g._spawn("grunt")
    var got_shot := false
    var pulled := false
    for i in range(int(30.0 / STEP)):
        g.tick(STEP)
        if not walker.alive:
            break
        if walker.hp < walker.max_hp:
            got_shot = true
        if got_shot and (walker.state == Enemy.State.FIGHT or walker.state == Enemy.State.CHASE) \
        and walker.fighting == bal or walker.chasing == bal:
            pulled = true
            break
    check(got_shot, "the ballista actually hit it")
    check(not pulled, "being shot does NOT pull an enemy off the road")
    _drop(g)

    # ...but a melee soldier's strike must.
    g = _new_game(1)
    g.gold = 9999
    g.place("swordsman", 10, 14)
    var sword = g.defender_at(10, 14)
    g._wave_active = true
    g._queue = [] as Array[String]
    var target = g._spawn("brute")
    g.damage_enemy(target, 1.0, sword, sword)
    check(target.state == Enemy.State.FIGHT and target.fighting == sword,
        "a melee soldier's strike DOES pull an enemy into the fight")
    _drop(g)

    # An enemy projectile whose shooter dies mid-flight must still land its hit rather
    # than dereferencing a freed node.
    g = _new_game(1)
    g.gold = 9999
    var g3at: Vector2i = _place_near(g, "tower", 12, 14)
    var tgt = g.defender_at(g3at.x, g3at.y)
    g._wave_active = true
    g._queue = [] as Array[String]
    var shooter = g._spawn("enemyArcher")
    shooter.position = Vector3(12, 0, 18)
    g.fire_enemy_shot(shooter, tgt, 3.0, "enemyArcher")
    check(g.projectiles.size() == 1, "an enemy arrow is in flight")
    shooter.escaped = true
    shooter.alive = false
    g._reap()                      # frees the shooter while its arrow is still flying
    var before: float = tgt.hp
    for i in range(int(4.0 / STEP)):
        g.tick(STEP)
        if g.projectiles.is_empty():
            break
    check(tgt.hp < before, "the arrow still lands after its shooter is freed")
    _drop(g)

## Behaviours the audit found missing outright.
func _sim_recovered_ai() -> void:
    print("\n-- recovered enemy AI --")

    # The wide sweep: any defender is hunted, not just towers and catapults.
    var g = _new_game(1)
    g.gold = 9999
    g.unlocked.append("archer")
    var lane: Array = g.lanes[0]
    var row: int = lane[20].y - 5          # inside 6.5, outside the melee radius
    check(g.place("archer", lane[20].x, row), "archer placed 5 tiles off the road")
    var arc = g.defender_at(lane[20].x, row)
    g._wave_active = true
    g._queue = [] as Array[String]
    g._lane_counts = [0, 99, 99] as Array[int]
    var hunter = g._spawn("brute")
    var hunted := false
    for i in range(int(40.0 / STEP)):
        g.tick(STEP)
        if not hunter.alive:
            break
        if hunter.chasing == arc or hunter.fighting == arc:
            hunted = true
            break
    check(hunted, "an off-road archer is hunted, not walked past")
    _drop(g)

    # Berserk: a grunt cut to half health speeds up permanently.
    g = _new_game(1)
    g._wave_active = true
    g._queue = [] as Array[String]
    var grunt = g._spawn("grunt")
    var base_speed: float = grunt.speed
    check(not grunt.berserk, "a healthy grunt is not berserk")
    g.damage_enemy(grunt, grunt.max_hp * 0.6)
    check(grunt.berserk, "a grunt enrages below half health")
    check(absf(grunt.speed - base_speed * 1.5) < 0.001,
        "and moves 50%% faster (%.2f -> %.2f)" % [base_speed, grunt.speed])
    _drop(g)

    # Regeneration is walk-only: a troll chewing a wall must not heal through it.
    g = _new_game(1)
    g.gold = 9999
    lane = g.lanes[0]
    g.place("wall", lane[6].x, lane[6].y)
    g._wave_active = true
    g._queue = [] as Array[String]
    g._lane_counts = [0, 99, 99] as Array[int]
    var troll = g._spawn("troll")
    troll.hp = 10.0
    var reached_wall := false
    for i in range(int(30.0 / STEP)):
        g.tick(STEP)
        if troll.state == Enemy.State.WALL:
            reached_wall = true
            break
    check(reached_wall, "the troll reaches the wall")
    # Make the wall outlast the measurement — otherwise it dies mid-window, the troll
    # returns to WALK, and it regenerates perfectly legitimately.
    var blocking = troll.blocked_by
    blocking.max_hp = 100000.0
    blocking.hp = 100000.0
    var hp_at_wall: float = troll.hp
    _run(g, 8.0)
    check(troll.state == Enemy.State.WALL, "the troll is still on the wall after 8s")
    check(troll.hp <= hp_at_wall, "a troll does not regenerate while attacking a wall (%.1f -> %.1f)" % [hp_at_wall, troll.hp])
    # ...but it must resume regenerating once it is walking again.
    g.sell(blocking)
    _run(g, 6.0)
    check(troll.hp > hp_at_wall, "and resumes regenerating once the road is clear (%.1f)" % troll.hp)
    _drop(g)

    # A wall thrown across a charge calls it off.
    g = _new_game(1)
    g.gold = 9999
    lane = g.lanes[0]
    var trow: int = lane[20].y - 4
    g.place("tower", lane[20].x, trow)
    var tow = g.defender_at(lane[20].x, trow)
    g._wave_active = true
    g._queue = [] as Array[String]
    g._lane_counts = [0, 99, 99] as Array[int]
    var charger = g._spawn("brute")
    for i in range(int(40.0 / STEP)):
        g.tick(STEP)
        if charger.chasing == tow:
            break
    check(charger.chasing == tow, "the brute charges the tower")
    # Drop a wall between them.
    var mid_row: int = int((charger.position.z + tow.position.z) * 0.5)
    g.place("wall", int(round(charger.position.x)), mid_row)
    var gave_up := false
    for i in range(int(6.0 / STEP)):
        g.tick(STEP)
        if charger.chasing != tow:
            gave_up = true
            break
    check(gave_up, "a wall built across the charge calls it off")
    _drop(g)
