class_name Voxel
extends RefCounted
## The art layer. Every model in this game is axis-aligned boxes — there are 889
## `mesh(box(w,h,d), material)` calls in the JS build and no model files at all, so the
## port is mechanical: box() -> BoxMesh, mesh() -> MeshInstance3D.
##
## Materials are CACHED per colour. The JS build learned this the hard way (see
## _particleMatCache): a fresh material per box is the difference between a handful of
## resources and thousands. That matters more on mobile, which is the export target.

static var _mat_cache: Dictionary = {}
static var _box_cache: Dictionary = {}

static func mat(color: Color) -> StandardMaterial3D:
    var key := "f%d" % color.to_rgba32()
    if _mat_cache.has(key):
        return _mat_cache[key]
    var m := StandardMaterial3D.new()
    m.albedo_color = color
    m.roughness = 0.9
    m.specular_mode = BaseMaterial3D.SPECULAR_DISABLED  # flat voxel look
    _mat_cache[key] = m
    return m

## Glowing parts (eyes, crystals, fuses) need their own material. Cached on the same
## principle as mat() — an orc has two eyes and there are 200 orcs.
static func emissive_mat(albedo: Color, emission: Color, energy: float = 1.4) -> StandardMaterial3D:
    var key := "e%d_%d_%.2f" % [albedo.to_rgba32(), emission.to_rgba32(), energy]
    if _mat_cache.has(key):
        return _mat_cache[key]
    var m := StandardMaterial3D.new()
    m.albedo_color = albedo
    m.roughness = 0.6
    m.emission_enabled = true
    m.emission = emission
    m.emission_energy_multiplier = energy
    _mat_cache[key] = m
    return m

## A translucent overlay, used for the placement ghost and range rings.
static func ghost_mat(color: Color, alpha: float = 0.4) -> StandardMaterial3D:
    var key := "g%d_%.2f" % [color.to_rgba32(), alpha]
    if _mat_cache.has(key):
        return _mat_cache[key]
    var m := StandardMaterial3D.new()
    m.albedo_color = Color(color.r, color.g, color.b, alpha)
    m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
    _mat_cache[key] = m
    return m

static func box_mesh(size: Vector3) -> BoxMesh:
    var key := "%.3f_%.3f_%.3f" % [size.x, size.y, size.z]
    if _box_cache.has(key):
        return _box_cache[key]
    var b := BoxMesh.new()
    b.size = size
    _box_cache[key] = b
    return b

## Equivalent of the JS `mesh(box(w,h,d), material)` helper.
static func box(size: Vector3, color: Color, pos := Vector3.ZERO) -> MeshInstance3D:
    var mi := MeshInstance3D.new()
    mi.mesh = box_mesh(size)
    mi.material_override = mat(color)
    mi.position = pos
    return mi

