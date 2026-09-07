class_name Defender
extends Node3D
## A placed unit. Three quite different things share this class, exactly as they share
## one `defenders` array in the JS build:
##
##   * EMPLACEMENTS (tower, catapult, ballista, mage, upgraded wall) — stationary,
##     acquire the closest enemy in range and launch a travelling projectile.
##   * SOLDIERS (swordsman, knight, spearman) — a walking state machine that leaves its
##     tile to chase, fights in melee, and marches home (or to a rally point) after.
##     The archer walks for separation purposes but never leaves its post.
##   * HAZARDS (wall, spiketrap) — a wall only blocks until upgraded; a spiketrap is a
##     passive AoE that damages and slows everything standing on it.

enum SoldierState { IDLE, CHASING, FIGHTING, RETURNING }

const SOLDIER_TYPES := ["knight", "swordsman", "spearman"]
## Same reason as enemy.gd's MELEE_AGGRESSORS: these are tested per unit per frame, and
## an inline literal allocates an Array every time.
const SHOOTER_TYPES := ["tower", "catapult", "archer", "mage", "ballista"]
const BLOCKING_TYPES := ["tower", "catapult", "wall"]
## Who may be given a rally point. The archer walks for separation but never leaves its
## post, yet the JS still lets you re-post it — so it belongs here even though it is not
## in SOLDIER_TYPES.
const RALLY_TYPES := ["knight", "swordsman", "spearman", "archer"]
const WALK_SPEED := {"knight": 2.3, "spearman": 2.7, "swordsman": 3.0, "archer": 2.8}

var type_name: String = "tower"
var col: int = 0
var row: int = 0
var level: int = 1
var kills: int = 0
var alive: bool = true

var range_r: float = 6.5
var rate: float = 1.05
var dmg: float = 3.0
var aoe: float = 0.0
var hp: float = 35.0
var max_hp: float = 35.0
var cooldown: float = 0.0

var state: SoldierState = SoldierState.IDLE
var chase_target: Enemy = null
var attacked_by: Enemy = null
var rally: Vector2 = Vector2.INF        ## INF = no rally point set; home is (col,row)

var _game: Node = null
var _parts: Dictionary = {}
var _leg_base: float = 0.17
var _idle_time: float = 0.0
var _fire_phase: float = 0.0
var _flash: float = 0.0
var _spawn_anim: float = 0.0
var _death_timer: float = 0.0
var _death_dir: float = 1.0
var _trigger_phase: float = 0.0         ## spiketrap spike pop
var _poison_timer: float = 0.0          ## skeleton venom
var _poison_dps: float = 0.0
var _cursed_timer: float = 0.0          ## orc-mage curse: fires 40% slower
var _rig: Node3D = null
var _hp_bar: Node3D = null
var _hp_fill: MeshInstance3D = null
var _level_pips: Array[MeshInstance3D] = []

## Enemies engaging this unit, one per ring slot. Index IS the slot number; a null
## entry is a freed slot. The JS keeps this in a WeakMap keyed by defender — holding
## it on the defender itself is the same thing without the side table.
var _slots: Array = []

signal fired(from: Vector3, to: Vector3, kind: String, splash: float)
signal died(d: Defender)

func setup(t: String, c: int, r: int, game: Node) -> void:
    type_name = t
    col = c
    row = r
    _game = game
    position = Vector3(c, 0, r)
    var s: Dictionary = Cfg.STATS.get(t, Cfg.STATS["tower"])
    range_r = float(s.get("range", 0.0))
    rate = float(s.get("rate", 1.0))
    dmg = float(s.get("dmg", 0))
    aoe = float(s.get("aoe", 0.0))
    max_hp = float(s.get("hp", 30))
    hp = max_hp
    _build_model()

func _build_model() -> void:
    _rig = Node3D.new()
    add_child(_rig)
    _parts = Models.build_defender(type_name, _rig)
    _leg_base = float(_parts.get("leg_base", 0.17))
    if type_name != "spiketrap":
        _build_hp_bar()
    _rig.scale = Vector3.ZERO      # popped in by the placement animation

func _build_hp_bar() -> void:
    _hp_bar = Node3D.new()
    _hp_bar.position = Vector3(0, 1.55 if is_soldier() else 2.3, 0)
    _rig.add_child(_hp_bar)
    var bg := Voxel.box(Vector3(0.9, 0.10, 0.02), Color(0.05, 0.05, 0.05))
    bg.material_override = Voxel.ghost_mat(Color(0.05, 0.05, 0.05), 0.75)
    _hp_bar.add_child(bg)
    _hp_fill = Voxel.box(Vector3(0.86, 0.07, 0.03), Color(0.35, 0.7, 1.0))
    _hp_fill.material_override = Voxel.ghost_mat(Color(0.35, 0.7, 1.0), 0.95)
    _hp_bar.add_child(_hp_fill)
    _hp_bar.visible = false

func is_soldier() -> bool:
    return type_name in SOLDIER_TYPES or type_name == "archer"

func can_rally() -> bool:
    return type_name in RALLY_TYPES

## Orc-mage curse. Applied on an eMagic hit; the JS scales cooldown drain by 0.6 while
## it lasts, i.e. the unit fires 40% slower.
func apply_curse(seconds: float) -> void:
    _cursed_timer = maxf(_cursed_timer, seconds)

func apply_poison(seconds: float, dps: float) -> void:
    if type_name == "wall" or type_name == "spiketrap":
        return
    _poison_timer = seconds
    _poison_dps = dps

## Who runs the walking state machine at all. The three melee troops always do; an
## archer does ONLY while it has somewhere to be.
##
## The JS lists the archer in _RALLY_TYPES and shows it a rally button, but its state
## machine is gated to knight/swordsman/spearman and its own branch is pure animation —
## so setting an archer's rally point there does precisely nothing. The port reproduced
## that faithfully, which meant a unit the game invited you to move refused to move.
## Honouring the order is the better bug to have.
func is_walker() -> bool:
    if type_name in SOLDIER_TYPES:
        return true
    return type_name == "archer" and (rally != Vector2.INF or state == SoldierState.RETURNING)

## Only an upgraded wall shoots; a plain one purely blocks.
func shoots() -> bool:
    if type_name == "wall":
        return level >= 2
    return type_name in SHOOTER_TYPES

func home() -> Vector2:
    return rally if rally != Vector2.INF else Vector2(col, row)

# ═══════════════════════════════════════════════════════════════════════════
#  UPGRADES
# ═══════════════════════════════════════════════════════════════════════════

## Returns "" on success, or the reason it was refused — the caller turns that into
## the on-screen tooltip, exactly as tryUpgradeDefender does.
func try_upgrade() -> String:
    if type_name == "spiketrap":
        return "Spike traps cannot be upgraded!"
    if level >= Cfg.MAX_LEVEL:
        return "Max level!"
    var need: int = Cfg.upgrade_kills_needed(type_name, level)
    if kills < need:
        return "Need %d kills to upgrade! (%d/%d)" % [need, kills, need]
    var cost: int = Cfg.upgrade_cost(type_name, level)
    if _game.gold < cost:
        return "Not enough gold! Need %d to upgrade" % cost
    _game.gold -= cost
    level += 1
    if type_name == "wall":
        var w: Dictionary = Cfg.WALL_UPGRADE[level]
        dmg = w["dmg"]
        range_r = w["range"]
        rate = w["rate"]
        aoe = float(w.get("aoe", 0.0))
        max_hp = floorf(max_hp * 1.25)
    else:
        var um: Dictionary = Cfg.UPGRADE_STATS.get(type_name, {"dmg": 1.35, "range": 1.15, "rate": 1.25, "hp": 1.40})
        dmg *= float(um["dmg"])
        range_r *= float(um["range"])
        rate *= float(um["rate"])
        max_hp = floorf(max_hp * float(um["hp"]))
    hp = minf(max_hp, hp + floorf(max_hp * 0.3))
    _add_level_pip()
    _refresh_hp_bar()
    return ""

## A gold gem per level above 1, floating over the unit.
func _add_level_pip() -> void:
    var pip := Voxel.box(Vector3(0.12, 0.12, 0.12), Color("ffd24a"))
    pip.material_override = Voxel.emissive_mat(Color("ffd24a"), Color("ff9900"), 2.0)
    var y: float = 1.75 if is_soldier() else 2.5
    pip.position = Vector3((level - 2) * 0.18 - 0.09, y, 0)
    pip.rotation = Vector3(0.6, 0.8, 0)
    _rig.add_child(pip)
    _level_pips.append(pip)

func sell_value() -> int:
    # Half of everything sunk in, matching sellDefenderAt(). The port had 70%, which made
    # build-and-flip nearly free and removed the cost of a misplacement.
    return int(floor(Cfg.total_cost_paid(type_name, level) * 0.5))

# ═══════════════════════════════════════════════════════════════════════════
#  ATTACK SLOTS — enemies fan out in concentric rings around this unit
#    ring 0 (slots 0-3): dist 1.0, at 0/90/180/270 degrees
#    ring 1 (slots 4-7): dist 2.0, offset 45 degrees, and so on outward
# ═══════════════════════════════════════════════════════════════════════════

func acquire_slot(e: Enemy) -> int:
    var existing: int = _slots.find(e)
    if existing >= 0:
        return existing
    var max_slots: int = int(Cfg.STATS.get(type_name, {}).get("maxSlots", 9999))
    var active := 0
    for s in _slots:
        if s != null:
            active += 1
    if active >= max_slots:
        return -1                       # at capacity, attacker must look elsewhere
    for i in _slots.size():
        if _slots[i] == null:
            _slots[i] = e
            return i
    _slots.append(e)                    # auto-expand into the next ring
    return _slots.size() - 1

func release_slot(e: Enemy) -> void:
    var i: int = _slots.find(e)
    if i >= 0:
        _slots[i] = null

func slot_position(slot_idx: int, enemy_scale: float) -> Vector3:
    var i: int = maxi(0, slot_idx)
    var ring: int = i / 4
    var angle: float = (i % 4) * PI * 0.5 + (PI / 4.0 if ring % 2 == 1 else 0.0)
    var dist: float = 1.0 + ring * 1.0 + 0.15 * enemy_scale
    return Vector3(global_position.x + sin(angle) * dist, 0.0, global_position.z + cos(angle) * dist)

# ═══════════════════════════════════════════════════════════════════════════
#  DAMAGE
# ═══════════════════════════════════════════════════════════════════════════

func take_damage(amount: float, attacker: Enemy = null) -> void:
    if not alive:
        return
    if type_name == "spiketrap":
        return                          # floor hazard: hp 9999, never a melee target
    hp -= amount
    _flash = 0.18
    if attacker != null:
        attacked_by = attacker
        # Skeletons envenom what they bite — 0.8 dps for 4s, walls and traps immune.
        if attacker.type_name == "skeleton":
            apply_poison(4.0, 0.8)
        # A melee unit hits back the instant it is struck, for its FULL damage. Without
        # this a knight traded blows only on its own cooldown, roughly halving its output.
        # Same termination rule as the enemy counter: no source is passed, so the riposte
        # cannot provoke a counter-riposte. It also means a riposte kill earns no upgrade
        # credit — which is the JS behaviour, since it calls dealDamage() with two args.
        if type_name in SOLDIER_TYPES and hp > 0.0 and attacker.alive:
            _game.damage_enemy(attacker, float(Cfg.STATS.get(type_name, {}).get("dmg", 1)), null, null)
    _refresh_hp_bar()
    if hp <= 0.0:
        alive = false
        _death_timer = 0.0
        _death_dir = 1.0 if randf() < 0.5 else -1.0
        if _hp_bar:
            _hp_bar.visible = false
        # Everything engaging us is now free; without this they keep swinging at a corpse.
        for s in _slots:
            if s != null and is_instance_valid(s):
                s.on_target_lost(self)
        _slots.clear()
        died.emit(self)

func _refresh_hp_bar() -> void:
    if _hp_fill == null:
        return
    var pct: float = clampf(hp / max_hp, 0.0, 1.0)
    _hp_bar.visible = pct < 1.0 and alive
    _hp_fill.scale.x = maxf(pct, 0.001)
    _hp_fill.position.x = -0.43 * (1.0 - pct)
    var c := Color(0.35, 0.7, 1.0) if pct > 0.5 else (Color(0.95, 0.75, 0.1) if pct > 0.25 else Color(0.9, 0.2, 0.15))
    _hp_fill.material_override = Voxel.ghost_mat(c, 0.95)

func is_finished_dying() -> bool:
    return not alive and _death_timer >= (0.70 if is_soldier() else 0.55)

# ═══════════════════════════════════════════════════════════════════════════
#  MAIN TICK
# ═══════════════════════════════════════════════════════════════════════════

func tick(dt: float) -> void:
    if not alive:
        _tick_death(dt)
        return
    if _spawn_anim < 1.0:
        _spawn_anim = minf(1.0, _spawn_anim + dt / 0.35)
        var s: float = _ease_out_bounce(_spawn_anim)
        _rig.scale = Vector3(s, s, s)
    if _flash > 0.0:
        _flash = maxf(0.0, _flash - dt)
    if _cursed_timer > 0.0:
        _cursed_timer = maxf(0.0, _cursed_timer - dt)
    if _poison_timer > 0.0:
        _poison_timer = maxf(0.0, _poison_timer - dt)
        take_damage(_poison_dps * dt)
        if not alive:
            return
    _idle_time += dt * 1.5
    if attacked_by != null and (not is_instance_valid(attacked_by) or not attacked_by.alive):
        attacked_by = null

    if type_name == "spiketrap":
        _tick_spiketrap(dt)
        return
    if is_walker():
        _tick_soldier(dt)
    elif type_name == "wall":
        _rig.position.y = absf(sin(_idle_time * 0.55 + col * 0.3)) * 0.014
    if cooldown > 0.0:
        # Haste and the orc-mage curse multiply into the same reload scale, exactly as
        # the JS combines them: _rateScale = (haste ? 1.3 : 1) * (cursed ? 0.6 : 1).
        var scale: float = (1.3 if _game.haste_waves > 0 else 1.0) * (0.6 if _cursed_timer > 0.0 else 1.0)
        cooldown -= dt * scale
        return
    if shoots():
        _tick_firing()
    elif is_walker():
        _tick_melee_strike()

func _tick_death(dt: float) -> void:
    _death_timer += dt
    var total: float = 0.70 if is_soldier() else 0.55
    var stag: float = 0.20 if is_soldier() else 0.12
    var f: float = clampf((_death_timer - stag) / (total - stag), 0.0, 1.0)
    if _rig == null:
        return
    if is_soldier():
        if _death_timer < stag:
            _rig.rotation.x = -sin((_death_timer / stag) * PI) * 0.26
        else:
            _rig.rotation.x = 0.0
            _rig.rotation.z = _death_dir * f * (PI / 2.0)
            _rig.position.y = -f * 0.35
    else:
        # A structure rocks back, then crumbles away.
        if _death_timer < stag:
            _rig.rotation.x = -(_death_timer / stag) * 0.12
        else:
            var s: float = maxf(0.0, 1.0 - (_death_timer - stag) * 7.0)
            _rig.scale = Vector3(s, s, s)

# ── emplacement firing ───────────────────────────────────────────────────────
func _tick_firing() -> void:
    var target: Enemy = _pick_target()
    if target == null:
        return
    cooldown = 1.0 / rate
    _fire_phase = 1.0
    var kind: String = Cfg.PROJECTILE_TYPES.get(type_name, "arrow")
    if type_name == "wall":
        kind = "arrow" if level == 2 else "rock"
    var muzzle: Vector3 = global_position + Vector3(0, 1.6, 0)
    if _parts.has("muzzle"):
        muzzle = (_parts["muzzle"] as Node3D).global_position
    var d := target.global_position - global_position
    rotation.y = atan2(d.x, d.z)
    fired.emit(muzzle, target.global_position + Vector3(0, 0.6, 0), kind, aoe)
    _game.launch_projectile(self, target, kind, dmg, aoe)

## Melee soldiers hit back at whatever is hitting them, if it is still in reach —
## otherwise the closest enemy. Stops a knight ignoring the orc chewing on it to walk
## toward a marginally closer one.
func _pick_target() -> Enemy:
    if is_walker() and attacked_by != null and attacked_by.alive:
        var reach: float = range_r * 1.4
        if global_position.distance_squared_to(attacked_by.global_position) <= reach * reach \
        and not _game.wall_blocks_path(global_position, attacked_by.global_position):
            return attacked_by
    return _game.find_closest_enemy(global_position, range_r)

## A fighting soldier hits the target it CHOSE and walked to — not whatever is nearest
## right now. Re-acquiring made effective_range (+1.8 when wedged against a building) and
## the +1.2 disengage hysteresis unreachable: the soldier would step into range of its
## chase target and then swing at nothing, because the re-acquired "closest" was outside
## its own base range.
func _tick_melee_strike() -> void:
    if state != SoldierState.FIGHTING:
        return
    var target: Enemy = chase_target
    if target == null or not is_instance_valid(target) or not target.alive:
        return
    cooldown = 1.0 / rate
    _fire_phase = 1.0
    match type_name:
        "knight": Snd.play("knight_slash")
        "spearman": Snd.play("spear_thrust")
        _: Snd.play("swordsman_swing")
    _game.damage_enemy(target, dmg, self, self)

# ── spiketrap: passive AoE, hits everything standing on it ───────────────────
func _tick_spiketrap(dt: float) -> void:
    if _trigger_phase > 0.0:
        _trigger_phase = maxf(0.0, _trigger_phase - dt * 3.5)
    var can_dmg: bool = cooldown <= 0.0
    if not can_dmg:
        cooldown -= dt
    var hit := false
    var r2: float = range_r * range_r
    for o in _game.enemies:
        if not o.alive:
            continue
        if global_position.distance_squared_to(o.global_position) < r2 \
        and not _game.wall_blocks_path(global_position, o.global_position):
            o.apply_slow(0.25, 0.28, false)   # trap slow ASSIGNS, it does not stack
            if can_dmg:
                _game.damage_enemy(o, dmg, self, self)
                hit = true
                if not _trigger_phase > 0.0:
                    Snd.play("spike_trigger")
                _trigger_phase = 1.0
    if hit:
        cooldown = 1.0 / rate
    var pop: float = sin(_trigger_phase * PI)
    _rig.position.y = pop * 0.18

# ── soldier state machine ────────────────────────────────────────────────────
func _tick_soldier(dt: float) -> void:
    if chase_target != null and (not is_instance_valid(chase_target) or not chase_target.alive):
        chase_target = null
        if state == SoldierState.CHASING or state == SoldierState.FIGHTING:
            chase_target = _game.find_closest_enemy(global_position, 6.0)
            state = SoldierState.CHASING if chase_target != null else SoldierState.RETURNING

    # Being hit while standing around is an immediate call to arms.
    if attacked_by != null and attacked_by.alive \
    and (state == SoldierState.IDLE or state == SoldierState.RETURNING):
        chase_target = attacked_by
        state = SoldierState.CHASING

    var eff_range: float = _effective_range()
    var h: Vector2 = home()

    # An archer holds its ground: it marches to a rally point and then stays there,
    # shooting. Only the melee troops break off to chase.
    var hunts: bool = type_name in SOLDIER_TYPES

    match state:
        SoldierState.IDLE:
            position.x = h.x
            position.z = h.y
            _idle_anim()
            if not hunts:
                return
            var scan: Enemy = _game.find_closest_enemy(global_position, 6.0)
            if scan != null:
                chase_target = scan
                state = SoldierState.CHASING
        SoldierState.CHASING:
            var d := Vector2(chase_target.global_position.x - position.x, chase_target.global_position.z - position.z)
            if d.length() <= eff_range:
                state = SoldierState.FIGHTING
            else:
                _walk(d, dt)
        SoldierState.FIGHTING:
            var d2 := Vector2(chase_target.global_position.x - position.x, chase_target.global_position.z - position.z)
            if d2.length() > eff_range + 1.2:
                state = SoldierState.CHASING
            else:
                rotation.y = atan2(d2.x, d2.y)
                _strike_anim()
        SoldierState.RETURNING:
            var d3 := Vector2(h.x - position.x, h.y - position.z)
            if d3.length() < 0.15:
                position = Vector3(h.x, 0, h.y)
                rotation = Vector3.ZERO
                state = SoldierState.IDLE
            else:
                # Still aggro on the way home, so a rally march can be interrupted —
                # but only for a unit that hunts. An archer just keeps marching.
                var t: Enemy = _game.find_closest_enemy(global_position, 6.0) if hunts else null
                if t != null:
                    chase_target = t
                    state = SoldierState.CHASING
                else:
                    _walk(d3, dt)

## A soldier wedged against a building can still reach past it — otherwise units
## placed behind a wall stand there swinging at nothing.
func _effective_range() -> float:
    for b in _game.defenders:
        if not b.alive or b == self:
            continue
        if b.type_name not in BLOCKING_TYPES:
            continue
        var d := Vector2(position.x - b.col, position.z - b.row)
        if d.length_squared() < 0.81:
            return range_r + 1.8
    return range_r

func _walk(dir: Vector2, dt: float) -> void:
    var len: float = maxf(dir.length(), 0.0001)
    var base: float = WALK_SPEED.get(type_name, 3.0)
    position.x += (dir.x / len) * base * dt
    position.z += (dir.y / len) * base * dt
    # Keep soldiers from stacking on one another.
    for other in _game.defenders:
        if other == self or not other.alive or not other.is_soldier():
            continue
        var od := Vector2(position.x - other.position.x, position.z - other.position.z)
        var od2: float = od.length_squared()
        if od2 < 0.3844 and od2 > 0.0001:      # 0.62^2
            var d: float = sqrt(od2)
            position.x += (od.x / d) * (0.62 - d) * 0.5
            position.z += (od.y / d) * (0.62 - d) * 0.5
    rotation.y = atan2(dir.x, dir.y)
    rotation.x = (0.10 if type_name == "knight" else 0.05) + base * 0.013
    var s: float = _idle_time * (5.5 * (base / 2.8))
    var sq: float = _step(sin(s), 4)           # 4-frame flipbook, chunky voxel keyframes
    rotation.z = cos(s * 0.5) * 0.058
    position.y = sin(s) * sin(s) * 0.12
    if _parts.has("leg_l"):
        _parts["leg_l"].position.y = _leg_base + sq * 0.16
        _parts["leg_l"].rotation.x = sq * 0.62
    if _parts.has("leg_r"):
        _parts["leg_r"].position.y = _leg_base - sq * 0.16
        _parts["leg_r"].rotation.x = -sq * 0.62
    if _parts.has("arm_l"):
        _parts["arm_l"].rotation.x = -sq * 0.80
    if _parts.has("arm_r"):
        _parts["arm_r"].rotation.x = sq * 0.80

func _idle_anim() -> void:
    rotation.x = 0.0
    var ws: float = sin(_idle_time * 0.50)
    var bob: float = sin(_idle_time * 0.95)
    position.y = maxf(0.0, bob * 0.06)
    rotation.z = ws * 0.055
    rotation.y = -PI / 2.0 + sin(_idle_time * 0.20) * 0.14   # slow look down the road
    if _parts.has("leg_l"):
        _parts["leg_l"].position.y = _leg_base + ws * 0.09
        _parts["leg_l"].rotation.x = ws * 0.22
    if _parts.has("leg_r"):
        _parts["leg_r"].position.y = _leg_base - ws * 0.09
        _parts["leg_r"].rotation.x = -ws * 0.22
    if _parts.has("arm_l"):
        _parts["arm_l"].rotation.x = -0.22 + sin(_idle_time * 0.82) * 0.14
    if _parts.has("arm_r"):
        _parts["arm_r"].rotation.x = 0.16 - sin(_idle_time * 0.82) * 0.14

func _strike_anim() -> void:
    rotation.x = 0.0
    rotation.z = 0.0
    position.y = 0.0
    if _fire_phase > 0.0:
        _fire_phase = maxf(0.0, _fire_phase - 0.06)
    var s: float = sin(_fire_phase * PI)
    if _parts.has("arm_r"):
        _parts["arm_r"].rotation.x = -0.5 + s * 2.4
    if _parts.has("arm_l"):
        _parts["arm_l"].rotation.x = s * 0.6

## Quantise a continuous value to N steps — the JS stepAnim(), which is what gives the
## limbs their chunky keyframed look rather than smooth interpolation.
func _step(v: float, steps: int) -> float:
    return roundf(v * steps) / steps

func _ease_out_bounce(x: float) -> float:
    const N := 7.5625
    const D := 2.75
    if x < 1.0 / D:
        return N * x * x
    elif x < 2.0 / D:
        var x2: float = x - 1.5 / D
        return N * x2 * x2 + 0.75
    elif x < 2.5 / D:
        var x3: float = x - 2.25 / D
        return N * x3 * x3 + 0.9375
    var x4: float = x - 2.625 / D
    return N * x4 * x4 + 0.984375
