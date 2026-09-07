class_name Models
extends RefCounted
## Voxel model builders. Every model in this game is axis-aligned boxes — there are
## 914 `mesh(box(w,h,d), material)` calls in the JS build and no model files at all, so
## the port is mechanical: box() -> BoxMesh, mesh() -> MeshInstance3D.
##
## Colours are the JS `M.*` palette verbatim. Silhouette and proportions follow the JS
## builders; the fine trim (individual toe claws, ear inners, eye scars) is dropped —
## it is invisible at the game's camera distance and it is ~3,000 lines of the source.
##
## Each builder returns a Dictionary carrying the root plus the parts the animation
## driver moves: leg_l / leg_r / arm_l / arm_r / head. Missing keys just mean that
## model does not animate that part.

# ── Horde palette ────────────────────────────────────────────────────────────
const C_ORC_BODY      := Color("3a1414")
const C_ORC_HEAD      := Color("4a1c1c")
const C_BRUTE         := Color("4a1208")
const C_BOSS          := Color("2a0820")
const C_TROLL         := Color("3e2c1a")
const C_ROCKTROLL     := Color("564e44")
const C_BONE          := Color("c0b898")
const C_WOLF_BODY     := Color("473a38")
const C_WOLF_HEAD     := Color("372c2a")
const C_SPIDER        := Color("1c0808")
const C_CYCLOPS       := Color("583828")
const C_EARCHER_BODY  := Color("221808")
const C_EARCHER_HOOD  := Color("141028")
const C_EXPLODER      := Color("bb2200")
const C_HEALER        := Color("4a2818")
const C_ORCMAGE_SKIN  := Color("5a3418")
const C_ORCMAGE_ROBE  := Color("280808")
const C_ORCMAGE_HAT   := Color("120618")
const C_TUSK          := Color("f0e0c0")
const C_CLUB          := Color("3a2510")
const C_METAL         := Color("4a4a5a")
const C_DARK          := Color("222233")

# ── Defender palette ─────────────────────────────────────────────────────────
## The player side shares a deliberately tight material family: royal blue makes the
## silhouettes legible from the overhead camera, teal identifies arcane pieces, and
## antique gold is reserved for details worth noticing.  Keeping these as Voxel colours
## means every repeated brick, rivet and trim piece still uses the material cache.
const C_TOWER_BASE    := Color("34495b")
const C_TOWER_ROOF    := Color("172743")
const C_CRYSTAL       := Color("17cbe0")
const C_WALL_STONE    := Color("73869a")
const C_CAT_WOOD      := Color("5b3820")
const C_WEAPON        := Color("b9c6d2")
const C_SPEARHEAD     := Color("d8e4ee")
const C_SKIN          := Color("f0c090")
const C_SW_ARMOR      := Color("356fb9")
const C_SW_HELMET     := Color("578ed1")
const C_SW_TUNIC      := Color("224c99")
const C_SW_SHIELD     := Color("173763")
const C_SW_GOLD       := Color("d6a23a")
const C_SP_TUNIC      := Color("356a9b")
const C_SP_LEATHER    := Color("765237")
const C_SP_HELMET     := Color("71879d")
const C_ARC_TEAL      := Color("1695a8")
const C_ARC_HOOD      := Color("176378")
const C_ARC_BELT      := Color("432817")
const C_MAGE_PURPLE   := Color("365aa1")
const C_MAGE_ROBE     := Color("22376f")
const C_MAGE_BEARD    := Color("e8e0d0")
const C_STONE_DARK    := Color("3e5264")
const C_STONE_LIGHT   := Color("9badbb")
const C_ROYAL_BLUE    := Color("285fb2")
const C_TEAL          := Color("16a9b9")
const C_GOLD          := Color("c89737")
const C_GOLD_LIGHT    := Color("f1c45c")
const C_WOOD_LIGHT    := Color("8c5a2c")
const C_WOOD_DARK     := Color("382215")
const C_STEEL_DARK    := Color("536579")
const C_ENEMY_ARMOR   := Color("463633")

## Eye colours glow, so they get their own emissive material rather than the flat one.
static func _eye(color: Color, size: Vector3, pos: Vector3) -> MeshInstance3D:
    var mi := Voxel.box(size, color, pos)
    mi.material_override = Voxel.emissive_mat(color, color, 1.4)
    return mi

static func _add(parent: Node3D, size: Vector3, color: Color, pos: Vector3) -> MeshInstance3D:
    var mi := Voxel.box(size, color, pos)
    parent.add_child(mi)
    return mi

## A non-animated accent helper.  We keep it here, rather than introducing bespoke
## meshes or materials, so the visual pass remains code-native and cache-friendly.
static func _glow(parent: Node3D, size: Vector3, color: Color, emission: Color,
        pos: Vector3, energy: float = 1.5) -> MeshInstance3D:
    var mi := Voxel.box(size, color, pos)
    mi.material_override = Voxel.emissive_mat(color, emission, energy)
    parent.add_child(mi)
    return mi

static func _gold_trim(parent: Node3D, size: Vector3, pos: Vector3) -> MeshInstance3D:
    return _add(parent, size, C_GOLD, pos)

# ═════════════════════════════════════════════════════════════════════════════
#  ENEMIES
# ═════════════════════════════════════════════════════════════════════════════

static func build_enemy(type: String, root: Node3D) -> Dictionary:
    match type:
        "wolf":        return _wolf(root)
        "skeleton":    return _skeleton(root)
        "spider":      return _spider(root)
        "troll":       return _troll(root)
        "rockTroll":   return _rock_troll(root)
        "cyclops":     return _cyclops(root)
        "enemyArcher": return _enemy_archer(root)
        "exploder":    return _exploder(root)
        "healerOrc":   return _healer(root)
        "orcMage":     return _orc_mage(root)
        "brute":       return _brute(root)
        "boss":        return _warboss(root)
        _:             return _humanoid(root, C_ORC_BODY, C_ORC_HEAD, Color("aa33ff"), "club")

## The shared orc/troll body. Every two-legged horde unit is this plus a weapon —
## which is exactly how the JS builds them (spawnGenericOrc + per-type extras).
static func _humanoid(root: Node3D, body_c: Color, head_c: Color, eye_c: Color, weapon: String) -> Dictionary:
    # Keep these four proxy nodes exactly where the movement code expects them. Detail
    # is attached underneath or alongside them so a leg swing still carries its boot and
    # an arm swing still carries the whole weapon silhouette.
    var leg_l := _add(root, Vector3(0.22, 0.38, 0.22), body_c, Vector3(0.16, 0.19, 0))
    var leg_r := _add(root, Vector3(0.22, 0.38, 0.22), body_c, Vector3(-0.16, 0.19, 0))
    _add(leg_l, Vector3(0.26, 0.12, 0.34), body_c, Vector3(0, -0.21, 0.07))
    _add(leg_r, Vector3(0.26, 0.12, 0.34), body_c, Vector3(0, -0.21, 0.07))
    _add(root, Vector3(0.55, 0.58, 0.38), body_c, Vector3(0, 0.68, 0))
    _add(root, Vector3(0.60, 0.07, 0.42), C_ENEMY_ARMOR, Vector3(0, 0.51, 0.01)) # war belt
    _add(root, Vector3(0.12, 0.34, 0.035), C_ENEMY_ARMOR, Vector3(0, 0.71, 0.208)) # chest strap
    var head := _add(root, Vector3(0.44, 0.44, 0.44), head_c, Vector3(0, 1.17, 0))
    _add(root, Vector3(0.50, 0.08, 0.12), head_c, Vector3(0, 1.30, 0.20))   # brow ridge
    _add(root, Vector3(0.14, 0.10, 0.14), head_c, Vector3(0, 1.18, 0.24))   # nose
    _add(root, Vector3(0.18, 0.08, 0.12), C_DARK, Vector3(0, 1.02, 0.22))   # under-jaw
    root.add_child(_eye(eye_c, Vector3(0.08, 0.08, 0.05), Vector3(0.11, 1.22, 0.22)))
    root.add_child(_eye(eye_c, Vector3(0.08, 0.08, 0.05), Vector3(-0.11, 1.22, 0.22)))
    _add(root, Vector3(0.05, 0.10, 0.05), C_TUSK, Vector3(0.09, 1.06, 0.21))
    _add(root, Vector3(0.05, 0.10, 0.05), C_TUSK, Vector3(-0.09, 1.06, 0.21))
    var arm_l := _add(root, Vector3(0.24, 0.44, 0.24), body_c, Vector3(0.40, 0.62, 0))
    var arm_r := _add(root, Vector3(0.24, 0.44, 0.24), body_c, Vector3(-0.40, 0.62, 0))
    _add(arm_l, Vector3(0.27, 0.18, 0.28), body_c, Vector3(0, -0.27, 0.01))
    _add(arm_r, Vector3(0.27, 0.18, 0.28), body_c, Vector3(0, -0.27, 0.01))
    _weapon(arm_r, weapon, root)
    return {"leg_l": leg_l, "leg_r": leg_r, "arm_l": arm_l, "arm_r": arm_r, "head": head}

static func _weapon(arm: Node3D, kind: String, root: Node3D) -> void:
    match kind:
        "club":
            _add(arm, Vector3(0.13, 0.52, 0.13), C_CLUB, Vector3(-0.02, -0.52, 0.08))
            _add(arm, Vector3(0.22, 0.22, 0.22), C_CLUB, Vector3(-0.02, -0.80, 0.08))
            _add(arm, Vector3(0.17, 0.05, 0.17), C_ENEMY_ARMOR, Vector3(-0.02, -0.60, 0.08))
            for off in [Vector3(0.12, 0, 0), Vector3(-0.12, 0, 0), Vector3(0, 0, 0.12), Vector3(0, 0, -0.12)]:
                _add(arm, Vector3(0.06, 0.06, 0.06), C_METAL, Vector3(-0.02 + off.x, -0.84, 0.08 + off.z))
        "axe":
            _add(arm, Vector3(0.09, 0.72, 0.09), C_CLUB, Vector3(-0.08, -0.34, 0.08))
            _add(arm, Vector3(0.38, 0.16, 0.09), C_METAL, Vector3(-0.08, 0.04, 0.08))
            _add(arm, Vector3(0.32, 0.14, 0.09), C_METAL, Vector3(-0.08, -0.10, 0.08))
            _add(arm, Vector3(0.12, 0.10, 0.11), C_ENEMY_ARMOR, Vector3(-0.08, -0.23, 0.08))
        "bow":
            _add(arm, Vector3(0.05, 0.70, 0.05), C_CLUB, Vector3(0, -0.30, 0.16))
            _add(arm, Vector3(0.03, 0.60, 0.02), C_BONE, Vector3(0, -0.30, 0.10))
            _add(arm, Vector3(0.16, 0.05, 0.05), C_BONE, Vector3(0, -0.58, 0.16))
            _add(arm, Vector3(0.16, 0.05, 0.05), C_BONE, Vector3(0, -0.02, 0.16))
        "staff":
            _add(arm, Vector3(0.07, 0.95, 0.07), C_CLUB, Vector3(0, -0.36, 0.10))
            _add(arm, Vector3(0.13, 0.05, 0.13), C_METAL, Vector3(0, -0.74, 0.10))
            _glow(arm, Vector3(0.18, 0.18, 0.18), Color("44ff44"), Color("22aa22"), Vector3(0, -0.84, 0.10), 1.8)
        "boulder":
            _add(arm, Vector3(0.34, 0.32, 0.34), Color("6a6258"), Vector3(0, -0.44, 0.08))
            _add(arm, Vector3(0.18, 0.05, 0.18), C_STEEL_DARK, Vector3(0, -0.58, 0.08))
        _:
            pass

## Type-specific layers sit outside the shared rig and leave its animation proxy keys
## untouched. They are intentionally a few bold shapes rather than a high-poly rewrite:
## a unit must read at tile scale, not only in a close-up.
static func _troll(root: Node3D) -> Dictionary:
    var d := _humanoid(root, C_TROLL, C_TROLL, Color("d63ab9"), "club")
    for p in [Vector2(0.37, 0.86), Vector2(-0.37, 0.86)]:
        _add(root, Vector3(0.24, 0.20, 0.34), C_ENEMY_ARMOR, Vector3(p.x, p.y, 0))
    _add(root, Vector3(0.46, 0.14, 0.13), C_DARK, Vector3(0, 1.00, 0.20))
    _add(root, Vector3(0.22, 0.10, 0.40), C_ENEMY_ARMOR, Vector3(0, 0.78, -0.24))
    return d

static func _rock_troll(root: Node3D) -> Dictionary:
    var d := _humanoid(root, C_ROCKTROLL, C_ROCKTROLL, Color("ad4eff"), "boulder")
    for p in [Vector3(0.36, 0.88, 0), Vector3(-0.36, 0.88, 0), Vector3(0, 0.80, -0.24)]:
        _add(root, Vector3(0.24, 0.20, 0.16), C_STEEL_DARK, p)
    _glow(root, Vector3(0.08, 0.16, 0.035), Color("9455d7"), Color("7022aa"), Vector3(0, 0.74, 0.21), 0.9)
    return d

static func _brute(root: Node3D) -> Dictionary:
    var d := _humanoid(root, C_BRUTE, C_BRUTE, Color("f04c8b"), "axe")
    for p in [Vector2(0.38, 0.89), Vector2(-0.38, 0.89)]:
        _add(root, Vector3(0.22, 0.18, 0.34), C_ENEMY_ARMOR, Vector3(p.x, p.y, 0))
    _add(root, Vector3(0.38, 0.12, 0.08), C_ENEMY_ARMOR, Vector3(0, 1.40, 0.02)) # iron brow
    _add(root, Vector3(0.20, 0.18, 0.08), C_ENEMY_ARMOR, Vector3(0, 0.78, 0.22))
    return d

static func _warboss(root: Node3D) -> Dictionary:
    var d := _humanoid(root, C_BOSS, C_BOSS, Color("f04c8b"), "axe")
    for p in [Vector2(0.39, 0.90), Vector2(-0.39, 0.90)]:
        _add(root, Vector3(0.26, 0.22, 0.38), C_ENEMY_ARMOR, Vector3(p.x, p.y, 0))
    _add(root, Vector3(0.42, 0.28, 0.07), C_ENEMY_ARMOR, Vector3(0, 0.76, 0.23))
    for sx in [0.15, -0.15]:
        _add(root, Vector3(0.07, 0.25, 0.07), C_TUSK, Vector3(sx, 1.49, 0))
    return d

static func _enemy_archer(root: Node3D) -> Dictionary:
    var d := _humanoid(root, C_EARCHER_BODY, C_EARCHER_HOOD, Color("c354e9"), "bow")
    _add(root, Vector3(0.50, 0.18, 0.50), C_EARCHER_HOOD, Vector3(0, 1.35, -0.02))
    _add(root, Vector3(0.15, 0.30, 0.12), C_CLUB, Vector3(0.23, 0.68, -0.20))
    for off in [-0.045, 0.0, 0.045]:
        _add(root, Vector3(0.02, 0.30, 0.02), C_WEAPON, Vector3(0.23 + off, 0.89, -0.20))
    return d

static func _healer(root: Node3D) -> Dictionary:
    var d := _humanoid(root, C_HEALER, C_HEALER, Color("68ec7d"), "staff")
    _add(root, Vector3(0.34, 0.08, 0.40), C_ENEMY_ARMOR, Vector3(0, 0.49, 0))
    _add(root, Vector3(0.18, 0.20, 0.10), C_CLUB, Vector3(0.28, 0.58, -0.18))
    _glow(root, Vector3(0.07, 0.12, 0.035), Color("75ff8f"), Color("26b94e"), Vector3(0, 0.79, 0.21), 0.8)
    return d

static func _wolf(root: Node3D) -> Dictionary:
    # The JS builds the wolf along +x and rotates the inner group; do the same so the
    # limb offsets can be copied straight across.
    var wi := Node3D.new()
    wi.rotation.y = -PI / 2
    root.add_child(wi)
    _add(wi, Vector3(0.65, 0.34, 0.38), C_WOLF_BODY, Vector3(0, 0.40, 0))
    _add(wi, Vector3(0.26, 0.36, 0.36), C_WOLF_BODY, Vector3(-0.22, 0.42, 0))
    _add(wi, Vector3(0.14, 0.10, 0.24), C_DARK, Vector3(0.26, 0.54, 0))          # mane
    _add(wi, Vector3(0.46, 0.05, 0.12), C_DARK, Vector3(-0.06, 0.58, 0))          # spine ridge
    _add(wi, Vector3(0.18, 0.08, 0.42), C_ENEMY_ARMOR, Vector3(-0.16, 0.43, 0))  # leather harness
    _add(wi, Vector3(0.28, 0.30, 0.26), C_WOLF_BODY, Vector3(0.30, 0.52, 0))     # neck
    var head := _add(wi, Vector3(0.36, 0.30, 0.34), C_WOLF_HEAD, Vector3(0.54, 0.64, 0))
    _add(wi, Vector3(0.26, 0.18, 0.24), C_WOLF_HEAD, Vector3(0.70, 0.53, 0))     # snout
    _add(wi, Vector3(0.04, 0.10, 0.04), C_TUSK, Vector3(0.73, 0.46, 0.07))
    _add(wi, Vector3(0.04, 0.10, 0.04), C_TUSK, Vector3(0.73, 0.46, -0.07))
    _add(wi, Vector3(0.09, 0.18, 0.07), C_WOLF_BODY, Vector3(0.46, 0.84, 0.14))  # ears
    _add(wi, Vector3(0.09, 0.18, 0.07), C_WOLF_BODY, Vector3(0.46, 0.84, -0.14))
    wi.add_child(_eye(Color("bb33ff"), Vector3(0.07, 0.07, 0.05), Vector3(0.68, 0.66, 0.12)))
    wi.add_child(_eye(Color("bb33ff"), Vector3(0.07, 0.07, 0.05), Vector3(0.68, 0.66, -0.12)))
    _add(wi, Vector3(0.13, 0.13, 0.30), C_WOLF_BODY, Vector3(-0.42, 0.50, 0))    # tail
    _add(wi, Vector3(0.08, 0.08, 0.34), C_DARK, Vector3(-0.50, 0.53, 0))          # tail tuft
    var legs: Array[MeshInstance3D] = []
    for d in [Vector2(0.22, 0.18), Vector2(0.22, -0.18), Vector2(-0.22, 0.18), Vector2(-0.22, -0.18)]:
        _add(wi, Vector3(0.14, 0.18, 0.14), C_WOLF_BODY, Vector3(d.x, 0.26, d.y))
        var lower := _add(wi, Vector3(0.12, 0.16, 0.12), C_WOLF_BODY, Vector3(d.x, 0.08, d.y))
        _add(wi, Vector3(0.16, 0.06, 0.20), C_WOLF_HEAD, Vector3(d.x, 0.03, d.y + 0.02))
        legs.append(lower)
    # front-left and back-right swing together, the classic diagonal gait
    return {"leg_l": legs[0], "leg_r": legs[3], "head": head, "leg_base": 0.08}

static func _skeleton(root: Node3D) -> Dictionary:
    var leg_l := _add(root, Vector3(0.10, 0.40, 0.10), C_BONE, Vector3(0.12, 0.20, 0))
    var leg_r := _add(root, Vector3(0.10, 0.40, 0.10), C_BONE, Vector3(-0.12, 0.20, 0))
    _add(root, Vector3(0.34, 0.42, 0.20), C_BONE, Vector3(0, 0.62, 0))           # ribcage
    for i in range(3):                                                            # ribs
        _add(root, Vector3(0.38, 0.04, 0.24), C_BONE, Vector3(0, 0.50 + i * 0.11, 0))
    _add(root, Vector3(0.10, 0.16, 0.10), C_BONE, Vector3(0, 0.92, 0))           # spine/neck
    var head := _add(root, Vector3(0.30, 0.28, 0.30), C_BONE, Vector3(0, 1.07, 0))
    _add(root, Vector3(0.24, 0.10, 0.22), C_BONE, Vector3(0, 0.92, 0.03))        # jaw
    root.add_child(_eye(Color("9900ff"), Vector3(0.07, 0.07, 0.04), Vector3(0.07, 1.10, 0.15)))
    root.add_child(_eye(Color("9900ff"), Vector3(0.07, 0.07, 0.04), Vector3(-0.07, 1.10, 0.15)))
    var arm_l := _add(root, Vector3(0.09, 0.42, 0.09), C_BONE, Vector3(0.26, 0.62, 0))
    var arm_r := _add(root, Vector3(0.09, 0.42, 0.09), C_BONE, Vector3(-0.26, 0.62, 0))
    _add(root, Vector3(0.40, 0.05, 0.12), C_BONE, Vector3(0, 0.81, 0))           # clavicles
    _add(arm_l, Vector3(0.12, 0.08, 0.12), C_BONE, Vector3(0, -0.25, 0))
    _add(arm_r, Vector3(0.12, 0.08, 0.12), C_BONE, Vector3(0, -0.25, 0))
    _add(arm_r, Vector3(0.06, 0.46, 0.06), C_WEAPON, Vector3(0, -0.42, 0.06))    # rusty blade
    return {"leg_l": leg_l, "leg_r": leg_r, "arm_l": arm_l, "arm_r": arm_r, "head": head, "leg_base": 0.20}

static func _spider(root: Node3D) -> Dictionary:
    _add(root, Vector3(0.46, 0.34, 0.52), C_SPIDER, Vector3(0, 0.34, -0.18))     # abdomen
    var mark := Voxel.box(Vector3(0.14, 0.06, 0.22), Color("880000"), Vector3(0, 0.51, -0.18))
    mark.material_override = Voxel.emissive_mat(Color("880000"), Color("440000"), 0.8)
    root.add_child(mark)
    _add(root, Vector3(0.28, 0.035, 0.08), Color("4b1010"), Vector3(0, 0.505, -0.32))
    var head := _add(root, Vector3(0.30, 0.26, 0.28), C_SPIDER, Vector3(0, 0.32, 0.20))
    for sx in [0.07, -0.07]:
        root.add_child(_eye(Color("aa33ff"), Vector3(0.05, 0.05, 0.04), Vector3(sx, 0.38, 0.34)))
        root.add_child(_eye(Color("aa33ff"), Vector3(0.04, 0.04, 0.03), Vector3(sx * 2.0, 0.34, 0.32)))
    _add(root, Vector3(0.07, 0.06, 0.10), C_TUSK, Vector3(0.06, 0.24, 0.33))     # fangs
    _add(root, Vector3(0.07, 0.06, 0.10), C_TUSK, Vector3(-0.06, 0.24, 0.33))
    # 8 legs, splayed. Two are handed back as the animation proxies.
    var legs: Array[MeshInstance3D] = []
    for i in range(8):
        var side: float = 1.0 if i < 4 else -1.0
        var zi: float = -0.24 + float(i % 4) * 0.16
        var upper := _add(root, Vector3(0.24, 0.05, 0.05), C_SPIDER, Vector3(side * 0.24, 0.32, zi))
        upper.rotation.z = side * -0.5
        var lower := _add(root, Vector3(0.05, 0.24, 0.05), C_SPIDER, Vector3(side * 0.38, 0.16, zi))
        if i % 2 == 0:
            _add(root, Vector3(0.20, 0.04, 0.04), C_DARK, Vector3(side * 0.49, 0.08, zi))
        legs.append(lower)
    return {"leg_l": legs[0], "leg_r": legs[4], "head": head, "leg_base": 0.16, "all_legs": legs}

static func _cyclops(root: Node3D) -> Dictionary:
    var d := _humanoid(root, C_CYCLOPS, C_CYCLOPS, Color("dd33ff"), "club")
    # One big central eye replaces the pair the humanoid just added.
    for c in root.get_children():
        if c is MeshInstance3D and c.position.is_equal_approx(Vector3(0.11, 1.22, 0.22)):
            c.queue_free()
        elif c is MeshInstance3D and c.position.is_equal_approx(Vector3(-0.11, 1.22, 0.22)):
            c.queue_free()
    root.add_child(_eye(Color("dd33ff"), Vector3(0.20, 0.20, 0.06), Vector3(0, 1.22, 0.23)))
    _add(root, Vector3(0.30, 0.06, 0.10), C_CYCLOPS, Vector3(0, 1.36, 0.22))     # heavy brow
    _add(root, Vector3(0.64, 0.08, 0.44), C_ENEMY_ARMOR, Vector3(0, 0.50, 0))    # broad war belt
    _add(root, Vector3(0.12, 0.16, 0.12), C_TUSK, Vector3(0.22, 1.02, 0.20))
    _add(root, Vector3(0.12, 0.16, 0.12), C_TUSK, Vector3(-0.22, 1.02, 0.20))
    return d

static func _exploder(root: Node3D) -> Dictionary:
    var d := _humanoid(root, C_EXPLODER, C_EXPLODER, Color("ffcc00"), "")
    # Powder keg strapped to the back — the tell that this one detonates.
    _add(root, Vector3(0.38, 0.36, 0.30), Color("4a2a10"), Vector3(0, 0.72, -0.30))
    for y in [0.62, 0.82]:
        _add(root, Vector3(0.42, 0.05, 0.34), C_METAL, Vector3(0, y, -0.30))
    var fuse := Voxel.box(Vector3(0.08, 0.08, 0.08), Color("ffaa00"), Vector3(0, 0.96, -0.30))
    fuse.material_override = Voxel.emissive_mat(Color("ffaa00"), Color("ff4400"), 2.5)
    root.add_child(fuse)
    _add(root, Vector3(0.08, 0.32, 0.05), C_GOLD, Vector3(0, 0.72, -0.47))       # keg clasp
    d["fuse"] = fuse
    return d

static func _orc_mage(root: Node3D) -> Dictionary:
    var d := _humanoid(root, C_ORCMAGE_ROBE, C_ORCMAGE_SKIN, Color("aa22ff"), "staff")
    _add(root, Vector3(0.52, 0.14, 0.52), C_ORCMAGE_HAT, Vector3(0, 1.42, 0))    # brim
    _add(root, Vector3(0.30, 0.26, 0.30), C_ORCMAGE_HAT, Vector3(0, 1.60, 0))    # cone
    _add(root, Vector3(0.16, 0.20, 0.16), C_ORCMAGE_HAT, Vector3(0, 1.80, 0))
    _add(root, Vector3(0.50, 0.42, 0.14), C_ORCMAGE_ROBE, Vector3(0, 0.32, 0))   # robe skirt
    _gold_trim(root, Vector3(0.54, 0.05, 0.56), Vector3(0, 1.48, 0))
    _glow(root, Vector3(0.08, 0.08, 0.08), Color("e23d2d"), Color("a81212"), Vector3(0, 1.74, 0.17), 1.7)
    return d

## Level bosses reuse the orc silhouette at scale, with their own body/eye colours.
static func build_boss(root: Node3D, body_hex: String, eye_hex: String) -> Dictionary:
    var body := Color(body_hex)
    var d := _humanoid(root, body, body, Color(eye_hex), "axe")
    for pos in [Vector3(0.44, 0.88, 0), Vector3(-0.44, 0.88, 0)]:
        _add(root, Vector3(0.26, 0.22, 0.44), C_METAL, pos)                      # pauldrons
    _add(root, Vector3(0.46, 0.44, 0.08), C_METAL, Vector3(0, 0.72, 0.22))       # chestplate
    _add(root, Vector3(0.20, 0.14, 0.05), C_GOLD, Vector3(0, 0.74, 0.275))       # heraldic plate
    for sx in [0.16, -0.16]:                                                     # crown horns
        _add(root, Vector3(0.08, 0.26, 0.08), C_TUSK, Vector3(sx, 1.48, 0))
    return d

# ═════════════════════════════════════════════════════════════════════════════
#  DEFENDERS
# ═════════════════════════════════════════════════════════════════════════════

static func build_defender(type: String, root: Node3D) -> Dictionary:
    match type:
        "wall":      return _wall(root)
        "tower":     return _tower(root)
        "catapult":  return _catapult(root)
        "ballista":  return _ballista(root)
        "mage":      return _mage_tower(root)
        "spiketrap": return _spiketrap(root)
        "swordsman": return _soldier(root, C_SW_TUNIC, C_SW_ARMOR, C_SW_HELMET, "sword")
        "knight":    return _soldier(root, C_SW_ARMOR, C_METAL, C_SW_GOLD, "greatsword")
        "spearman":  return _soldier(root, C_SP_TUNIC, C_SP_LEATHER, C_SP_HELMET, "spear")
        "archer":    return _soldier(root, C_ARC_TEAL, C_ARC_BELT, C_ARC_HOOD, "bow")
        _:           return _tower(root)

static func _wall(root: Node3D) -> Dictionary:
    # A small gatehouse rather than a plain cube: darker foundation, staggered courses,
    # capstone and four teeth keep the silhouette readable at the normal camera height.
    _add(root, Vector3(0.98, 0.16, 0.98), C_STONE_DARK, Vector3(0, 0.08, 0))
    _add(root, Vector3(0.88, 0.08, 0.88), C_STONE_LIGHT, Vector3(0, 0.18, 0))
    # Staggered courses so the stonework reads as blocks rather than one slab.
    for i in range(3):
        var y: float = 0.34 + i * 0.30
        var off: float = 0.12 if i % 2 == 0 else -0.12
        _add(root, Vector3(0.46, 0.28, 0.92), C_WALL_STONE, Vector3(0.24 + off * 0.2, y, 0))
        _add(root, Vector3(0.46, 0.28, 0.92), C_WALL_STONE, Vector3(-0.24 + off * 0.2, y, 0))
        _add(root, Vector3(0.92, 0.022, 0.94), C_STONE_DARK, Vector3(0, y - 0.145, 0.005))
    _add(root, Vector3(0.98, 0.10, 0.98), C_STONE_LIGHT, Vector3(0, 1.29, 0))
    for p in [Vector2(-0.34, -0.34), Vector2(-0.34, 0.34), Vector2(0.34, -0.34), Vector2(0.34, 0.34)]:
        _add(root, Vector3(0.22, 0.22, 0.22), C_WALL_STONE, Vector3(p.x, 1.45, p.y))
    _add(root, Vector3(0.20, 0.30, 0.025), C_ROYAL_BLUE, Vector3(0, 1.08, 0.483))
    _gold_trim(root, Vector3(0.13, 0.05, 0.035), Vector3(0, 1.19, 0.500))
    return {}

static func _tower(root: Node3D) -> Dictionary:
    # Crystal Tower — a three-step plinth and four blue buttresses frame the cyan
    # crystal, so it reads as an intentional arcane landmark rather than a stone post.
    _add(root, Vector3(1.00, 0.12, 1.00), C_STONE_DARK, Vector3(0, 0.06, 0))
    _add(root, Vector3(0.90, 0.12, 0.90), C_TOWER_BASE, Vector3(0, 0.16, 0))
    _add(root, Vector3(0.80, 0.08, 0.80), C_STONE_LIGHT, Vector3(0, 0.26, 0))
    _add(root, Vector3(0.68, 1.34, 0.68), Color("647889"), Vector3(0, 0.95, 0))
    _add(root, Vector3(0.72, 0.07, 0.72), C_ROYAL_BLUE, Vector3(0, 0.54, 0))
    _gold_trim(root, Vector3(0.74, 0.05, 0.74), Vector3(0, 1.27, 0))
    for c in [Vector2(0.34, 0.34), Vector2(0.34, -0.34), Vector2(-0.34, 0.34), Vector2(-0.34, -0.34)]:
        _add(root, Vector3(0.15, 1.54, 0.15), C_TOWER_BASE, Vector3(c.x, 1.03, c.y))
        _add(root, Vector3(0.19, 0.06, 0.19), C_GOLD, Vector3(c.x, 1.50, c.y))
    _add(root, Vector3(0.94, 0.14, 0.94), C_TOWER_ROOF, Vector3(0, 1.66, 0))     # parapet
    for p in [Vector2(-0.31, -0.31), Vector2(-0.31, 0.31), Vector2(0.31, -0.31), Vector2(0.31, 0.31)]:
        _add(root, Vector3(0.18, 0.20, 0.18), C_TOWER_BASE, Vector3(p.x, 1.81, p.y))
    _add(root, Vector3(0.42, 0.07, 0.42), C_GOLD, Vector3(0, 1.78, 0))
    # The muzzle origin intentionally remains at (0, 1.98, 0): firing and HP-bar
    # placement already use that design-space anchor.
    var muzzle := _glow(root, Vector3(0.30, 0.34, 0.30), C_CRYSTAL, Color("009fe3"), Vector3(0, 1.98, 0), 1.85)
    _glow(root, Vector3(0.16, 0.16, 0.16), Color("8ff7ff"), C_TEAL, Vector3(0, 2.20, 0), 1.45)
    _glow(root, Vector3(0.06, 0.08, 0.30), C_TEAL, Color("0088c8"), Vector3(0, 1.92, 0.29), 0.95)
    return {"muzzle": muzzle}

static func _catapult(root: Node3D) -> Dictionary:
    # Wide timber carriage with iron-rimmed wheels and a visibly counterweighted arm.
    _add(root, Vector3(1.00, 0.12, 0.90), C_WOOD_DARK, Vector3(0, 0.06, 0))
    _add(root, Vector3(0.84, 0.12, 0.74), C_CAT_WOOD, Vector3(0, 0.15, -0.02))
    _add(root, Vector3(0.76, 0.06, 0.18), C_WOOD_LIGHT, Vector3(0, 0.25, -0.25))
    for sx in [0.32, -0.32]:                                                     # frame
        _add(root, Vector3(0.12, 0.62, 0.12), C_CAT_WOOD, Vector3(sx, 0.42, -0.18))
        _add(root, Vector3(0.17, 0.06, 0.17), C_STEEL_DARK, Vector3(sx, 0.68, -0.18))
    for sz in [0.34, -0.34]:                                                     # wheels
        _add(root, Vector3(0.10, 0.38, 0.38), C_STEEL_DARK, Vector3(0.40, 0.20, sz))
        _add(root, Vector3(0.10, 0.38, 0.38), C_STEEL_DARK, Vector3(-0.40, 0.20, sz))
        _add(root, Vector3(0.13, 0.13, 0.13), C_GOLD, Vector3(0.455, 0.20, sz))
        _add(root, Vector3(0.13, 0.13, 0.13), C_GOLD, Vector3(-0.455, 0.20, sz))
    var arm := Node3D.new()
    arm.position = Vector3(0, 0.70, -0.18)
    root.add_child(arm)
    _add(arm, Vector3(0.12, 0.12, 0.78), C_CAT_WOOD, Vector3(0, 0, 0.34))        # throwing arm
    _add(arm, Vector3(0.20, 0.06, 0.12), C_GOLD, Vector3(0, 0.02, 0.10))          # arm binding
    _add(arm, Vector3(0.26, 0.10, 0.26), C_STEEL_DARK, Vector3(0, 0.06, 0.70))   # bucket
    _add(arm, Vector3(0.18, 0.16, 0.18), Color("766047"), Vector3(0, 0.14, 0.70)) # stone
    _add(arm, Vector3(0.24, 0.22, 0.24), C_ENEMY_ARMOR, Vector3(0, -0.10, -0.30)) # counterweight
    return {"muzzle": arm, "arm": arm}

static func _ballista(root: Node3D) -> Dictionary:
    _add(root, Vector3(0.98, 0.12, 0.86), C_WOOD_DARK, Vector3(0, 0.06, 0))
    _add(root, Vector3(0.76, 0.12, 0.70), C_CAT_WOOD, Vector3(0, 0.15, -0.03))
    for sx in [0.30, -0.30]:
        _add(root, Vector3(0.12, 0.70, 0.12), C_CAT_WOOD, Vector3(sx, 0.46, 0))
        _add(root, Vector3(0.17, 0.05, 0.17), C_GOLD, Vector3(sx, 0.74, 0))
    _add(root, Vector3(0.18, 0.16, 1.10), C_WOOD_LIGHT, Vector3(0, 0.86, 0))     # stock
    _add(root, Vector3(0.24, 0.10, 0.34), C_STEEL_DARK, Vector3(0, 0.84, -0.17)) # receiver
    _add(root, Vector3(1.24, 0.10, 0.10), C_CAT_WOOD, Vector3(0, 0.90, 0.28))    # bow arms
    _add(root, Vector3(1.34, 0.026, 0.026), C_BONE, Vector3(0, 0.90, 0.47))      # bow string
    _gold_trim(root, Vector3(0.30, 0.05, 0.14), Vector3(0, 0.98, 0.28))
    _add(root, Vector3(0.08, 0.08, 0.58), C_WEAPON, Vector3(0, 0.93, 0.43))      # loaded bolt
    # Preserve the old muzzle centre; projectile trails and muzzle flashes use it.
    var muzzle := _add(root, Vector3(0.10, 0.10, 0.52), C_WEAPON, Vector3(0, 0.90, 0.50))
    _add(root, Vector3(0.18, 0.045, 0.12), C_GOLD, Vector3(0, 0.90, 0.17))
    return {"muzzle": muzzle}

static func _mage_tower(root: Node3D) -> Dictionary:
    # A sapphire obelisk: blue masonry grounds the teal rune-light so the mage reads
    # as allied magic at a glance, without stealing the crystal tower's silhouette.
    _add(root, Vector3(0.96, 0.12, 0.96), C_STONE_DARK, Vector3(0, 0.06, 0))
    _add(root, Vector3(0.84, 0.12, 0.84), C_MAGE_ROBE, Vector3(0, 0.16, 0))
    _add(root, Vector3(0.60, 1.22, 0.60), C_MAGE_PURPLE, Vector3(0, 0.83, 0))
    for p in [Vector2(-0.29, -0.29), Vector2(-0.29, 0.29), Vector2(0.29, -0.29), Vector2(0.29, 0.29)]:
        _add(root, Vector3(0.10, 1.34, 0.10), C_ROYAL_BLUE, Vector3(p.x, 0.86, p.y))
    _add(root, Vector3(0.84, 0.12, 0.84), C_MAGE_ROBE, Vector3(0, 1.50, 0))
    _gold_trim(root, Vector3(0.64, 0.05, 0.64), Vector3(0, 1.57, 0))
    for i in range(3):                                                            # spire
        _add(root, Vector3(0.38 - i * 0.10, 0.22, 0.38 - i * 0.10), C_MAGE_PURPLE, Vector3(0, 1.66 + i * 0.22, 0))
    _glow(root, Vector3(0.045, 0.30, 0.045), C_TEAL, Color("008fae"), Vector3(0, 0.85, 0.315), 1.05)
    _glow(root, Vector3(0.045, 0.30, 0.045), C_TEAL, Color("008fae"), Vector3(0, 0.85, -0.315), 1.05)
    # Retain the established muzzle origin at 2.36 for both firing and the HP-bar.
    var muzzle := _glow(root, Vector3(0.26, 0.30, 0.26), Color("72dfff"), Color("1ea5ef"), Vector3(0, 2.36, 0), 2.0)
    _glow(root, Vector3(0.10, 0.10, 0.10), Color("dcfaff"), C_TEAL, Vector3(0, 2.58, 0), 1.25)
    return {"muzzle": muzzle}

static func _spiketrap(root: Node3D) -> Dictionary:
    _add(root, Vector3(0.94, 0.08, 0.94), C_WOOD_DARK, Vector3(0, 0.04, 0))
    _add(root, Vector3(0.82, 0.035, 0.82), C_CAT_WOOD, Vector3(0, 0.10, 0))
    for x in [-0.28, 0.0, 0.28]:
        for z in [-0.28, 0.0, 0.28]:
            _add(root, Vector3(0.10, 0.26, 0.10), C_WEAPON, Vector3(x, 0.20, z))
    _gold_trim(root, Vector3(0.66, 0.035, 0.035), Vector3(0, 0.105, 0.31))
    return {}

## Foot soldiers. Same skeleton as the horde humanoid but human proportions and a
## helmet — the JS builds all four from one buildSoldier() with a type switch.
static func _soldier(root: Node3D, tunic: Color, trim: Color, helm: Color, weapon: String) -> Dictionary:
    # These five returned nodes are the animation contract. Their origin/extent remains
    # intentionally unchanged; plates, boots and weapons are children so they follow the
    # established walk and strike pivots.
    var leg_l := _add(root, Vector3(0.16, 0.34, 0.16), trim, Vector3(0.11, 0.17, 0))
    var leg_r := _add(root, Vector3(0.16, 0.34, 0.16), trim, Vector3(-0.11, 0.17, 0))
    _add(leg_l, Vector3(0.19, 0.08, 0.25), C_WOOD_DARK, Vector3(0, -0.15, 0.05))
    _add(leg_r, Vector3(0.19, 0.08, 0.25), C_WOOD_DARK, Vector3(0, -0.15, 0.05))
    _add(leg_l, Vector3(0.18, 0.045, 0.18), C_GOLD, Vector3(0, 0.02, 0))
    _add(leg_r, Vector3(0.18, 0.045, 0.18), C_GOLD, Vector3(0, 0.02, 0))
    _add(root, Vector3(0.40, 0.46, 0.28), tunic, Vector3(0, 0.57, 0))            # torso
    _add(root, Vector3(0.44, 0.10, 0.32), trim, Vector3(0, 0.38, 0))             # belt
    _add(root, Vector3(0.28, 0.18, 0.035), trim, Vector3(0, 0.63, 0.158))        # chest plate
    _gold_trim(root, Vector3(0.12, 0.05, 0.045), Vector3(0, 0.49, 0.175))
    _add(root, Vector3(0.18, 0.20, 0.035), tunic, Vector3(0, 0.29, -0.155))      # tabard tail
    var head := _add(root, Vector3(0.30, 0.30, 0.30), C_SKIN, Vector3(0, 0.95, 0))
    _add(root, Vector3(0.34, 0.20, 0.34), helm, Vector3(0, 1.06, 0))             # helmet
    _add(root, Vector3(0.30, 0.10, 0.06), Color("080c18"), Vector3(0, 0.98, 0.16))  # visor slit
    _gold_trim(root, Vector3(0.22, 0.035, 0.05), Vector3(0, 1.075, 0.178))
    var arm_l := _add(root, Vector3(0.14, 0.38, 0.14), tunic, Vector3(0.29, 0.55, 0))
    var arm_r := _add(root, Vector3(0.14, 0.38, 0.14), tunic, Vector3(-0.29, 0.55, 0))
    _add(arm_l, Vector3(0.18, 0.055, 0.18), trim, Vector3(0, -0.11, 0))
    _add(arm_r, Vector3(0.18, 0.055, 0.18), trim, Vector3(0, -0.11, 0))
    match weapon:
        "sword":
            _add(arm_r, Vector3(0.07, 0.46, 0.07), C_WEAPON, Vector3(0, -0.40, 0.04))
            _add(arm_r, Vector3(0.18, 0.06, 0.08), C_SW_GOLD, Vector3(0, -0.20, 0.04))
            _add(arm_l, Vector3(0.06, 0.42, 0.34), C_SW_SHIELD, Vector3(0.10, -0.16, 0))
            _add(arm_l, Vector3(0.075, 0.15, 0.20), C_ROYAL_BLUE, Vector3(0.135, -0.16, 0))
            _gold_trim(arm_l, Vector3(0.085, 0.07, 0.10), Vector3(0.145, -0.16, 0.02))
            _add(root, Vector3(0.07, 0.20, 0.07), C_SW_GOLD, Vector3(0, 1.23, 0)) # short crest
        "greatsword":
            _add(arm_r, Vector3(0.10, 0.72, 0.10), C_WEAPON, Vector3(0, -0.52, 0.04))
            _add(arm_r, Vector3(0.26, 0.07, 0.10), C_SW_GOLD, Vector3(0, -0.20, 0.04))
            _add(root, Vector3(0.42, 0.18, 0.34), C_SW_ARMOR, Vector3(0, 0.76, -0.08)) # knight mantle
            _add(root, Vector3(0.16, 0.15, 0.24), C_SW_ARMOR, Vector3(0.29, 0.78, 0))
            _add(root, Vector3(0.16, 0.15, 0.24), C_SW_ARMOR, Vector3(-0.29, 0.78, 0))
            _add(root, Vector3(0.12, 0.22, 0.12), C_SW_GOLD, Vector3(0, 1.24, 0))    # crest
            _gold_trim(root, Vector3(0.20, 0.05, 0.035), Vector3(0, 0.78, 0.18))
        "spear":
            _add(arm_r, Vector3(0.06, 1.10, 0.06), C_CAT_WOOD, Vector3(0, -0.44, 0.08))
            _add(arm_r, Vector3(0.08, 0.24, 0.08), C_SPEARHEAD, Vector3(0, -1.06, 0.08))
            _add(arm_l, Vector3(0.06, 0.30, 0.25), C_ROYAL_BLUE, Vector3(0.10, -0.14, 0))
            _gold_trim(root, Vector3(0.28, 0.04, 0.04), Vector3(0, 0.75, 0.16))
        "bow":
            _add(arm_l, Vector3(0.05, 0.68, 0.05), C_CAT_WOOD, Vector3(0.02, -0.30, 0.12))
            _add(arm_l, Vector3(0.03, 0.58, 0.02), C_BONE, Vector3(0.02, -0.30, 0.06))
            _add(root, Vector3(0.16, 0.30, 0.12), C_ARC_BELT, Vector3(-0.20, 0.66, -0.18))  # quiver
            _add(root, Vector3(0.34, 0.34, 0.055), C_ARC_TEAL, Vector3(0, 0.63, -0.17))      # cloak
            _gold_trim(root, Vector3(0.24, 0.04, 0.035), Vector3(0, 0.76, 0.175))
            for off in [-0.045, 0.0, 0.045]:
                _add(root, Vector3(0.022, 0.29, 0.022), C_WEAPON, Vector3(-0.20 + off, 0.88, -0.18))
        _:
            pass
    return {"leg_l": leg_l, "leg_r": leg_r, "arm_l": arm_l, "arm_r": arm_r, "head": head, "leg_base": 0.17}
