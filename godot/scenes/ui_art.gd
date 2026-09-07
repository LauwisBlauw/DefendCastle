extends Control
class_name CastleUIArt
## Small hand-drawn vector marks used by the in-game chrome.  They keep the UI legible
## at any resolution and avoid shipping a second visual language as a sheet of icons.

var art_id := "crest"
var primary := Color("d7b45b")
var secondary := Color("53d8cf")
var muted := false

func configure(id: String, main_color: Color = Color("d7b45b"), accent_color: Color = Color("53d8cf"), dimmed: bool = false) -> void:
    # Redraw only on a real change. The defender panel re-configures its icon from a
    # per-frame refresh, so an unconditional queue_redraw() re-ran the whole vector
    # drawing every frame the panel was open — for a mark that had not changed.
    if id == art_id and main_color == primary and accent_color == secondary and dimmed == muted:
        return
    art_id = id
    primary = main_color
    secondary = accent_color
    muted = dimmed
    queue_redraw()

func _ready() -> void:
    mouse_filter = Control.MOUSE_FILTER_IGNORE
    queue_redraw()

func _draw() -> void:
    if size.x < 2.0 or size.y < 2.0:
        return
    var scale := minf(size.x, size.y) / 64.0
    var origin := (size - Vector2(64.0, 64.0) * scale) * 0.5
    var ink := primary.darkened(0.62)
    var fill := primary.darkened(0.18) if muted else primary
    var glow := secondary.darkened(0.42) if muted else secondary
    match art_id:
        "wall": _draw_wall(origin, scale, fill, ink, glow)
        "tower": _draw_tower(origin, scale, fill, ink, glow)
        "swordsman": _draw_swordsman(origin, scale, fill, ink, glow)
        "spiketrap": _draw_spikes(origin, scale, fill, ink, glow)
        "archer": _draw_archer(origin, scale, fill, ink, glow)
        "ballista": _draw_ballista(origin, scale, fill, ink, glow)
        "spearman": _draw_spearman(origin, scale, fill, ink, glow)
        "mage": _draw_mage(origin, scale, fill, ink, glow)
        "knight": _draw_knight(origin, scale, fill, ink, glow)
        "catapult": _draw_catapult(origin, scale, fill, ink, glow)
        "realm_1": _draw_realm(origin, scale, _mute(Color("79b85b")), _mute_glow(Color("d9be72")), 1)
        "realm_2": _draw_realm(origin, scale, _mute(Color("d29a52")), _mute_glow(Color("f5d27e")), 2)
        "realm_3": _draw_realm(origin, scale, _mute(Color("8bc9d9")), _mute_glow(Color("eff7f0")), 3)
        "realm_4": _draw_realm(origin, scale, _mute(Color("cf6744")), _mute_glow(Color("ffbb58")), 4)
        "realm_5": _draw_realm(origin, scale, _mute(Color("8567b7")), _mute_glow(Color("d1a9fb")), 5)
        "merchant": _draw_merchant(origin, scale, fill, ink, glow)
        "record": _draw_record(origin, scale, fill, ink, glow)
        _:
            _draw_crest(origin, scale, fill, ink, glow)

func _p(v: Vector2, origin: Vector2, scale: float) -> Vector2:
    return origin + v * scale

func _r(x: float, y: float, w: float, h: float, origin: Vector2, scale: float) -> Rect2:
    return Rect2(_p(Vector2(x, y), origin, scale), Vector2(w, h) * scale)

func _poly(points: Array[Vector2], origin: Vector2, scale: float, color: Color) -> void:
    var out := PackedVector2Array()
    for point in points:
        out.append(_p(point, origin, scale))
    draw_colored_polygon(out, color)

func _line(a: Vector2, b: Vector2, width: float, origin: Vector2, scale: float, color: Color) -> void:
    draw_line(_p(a, origin, scale), _p(b, origin, scale), color, width * scale, true)

func _draw_crest(o: Vector2, s: float, c: Color, ink: Color, glow: Color) -> void:
    draw_circle(_p(Vector2(32, 32), o, s), 28.0 * s, Color(c, 0.13))
    draw_arc(_p(Vector2(32, 32), o, s), 26.0 * s, 0.0, TAU, 28, c, 1.6 * s, true)
    _poly([Vector2(13, 45), Vector2(13, 28), Vector2(20, 28), Vector2(20, 19), Vector2(27, 19), Vector2(27, 28), Vector2(37, 28), Vector2(37, 16), Vector2(45, 16), Vector2(45, 28), Vector2(51, 28), Vector2(51, 45)], o, s, c)
    draw_rect(_r(20, 38, 8, 7, o, s), ink)
    draw_rect(_r(37, 37, 8, 8, o, s), ink)
    draw_circle(_p(Vector2(32, 33), o, s), 4.4 * s, glow)
    _line(Vector2(32, 13), Vector2(32, 22), 1.5, o, s, c)
    _poly([Vector2(32, 13), Vector2(42, 16), Vector2(32, 19)], o, s, glow)

func _draw_wall(o: Vector2, s: float, c: Color, ink: Color, glow: Color) -> void:
    draw_rect(_r(8, 26, 48, 25, o, s), c)
    for x in [8, 20, 32, 44]:
        draw_rect(_r(float(x), 20, 7, 8, o, s), c)
    for y in [33, 42]:
        _line(Vector2(8, y), Vector2(56, y), 1.1, o, s, ink)
    for x in [18, 32, 46]:
        _line(Vector2(x, 26), Vector2(x, 33), 1.1, o, s, ink)
    for x in [12, 26, 40, 52]:
        _line(Vector2(x, 34), Vector2(x, 42), 1.1, o, s, ink)
    draw_rect(_r(27, 39, 10, 12, o, s), ink)
    draw_circle(_p(Vector2(32, 39), o, s), 4.8 * s, glow)

func _draw_tower(o: Vector2, s: float, c: Color, ink: Color, glow: Color) -> void:
    _poly([Vector2(18, 51), Vector2(20, 24), Vector2(44, 24), Vector2(46, 51)], o, s, c)
    _poly([Vector2(15, 25), Vector2(32, 9), Vector2(49, 25)], o, s, ink)
    _poly([Vector2(18, 23), Vector2(32, 13), Vector2(46, 23)], o, s, c)
    for y in [30, 40]:
        draw_rect(_r(27, y, 10, 5, o, s), ink)
    draw_circle(_p(Vector2(32, 32), o, s), 3.0 * s, glow)
    _line(Vector2(22, 51), Vector2(42, 51), 2.0, o, s, ink)

func _draw_swordsman(o: Vector2, s: float, c: Color, ink: Color, glow: Color) -> void:
    _poly([Vector2(13, 23), Vector2(26, 17), Vector2(31, 28), Vector2(25, 45), Vector2(14, 39)], o, s, c)
    _line(Vector2(38, 48), Vector2(51, 13), 3.0, o, s, c)
    _line(Vector2(34, 39), Vector2(45, 43), 3.0, o, s, ink)
    _line(Vector2(46, 17), Vector2(53, 10), 2.5, o, s, glow)
    draw_circle(_p(Vector2(21, 31), o, s), 4.0 * s, glow)

func _draw_spikes(o: Vector2, s: float, c: Color, ink: Color, glow: Color) -> void:
    draw_rect(_r(8, 44, 48, 8, o, s), ink)
    draw_rect(_r(10, 42, 44, 4, o, s), c)
    for x in [12, 22, 32, 42]:
        _poly([Vector2(x, 42), Vector2(x + 5, 18), Vector2(x + 10, 42)], o, s, c)
        _line(Vector2(x + 5, 20), Vector2(x + 5, 40), 1.0, o, s, glow)

func _draw_archer(o: Vector2, s: float, c: Color, ink: Color, glow: Color) -> void:
    draw_arc(_p(Vector2(24, 32), o, s), 17.0 * s, -1.35, 1.35, 20, c, 3.0 * s, true)
    _line(Vector2(24, 15), Vector2(24, 49), 1.2, o, s, glow)
    _line(Vector2(17, 32), Vector2(54, 32), 2.0, o, s, c)
    _poly([Vector2(55, 32), Vector2(48, 28), Vector2(48, 36)], o, s, glow)
    draw_circle(_p(Vector2(21, 31), o, s), 2.6 * s, ink)

func _draw_ballista(o: Vector2, s: float, c: Color, ink: Color, glow: Color) -> void:
    draw_circle(_p(Vector2(20, 48), o, s), 6.0 * s, ink)
    draw_circle(_p(Vector2(44, 48), o, s), 6.0 * s, ink)
    draw_rect(_r(14, 39, 36, 7, o, s), c)
    _line(Vector2(32, 40), Vector2(52, 17), 4.0, o, s, c)
    _line(Vector2(29, 28), Vector2(52, 17), 2.0, o, s, glow)
    _line(Vector2(39, 28), Vector2(54, 40), 2.0, o, s, ink)

func _draw_spearman(o: Vector2, s: float, c: Color, ink: Color, glow: Color) -> void:
    _line(Vector2(16, 49), Vector2(49, 12), 3.0, o, s, c)
    _poly([Vector2(49, 12), Vector2(50, 23), Vector2(39, 21)], o, s, glow)
    _poly([Vector2(12, 28), Vector2(26, 23), Vector2(31, 34), Vector2(22, 45), Vector2(12, 39)], o, s, c)
    draw_circle(_p(Vector2(21, 34), o, s), 3.0 * s, ink)

func _draw_mage(o: Vector2, s: float, c: Color, ink: Color, glow: Color) -> void:
    _poly([Vector2(16, 50), Vector2(24, 22), Vector2(40, 22), Vector2(49, 50)], o, s, c)
    _poly([Vector2(19, 27), Vector2(32, 10), Vector2(45, 27)], o, s, ink)
    draw_circle(_p(Vector2(32, 32), o, s), 7.0 * s, Color(glow, 0.28))
    draw_circle(_p(Vector2(32, 32), o, s), 3.5 * s, glow)
    _line(Vector2(12, 44), Vector2(22, 29), 2.0, o, s, c)

func _draw_knight(o: Vector2, s: float, c: Color, ink: Color, glow: Color) -> void:
    _poly([Vector2(16, 48), Vector2(18, 27), Vector2(30, 17), Vector2(43, 26), Vector2(47, 48)], o, s, c)
    _poly([Vector2(23, 28), Vector2(32, 17), Vector2(41, 28), Vector2(37, 36), Vector2(27, 36)], o, s, ink)
    _line(Vector2(17, 50), Vector2(47, 50), 2.2, o, s, ink)
    _line(Vector2(45, 45), Vector2(55, 15), 3.0, o, s, c)
    draw_circle(_p(Vector2(32, 31), o, s), 2.2 * s, glow)

func _draw_catapult(o: Vector2, s: float, c: Color, ink: Color, glow: Color) -> void:
    draw_circle(_p(Vector2(20, 48), o, s), 7.0 * s, ink)
    draw_circle(_p(Vector2(44, 48), o, s), 7.0 * s, ink)
    draw_rect(_r(13, 39, 38, 7, o, s), c)
    _line(Vector2(30, 40), Vector2(44, 15), 5.0, o, s, c)
    draw_circle(_p(Vector2(45, 13), o, s), 5.0 * s, glow)
    _line(Vector2(21, 37), Vector2(35, 29), 2.0, o, s, ink)

## The realm sigils carry their own colours rather than the caller's primary/secondary,
## so they have to apply `muted` themselves — every other mark gets it for free from the
## `fill`/`glow` locals in _draw(). Without this a sealed realm looked exactly as bright
## as an unlocked one, which is the one thing that card has to communicate.
func _mute(c: Color) -> Color:
    return c.darkened(0.45) if muted else c

func _mute_glow(c: Color) -> Color:
    return c.darkened(0.55) if muted else c

func _draw_realm(o: Vector2, s: float, c: Color, glow: Color, realm: int) -> void:
    draw_circle(_p(Vector2(32, 32), o, s), 27.0 * s, Color(c, 0.18))
    draw_circle(_p(Vector2(32, 32), o, s), 25.5 * s, c.darkened(0.45), false, 1.5 * s, true)
    match realm:
        1:
            _poly([Vector2(8, 44), Vector2(23, 23), Vector2(32, 34), Vector2(42, 17), Vector2(57, 44)], o, s, c)
            _poly([Vector2(8, 45), Vector2(57, 45), Vector2(51, 54), Vector2(13, 54)], o, s, glow.darkened(0.28))
        2:
            _poly([Vector2(8, 46), Vector2(20, 35), Vector2(31, 43), Vector2(44, 28), Vector2(57, 46)], o, s, c)
            draw_arc(_p(Vector2(32, 23), o, s), 8.0 * s, PI, TAU, 16, glow, 2.2 * s, true)
        3:
            _poly([Vector2(9, 48), Vector2(24, 20), Vector2(33, 36), Vector2(45, 15), Vector2(56, 48)], o, s, glow)
            _line(Vector2(8, 48), Vector2(56, 48), 2.0, o, s, c)
        4:
            _poly([Vector2(10, 51), Vector2(23, 34), Vector2(28, 21), Vector2(34, 38), Vector2(42, 13), Vector2(54, 51)], o, s, c)
            _line(Vector2(20, 50), Vector2(29, 40), 2.2, o, s, glow)
            _line(Vector2(38, 50), Vector2(44, 33), 2.2, o, s, glow)
        _:
            _poly([Vector2(10, 50), Vector2(20, 25), Vector2(32, 35), Vector2(45, 17), Vector2(55, 50)], o, s, c)
            draw_circle(_p(Vector2(45, 20), o, s), 3.0 * s, glow)
            draw_circle(_p(Vector2(22, 29), o, s), 2.0 * s, glow)
    draw_arc(_p(Vector2(32, 32), o, s), 27.0 * s, 0.0, TAU, 32, glow, 1.1 * s, true)

func _draw_merchant(o: Vector2, s: float, c: Color, ink: Color, glow: Color) -> void:
    draw_rect(_r(14, 21, 36, 29, o, s), c)
    _poly([Vector2(10, 23), Vector2(32, 9), Vector2(54, 23)], o, s, ink)
    draw_rect(_r(11, 20, 42, 5, o, s), glow)
    draw_circle(_p(Vector2(24, 37), o, s), 3.0 * s, ink)
    draw_circle(_p(Vector2(40, 37), o, s), 3.0 * s, ink)
    _line(Vector2(17, 50), Vector2(47, 50), 2.0, o, s, ink)

func _draw_record(o: Vector2, s: float, c: Color, ink: Color, glow: Color) -> void:
    _poly([Vector2(15, 12), Vector2(49, 12), Vector2(49, 52), Vector2(15, 52)], o, s, c)
    for y in [22, 31, 40]:
        _line(Vector2(22, y), Vector2(43, y), 1.8, o, s, ink)
    draw_circle(_p(Vector2(19, 22), o, s), 2.1 * s, glow)
    draw_circle(_p(Vector2(19, 31), o, s), 2.1 * s, glow)
    draw_circle(_p(Vector2(19, 40), o, s), 2.1 * s, glow)
