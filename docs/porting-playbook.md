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
'darktower' | 'dune' | 'axis' | 'politik' | 'darksouls'`. The server has an
`engines` registry (create/view/apply per game) and `GAME_SEATS` (seat colours
per game). The client dispatches the shared `GameView` by `view.game` from
`BoardPage` and `PlayPage` into the appropriate TV/device implementation.

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
| Dune: Imperium | `dune` | 2354919205 |
| Axis & Allies Anniversary Edition | `axis` | 1961347286 |
| Politik | `politik` | 3460664356 |
| Dark Souls: The Board Game | `darksouls` | 1210887127 |

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
- **OCR is a transcription hint, never rules authority.** Do not make every
  card pass through a confirmation wall just because some cards are uncertain.
  Verified structured cards should play normally. Drawing, browsing, holding,
  or enlarging an uncertain card should ask for nothing; only when the player
  actually uses it should the device show the authentic art and one `ENTER
  PRINTED VALUES` action for the fields that matter to that use. A human's
  declaration overrides the OCR hint for legality and resolution, and changing
  any entered field invalidates the previous confirmation. Label OCR copy as
  optional and unenforced so a bad transcription can never break the game.
- **Guide unencoded printed effects instead of guessing them.** Keep the
  enlarged authentic card visible beside a typed resolver for bounded operations
  such as resources, card movement, Support/Influence, Markets/Margin, prices,
  readiness, and acknowledgements. Validate ownership and numeric bounds in the
  engine and write a precise public audit event. This preserves an honor-system
  card's flexibility without allowing arbitrary client state edits.
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

### 4.5 Reconstruct personal tableaux from physical ownership

Before choosing a renderer, inventory every object around one TTS seat and
record four facts: **owner, multiplicity, printed zone, and orientation**. Politik
showed why all four matter. Its Nation card and three leaders belong on the
Nation board; every controlled Company owns a separate narrow Company tracker
and exactly one Margin marker; Support and Corruption belong on the shared board
and must not be duplicated as loose personal pieces.

- If the personal objects are flat, coplanar, and share a yaw, a fixed top-down
  tableau built from the authentic art can be more faithful than a forced 3D
  camera. An arbitrary angle adds perspective drift, clips the mat, and can turn
  rotated cards edge-on. Keep WebGL for genuinely three-dimensional personal
  objects or interactions, not as a requirement in itself.
- Reproduce **one physical component per real instance**: one tracker per
  Company, one marker per tracker, one card per card in play. Never reuse one
  printed tracker for several entities or add fallback cards that are not in
  the state. Show clear empty states instead of placeholders.
- Preserve source-art aspect ratios. Constrain one dimension and let the other
  remain automatic; stretching a narrow tracker to fill a rectangular slot is
  immediately visible. Use `object-fit: contain` for authentic component art.
- A shared-board fact that players need constantly may be summarized on the
  device, but label its location explicitly (`SUPPORT ON MAIN BOARD`,
  `CORRUPTION · BOARD`) rather than drawing a second physical piece.
- Counts are exact state, not decorative tracks. Do not clamp a resource because
  the convenient graphic stops at 12 when the real game can hold 20–40.

---

## 5. Owner's product preferences (hold these unless told otherwise)

**Visual system**
- Full dark mode. The **lobby** keeps its glassmorphism; **in-game** uses the
  universal `ig-*` HUD in `styles.css` — same lobby tokens (glass, blur,
  hairline borders, black+wash ground), sprucedup for play. Game-agnostic.
- In-game backgrounds are **black**.
- The TV is the shared table (fills the screen with the board); the player
  **devices** hold hands + take actions.
- Each device shows the player's **physical tableau reconstructed from the
  mod's real art and component layout** — the player board, leader/reference
  card, pawns, trackers, cards and resource pieces arranged like the source
  table (skip storage bowls). This may be a real 3D scene or a fixed top-down
  DOM/CSS tableau when the source objects are flat and coplanar. Text counts
  alone are not enough; it must still read as the game's physical table, not a
  generic stat sheet.
- **Orbit camera is for the shared TV board; the personal mat is a fixed
  frame.** The main board keeps a movable orbit camera (authenticity, §5
  authenticity). The personal view is fixed and non-interactive except for
  selecting or inspecting components. Match the source geometry: use a gentle
  fixed angle only when it helps real 3D objects read; use true top-down when
  the TTS layout itself is flat. The whole tableau must read at a glance.
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
- **The TV zooms in on movement** (owner directive Jul 17 2026): every worker
  placement/movement and event claim flies the camera to the spot, dwells a
  readable beat, then eases back to the resting view (Everdell `FocusFly`;
  Brass/Trek fly-tos are the same pattern). Carry the action's location in the
  engine's `lastEvent` so the TV can aim — don't try to re-derive it client-side.
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

**No Show Deck button** (owner directive Jul 17 2026, reversing the earlier
"show deck" rule): never add a deck-contents reference viewer to the device.
Tap-to-read close-ups on the cards actually in view are the reference.

**No hover zoom on cards** (owner directive): cards must not scale/lift on
hover; a border highlight is the most a hover may do. Reading happens in the
tap close-up.

**Shared-state summaries are art, not text lists** (owner directive): a rail
or panel that lists events/objectives as uppercase text lines is clutter —
render the actual tile/card art as small thumbnails (claimed = seat-colour
ring + dim) with tap-to-enlarge.

**The shared board carries the mod's physical extras**: supply piles (the
actual resource models seated on the printed pile spots) and standee pieces
(Everdell's two-part Ever Tree) belong on the TV board — their absence reads
as a missing component.

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
replaced the moment the real asset is found. The shared table stays genuinely
3D when the game has a spatial board. A flat personal tableau may use authentic
art in DOM/CSS when that preserves the source layout better than perspective;
that is not permission to replace real components with generic icons or sprites.

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

### 5.1 Personal-device patterns that held up in Politik

The Politik personal screen was the clearest test so far because it had to keep
a Nation board, exact resources, multiple Company boards, a hand, action controls,
and access to the shared map inside a 1024×768 device. The combination that
looked best was **authentic cream component art inside dark, low-contrast glass
panels**, with thin borders, restrained seat-colour wash, uppercase section
labels, and strong numeric counts. The art carries the game's identity; the dark
shell organizes it without competing with it.

- **Use three obvious zones:** identity/player board, exact personal ledger, and
  controlled entities. Keep their order stable and give each a real heading.
  Adaptive density is better than a permanently sparse grid: a single Company
  should use its available zone, then add columns as more Companies enter play,
  without stretching any authentic art.
- **Put private and always-needed information on the device.** Keep spatial
  movement and shared-board targets on the main board. Provide a one-tap
  `PERSONAL / MAIN BOARD` switch; actions that need a board target may switch
  automatically and return after confirmation. Hide the inactive layer instead
  of stacking a mini main board over the personal tableau.
- **Every visible card is an inspection control.** Setup choices, hand cards,
  Nations, Propaganda, Companies, Assets, Events, references, and Clash cards
  should all open the same full-size authentic-art dialog. Selection and close-up
  are separate actions so zooming never accidentally commits a card. Keep hidden
  opponent cards hidden, and label the dialog for keyboard/screen-reader use.
- **Keep cards upright and state explicit.** Use `READY` / `USED` text, restrained
  dimming, and an overlay rather than rotation as the only state cue. Imported
  Euler rotation made a used Politik card appear edge-on.
- **Make uncertainty local and proportional.** An uncertain card opens one
  manual-entry choice only when used, with only type-relevant fields. Verified
  Startups and structured cards bypass it. Show the authentic card beside the
  editor and keep the normal play action locked until the entered values are
  ready; never ask players to approve every OCR field in advance. Companies and
  Assets ask for their Industries/Margin, Propaganda for Base/Support, and Events
  for only their applicable timing or printed icons.
- **Style native controls all the way through.** Apply dark background, light
  foreground, `color-scheme: dark`, readable type, and touch height to both
  `select` and `option`. Styling only the closed select still produces a
  white-on-white dropdown on some browsers. Politik's roughly 40 px controls
  stayed usable at tablet size.
- **Use labels instead of ambiguous decorative stacks.** One literal Margin
  marker belongs on its Company track; Markets and other repeated pieces may be
  summarized with art plus a count badge when a physical pile would become
  illegible. Empty states should explain where the missing component is, such as
  “Startup stays in your hand until played.”

### 5.2 Dislikes — the things that come back (fix before showing)

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
- **An arbitrary angle on a flat personal mat**, especially when it shifts
  pieces off printed zones, clips the board, or turns a used card edge-on.
- **Unreadably small device text or native white-on-white controls.** Check the
  real tablet viewport and style the opened dropdown options, not just its shell.
- **Blanket confirmation screens for uncertain OCR.** Ask only when that card is
  used and only for values needed by that use.
- **Duplicated or misowned pieces, shared trackers, and stretched art.** Physical
  ownership and multiplicity must match the source table even in a DOM tableau.
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
- **Personal-device geometry checks need a populated live state at the true
  target viewport**, not only an empty setup screen or a wide desktop preview.
  At 1024×768, assert that the page has no vertical or horizontal scroll; major
  zones are ordered, contained, and non-overlapping; inactive board layers are
  actually hidden; tracker count equals controlled-entity count; and each
  tracker has exactly one marker. Measure card/tracker aspect ratios, important
  label/value font sizes, and touch targets. For card-heavy games, verify a
  close-up is at least about 370×540 in this viewport and that it closes by its
  button, outside click, and Escape.
- **Give geometry stable hooks.** Add `data-testid` attributes to the personal
  root, each major zone, repeated physical components, the main/personal switch,
  card close-up, and uncertainty editor. Screenshots catch appearance; computed
  rectangle/count/contrast assertions catch a structurally wrong layout that
  happens to look plausible in one state. For native selects, inspect computed
  colours on both `select` and `option`.
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
  correctness comes from the test suites). Root `npm test` now runs the shared,
  server, and client suites. For faster iteration, run a focused game suite with
  `npx tsx shared/src/<game>/<game>-test.ts`, then run the root suite before
  handoff.

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
   If the mod has its own control surface, reproduce it (§4.4). Inventory each
   personal component's ownership, multiplicity, printed zone, orientation, and
   aspect ratio before choosing 3D or a fixed top-down tableau (§4.5). Give every
   displayed card a close-up and every state an explicit text cue.
8. Add the game tile to `SelectGame`; make sure the lobby is game-aware.
9. Verify: engine tests green; `page-errors.mjs` clean; `shoot.mjs`/phone-shot
   zoom-checks that pieces sit right and spawns are correct; a populated
   personal-device state fits at 1024×768 with readable labels, dark controls,
   correct tracker/marker counts, preserved art ratios, and no scroll; a live WS
   smoke test plays a full game (§6.1). Then hand the owner a running build.
10. Ship gates (§6.4b): rulebook UI-coverage audit of both screens, and a
    4-seat puppeteer game played entirely through the device DOM.
11. Commit your work; push to `origin main`.

---

## 9. How everything was done — end to end, in plain terms

The sections above are a working reference: terse, assuming you already know the
shape of the thing. This section is the opposite. It is a long, plain-language
walkthrough of how a game actually gets from a Tabletop Simulator mod to a
finished, polished port on this engine, written for someone who has never
touched the codebase. If a section above felt like shorthand, read the matching
part here first.

### 9.1 What we are building, and the one idea behind it

The product is a website that lets a group play a physical-style board game
across their own screens. One screen is the **TV** (or any shared display): it
shows the board, the way the table looks from above, and it narrates what is
happening out loud. Every other screen is a **player device** — a phone or, more
usually, an iPad — and it holds that one player's private things (their hand of
cards, their money, their pieces) and is where that player actually makes moves.
Nobody plays "on the TV"; the TV is the board, the devices are the hands.

The single idea that everything else follows from: **we do not invent these
games, we re-host real ones.** Every game already exists as a Tabletop Simulator
(TTS) mod — a community-made file that contains the game's board, its 3D pieces,
its card images, and a script that automates some of its rules. Our job is to
take that mod apart, learn exactly how it is built and how it plays, and
reconstruct it faithfully as a web app — using the mod's *own* art, meshes,
sounds and card faces, not stand-ins we drew ourselves. When we finish, it
should feel like the real boxed game, not "a version of" it.

Because we are re-hosting rather than inventing, the mod's own files are the
source of truth at every step. Not our memory of the game, not a wiki, not a
rules video — the actual bytes in the mod. Almost every mistake in this project
traces back to trusting a memory of how a game works instead of reading what the
mod does. So the discipline is: read the mod, write down what it says, build to
that, and verify against it.

### 9.2 The three pieces of the codebase

The whole thing is one repository split into three parts that talk to each other:

- **`shared/`** holds the *rules* of every game — the "engine." Given a game's
  current situation and a move a player wants to make, the engine decides
  whether the move is legal and, if so, what the new situation is. It is pure
  logic: no graphics, no network. Each game has its own folder
  (`shared/src/dune/`, `shared/src/brass/`, and so on) with three ideas inside:
  the **state** (everything true about a game in progress), the **actions**
  (every move a player can make), and the **view** (what one particular player
  is allowed to see — your opponents' hands are hidden from you, so the engine
  produces a per-player, censored copy of the state).
- **`server/`** is the referee and the mailroom. It keeps the running games in
  memory (and saves them so they survive a restart), it accepts moves over a
  live connection from the devices, it hands each move to the right game's engine
  in `shared/`, and it broadcasts the new view back out to everyone. It also runs
  the computer players. It does not know or care how anything looks.
- **`client/`** is everything you see: the TV board and the player devices, both
  built with React and a 3D library (three.js, via react-three-fiber). It never
  decides rules — it asks the server, receives a view, and draws it, and it sends
  the player's taps back as actions.

A game "in progress" is called a **room**. A room has an id (a short code), it
remembers which game it is (`brass`, `ttr`, `trek`, `darktower`, `dune`,
`kanban`…), and the server keeps a registry so the same server can run several
different games at once. The client looks at the game id inside the view it
receives and picks the matching board and device components to render.

### 9.3 Getting the mod, and the dead-host trap

The first concrete step is to find the mod on the local machine. TTS caches every
subscribed mod as a big JSON file; inside it are two things we need: `LuaScript`
(the mod's automation code) and `ObjectStates` (a list of every object on the
table — every card, tile, mesh, token — with its exact position, rotation, and a
link to its art or model).

The catch that has bitten this project repeatedly: old mods point their art at
`http://cloud-3.steamusercontent.com/...`, a host Valve **shut down**. The files
still exist, but at a new address (`steamusercontent-a.akamaihd.net`). So before
anything else we run `download-mod-assets.mjs`, which walks the mod, rewrites the
dead host to the live one, and downloads every image, model, sound bundle and PDF
into the local cache so the rest of the pipeline can run offline. Files land in a
cache folder under a "munged" name (the URL with every non-alphanumeric character
stripped). If a download fails, the fix is never to guess the filename — it is to
copy the exact URL out of the mod and try again.

### 9.4 Reading the Lua and writing the spec — before any code

Before writing a single line of engine, we read the mod's Lua script all the way
through and write a **spec** to `docs/specs/<game>.md`. This is not busywork; it
is the durable record of how the game works, with a line reference into the mod
for every rule, so that months later (or in a fresh session with no memory of the
work) the reasoning can be re-verified against the mod instead of re-guessed.

The Lua tells us most of the mechanical truth: the list of board spaces and where
they sit, the setup procedure (how many cards each player draws, how many pieces
they start with), and often the scoring. Two habits matter here. First, when you
parse a big Lua table (like the list of "snap points" that define where pieces
sit), match braces to find the end of the block — don't stop at the first `})`
you see, because that truncates and silently drops data. Second, cross-check
counts: if the mod says there are 452 snap points, your parser had better find
452, and every reference to snap #237 had better resolve to a real point.

### 9.5 What the Lua doesn't say — reading the printed art

Not everything lives in the script. A card's cost, a route's colour, the exact
graph of trails on the board — that data is often only *printed on the art*. So
part of porting is transcription: reading values off images and writing them into
our own data files. The lessons that made this reliable:

- **Check the object names first — they are free data.** Trekking's trek cards
  were literally named "Green 3" (colour + number) inside the mod, which handed
  us the whole deck without reading a single card face.
- **Rulebooks are gold, especially the back matter.** The mod ships the official
  rulebook as a PDF; we stage it into the game and link it in-app, but we also
  *read* it while porting. Dune's rulebook, for instance, has a complete "Board
  Space Guide" listing every space's exact cost and reward, and an icon key that
  decodes the card symbols — reading those pages eliminated whole passes of
  squinting at card art. Where the text can't carry a value (Dune's rulebook
  never states the Emperor's 4-influence bonus), the art settles it (it shows two
  troop cubes, not money).
- **Slice decks into contact sheets and read them in rows**, re-rendering any
  ambiguous card on its own at full resolution.
- **Verify by overlay, never by eyeball.** For a board's trail graph, we draw
  every edge we think exists as a coloured line on top of the real board art and
  check quadrant by quadrant that every line sits on a printed trail and every
  printed trail has a line. Trekking's 73-edge graph shipped with zero errors
  this way.
- **Extractors must be idempotent.** Re-running the extraction must not wipe data
  we fitted or corrected by hand (a map transform, a fixed-up colour tag). Carry
  the previous values forward, or a routine re-extract silently destroys hours of
  work.

### 9.6 Extraction — turning the mod into our files

With the mod understood, a per-game script (`tools/tts-extract/extract-<game>.mjs`)
does the mechanical conversion. It reads the Lua tables and the object transforms
and writes two kinds of output:

- **Golden data** (`games/<game>/golden/*.json` and mirrored into
  `shared/src/<game>/`): the rules-facing facts the engine needs — the list of
  spaces, the cards and their costs, the setup numbers. This is what the engine
  imports.
- **A render manifest** (`scene.json` plus the actual asset files copied into
  `client/public/<game>/`): the graphics-facing facts the client needs — which
  mesh file is the pawn, what colour tint each seat is, where each board tile
  sits, which image sheet holds which card.

Some mods hide their art. Dark Tower's LCD screen, its rotating reel, and all its
sound effects were packed inside a Unity "assetbundle" (`.unity3d`), which we
crack open with a Python tool (UnityPy) to pull out the meshes, textures and audio
clips. And sometimes the thing you assume is missing is just hidden in plain
sight: Dark Tower's painted board turned out to be a giant image object
(`Custom_Token`) sitting flat on the table, not a separate board asset — so the
rule is to scan *all* textured objects before concluding an asset doesn't exist
or, worse, drawing a placeholder. A fabricated board that later turns out to have
existed in the mod is one of the fastest ways to get work sent back.

### 9.7 Making the board line up — the map-fit problem

The single most error-prone geometry problem is making the pieces land on the
right spots on the board image. There are four situations, and you must diagnose
which one you have:

- **(A) The mod places pieces at 3D coordinates, but the board is a separately
  photographed image** (Ticket to Ride). The photo has its own slight
  perspective, so a straight scaling doesn't line up. We fit a *homography* (a
  projective transform) that maps the 3D world onto the image pixels, by matching
  each coloured route's 3D snap to the centre of its coloured paint on the photo,
  and we render the board as a **warped mesh** so the art and the pieces ride the
  exact same transform. Drawing the board on a flat rectangle instead silently
  throws away the perspective and the pieces drift — that was a real bug.
- **(B) The board's positions are already measured in the image's own pixels**
  (Trekking). Here there is no gap between "world" and "photo," so **no fit is
  needed** — adding one would only introduce error.
- **(C) There is no positional board** (Dark Tower): pieces live in a quadrant,
  not on a precise spot, so there's nothing to fit.
- **(D) The board art is anchored by the mod's own labelled overlay tiles**
  (Dune). The mod lays named tiles onto the board during setup at exact
  coordinates; each tile is both a known 3D position and a printed slot on the
  art, which makes it a free calibration anchor. We fit a simple transform on a
  couple of those tiles and place everything else — including where each agent
  pawn stands — from that same fit. The lesson learned here: derive each pawn's
  spot from its tile's fitted centre, not a hand-nudged guess, because hand-tuned
  offsets drift inconsistently and land pawns off their tiles.

A subtle, recurring trap across all of these: even with a perfect flat alignment,
3D pieces have height, so when the camera tilts, the *tops* of tall pieces appear
to slide off their slots, worst at the screen edges. The fix is to keep pieces
low and cap how far the camera can tilt — not to fiddle with the data, which is
already correct.

### 9.8 Building the engine — rules as pure logic

Now the rules. Each game's engine in `shared/src/<game>/` is built around three
functions: create the starting state, apply an action to produce the next state
(or reject it), and project the state into a per-player view. Everything the game
tracks lives in the state: each player's resources, pieces, hand, deck, discard,
influence, score; the shared board; whose turn it is; which phase we're in.

Two patterns make hard games tractable:

- **The pending-decision queue.** Many card effects branch — "gain influence with
  a faction of your choice," "trash a card," "pick one of three rewards." Instead
  of trying to cram the choice into the action that triggered it, the state
  carries a queue of pending decisions. An effect pushes a typed decision onto the
  queue; while the queue is non-empty the engine rejects every action except
  `choose`, and only the player who owns the head of the queue may answer it. The
  device shows that decision as an explicit prompt. This keeps every choice
  enforced and saveable, and it composes — an effect that makes each opponent
  decide something just pushes one decision per opponent and they resolve in turn.
- **A seeded random stream.** All randomness (shuffles, dice) comes from a counter
  the engine advances and hashes, so a saved game replays move-for-move
  identically and the tests are deterministic.

How strictly to enforce rules is a judgment call the owner has been clear about:
**enforce what the physical game enforces, and no more.** Brass is fully
enforced — you cannot make an illegal build. Dark Tower is honor-system about
where your pawn is, so we keep its exact original electronic "brain" and simply
let the player move their own token, rather than inventing a movement graph the
real game never had. But we always forbid the genuinely impossible: you can't
"fight" when there is no fight, and — a rule the owner made explicit during the
Dune work — you can't take an action you can't pay for. Anything you can't afford
is greyed out on the device with the reason shown, so a tap never bounces back an
error. The client's affordability check mirrors the engine's own cost check
exactly (including leader discounts), so the two never disagree.

Every engine gets a test file that plays full games with a simple bot at each
player count, checks conservation invariants after every move (the total number
of cards/pieces never changes — that catches duplication and loss bugs
instantly), and asserts specific rules one by one against the mod's Lua line
references. Give the bot a goal, or games with a long build-up (Dark Tower) loop
forever without ever finishing.

### 9.9 The server and the computer players

The server keeps a registry mapping each game id to its engine's create/view/apply
functions, plus the seat colours that game uses. When a device sends a move, the
server routes it to the right engine, stores the new state, and pushes fresh views
to everyone connected to that room. Rooms are saved continuously so a crash or a
restart doesn't lose a game, and a player reconnects to their seat with a token
stored in their browser.

Computer players fill empty seats. They act on a deliberate delay — roughly one to
three seconds — specifically so the TV can narrate each move out loud and a
watching table can follow along; instant bot turns were tried and rejected as
unreadable. One easy-to-miss detail: the person who created the room is also a
spectator, so their connection receives both a neutral TV view and their own
seat's view — automated test drivers have to filter for their own seat or they'll
read the censored frame and wrongly conclude their own hand is hidden.

### 9.10 The client — drawing the board and the devices

The client has two faces per game. The **TV board** fills the screen with the
3D board (through whichever map-fit applies), seats every piece flat on the
surface, and overlays a heads-up display: whose turn it is, the score, the current
card in play, a caption narrating the last action. The **device** shows the
player's own board and hand and is where moves are made.

A handful of 3D conventions apply to every renderer, because TTS and three.js
disagree about handedness: we mirror the world's Z axis, give imported meshes a
half-turn so they face the right way, and — importantly — **seat every piece on
the board by its bounding box** so nothing floats. "The board is fine but
everything is hovering above it" was the single most common rejection early on; a
mod's piece heights are relative to *its* table, not our board, so each mesh must
be dropped onto the surface explicitly. Related traps: some meshes are modelled
upside-down (count the vertices above vs. below the middle to detect it and roll
them over), and some have off-centre origins that need recentring.

The look-and-feel rules are firm and come from the owner: full dark mode; the
in-game HUD reuses the lobby's glass style; serious UPPERCASE labels with middot
separators and **no em dashes, no emoji, no casual lowercase** anywhere — and that
applies to error messages too, which we capitalise and de-dash in one place at the
source. Seat colour is shown as an outline, never a coloured dot. Cards read
upright in a portrait frame, never lying on their side, even though the mod's card
sheets often store the art rotated inside each cell. Every game has an explicit
**End Turn** button — the turn never advances silently — a **Show deck** reference,
and a **view-whole-hand** button. Sound comes "through" the TV (it voices actions,
turn changes and the win) while devices only click and blip, so a TV-plus-phones
table doesn't double up. When a mod built its own control panel (Dark Tower's
electronic console), we reproduce that faithfully rather than inventing a generic
button list — the owner wants the authentic object.

And the hard constraint that shapes the whole device layout: **it must fit an
iPad in landscape with no scrolling.** The tightest real case is 768 pixels tall,
and a layout that fits a wide desktop preview can still overflow there, so that's
the height to verify against.

### 9.11 Proving it works before the owner looks

The owner checks the *visuals* himself because that's faster; our job is to prove
the *data and geometry* are right and hand over a build that runs. That means the
client build and typecheck pass; the parsed snap points match the live mod
byte-for-byte; the map-fit's residual error is small and its inverse round-trips
to zero; and an **overlay diagnostic** — projecting every snap through the
transform onto the real board art — shows the dots sitting on the printed slots.
That overlay is what separates "the data/transform is wrong" from "the 3D render
looks off": if the dots are dead-on but the running board looks wrong, it's a
render or camera-tilt issue, not the data.

For seeing the actual 3D (the built-in screenshot tool often times out on a live
WebGL canvas), there are puppeteer drivers under `tools/verify/` that launch
Chrome with software-GL flags and reliably render: `shoot.mjs` screenshots any
page and honours a `?cam=` query so you can fly the camera to a close-up;
`phone-shot.mjs` screenshots a device by injecting a seat token; `page-errors.mjs`
dumps console errors and failed requests, and is the first thing to run when
something "isn't rendering," because it tells you in seconds whether it's a load
failure or just a black void with no art. Live WebSocket "smoke" drivers create a
real room and play a whole game through the real server, catching bugs that unit
tests can't. And two runtime gotchas that cost real time: **restart the preview
server after any change under `shared/`** (the runner doesn't hot-reload the
engine, so a stale server serves the old rules and your fix looks broken), and
detect that an action finished by watching the event counter in the state, not by
sleeping.

### 9.12 Ship gates — the two checks that make a port "done"

A port isn't finished when the engine can complete a game. Two extra gates are
mandatory:

1. **A rulebook UI-coverage audit.** Re-read the whole rulebook, and for every
   decision, optional cost, choice of amount, and piece of public information,
   name exactly where it lives on the device or the TV. Then check the other
   direction: look at the engine's list of possible actions for any value the
   device auto-picks instead of asking the player (a sell amount, an optional
   cost, a deploy count) — each of those is a gap, because the engine supports a
   choice the player has no way to make.
2. **A full game played entirely by clicking the real device UI** (a puppeteer
   driver that opens one page per seat and presses actual buttons and cards, never
   raw actions). If it gets stuck, the UI is missing something a human would also
   get stuck on — that stall *is* the finding.

### 9.13 A worked example — Dune from mod to shipped

Tying it together with the game most recently worked on. Dune: Imperium started as
mod `2354919205`, which bundles the base game plus two expansions. The owner's
scope was base-game-first, expansions later as optional toggles. We staged the
golden data — every board space with its exact cost and reward (read from the
rulebook's Board Space Guide and verified against the art), the conflict cards
(read cell by cell because the mod leaves them unnamed), the leaders, and the full
imperium/intrigue/starter/reserve card sets. The engine got full enforcement:
agent-placement legality, the pending-decision queue for every branching card
effect, influence that scores at 2 and pays a bonus-and-alliance at 4 (with the
alliance stealable when someone passes you), combat with the printed tie rules,
and the endgame tiebreaks — all tested with bot playthroughs and invariants. The
TV board is the mod's real art with its base-game overlay tiles placed by the
affine fit on labelled anchor tiles, the mod's pawn mesh, and cube troops. The
device does leader-pick, a hand that opens a space picker, reveal/acquire,
intrigue, choice prompts, and End Turn. It passed both ship gates: a full
20-page rulebook audit and a 4-seat game played entirely through the device DOM.

Then came a run of UI-polish requests that shaped the device into its current
form, and these are worth recording because they generalise:

- The personal screen became a **single no-scroll page** for iPad landscape: a
  header of colour resource chips and influence pip-tracks, then two columns — the
  things you act on (status, the current conflict card, your leader's powers, your
  upgrades and deck counts, and your hand) on the left, and a live 3D view of your
  own player mat on the right.
- That 3D player-mat view was deliberately made a **fixed, gently-angled,
  non-interactive frame**. The shared TV board keeps its movable orbit camera, but
  the owner didn't want to "fly around" his own small mat — so it's a clean
  readout, not a toy.
- The separate **"House" detail overlay was removed** once the mat and the stats
  both lived on the main page — it just repeated what was already visible. The
  freed-up empty space on the main page was filled with the leader's powers,
  upgrades, and deck/discard counts. The general rule: surface information on the
  one no-scroll page, don't hide it behind a popup that duplicates it.
- When the enlarged conflict card started competing with the hand for vertical
  room on a 768-tall iPad, the hand became a **single horizontal swipeable row**
  instead of wrapping to two rows and pushing itself off the bottom of the screen.
- **Unaffordable actions get greyed out with a reason** ("not enough water,"
  "needs 2 Fremen influence") instead of letting a tap fail — the client mirrors
  the engine's own cost check, including the Duke Leto leader discount, so the
  greying and the engine never disagree.
- Two **teaching aids** were added: a first-round walkthrough that puts coach-mark
  spotlights on the *real* controls of the live device screen (not a slideshow),
  opened from the intro popup; and a host-toggled "Explain the board" overlay on
  the TV that labels every region of the board.
- All the copy was tightened to the house style — serious, uppercase where it's a
  label, no em dashes, no lowercase-first alerts — and the alert-capitalisation was
  fixed once at the engine's error helper so every message is consistent.

None of these were new mechanics; they were about making the real game legible on
the actual screens people use. That is the last mile of every port, and the
owner's feedback on it is terse and specific — "the conflict needs to be bigger,"
"grey it out, don't let them do it," "there's still empty space, fill it." Each
item is real, each has a concrete fix, and the right response is to make the
change, verify it on the actual iPad-landscape size, and push it.

### 9.14 A second UI example — Politik and renderer choice

Politik exposed an important limit in the Dune pattern above. Its first personal
screen also used a gently angled 3D mat, but the source objects were almost all
flat and coplanar. The camera ended up off vertical, clipped the mat at tablet
size, made positions look wrong through parallax, and let a used-card rotation
turn the art edge-on. The authentic layout audit also found deeper modeling
errors: several Companies sharing one tracker, duplicate Margin markers, Support
overlapping leaders, a resource display clamped below legal starting values, and
a Corruption piece drawn on a personal divider even though Corruption lives on
the shared board.

The successful replacement was a **fixed top-down personal tableau** using the
real Nation board, cards, Company boards, and token art inside the existing dark
Politik shell:

- Nation/identity, exact ledger, and controlled Companies form three stable,
  labeled zones. The cream printed art against black glass, thin borders, and
  strong white counts looked cleaner than extra decorative chrome.
- The Nation card and three leader reserves sit in their authentic printed zones.
  Support and Corruption are exact labeled main-board summaries, not duplicated
  pieces. Every Company receives its own correctly proportioned board and one
  Margin marker.
- Cards stay upright. `READY` / `USED`, Margin, Markets, Assets, and empty states
  are explicit digital labels, so state never depends on interpreting a tiny
  rotation or pile.
- Every authentic card in setup, hand, tableau, reference, or Clash context can
  open full-height without committing it. This solved both readability and the
  need to audit unusual printed effects while playing.
- Uncertain OCR data is deferred until the card is actually used. One dark,
  high-contrast editor accepts the needed printed values; those human-entered
  values, never the OCR hint, drive the engine. Verified structured cards skip
  the editor entirely.
- The explicit `PERSONAL / MAIN BOARD` switch replaced an always-visible mini
  board that had covered useful Company space. Board-targeting actions can move
  to the main board temporarily without making the personal screen crowded.

This was verified in a populated live state at 1024×768, not only in setup: no
page scroll, no overlapping zones, preserved card/tracker ratios, three leader
reserves, one Company board and marker per Company, a hidden inactive main-board
layer, readable controls, and a full-size card dialog. The general rule is to
choose the personal renderer from the source geometry and the real viewport.
Authenticity means preserving the physical information and art, not forcing a
camera where it makes them harder to read.

### 9.15 If you are picking this up cold

Read the mod before you write anything. Write the spec before the engine. Commit
and push at every milestone, because sessions get interrupted and a pushed
checkpoint is the only reliable place to resume from. When the owner says "go" or
"finish up," it means keep working on your own without a recap. And prove every
fix with a screenshot or a green test run in the same message — "should work now"
without evidence gets sent back. Everything else is in sections 1–8 above; this
section was just the story that ties them together.

### 9.16 Card recognition: automate the print, not the rules

Politik also established a safer way to import symbol-heavy cards. Generic OCR
was useful for finding likely text, but it was not reliable enough to become game
state: failed digit reads had silently become zeroes, and visually similar icons
were easy to confuse. The successful pipeline used the fixed card layout instead:

- Crop known fields from the original 680x950 card art. Train or template-match
  one small symbol family at a time, and measure exact field accuracy against a
  human-reviewed label set. Do not promote a recognizer merely because its sample
  output looks plausible.
- Preserve `null` for a failed read. Never turn "not recognized" into a valid
  zero-cost or zero-requirement declaration.
- Keep raw OCR as an audit hint and store reviewed values separately with an
  explicit verification flag. The server trusts only verified values; the client
  cannot override them.
- Review independent field families independently. For Politik that meant titles,
  three Focus values, fixed costs and Bases, then type/Margin/Industries and Edge
  timing. A second pass caught mistakes that a single full-card transcription
  would have hidden.
- Exact authentic templates worked extremely well for the three fixed-position
  Focus symbols. A whole-declaration nearest-neighbour experiment did not meet the
  accuracy bar and was discarded. The lesson is that rejecting a model is a
  successful outcome when the alternative is quietly encoding wrong rules.
- Recognition stops at what is visibly and unambiguously structured. An Edge
  timing icon can safely decide when a card is offered, but it cannot by itself
  execute the prose beside it. Transcribe and review effect semantics separately,
  and leave an uncommon unencoded exception behind a clearly labeled manual path.

This changes the UI materially. Fully verified cards play directly with no
confirmation form. Variable or unverified fields are requested only when that
specific card is used, using dark high-contrast controls beside a full-size view
of the authentic art. In a Clash, the ordinary screen offers only verified cards
whose printed timing matches the current window, plus Pass; generic modifier and
cancel controls belong in an advanced "unencoded printed exception" disclosure.
Accuracy and a clean interface are compatible when uncertainty is represented as
data instead of imposed on every player.

---

*This doc is a living summary — update it when a convention changes. The
`memory/` files (project, ui-copy-style, in-game UI, sound, per-game) hold the
same facts in shorter form for quick recall.*
