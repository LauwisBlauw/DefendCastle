extends Node
## Sound playback. The JS build synthesises everything live with Web Audio — 55 audio
## node constructions and a chip-tune engine driven by setTimeout. Godot has no
## equivalent model, so `tools/bake_audio.mjs` runs that ORIGINAL engine against an
## OfflineAudioContext and writes what it produces to res://audio. This just plays the
## results back: same sounds, none of the runtime cost, and it exports to mobile and
## console, which was the whole reason for the port.
##
## One-shots are pooled. A busy wave fires dozens of overlapping sounds a second, and
## allocating a player per shot is the audio equivalent of allocating a material per box.

const SFX_DIR := "res://audio/sfx/"
const MUSIC_DIR := "res://audio/music/"
const POOL_SIZE := 24

## Level -> track, verbatim from LEVEL_SONGS in the JS.
const LEVEL_SONGS := {1: "wide", 2: "bazaar", 3: "frost", 4: "ember", 5: "abyss"}

## Some sounds are fired many times per second by a big wave. Re-triggering the same
## one inside this window just stacks phase-cancelling copies and reads as a buzz, so
## repeats are throttled — the JS does the same with its lastHitMs guards.
const THROTTLE := {
    "enemy_hit": 0.045, "hit": 0.045, "arrow": 0.03, "bolt": 0.03,
    "footstep": 0.10, "enemy_die": 0.05,
}

var sfx_volume: float = 0.9
var music_volume: float = 0.55
var enabled: bool = true

var _cache: Dictionary = {}
var _pool: Array[AudioStreamPlayer] = []
var _next: int = 0
var _last_played: Dictionary = {}
var _music: AudioStreamPlayer = null
var _current_track: String = ""

func _ready() -> void:
    for i in POOL_SIZE:
        var p := AudioStreamPlayer.new()
        add_child(p)
        _pool.append(p)
    _music = AudioStreamPlayer.new()
    add_child(_music)

func _load(dir: String, name: String, ext: String) -> AudioStream:
    var key: String = dir + name
    if _cache.has(key):
        return _cache[key]
    var path: String = dir + name + ext
    var s: AudioStream = null
    if ResourceLoader.exists(path):
        s = load(path)
    _cache[key] = s          # cache misses too, so a missing file is looked up once
    return s

## Fire a one-shot. Unknown names are ignored rather than raised: the call sites are
## spread across the whole game and a missing cue should never take down a wave.
func play(name: String, volume_db: float = 0.0) -> void:
    if not enabled:
        return
    var now: float = Time.get_ticks_msec() / 1000.0
    if THROTTLE.has(name):
        if now - float(_last_played.get(name, -99.0)) < float(THROTTLE[name]):
            return
        _last_played[name] = now
    var stream: AudioStream = _load(SFX_DIR, name, ".wav")
    if stream == null:
        return
    var p: AudioStreamPlayer = _pool[_next]
    _next = (_next + 1) % POOL_SIZE
    p.stream = stream
    p.volume_db = volume_db + linear_to_db(maxf(sfx_volume, 0.0001))
    p.play()

## Per-enemy-type attack grunt, falling back to the generic one.
func play_enemy_attack(type: String) -> void:
    if type in ["troll", "rockTroll", "cyclops"]:
        play("enemy_attack_troll")
    elif type in ["brute", "boss"]:
        play("enemy_attack_brute")
    else:
        play("enemy_attack_grunt")

func play_music(track: String) -> void:
    if not enabled or track == _current_track:
        return
    var stream: AudioStream = _load(MUSIC_DIR, track, ".ogg")
    if stream == null:
        return
    if stream is AudioStreamOggVorbis:
        stream.loop = true
    _current_track = track
    _music.stream = stream
    _music.volume_db = linear_to_db(maxf(music_volume, 0.0001))
    _music.play()

func play_level_music(level_id: int) -> void:
    play_music(LEVEL_SONGS.get(level_id, "classic"))

func stop_music() -> void:
    _current_track = ""
    _music.stop()

func set_music_volume(v: float) -> void:
    music_volume = clampf(v, 0.0, 1.0)
    _music.volume_db = linear_to_db(maxf(music_volume, 0.0001))
