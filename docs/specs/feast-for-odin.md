# A Feast for Odin - classic base game parity specification

## Scope and authority

This port implements the complete 2016 English base game represented by the
local Tabletop Simulator workshop save `790490875` (`A Feast For Odin`). The
target includes 1-4 players, the six-round short game, the seven-round long
game, the original solo rules, all classic action spaces, all eight sides of
the four exploration boards, all buildings and special tiles, and all 190
occupation cards.

Rules authority, in descending order:

1. Local TTS save:
   `C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods/Workshop/790490875.json`
   (SHA-256 recorded in `games/feast/golden/manifest.json`). This is the source
   of truth for authentic art, component counts, card cells, transforms, and
   the edition being implemented.
2. Feuerland's official English base rulebook, 24 pages:
   `client/public/feast/rulebook.pdf`.
3. Feuerland's official English appendix, 16 pages:
   `client/public/feast/appendix.pdf`. Pages 2-12 are the complete numbered
   clarifications for occupations 1-190.
4. Printed component art from the mod when a value or grid exists only on the
   physical component.

The mod has 208 top-level objects and 1,061 recursive objects. It has no rule
automation beyond TTS's stock empty `onload` and `update` functions, no snap
points, no zones, and no embedded PDF. Accordingly, rules references below
point to the official rulebook and appendix; component geometry points to the
TTS object GUID and staged art in the golden manifest.

The Norwegians, Mini Expansion #1, Harvest/Mini Expansion #2, Christmas/DSP
special tiles, and the newer reduced 1-2 player action board are separate
products or edition modules and do not exist in workshop `790490875`. They are
not part of this classic-base target and must never appear as partially
implemented options. The UI labels the edition `CLASSIC BASE · 2016`.

## Product contract

- Shared TV/table screen: authentic action board and public supplies, workers,
  mountains, exploration boards, first-player marker, current round/phase,
  narration, public score preview, and an optional `EXPLAIN THE BOARD` layer.
- Player device: one 1024x768 no-scroll view with `HOME`, `ACTION BOARD`, and
  `CARDS` modes. The home mode uses the authentic flat home-board art, not a
  decorative 3D camera. All goods and special tiles are draggable preview
  pieces that rotate, ghost onto the exact grid, explain illegality, and commit
  only after confirmation.
- Every action with a cost or prerequisite is disabled with a specific reason.
  Client previews call the same pure legality helpers as the reducer.
- Every player turn ends with an explicit `END TURN` action. Selecting and
  resolving a worker action never advances the turn silently.
- Cards remain upright, inspect at full height, and expose their official
  appendix clarification. Hidden hands are redacted from opponents and the TV.
- `SHOW ALL OCCUPATIONS`, `SHOW WEAPONS`, `RULEBOOK`, and `APPENDIX` remain
  available as references throughout play.
- A first-round live coach-mark tour points to the real controls. Context help
  can open a visual lesson for every core mechanism without leaving the game.
- TV sound narrates actions, phase changes, dice results, and the winner.
  Devices use clicks and error blips only.

## Setup

Rulebook pages 4-6 and 23.

- Options:
  - `length`: `long` (7 rounds) or `short` (6 rounds).
  - `occupationMode`: `A`, `BC`, or `all`. Starting occupations and dark
    occupations are filtered by the chosen mode.
  - `soloStartingOccupation`: random or choose, only for one player.
- Each player receives the matching side of a home board, 12 Vikings, one
  light-brown starting occupation, bow, snare, spear, and one mead.
- Long game: one Viking begins on each round space 1-7, leaving five on the
  Thing Square. Short game: one on 1-6, leaving six.
- Two mountain strips are face up for 1-3 players and three for 4 players.
- Initial exploration faces are Shetland, Faroe Islands, Iceland, Greenland.
- Start player is selected from the seeded random stream.
- Four-player setup randomly enables imitation in one of columns 1/2 and one
  of columns 3/4, matching the two double-sided extension tiles.
- Houses are limited to 3 sheds, 3 stone houses, and 5 long houses. Special
  tiles and exploration boards are unique. Standard goods, ships, resources,
  and weapons are treated as unlimited when physical pieces run out, as the
  rulebook directs.
- Solo uses two worker colors exactly as described under `Solo game` below.

## Round structure

Rulebook pages 8-11 and 22-23.

Every round runs these phases in order:

1. New Viking
2. Harvest
3. Turn Exploration Boards and Place Silver
4. Draw New Weapon
5. Actions
6. Determine Start Player
7. Income
8. Animal Breeding
9. Feast
10. Bonus
11. Update and Add Mountain Strips
12. Return Vikings

Automatic phases may animate as one sequence, but any occupation-created
choice is queued and resolved before the sequence continues.

Harvest schedules:

| Game | R1 | R2 | R3 | R4 | R5 | R6 | R7 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Long | 1 | 1-2 | none | 1-3 | none | 1-4 | none |
| Short | 1 | none | 1-2 | none | 1-3 | none | - |

Level 1 gives peas, beans, and flax. Levels 2, 3, and 4 additionally
give grain, cabbage, and fruits, respectively.

Exploration flips occur A/B/C/D in long rounds 3/4/5/6 and short rounds
2/3/4/5. In each flip round, every other unclaimed face receives two silver.
Silver on the face being flipped returns to the supply. There is no phase 3 in
the first or final round.

The player who placed Vikings last becomes next round's start player. The game
ends after the final Feast. There is no final Bonus phase. Final income is
recorded for scoring rather than paid into the spendable silver supply.

## Action phase and pending decisions

Rulebook pages 9 and 14-20.

- Columns 1/2/3/4 cost 1/2/3/4 Vikings.
- A printed action space can be occupied only once per round. The actor must
  use at least one effect; paying a cost is itself an effect.
- Third-column placement draws a dark occupation before the printed action.
- Fourth-column placement may play one occupation before or after the printed
  action.
- Imitation copies an occupied opponent space in its enabled column. It cannot
  copy an unoccupied space or one occupied by the acting player.
- A player may pass with workers remaining, but cannot return to worker actions
  that round.
- The action definition list in `games/feast/golden/action-spaces.json` is the
  complete 61-space transcription of the authentic action-board art. Every
  definition stores column, worker cost, group, ordered effects, alternatives,
  optional payments, requirements, die rules, returned Vikings, and art bounds.
- Branching effects use a serializable pending-decision queue. While the queue
  is non-empty, only the owner of its head can answer it. Decisions include
  goods selection, mountain strip/items, ship/building choice, livestock
  purchase, exploration face, special tile, occupation cards, emigration ship,
  die rolls and spending, occupation timing, and card-directed effect editing.

Action groups, all required:

- Build Houses
- Build Ships
- Hunting
- Livestock Market
- Weekly Market
- Products
- Crafting
- Mountains and Trade
- Sailing
- Raiding, Pillaging, and Plundering
- Exploration
- Emigration and Occupation

## Goods, shapes, and placement

Rulebook pages 6-7 and 12-13; appendix pages 12 and 14-16.

Standard rectangular shapes in grid cells:

| Front/back | Shape | Quantity |
|---|---:|---:|
| peas/mead | 2x1 | 25 |
| flax/stockfish | 3x1 | 20 |
| beans/milk | 2x2 | 20 |
| grain/salt meat | 4x1 | 20 |
| cabbage/game meat | 3x2 | 17 |
| fruits/whale meat | 3x3 | 15 |
| sheep/pregnant sheep | 4x2 | 18 |
| cattle/pregnant cattle | 4x3 | 15 |
| oil/rune stone | 2x1 | 43 |
| hide/silverware | 3x1 | 30 |
| wool/chest | 2x2 | 30 |
| linen/silk | 4x1 | 20 |
| skin and bones/spices | 3x2 | 20 |
| fur/jewelry | 4x2 | 20 |
| robe/treasure chest | 3x3 | 18 |
| clothing/silver hoard | 4x3 | 15 |

The 15 special-tile masks are extracted from transparent mod art at 200 pixels
per grid cell and asserted against their official areas of 5-13 cells. The
golden stores name, mask, sword value, silver cost, forge flag, point value,
TTS GUID, and staged image.

Home and exploration boards accept green, blue, silver, and ore. Green pieces
may not touch another green piece orthogonally. Blue, silver, and ore may touch.
Orange, red, wood, and stone are forbidden. Special tiles count as blue.

House placement areas accept orange, red, green, blue, and silver, but not ore.
Orange may not touch orange orthogonally and red may not touch red. Long-house
pillar cells are forbidden. Sheds and stone houses have separate designated
wood/stone cells.

No piece may overlap another piece, cover a forbidden cell, or overhang the
board mask. A committed placement cannot be removed. The client may freely
test local ghost placements before committing.

An income cell can be covered only if all valid cells to its left, below it,
and in its lower-left rectangle are already covered. Printed bonus cells count
as covered. Each board's smallest visible income value is its income.

A printed bonus is earned only if its own cell remains uncovered and every
valid orthogonal/diagonal neighbor around it is covered. Edge bonuses require
fewer neighbors. Income and bonuses resolve simultaneously within their phase;
proceeds from one board cannot retroactively change another board's result in
that same resolution.

## Feast

Rulebook pages 10-11; appendix page 12.

- Cover every currently open Banquet Table cell with orange/red food or
  one-silver coins.
- Orange food may not touch orange food; red may not touch red; silver may
  touch silver.
- One tile of each named food type may be horizontal. Further copies of that
  type must be vertical when orientation matters.
- Every tile must cover at least one feast cell and stay within the table.
- Emigrations permanently occupy table cells from left to right.
- Every uncovered required cell awards one permanent Thing Penalty worth -3.
- Feast goods return to the general supply after resolution.

## Animals

Rulebook page 10.

Resolve sheep and cattle independently. If at least one is pregnant, turn every
pregnant animal non-pregnant and gain one non-pregnant newborn per turned tile.
Otherwise, with at least two non-pregnant animals, turn exactly one pregnant.
A single pregnant animal still gives birth. Animals permanently placed into a
house no longer breed or score as animals.

## Ships, sailing, exploration, and emigration

Rulebook pages 13 and 16-20; appendix pages 15-16.

- Whaling boat: cost/value 3. Knarr: cost/value 5. Longship: cost/value 8.
- Bay capacity is three whaling boats and four large ships.
- Ships may be bought at any time for silver or built on action spaces.
- The same ship can support multiple actions until it emigrates.
- Ore may be placed immediately before, but not during, an action. It normally
  cannot be removed. Whaling boats have one printed ore and one added-ore slot.
- Overseas Trading costs one silver, requires a knarr, and turns any number of
  different green goods in supply to their blue reverse.
- Special Sale requires a knarr and buys up to two available special tiles at
  their printed costs. The English Crown cannot be bought.
- Exploration requirements:
  - Shetland/Faroe Islands: one Viking and any ship.
  - Iceland/Greenland/Bear Island: two Vikings and a knarr or longship.
  - Baffin Island/Labrador/Newfoundland: three Vikings and a longship.
- Claiming a face also claims its accumulated silver. Ships used to explore
  remain available.
- Emigration turns a knarr or longship to its emigrated side, removes its ore,
  costs silver equal to the round, and places it in the leftmost open feast
  position. Emigrated knarrs/longships score 18/21 and are no longer ships.

## Dice actions

Rulebook pages 17-19.

Every die action supports up to three deterministic-stream rolls. Re-rolling
invalidates the previous result. The UI shows remaining rolls, legal spending,
success rewards, failure rewards, and why a choice is unavailable.

- Raiding: d8 high; requires a longship; ship ore is ignored. Stone and long
  swords add one each. Take one blue or special tile with sword value at most
  the result. Result 5 or less must fail; a higher result may voluntarily fail.
  Failure gives one stone and one long sword.
- Pillaging: d12 high; use the owned longship with the most ore and add that ore
  without spending it. Stone and long swords add one each. Loot matches raiding.
  Failure gives stone, long sword, and returns one Viking.
- Hunting Game: d8 low; pay the result with wood and bows. Success gives hide
  and game meat. Failure gives wood and bow.
- Laying a Snare: d8 low; pay with wood and snares. Success gives fur and a
  snare. Failure gives wood, snare, and returns one Viking.
- Whaling: d12 low; subtract all printed and added ore on the selected boats,
  floor at zero, then pay with wood and spears. Zero forces immediate success.
  Success gives oil, skin and bones, and whale meat. Failure gives wood, spear,
  and returns two Vikings. Major whaling uses 1-3 boats; minor uses one.
- Plundering requires two longships and takes one silver hoard without a roll.

Consolation/reward weapons come from discard first, then the draw pile; the
remaining draw pile is shuffled afterward when searched.

## Mountains and trade

Rulebook pages 15-16.

Resources are always taken from the arrow end. A printed pair of silver is one
item. Multi-strip actions cannot combine allowances on one strip. The eight
ordered strip contents are extracted from the mod and asserted to contain seven
items apiece.

Phase 11 removes the leftmost item from every face-up strip, discards empty
strips, and reveals/populates one new strip. In the four-player long game, no
new strip is added in round 7.

Goods upgrades preserve the exact shape: orange to red, red to green, green to
blue. A double upgrade changes orange to green or red to blue. One good cannot
be upgraded twice unless the printed action explicitly uses the double-upgrade
symbol.

## Occupations

Rulebook pages 20-22; appendix pages 2-12.

There are exactly 190 occupations:

| Deck | Starting | Dark | Total |
|---|---:|---:|---:|
| A/a | 15 | 57 | 72 |
| B/b | 15 | 44 | 59 |
| C/c | 15 | 44 | 59 |

The lowercase appendix deck letter marks a light-brown starting card. Golden
card order maps ascending card numbers within each deck/back group onto the TTS
sheet cells: A/B/C dark sheets hold 57/44/44 cards; the starting sheet holds
15 a, 15 b, and 15 c cards. Extraction asserts all 190 unique numbers, names,
VP values, deck/back types, clarifications, and categories.

Effect categories are immediate, anytime, each-time, and as-soon-as. The full
official clarification is always visible in the card inspector. Core recurring
modifiers are structured and enforced. For the long tail of card-specific
physical exceptions, a played-card resolver exposes only bounded operations
needed by the appendix: resources/goods, weapons, silver, ships/ore,
buildings/boards, animals, occupations, board placement, action copies, extra
round phases, special tiles, and scoring adjustments. Every resolver use must
name the owned card, validate ownership and bounds, and produce a precise public
event. This preserves every printed effect without allowing arbitrary state
edits and mirrors the honor-system interpretation of the physical cards.

Hands are private. Played occupations, weapons, goods, ships, animals, and
board placements are public.

## Scoring

Rulebook pages 22-23; appendix pages 14-16.

Positive categories:

- Active ships: 3/5/8 for whaling boat/knarr/longship.
- Emigrations: 18/21 for knarr/longship.
- Printed exploration/building VP.
- Sheep 2, pregnant sheep 3, cattle 3, pregnant cattle 4.
- Played occupation VP.
- Silver remaining in supply.
- Final income.
- English Crown: 2 additional VP wherever placed.
- Valid occupation-specific endgame effects.

Subtract every uncovered printed negative cell on home, exploration, and
building boards, plus three points per Thing Penalty. Goods do not score merely
for remaining in supply or being placed. Tied players all win; there is no
tiebreaker.

The final scoring panel exposes every line item and highlights each uncovered
negative cell on the authentic board art.

## Solo game

Rulebook page 23.

- Use two worker colors on one player board.
- Long setup: active color has one worker on round 1, two on rounds 3/5/7,
  and five on the Thing Square; alternate color has two on rounds 2/4/6 and
  five waiting.
- Short setup: active color has two on round 1, two on rounds 3/5, and five on
  the Thing Square; alternate color has two on rounds 2/4/6 and six waiting.
- Workers placed in round 1 remain and block spaces in round 2. At the end of
  round 2, remove round-1 workers and leave round-2 workers. Alternate colors
  and blocking in the same way through the final round.
- Skip determining a start player; the solo player is always first.
- Choosing a starting light occupation is an explicit optional setup rule.
- A score of 100 is shown as the official benchmark, not a win threshold.

## Determinism, persistence, and player views

- State contains only JSON-safe arrays, records, numbers, strings, booleans,
  and null. It carries `schemaVersion` for save migration.
- All shuffles and rolls use a state-carried seed/counter stream.
- Reducer application is atomic: clone, validate, resolve, then commit.
- Views redact occupation hands and any unresolved private card choices.
- Events carry monotonically increasing sequence numbers so clients and smoke
  tests detect completion without sleeps.
- Bot decisions use the same public legality helpers and act with a deliberate
  server delay so TV narration remains readable.

## Visual lessons and tutorial coverage

Every lesson uses the actual live board or player screen and highlights the
relevant cells/components:

1. Goal, negative spaces, and score preview.
2. Short versus long setup and worker growth.
3. All 12 phases on the real round track.
4. Action-board columns, blocking, third/fourth-column card bonuses, imitation,
   pass, and explicit End Turn.
5. Goods color ladder and same-shape upgrades.
6. Legal and illegal placement, rotation, adjacency, income prerequisites, and
   bonus enclosure with interactive ghost examples.
7. Feast orientation/adjacency, emigration coverage, and Thing Penalties.
8. Ships, bay capacity, ore, sailing, exploration, and emigration.
9. Raid, pillage, hunt, snare, and whaling with animated probability/result
   previews and failure compensation.
10. Sheep/cattle breeding timeline.
11. Mountain-strip direction, split taking, and phase-11 aging.
12. Occupation timing colors and card-specific appendix help.
13. Exploration flipping/silver and every board's notable feature.
14. Final-round differences and category-by-category scoring.
15. Solo alternating-color blocking.

## Ship gates

The port is complete only when all of the following are green:

- Extractor idempotence and manifest hashes.
- Authentic asset audit: no placeholders and no missing staged object.
- 61 action definitions, 190 occupations, 15 special masks, 8 mountains,
  8 exploration faces, 2 home-board faces, 3 building types, 3 ship types.
- Directed tests for every core rule and action-space family.
- Deterministic bot playthroughs for solo and 2/3/4 players in short and long
  games, with invariants after every action.
- JSON serialization/rehydration and private-view redaction tests.
- Client build and strict typecheck.
- Populated device geometry at 1024x768 with no page scroll, overlap, clipped
  dialog, or unreadable control.
- Clean page-error audit and fresh TV/device screenshots.
- Live WebSocket full-game smoke test.
- Rulebook UI-coverage audit mapping every decision and public fact to a real
  control or display, and reverse-auditing every action field the UI sends.
- Four-seat full short game played entirely through real device DOM controls;
  a separate solo UI game proves alternating worker blocking.

