# DefendCastle 🏰

A voxel-art 3D tower defense game built with [Three.js](https://threejs.org/). Defend your castle
across 5 story realms and an endless mode against 13 enemy types, using 10 defender types,
upgrades, walls, traps and rally tactics — all rendered in a hand-crafted Minecraft-inspired
style with fully procedural music and sound (no audio files).

## Play

```bash
npm install
npm run dev        # → http://localhost:5173
```

| Mode | URL |
|---|---|
| Normal game (level select) | `http://localhost:5173/` |
| Skip menu, free play | `http://localhost:5173/?nomenu` |
| Test arena | `http://localhost:5173/?test` |
| Object studio | `http://localhost:5173/?studio` |
| Map editor | `http://localhost:5173/?map` |
| Headless / CI (minimal rendering) | `http://localhost:5173/?headless` |

### Controls

- **Mouse** — place defenders, drag to orbit, scroll to zoom; **WASD** pans the camera
- **Enter** start wave · **P** pause · **M** mute · **1-9, 0** pick build tool · **Q** deselect
- **U** upgrade · **X** sell · **R** rally point · right-click cancels the current tool
- Walls and spike traps support drag-to-paint

## Development

Everything lives in two files by design: `index.html` (UI markup + CSS) and `src/main.js`
(game logic, rendering, audio, editors, test harness).

### Automated balance testing

The dev server (see `vite.config.js`) exposes a small test API, and the game exposes a
`TEST.*` harness in the browser console (open the Test Arena or just call it — it switches
modes itself):

```js
await TEST.battle({
  label: 'tower_vs_grunts',
  defenders: [['tower', 40, 26]],
  enemies:   [['grunt', 8]],
  speed: 3, timeout: 30,
});
// also: TEST.compare, TEST.sweep, TEST.optimize, TEST.wave(n), TEST.multiWave, TEST.help()
```

From a terminal:

```bash
# push a script into every connected browser tab
curl -X POST localhost:5173/test-run -H 'Content-Type: application/json' \
  -d '{"script":"await TEST.battle({defenders:[[\"tower\",40,26]],enemies:[[\"grunt\",8]]})"}'

curl localhost:5173/test-result    # last battle result (JSON)
curl localhost:5173/test-history   # last 50 results

npm run diag                       # full balance diagnostic (~5 min, needs a connected tab)
```

### Headless / CI runs

No desktop browser? `scripts/headless-client.mjs` connects a headless Chromium tab to the dev
server so the whole harness above works in a container:

```bash
npm run dev &
node scripts/headless-client.mjs &     # connects to :5173, control API on :9222

# control API
curl -X POST localhost:9222/eval --data 'TEST.stats()'   # evaluate JS in the page
curl localhost:9222/shot                                 # screenshot → /tmp/shot.png
curl localhost:9222/reload
```

Load the game with `?headless` in that tab (e.g. via `/eval` navigation): the game then skips
almost all rendering (1 frame/s for screenshots) so game logic runs at full speed under
software GL.
