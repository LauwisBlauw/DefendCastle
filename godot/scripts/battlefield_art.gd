class_name BattlefieldArt
extends RefCounted
## Presentation-only builders. They never reserve tiles or alter the simulation.

const TERRAIN_SHADER = preload("res://shaders/terrain.gdshader")
const WATER_SHADER = preload("res://shaders/water.gdshader")
const PALETTES := [
    {"dark": "526b3b", "light": "809353", "fleck": "bac37e", "road": "b8a787", "road_dark": "88795f", "sky": "283f43", "sun": "ffe2ad", "ambient": "a3c0c3", "leaf": "53744a"},
    {"dark": "ae8051", "light": "d6b57c", "fleck": "e7ca8e", "road": "dcc6a0", "road_dark": "aa906b", "sky": "514c52", "sun": "ffe2b8", "ambient": "b7bcca", "leaf": "73834a"},
    {"dark": "a9c3c9", "light": "dfebe3", "fleck": "f5f3e6", "road": "a9b6b9", "road_dark": "778d9b", "sky": "344b61", "sun": "e1edff", "ambient": "acccd8", "leaf": "93b7b2"},
    {"dark": "443c38", "light": "625445", "fleck": "95654a", "road": "a08976", "road_dark": "5b4d49", "sky": "352b3b", "sun": "ffc599", "ambient": "b6a8c6", "leaf": "805944"},
    {"dark": "3b3e4c", "light": "57576b", "fleck": "8581a0", "road": "9593a5", "road_dark": "656278", "sky": "252738", "sun": "ddc9fa", "ambient": "aaaad8", "leaf": "6b607f"},
    {"dark": "392f49", "light": "665571", "fleck": "aa81b1", "road": "9e8ba7", "road_dark": "62526b", "sky": "242333", "sun": "edd0ff", "ambient": "baadde", "leaf": "826282"},
]
static var _crowns: Dictionary = {}
static var _cones: Dictionary = {}

static func palette(biome: int) -> Dictionary:
    return PALETTES[clampi(biome, 0, PALETTES.size() - 1)]

static func terrain_material(biome: int, road := false) -> ShaderMaterial:
    var p := palette(biome)
    var mat := ShaderMaterial.new()
    mat.shader = TERRAIN_SHADER
    mat.set_shader_parameter("earth_dark", Color(p["road_dark"] if road else p["dark"]))
    mat.set_shader_parameter("earth_light", Color(p["road"] if road else p["light"]))
    mat.set_shader_parameter("fleck_color", Color(p["fleck"]))
    mat.set_shader_parameter("road_surface", road)
    return mat

static func _box(g: Node3D, size: Vector3, color: Color, pos: Vector3) -> MeshInstance3D:
    var n := Voxel.box(size, color, pos)
    g.add_child(n)
    return n

## An earth-and-slate cutaway grounds the battlefield in a tangible miniature.
static func foundation(biome: int) -> Node3D:
    var root := Node3D.new()
    root.name = "DioramaFoundation"
    var p := palette(biome)
    var center := Vector3(35.5, 0, 26.5)
    var backdrop := MeshInstance3D.new()
    var stage := PlaneMesh.new()
    stage.size = Vector2(600, 600)
    backdrop.mesh = stage
    backdrop.position = center + Vector3(0, -4.0, 0)
    var stage_mat := ShaderMaterial.new()
    stage_mat.shader = preload("res://shaders/diorama_stage.gdshader")
    stage_mat.set_shader_parameter("stage_color", Color(p["sky"]).lightened(0.05))
    backdrop.material_override = stage_mat
    root.add_child(backdrop)
    _box(root, Vector3(74, 0.50, 56), Color(p["dark"]).darkened(0.18), center + Vector3(0, -0.28, 0))
    _box(root, Vector3(73.6, 1.2, 55.6), Color("746450"), center + Vector3(0, -1.10, 0))
    _box(root, Vector3(73.1, 1.5, 55.1), Color("454951"), center + Vector3(0, -2.35, 0))
    _box(root, Vector3(73.8, 0.35, 55.8), Color("30383f"), center + Vector3(0, -3.25, 0))
    # Cracked rock strata along the visible sides, one mesh per repeated block size.
    for x in range(0, 74, 3):
        var tone := Color("58606a") if x % 2 == 0 else Color("4c545e")
        _box(root, Vector3(2.85, 0.63, 0.13), tone, Vector3(x - 0.5, -2.13, 54.12))
    for z in range(0, 55, 3):
        _box(root, Vector3(0.13, 0.7, 2.86), Color("505863"), Vector3(-1.12, -2.25, z))
        _box(root, Vector3(0.13, 0.7, 2.86), Color("505863"), Vector3(72.12, -2.25, z))
    return root

static func _cone(radius: float, height: float, color: Color, pos: Vector3, sides := 8) -> MeshInstance3D:
    var key := "%s:%s:%s" % [radius, height, sides]
    if not _cones.has(key):
        var mesh := CylinderMesh.new()
        mesh.top_radius = 0.0
        mesh.bottom_radius = radius
        mesh.height = height
        mesh.radial_segments = sides
        mesh.rings = 1
        _cones[key] = mesh
    var n := MeshInstance3D.new()
    n.mesh = _cones[key]
    n.material_override = Voxel.mat(color)
    n.position = pos
    return n

## Hard face normals give each crown the readable planes of a painted miniature.
static func _crown_mesh() -> ArrayMesh:
    if _crowns.has("oak"):
        return _crowns["oak"]
    var verts := PackedVector3Array()
    var normals := PackedVector3Array()
    var rings := [Vector2(0.0, -0.75), Vector2(0.83, -0.42), Vector2(1.0, 0.15), Vector2(0.61, 0.67), Vector2(0.0, 0.94)]
    for j in range(rings.size() - 1):
        for i in range(7):
            var a := float(i) * TAU / 7.0
            var b := float(i + 1) * TAU / 7.0
            var v0 := Vector3(cos(a) * rings[j].x, rings[j].y, sin(a) * rings[j].x)
            var v1 := Vector3(cos(b) * rings[j].x, rings[j].y, sin(b) * rings[j].x)
            var v2 := Vector3(cos(b) * rings[j + 1].x, rings[j + 1].y, sin(b) * rings[j + 1].x)
            var v3 := Vector3(cos(a) * rings[j + 1].x, rings[j + 1].y, sin(a) * rings[j + 1].x)
            for tri in [[v0, v1, v2], [v0, v2, v3]]:
                var normal: Vector3 = (tri[2] - tri[0]).cross(tri[1] - tri[0]).normalized()
                for v in tri:
                    verts.append(v)
                    normals.append(normal)
    var arrays := []
    arrays.resize(Mesh.ARRAY_MAX)
    arrays[Mesh.ARRAY_VERTEX] = verts
    arrays[Mesh.ARRAY_NORMAL] = normals
    var mesh := ArrayMesh.new()
    mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
    _crowns["oak"] = mesh
    return mesh

static func tree(kind: String, biome: int, seed_value: int) -> Node3D:
    var g := Node3D.new()
    var rng := RandomNumberGenerator.new()
    rng.seed = seed_value
    var foliage := Color(palette(biome)["leaf"]).lightened(float(posmod(seed_value, 4)) * 0.035)
    var bark := Color("665342")
    _box(g, Vector3(0.24, 1.55, 0.24), bark, Vector3(0, 0.775, 0))
    match kind:
        "pine":
            for i in range(3):
                g.add_child(_cone(0.94 - i * 0.20, 1.3 - i * 0.15, foliage.lightened(i * 0.06), Vector3(0, 1.3 + i * 0.60, 0), 7))
            if biome == 2:
                g.add_child(_cone(0.62, 0.80, Color("e2eee6"), Vector3(0, 2.80, 0), 7))
        "cactus":
            _box(g, Vector3(0.42, 2.0, 0.38), foliage, Vector3(0, 1.0, 0))
            for side in [-1, 1]:
                _box(g, Vector3(0.64, 0.25, 0.25), foliage, Vector3(side * 0.38, 0.9 + side * 0.15, 0))
                _box(g, Vector3(0.22, 0.72, 0.24), foliage.lightened(0.07), Vector3(side * 0.64, 1.20 + side * 0.15, 0))
            _box(g, Vector3(0.21, 0.13, 0.21), Color("e5ad89"), Vector3(0, 2.05, 0))
        "deadtree":
            for side in [-1, 1]:
                var branch := _box(g, Vector3(0.17, 1.1, 0.18), bark, Vector3(side * 0.32, 1.46, 0))
                branch.rotation.z = side * -0.6
                _box(g, Vector3(0.13, 0.40, 0.12), bark.lightened(0.08), Vector3(side * 0.60, 1.98, 0))
            if biome >= 3:
                var crystal := _cone(0.23, 0.72, foliage.lightened(0.20), Vector3(0.39, 0.32, 0.2), 5)
                crystal.material_override = Voxel.emissive_mat(foliage, Color("d79fe8"), 0.5)
                g.add_child(crystal)
        "mushroom":
            for i in range(3):
                var off := Vector3((i - 1) * 0.32, 0, (i % 2) * 0.28)
                var h := 0.7 + i * 0.15
                _box(g, Vector3(0.16, h, 0.16), Color("b8ab91"), off + Vector3(0, h * 0.5, 0))
                g.add_child(_cone(0.54 - i * 0.07, 0.35, foliage.lightened(i * 0.09), off + Vector3(0, h, 0), 7))
        "palm":
            for i in range(6):
                var leaf := _box(g, Vector3(0.27, 0.12, 1.3), foliage, Vector3(sin(i * TAU / 6.0) * 0.45, 1.8, cos(i * TAU / 6.0) * 0.45))
                leaf.rotation = Vector3(0.20, i * TAU / 6.0, 0)
        _:
            for i in range(3):
                var n := MeshInstance3D.new()
                n.mesh = _crown_mesh()
                n.material_override = Voxel.mat(foliage.lightened(i * 0.055))
                var s := 0.82 if i == 0 else 0.61
                n.scale = Vector3(s, s * 0.88, s)
                n.position = Vector3((i - 1) * 0.39, 1.76 + (0.46 if i == 1 else 0), (i % 2) * 0.10)
                n.rotation.y = rng.randf() * TAU
                g.add_child(n)
    # Root flare and a few small plants finish the silhouette at ground level.
    for i in range(3):
        var root := _box(g, Vector3(0.13, 0.12, 0.53), bark, Vector3(0, 0.05, 0))
        root.rotation.y = i * TAU / 3.0
    return g

static func castle() -> Node3D:
    var g := Node3D.new()
    g.name = "Citadel"
    # Keep the landmark inside the reserved keep area.  The castle is deliberately
    # a presentation layer, so its footprint must never swallow legal build tiles.
    g.position = Vector3(68.6, 0, 27)
    g.scale = Vector3(0.72, 1.0, 0.50)
    var stone := Color("a4afa9")
    var pale := Color("c7c9b4")
    var shadow := Color("62777c")
    var roof := Color("355764")
    var gold := Color("d7b674")
    _box(g, Vector3(6.5, 0.35, 16.3), shadow, Vector3(0, 0.175, 0))
    _box(g, Vector3(5.8, 4.3, 14.5), stone, Vector3(0.1, 2.3, 0))
    for y in [0.8, 2.6, 4.25]:
        _box(g, Vector3(5.95, 0.14, 14.7), pale, Vector3(0.1, y, 0))
    # Thin stone courses catch light on the gate-facing wall without giant flat planes.
    for z in range(-6, 7, 2):
        _box(g, Vector3(0.18, 3.6, 0.40), pale, Vector3(-2.85, 2.25, z))
    for z in [-6.0, 6.0]:
        _box(g, Vector3(2.45, 6.1, 2.65), pale, Vector3(-1.5, 3.25, z))
        _box(g, Vector3(2.68, 0.35, 2.88), shadow, Vector3(-1.5, 5.95, z))
        _box(g, Vector3(2.72, 0.18, 2.94), gold, Vector3(-1.5, 6.20, z))
        g.add_child(_cone(2.05, 2.4, roof, Vector3(-1.5, 7.5, z), 4))
        _box(g, Vector3(0.09, 1.0, 0.09), gold, Vector3(-1.5, 9.0, z))
        _box(g, Vector3(0.06, 0.60, 0.9), Color("488d94"), Vector3(-1.5, 9.0, z + 0.42))
        for wy in [2.7, 4.4]:
            _box(g, Vector3(0.04, 0.74, 0.38), Color("344b51"), Vector3(-2.74, wy, z))
            _box(g, Vector3(0.055, 0.44, 0.16), gold, Vector3(-2.77, wy, z))
    # A tall central keep provides the landmark visible at overview zoom.
    _box(g, Vector3(3.25, 7.5, 4.4), stone, Vector3(1.0, 4.0, 0))
    _box(g, Vector3(3.48, 0.32, 4.65), pale, Vector3(1.0, 7.80, 0))
    var keep_roof := _cone(2.8, 2.7, roof, Vector3(1.0, 9.3, 0), 4)
    keep_roof.scale.z = 1.18
    g.add_child(keep_roof)
    _box(g, Vector3(0.10, 1.4, 0.10), gold, Vector3(1, 11.0, 0))
    _box(g, Vector3(0.07, 0.8, 1.2), Color("488d94"), Vector3(1, 11.1, 0.55))
    # Three actual gate markers line up with the three incoming roads.
    for z in [-3.0, 0.0, 3.0]:
        _box(g, Vector3(0.23, 2.25, 1.50), Color("293c42"), Vector3(-2.9, 1.28, z))
        _box(g, Vector3(0.27, 1.8, 1.13), Color("6b5242"), Vector3(-3.04, 1.10, z))
        for dz in [-0.72, 0.72]:
            _box(g, Vector3(0.43, 2.40, 0.25), pale, Vector3(-3.0, 1.35, z + dz))
        _box(g, Vector3(0.42, 0.26, 1.70), pale, Vector3(-3.0, 2.62, z))
        _box(g, Vector3(0.04, 0.11, 1.03), gold, Vector3(-3.19, 1.26, z))
        var sigil := _box(g, Vector3(0.10, 0.32, 0.32), gold, Vector3(-3.17, 3.20, z))
        sigil.rotation.x = PI / 4.0
    for z in range(-7, 8):
        _box(g, Vector3(0.56, 0.5, 0.5), pale, Vector3(-2.62, 4.72, z))
    return g
