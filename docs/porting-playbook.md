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

### 2.1 Getting the assets (the dead-host trap)

Old mods reference `http://cloud-3.steamusercontent.com/...` which is **dead**.
Valve migrated the same paths to `https://steamusercontent-a.akamaihd.net`.
`tools/tts-extract/download-mod-assets.mjs <workshopId>` walks the save, rewrites
that host, and downloads every referenced asset into the TTS cache so the
extractors can run offline. The cache layout is:

```
Mods/{Images,Models,PDF,Assetbundles}/<munged-url>.<ext>
```

where `munge = url.replace(/[^A-Za-z0-9]/g, '')`. Images are `.png`/`.jpg`
(sniff the first byte: `0x89` → png), models `.obj`, bundles `.unity3d`, PDFs
`.PDF`. If a download 404s, the URL hash is wrong — don't invent the tail; copy
it verbatim from the save.

### 2.2 Meshes, textures and audio inside Unity assetbundles

Some mods ship a `Custom_Assetbundle` (`.unity3d`) instead of plain OBJs — Dark
Tower's LCD, rotating reel, and all its sounds live in bundles. Extract with
**UnityPy** (`pip install UnityPy`):

- `tools/tts-extract/inspect-bundles.py` lists every object (Mesh / Texture2D /
  AudioClip / GameObject) with sizes so you can identify what's inside.
- `tools/tts-extract/extract-darktower.py` is the template: iterate
  `env.objects`, `obj.read()`, save `d.image` (Texture2D) / `d.samples` (AudioClip
  `.wav`) / mesh verts. **Trigger/effect order matters** for TTS assetbundles —
  the sound index the Lua plays (`playTriggerEffect(n)`) maps to the bundle's
  `m_Container` order (alphabetical asset path), *not* object-enumeration order.
  Read the container to get the right index→name map.

Not everything is in a bundle: Dark Tower's 13.6k-vert tower is a **plain OBJ**
in `Models/`, and its **painted board is a hidden `Custom_Token`** (a giant
scale-7 image object, GUID `706f42`) — see §4.2. Always scan *all* textured
objects before concluding an asset is missing or fabricating a placeholder.

### 2.3 Rulebooks

The mod's `CustomPDF` is the official rulebook — stage it to
`client/public/<game>/rulebook.pdf` and link it from the game's `GameIntro`. To
*read* a PDF while porting, use **pymupdf** (`fitz`) to render/`get_text`; the
`Read` tool needs poppler which isn't installed. Wrap stdout in a utf-8
`TextIOWrapper` or cp1252 will throw on box-drawing glyphs.

The back matter is often the jackpot: Dune's rulebook PDF embeds a complete
Board Space Guide (every space's costs/rewards, verbatim) and an icon guide
that decodes card iconography (the ringed gold planet = VP, ?-diamond with
chevrons = influence-any, one chevron per point). Read those pages as
rendered images (`page.get_pixmap`) before transcribing anything from board
or card art — it can eliminate whole transcription passes. Still cross-check
the handful of values the text can't carry (Dune's rulebook never states the
Emperor 4-influence bonus; the art shows two troop cubes, not solari).

### 2.4 Transcribing what the Lua doesn't encode (card costs, graphs, colours)

Some rules data only exists as printed art. The workflow that held up:

- **Check object nicknames first — they're free data.** Trekking's 96 trek
  cards carried names like `"Green 3"` (suit + value), which killed the whole
  transcription job. Cross-check the `names[i] ↔ cards[i].cell` mapping is
  consistent before trusting it.
- **Contact sheets for visual transcription.** Slice the deck sheet into
  labelled rows with `sharp` (5 cells per image, `cell N` captions), read them,
  and transcribe. Re-render any ambiguous cell solo at full res.
- **Cross-check against independent facts** before accepting a transcription:
  the rulebook's worked example (Lassen Volcanic = canoe+mountain+boot matched
  my icon reading exactly) and distribution counts (13×VP5 / 16×VP7 / 10×VP10,
  icon count follows VP tier). If those line up, the reading is right.
- **Board graphs: verify by line overlay.** Draw every transcribed edge as a
  cyan line over the full-res board art, then inspect quadrant-by-quadrant:
  every line must lie on a printed trail and every printed trail must have a
  line. Resolve ambiguities with targeted zooms centred on node coordinates
  (`trek-zoom.mjs` pattern). Trekking's 73-edge graph shipped with zero errors
  this way.
- **Card sheets may store art rotated inside the cell — and it varies per
  sheet.** Trekking's park/major sheets are portrait cells with the art turned
  90°; the trek sheet's cells are upright. Give the sprite component a
  `rotated` flag per deck and verify empirically with a screenshot (backs can
  be rotated differently from faces).
- **Colour classification from art** (TTR route colours): sample the map at the
  snaps, classify by hue/value with explicit thresholds, but **mod-authored
  tags always take precedence** over detection.
- **Extractors must be idempotent.** A re-run must preserve previously fitted
  data — the map transform, manually corrected tags — or it will silently wipe
  them (a re-extract once reset TTR's colour tags). Carry `prevTransform`/tags
  forward into both golden and `scene.json`.
- **Trust the mod's own provenance comments.** Good mods annotate constants
  ("CONFIRMED BY DISASSEMBLY OF ROM DUMP") and fence tweakables ("USER
  SERVICABLE PARTS") — those markers tell you which numbers are authoritative
  vs. house-ruleable. Quote the line refs in the spec.

---

Cards with empty Nicknames (Dune's conflict deck, starters) still identify
uniquely by (CustomDeck sheet, CardID cell) — crop the cell, read it, key
the golden by cell. Never assume every deck is named just because one is.

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

### D. Board art anchored by the mod's own labelled overlay tiles (Dune Imperium)

Some mods ship an expansion-layout board and lay *labelled overlay tiles*
over it during setup for the base game (`sendAgentSetup` in global.lua,
exact `setPositionSmooth` coordinates per tile). Those tiles are gold:
each one is a named object with a known world position AND a printed slot
in the board art — free calibration anchors. Fit an affine art-px -> world
mapping on two or three of them (one pair for x, one for z; verify on a
third) and place the board plane from that fit instead of trusting
Custom_Token scale ratios. Measure combat arenas / garrison circles /
anything else straight off the art through the same affine. Also check
whether the board art already prints the base layout — Dune's does, so
the overlays are near-invisible duplicates and alignment errors show up
as double vision at a glance.

**Derive each agent's placement spot from its overlay tile's fitted centre,
not a hand-nudged offset.** Hand-tuned per-space offsets drift inconsistently
(Dune had 14 worker spots off by anywhere from 0.3 to 1.6 units while the
exact-match spaces sat dead centre) and land pawns off their tiles. The tile
centre is the same anchor you already fit — snap the pawn spot to it. Spaces
printed on the base board with no overlay (Great Flat / Hagga Basin) keep their
own affine-fit spots.

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
- **Per-mesh auto-flip for upside-down OBJs.** Mods author piece meshes
  inconsistently (TTR's train sat roof-down, the ship roof-up). Don't blanket-
  rotate: the detailed side carries more vertices, so count vertices below vs
  above the vertical mid — if most sit below, the piece is upside down; roll it
  180° about Z. Then re-seat by the flipped bounding box.
- **Size unknown objects by aligning printed landmarks with placed models.**
  TTS token base sizes are unreliable; the mod's *object layout* is the ruler.
  Dark Tower's board plane was sized so the printed citadel badge (at 90.5% of
  the art's half-size) lands exactly under the citadel model the mod placed at
  world r 11.51 → half-size 12.72. Everything else then aligns for free.
- **Staged-art prep:** check `hasAlpha` + a corner pixel before assuming a
  baked background (board art is often transparent outside the disc — render
  with `alphaTest`); recompress multi-MB PNGs to ~2048px webp (~8 MB → 1 MB).
  Game tile logos are composed **from mod art** with `sharp` (a card back, a
  reel frame + an SVG title bar), never stock images.

### 4.1 Black-background board (masking)

To replace a mod's green felt table art with black while keeping alignment:
mask the board diffuse to the **framed map only**, black everywhere else, at the
**same pixel dimensions** (so the node/snap→pixel mapping is unchanged). Find the
map rectangle by scanning inward for the felt colour (e.g. green) from the
centre outward. Then frame the camera on the map rect so it fills the view with
black bands top/bottom/sides for the HUD. Brass and Trekking both do this.

### 4.2 Piece placement pitfalls (every one of these got sent back at least once)

- **Seat pieces on the board surface — nothing floats.** A mod's object Y is
  relative to *its* table, not your board plane, so rendering pieces at the raw
  `def.pos[1]` leaves them hovering. Seat every mesh by its bounding box:
  `y = BOARD_Y - bbox.min.y * scale` (a `seatY` prop on the shared `Model`).
  Buildings, tokens, stones — all of them. "Everything is floating above it" is
  the #1 rejection.
- **`centerXZ` for offset OBJ origins.** Some meshes (Dark Tower's tower) have
  their origin off-centre, so even at `[0,y,0]` they sit off the board middle.
  Recenter by the bbox mid. Gotcha: the primitive's position applies **after**
  its local 180° Y turn, which maps `(mx,mz)→(-mx,-mz)` — so cancel with
  `+mid`, not `-mid`.
- **Screen/billboard planes must be proud of the *actual* mesh face.** Dark
  Tower's reel window + LCD kept clipping inside the tower because I guessed
  their Z. Measure the mesh's front-face Z **per height band** (sample verts,
  bucket by world-Y) — the tower is ~2.5 deep at the base but only ~1.85 up
  high. Place the plane just proud of the face at the right height, or it
  disappears inside the body.
- **The real board art may be a hidden object.** Don't fabricate a placeholder
  board (I did, then found the mod's painted board was a scale-7 `Custom_Token`).
  If the surface "isn't rendering," it's usually a black void because you have
  no art, not a load failure — dump *all* textured objects and use the mod's.
  Board art often has transparency outside the disc → render with `alphaTest`.

### 4.3 State-driven, pick-up-and-drag pieces

For games where players physically move a pawn (Dark Tower), make the token a
piece of **engine state**, not a cosmetic derived from `quad`:

- Add `spot: {x,z}` to the player, a `move_token` action, and validate it
  (own turn, right phase, clamp to the playable ring). It's a silent position
  sync — no tower event.
- Client: raycast a horizontal plane at board height for the drop point, lift
  the mesh while held, and **disable `OrbitControls` while dragging** (a
  `dragging` flag) or the camera fights the drag.
- **Z-sign is the subtle bug.** Tokens render at `render z = -spot.z`; the mod's
  building models render at `render z = -world.z` (`pos3`). So a token's `spot`
  must equal the *world* coords of the thing it should sit on — **not** the
  negated value. I negated the citadel z's and every player spawned one kingdom
  away (Red on Durnin's badge instead of Arisilon's). Verify spawns with a
  4-player game and read the printed labels.
- Snap-backs: capture `turnSpot` at turn start; lost / cursed / blocked-frontier
  return the token there (mirrors the mod's `tokenX/tokenZ`).

### 4.4 Reproduce the mod's own device UI when it has one

If the mod author built a control surface (Dark Tower's electronic panel with
its 12 coloured buttons, LCD, and rotating reel), **reproduce it faithfully**
rather than inventing a generic action list — the owner wants the authentic
object. Crop the printed panel, keep its colours/labels, make the real buttons
pressable and phase-aware, and drive the LCD/reel from the engine's step list.
When an action resolves, **fly the camera to the tower and voice it there** (the
engine emits `{pic,lcd,sfx,ms}` steps; a `useTowerDisplay` hook exposes an
`active` flag the view uses to set the camera aim and play the sound). Sound
comes "through" the focused board; keep the phones silent so a TV+phones table
doesn't double up.

---

## 5. Owner's product preferences (hold these unless told otherwise)

**Visual system**
- Full dark mode. The **lobby** keeps its glassmorphism; **in-game** uses the
  universal `ig-*` HUD in `styles.css` — same lobby tokens (glass, blur,
  hairline borders, black+wash ground), sprucedup for play. Game-agnostic.
- In-game backgrounds are **black**.
- The TV is the shared table (fills the screen with the board); the player
  **devices** hold hands + take actions.
- Each device shows the player's **mat rendered as real 3D game objects** —
  the mod's own player board, leader/reference card, pawns, troop pieces and
  resource tokens laid out like the physical table (skip the storage bowls).
  Text counts alone are not enough; the mat is a scene, not a stat sheet.
- **Orbit camera is for the shared TV board; the personal mat is a fixed
  frame.** The main board keeps a movable orbit camera (authenticity, §5
  authenticity). The *personal player-mat* view is real 3D but a **fixed,
  gently-angled, non-interactive** readout — the owner asked for it not to be
  movable (nothing to fly around on your own board). Frame it flat-ish so the
  whole mat reads at a glance.
- **Surface everything on the one no-scroll page — don't hide it behind a
  stats/overlay menu.** Once the mat and the resource/influence readouts live on
  the main device screen, a separate "house/detail" overlay that repeats them is
  redundant; the owner had it removed. When there's spare space on the main
  screen, **fill it with the missing info** (leader powers, upgrades,
  deck/discard counts) rather than tucking it in a popup.

**Copy**
- Serious **UPPERCASE** labels, middot `·` separators, **no em dashes**, **no
  emoji anywhere** (use inline SVG icons instead).
- Sentence-level copy: plain, imperative, no fluff.
- **Error/alert toasts obey the same rules.** No lowercase-first, no em dashes.
  Capitalise and de-dash them **at the source** — one `err()` helper in the
  reducer (`error.replace(/\s+—\s+/g, ', ').replace(/^\p{Ll}/u, upper)`), not per
  call site — so every message is fixed in one place and proper nouns survive.

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

**Every game has an explicit End Turn button** (owner directive): pressing it
is how you know your own turn is over — never auto-advance the turn silently.
Style it primary when it's the only remaining legal act.

**View the whole hand** — a button beside the hand fan brings the full hand to
the foreground, grouped into stacks by type/colour with counts.

**Teaching aids point at the real interface, not a slideshow.** A game may offer
a **first-round interface walkthrough** — coach-marks over the *live* device
screen that spotlight each actual control (target real elements by a `data-tour`
attribute and read their bounding box), opened from `GameIntro`'s "Walk me
through the interface". The TV can carry a host-toggled **"Explain the board"**
overlay that labels every region of the board (a region-by-region legend plus
callouts for the shared HUD). Both explain the concrete UI in front of the
player; the intro popup covers goal + rules, the walkthrough covers the buttons.

**AI pace** — CPU seats act on a deliberate delay (~1.1s setup, ~1.8–2.6s in
play) so the TV can narrate each move; instant bot turns were rejected.

**Authenticity over convenience** — use the mod's *real* meshes, textures,
sounds, card art, and board; reproduce the physical object (down to a game's
electronic panel). Fabricated/placeholder art is only ever a stopgap and will be
replaced the moment the real asset is found. Real 3D with an orbit camera, never
2D sprites.

**Respect the mod's design, don't over-engineer rules** — Dark Tower is
honor-system on board position, so we keep its exact electronic brain and expose
every action every turn instead of inventing a movement graph. Enforce what the
game enforces (Brass is fully enforced); don't add constraints the physical game
doesn't have. But **do** disallow actions that are simply illegal in the current
state (you can't "fight" when there's no fight) — reject sub-phase actions
outside their phase and grey out the buttons.

**Grey out what the player can't afford — never let a tap bounce an error.**
The owner's rule: "if you don't have enough solari for an action, just don't let
them do it — grey it out." A device option whose cost exceeds the player's
resources (or that fails a requirement — a faction gate, an already-owned
once-per-game upgrade) must be **disabled with an inline reason** ("· not enough
solari"), not clickable-then-rejected. Mirror the reducer's own affordability
check on the client, including any leader discount (Duke Leto pays 1 less on
Landsraad), so the two never disagree — a disabled option the engine would allow,
or a live option the engine would reject, is a bug. The error toast is a
backstop, not the primary feedback.

**Cards read upright** — portrait, not lying on their side. Mod card sheets
often store art rotated inside the cell; render it upright in a portrait frame.
The personal hand fans vertically.

**It must fit — no scrolling the personal board.** Size the device rail so the
readout, controls, and the player's card all fit an iPad without scrolling; crop
decorative header art if needed. Verify against **iPad-landscape height (768)**,
the tightest case — a layout that fits your wide preview can still overflow
there. When a large element (an enlarged conflict/reference card) competes with
the hand for vertical space, make the hand a **single horizontal swipeable row**
(`nowrap` + `overflow-x`) rather than letting it wrap to two rows and push itself
below the fold.

### 5.1 Dislikes — the things that come back (fix before showing)

- **Floating pieces.** Anything not seated flat on the board (§4.2).
- **Wrong / mirrored placement.** Pieces upside-down, on the wrong slot, or
  spawns in the wrong kingdom (§4.3 z-sign).
- **Fabricated art when the real asset exists** in the mod — a black-void board,
  a made-up board face, a placeholder logo.
- **A game's own screen not working** — a floating/blank LCD, a reel that shows
  nothing, sound that doesn't play "through" the tower.
- **Illegal actions offered** — buttons live when the action can't legally fire,
  or when the player can't pay the cost (grey out unaffordable options with a
  reason; don't let the tap bounce an error toast).
- **Cards sideways**, hands horizontal, art rotated wrong.
- **Scrolling** to see your own board/card.
- **Emoji, em dashes, a hardcoded game name** in the lobby, a dot instead of an
  outline for seat colour — the copy/HUD rules in §5 are hard rules.

Expect terse, punch-list feedback ("the board is fixed, everything is floating
above it", "red is spawning in the wrong place", "make the hand vertical"). Each
item is real; fix all of them, then re-verify with a screenshot before replying.

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
  structure and that images load. The MCP `preview_screenshot` often times out
  on a live WebGL canvas — use the puppeteer drivers below instead, which
  render 3D reliably (they launch Chrome with swiftshader GL flags).
- Golden ↔ `scene.json` ↔ `shared/board-data.json` must agree (snaps, route
  groupings, transform).

### 6.1 Runtime & visual verification tooling (`tools/verify/`)

This is how you actually see the 3D board and prove a full game plays:

- **`shoot.mjs <url> <out.png> [waitMs]`** — screenshots any page (TV board
  included) at 1280×800. Every renderer honours a **`?cam=x,z,h[,y]`** query
  override so you can aim the camera at a specific spot/height for a close-up
  (e.g. frame a tower window, a citadel, a piece cluster). This is the primary
  way to zoom-verify placement.
- **`phone-shot.mjs` / `dtphone-shot.mjs <base> <room> <token> <out> [waitMs]`**
  — screenshots a device (`/play/:room`) by injecting the seat token into
  `localStorage` so it reconnects into that seat. Use the token the server
  returns on `join`.
- **`page-errors.mjs <url> <out> [waitMs]`** — loads a page and dumps console
  errors/warnings, failed requests, and 4xx/5xx responses, then screenshots.
  First thing to run when something "isn't rendering" — it tells you load
  failure vs. black-void-with-no-art in seconds.
- **Live WS smoke tests** (`trek-smoke.mjs`, `dt-smoke.mjs <port>`) — a headless
  driver creates a room, joins N players, and plays a **full game through the
  real server**, asserting redaction and turn flow. This catches
  engine↔server↔protocol bugs that unit tests can't.
- To set up a room to screenshot: a tiny `ws` script (create_room → join →
  start; the server pads with CPU seats). Grab `roomId` + `playerToken` from the
  messages.

### 6.2 Runtime gotchas that cost real time

- **Restart the preview server after any `shared/` (engine or protocol) change.**
  `tsx` does not hot-reload the workspace dep — a stale server silently serves
  the old engine and your "fix" looks broken.
- **The room creator's socket is also a watcher**, so it receives a
  neutral/TV-redacted state *and* its seat's state. Smoke drivers must filter on
  `view.you === mySeat`, or they read the redacted frame and think their own
  hand is hidden.
- **Detect action completion by watching `lastEvent.seq`** (or a small state
  hash), not by sleeping. Actions with multi-step tower playback finish
  server-side immediately but animate on the client.
- **`sharp` applies `resize`/`rotate` BEFORE `composite`/`extract` within one
  pipeline.** For a contact sheet or crop-then-rotate, do `extract().toBuffer()`
  first, then a **second** `sharp(buf).rotate().resize()` pass — otherwise it
  rotates the whole source and your crop lands in the wrong place, or composite
  throws "image to composite must have same dimensions or smaller."
- **`export *` name collisions** across engines silently drop symbols — `RULES`
  existed in both TTR and Trekking; rename per-game (`TREK_RULES`,
  `TTR_RULES as RULES`). Grep for duplicate exported names before wiring a new
  engine into `shared/src/index.ts`.
- **Writing files via PowerShell mangles UTF-8** (em dash → `â€"`, BOM prepended),
  and its `-replace` is **case-insensitive by default** (renaming `RULES` also
  rewrote the word "Rules" in comments). Use the `Write` tool or a node script
  for any file with non-ASCII, and grep for mojibake afterward.
- Driver scripts must live under `tools/verify/` (which has `ws`/`puppeteer`
  installed); a script in `/tmp` or the scratchpad can't resolve those modules.
  Ad-hoc `sharp` scripts can't resolve `sharp` from outside the repo either —
  run them from the repo root or `createRequire` the repo's copy.
- `sharp` can't write to `/tmp` on Windows — write to the session scratchpad dir.
- Use the dedicated file/search tools, not shell `find`/`grep`, per repo rules.
- Typecheck the client **from `client/`** (`cd client && npx tsc --noEmit`);
  there's no root tsconfig and the server has none (it's `tsx`-only — engine
  correctness comes from the test suites). `npm test` at the root is a stub;
  run the suites individually with `npx tsx shared/src/<game>/<game>-test.ts`.

### 6.2b When the owner says it's broken on the live site

Reproduce against **boardgamesengine.com itself** before touching code:
`curl` the asset (`/darktower/scene.json` etc. — expect 200), then run
`page-errors.mjs` against a fresh room created over `wss://` on the deployed
server. If that renders clean, the code is fine and the complaint is either a
**stale cached bundle** (hard refresh, Ctrl+Shift+R — Render deploys on push
but browsers hold the old index) or a *perception* issue ("not rendering" =
looks like a black void because there's no art, §4.2). Diagnose which before
"fixing" anything.

### 6.3 Engine test pattern (`shared/src/<game>/<game>-test.ts`)

Every engine gets a test file that runs three things and `process.exit(fail?1:0)`:

1. **Bot playthroughs at each player count** — a greedy/random policy plays full
   games. **Give the bot a goal or the game stalls** (Dark Tower bots must build
   ~55 warriors before storming the tower, or they loop forever losing).
2. **Conservation invariants after every action** — cards/pieces/stones summed
   across deck+discard+hands+board must equal the constant total; catches
   dupe/loss bugs instantly.
3. **Directed rules tests** — one assertion per rule/edge case (tie-break cancels,
   out-of-phase action rejected, curse-then-eat order, etc.), cross-checked
   against the mod Lua's line refs.

Use a **seeded RNG stream** in the engine (advance a `rolls` counter, hash
`seed ^ rolls`) so saves replay identically and tests are deterministic.

---

### 6.4 Multi-choice card games: the pending-decision queue

For engines where card effects branch (pick a faction, trash a card, choose
one of N rewards), don't try to encode choices into the triggering action.
Give the state a `pending: {seat, decision}[]` queue: effects push typed
decisions, the reducer rejects every action except `choose` while the queue
is non-empty, and only the head's owner may resolve it. Phones render the
head as an explicit prompt; bots switch on `decision.kind`. This keeps every
choice enforced and serializable, survives multi-seat cascades (Test of
Humanity queues one decision per opponent), and makes combat-reward choices
compose with everything else for free. Pair it with a live WS smoke driver
(`dune-smoke.mjs` pattern: join one seat, random-legal actions, exit on
ENDED, stall watchdog) — it exercises the server bot's decision handling,
which unit playthroughs can't.

### 6.4b Ship gates: rulebook UI-coverage audit + UI-driven full game

Two mandatory gates before a port counts as done. The WS smoke driver proves
the *engine* can finish a game; neither gate below is covered by it.

- **Rulebook UI-coverage audit.** After the client is built, re-read the
  rulebook end to end (including the back-matter reference sheets) and, for
  every player decision, optional cost, choice of amount, and piece of public
  information, name where it lives on the device screen or the TV. Then audit
  the other direction: grep the engine's action union for fields the device UI
  never sends — any value the UI auto-picks instead of asking (a sell amount,
  an optional cost, a deploy count) is a coverage gap, because the engine
  supports a choice the player can't make. Write the findings into the spec
  and fix them before shipping.
- **UI-driven full game.** A puppeteer driver opens one page per seat (4 if
  the game supports it) and plays a **full game by clicking the actual device
  DOM** — buttons, cards, pickers — never raw WS actions. If the driver
  stalls, the UI is missing an affordance a human would also get stuck on;
  that's the finding, not a test bug. Keep it as
  `tools/verify/<game>-ui-smoke.mjs` next to the WS driver.

## 6.5 Working with the owner (process)

- **Scope before building.** Ask the clarifying questions up front — player
  counts, screen layout ("board main-left, tower top-right, switchable"), and
  hard requirements ("block on extracting the real tower mesh"). He answers
  fast and precisely; guessing instead costs a rework round.
- **Plan per game, then execute.** Write the rules spec to
  `docs/specs/<game>.md` *before* the engine — it's the durable artifact that
  survives context loss, and every mechanic gets a Lua line ref to verify
  against later.
- **Checkpoint commits.** Commit + push at each milestone (golden, engine,
  server, client, each fix batch) — sessions get interrupted mid-stream and a
  pushed checkpoint is the only reliable resume point. Same reason: keep
  progress notes in `memory/` as you go, not at the end.
- **"Go" / "Finish up" means keep working autonomously** — resume exactly where
  you stopped, no recap, no questions that the code can answer.
- **Prove it before replying.** Every fix ends with a fresh screenshot or a
  green suite run in the message; "should work now" without evidence gets sent
  back.

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
   `download-mod-assets.mjs <id>` to fetch assets (rewrites the dead host, §2.1).
2. Read the Lua **fully** and write a spec in `docs/specs/<game>.md` with line
   refs for every rule before coding — it's the golden source, not memory/web.
3. Write `extract-<game>.mjs`: parse the Lua tables (brace-match blocks) →
   golden + stage assets + `scene.json`. Extract Unity bundles with UnityPy if
   present (§2.2); stage the rulebook PDF (§2.3). Assert counts and full index
   coverage. Scan **all** textured objects for the real board/pieces.
4. Decide the map situation (§3 A/B/C). If A, write `fit-<game>-map.mjs`
   (homography) and render the map as a warped mesh; if B, use the art's own
   pixel↔world mapping; if C, no fit.
5. Build the engine in `shared/src/<game>/` (state + actions + view + a seeded
   RNG stream). Write `<game>-test.ts` (bot playthroughs + invariants + directed
   rules, §6.3). Export from `shared/src/index.ts` — grep for `export *` name
   collisions first (§6.2).
6. Register in the server `engines` registry + `GAME_SEATS`; add a
   `<game>BotAct` and wire it into `scheduleBots` (~1.8–2.6s pace).
7. Build the TV board + device components: reuse the `ig-*` HUD, sound hooks
   (action/turn/win on TV, click/error on device), the whose-turn indicator,
   Show-deck, and `GameIntro` + rulebook. Seat every piece on the board (§4.2).
   If the mod has its own control surface, reproduce it (§4.4).
8. Add the game tile to `SelectGame`; make sure the lobby is game-aware.
9. Verify: engine tests green; `page-errors.mjs` clean; `shoot.mjs`/phone-shot
   zoom-checks that pieces sit right and spawns are correct; a live WS smoke
   test plays a full game (§6.1). Then hand the owner a running build.
10. Ship gates (§6.4b): rulebook UI-coverage audit of both screens, and a
    4-seat puppeteer game played entirely through the device DOM.
11. Commit your work; push to `origin main`.

---

*This doc is a living summary — update it when a convention changes. The
`memory/` files (project, ui-copy-style, in-game UI, sound, per-game) hold the
same facts in shorter form for quick recall.*
