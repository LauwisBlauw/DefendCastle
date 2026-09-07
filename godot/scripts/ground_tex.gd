class_name GroundTex
extends RefCounted
## Procedural ground and road textures — ports of the JS canvas painters
## makeGroundTex(), makeCobbleTex{,B,C}(), makeDirtTex(), makeSandTex(), makeLavaTex().
##
## Godot has no 2D canvas a static builder can draw into, so every primitive the JS got
## from ctx — radial gradients, rotated ellipses, quadratic strokes, rounded rects with
## clipped rim highlights — is rasterised by hand here and handed to Image at the end.
##
## Resolution is 256, not the JS 512. Per-pixel work in GDScript costs roughly an order
## of magnitude more than the browser's C++ canvas, and 512 pushes the heavier biomes
## (Meadow's 700 grass blades, the cobble brick grids) past a second each on the mobile
## export target. All geometry below is authored in the JS 512-space and multiplied by
## _S on the way in, so the numbers can be diffed against main.js line for line. Feature
## *counts* are unchanged: the same texture covers the same world area either way, so
## keeping the count keeps the density and only halves each feature's pixel size.
##
## Everything composites into _px, a class-level float RGB scratch buffer, instead of a
## passed-in Image. Image.get_pixel/set_pixel per blend is far too slow for the ~500k
## blends a biome takes, and a class-level buffer also sidesteps the question of how
## Packed arrays behave as arguments. The builders are non-reentrant by consequence,
## which is fine — textures are built one at a time at level load.
##
## Note on sampling: Godot 4 keeps filter and repeat on the *material*, not on Texture2D,
## so a caller that wants the unfiltered voxel look must set them there — apply_sampling()
## does it in one call.

const SZ := 256
const _S := 0.5  # JS authored against a 512 canvas

## The Vibe biome's neon patch palette, straight out of the JS `neons` array.
const _NEON: Array[Color] = [Color("ff00c8"), Color("00ffbe"), Color("ffdc00"),
    Color("7800ff"), Color("00b4ff"), Color("ff5000")]

## Scratch RGB buffer, 3 floats per pixel, 0..1. Reused across builds.
static var _px := PackedFloat32Array()


# ─────────────────────────────────────────────────────────────────────────────
#  PUBLIC API
# ─────────────────────────────────────────────────────────────────────────────

## Returns a tiling 512x512 ground texture for the named biome.
## (Rasterised at 256 — see the file header. Unknown names fall back to Meadow.)
static func make(biome_name: String, seed_value: int) -> ImageTexture:
    var rng := _rng(biome_name, seed_value)
    _begin()
    match biome_name:
        "Desert": _meadow_desert(rng)
        "Icelands": _icelands(rng)
        "Lava": _lava(rng)
        "Mordor": _mordor(rng)
        "Doom": _doom(rng)
        "Vibe": _vibe(rng)
        _: _meadow(rng)
    return _finish()


## Road surface. The JS had three cobble variants keyed by *lane* (pathA/B/C), not by
## biome; here the caller asks per biome, so each biome takes the variant that suits its
## palette. The lane-keyed variants are still reachable through make_tile().
static func make_road(biome_name: String, seed_value: int) -> ImageTexture:
    var rng := _rng(biome_name + "road", seed_value)
    _begin()
    match biome_name:
        "Desert": _cobble_b(rng)  # warm sandstone brick
        "Lava", "Mordor", "Doom", "Vibe": _cobble_c(rng)  # dark slate
        _: _cobble_a(rng)  # grey granite cobble
    return _finish()


## The level editor's standalone tile surfaces, kept because the JS tile palette keys
## them by name: "dirt", "sand", "lava", "pathA", "pathB", "pathC".
static func make_tile(kind: String, seed_value: int) -> ImageTexture:
    var rng := _rng(kind, seed_value)
    _begin()
    match kind:
        "sand": _sand_tex(rng)
        "lava": _lava_tex(rng)
        "pathA": _cobble_a(rng)
        "pathB": _cobble_b(rng)
        "pathC": _cobble_c(rng)
        _: _dirt_tex(rng)
    return _finish()


## Godot puts the sampler state on the material, so a ground texture handed straight to
## a StandardMaterial3D would come out linear-filtered and mip-blurred — the opposite of
## the look. Call this after assigning albedo_texture.
static func apply_sampling(mat: BaseMaterial3D) -> void:
    mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
    mat.texture_repeat = true


# ─────────────────────────────────────────────────────────────────────────────
#  BUFFER + OUTPUT
# ─────────────────────────────────────────────────────────────────────────────

## Name-derived seeding so one level seed yields a different — but still reproducible —
## sequence per surface, instead of every biome sharing the same blob layout.
static func _rng(tag: String, seed_value: int) -> RandomNumberGenerator:
    var rng := RandomNumberGenerator.new()
    rng.seed = seed_value ^ hash(tag)
    return rng


static func _begin() -> void:
    var n := SZ * SZ * 3
    if _px.size() != n:
        _px.resize(n)


static func _finish() -> ImageTexture:
    var n := SZ * SZ * 3
    var bytes := PackedByteArray()
    bytes.resize(n)
    for i in n:
        bytes[i] = int(clampf(_px[i], 0.0, 1.0) * 255.0)
    var img := Image.create_from_data(SZ, SZ, false, Image.FORMAT_RGB8, bytes)
    return ImageTexture.create_from_image(img)


# ─────────────────────────────────────────────────────────────────────────────
#  RASTER PRIMITIVES
#  Every write wraps in both axes, so features that cross an edge come back on the
#  opposite one and the tile is genuinely seamless — the JS canvas simply clipped them
#  and lived with the seam.
# ─────────────────────────────────────────────────────────────────────────────

static func _fill(c: Color) -> void:
    var n := SZ * SZ * 3
    var i := 0
    while i < n:
        _px[i] = c.r
        _px[i + 1] = c.g
        _px[i + 2] = c.b
        i += 3


## Flat translucent pass over the whole tile (the JS "darken to keep the tone moody").
static func _wash(c: Color, a: float) -> void:
    var n := SZ * SZ * 3
    var i := 0
    while i < n:
        _px[i] += (c.r - _px[i]) * a
        _px[i + 1] += (c.g - _px[i + 1]) * a
        _px[i + 2] += (c.b - _px[i + 2]) * a
        i += 3


static func _blend(x: int, y: int, c: Color, a: float) -> void:
    if a <= 0.0:
        return
    var i := (wrapi(y, 0, SZ) * SZ + wrapi(x, 0, SZ)) * 3
    _px[i] += (c.r - _px[i]) * a
    _px[i + 1] += (c.g - _px[i + 1]) * a
    _px[i + 2] += (c.b - _px[i + 2]) * a


## One soft blob: alpha falls linearly from `a` at the centre to 0 on the ellipse edge,
## which is the JS radial gradient clipped to a rotated ellipse.
static func _blob(cx: float, cy: float, rx: float, ry: float, rot: float, c: Color, a: float) -> void:
    rx = maxf(rx, 0.5)
    ry = maxf(ry, 0.5)
    var ca := cos(rot)
    var sa := sin(rot)
    var ext := int(ceil(maxf(rx, ry))) + 1
    var x0 := int(floor(cx)) - ext
    var y0 := int(floor(cy)) - ext
    var cr := c.r
    var cg := c.g
    var cb := c.b
    for py in range(y0, y0 + ext * 2 + 1):
        var dy := float(py) + 0.5 - cy
        var row := wrapi(py, 0, SZ) * SZ
        for pxx in range(x0, x0 + ext * 2 + 1):
            var dx := float(pxx) + 0.5 - cx
            var u := (dx * ca + dy * sa) / rx
            var v := (-dx * sa + dy * ca) / ry
            var t := sqrt(u * u + v * v)
            if t >= 1.0:
                continue
            var al := a * (1.0 - t)
            var i := (row + wrapi(pxx, 0, SZ)) * 3
            _px[i] += (cr - _px[i]) * al
            _px[i + 1] += (cg - _px[i + 1]) * al
            _px[i + 2] += (cb - _px[i + 2]) * al


## Hard-edged filled ellipse (pebbles, snow sparkles). One pixel of coverage falloff so
## the small ones do not turn into squares.
static func _ellipse(cx: float, cy: float, rx: float, ry: float, rot: float, c: Color, a := 1.0) -> void:
    rx = maxf(rx, 0.4)
    ry = maxf(ry, 0.4)
    var ca := cos(rot)
    var sa := sin(rot)
    var soft := minf(rx, ry)
    var ext := int(ceil(maxf(rx, ry))) + 1
    var x0 := int(floor(cx)) - ext
    var y0 := int(floor(cy)) - ext
    for py in range(y0, y0 + ext * 2 + 1):
        var dy := float(py) + 0.5 - cy
        for pxx in range(x0, x0 + ext * 2 + 1):
            var dx := float(pxx) + 0.5 - cx
            var u := (dx * ca + dy * sa) / rx
            var v := (-dx * sa + dy * ca) / ry
            var t := sqrt(u * u + v * v)
            var cov := clampf((1.0 - t) * soft + 0.5, 0.0, 1.0)
            if cov <= 0.0:
                continue
            _blend(pxx, py, c, a * cov)


## Multi-stop radial glow (lava pools, crack-junction hotspots): `c0`→`c1` over the
## inner `t1` of the radius, then `c1`→`c2` fading to zero alpha at the rim.
static func _radial3(cx: float, cy: float, r: float, c0: Color, a0: float, c1: Color, a1: float, t1: float, c2: Color) -> void:
    var ext := int(ceil(r)) + 1
    var x0 := int(floor(cx)) - ext
    var y0 := int(floor(cy)) - ext
    for py in range(y0, y0 + ext * 2 + 1):
        var dy := float(py) + 0.5 - cy
        for pxx in range(x0, x0 + ext * 2 + 1):
            var dx := float(pxx) + 0.5 - cx
            var t := sqrt(dx * dx + dy * dy) / r
            if t >= 1.0:
                continue
            var col: Color
            var a: float
            if t < t1:
                var u := t / t1
                col = c0.lerp(c1, u)
                a = a0 + (a1 - a0) * u
            else:
                var u := (t - t1) / (1.0 - t1)
                col = c1.lerp(c2, u)
                a = a1 * (1.0 - u)
            _blend(pxx, py, col, a)


## A line of given width, rasterised by distance-to-segment inside the segment's
## bounding box. Far easier to get right than Bresenham and it gives free end caps.
static func _seg(x0: float, y0: float, x1: float, y1: float, w: float, c: Color, a: float) -> void:
    var hw := maxf(w, 0.7) * 0.5
    var ex := x1 - x0
    var ey := y1 - y0
    var len2 := ex * ex + ey * ey
    var pad := int(ceil(hw)) + 1
    var bx0 := int(floor(minf(x0, x1))) - pad
    var bx1 := int(ceil(maxf(x0, x1))) + pad
    var by0 := int(floor(minf(y0, y1))) - pad
    var by1 := int(ceil(maxf(y0, y1))) + pad
    for py in range(by0, by1 + 1):
        var dy0 := float(py) + 0.5 - y0
        for pxx in range(bx0, bx1 + 1):
            var dx0 := float(pxx) + 0.5 - x0
            var t := 0.0
            if len2 > 0.0:
                t = clampf((dx0 * ex + dy0 * ey) / len2, 0.0, 1.0)
            var qx := dx0 - ex * t
            var qy := dy0 - ey * t
            var cov := clampf(hw + 0.5 - sqrt(qx * qx + qy * qy), 0.0, 1.0)
            if cov <= 0.0:
                continue
            _blend(pxx, py, c, a * cov)


## Quadratic bezier, flattened to 6 segments — enough for the short grass blades and
## sand ripples, and for the lava crack network where the bow is the whole point.
static func _quad(x0: float, y0: float, mx: float, my: float, x1: float, y1: float, w: float, c: Color, a: float) -> void:
    var px0 := x0
    var py0 := y0
    for s in range(1, 7):
        var t := float(s) / 6.0
        var it := 1.0 - t
        var qx := it * it * x0 + 2.0 * it * t * mx + t * t * x1
        var qy := it * it * y0 + 2.0 * it * t * my + t * t * y1
        _seg(px0, py0, qx, qy, w, c, a)
        px0 = qx
        py0 = qy


## Fills the JS _rrect: rounded rect, diagonal 3-stop gradient, dark edge stroke and a
## rim highlight clipped to the shape — all in one pass, since a per-pixel signed
## distance gives fill, outline and clip from the same number.
static func _brick(rect: Rect2, rad: float, c_hi: Color, c_mid: Color, c_lo: Color, mid_t: float,
        edge_a: float, edge_w: float, rim: Color, rim_a: float, rim_h: float, rim_w: float) -> void:
    var half := rect.size * 0.5
    var cen := rect.position + half
    var rr := minf(rad, minf(half.x, half.y))
    var ehw := maxf(edge_w, 0.6) * 0.5
    var gx := rect.size.x
    var gy := rect.size.y
    var glen2 := gx * gx + gy * gy
    var top_y := rect.position.y + rect.size.y * rim_h
    var left_x := rect.position.x + rect.size.x * rim_w
    var bx0 := int(floor(rect.position.x)) - 2
    var by0 := int(floor(rect.position.y)) - 2
    var bx1 := int(ceil(rect.end.x)) + 2
    var by1 := int(ceil(rect.end.y)) + 2
    for py in range(by0, by1 + 1):
        var fy := float(py) + 0.5
        var qy := absf(fy - cen.y) - (half.y - rr)
        for pxx in range(bx0, bx1 + 1):
            var fx := float(pxx) + 0.5
            var qx := absf(fx - cen.x) - (half.x - rr)
            var d := Vector2(maxf(qx, 0.0), maxf(qy, 0.0)).length() + minf(maxf(qx, qy), 0.0) - rr
            if d > ehw + 0.5:
                continue
            var cov := clampf(0.5 - d, 0.0, 1.0)
            if cov > 0.0:
                var t := clampf(((fx - rect.position.x) * gx + (fy - rect.position.y) * gy) / glen2, 0.0, 1.0)
                var col: Color
                if t < mid_t:
                    col = c_hi.lerp(c_mid, t / mid_t)
                else:
                    col = c_mid.lerp(c_lo, (t - mid_t) / (1.0 - mid_t))
                _blend(pxx, py, col, cov)
                if rim_a > 0.0 and (fy < top_y or fx < left_x):
                    _blend(pxx, py, rim, rim_a * cov)
            var ecov := clampf(ehw + 0.5 - absf(d), 0.0, 1.0)
            if ecov > 0.0:
                _blend(pxx, py, Color.BLACK, edge_a * ecov)


# ─────────────────────────────────────────────────────────────────────────────
#  SCATTER PASSES (the JS blobs() / cracks() helpers, plus the stroke passes)
# ─────────────────────────────────────────────────────────────────────────────

## `col_fn` is called as col_fn(i, rng) per blob, matching the JS hsl(i) callback —
## it draws from the same rng, so the draw order below mirrors the JS exactly.
static func _blobs(rng: RandomNumberGenerator, n: int, r_min: float, r_max: float, col_fn: Callable, alpha: float) -> void:
    for i in n:
        var x := rng.randf() * SZ
        var y := rng.randf() * SZ
        var r := (r_min + rng.randf() * (r_max - r_min)) * _S
        var c: Color = col_fn.call(i, rng)
        var ry := r * (0.4 + rng.randf() * 0.7)
        _blob(x, y, r, ry, rng.randf() * PI, c, alpha)


## Jagged multi-segment polylines. `col_fn`, when valid, overrides `color` per crack —
## the Lava/Doom/Mordor veins randomise their glow per vein.
static func _cracks(rng: RandomNumberGenerator, n: int, color: Color, alpha: float, w_min: float,
        w_max: float, segs: int, spread := 22.0, col_fn := Callable()) -> void:
    for i in n:
        var cx := rng.randf() * SZ
        var cy := rng.randf() * SZ
        var c := color
        if col_fn.is_valid():
            c = col_fn.call(i, rng)
        var w := (w_min + rng.randf() * (w_max - w_min)) * _S
        for s in segs:
            var nx := cx + (rng.randf() - 0.5) * spread * _S
            var ny := cy + (rng.randf() - 0.5) * spread * _S
            _seg(cx, cy, nx, ny, w, c, alpha)
            cx = nx
            cy = ny


## Bowed quadratic strokes. Grass blades and sand ripples are the same shape with
## different angles, so one pass covers both: `ang_base`/`ang_jitter` set the direction,
## `bend` swings the control point off the chord, `side_jitter` nudges it sideways.
static func _strokes(rng: RandomNumberGenerator, n: int, len_min: float, len_max: float,
        w_min: float, w_max: float, alpha: float, col_fn: Callable,
        ang_base: float, ang_jitter: float, bend: float, side_jitter := 0.0) -> void:
    for i in n:
        var x := rng.randf() * SZ
        var y := rng.randf() * SZ
        var l := (len_min + rng.randf() * (len_max - len_min)) * _S
        var a := ang_base + (rng.randf() - 0.5) * ang_jitter
        var c: Color = col_fn.call(i, rng)
        var w := (w_min + rng.randf() * (w_max - w_min)) * _S
        var mx := x + cos(a + bend) * l * 0.5 + (rng.randf() - 0.5) * side_jitter * _S
        var my := y + sin(a + bend) * l * 0.5
        _quad(x, y, mx, my, x + cos(a) * l, y + sin(a) * l, w, c, alpha)


## The 2x2 "micro-noise" fillRect speckle every JS tile texture starts with. `base` holds
## the per-channel floor, `v_min`..`v_max` the shared 0-255 jitter added to all three.
static func _noise(rng: RandomNumberGenerator, n: int, base: Color, v_min: float, v_max: float, alpha: float, size := 2) -> void:
    var sz := maxi(1, int(round(size * _S)))
    var c := Color()
    for i in n:
        var x := int(rng.randf() * SZ)
        var y := int(rng.randf() * SZ)
        var v := (v_min + rng.randf() * (v_max - v_min)) / 255.0
        c.r = base.r + v
        c.g = base.g + v
        c.b = base.b + v
        for oy in sz:
            for ox in sz:
                _blend(x + ox, y + oy, c, alpha)


static func _vline(x: float, w: float, c: Color, a: float) -> void:
    _seg(x, -1.0, x, float(SZ) + 1.0, w, c, a)


static func _hline(y: float, w: float, c: Color, a: float) -> void:
    _seg(-1.0, y, float(SZ) + 1.0, y, w, c, a)


## CSS hsl() — h in degrees, s and l in percent. Godot only ships HSV and OKHSL, and the
## JS palette is written entirely in hsl(), so the conversion has to live here.
static func _hsl(h: float, s: float, l: float) -> Color:
    var ss := clampf(s / 100.0, 0.0, 1.0)
    var ll := clampf(l / 100.0, 0.0, 1.0)
    var c := (1.0 - absf(2.0 * ll - 1.0)) * ss
    var hp := fposmod(h, 360.0) / 60.0
    var x := c * (1.0 - absf(fmod(hp, 2.0) - 1.0))
    var m := ll - c * 0.5
    if hp < 1.0:
        return Color(c + m, x + m, m)
    if hp < 2.0:
        return Color(x + m, c + m, m)
    if hp < 3.0:
        return Color(m, c + m, x + m)
    if hp < 4.0:
        return Color(m, x + m, c + m)
    if hp < 5.0:
        return Color(x + m, m, c + m)
    return Color(c + m, m, x + m)


## rgb() with 0-255 components, so the JS colour arithmetic can be copied verbatim.
static func _rgb(r: float, g: float, b: float) -> Color:
    return Color(clampf(r / 255.0, 0.0, 1.0), clampf(g / 255.0, 0.0, 1.0), clampf(b / 255.0, 0.0, 1.0))


# ─────────────────────────────────────────────────────────────────────────────
#  BIOME GROUND — port of makeGroundTex(name)
# ─────────────────────────────────────────────────────────────────────────────

static func _meadow(rng: RandomNumberGenerator) -> void:
    _fill(Color("253c14"))
    _blobs(rng, 90, 18.0, 58.0, func(_i: int, r: RandomNumberGenerator) -> Color: return _hsl(95.0 + r.randf() * 35.0, 65.0, 22.0 + r.randf() * 22.0), 0.75)
    _blobs(rng, 45, 8.0, 30.0, func(_i: int, _r: RandomNumberGenerator) -> Color: return _hsl(115.0, 60.0, 42.0), 0.28)
    # Grass blades: near-vertical, bowed, green scaled off a single brightness value.
    _strokes(rng, 700, 5.0, 19.0, 0.6, 1.6, 0.85,
        func(_i: int, r: RandomNumberGenerator) -> Color:
            var g := 80.0 + r.randf() * 100.0
            return _rgb(g * 0.35, g, g * 0.1),
        -PI * 0.5, 1.3, 0.4)
    _blobs(rng, 25, 4.0, 14.0, func(_i: int, _r: RandomNumberGenerator) -> Color: return _hsl(35.0, 55.0, 40.0), 0.22)


## Desert reuses the meadow entry point only because make() dispatches by name; the body
## is the JS 'Desert' branch.
static func _meadow_desert(rng: RandomNumberGenerator) -> void:
    _fill(Color("c0994a"))
    _blobs(rng, 80, 15.0, 45.0, func(_i: int, r: RandomNumberGenerator) -> Color: return _hsl(35.0 + r.randf() * 15.0, 60.0, 50.0 + r.randf() * 18.0), 0.45)
    # Wind ripples: any direction, control point kicked sideways rather than bowed.
    _strokes(rng, 60, 18.0, 73.0, 1.0, 3.5, 0.25,
        func(_i: int, r: RandomNumberGenerator) -> Color: return _rgb(160.0 + r.randf() * 50.0, 120.0 + r.randf() * 30.0, 60.0),
        PI * 0.5, PI, 0.0, 20.0)
    _cracks(rng, 35, _rgb(90, 60, 15), 0.35, 0.4, 1.2, 4)
    _blobs(rng, 20, 4.0, 14.0, func(_i: int, _r: RandomNumberGenerator) -> Color: return _hsl(25.0, 50.0, 35.0), 0.2)


static func _icelands(rng: RandomNumberGenerator) -> void:
    _fill(Color("c4dff0"))
    _blobs(rng, 60, 15.0, 45.0, func(_i: int, r: RandomNumberGenerator) -> Color: return _hsl(200.0 + r.randf() * 20.0, 55.0, 68.0 + r.randf() * 20.0), 0.5)
    _cracks(rng, 50, _rgb(80, 160, 220), 0.45, 0.5, 2.0, 5)
    for i in 250:
        var x := rng.randf() * SZ
        var y := rng.randf() * SZ
        var r := (0.4 + rng.randf() * 2.0) * _S
        _ellipse(x, y, r, r, 0.0, Color.WHITE, 0.3 + rng.randf() * 0.7)
    _blobs(rng, 30, 6.0, 20.0, func(_i: int, _r: RandomNumberGenerator) -> Color: return _hsl(210.0, 30.0, 85.0), 0.3)


static func _lava(rng: RandomNumberGenerator) -> void:
    _fill(Color("0f0400"))
    _blobs(rng, 55, 12.0, 35.0, func(_i: int, r: RandomNumberGenerator) -> Color: return _hsl(15.0 + r.randf() * 10.0, 70.0, 8.0 + r.randf() * 8.0), 0.8)
    _cracks(rng, 45, Color.BLACK, 0.92, 1.0, 4.5, 6, 20.0,
        func(_i: int, r: RandomNumberGenerator) -> Color:
            var b := 140.0 + r.randf() * 115.0
            return _rgb(b, b * 0.28, 0.0))
    _blobs(rng, 22, 5.0, 20.0, func(_i: int, r: RandomNumberGenerator) -> Color: return _hsl(25.0, 100.0, 35.0 + r.randf() * 20.0), 0.65)
    for i in 18:
        var x := rng.randf() * SZ
        var y := rng.randf() * SZ
        var r := (6.0 + rng.randf() * 20.0) * _S
        _radial3(x, y, r, _rgb(255, 200, 0), 0.55, _rgb(255, 80, 0), 0.3, 0.5, _rgb(255, 0, 0))


static func _mordor(rng: RandomNumberGenerator) -> void:
    _fill(Color("191008"))
    _blobs(rng, 75, 10.0, 35.0, func(_i: int, r: RandomNumberGenerator) -> Color: return _hsl(22.0 + r.randf() * 15.0, 20.0, 10.0 + r.randf() * 14.0), 0.7)
    _cracks(rng, 55, _rgb(5, 3, 1), 0.6, 0.4, 1.5, 6)
    _blobs(rng, 35, 4.0, 18.0, func(_i: int, r: RandomNumberGenerator) -> Color: return _hsl(30.0, 10.0, 28.0 + r.randf() * 12.0), 0.22)
    _cracks(rng, 20, Color.BLACK, 0.3, 0.5, 1.5, 5, 18.0,
        func(_i: int, r: RandomNumberGenerator) -> Color: return _rgb(100.0 + r.randf() * 60.0, 30.0 + r.randf() * 20.0, 0.0))


static func _doom(rng: RandomNumberGenerator) -> void:
    _fill(Color("0c0005"))
    _blobs(rng, 55, 10.0, 30.0, func(_i: int, r: RandomNumberGenerator) -> Color: return _hsl(330.0 + r.randf() * 20.0, 75.0, 8.0 + r.randf() * 10.0), 0.7)
    _cracks(rng, 38, Color.BLACK, 0.85, 0.5, 2.5, 6, 18.0,
        func(_i: int, r: RandomNumberGenerator) -> Color:
            var b := 90.0 + r.randf() * 120.0
            return _rgb(b, 0.0, b * 0.4))
    _blobs(rng, 28, 5.0, 18.0, func(_i: int, r: RandomNumberGenerator) -> Color: return _hsl(280.0, 70.0, 12.0 + r.randf() * 8.0), 0.35)
    _blobs(rng, 18, 4.0, 16.0, func(_i: int, r: RandomNumberGenerator) -> Color: return _hsl(350.0, 90.0, 15.0 + r.randf() * 10.0), 0.6)


## Synthwave grid. The JS derived the neon hues through an atan2 of the rgb triple, which
## mangled them into blues; the six literal neon colours it started from are used here.
static func _vibe(rng: RandomNumberGenerator) -> void:
    _fill(Color("06001a"))
    var grid := _rgb(0, 120, 255)
    var step := 32.0 * _S
    # Two passes over the same lines, as in the JS: a solid one, then a faint thinner
    # overdraw that softens the edge without widening the line.
    var x := 0.0
    while x < SZ:
        _vline(x, 1.0 * _S, grid, 0.14)
        _vline(x, 0.5 * _S, grid, 0.08)
        x += step
    var y := 0.0
    while y < SZ:
        _hline(y, 1.0 * _S, grid, 0.14)
        _hline(y, 0.5 * _S, grid, 0.08)
        y += step
    _blobs(rng, 50, 8.0, 28.0, func(i: int, _r: RandomNumberGenerator) -> Color: return _NEON[i % _NEON.size()], 0.4)
    # Scanlines: JS pitch was 3px at 512, which lands on 1.5 here — rounded up to 2 so
    # the lines stay distinct instead of half-covering every row.
    var sy := 0.0
    var scan := _rgb(0, 60, 200)
    while sy < SZ:
        _hline(sy, 1.0, scan, 0.015 + rng.randf() * 0.025)
        sy += 2.0


# ─────────────────────────────────────────────────────────────────────────────
#  ROAD / TILE SURFACES
#  The brick grids run cols 0..COLS-1 and rows 0..ROWS-1 with wrapped writes, where the
#  JS ran one extra row and column and let the canvas clip them. Same look, but the
#  result tiles cleanly instead of showing a cut brick along two edges.
# ─────────────────────────────────────────────────────────────────────────────

## Path A — grey granite cobble, the default road.
static func _cobble_a(rng: RandomNumberGenerator) -> void:
    _fill(Color("1e1c18"))
    _noise(rng, 3000, _rgb(10, 8, 6), 0.0, 18.0, 0.12)
    const COLS := 8
    const ROWS := 7
    var gx := float(SZ) / COLS
    var gy := float(SZ) / ROWS
    var pad := 5.0 * _S
    for row in ROWS:
        for col in COLS:
            var off_x := gx * 0.5 if (row & 1) else 0.0
            var jx := (rng.randf() - 0.5) * gx * 0.16
            var jy := (rng.randf() - 0.5) * gy * 0.16
            var sc_x := 0.78 + rng.randf() * 0.26
            var sc_y := 0.76 + rng.randf() * 0.28
            var px := fposmod(col * gx + off_x + jx, float(SZ))
            var py := row * gy + jy
            var pw := (gx - pad) * sc_x
            var ph := (gy - pad) * sc_y

            var v := 72.0 + rng.randf() * 60.0
            var warm := rng.randf() * 14.0 - 5.0
            var mossy := rng.randf() < 0.12
            var moss_g := rng.randf() * 18.0 if mossy else 0.0
            var sr := v + warm + 8.0
            var sg := v + warm + 2.0 + moss_g
            var sb := v - warm

            var rect := Rect2(px + pad * 0.5, py + pad * 0.5, pw, ph)
            _brick(rect, minf(pw, ph) * 0.20, _rgb(sr + 22.0, sg + 20.0, sb + 18.0), _rgb(sr, sg, sb),
                _rgb(sr - 28.0, sg - 24.0, sb - 24.0), 0.45, 0.40, 1.5 * _S,
                _rgb(255, 252, 240), 0.13, 0.3, 0.25)

            if rng.randf() < 0.38:
                var cx0 := rect.position.x + rng.randf() * pw * 0.5 + pw * 0.15
                var cy0 := rect.position.y + rng.randf() * ph * 0.5 + ph * 0.15
                var cx1 := clampf(cx0 + (rng.randf() - 0.5) * pw * 0.55, rect.position.x, rect.end.x)
                var cy1 := clampf(cy0 + (rng.randf() - 0.5) * ph * 0.55, rect.position.y, rect.end.y)
                _seg(cx0, cy0, cx1, cy1, (0.6 + rng.randf() * 0.8) * _S, Color.BLACK, 0.20)


## Path B — warm sandstone brick.
static func _cobble_b(rng: RandomNumberGenerator) -> void:
    _fill(Color("3a2e1e"))
    _noise(rng, 2500, _rgb(30, 20, 12), 0.0, 20.0, 0.10)
    const COLS := 6
    const ROWS := 10
    var gx := float(SZ) / COLS
    var gy := float(SZ) / ROWS
    var pad := 4.0 * _S
    for row in ROWS:
        for col in COLS:
            var off_x := gx * 0.5 if (row & 1) else 0.0
            var px := fposmod(col * gx + off_x, float(SZ)) + (rng.randf() - 0.5) * gx * 0.1
            var py := row * gy + (rng.randf() - 0.5) * gy * 0.1
            var pw := (gx - pad) * (0.82 + rng.randf() * 0.20)
            var ph := (gy - pad) * (0.78 + rng.randf() * 0.24)

            var v := 160.0 + rng.randf() * 40.0
            var r := v + 15.0
            var g := v - 10.0
            var b := v - 40.0

            var rect := Rect2(px + pad * 0.5, py + pad * 0.5, pw, ph)
            _brick(rect, minf(pw, ph) * 0.15, _rgb(r + 18.0, g + 16.0, b + 12.0), _rgb(r, g, b),
                _rgb(r - 22.0, g - 20.0, b - 16.0), 0.5, 0.30, 1.2 * _S,
                _rgb(255, 245, 200), 0.15, 0.25, 0.0)


## Path C — dark wet slate.
static func _cobble_c(rng: RandomNumberGenerator) -> void:
    _fill(Color("0e0e12"))
    _noise(rng, 3000, _rgb(5, 5, 9), 0.0, 12.0, 0.15)
    const COLS := 7
    const ROWS := 6
    var gx := float(SZ) / COLS
    var gy := float(SZ) / ROWS
    var pad := 5.0 * _S
    for row in ROWS:
        for col in COLS:
            var off_x := gx * 0.55 if (row & 1) else 0.0
            var px := fposmod(col * gx + off_x, float(SZ)) + (rng.randf() - 0.5) * gx * 0.2
            var py := row * gy + (rng.randf() - 0.5) * gy * 0.2
            var pw := (gx - pad) * (0.80 + rng.randf() * 0.24)
            var ph := (gy - pad) * (0.78 + rng.randf() * 0.26)

            var v := 42.0 + rng.randf() * 32.0
            var r := v - 5.0
            var g := v - 2.0
            var b := v + 10.0

            var rect := Rect2(px + pad * 0.5, py + pad * 0.5, pw, ph)
            # Rim is a cold blue sheen here rather than a warm highlight — wet slate.
            _brick(rect, minf(pw, ph) * 0.22, _rgb(r + 20.0, g + 20.0, b + 24.0), _rgb(r, g, b),
                _rgb(r - 18.0, g - 18.0, b - 18.0), 0.5, 0.55, 1.5 * _S,
                _rgb(180, 210, 255), 0.08, 0.35, 0.0)

            if rng.randf() < 0.45:
                var cx0 := rect.position.x + rng.randf() * pw * 0.6 + pw * 0.1
                var cy0 := rect.position.y + rng.randf() * ph * 0.6 + ph * 0.1
                var cx1 := clampf(cx0 + (rng.randf() - 0.5) * pw * 0.6, rect.position.x, rect.end.x)
                var cy1 := clampf(cy0 + (rng.randf() - 0.5) * ph * 0.6, rect.position.y, rect.end.y)
                _seg(cx0, cy0, cx1, cy1, (0.5 + rng.randf() * 0.8) * _S, Color.BLACK, 0.25)


static func _dirt_tex(rng: RandomNumberGenerator) -> void:
    _fill(Color("6b4e2a"))
    for i in 200:
        var x := rng.randf() * SZ
        var y := rng.randf() * SZ
        var r := (8.0 + rng.randf() * 24.0) * _S
        var v := rng.randf() * 30.0 - 15.0
        _blob(x, y, r, r, 0.0, _rgb(107.0 + v, 78.0 + v, 42.0 + v), 0.55)
    _noise(rng, 8000, _rgb(60, 35, 8), 0.0, 40.0, 0.18)
    for i in 60:
        var x := (10.0 + rng.randf() * (SZ - 20.0))
        var y := (10.0 + rng.randf() * (SZ - 20.0))
        var rp := (2.0 + rng.randf() * 4.0) * _S
        var v := 110.0 + rng.randf() * 40.0
        _ellipse(x, y, rp * (0.7 + rng.randf() * 0.6), rp * (0.7 + rng.randf() * 0.6),
            rng.randf() * PI, _rgb(v - 5.0, v - 12.0, v - 18.0))
    _cracks(rng, 12, _rgb(30, 18, 8), 0.25, 0.5, 1.5, 4, 30.0)


static func _sand_tex(rng: RandomNumberGenerator) -> void:
    _fill(Color("c8aa68"))
    for i in 300:
        var x := rng.randf() * SZ
        var y := rng.randf() * SZ
        var r := (5.0 + rng.randf() * 30.0) * _S
        var v := rng.randf() * 25.0 - 12.0
        _blob(x, y, r, r, 0.0, _rgb(200.0 + v, 170.0 + v, 104.0 + v), 0.35)
    _noise(rng, 6000, _rgb(183, 153, 88), -17.0, 18.0, 0.20, 1)
    # Wind ripples: a full-width sine polyline per band.
    for rr in 18:
        var y0 := rr * (float(SZ) / 18.0) + (rng.randf() - 0.5) * 12.0 * _S
        var amp := (3.0 + rng.randf() * 6.0) * _S
        var freq := (0.01 + rng.randf() * 0.015) / _S
        var phase := rng.randf() * TAU
        var col := _rgb(180.0 + rng.randf() * 20.0, 148.0 + rng.randf() * 15.0, 80.0)
        var a := 0.10 + rng.randf() * 0.12
        var w := (1.0 + rng.randf()) * _S
        var px := 0.0
        var py := y0 + sin(phase) * amp
        while px < SZ:
            var nx := px + 4.0
            var ny := y0 + sin(nx * freq + phase) * amp
            _seg(px, py, nx, ny, w, col, a)
            px = nx
            py = ny
    for i in 40:
        var x := 8.0 + rng.randf() * (SZ - 16.0)
        var y := 8.0 + rng.randf() * (SZ - 16.0)
        var rp := (1.5 + rng.randf() * 3.0) * _S
        var v := 130.0 + rng.randf() * 40.0
        _ellipse(x, y, rp * (0.8 + rng.randf() * 0.5), rp * (0.6 + rng.randf() * 0.5),
            rng.randf() * PI, _rgb(v + 10.0, v + 5.0, v - 10.0))


## Cracked obsidian with a glowing vein network. The veins come from a cheap proximity
## graph — 22 scattered points plus 8 fixed edge anchors, each point joined to its three
## nearest neighbours — which is what gives the network its plate-like cells.
static func _lava_tex(rng: RandomNumberGenerator) -> void:
    _fill(Color("0a0604"))
    for i in 250:
        var x := rng.randf() * SZ
        var y := rng.randf() * SZ
        var r := (6.0 + rng.randf() * 30.0) * _S
        var v := rng.randf() * 18.0
        _blob(x, y, r, r, 0.0, _rgb(20.0 + v, 12.0 + v, 8.0 + v), 0.6)
    _noise(rng, 5000, Color(0, 0, 0), 0.0, 15.0, 0.20)

    var pts: Array[Vector2] = []
    for i in 22:
        pts.append(Vector2(rng.randf() * SZ, rng.randf() * SZ))
    var all_pts: Array[Vector2] = pts.duplicate()
    var h := float(SZ) * 0.5
    for p in [Vector2(0, 0), Vector2(SZ, 0), Vector2(0, SZ), Vector2(SZ, SZ),
            Vector2(h, 0), Vector2(0, h), Vector2(SZ, h), Vector2(h, SZ)]:
        all_pts.append(p)

    for i in pts.size():
        var order: Array = []
        for j in all_pts.size():
            if j == i:
                continue
            var d: float = all_pts[j].distance_to(pts[i])
            if d <= 0.0:
                continue
            order.append({"j": j, "d": d})
        order.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["d"]) < float(b["d"]))
        for k in mini(3, order.size()):
            var p0: Vector2 = pts[i]
            var p1: Vector2 = all_pts[order[k]["j"]]
            var mx := (p0.x + p1.x) * 0.5 + (rng.randf() - 0.5) * 35.0 * _S
            var my := (p0.y + p1.y) * 0.5 + (rng.randf() - 0.5) * 35.0 * _S
            _quad(p0.x, p0.y, mx, my, p1.x, p1.y, 7.0 * _S, _rgb(200, 60, 0), 0.35)
            _quad(p0.x, p0.y, mx, my, p1.x, p1.y, 3.0 * _S, _rgb(255, 130, 20), 0.60)
            _quad(p0.x, p0.y, mx, my, p1.x, p1.y, 1.0 * _S, _rgb(255, 220, 60), 0.85)

    for p in pts:
        if rng.randf() < 0.6:
            var r := (8.0 + rng.randf() * 22.0) * _S
            _radial3(p.x, p.y, r, _rgb(255, 200, 50), 0.7, _rgb(220, 80, 10), 0.4, 0.3, _rgb(120, 20, 0))

    _wash(_rgb(5, 3, 2), 0.28)
