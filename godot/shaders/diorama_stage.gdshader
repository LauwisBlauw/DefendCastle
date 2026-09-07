shader_type spatial;
render_mode diffuse_burley, specular_disabled;
uniform vec4 stage_color : source_color = vec4(0.15, 0.24, 0.25, 1.0);
varying vec3 world_pos;
void vertex() {
    world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}
void fragment() {
    float distance_from_board = length((world_pos.xz - vec2(35.5, 26.5)) * vec2(0.8, 1.0));
    float vignette = smoothstep(32.0, 110.0, distance_from_board);
    ALBEDO = stage_color.rgb * mix(1.08, 0.55, vignette);
    ROUGHNESS = 1.0;
}
