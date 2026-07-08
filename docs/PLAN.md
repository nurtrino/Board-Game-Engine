# Board Game Engine — Rebuild Plan

## DIRECTION UPDATE (2026-07-06) — module-based, engine-only

The multi-game plan below is **superseded**. The engine is now **module-based**: we
build one polished, working game module at a time. Everything except the engine
core and **Ticket to Ride** has been deleted (Catan, Chess, Dark Tower, Trekking,
free-play). New flow: the TV is an interactive PC console — after a room is
created it shows a **clickable dashboard of game tiles**; clicking a tile starts
that module. The phone just joins and plays.

**Done + verified:** engine-only server (pure registry dispatch), TTR as the sole
module (3D map with real train meshes, phone hand/tickets/actions), clickable TV
dashboard. `npm run test -w shared` green (engine 1312 + ttr-on-engine 13260,
12/12 games finish + ttr rules 213067); a full live game played to a declared
winner. Next modules get added one at a time, each perfected before the next.

---

## The goal (restated)
Give the system a Tabletop Simulator mod (assets + rulebook + Lua). It produces a
custom, ready-to-play interface for that specific game: a 3D board on the TV, private
hands + a guided turn flow on each phone. Rules cannot be broken. Turn order is wired
into the UI. The board is set up correctly, verified, fully expanded, and in 3D.

## Decisions locked
- **Keep** the existing interface, TV view, lobby, and dark visual style. Do **not**
  rebuild them. The one UI surface we rebuild is the **phone interface** (in the same style).
- **Engine model:** one hardened, generic **runtime** driven by a per-game **definition**.
  Adding a game = author + verify a definition, not write a new app. Escape hatch to real
  code for genuinely weird games.
- **First proof game:** Catan (reuse its existing 3D board; new phone UI; re-plumbed
  onto the new runtime underneath).

## What we keep vs. rebuild
| Area | Decision |
|---|---|
| Rooms, QR join, WebSocket sync, reconnect, crash-safe persistence | **Keep** |
| Importer (download art, slice card sheets, capture TTS positions) | **Keep + extend** (add real mesh extraction) |
| Home / lobby / TV shell + dark visual style | **Keep, don't touch** |
| Catan's TV 3D board (`Board3D`) | **Keep** as game-1 renderer / escape hatch |
| Four bespoke game modules (Catan/DarkTower/Trekking/TTR rules + bots) | Catan logic kept as **reference**; the rest become throwaway references |
| Phone interface | **Rebuild** (guided, generated from legal actions) |
| Per-game "snowflake" architecture | **Replaced** by definition-driven runtime |

## The core abstraction: `GameDefinition`
A definition is data + constrained logic the one runtime executes. Five parts:

1. **Assets** — board art/mesh, piece catalog (real 3D meshes + textures), sliced cards,
   token art. From the importer.
2. **Layout / setup** — named zones (board slots, decks, discard, player areas, private
   hands), their positions (TTS transforms or a generated grid), and a **setup validator**
   that asserts the initial board matches the game's required composition.
3. **Rules / turn engine** — a turn/phase **state machine** (phases, whose turn, ordered
   steps) plus **legal actions**: each action has *guards* (preconditions) and *effects*
   (state mutation). Server-authoritative; illegal actions rejected. Plus **redaction**
   rules (what each viewer may see).
4. **Interface bindings** — per action: where it's performed (**phone** or **display**),
   and what control renders it (a deck to draw from, a button, a board tap-target). Turn
   order and legality are wired into the UI *because the UI is generated from the same
   legal-action set the server enforces.*
5. **Render bindings** — how zones/pieces map to 3D. Catan uses its existing bespoke
   renderer; later games use a generic definition-driven TV renderer.

## Milestones

### Phase 0 — Contracts & runtime skeleton
- Define the `GameDefinition` TypeScript contract (state, zones, actions w/ guards+effects,
  phase/turn machine, redaction, action-location, render bindings).
- Build the generic runtime: server-side (load definition → apply guarded actions → redact
  view) and client-side (TV + phone shells that read the definition).
- Wire it behind the existing lobby without changing the shell.

### Phase 1 — Asset & setup pipeline (real 3D + verified board)
- Extend importer to extract **real meshes**: mod `Custom_Model`/`Custom_Assetbundle`
  (.obj + texture + transform) and TTS built-in Unity meshes (AssetRipper, Unity 6) →
  a normalized `.glb` catalog per mod. Use the Blender MCP to convert/normalize/decimate.
- Board **layout spec + setup validator**.
- **Verification harness**: render the set-up board, screenshot from multiple camera
  angles (extend `tools/verify/shoot.mjs` to orbit), compare against TTS if needed.

### Phase 2 — Catan as a definition (the proof)
- Re-express Catan's (already-correct) rules as guarded actions + a phase machine in the
  definition format, using `shared/src/catan/` as the reference.
- **Reuse** the existing `Board3D` for the TV.
- Build the **new phone interface** — private hand + guided turn flow generated from the
  legal-action set (e.g. "draw" shows a deck, placement shows board tap-targets), in the
  existing dark style. (Memory notes a "Dock" bottom-tab layout was picked — confirm.)
- Verify: full bot game to a winner, rules-can't-break invariants, multi-angle board shots.

### Phase 3 — Second game (prove generality)
- Author a different archetype as a definition to expose runtime gaps:
  - **UNO** = pure phone/card/turn-order, or **Chess** = pure display-driven board moving.
- Build the **generic definition-driven TV renderer** here (Catan's bespoke one stays as
  the escape-hatch example).

### Phase 4 — Authoring workflow & hardening
- Document the repeatable pipeline: *given a mod → produce a verified definition.*
  Includes the **Lua-mining step** (rules come from the mod's own Lua, not memory/web),
  templates, and the verification checklist.

## Honest hard parts (called out, not hidden)
- **Rule authoring is semi-manual per game.** TTS Lua is a presentation mess; rules can't
  be reliably auto-extracted. I mine the mod's Lua + rulebook and author the guarded
  actions, then verify with bot games. This is expected, not a failure.
- **Mesh extraction** from Unity 6 asset bundles is finicky; may need AssetRipper +
  Blender round-trips. Some pieces may fall back to clean procedural geometry.
- **Verification** in this environment: the preview screenshot is broken; use `shoot.mjs`
  (puppeteer + software WebGL) for real visual checks, multiple angles.

## Open items to confirm
1. Phone layout direction (the "Dock" bottom-tab concept) — good to proceed?
2. For Catan specifically: keep the current TV `Board3D` exactly as-is, or is a visual
   pass on it in scope too?
3. Are the other imported mods (UNO, Chess, Clue, Monopoly, Hive, Secret Hitler, etc.)
   the target library, and is there a priority order after Catan?

## Status — Phases 0-3 done and verified (2026-07-06)

- **Phase 0 — engine core:** `shared/src/engine/` (types, runtime `defineGame`, registry).
  Server routes `game:'engine'` through the registry. ✅ verified (1312 checks + live smoke).
- **Phase 1 — assets/setup/verify:** importer 3D catalog (`manifest.pieces`/`models`) +
  `--meshes` real-OBJ download (Catan: 6 meshes, verified); `validateSetup` enforced in the
  runtime; `shoot.mjs --orbit` multi-angle harness + `phone-shot.mjs`. ✅
- **Phase 2 — Catan on the engine:** adapter over the proven rules; new phone UI generated
  from `view.available`; TV reuses Board3D. ✅ verified headless (22304 checks, 16/16 to a
  winner), live smoke, multi-angle board shots, phone shot.
- **Phase 3 — Chess (native definition):** full-rules chess via `defineGame`; 3D board with
  the real extracted piece meshes; display-driven tap-to-move. ✅ verified (3145 checks —
  perft exact incl. Kiwipete — mate/stalemate/castle/ep/promo/pin; live game; TV + phone shots).

### Known polish / follow-ups (not blocking)
- Chess phone board is small in its container (`.cp-board` height) — bump for a bigger tap target.
- Catan `availableFor` bank-trade heuristic and the shared `catanBot` can be sharpened.
- Old bespoke modules (darktower/ttr/trekking, old `CatanBoard`/`CatanPhone`) are now
  dead-ish paths; safe to delete once the engine has fully absorbed their games.
- Generic definition-driven TV renderer: chess got its own bespoke `ChessBoard3D`; a fully
  data-driven renderer (board+pieces from a render spec) is the next generalization.
