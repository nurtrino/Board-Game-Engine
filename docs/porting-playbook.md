# Porting Playbook — importing TTS games into the Board Game Engine

Everything learned about how this engine imports Tabletop Simulator (TTS) mods,
the owner's product preferences, and how to verify the work. Read this before
porting a new game or touching an existing one. When it conflicts with a more
specific spec in `docs/specs/`, the spec wins.

---

## 1. Architecture at a glance

Monorepo, three workspaces:

- **`client/`** — React + `@react-three/fiber` (three.js). The TV board and the
  player devices. Vite build.
- **`server/`** — Express + `ws`. Rooms/lobby + per-game engine dispatch. Runs
  via `tsx` (no typecheck step). Persists rooms to Postgres when
  `DATABASE_URL` is set, else a local file.
- **`shared/`** — the game engines (rules) + golden data, imported directly from
  source (`@bge/shared` → `shared/src/index.ts`, no build step).

**Multi-game.** A room carries a `game` id: `'brass' | 'ttr' | 'trek' |
'darktower'`. The server has an `engines` registry (create/view/apply per game)
and `GAME_SEATS` (seat colours per game). The client dispatches by `view.game`:
`BoardPage` → `TtrBoard`/`TrekBoard`/`DtBoard`; `PlayPage` → `TtrPlay`/`TrekPlay`/
`DtPlay` (Brass renders inline in `PlayPage`/`BoardPage`).

**Rooms are saves.** Persisted continuously, rehydrated at boot, reconnect by a
per-room token in `localStorage`. Deleting a save = `DELETE /api/saves/:id`.

**Routes:** `/` (Home) · `/new` (SelectGame — game tiles, then a save chooser) ·
`/join/:roomId` · `/board/:roomId` (TV) · `/play/:roomId` (device).

---

## 2. The import pipeline (per game)

Source of truth is **the mod's own Lua + save**, never memory or the web. The
mod cache lives at:

```
C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods/Workshop/<workshopId>.json
```

That JSON has `LuaScript` (the Global script) and `ObjectStates` (every object +
transform). Ported mods:

| Game | id | workshop |
|---|---|---|
| Brass: Birmingham | `brass` | ikegami/tts_brass |
| Ticket to Ride: Rails & Sails | `ttr` | 3324777769 |
| Trekking the National Parks | `trek` | 2102536379 |
| Dark Tower | `darktower` | 873019835 |

**Tools** (`tools/tts-extract/`), run with `node`:

- `extract-<game>.mjs` — parses the mod's Lua tables + object transforms →
  writes `games/<game>/golden/*.json` (rules-facing golden: routes, snaps,
  zones, cards, setup) **and** stages assets to `client/public/<game>/` +
  `scene.json` (render-facing: meshes, tints, decks, map, snaps, zones).
- `fit-<game>-map.mjs` — computes the `world → map-pixel` transform (only for
  games with a photographed map; see §3).
- The golden is often mirrored into `shared/src/<game>/board-data.json` /
  `data.json` (the engine imports it). Keep these in sync with the golden.

The Lua's `setSnapPoints({...})` defines **1-based snap indices**; the roads/
harbors/etc. tables reference them. Parse the full block by **brace-matching**,
not `indexOf('})')` (which can truncate). Cross-check the count (e.g. TTR is 452
snaps — an old comment said 468; it's stale) and that every referenced index
resolves.

---

## 3. Map fit — the important, non-obvious part

Two very different situations. Diagnose which one you have first.

### A. Mod 3D world-snaps vs a *separately photographed* map (TTR)

The mod places pieces at 3D world coordinates (`setSnapPoints`), but the board
art is a scanned/rendered image with its own slightly-perspective projection.
You must fit a `world(x,z) → image(px,py)` transform so the printed slots sit
under the snaps.

- **Use a homography (projective), not a plain affine.** The affine leaves
  ~4–8px of perspective residual near the edges; the homography absorbs it
  (~3px mean). Fit it by matching each coloured route's snaps to the centroid of
  its coloured paint blob on the map image, iterating and dropping the worst
  residuals. Only strongly-coloured routes participate (white/black/gray are
  ambiguous on the parchment) — the transform is global, so that's enough.
- **Store** `mapTransform = { ax,bx,cx,ay,by,cy, h:[h0..h7], px:[W,H] }` into
  **both** golden and `scene.json`. `h` is the homography (`px = (h0·wx + h1·wz
  + h2)/(h6·wx + h7·wz + 1)`, `py` with h3..h5); the affine fields are a legacy
  fallback for other tools.
- **Client render (critical):** draw the map as a **subdivided warped mesh**
  whose vertices are the image pixels mapped to world through the *inverse*
  transform (`hmat` → `inv3` → `applyH`, grid ~48×28), UVs = pixel/`px`. This
  makes the art and the pieces ride the *same* transform. **Do not** draw the
  map on a flat `planeGeometry` from two corners — that silently drops the
  transform's shear/perspective and pieces drift (that was the original bug).

### B. Node coordinates measured in the art's own pixel space (Trekking)

Trekking's board nodes are stored as art pixels (`NODES[id].px`) and the board
plane uses the exact same art dimensions (`pxToWorld` with the art's W×H). There
is **no world-to-photo gap**, so **no fit is needed** — it's exact by
construction. Don't add a homography here; it would only add error.

### C. No positional board (Dark Tower)

A plain disc with four quadrants + the electronic tower (LCD/reel step
playback). Pieces sit in a *quadrant*, not on precise snaps. No map, no fit.

### 3D pieces parallax off their slots

Even with a perfect transform, pieces are 3D meshes with height, so when the
camera is **tilted/orbited** their tops parallax off the printed slots (worse at
screen edges). Mitigate by keeping pieces **flat** (low `TALL` scale) and
capping the orbit tilt (`maxPolarAngle`). If pieces look off but the transform
verifies correct (see §6), it's this, not the data.

---

## 4. Coordinate & mesh conventions (all renderers)

- TTS/Unity is left-handed, three.js right-handed. **Mirror world Z**: render at
  `[x, y, -z]`. Negate Y and Z rotations (`rot3`).
- OBJ meshes need a local 180° Y turn to agree with the mirrored world.
- Flat art (tiles/tokens/decks) needs a negative-Z scale + `DoubleSide`.
- Seat a mesh on the board by its bounding box (`BOARD_Y - minY*scale`), and
  centre it in X (`-midX`) — but note that offset rotates with the piece's yaw.

### Black-background board (masking)

To replace a mod's green felt table art with black while keeping alignment:
mask the board diffuse to the **framed map only**, black everywhere else, at the
**same pixel dimensions** (so the node/snap→pixel mapping is unchanged). Find the
map rectangle by scanning inward for the felt colour (e.g. green) from the
centre outward. Then frame the camera on the map rect so it fills the view with
black bands top/bottom/sides for the HUD. Brass and Trekking both do this.

---

## 5. Owner's product preferences (hold these unless told otherwise)

**Visual system**
- Full dark mode. The **lobby** keeps its glassmorphism; **in-game** uses the
  universal `ig-*` HUD in `styles.css` — same lobby tokens (glass, blur,
  hairline borders, black+wash ground), sprucedup for play. Game-agnostic.
- In-game backgrounds are **black**.
- The TV is the shared table (fills the screen with the board); the player
  **devices** hold hands + take actions.

**Copy**
- Serious **UPPERCASE** labels, middot `·` separators, **no em dashes**, **no
  emoji anywhere** (use inline SVG icons instead).
- Sentence-level copy: plain, imperative, no fluff.

**HUD specifics**
- Seat colour is an **outline**, never a dot.
- TV score chips: **name + cash only**; tap a chip for full stats (VP, income,
  buildings, etc.).
- Turn-narration banner is **text** (tile name / action title), with **cost +
  income** along the bottom. A tile *image* was tried and rejected — keep it
  text. Non-build/simple actions stay a single line, no big icon.
- **Clear turnover** indicator on both the TV and the device (pops on each turn
  change).
- Cards should be **big and clear**. Trekking: park river down the **left**,
  major parks down the **right**, both labelled; awards small during play,
  **large + distributed** at game end. Expect the owner to fine-tune sizes
  ("shrink 30%", "much larger") — it's normal iteration.

**Lobby / start**
- Must be **game-aware**: the start button names the actual game, the colour
  picker only shows Brass's portrait tokens for Brass (plain swatches for the
  rest), and the blurb is per-game. Never hardcode "Brass".

**Sound** (`client/src/sfx.ts` + `public/sfx/*.ogg`, Kenney CC0)
- `playSfx(name)`, persisted mute. The **TV voices** each action, the turnover,
  and the win; **devices** click on actions and blip on errors. Dark Tower plays
  its own authentic tower sounds (respects the global mute) — don't double it.

**Show deck** — every card game's device has a button to view the full card
sheets as a reference.

---

## 6. Verification (how to prove it before the owner looks)

The owner **verifies visuals himself** (it's faster) — so your job is to prove
the *data and geometry* are right and hand him a working build.

- **Build + typecheck** must pass: `npm run build -w client` and
  `npx tsc -p client/tsconfig.json --noEmit`. The server runs via `tsx` (no
  typecheck). Ignore pre-existing errors in files another session owns.
- **Snaps match the live mod exactly** — re-parse the mod's `setSnapPoints` and
  compare byte-for-byte to `golden.snaps`. If they match, a re-dump won't help;
  the bug is downstream.
- **Fit quality** — `fit-*.mjs` prints per-iteration residuals (aim ~3–4px on a
  ~3000px map). The inverse transform must **round-trip to 0**
  (`applyH(inv, H(world)) === world`).
- **Overlay diagnostic** — project every snap through the transform onto the
  real board art (draw dots with `sharp` + an SVG overlay) and eyeball that the
  dots sit on the printed slots. This separates "data/transform wrong" from
  "3D render wrong": if the overlay is dead-on but the running board looks off,
  it's a render/parallax issue (§3), not the data.
- **DOM checks** — for HTML/HUD, `preview_snapshot`/`preview_eval` confirm
  structure and that images load. **Screenshots frequently time out on WebGL
  canvases** — don't rely on `preview_screenshot` for 3D scenes.
- Golden ↔ `scene.json` ↔ `shared/board-data.json` must agree (snaps, route
  groupings, transform).

### Gotchas that cost time here

- `sharp` can't write to `/tmp` on Windows — use the session scratchpad dir.
- Run dedicated file/search tools, not shell `find`/`grep`, per repo rules.
- A **parallel session** may be editing the repo. `git status` before
  committing; **add only your own files** and leave the other session's
  (e.g. Dark Tower files) untouched.

---

## 7. Git / workflow

- Remote: `github.com/nurtrino/Board-Game-Engine`, push to `origin main`
  directly (that's the established flow).
- Commit identity: `nurtrino <chasebryndal13@gmail.com>` (set it locally if
  unset — global is empty).
- `node_modules` is gitignored; the staged game assets under
  `client/public/<game>/` **are** committed.
- Commit only the files you changed for the task; don't sweep in a parallel
  session's work.

---

## 8. Checklist for a new game

1. Find the mod cache JSON; confirm `LuaScript` + `ObjectStates` are present.
2. Write `extract-<game>.mjs`: parse the Lua tables (brace-match blocks) →
   golden (routes/snaps/zones/cards/setup) + stage assets + `scene.json`.
   Assert counts and full index coverage.
3. Decide the map situation (§3 A/B/C). If A, write `fit-<game>-map.mjs`
   (homography) and render the map as a warped mesh; if B, use the art's own
   pixel↔world mapping; if C, no fit.
4. Build the engine in `shared/src/<game>/` (state + actions + view) and add it
   to the server `engines` registry and `GAME_SEATS`.
5. Build the TV board + device components, reusing the `ig-*` HUD, the sound
   hooks (action/turn/win on TV, click/error on device), the whose-turn
   indicator, and a Show-deck button.
6. Add the game tile to `SelectGame`, and make sure the lobby is game-aware.
7. Verify per §6 (snap match, fit residual, round-trip, overlay, build) and
   hand the owner a running build to eyeball.
8. Commit only your files; push to `origin main`.

---

*This doc is a living summary — update it when a convention changes. The
`memory/` files (project, ui-copy-style, in-game UI, sound, per-game) hold the
same facts in shorter form for quick recall.*
