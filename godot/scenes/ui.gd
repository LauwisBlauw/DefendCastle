extends CanvasLayer
## Fantasy field-journal UI. Gameplay remains in Main; this layer only presents it.

const UIArt = preload("res://scenes/ui_art.gd")

const BUILD_ORDER := ["wall", "tower", "swordsman", "spiketrap", "archer", "ballista", "spearman", "mage", "knight", "catapult"]
const BUILD_HOTKEYS := {"wall": "1", "tower": "2", "swordsman": "3", "spiketrap": "4", "archer": "5", "ballista": "6", "spearman": "7", "mage": "8", "knight": "9", "catapult": "0"}
const HOTKEY_TO_TOOL := {KEY_1: "wall", KEY_2: "tower", KEY_3: "swordsman", KEY_4: "spiketrap", KEY_5: "archer", KEY_6: "ballista", KEY_7: "spearman", KEY_8: "mage", KEY_9: "knight", KEY_0: "catapult"}
const SHORT_NAMES := {"wall": "Wall", "tower": "Tower", "catapult": "Catapult", "swordsman": "Sword", "knight": "Knight", "spearman": "Spear", "archer": "Archer", "mage": "Mage", "ballista": "Ballista", "spiketrap": "Trap"}
const HINTS := {
    "wall": "Blocks the road. Upgrades into a shooting emplacement.", "tower": "Reliable single-target damage. The backbone of any defence.",
    "catapult": "Splash specialist — hits crowds hard, weak on lone targets.", "swordsman": "Cheap melee filler. Leaves its tile to chase.",
    "knight": "Elite heavy fighter. Best against high-HP elites.", "spearman": "Mid-range hard hitter. Good against tanks.",
    "archer": "Fast long-range burst. Fragile but shreds fast enemies.", "mage": "Slows what it hits. Support caster.",
    "ballista": "Extreme range, pierces two extra bodies.", "spiketrap": "Passive road hazard. Damages and slows everything on it.",
}
const REALM_ART := {1: "realm_1", 2: "realm_2", 3: "realm_3", 4: "realm_4", 5: "realm_5"}
const REALM_COLORS := {1: Color("78b65b"), 2: Color("d29a52"), 3: Color("8ac9dc"), 4: Color("d16e47"), 5: Color("8b6cbd")}

const INK := Color("07101b")
const INK_SOFT := Color("0c1b29")
const SLATE := Color("12283a")
const SLATE_LIFT := Color("19364b")
const PARCHMENT := Color("f3e7c5")
const PARCHMENT_DIM := Color("b8ae94")
const GOLD := Color("d9b55f")
const TEAL := Color("57d8c9")
const TEAL_DEEP := Color("1d7d7a")
const DANGER := Color("df6958")
const SUCCESS := Color("82ca97")
const SHADOW := Color(0.0, 0.0, 0.0, 0.58)

var game: Node = null
var _gold_lbl: Label
var _wave_lbl: Label
var _kills_lbl: Label
var _units_lbl: Label
var _hp_bar: ProgressBar
var _hp_lbl: Label
var _level_lbl: Label
var _start_btn: Button
var _speed_btn: Button
var _zoom_lbl: Label
var _toast_box: PanelContainer
var _toast: Label
var _toast_timer := 0.0
var _ach_box: PanelContainer
var _ach_lbl: Label
var _achievement_queue: Array = []
var _achievement_showing := false
var _last_stand_box: PanelContainer
var _last_stand: Label
var _hint_lbl: Label
var _build_buttons: Dictionary = {}
var _build_views: Dictionary = {}
var _panel: PanelContainer
var _panel_icon: Control
var _panel_title: Label
var _panel_stats: Label
var _panel_upgrade: Button
var _panel_sell: Button
var _panel_rally: Button
var _panel_rally_clear: Button
var _overlay: Control
var _overlay_dim: ColorRect

func _ready() -> void:
    layer = 10
    _build_top_bar()
    _build_build_bar()
    _build_defender_panel()
    _build_toasts()
    _build_overlay()

func bind(g: Node) -> void:
    game = g
    game.state_changed.connect(refresh)
    game.notice.connect(_on_notice)
    game.wave_started.connect(_on_wave_started)
    game.level_finished.connect(_on_level_finished)
    game.merchant_offered.connect(_on_merchant)
    game.achievements_unlocked.connect(_on_achievements)
    game.view_changed.connect(_on_view_changed)
    game.last_stand_changed.connect(_on_last_stand)
    refresh()

# ── Theme primitives ─────────────────────────────────────────────────────────

static func _style(bg: Color, border: Color = Color.TRANSPARENT, radius: int = 8, border_width: int = 1, padding := Vector4(10, 8, 10, 8), shadow: bool = true) -> StyleBoxFlat:
    var s := StyleBoxFlat.new()
    s.bg_color = bg
    s.border_color = border
    s.corner_radius_top_left = radius
    s.corner_radius_top_right = radius
    s.corner_radius_bottom_left = radius
    s.corner_radius_bottom_right = radius
    s.content_margin_left = padding.x
    s.content_margin_top = padding.y
    s.content_margin_right = padding.z
    s.content_margin_bottom = padding.w
    if border.a > 0.0:
        s.set_border_width_all(border_width)
    if shadow:
        s.shadow_color = SHADOW
        s.shadow_size = 5
        s.shadow_offset = Vector2(0, 2)
    return s

func _label(text: String, font_size: int = 14, color: Color = PARCHMENT) -> Label:
    var l := Label.new()
    l.text = text
    l.add_theme_font_size_override("font_size", font_size)
    l.add_theme_color_override("font_color", color)
    l.add_theme_color_override("font_outline_color", Color(0.0, 0.0, 0.0, 0.34))
    l.add_theme_constant_override("outline_size", 1 if font_size >= 15 else 0)
    return l

func _art(id: String, art_size: Vector2, primary: Color = GOLD, secondary: Color = TEAL, dimmed: bool = false) -> Control:
    var art = UIArt.new()
    art.custom_minimum_size = art_size
    art.configure(id, primary, secondary, dimmed)
    return art

func _button(variant := "slate") -> Button:
    var b := Button.new()
    b.focus_mode = Control.FOCUS_ALL
    b.add_theme_font_size_override("font_size", 13)
    var normal := SLATE
    var hover := SLATE_LIFT
    var pressed := INK_SOFT
    var edge := Color(GOLD, 0.72)
    var font := PARCHMENT
    match variant:
        "gold":
            normal = GOLD; hover = GOLD.lightened(0.12); pressed = GOLD.darkened(0.18); edge = Color("f7db8e"); font = INK
        "teal":
            normal = TEAL_DEEP; hover = TEAL_DEEP.lightened(0.16); pressed = TEAL_DEEP.darkened(0.2); edge = TEAL
        "danger":
            normal = Color("703b3d"); hover = Color("8c4645"); pressed = Color("4b2529"); edge = DANGER
        "quiet":
            normal = Color(INK_SOFT, 0.9); hover = SLATE; pressed = INK; edge = Color(PARCHMENT_DIM, 0.35)
    b.add_theme_stylebox_override("normal", _style(normal, edge, 7, 1))
    b.add_theme_stylebox_override("hover", _style(hover, edge.lightened(0.12), 7, 1))
    b.add_theme_stylebox_override("pressed", _style(pressed, edge, 7, 1))
    b.add_theme_stylebox_override("disabled", _style(Color("111b25"), Color("40505c"), 7, 1, Vector4(10, 8, 10, 8), false))
    b.add_theme_stylebox_override("focus", _style(Color.TRANSPARENT, TEAL, 8, 2, Vector4(4, 4, 4, 4), false))
    b.add_theme_color_override("font_color", font)
    b.add_theme_color_override("font_hover_color", font.lightened(0.08))
    b.add_theme_color_override("font_pressed_color", font.darkened(0.14))
    b.add_theme_color_override("font_disabled_color", PARCHMENT_DIM.darkened(0.45))
    return b

func _button_content(button: Button, margins := Vector4(5, 4, 5, 4)) -> VBoxContainer:
    var margin := MarginContainer.new()
    margin.set_anchors_preset(Control.PRESET_FULL_RECT)
    margin.offset_left = margins.x; margin.offset_top = margins.y
    margin.offset_right = -margins.z; margin.offset_bottom = -margins.w
    margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
    button.add_child(margin)
    var content := VBoxContainer.new()
    content.add_theme_constant_override("separation", 1)
    content.mouse_filter = Control.MOUSE_FILTER_IGNORE
    margin.add_child(content)
    return content

func _spacer() -> Control:
    var s := Control.new()
    s.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    return s

func _stars(star_count: int) -> String:
    return "★".repeat(clampi(star_count, 0, SaveData.MAX_STARS)) + "☆".repeat(maxi(0, SaveData.MAX_STARS - star_count))

# ── HUD ──────────────────────────────────────────────────────────────────────

func _build_top_bar() -> void:
    var wrap := MarginContainer.new()
    wrap.set_anchors_preset(Control.PRESET_TOP_WIDE)
    wrap.add_theme_constant_override("margin_left", 18)
    wrap.add_theme_constant_override("margin_right", 18)
    wrap.add_theme_constant_override("margin_top", 14)
    wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
    add_child(wrap)
    var bar := PanelContainer.new()
    bar.custom_minimum_size.y = 66
    bar.add_theme_stylebox_override("panel", _style(Color(INK, 0.94), Color(GOLD, 0.72), 11, 1, Vector4(12, 7, 12, 7)))
    wrap.add_child(bar)
    var row := HBoxContainer.new()
    row.add_theme_constant_override("separation", 10)
    bar.add_child(row)
    row.add_child(_art("crest", Vector2(43, 43), GOLD, TEAL))
    _gold_lbl = _label("0", 20, GOLD); row.add_child(_stat_block("TREASURY", _gold_lbl, GOLD))
    var hp_box := VBoxContainer.new()
    hp_box.custom_minimum_size.x = 190; hp_box.add_theme_constant_override("separation", 2)
    hp_box.add_child(_label("CASTLE WARD", 10, PARCHMENT_DIM))
    var hp_row := HBoxContainer.new(); hp_row.add_theme_constant_override("separation", 7)
    _hp_bar = ProgressBar.new(); _hp_bar.custom_minimum_size = Vector2(139, 15); _hp_bar.max_value = Cfg.CASTLE_MAX_HP; _hp_bar.show_percentage = false
    _hp_bar.add_theme_stylebox_override("background", _style(Color("060b11"), Color("4b5a62"), 5, 1, Vector4(2, 2, 2, 2), false))
    hp_row.add_child(_hp_bar); _hp_lbl = _label("", 12, PARCHMENT); hp_row.add_child(_hp_lbl); hp_box.add_child(hp_row); row.add_child(hp_box)
    _wave_lbl = _label("0", 20, TEAL); row.add_child(_stat_block("WAVE", _wave_lbl, TEAL))
    _kills_lbl = _label("0", 20, PARCHMENT); row.add_child(_stat_block("KILLS", _kills_lbl))
    _units_lbl = _label("0/14", 20, PARCHMENT); row.add_child(_stat_block("GUARD", _units_lbl))
    row.add_child(_spacer())
    _level_lbl = _label("", 12, PARCHMENT_DIM); _level_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT; _level_lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER; _level_lbl.custom_minimum_size.x = 145
    row.add_child(_level_lbl)
    var zoom_out := _button("quiet"); zoom_out.text = "−"; zoom_out.tooltip_text = "Zoom out  (mouse wheel or −)"; zoom_out.custom_minimum_size = Vector2(34, 34); zoom_out.pressed.connect(func(): if game != null: game.zoom_out()); row.add_child(zoom_out)
    _zoom_lbl = _label("100%", 11, PARCHMENT_DIM); _zoom_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; _zoom_lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER; _zoom_lbl.custom_minimum_size = Vector2(40, 34); _zoom_lbl.mouse_filter = Control.MOUSE_FILTER_STOP; _zoom_lbl.tooltip_text = "Reset view  (0)"
    _zoom_lbl.gui_input.connect(func(event): if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT and game != null: game.reset_view())
    row.add_child(_zoom_lbl)
    var zoom_in := _button("quiet"); zoom_in.text = "+"; zoom_in.tooltip_text = "Zoom in  (mouse wheel or +)"; zoom_in.custom_minimum_size = Vector2(34, 34); zoom_in.pressed.connect(func(): if game != null: game.zoom_in()); row.add_child(zoom_in)
    _speed_btn = _button("quiet"); _speed_btn.text = "1×"; _speed_btn.tooltip_text = "Cycle battle speed"; _speed_btn.custom_minimum_size = Vector2(43, 34); _speed_btn.pressed.connect(_cycle_speed); row.add_child(_speed_btn)
    _start_btn = _button("gold"); _start_btn.text = "BEGIN WAVE"; _start_btn.tooltip_text = "Start next wave  (Space)"; _start_btn.custom_minimum_size = Vector2(133, 34); _start_btn.pressed.connect(func(): if game != null: game.start_wave()); row.add_child(_start_btn)

func _stat_block(caption: String, value: Label, caption_color: Color = PARCHMENT_DIM) -> VBoxContainer:
    var box := VBoxContainer.new()
    box.custom_minimum_size.x = 54; box.add_theme_constant_override("separation", 0)
    box.add_child(_label(caption, 9, caption_color)); box.add_child(value)
    return box

# ── Build tray ───────────────────────────────────────────────────────────────

func _build_build_bar() -> void:
    var wrap := MarginContainer.new()
    wrap.set_anchors_preset(Control.PRESET_BOTTOM_WIDE); wrap.grow_vertical = Control.GROW_DIRECTION_BEGIN
    wrap.add_theme_constant_override("margin_left", 18); wrap.add_theme_constant_override("margin_right", 18); wrap.add_theme_constant_override("margin_bottom", 14)
    add_child(wrap)
    var col := VBoxContainer.new(); col.add_theme_constant_override("separation", 5); wrap.add_child(col)
    _hint_lbl = _label("", 12, PARCHMENT); _hint_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; _hint_lbl.add_theme_color_override("font_outline_color", INK); _hint_lbl.add_theme_constant_override("outline_size", 3); col.add_child(_hint_lbl)
    var bar := PanelContainer.new(); bar.add_theme_stylebox_override("panel", _style(Color(INK, 0.95), Color(GOLD, 0.72), 11, 1, Vector4(8, 7, 8, 7))); col.add_child(bar)
    var row := HBoxContainer.new(); row.alignment = BoxContainer.ALIGNMENT_CENTER; row.add_theme_constant_override("separation", 5); bar.add_child(row)
    for tool in BUILD_ORDER:
        var button := _button("slate")
        button.custom_minimum_size = Vector2(96, 79); button.toggle_mode = true
        button.tooltip_text = "%s  [%s]\n%s" % [SHORT_NAMES[tool], BUILD_HOTKEYS[tool], HINTS[tool]]
        button.pressed.connect(_select_tool.bind(tool))
        button.mouse_entered.connect(func(): _hint_lbl.text = "%s  ·  [%s]" % [HINTS[tool], BUILD_HOTKEYS[tool]])
        button.mouse_exited.connect(func(): _hint_lbl.text = "")
        row.add_child(button); _build_buttons[tool] = button
        var content := _button_content(button, Vector4(4, 3, 4, 3))
        var icon_row := Control.new(); icon_row.custom_minimum_size = Vector2(0, 38); icon_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
        var icon := _art(tool, Vector2(43, 38), GOLD, TEAL); icon.set_anchors_preset(Control.PRESET_CENTER_TOP); icon.position = Vector2(-21, 0); icon_row.add_child(icon)
        var key := _label(BUILD_HOTKEYS[tool], 10, GOLD); key.position = Vector2(2, 0); key.mouse_filter = Control.MOUSE_FILTER_IGNORE; icon_row.add_child(key); content.add_child(icon_row)
        var title := _label(SHORT_NAMES[tool].to_upper(), 10, PARCHMENT); title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; title.mouse_filter = Control.MOUSE_FILTER_IGNORE; content.add_child(title)
        var meta := _label("", 9, PARCHMENT_DIM); meta.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; meta.mouse_filter = Control.MOUSE_FILTER_IGNORE; content.add_child(meta)
        _build_views[tool] = {"icon": icon, "title": title, "meta": meta, "key": key}

func _select_tool(tool: String) -> void:
    if game == null or tool not in game.unlocked:
        return
    Snd.play("btn_click")
    game.selected_tool = tool; game.selected_defender = null; refresh()

func _cycle_speed() -> void:
    if game == null:
        return
    game.game_speed = 1.0 if game.game_speed >= 3.0 else game.game_speed + 1.0
    _speed_btn.text = "%d×" % int(game.game_speed)

# ── Selected defender ───────────────────────────────────────────────────────

func _build_defender_panel() -> void:
    _panel = PanelContainer.new()
    _panel.set_anchors_preset(Control.PRESET_CENTER_RIGHT); _panel.grow_horizontal = Control.GROW_DIRECTION_BEGIN; _panel.grow_vertical = Control.GROW_DIRECTION_BOTH; _panel.offset_right = -18; _panel.custom_minimum_size = Vector2(270, 0)
    _panel.add_theme_stylebox_override("panel", _style(Color(INK_SOFT, 0.97), GOLD, 12, 1, Vector4(12, 11, 12, 11))); _panel.visible = false; add_child(_panel)
    var col := VBoxContainer.new(); col.add_theme_constant_override("separation", 7); _panel.add_child(col)
    var heading := HBoxContainer.new(); heading.add_theme_constant_override("separation", 8)
    _panel_icon = _art("tower", Vector2(46, 46), GOLD, TEAL); heading.add_child(_panel_icon)
    var title_box := VBoxContainer.new(); title_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL; title_box.add_child(_label("COMMANDER'S FOCUS", 9, GOLD)); _panel_title = _label("", 17, PARCHMENT); title_box.add_child(_panel_title); heading.add_child(title_box); col.add_child(heading)
    col.add_child(HSeparator.new())
    _panel_stats = _label("", 12, PARCHMENT_DIM); col.add_child(_panel_stats)
    _panel_upgrade = _button("gold"); _panel_upgrade.custom_minimum_size.y = 34; _panel_upgrade.pressed.connect(func(): if game != null: game.upgrade(game.selected_defender)); col.add_child(_panel_upgrade)
    _panel_sell = _button("quiet"); _panel_sell.custom_minimum_size.y = 32; _panel_sell.pressed.connect(func(): if game != null: game.sell(game.selected_defender)); col.add_child(_panel_sell)
    _panel_rally = _button("teal"); _panel_rally.custom_minimum_size.y = 32; _panel_rally.pressed.connect(_toggle_rally); col.add_child(_panel_rally)
    _panel_rally_clear = _button("quiet"); _panel_rally_clear.text = "Clear rally"; _panel_rally_clear.custom_minimum_size.y = 28; _panel_rally_clear.pressed.connect(func(): if game != null: game.clear_rally(game.selected_defender)); col.add_child(_panel_rally_clear)
    var close := _button("quiet"); close.text = "DISMISS"; close.custom_minimum_size.y = 28; close.pressed.connect(func(): if game != null: game.selected_defender = null; refresh()); col.add_child(close)

func _toggle_rally() -> void:
    if game == null:
        return
    game.rally_arm = not game.rally_arm; _refresh_panel()

# ── Notice lane and modal shell ──────────────────────────────────────────────

func _build_toasts() -> void:
    _toast_box = _notice_box(88, GOLD, Vector2(520, 0)); _toast = _label("", 14, PARCHMENT); _toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; _toast.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; _toast_box.add_child(_toast); _toast_box.visible = false
    _ach_box = _notice_box(132, TEAL, Vector2(460, 0)); _ach_lbl = _label("", 13, PARCHMENT); _ach_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; _ach_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; _ach_box.add_child(_ach_lbl); _ach_box.visible = false
    _last_stand_box = _notice_box(176, DANGER, Vector2(600, 0)); _last_stand = _label("", 17, Color("ffe0cb")); _last_stand.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; _last_stand_box.add_child(_last_stand); _last_stand_box.visible = false

func _notice_box(top: float, border: Color, minimum: Vector2) -> PanelContainer:
    # Center the notice through a full-width holder.  Anchoring the panel itself at
    # TOP_CENTER and then offsetting it left caused a collapsed strip in the left
    # half of the viewport whenever the notice had no explicit height.
    var holder := CenterContainer.new()
    holder.set_anchors_preset(Control.PRESET_TOP_WIDE)
    holder.offset_top = top
    holder.offset_bottom = top + 44.0
    holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
    add_child(holder)
    var box := PanelContainer.new()
    box.custom_minimum_size = Vector2(minimum.x, 0.0)
    box.add_theme_stylebox_override("panel", _style(Color(INK, 0.92), border, 8, 1, Vector4(13, 7, 13, 7)))
    box.mouse_filter = Control.MOUSE_FILTER_IGNORE
    holder.add_child(box)
    return box

func _build_overlay() -> void:
    _overlay = Control.new(); _overlay.set_anchors_preset(Control.PRESET_FULL_RECT); _overlay.mouse_filter = Control.MOUSE_FILTER_STOP; _overlay.visible = false; add_child(_overlay)
    _overlay_dim = ColorRect.new(); _overlay_dim.set_anchors_preset(Control.PRESET_FULL_RECT); _overlay_dim.color = Color(0.01, 0.025, 0.05, 0.78); _overlay_dim.mouse_filter = Control.MOUSE_FILTER_STOP; _overlay.add_child(_overlay_dim)

func _overlay_card(width: float, offset_y: float = -240.0) -> VBoxContainer:
    for child in _overlay.get_children():
        if child != _overlay_dim:
            child.queue_free()
    var viewport_width := get_viewport().get_visible_rect().size.x
    var safe_width := minf(width, maxf(320.0, viewport_width - 32.0))
    # CenterContainer owns the centering.  Mixing a center anchor with a manual
    # position made the old map modal grow leftward and crop its first realms.
    var holder := CenterContainer.new()
    holder.set_anchors_preset(Control.PRESET_FULL_RECT)
    holder.offset_top = offset_y
    holder.offset_bottom = offset_y
    holder.mouse_filter = Control.MOUSE_FILTER_PASS
    _overlay.add_child(holder)
    var card := PanelContainer.new()
    card.custom_minimum_size.x = safe_width
    card.add_theme_stylebox_override("panel", _style(Color("0b1b29"), GOLD, 15, 1, Vector4(18, 15, 18, 16)))
    holder.add_child(card)
    var col := VBoxContainer.new(); col.add_theme_constant_override("separation", 9); card.add_child(col); return col

func _modal_header(col: VBoxContainer, title: String, subtitle: String, art_id := "crest", color: Color = GOLD) -> void:
    var row := HBoxContainer.new(); row.alignment = BoxContainer.ALIGNMENT_CENTER; row.add_theme_constant_override("separation", 9); row.add_child(_art(art_id, Vector2(48, 48), color, TEAL))
    var copy := VBoxContainer.new(); copy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    var heading := _label(title, 25, PARCHMENT); heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; copy.add_child(heading)
    var sub := _label(subtitle, 11, PARCHMENT_DIM); sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; copy.add_child(sub); row.add_child(copy); row.add_child(_art(art_id, Vector2(48, 48), color, TEAL)); col.add_child(row)

func _on_notice(text: String, ms: int) -> void:
    _toast.text = text; _toast_box.visible = true; _toast_timer = float(ms) / 1000.0

func _on_wave_started(n: int) -> void:
    _on_notice("WAVE %d  ·  the road is alive" % n, 1700); refresh()

func _on_last_stand(active: bool, seconds: float) -> void:
    _last_stand_box.visible = active
    if active:
        _last_stand.text = "LAST STAND  ·  %ds  ·  defenders strike 3×" % ceili(maxf(seconds, 0.0))

# ── Outcomes and intermissions ───────────────────────────────────────────────

func _on_level_finished(won: bool, stars: int) -> void:
    var col := _overlay_card(500.0, -210.0)
    _modal_header(col, "REALM SECURED" if won else "THE WARD HAS FALLEN", game.level_def.get("name", ""), "crest", GOLD if won else DANGER)
    if won:
        var seals := _label(_stars(stars), 38, GOLD); seals.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; col.add_child(seals)
        var result: Dictionary = game.last_level_result; var lines: Array[String] = []
        if bool(result.get("is_new_star_record", false)): lines.append("New star chronicle")
        if bool(result.get("is_new_time_record", false)): lines.append("Swiftest clear on this difficulty")
        if bool(result.get("is_new_kill_record", false)): lines.append("New battle tally")
        if bool(result.get("campaign_complete", false)): lines.append("The campaign map is complete")
        if not lines.is_empty():
            var record := _label("  ·  ".join(lines), 12, TEAL); record.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; col.add_child(record)
    var summary := _label("%d kills  ·  castle %d/%d" % [game.kills, game.castle_hp, Cfg.CASTLE_MAX_HP], 13, PARCHMENT_DIM); summary.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; col.add_child(summary)
    var next_id := int(game.level_def.get("id", 1)) + 1
    if won and Cfg.level_by_id(next_id).size() > 0 and SaveData.is_level_unlocked(next_id):
        var next := _button("gold"); next.text = "CONTINUE  ·  %s" % Cfg.level_by_id(next_id).get("name", "Next realm"); next.custom_minimum_size.y = 39; next.pressed.connect(func(): _overlay.visible = false; game.start_level(next_id)); col.add_child(next)
    var retry := _button("slate"); retry.text = "RETRY THIS REALM"; retry.custom_minimum_size.y = 35; retry.pressed.connect(func(): _overlay.visible = false; game.start_level(int(game.level_def.get("id", 1)))); col.add_child(retry)
    var map := _button("quiet"); map.text = "RETURN TO THE REALM MAP"; map.custom_minimum_size.y = 31; map.pressed.connect(show_level_select); col.add_child(map); _overlay.visible = true

func _on_merchant(offers: Array) -> void:
    var col := _overlay_card(900.0, -215.0); _modal_header(col, "THE TRAVELLING MERCHANT", "Take one provision before the next bell", "merchant", GOLD)
    var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 10); col.add_child(row)
    for offer in offers:
        var card := _button("slate"); card.custom_minimum_size = Vector2(270, 112); card.tooltip_text = offer.get("desc", "")
        card.pressed.connect(func(): game.take_merchant_offer(offer["id"]); _overlay.visible = false; _on_notice("%s claimed" % offer["name"], 1800)); row.add_child(card)
        var content := _button_content(card, Vector4(8, 7, 8, 7)); var icon := _art("merchant", Vector2(38, 38), GOLD, TEAL); icon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; content.add_child(icon)
        var name := _label(str(offer["name"]).to_upper(), 13, PARCHMENT); name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; content.add_child(name)
        var desc := _label(str(offer["desc"]), 11, PARCHMENT_DIM); desc.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; content.add_child(desc)
    var skip := _button("quiet"); skip.text = "LEAVE THE WAGON  ·  no provision"; skip.custom_minimum_size.y = 31; skip.pressed.connect(func(): _overlay.visible = false); col.add_child(skip); _overlay.visible = true

# ── Realm map and archive ────────────────────────────────────────────────────

func show_level_select() -> void:
    # The map has a tall five-card route; keep its journal header inside the viewport
    # instead of shifting the whole modal above the top edge on desktop screens.
    var col := _overlay_card(1110.0, 0.0)
    var campaign: Dictionary = SaveData.get_campaign_progress()
    var completed := int(campaign.get("completed_levels", 0)); var total_stars := int(campaign.get("best_stars", 0)); var max_stars := int(campaign.get("max_stars", Cfg.LEVELS.size() * SaveData.MAX_STARS))
    _modal_header(col, "THE FIVE REALMS", "%d / %d sigils recovered  ·  %d / %d realms secured" % [total_stars, max_stars, completed, Cfg.LEVELS.size()], "crest", GOLD)
    var viewport_width := get_viewport().get_visible_rect().size.x
    var compact_map := viewport_width < 1220.0
    var card_width := 204.0 if not compact_map else clampf((viewport_width - 84.0) / 3.0, 132.0, 204.0)
    if compact_map:
        var route_grid := GridContainer.new()
        route_grid.columns = 3
        route_grid.add_theme_constant_override("h_separation", 8)
        route_grid.add_theme_constant_override("v_separation", 8)
        route_grid.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
        col.add_child(route_grid)
        for level in Cfg.LEVELS:
            route_grid.add_child(_realm_card(level, card_width))
    else:
        var route := HBoxContainer.new(); route.add_theme_constant_override("separation", 10); route.alignment = BoxContainer.ALIGNMENT_CENTER; col.add_child(route)
        for level in Cfg.LEVELS:
            route.add_child(_realm_card(level, card_width))
    var footer := HBoxContainer.new(); footer.alignment = BoxContainer.ALIGNMENT_CENTER; footer.add_theme_constant_override("separation", 10); col.add_child(footer)
    var endless_ready := bool(campaign.get("completed", false))
    var endless := _button("teal" if endless_ready else "quiet"); endless.text = "ENDLESS WATCH  ·  wave 16" if endless_ready else "ENDLESS WATCH  ·  seal all five realms"; endless.disabled = not endless_ready; endless.custom_minimum_size = Vector2(310, 34); endless.pressed.connect(func(): _overlay.visible = false; game.start_level(int(Cfg.ENDLESS_LEVEL["id"]))); footer.add_child(endless)
    var archive := _button("quiet"); archive.text = "OPEN THE ARCHIVE"; archive.custom_minimum_size = Vector2(210, 34); archive.pressed.connect(show_stats); footer.add_child(archive)
    var difficulty := HBoxContainer.new(); difficulty.alignment = BoxContainer.ALIGNMENT_CENTER; difficulty.add_theme_constant_override("separation", 7); difficulty.add_child(_label("CHOOSE YOUR OATH", 10, PARCHMENT_DIM)); col.add_child(difficulty)
    for key in ["easy", "normal", "hard"]:
        var diff := _button("gold" if game != null and game.difficulty == key else "quiet"); diff.text = Cfg.DIFFICULTY[key]["label"].to_upper(); diff.toggle_mode = true; diff.button_pressed = game != null and game.difficulty == key; diff.custom_minimum_size = Vector2(89, 29)
        # Persistence is owned by Main; never assign game.difficulty directly.
        diff.pressed.connect(func(): game.set_difficulty(key); show_level_select()); difficulty.add_child(diff)
    _overlay.visible = true

func _realm_card(level: Dictionary, card_width: float = 204.0) -> Button:
    var level_id := int(level["id"])
    # The map is deliberately driven by save data: locked places remain visible, but cannot be entered.
    var unlocked := SaveData.is_level_unlocked(level_id)
    var progress := SaveData.get_level_progress(level_id)
    var stars := int(progress.get("best_stars", 0))
    var card := _button("slate" if unlocked else "quiet")
    card.custom_minimum_size = Vector2(card_width, 190); card.disabled = not unlocked; card.tooltip_text = "%s  ·  waves %d–%d" % [level["name"], level["startWave"], level["endWave"]]
    card.pressed.connect(func(): _overlay.visible = false; game.start_level(level_id))
    var content := _button_content(card, Vector4(7, 7, 7, 6))
    var num := _label("REALM %d" % level_id, 9, GOLD if unlocked else PARCHMENT_DIM); num.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; content.add_child(num)
    var art := _art(REALM_ART.get(level_id, "crest"), Vector2(80, 76), REALM_COLORS.get(level_id, GOLD), TEAL, not unlocked); art.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; content.add_child(art)
    var name := _label(str(level["name"]).to_upper() if unlocked else "SEALED REALM", 12, PARCHMENT if unlocked else PARCHMENT_DIM); name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; name.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; content.add_child(name)
    var state := _stars(stars) if unlocked else "COMPLETE THE PRIOR REALM"
    var record := _label(state, 12 if unlocked else 9, GOLD if unlocked else PARCHMENT_DIM); record.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; content.add_child(record)
    var waves := _label("WAVES %d–%d" % [level["startWave"], level["endWave"]], 9, PARCHMENT_DIM); waves.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; content.add_child(waves)
    return card

## Archive reads SaveData directly, so it remains useful before a run begins.
func show_stats() -> void:
    var col := _overlay_card(940.0, -284.0)
    var campaign: Dictionary = SaveData.get_campaign_progress()
    _modal_header(col, "THE WAR ARCHIVE", "%d sigils  ·  %d realms secured  ·  %s oath" % [int(campaign.get("best_stars", 0)), int(campaign.get("completed_levels", 0)), Cfg.DIFFICULTY[SaveData.get_difficulty()]["label"]], "record", GOLD)
    var grid := GridContainer.new(); grid.columns = 4; grid.add_theme_constant_override("h_separation", 22); grid.add_theme_constant_override("v_separation", 7); col.add_child(grid)
    for heading in ["REALM", "SIGILS", "BEST TIME", "MOST KILLS"]:
        grid.add_child(_label(heading, 10, GOLD))
    var active_difficulty: String = str(game.difficulty) if game != null else SaveData.get_difficulty()
    for level in Cfg.LEVELS:
        var level_id := int(level["id"]); var progress := SaveData.get_level_progress(level_id); var locked: bool = not SaveData.is_level_unlocked(level_id)
        var raw_times: Variant = progress.get("best_times", {}); var times: Dictionary = raw_times if raw_times is Dictionary else {}; var time_text := "—"
        if times.has(active_difficulty): time_text = SaveData.format_time(float(times[active_difficulty]))
        grid.add_child(_label(str(level["name"]), 14, PARCHMENT_DIM if locked else PARCHMENT))
        grid.add_child(_label("SEALED" if locked else _stars(int(progress.get("best_stars", 0))), 14, PARCHMENT_DIM if locked else GOLD))
        grid.add_child(_label(time_text, 14, PARCHMENT)); grid.add_child(_label(str(int(progress.get("best_kills", 0))), 14, PARCHMENT))
    col.add_child(HSeparator.new())
    var achievements = game.achievements if game != null else Achievements.new(SaveData.get_achievements())
    col.add_child(_label("HONOURS  ·  %d / %d earned" % [achievements.unlocked_count(), Achievements.ALL.size()], 11, TEAL))
    var back := _button("quiet"); back.text = "RETURN TO THE REALM MAP"; back.custom_minimum_size.y = 33; back.pressed.connect(show_level_select); col.add_child(back); _overlay.visible = true

# ── Live refresh ─────────────────────────────────────────────────────────────

func _on_achievements(ids: Array) -> void:
    if game == null: return
    for id in ids:
        var entry: Dictionary = game.achievements.entry(id)
        if not entry.is_empty(): _achievement_queue.append(entry)
    _drain_achievements()

func _drain_achievements() -> void:
    if _achievement_showing or _achievement_queue.is_empty(): return
    var achievement: Dictionary = _achievement_queue.pop_front(); _achievement_showing = true
    _ach_lbl.text = "%s  ·  %s\n%s" % [achievement["tag"], achievement["name"], achievement["desc"]]; _ach_box.visible = true
    var tween := create_tween(); tween.tween_interval(2.6); tween.tween_callback(func(): _ach_box.visible = false; _achievement_showing = false; _drain_achievements())

func _on_view_changed(zoom: float) -> void:
    if _zoom_lbl != null: _zoom_lbl.text = "%d%%" % roundi(zoom * 100.0)

func refresh() -> void:
    if game == null: return
    _gold_lbl.text = str(game.gold); _wave_lbl.text = str(game.wave); _kills_lbl.text = str(game.kills); _units_lbl.text = "%d/%d" % [game.used_slots(), game.max_defenders()]
    _hp_bar.value = game.castle_hp; _hp_lbl.text = str(game.castle_hp)
    var hp_pct := float(game.castle_hp) / float(Cfg.CASTLE_MAX_HP); var hp_color := SUCCESS if hp_pct > 0.5 else (GOLD if hp_pct > 0.25 else DANGER)
    _hp_bar.add_theme_stylebox_override("fill", _style(hp_color.darkened(0.1), hp_color.lightened(0.12), 5, 1, Vector4(2, 2, 2, 2), false))
    var diff: Dictionary = Cfg.DIFFICULTY.get(game.difficulty, Cfg.DIFFICULTY["normal"]); var suffix := ""
    if game.haste_waves > 0: suffix += "  ·  HASTE %d" % game.haste_waves
    if game.double_bonus_wave: suffix += "  ·  BOUNTY ×2"
    _level_lbl.text = "%s\n%s%s" % [game.level_def.get("name", ""), diff["label"], suffix]
    _start_btn.disabled = game._wave_active or not game.running; _start_btn.text = "WAVE ACTIVE" if game._wave_active else "BEGIN WAVE"; _speed_btn.text = "%d×" % int(game.game_speed)
    for tool in BUILD_ORDER: _refresh_build_card(tool)
    _refresh_panel()

func _refresh_build_card(tool: String) -> void:
    var button: Button = _build_buttons[tool]; var view: Dictionary = _build_views[tool]
    var locked: bool = tool not in game.unlocked; var selected: bool = game.selected_tool == tool and not locked; var cost := int(Cfg.COSTS[tool]); var slots := int(Cfg.STATS.get(tool, {}).get("unitCost", 1))
    button.disabled = locked; button.button_pressed = selected; button.modulate = Color(1, 1, 1, 0.46 if locked else 1.0)
    var bg := Color("11283b") if not selected else Color("22595d"); var edge := Color(GOLD, 0.56) if not selected else TEAL
    button.add_theme_stylebox_override("normal", _style(bg, edge, 7, 1, Vector4(6, 5, 6, 5), false)); button.add_theme_stylebox_override("hover", _style(bg.lightened(0.12), edge.lightened(0.14), 7, 1, Vector4(6, 5, 6, 5), false))
    var title: Label = view["title"]; var meta: Label = view["meta"]; var key: Label = view["key"]; var icon = view["icon"]
    title.text = SHORT_NAMES[tool].to_upper(); key.add_theme_color_override("font_color", TEAL if selected else GOLD)
    if locked:
        meta.text = "SEALED · W%d" % int(game.UNLOCK_WAVES.get(tool, 0)); meta.add_theme_color_override("font_color", PARCHMENT_DIM); icon.configure(tool, GOLD, TEAL, true)
    else:
        meta.text = "%dg · %d slot%s" % [cost, slots, "" if slots == 1 else "s"]; meta.add_theme_color_override("font_color", GOLD if game.gold >= cost else DANGER); icon.configure(tool, TEAL if selected else GOLD, TEAL, false)

func _refresh_panel() -> void:
    if game == null: return
    var defender = game.selected_defender
    if defender == null or not is_instance_valid(defender) or not defender.alive:
        _panel.visible = false; return
    _panel.visible = true; _panel_icon.configure(defender.type_name, GOLD, TEAL, false); _panel_title.text = "%s  ·  LV %d" % [game.UNIT_NAMES.get(defender.type_name, defender.type_name), defender.level]
    var lines: Array[String] = ["WARD  %d / %d" % [int(defender.hp), int(defender.max_hp)], "TAKEDOWNS  %d" % defender.kills]
    if defender.range_r > 0.0: lines.append("RANGE  %.1f tiles" % defender.range_r)
    if defender.dmg > 0.0: lines.append("STRIKE  %.1f  ·  %.2f/s" % [defender.dmg, defender.rate])
    if defender.aoe > 0.0: lines.append("SPLASH  %.1f tiles" % defender.aoe)
    _panel_stats.text = "\n".join(lines)
    if defender.type_name == "spiketrap":
        _panel_upgrade.visible = false; _panel_sell.visible = false
    else:
        _panel_upgrade.visible = true; _panel_sell.visible = true
        if defender.level >= Cfg.MAX_LEVEL:
            _panel_upgrade.disabled = true; _panel_upgrade.text = "FULLY FORGED"
        else:
            var cost := Cfg.upgrade_cost(defender.type_name, defender.level); var need := Cfg.upgrade_kills_needed(defender.type_name, defender.level)
            _panel_upgrade.disabled = defender.kills < need or game.gold < cost; _panel_upgrade.text = "FORGE UPGRADE  ·  %dg  ·  %d/%d kills" % [cost, defender.kills, need]
        _panel_sell.text = "DISMANTLE  ·  +%dg" % defender.sell_value()
    if defender.can_rally():
        _panel_rally.visible = true; _panel_rally.text = "CHOOSE RALLY TILE…" if game.rally_arm else "SET RALLY POINT"; _panel_rally_clear.visible = defender.rally != Vector2.INF
    else:
        _panel_rally.visible = false; _panel_rally_clear.visible = false

func _unhandled_key_input(event: InputEvent) -> void:
    if game == null or _overlay.visible or not (event is InputEventKey) or not event.pressed or event.echo: return
    var tool: String = HOTKEY_TO_TOOL.get(event.keycode, "")
    if tool != "" and tool in game.unlocked:
        _select_tool(tool); get_viewport().set_input_as_handled()

func _process(delta: float) -> void:
    if _toast_timer > 0.0:
        _toast_timer -= delta
        if _toast_timer <= 0.0: _toast_box.visible = false
    if _panel != null and _panel.visible: _refresh_panel()
