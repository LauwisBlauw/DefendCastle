# DefendCastle

The playable game is now a **Godot 4** project in [`godot/`](godot/).

## Play

```sh
godot --path godot
```

## Verify

```sh
godot --headless --path godot --script tests/test_logic.gd
godot --headless --path godot tests/sim_runner.tscn
godot --path godot --resolution 1600x900 tests/visual_review.tscn -- --quick
```

The former Three.js/Vite sources remain in `src/` and `index.html` as a migration
reference and as the source for the reproducible audio bake. They are not the active
game runtime. See [`godot/README.md`](godot/README.md) for the Godot architecture,
assets, and supported gameplay scope.
