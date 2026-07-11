# A Feast for Odin — final parity and ship audit

Snapshot: 2026-07-11  
Scope: the complete 2016 Classic base game, for one to four players, using the
official English rulebook/appendix and Tabletop Simulator workshop save
790490875 as the physical-component authority.

## Outcome

The Classic base-game port is complete. There are no remaining rules, card,
information-boundary, tutorial, responsive-layout, or browser ship blockers in
the declared scope.

| Area | Final evidence | Status |
|---|---|---|
| Physical extraction | 208 top-level / 1,061 recursive TTS objects, 61 action spaces, 190 occupations, 15 special tiles, 8 exploration faces, and 116 staged authentic assets. Manifest SHA-256: `3CD008B4AD33DC5D608B732A35F01DB8B21D78EC02F2586823886E3BE59DD207`. | **COVERED** |
| Core rules | `21,474/21,474` Feast checks, including deterministic short/long games for 1/2/3/4 players, serialization, redaction, conservation, placement, phases, and scoring. | **COVERED** |
| Printed action board | All `61/61` spaces, `18/18` effect discriminants, `19/19` semantic routes, and `1,655/1,655` directed assertions. | **COVERED** |
| Occupations | Exactly 190 cards, 221 executable clauses, 305 recursively expanded typed operations, all runtime/reducer families green, and `132/132` final adversarial acceptance checks. | **COVERED** |
| Device UI | Authentic HOME / ACTION BOARD / CARDS surfaces, exact decisions, click and HTML drag/drop placement, Feast planning, final-placement audit, complete scoring ledger, and private-card controls. | **COVERED** |
| Shared TV | Authentic action board, workers, mountains, explorations, imitation extensions, supplies, selectable public estates and board art, ordered narration, Saga Log, live scores, and winner event. | **COVERED** |
| Visual learning | 15 lessons, eight interactive Try/Reset labs, and a 20-step live-table tour. Every declared target is brought into its nearest scroll pane, spotlighted, and restored afterward. | **COVERED** |
| Solo browser | Production room `LJTB`: complete six-round game, 151 rendered interactions, both alternating blocker colors observed together, final score and TV winner event, no overflow or browser errors. | **COVERED** |
| Four-human browser | Production room `KWMB`: four isolated authenticated devices plus TV, all feature gates, real HTML drag/drop, complete six-round game, 442 rendered interactions, four final ledgers, TV winner event, no overflow or browser errors. | **COVERED** |

## Authoritative physical catalog

`tools/tts-extract/extract-feast.mjs` deterministically produces the rules-facing
golden files under `games/feast/golden` and authentic client assets under
`client/public/feast`.

The final catalog includes:

- both home-board lengths and calibrated placement grids;
- all buildings, exploration faces, mountain strips, ships, goods, resources,
  weapon material, four-player imitation extensions, and the first-player
  moose;
- all 15 special tiles with masks, costs, sword values, and point values;
- all 190 occupation faces in exact card-number order;
- exact action-board hotspot geometry and the 61 printed-space definitions;
- the official rulebook and occupation appendix exposed from the help UI.

The extractor is idempotent against the recorded manifest hash above and emits
no synthetic replacement art.

## Complete rules contract

The authoritative server reducer covers the printed round in order:

1. New Viking
2. Harvest
3. Exploration-board rotation and silver
4. Weapon draw
5. Viking actions, passing, imitation, and explicit End Turn
6. Start-player resolution
7. Board income
8. Independent sheep/cattle pregnancy and birth
9. Feast placement, emigration coverage, and Thing penalties
10. Recurring board/occupation bonuses
11. Mountain aging and replenishment
12. Viking return, including solo alternating colors

The short and long games, final-round no-Bonus rule, final legal placement,
designated wood/stone pastures, full score categories, tied winners, and the
official 100-point solo benchmark are all implemented.

Placement authority is shared rather than duplicated: the UI preview and the
server both call the same pure bounds, overlap, color-adjacency, income,
inventory, ownership, special-tile, and final-placement checks. The Banquet
Table has its own exact closed-cell, adjacency, named-horizontal, silver,
emigration, and penalty rules. Pre-placed Feast goods resolve their occupation
rewards exactly once when the Feast begins.

## All 61 printed spaces

`shared/src/feast/action-space-parity-test.ts` builds an independent legal and
illegal fixture for every extracted action space. It verifies exact Viking
cost, printed requirements, ordered effects, public decisions, inventory/deck/
supply/ship/board deltas, and atomic rejection.

Final result:

- action spaces: **61/61**;
- printed-effect discriminants: **18/18**;
- semantic routes: **19/19** (ordinary Emigration and exchange-whaling
  Emigration are independently directed);
- assertions: **1,655/1,655**.

Four-player imitation is a distinct server action with copied-space
provenance. The device and TV use the authentic extension art, and the browser
gate performs both direct action occupancy and a legal imitation.

## All 190 occupations

The occupation architecture is server-owned and typed. A client can select
only options declared by a live server decision; forged, stale, private, or
client-authored plans are rejected atomically. The compatibility
`use_occupation` wire action remains hard-rejected and has no UI control.

Final aggregate results:

| Suite | Passed |
|---|---:|
| Registry identity/source parity | 1,245 |
| Exhaustive pure runtime | 2,001 |
| Executor | 79 |
| Decision projection/validation | 1,194 |
| Deferred interpreter | 159 |
| Deferred public reducer | 270 |
| Action replacements | 204 |
| Occupation-draw replacements | 31 |
| Mandatory modifiers | 153 |
| Modifier gaps | 143 |
| Physical ships/action facts | 185 |
| Worker/action-space integration | 295 |
| Crafting facts | 188 |
| Material modifiers | 46 |
| Bonus replacement | 31 |
| Bonus cascade | 71 |
| General event cascade | 136 |
| Phase scheduler | 255 |
| Full reducer pipeline | 729 |
| Representative event hooks | 22/22 |
| Final adversarial reducer acceptance | 132/132 |

The final acceptance suite specifically directs the difficult physical and
timing cases: cross-owner packing rewards, pre-placement triggers, distinct
mountain-item removals, occupation-granted Emigration, ship-building payment
provenance, Harvest hooks, final-placement hooks, die-failure compensation,
multiple-board conditions, pregnant-animal flips, private hand decisions,
zero-worker occupation actions, pre-action mountain funding, physical
resolving-ship ore, Feast/final Anytime windows, passive effects, solo active
worker colors, Courier ownership, house classification, and occupation scoring
attribution.

## Device experience

The device is a fixed, responsive game console with three explicit modes:

- **HOME** — authentic estate art, exact placement grid, live inventory,
  rotation, click or drag/drop preview, legal/illegal ghost, readable reason,
  confirmation, ships, ore, purchases, animals, Feast planning, and public
  special-tile reference;
- **ACTION BOARD** — authentic board art, physical worker markers (3D where
  WebGL is available and an authentic 2D fallback otherwise), exact hotspots,
  disabled reasons, ordered effects, direct/imitation controls, dice, mountains,
  and explicit turn completion;
- **CARDS · WHOLE HAND** — the complete private hand, played occupations,
  authentic inspector, appendix clarification, Anytime activation, the full
  190-card catalog, and exact physical weapon-deck reference.

Server-produced card-effect decisions show enlarged source-card art, timing and
requirement, official clarification, a visual before/after impact strip,
highlighted legal board thumbnails where relevant, exact disabled reasons,
allocations, payments, repeat count, and accept/decline controls. When a live
decision changes stage or options without changing its ID (for example Roll to
Spend/Fail), the dialog resets stale local selection so Confirm can never send
an invisible old choice.

The final score screen lists every positive and negative category and overlays
every uncovered minus-one cell on authentic board art.

## Shared-TV and information boundaries

The TV exposes only public information. Private occupation hands and private
choice options remain redacted to counts/generic prompts for every other seat
and spectator.

The shared display provides:

- active seat, first-player badge/moose, round and phase track;
- physical action occupancy and authentic imitation extensions;
- mountain contents/aging, exploration faces/silver, public supplies, building
  counts, weapon deck/discard, specials, ships, goods, and played occupations;
- selectable public estate summaries and a modal showing every selected-player
  board/building on authentic art with committed placements;
- a paced event presentation queue with optional speech;
- a persistent reverse-chronological Saga Log used as the authoritative public
  audit trail, including the final `Game over — <color> wins` event.

## Visual tutorials

The help experience is available on demand and stays grounded in live game
surfaces.

- 15 selectable lessons cover goal/scoring, the 12-phase round, actions,
  placement, income, bonuses, goods, Feast/emigration, ships, dice, exploration,
  breeding, mountains, occupations, and solo play.
- Eight lessons are interactive labs with Try/Reset controls and authentic art:
  score arithmetic, actions/imitation, legal placement, income diagonal,
  recurring bonus enclosure, Feast gaps/emigration, high/low dice, and mountain
  aging.
- The 20-step live tour changes HOME/ACTION BOARD/CARDS modes and spotlights the
  actual status, modes, boards, supply, action detail, End Turn, ships, decisions,
  Feast, animals, mountains, cards, solo blockers, and score surfaces.
- Off-screen targets scroll only their nearest real pane. The tour restores the
  original pane position on step change/close and never moves the fixed game
  root.

## Production browser proof

The final browser gates run against `client/dist` served by the production
server, not a development watcher.

### Solo

```text
node tools/verify/feast-ui-smoke.mjs http://127.0.0.1:8899 ws://localhost:8899/ws
PASS — room LJTB
151 rendered interactions
```

It validates the 100-point benchmark, lessons, tour, complete six-round game,
both alternating blocker colors rendered together, final score, TV final Saga
event, 1024×768 device geometry, 1366×768 TV geometry, and zero console, asset,
request, or page errors. Captures are in `tmp/feast-ui`.

### Four human players

```text
node tools/verify/feast-ui-four-player.mjs http://127.0.0.1:8899 ws://localhost:8899/ws
PASS — room KWMB
442 rendered full-game interactions after feature checks
```

It validates four isolated private contexts/colors, TV privacy, all 20 tour
steps and 19 declared spotlights, 15 lessons, occupation inspector, all 190
cards, weapon composition, public-estate switching, decoded authentic board
art, direct action, imitation, public audit history, actual HTML
dragstart/dragover/drop, legal ghost/confirm, all six rounds, all four final
ledgers, multiplayer winner event, responsive no-overflow checks throughout,
and zero browser/console/asset/request errors across five pages. Captures are in
`tmp/feast-ui-4p`.

## Final verification commands

All were green on the final worktree:

```text
npm run test:feast
npm run typecheck
npm run build
npm test -w server
node tools/verify/feast-ui-smoke.mjs http://127.0.0.1:8899 ws://localhost:8899/ws
node tools/verify/feast-ui-four-player.mjs http://127.0.0.1:8899 ws://localhost:8899/ws
```

The production build transformed 879 modules. The server authority, private
views, authentic assets, browser layouts, and final UI bundle were all tested
together.

## Non-blocking maintenance

These are maintenance opportunities, not Classic base-game parity gaps:

- remove the already-rejected legacy `use_occupation` wire member when old save
  compatibility is no longer required;
- include the focused Feast scene-normalization check in the default client CI
  script in addition to the production browser asset gates;
- keep adding deterministic browser seeds for unusual occupation-card visual
  combinations even though all 190 server contracts and the generic visual
  resolver are already covered.
