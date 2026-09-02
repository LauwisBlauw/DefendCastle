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
    var key := color.to_rgba32()
    if _mat_cache.has(key):
        return _mat_cache[key]
    var m := StandardMaterial3D.new()
    m.albedo_color = color
    m.roughness = 0.9
    m.specular_mode = BaseMaterial3D.SPECULAR_DISABLED  # flat voxel look
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

static func cache_stats() -> Dictionary:
    return {"materials": _mat_cache.size(), "meshes": _box_cache.size()}
