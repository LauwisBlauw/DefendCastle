shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;
uniform vec4 ring_color : source_color = vec4(0.46, 0.85, 0.79, 1.0);
uniform bool square_marker = false;
void fragment() {
    vec2 p = UV * 2.0 - 1.0;
    float d = square_marker ? max(abs(p.x), abs(p.y)) : length(p);
    float aa = max(fwidth(d), 0.002);
    float border = smoothstep(0.95 - aa, 0.95, d) * (1.0 - smoothstep(0.98, 0.98 + aa, d));
    float fill = (1.0 - smoothstep(0.96, 0.96 + aa, d)) * 0.045;
    if (square_marker) {
        border *= step(0.46, min(abs(p.x), abs(p.y)));
        fill *= 2.0;
    }
    ALBEDO = ring_color.rgb;
    ALPHA = (border * 0.82 + fill) * ring_color.a;
}
