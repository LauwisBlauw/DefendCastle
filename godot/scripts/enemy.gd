class_name Enemy
extends Node3D
## A horde unit. Direct port of the JS orc: it advances along the densified tile path
## by (path_index, progress) rather than by free movement, so it can never drift off
## the road, and it drops into one of four combat states when something gets in the way.
##
## The JS updateOrcs() is ~1,650 lines, but almost all of that is per-type limb posing
## (a wolf rears onto its front paws, a skeleton's jaw snaps, a cyclops twists its
## torso). The STATE MACHINE underneath is what the balance depends on, and that is
## what is ported exactly here; animation is driven generically off the parts each
## model hands back.

enum State { WALK, WALL, CHASE, FIGHT, CASTLE, DYING }

## Hoisted out of the functions that test against them: an inline array literal is
## rebuilt on every call, and these are consulted several times per enemy per frame.
const MELEE_AGGRESSORS := ["grunt", "skeleton", "wolf"]

# ── identity / stats ─────────────────────────────────────────────────────────
var type_name: String = "grunt"
var hp: float = 18.0
var max_hp: float = 18.0
var speed: float = 3.4
var scale_f: float = 0.77
var castle_dmg: int = 10
var reward: int = 7
var wall_dmg: float = 4.0
var def_dmg: float = 1.0
var def_rate: float = 1.5
var alive: bool = true
var escaped: bool = false        ## reached the gate and landed its hit; consumed, not killed
var is_elite: bool = false       ## 2x hp, 1.3x speed, 2x reward, 1.15x scale
var _hit_meshes: Array[MeshInstance3D] = []

# ── special abilities, read off the type table ───────────────────────────────
var regens: bool = false
var heals_nearby: bool = false
var explodes_on_death: bool = false
var explode_radius: float = 0.0
var explode_dmg: float = 0.0
var shoot_range: float = 0.0
var shoot_rate: float = 0.0
var shoot_dmg: float = 0.0
var melee_range: float = 0.0
var melee_rate: float = 0.0
var melee_dmg: float = 0.0
var berserk: bool = false

# ── boss extras ──────────────────────────────────────────────────────────────
var is_level_boss: bool = false
var boss_name: String = ""
var slam_range: float = 0.0
var slam_rate: float = 0.55
var slam_dmg: float = 0.0
var _boss_body_hex: String = "2a0820"
var _boss_eye_hex: String = "ff0040"

# ── state ────────────────────────────────────────────────────────────────────
var state: State = State.WALK
var path: Array[Vector2i] = []
var path_index: int = 0
var progress: float = 0.0
var lane_id: int = 0

var blocked_by: Defender = null          ## the wall standing on our next tile
var fighting: Defender = null            ## a unit we are in melee with
var chasing: Defender = null             ## a tower we have aggroed onto
var attack_slot: int = -1
var wall_slot: int = -1
var castle_slot: int = -1
var _wall_target := Vector2.ZERO
var _castle_target_z: float = 0.0

var _attack_timer: float = 0.0
var _shoot_cd: float = 0.0
var _melee_cd: float = 0.0
var _slam_cd: float = 0.0
var _regen_timer: float = 0.0
var _heal_timer: float = 0.0
var _phase_timer: float = 0.0            ## skeletons squeeze through walls at 35% speed
var _slow_timer: float = 0.0             ## mage orbs and spike traps slow on hit
var _slow_amount: float = 1.0
var _anim_time: float = 0.0
var _swing: float = 0.0
var _swing_hit: bool = false
var _death_timer: float = 0.0
var _death_dir: float = 1.0
var _flash: float = 0.0

var _game: Node = null
var _parts: Dictionary = {}
var _leg_base: float = 0.19
var _hp_bar: Node3D = null
var _hp_fill: MeshInstance3D = null

signal reached_castle(e: Enemy)
signal died(e: Enemy)

## Per-type HP-bar backing tints, verbatim from the JS _HP_BAR_TINT table.
const HP_BAR_TINT := {
    "skeleton": Color("554422"), "wolf": Color("443355"), "spider": Color("330022"),
    "troll": Color("224411"), "boss": Color("330044"), "orcMage": Color("440011"),
    "rockTroll": Color("333322"), "cyclops": Color("442200"), "exploder": Color("441100"),
    "healerOrc": Color("113322"), "brute": Color("442200"), "grunt": Color("223311"),
    "enemyArcher": Color("223344"),
}
const HP_BAR_ELITE_TINT := Color("664400")

const DEATH_FALL := 0.38
const DEATH_TOTAL := 0.72

func setup(t: String, lane: Array[Vector2i], game: Node, hp_scale: float = 1.0,
           speed_scale: float = 1.0, boss_def: Dictionary = {}, elite: bool = false) -> void:
    type_name = t
    path = lane
    _game = game
    is_elite = elite
    var s: Dictionary = Cfg.ORC_TYPES.get(t, Cfg.ORC_TYPES["grunt"])
    # An elite is the same unit at double health, 30% faster, worth double and 15% larger.
    # HP and reward are ROUNDED, not truncated — the JS rounds at the spawn site, and on
    # Easy (x0.85) truncation quietly shaves a point off nearly every enemy.
    max_hp = roundf(float(s["hp"]) * (2.0 if elite else 1.0) * hp_scale)
    speed = float(s["speed"]) * (1.3 if elite else 1.0) * speed_scale
    scale_f = float(s["scale"]) * (1.15 if elite else 1.0)
    castle_dmg = int(s["castleDmg"])
    reward = int(s["reward"]) * (2 if elite else 1)
    wall_dmg = float(s.get("wallDmg", 1))
    def_dmg = float(s.get("defDmg", 1))
    def_rate = float(s.get("defRate", 0.8))
    regens = s.get("regens", false)
    heals_nearby = s.get("healsNearby", false)
    explodes_on_death = s.get("explodesOnDeath", false)
    explode_radius = float(s.get("explodeRadius", 0.0))
    explode_dmg = float(s.get("explodeDmg", 0.0))
    shoot_range = float(s.get("shootRange", 0.0))
    shoot_rate = float(s.get("shootRate", 0.0))
    shoot_dmg = float(s.get("shootDmg", 0.0))
    melee_range = float(s.get("meleeRange", 0.0))
    melee_rate = float(s.get("meleeRate", 0.0))
    melee_dmg = float(s.get("meleeDmg", 0.0))

    if not boss_def.is_empty():
        _apply_boss(boss_def, hp_scale)

    hp = max_hp
    _build_model()
    if path.size() > 0:
        position = Vector3(path[0].x, 0, path[0].y)

## A level boss is the 'boss' base type re-skinned and multiplied up. Verbatim from
## spawnLevelBoss(): scale, hp, reward and castle damage all take the level's multiplier.
func _apply_boss(b: Dictionary, hp_scale: float) -> void:
    is_level_boss = true
    boss_name = b.get("name", "Boss")
    # The level boss multiplies the BASE boss scale (0.65) rather than replacing it —
    # replacing it made every level boss more than twice its intended size.
    scale_f = float(Cfg.ORC_TYPES["boss"]["scale"]) * float(b.get("scale", 1.45))
    max_hp = float(Cfg.ORC_TYPES["boss"]["hp"]) * float(b.get("hpMult", 3.0)) * hp_scale
    reward = int(Cfg.ORC_TYPES["boss"]["reward"] * float(b.get("rewardMult", 6)))
    castle_dmg = int(Cfg.ORC_TYPES["boss"]["castleDmg"] * float(b.get("castleDmgMult", 1.5)))
    slam_range = float(b.get("slamRange", 3.0))
    slam_rate = float(b.get("slamRate", 0.55))
    slam_dmg = float(b.get("slamDmg", 6))
    _slam_cd = 1.5          # wind-up, so the boss does not slam on its very first frame
    _boss_body_hex = str(b.get("bodyColor", "2a0820"))
    _boss_eye_hex = str(b.get("eyeColor", "ff0040"))
    if b.get("explodesOnDeath", false):
        explodes_on_death = true
        explode_radius = float(b.get("explodeRadius", 4.5))
        explode_dmg = float(b.get("explodeDmg", 14))

func _build_model() -> void:
    var rig := Node3D.new()
    rig.scale = Vector3.ONE * scale_f
    add_child(rig)
    if is_level_boss:
        _parts = Models.build_boss(rig, _boss_body_hex, _boss_eye_hex)
    else:
        _parts = Models.build_enemy(type_name, rig)
        if is_elite:
            # Gold glowing eyes are the player's read that this one hits twice as hard.
            for c in rig.get_children():
                if c is MeshInstance3D and c.material_override is StandardMaterial3D \
                and (c.material_override as StandardMaterial3D).emission_enabled:
                    c.material_override = Voxel.emissive_mat(Color("ffcc33"), Color("ff9900"), 2.2)
    _leg_base = float(_parts.get("leg_base", 0.19))
    for key in ["leg_l", "leg_r", "arm_l", "arm_r", "head"]:
        if _parts.has(key) and _parts[key] is MeshInstance3D:
            _hit_meshes.append(_parts[key])
    _build_hp_bar(rig)

## Floating HP bar. Billboarded so it faces the camera whatever the enemy is doing.
func _build_hp_bar(rig: Node3D) -> void:
    _hp_bar = Node3D.new()
    _hp_bar.position = Vector3(0, 1.75 if type_name != "wolf" else 1.15, 0)
    rig.add_child(_hp_bar)
    # The bar's BACKING is tinted per enemy type, and elites override it with amber. It is
    # the only cue that reads at a glance in a crowd of forty, where the models themselves
    # are a few pixels tall.
    var tint: Color = HP_BAR_ELITE_TINT if is_elite else HP_BAR_TINT.get(type_name, Color(0.05, 0.05, 0.05))
    var bg := Voxel.box(Vector3(0.9, 0.11, 0.02), tint)
    bg.material_override = Voxel.ghost_mat(tint, 0.8)
    _hp_bar.add_child(bg)
    _hp_fill = Voxel.box(Vector3(0.86, 0.075, 0.03), Color(0.2, 0.9, 0.25))
    _hp_fill.material_override = Voxel.ghost_mat(Color(0.2, 0.9, 0.25), 0.95)
    _hp_bar.add_child(_hp_fill)
    _hp_bar.visible = false

func _refresh_hp_bar() -> void:
    if _hp_fill == null:
        return
    var pct: float = clampf(hp / max_hp, 0.0, 1.0)
    _hp_bar.visible = pct < 1.0 and alive
    _hp_fill.scale.x = maxf(pct, 0.001)
    # left-anchored: shrink toward the bar's left edge rather than its centre
    _hp_fill.position.x = -0.43 * (1.0 - pct)
    var c := Color(0.2, 0.9, 0.25) if pct > 0.5 else (Color(0.95, 0.75, 0.1) if pct > 0.25 else Color(0.9, 0.2, 0.15))
    _hp_fill.material_override = Voxel.ghost_mat(c, 0.95)

# ═══════════════════════════════════════════════════════════════════════════
#  DAMAGE
# ═══════════════════════════════════════════════════════════════════════════

## `provoker` is the unit that should draw a REACTION, which is not the same as the unit
## that gets kill credit. A projectile hit credits its shooter but is anonymous to the
## enemy — the JS calls dealDamage() with no attacker from every projectile path, and
## only a melee soldier's own strike passes itself.
##
## Getting this wrong is what let a spike trap (which can never die) become a permanent
## melee target, wedging the enemy a tile past it forever and hanging the wave; and what
## let a ballista drag the whole lane across the map to itself.
func take_damage(dmg: float, provoker: Defender = null) -> void:
    if not alive:
        return
    hp -= dmg
    _flash = 0.16
    _refresh_hp_bar()
    if hp <= 0.0:
        _die()
        return
    _maybe_berserk()
    if provoker == null or not is_instance_valid(provoker) or not provoker.alive:
        return
    # The counter-attack is NOT type-gated: an enemy hits back at whatever struck it.
    # Against a spike trap this is harmless — the trap ignores damage entirely.
    if def_dmg > 0.0:
        _game.damage_defender(provoker, def_dmg, null)
    # The turn-and-engage IS gated. Only a melee soldier can pull an enemy off the road,
    # and only if it is not already locked onto another melee unit.
    if state == State.WALL or state == State.CASTLE:
        return
    if not provoker.type_name in Defender.SOLDIER_TYPES:
        return
    if fighting != null and is_instance_valid(fighting) and fighting.type_name in Defender.SOLDIER_TYPES:
        return
    if fighting == provoker:
        return
    var slot: int = provoker.acquire_slot(self)
    if slot >= 0:
        if fighting != null and is_instance_valid(fighting):
            fighting.release_slot(self)
        attack_slot = slot
        fighting = provoker
        chasing = null
        state = State.FIGHT
        _attack_timer = 0.0
        _swing = 0.0

## A grunt cut to half health enrages once and permanently: half again as fast, and a
## point harder against both walls and units.
func _maybe_berserk() -> void:
    if berserk or type_name != "grunt" or hp > max_hp * 0.5:
        return
    berserk = true
    speed *= 1.5
    wall_dmg += 1.0
    def_dmg += 1.0
    _game.spawn_impact_ring(global_position, Color("ff4400"))
    Snd.play("berserk_roar")
    for c in _hit_meshes:
        if is_instance_valid(c):
            c.material_override = Voxel.emissive_mat(Color(Models.C_ORC_BODY), Color("ff2200"), 0.35)

func heal(amount: float) -> void:
    if not alive:
        return
    hp = minf(max_hp, hp + amount)
    _refresh_hp_bar()

## Stacking rule from the JS: the LONGEST duration and the STRONGEST slow win, so a
## spike trap cannot shorten a mage's slow by re-applying its own weaker one.
func apply_slow(duration: float, amount: float, combine: bool = true) -> void:
    if not alive:
        return
    if combine:
        _slow_timer = maxf(_slow_timer, duration)
        _slow_amount = minf(_slow_amount, amount)
    else:
        # The spike trap and the mage orb ASSIGN outright in the JS; only the spider's
        # web zone takes the max. Combining everywhere let a trap's weak 0.28 slow
        # silently extend a mage's stronger one.
        _slow_timer = duration
        _slow_amount = amount

## Called by a defender as it dies, so anything swinging at it stops and re-targets
## instead of hammering a corpse.
func on_target_lost(d: Defender) -> void:
    if fighting == d:
        fighting = null
        attack_slot = -1
        if alive:
            _return_to_path()
    if chasing == d:
        chasing = null
        if alive and state == State.CHASE:
            _return_to_path()
    if blocked_by == d:
        blocked_by = null
        if alive and state == State.WALL:
            state = State.WALK
            progress = 1.0

func _die() -> void:
    alive = false
    state = State.DYING
    _death_timer = 0.0
    _death_dir = 1.0 if randf() < 0.5 else -1.0
    _release_slots()
    if _hp_bar:
        _hp_bar.visible = false
    died.emit(self)

## Free every attack slot we hold, so the defender we were on can admit another
## attacker. Missing this leaks capacity and eventually starves the horde of slots.
func _release_slots() -> void:
    if fighting != null and is_instance_valid(fighting):
        fighting.release_slot(self)
    fighting = null
    chasing = null
    blocked_by = null
    attack_slot = -1

# ═══════════════════════════════════════════════════════════════════════════
#  MAIN TICK
# ═══════════════════════════════════════════════════════════════════════════

func tick(dt: float) -> void:
    if _flash > 0.0:
        _flash = maxf(0.0, _flash - dt)
    if not alive:
        if not escaped:
            _tick_death(dt)
        return

    match state:
        State.CASTLE:
            _tick_castle(dt)
        State.WALL:
            _tick_wall(dt)
        State.FIGHT:
            _tick_fight(dt)
        State.CHASE:
            _tick_chase(dt)
        State.WALK:
            _tick_walk(dt)
        _:
            pass

    # The JS reaches its regen / heal / ranged block only for enemies that fell through
    # every state branch — an orc pounding a wall or the castle gate has already
    # `continue`d past it. Running them in every state gave trolls free regeneration
    # while they chewed through a wall.
    if alive and state == State.WALK:
        _tick_abilities(dt)
    elif alive:
        # Shooting and the boss slam keep running in fight/chase — the JS calls
        # tickRangedEnemy explicitly from those branches. Regeneration and the healer
        # aura do not: they sit after every state `continue`, so they are walk-only.
        _tick_ranged(dt)

## Topple, land with a dust kick, then sink away. Port of the JS death animation.
func _tick_death(dt: float) -> void:
    _death_timer += dt
    var rig: Node3D = get_child(0) if get_child_count() > 0 else null
    if rig == null:
        return
    if _death_timer < DEATH_FALL:
        var f: float = _death_timer / DEATH_FALL
        rig.rotation.z = _death_dir * (PI / 2.0) * f
        rig.position.y = sin(f * PI * 0.5) * 0.18 * scale_f
    else:
        rig.rotation.z = _death_dir * PI / 2.0
        var f: float = (_death_timer - DEATH_FALL) / (DEATH_TOTAL - DEATH_FALL)
        var bounce: float = sin((f / 0.4) * PI) * 0.10 * scale_f if f < 0.4 else 0.0
        rig.position.y = bounce - f * 0.9 * scale_f

func is_finished_dying() -> bool:
    if escaped:
        return true          # no topple animation; it is simply gone
    return not alive and _death_timer >= DEATH_TOTAL

# ── STATE: attacking the castle ──────────────────────────────────────────────
## Enemies fan out across the gate rather than stacking on one tile, using the same
## lateral-slot pattern as the wall spread.
func _tick_castle(dt: float) -> void:
    var gate: Vector2i = path[path.size() - 1]
    var target_x: float = minf(float(gate.x), 65.5 - 0.48 * scale_f - 0.1)
    var target_z: float = _castle_target_z
    var d := Vector2(target_x - position.x, target_z - position.z)
    if d.length() > 0.06:
        var step: float = minf(speed * dt, d.length())
        position.x += d.normalized().x * step
        position.z += d.normalized().y * step
        _face(Vector3(d.x, 0, d.y))
        _walk_anim(dt)
        return
    position.x = target_x
    position.z = target_z
    rotation.y = PI / 2.0                     # face the castle (+x)
    # Countdown seeded at 0, so the enemy swings on the frame it engages rather than
    # standing still for a full attack period first.
    _attack_timer -= dt
    if _attack_timer <= 0.0:
        _attack_timer = 1.0 / def_rate
        _swing = 1.0
        _swing_hit = false
    if _swing > 0.0:
        _swing = maxf(0.0, _swing - dt * 4.0)
        _swing_anim()
        if not _swing_hit and _swing <= 0.5:
            _swing_hit = true
            # Landing the hit consumes the enemy — it is spent breaching the gate. This
            # is NOT a kill: no reward, no death animation, no bounty. Port of
            # _handleCastleHit, where the orc is removed on the same frame it connects.
            escaped = true
            alive = false
            _release_slots()
            if _hp_bar:
                _hp_bar.visible = false
            reached_castle.emit(self)

# ── STATE: hammering a wall that blocks the road ─────────────────────────────
func _tick_wall(dt: float) -> void:
    if blocked_by == null or not is_instance_valid(blocked_by) or not blocked_by.alive:
        blocked_by = null
        state = State.WALK
        progress = 1.0        # snap to the tile edge so the walk loop clears the tile at once
        return
    var d := Vector2(_wall_target.x - position.x, _wall_target.y - position.z)
    if d.length() > 0.06:
        var step: float = minf(speed * dt, d.length())
        position.x += d.normalized().x * step
        position.z += d.normalized().y * step
        _face(Vector3(d.x, 0, d.y))
        _walk_anim(dt)
        # Keep swinging while shuffling sideways into the spread slot — the stop point is
        # already against the wall, so waiting until the slide finishes gave the player a
        # free second on every blocked enemy.
        _tick_wall_swing(dt)
        return
    _tick_wall_swing(dt)

func _tick_wall_swing(dt: float) -> void:
    if blocked_by == null or not is_instance_valid(blocked_by) or not blocked_by.alive:
        return
    if state == State.WALL and position.distance_to(Vector3(_wall_target.x, 0, _wall_target.y)) <= 0.06:
        _face(blocked_by.global_position - global_position)
    # A ranged enemy shoots the wall down instead of melee-pounding it.
    if type_name == "enemyArcher" or type_name == "orcMage":
        _attack_timer -= dt
        if _attack_timer <= 0.0:
            _attack_timer = 1.0 / maxf(shoot_rate, 0.01)
            _game.fire_enemy_shot(self, blocked_by, shoot_dmg, type_name)
        return
    # Countdown seeded at 0, so the enemy swings on the frame it engages rather than
    # standing still for a full attack period first.
    _attack_timer -= dt
    if _attack_timer <= 0.0:
        _attack_timer = 1.0 / def_rate
        _swing = 1.0
        _swing_hit = false
    if _swing > 0.0:
        _swing = maxf(0.0, _swing - dt * 4.0)
        _swing_anim()
        if not _swing_hit and _swing <= 0.5:
            _swing_hit = true
            _game.damage_defender(blocked_by, wall_dmg, self)

## grunts, skeletons and wolves lunge at anything much further out than the rest.
func _is_melee_aggressor() -> bool:
    return type_name in MELEE_AGGRESSORS

## Reach at which we will stop and fight something we are walking past.
func _melee_radius() -> float:
    return (3.2 if _is_melee_aggressor() else 1.8) + 0.3 * scale_f

## Tighter reach used mid-chase and immediately after a kill — close enough that we can
## switch target without giving up ground.
func _immediate_radius() -> float:
    return (2.6 if _is_melee_aggressor() else 1.5) + 0.3 * scale_f

## Try to lock onto `d`. Returns true if a ring slot was free.
func _engage(d: Defender) -> bool:
    if d == null or not is_instance_valid(d) or not d.alive:
        return false
    var slot: int = d.acquire_slot(self)
    if slot < 0:
        return false
    attack_slot = slot
    fighting = d
    chasing = null
    state = State.FIGHT
    _attack_timer = 0.0
    _swing = 0.0
    _swing_hit = false
    return true

# ── STATE: melee against a unit ──────────────────────────────────────────────
func _tick_fight(dt: float) -> void:
    if fighting == null or not is_instance_valid(fighting) or not fighting.alive:
        _release_slots()
        # Look for the next victim twice before giving up: something close enough to hit
        # without moving, then anything worth charging. Running straight back to the road
        # made a unit that killed one defender teleport away from the three beside it.
        if _engage(_game.find_defender_in_range(global_position, _immediate_radius())):
            return
        var next_chase: Defender = _game.find_defender_in_range(global_position, 5.0)
        if next_chase != null:
            chasing = next_chase
            state = State.CHASE
            return
        _return_to_path()
        return
    # A wall thrown up between us and our target ends the fight.
    if _game.wall_blocks_path(global_position, fighting.global_position):
        _release_slots()
        _return_to_path()
        return
    var slot_pos: Vector3 = fighting.slot_position(attack_slot, scale_f)
    var d := Vector2(slot_pos.x - position.x, slot_pos.z - position.z)
    if d.length() > 0.12:
        var step: float = minf(speed * dt, d.length())
        position.x += d.normalized().x * step
        position.z += d.normalized().y * step
        _face(Vector3(d.x, 0, d.y))
        _walk_anim(dt)
        return
    _face(fighting.global_position - global_position)
    # Countdown seeded at 0, so the enemy swings on the frame it engages rather than
    # standing still for a full attack period first.
    _attack_timer -= dt
    if _attack_timer <= 0.0:
        _attack_timer = 1.0 / def_rate
        _swing = 1.0
        _swing_hit = false
    if _swing > 0.0:
        _swing = maxf(0.0, _swing - dt * 4.0)
        _swing_anim()
        if not _swing_hit and _swing <= 0.5:
            _swing_hit = true
            _game.damage_defender(fighting, def_dmg, self)

# ── STATE: charging an exposed tower ─────────────────────────────────────────
## Towers within 7.5 tiles get charged. This is what makes an unprotected emplacement
## real bait rather than a free turret.
func _tick_chase(dt: float) -> void:
    if chasing == null or not is_instance_valid(chasing) or not chasing.alive:
        chasing = null
        var next_chase: Defender = _game.find_defender_in_range(global_position, 5.0)
        if next_chase != null:
            chasing = next_chase
            return
        _return_to_path()
        return
    # Something in arm's reach beats the thing we set out for.
    var immediate: Defender = _game.find_defender_in_range(global_position, _immediate_radius())
    if immediate != null and immediate != chasing and _engage(immediate):
        return
    # Aggro is re-tested against walls every frame, not just when it was taken — walling
    # a tower off has to actually call the charge off, or the charger walks over the wall.
    if _game.wall_blocks_path(global_position, chasing.global_position):
        chasing = null
        _return_to_path()
        return
    var d := Vector2(chasing.global_position.x - position.x, chasing.global_position.z - position.z)
    var reach: float = 1.0 + 0.25 * scale_f
    if d.length() > reach:
        var step: float = minf(speed * dt, d.length())
        position.x += d.normalized().x * step
        position.z += d.normalized().y * step
        # Off the road we have to solve our own collisions; the lane no longer does it.
        _game.push_out_of_buildings(self, 0.28 + 0.12 * scale_f, chasing)
        _push_apart()
        _face(Vector3(d.x, 0, d.y))
        _walk_anim(dt)
        return
    if not _engage(chasing):
        # The target is at capacity and will not admit us. Without this the enemy stood
        # still forever: it is nobody's target, so nothing kills it out of the state, and
        # the wave-end check waits on it.
        chasing = null
        _return_to_path()

# ── STATE: walking the road ──────────────────────────────────────────────────
func _tick_walk(dt: float) -> void:
    # Melee engagement beats distant tower aggro — a soldier in reach always wins.
    var near: Defender = _game.find_defender_in_range(global_position, _melee_radius())
    if near != null:
        if _engage(near):
            return
    else:
        var tower: Defender = _game.find_tower_in_range(global_position, 7.5)
        if tower != null and not _game.wall_blocks_path(global_position, tower.global_position):
            chasing = tower
            state = State.CHASE
            return

    # Separation: ease off when a teammate ahead on the same lane is too close, so the
    # column bunches rather than telescoping through itself.
    var speed_factor: float = _separation_factor()
    if _slow_timer > 0.0:
        speed_factor *= _slow_amount
        _slow_timer -= dt
        if _slow_timer <= 0.0:
            _slow_timer = 0.0
            _slow_amount = 1.0
    if _phase_timer > 0.0:
        _phase_timer -= dt
        speed_factor *= 0.35

    progress += speed_factor * speed * dt
    while progress >= 1.0:
        var next_idx: int = path_index + 1
        if next_idx >= path.size():
            _enter_castle_state()
            return
        var n: Vector2i = path[next_idx]
        var wall: Defender = _game.wall_at(n.x, n.y)
        if wall != null:
            if type_name == "skeleton":
                # Skeletons phase through walls — they are just bones. Slowed to 35%
                # for 1.8s while squeezing through, but never stopped.
                _phase_timer = 1.8
                Snd.play("skeleton_phase")
            else:
                _enter_wall_state(wall, n)
                return
        progress -= 1.0
        path_index = next_idx

    var cur: Vector2i = path[path_index]
    var nxt: Vector2i = path[mini(path_index + 1, path.size() - 1)]
    position.x = cur.x + (nxt.x - cur.x) * progress
    position.z = cur.y + (nxt.y - cur.y) * progress
    var seg := Vector3(nxt.x - cur.x, 0, nxt.y - cur.y)
    if seg.length_squared() > 0.0001:
        _face(seg)
    _push_apart()
    _game.push_out_of_buildings(self, 0.28 + 0.12 * scale_f, null)
    _seek_target()
    _walk_anim(dt)

## After moving, look for something to break off for. This is what makes an off-road
## defender genuinely dangerous to place rather than something the horde files past:
## the port only ever chased towers, so archers, mages, ballistas and back-line troops
## were simply walked around.
func _seek_target() -> void:
    if fighting != null or blocked_by != null or chasing != null:
        return
    var near: Defender = _game.find_defender_in_range(global_position, _melee_radius())
    if near != null:
        _engage(near)
        return
    # Queue-breaking: if someone ahead of us on this lane is already in a fight, adopt
    # their target and fan out around it, rather than piling up behind the brawl.
    for o in _game.enemies:
        if o == self or not o.alive or o.lane_id != lane_id or o.path_index < path_index:
            continue
        var t: Defender = null
        if o.fighting != null and is_instance_valid(o.fighting) and o.fighting.alive:
            t = o.fighting
        elif o.chasing != null and is_instance_valid(o.chasing) and o.chasing.alive:
            t = o.chasing
        if t != null:
            if not _game.wall_blocks_path(global_position, t.global_position):
                chasing = t
                state = State.CHASE
            return
    # Wide sweep for ANY defender, not just emplacements.
    var far: Defender = _game.find_defender_in_range(global_position, 6.5 + 0.4 * scale_f)
    if far != null and not _game.wall_blocks_path(global_position, far.global_position):
        chasing = far
        state = State.CHASE

func _enter_castle_state() -> void:
    state = State.CASTLE
    _attack_timer = 0.0
    progress = 0.0
    var taken := {}
    for o in _game.enemies:
        if o != self and o.alive and o.state == State.CASTLE and o.castle_slot >= 0:
            taken[o.castle_slot] = true
    var i := 0
    while taken.has(i):
        i += 1
    castle_slot = i
    var gate: Vector2i = path[path.size() - 1]
    var lat_sign: float = 0.0 if i == 0 else (1.0 if i % 2 == 1 else -1.0)
    var lat_mag: float = ceili(i / 2.0) * 0.85
    _castle_target_z = gate.y + lat_sign * lat_mag

func _enter_wall_state(wall: Defender, next_tile: Vector2i) -> void:
    blocked_by = wall
    state = State.WALL
    _attack_timer = 0.0
    # Stop far enough back that the scaled body does not penetrate the wall mesh.
    progress = maxf(0.05, 1.0 - 0.48 - 0.22 * scale_f)
    var taken := {}
    for o in _game.enemies:
        if o != self and o.alive and o.blocked_by == wall and o.wall_slot >= 0:
            taken[o.wall_slot] = true
    var i := 0
    while taken.has(i):
        i += 1
    wall_slot = i
    var cur: Vector2i = path[path_index]
    var perp := Vector2(-(next_tile.y - cur.y), next_tile.x - cur.x)
    var lat_sign: float = 0.0 if i == 0 else (1.0 if i % 2 == 1 else -1.0)
    var lat_mag: float = ceili(i / 2.0) * 0.85
    _wall_target = Vector2(
        cur.x + (next_tile.x - cur.x) * progress + perp.x * lat_sign * lat_mag,
        cur.y + (next_tile.y - cur.y) * progress + perp.y * lat_sign * lat_mag)

## Snap back onto the road at the nearest waypoint after an off-path chase.
func _return_to_path() -> void:
    var best := 0
    var best_d := INF
    for i in range(path.size() - 1):
        var d: float = Vector2(position.x - path[i].x, position.z - path[i].y).length_squared()
        if d < best_d:
            best_d = d
            best = i
    path_index = best
    progress = 0.0
    state = State.WALK
    _swing = 0.0
    var rig: Node3D = get_child(0) if get_child_count() > 0 else null
    if rig:
        rig.rotation = Vector3.ZERO

## Smooth falloff: full speed beyond SEP_SLOW, full stop inside SEP_STOP. Skipped on
## very large waves, where it is O(n²) and invisible anyway.
func _separation_factor() -> float:
    const SEP_STOP := 0.5
    const SEP_SLOW := 1.0
    if _game.enemies.size() > 80:
        return 1.0
    var factor := 1.0
    for o in _game.enemies:
        if o == self or not o.alive or o.lane_id != lane_id:
            continue
        var ahead: bool = o.path_index > path_index or (o.path_index == path_index and o.progress > progress)
        if not ahead or o.state != State.WALK:
            continue
        var d: float = global_position.distance_to(o.global_position)
        if d < SEP_SLOW:
            factor = minf(factor, clampf((d - SEP_STOP) / (SEP_SLOW - SEP_STOP), 0.0, 1.0))
    return factor

## Nudge apart from enemies on OTHER lanes so crossings do not visually interpenetrate.
func _push_apart() -> void:
    # Budget cap, matching the one the JS puts on its separation loop. This is quadratic
    # in the live-enemy count, which the spawner deliberately allows up to 200 — and it
    # only stops bodies visually interpenetrating at lane crossings, so dropping it on
    # the largest waves costs nothing the player can act on.
    if _game.enemies.size() > 80:
        return
    var min_d: float = 0.45 + 0.2 * scale_f
    for o in _game.enemies:
        if o == self or not o.alive or o.lane_id == lane_id:
            continue
        var dv := Vector2(position.x - o.position.x, position.z - o.position.z)
        var d2: float = dv.length_squared()
        if d2 < min_d * min_d and d2 > 0.0001:
            var d: float = sqrt(d2)
            position.x += (dv.x / d) * (min_d - d) * 0.3
            position.z += (dv.y / d) * (min_d - d) * 0.3

# ── passive abilities, run in every state ────────────────────────────────────
## Regeneration and the healer aura, which the JS runs ONLY for a walking enemy — both
## sit after every state `continue` in updateOrcs. A troll that regenerates while it is
## chewing through a wall is close to unkillable.
func _tick_abilities(dt: float) -> void:
    if regens and hp < max_hp:
        _regen_timer += dt
        if _regen_timer >= 2.5:
            _regen_timer = 0.0
            heal(3.0)

    if heals_nearby:
        var cfg: Dictionary = Cfg.ORC_TYPES["healerOrc"]
        _heal_timer += dt
        if _heal_timer >= float(cfg["healInterval"]):
            _heal_timer = 0.0
            var r2: float = float(cfg["healRadius"]) * float(cfg["healRadius"])
            for o in _game.enemies:
                if o != self and o.alive and o.hp < o.max_hp \
                and o.global_position.distance_squared_to(global_position) < r2:
                    o.heal(float(cfg["healAmount"]))
                    Snd.play("heal")

    _tick_ranged(dt)

## Shooting, the cyclops melee aura and the boss ground-slam. Unlike regeneration these
## DO keep running in fight and chase — the JS calls tickRangedEnemy from those branches.
func _tick_ranged(dt: float) -> void:
    # Archers swing instead of shooting once in melee, so ranged fire is skipped there
    # — otherwise they deal damage twice.
    if shoot_range > 0.0 and not (type_name == "enemyArcher" and state == State.FIGHT):
        _shoot_cd -= dt
        if _shoot_cd <= 0.0:
            var t: Defender = _game.find_closest_defender(global_position, shoot_range)
            if t != null:
                _shoot_cd = 1.0 / shoot_rate
                _game.fire_enemy_shot(self, t, shoot_dmg, type_name)

    if melee_range > 0.0:
        _melee_cd -= dt
        if _melee_cd <= 0.0:
            var t: Defender = _game.find_closest_defender(global_position, melee_range)
            if t != null:
                _melee_cd = 1.0 / melee_rate
                _game.damage_defender(t, melee_dmg, self)

    # Boss ground-slam: hits EVERY defender in range, walls and towers alike. This is
    # what makes the fight read as a boss rather than a bigger grunt.
    if is_level_boss and slam_range > 0.0:
        _slam_cd -= dt
        if _slam_cd <= 0.0:
            _slam_cd = 1.0 / slam_rate
            var r2: float = slam_range * slam_range
            var any := false
            for d in _game.defenders:
                if d.alive and global_position.distance_squared_to(d.global_position) <= r2:
                    _game.damage_defender(d, slam_dmg, self)
                    any = true
            if any:
                _game.on_boss_slam(global_position)

# ── animation ────────────────────────────────────────────────────────────────
func _face(dir: Vector3) -> void:
    if absf(dir.x) < 0.0001 and absf(dir.z) < 0.0001:
        return
    rotation.y = atan2(dir.x, dir.z)

func _walk_anim(dt: float) -> void:
    _anim_time += dt * 5.5
    var swing: float = sin(_anim_time) * 0.11
    if _parts.has("leg_l"):
        _parts["leg_l"].position.y = _leg_base + swing
    if _parts.has("leg_r"):
        _parts["leg_r"].position.y = _leg_base - swing
    if _parts.has("arm_l"):
        _parts["arm_l"].rotation.x = -swing * 2.0
    if _parts.has("arm_r"):
        _parts["arm_r"].rotation.x = swing * 2.0
    var rig: Node3D = get_child(0) if get_child_count() > 0 else null
    if rig:
        rig.position.y = absf(sin(_anim_time)) * 0.06

## Overhead swing on the weapon arm, timed so the hit lands at the bottom of the arc.
func _swing_anim() -> void:
    var s: float = sin(_swing * PI)
    if _parts.has("arm_r"):
        _parts["arm_r"].rotation.x = -0.75 + s * 3.0
    if _parts.has("arm_l"):
        _parts["arm_l"].rotation.x = s * 1.0
    var rig: Node3D = get_child(0) if get_child_count() > 0 else null
    if rig:
        rig.rotation.x = s * 0.30
