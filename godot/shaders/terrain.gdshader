shader_type spatial;
render_mode diffuse_burley, specular_disabled;

uniform vec4 earth_dark : source_color = vec4(0.22, 0.34, 0.20, 1.0);
uniform vec4 earth_light : source_color = vec4(0.40, 0.52, 0.27, 1.0);
uniform vec4 fleck_color : source_color = vec4(0.57, 0.63, 0.37, 1.0);
uniform bool road_surface = false;
varying vec3 world_pos;

float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise2(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), f.x),
        mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + vec2(1.0)), f.x), f.y);
}
void vertex() {
    world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}
void fragment() {
    vec2 p = world_pos.xz;
    float broad = noise2(p * 0.22) * 0.65 + noise2(p * 0.63) * 0.35;
    vec3 color = mix(earth_dark.rgb, earth_light.rgb, broad);
    if (road_surface) {
        vec2 bricks = p * vec2(2.4, 3.4);
        bricks.x += mod(floor(bricks.y), 2.0) * 0.5;
        vec2 cell = floor(bricks);
        vec2 f = fract(bricks);
        vec2 aa = max(fwidth(bricks), vec2(0.008));
        vec2 interior = smoothstep(vec2(0.025), vec2(0.025) + aa, f)
            * (1.0 - smoothstep(vec2(0.975) - aa, vec2(0.975), f));
        float stone = interior.x * interior.y;
        color = mix(earth_dark.rgb * 0.78,
            mix(earth_dark.rgb, earth_light.rgb, 0.40 + hash21(cell) * 0.44), stone);
        color += noise2(p * 15.0) * 0.018;
    } else {
        // A handful of short blades, filtered out naturally at overview distance.
        vec2 blade_uv = fract(p * 3.2);
        float seed = hash21(floor(p * 3.2));
        float blade = (1.0 - smoothstep(0.018, 0.055, abs(blade_uv.x - 0.5 + blade_uv.y * 0.12)))
            * smoothstep(0.2, 0.3, blade_uv.y) * (1.0 - smoothstep(0.50, 0.66, blade_uv.y));
        float fade = 1.0 - smoothstep(0.09, 0.30, length(fwidth(p)));
        color = mix(color, fleck_color.rgb, blade * step(0.83, seed) * fade * 0.35);
        color *= 0.97 + noise2(p * 7.0) * 0.06;
    }
    ALBEDO = color;
    ROUGHNESS = 0.93;
}
