extends Node3D
## Lightweight selection feedback, separate from targeting and combat logic.
const RING_SHADER = preload("res://shaders/tactical_ring.gdshader")
var game: Node
var _range: MeshInstance3D
var _base: MeshInstance3D
var _ui: Node = null

static func disc(color: Color, square := false) -> MeshInstance3D:
    var mesh := MeshInstance3D.new()
    var plane := PlaneMesh.new()
    plane.size = Vector2(2, 2)
    mesh.mesh = plane
    var material := ShaderMaterial.new()
    material.shader = RING_SHADER
    material.set_shader_parameter("ring_color", color)
    material.set_shader_parameter("square_marker", square)
    mesh.material_override = material
    mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    return mesh

func _ready() -> void:
    _range = disc(Color("7dcfc6"))
    _base = disc(Color("efd195"), true)
    add_child(_range)
    add_child(_base)
    # The base disc never changes size or height, so it is set once here rather than
    # rewritten on every frame the panel happens to be open.
    _base.scale = Vector3(0.75, 1, 0.75)
    _base.position.y = 0.01
    visible = false

func _process(_delta: float) -> void:
    if game == null or not game.visual_fx:
        visible = false
        return
    var d: Defender = game.selected_defender
    if not is_instance_valid(d) or not d.alive:
        visible = false
        return
    # Resolved once. get_node_or_null builds a NodePath and walks the child list, and
    # this runs every frame — but the UI node outlives every selection.
    if _ui == null or not is_instance_valid(_ui):
        _ui = game.get_node_or_null("UI")
    visible = _ui == null or not _ui._overlay.visible
    if not visible:
        return
    global_position = Vector3(d.global_position.x, 0.065, d.global_position.z)
    _range.visible = d.range_r > 0.0
    _range.scale = Vector3(d.range_r, 1, d.range_r)
