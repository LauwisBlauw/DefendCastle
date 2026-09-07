shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_disabled;

uniform vec4 water_color : source_color = vec4(0.12, 0.40, 0.43, 1.0);
// Godot puts a spatial material in the OPAQUE pass unless the fragment writes ALPHA,
// whatever blend_mix says. Without this the surf quad hid the pond bed underneath it
// completely — the deep/shallow layers were built and then covered up. The JS reference
// uses opacity 0.52 with depthWrite off, which is what this reproduces.
uniform float water_alpha : hint_range(0.0, 1.0) = 0.52;
varying vec3 world_pos;
void vertex() {
    world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}
void fragment() {
    float ripples = sin(world_pos.x * 5.0 + world_pos.z * 2.5 + TIME * 1.2)
        * sin(world_pos.z * 4.3 - TIME * 0.8);
    float glint = smoothstep(0.79, 0.97, ripples);
    ALBEDO = mix(water_color.rgb, vec3(0.62, 0.85, 0.80), glint * 0.30);
    ROUGHNESS = 0.25;
    METALLIC = 0.22;
    EMISSION = water_color.rgb * 0.08;
    ALPHA = water_alpha;
}
