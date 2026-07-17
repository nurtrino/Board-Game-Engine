# SETI: Search for Extraterrestrial Intelligence

Durable port specification for the Board Game Engine. This spec covers the
English base game for 1-4 players, all five alien species, and the official solo
rival. The two English promo project cards present in the source mod are an
optional room setting and are not mixed into the base 138-card deck by default.

The product target is a tactile digital table. Players touch cards, probes,
markers, data, tech tiles, and printed board locations directly. Text explains a
selected component, but long lists of action buttons are not the primary
interface.

## 1. Sources and provenance

### Local source of truth

- TTS Workshop save: `C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods/Workshop/3415673254.json`
- Workshop id: `3415673254`
- Save title: `SETI: Search for Extraterrestrial Intelligence`
- Save date: 2025-09-06
- Global Lua: 143 lines. It maintains income readouts and implements the exact
  physical solar-system rotation and bump behavior.
- Setup controller: object `860abb`, 1,894 lines. It randomizes sector boards,
  all three discs, both alien species, gold tiles, and tech stacks; deals project
  cards; builds round-end piles; and sets up the solo rival.
- Main board: object `72f0d1`, 102 attached snap points.
- Solar discs, from top to bottom:
  - Ring 1 `9bdd5c`
  - Ring 2 `d2b92f`
  - Ring 3 `cb4843`
- Sector boards:
  - Kepler-22 / Proxima Centauri `8c079b`
  - Sirius A / Barnard's Star `018bc4`
  - Procyon / Vega `737f28`
  - 61 Virginis / Beta Pictoris `b7f4d9`
- Player boards: white `5593b2`, green `f153aa`, purple `4c7c0e`, orange
  `ec3a4b`.
- Alien board backs are common tokens with species fronts stored as attached
  decals. Their snap counts are 15 / 21 / 16 / 12 / 17.

The Workshop item is a community physical-table mod, not a rules authority. Its
geometry, object identities, art, and setup automation are authoritative for
this port. Rules come from the official CGE material below.

### Official rules

- CGE game page: <https://www.czechgames.com/games/seti-search-for-extraterrestrial-intelligence>
- English rulebook: <https://filemanager.czechgames.com/storage/files/seti-search-for-extraterrestrial-intelligence/rules/seti-rules-en.pdf>
- English player aid: <https://filemanager.czechgames.com/storage/files/seti-search-for-extraterrestrial-intelligence/other-downloads/player-aid/seti-player-aid-en.pdf>
- Alien species rules: <https://filemanager.czechgames.com/storage/files/seti-search-for-extraterrestrial-intelligence/other-downloads/alien-species/seti-alien-species-en.pdf>
- Official FAQ snapshot: <https://filemanager.czechgames.com/storage/files/seti-search-for-extraterrestrial-intelligence/other-downloads/additional-content/seti-faq.pdf>
- Living official FAQ: <https://boardgamegeek.com/thread/3392878/official-faq-plus-cards-clarification>
- Official randomizer: <https://seti-solarsystem.czechgames.com/>

The local English rulebook is the January 2025, 28-page edition. The local
English alien PDF contains all five species sheets. Page references below refer
to that rulebook unless stated otherwise. The living FAQ was rechecked on
2026-07-11; it includes the designer's 2025 clarification that a card's full
main effect resolves before its mission enters play.

## 2. Scope and component contract

The base implementation includes:

- Five rounds and 1-4 players.
- 138 base project cards.
- 48 tech tiles in twelve shuffled stacks.
- Four double-sided gold scoring tiles.
- The fixed printed solar base plus three independently randomized discs.
- Four uniformly permuted sector boards.
- Two hidden species selected from five.
- All 55 alien cards and every alien-specific token/rule.
- Official solo rival, all five difficulty levels, 24 objectives, and 19 rival
  action cards.
- Unlimited digital supply for figures/markers, credits/energy, data, and
  exofossils, matching the starred physical components.
- Optional English promo project cards `Gateway to Mars` and `Pluto: Not a
  planet since 2006`. The replacement scan for base card 117, `Lunar Gateway`,
  remains part of the base deck.

Room options are deliberately short:

- `mode`: multiplayer or solo. A one-seat room selects solo automatically.
- `soloDifficulty`: 1-5, shown only in solo.
- `promoCards`: off by default.

The alien pair, sector order, disc rotations, tech order, gold-tile sides,
starting player, and decks are seeded random state, not setup forms.

## 3. State machine

### Round and turn flow

The game lasts five rounds (p. 7).

1. The starting player takes the first turn, then play proceeds clockwise.
2. A turn contains exactly one main action and any legal free actions.
3. Free actions may occur before, after, or between resolved steps of the main
   action, but one free action cannot interrupt another. In particular, a
   player may place newly gained Scan data into their computer before choosing
   a later optional telescope-tech activation.
4. Finish the current effect, including completed sectors.
5. The active player explicitly ends the turn.
6. Resolve crossed player milestones in turn order, then neutral milestones.
7. Resolve species discovered during the turn.
8. Advance to the next player who has not passed.
9. Once all players pass, resolve income and begin the next round. After round 5,
   resolve final scoring.

Passing remains an explicit main action and ending a normal turn remains an
explicit player gesture. No successful action silently hands control away.

### Limits

- Publicity: 0-10.
- Data pool: 0-6. Excess data is discarded.
- Hand: unlimited during a round; discard to 4 while passing.
- In-space probes: 1 by default; 2 with the matching probe technology. A card
  may explicitly ignore this limit for its embedded launch only.
- Orbiters and landers do not count as probes in space.
- Figures and markers are rules-unlimited even if the physical supply empties.

### Serializable decision queue

All choices are saveable, typed pending decisions. While the queue is nonempty,
only the owner of the head decision can answer it, except for public milestone
and species-resolution steps that identify their next actor in state.

Representative decision kinds:

- `initial-income-card`
- `card-effect-choice`
- `discard-to-four`
- `end-round-card`
- `signal-sector`
- `completed-sector-order`
- `trace-space`
- `gold-tile`
- `tech-stack`
- `moon-or-planet`
- `alien-card-source`
- `centaurian-reward`
- `exertian-card`
- `manual-trigger-choice`

One triggering event can cover only one triggerable-mission reward, even when
several are eligible. A solo objective may also mark from that same event.

## 4. Setup

### Shared board

- Keep the printed base in its fixed board orientation and randomize each of
  the three physical discs independently to one of eight 45-degree
  orientations.
- Uniformly permute the four sector boards into the four quarter-ring targets
  from setup Lua lines 60-111.
- Fill nearby-star data tracks to their printed capacities:
  - Kepler-22: 5
  - Proxima Centauri: 6
  - Sirius A: 6
  - Barnard's Star: 5
  - Procyon: 5
  - Vega: 4
  - 61 Virginis: 6
  - Beta Pictoris: 5
- Shuffle the five species and reveal only their common backs in the two active
  slots.
- Randomize one side of each gold tile.
- Shuffle each four-tile tech stack and place a 2-point token on all twelve.
- Shuffle the 138-card project deck and deal a three-card row.
- Create four end-round stacks, each with player count plus one cards.
- Set the rotation pointer to disc 1 and the first-pass reminder on round 1.
- Neutral milestones:
  - One or two players: two neutral markers at both 20 and 30.
  - Three players: one at both 20 and 30.
  - Four players: none.

### Players

- Seats use white, green, purple, and orange.
- Starting VP is seat order: 1 / 2 / 3 / 4.
- Each player begins with 4 publicity, 4 credits, 3 energy, and 5 project cards.
- Each chooses one of those cards to tuck for income and immediately gains its
  income icon.
- Starting income for rounds 2-5 is 3 credits, 2 energy, and 1 random card, plus
  all tucked-card income.

## 5. Core actions

### Launch a probe

- Main action, cost 2 credits (p. 8).
- Take a figure from supply and place it on Earth.
- Illegal at the current probe limit unless an effect explicitly ignores it.

### Move

- Free action: spend 1 energy for 1 movement, or discard a card for a movement
  corner.
- Movement is orthogonal between adjacent solar cells, never diagonal.
- The Sun is impassable.
- Leaving asteroids costs one additional movement unless the matching tech is
  owned.
- Movement may be split across probes and Mascamite capsules.
- Entering a printed space-object cell (a non-Earth planet or comet) grants
  1 publicity on every visit, including solar-rotation pushes. Entering an
  asteroid grants the same reward only with the asteroid-navigation tech.
- Planet cells enable later Orbit or Land main actions.

### Orbit

- Main action, cost 1 credit and 1 energy (p. 10).
- Requires the player's probe on a non-Earth planet.
- Remove it from the solar board and add an orbiter to the planet board.
- Gain the printed orbit rewards.
- The first orbiter at that planet also scores 3 VP.
- Orbit capacity is unlimited.

### Land

- Main action, base cost 3 energy (p. 11).
- Cost is 2 if any player's orbiter is already at the planet.
- The landing-discount tech reduces either cost by 1.
- Requires the player's probe at a non-Earth planet.
- Remove it from the solar board and place a lander on the planet board.
- Gain printed VP and an orange life trace.
- The first landing gains the printed data bonus. Mars has two such spaces.
- Moons require the moon-landing tech or a card that expressly allows them.
- A moon holds exactly one lander; planet lander capacity is unlimited.

Printed landing rewards:

| Body | Reward | First landing |
|---|---|---|
| Mercury | 12 VP + orange trace | 3 data |
| Venus | 5 VP + orange trace | 2 data |
| Mars | 6 VP + orange trace | 1 or 2 data, one space each |
| Jupiter | 7 VP + orange trace | 2 data |
| Saturn | 8 VP + orange trace | 2 data |
| Uranus | 9 VP + orange trace | 3 data |
| Neptune | 10 VP + orange trace | 3 data |
| Phobos / Deimos | 8 VP + tuck for income | Single moon space |
| Callisto | 13 VP + 4 data | Single moon space |
| Ganymede | 12 VP + 5 publicity | Single moon space |
| Europa | 7 VP + 2 orange traces | Single moon space |
| Enceladus | 12 VP + one red, blue, and yellow signal | Single moon space |
| Titan | 7 VP + one trace of each color | Single moon space |
| Titania | 25 VP | Single moon space |
| Triton | 26 VP | Single moon space |

Orbit rewards and exact target coordinates are transcribed from the authentic
planetary board into `seti-data.json`; renderer and engine consume the same
record.

### Scan nearby stars

- Main action, cost 1 credit and 2 energy (p. 12).
- Resolve the following in either order:
  - Mark one signal in Earth's sector.
  - Discard one card from the row and mark one signal in either sector color
    printed on that card. Refill the row after the whole action.
- Telescope techs may add or redirect signals and charge their printed costs.
- A card-provided Scan waives the base Scan cost but not optional tech costs.

### Mark and complete sectors

- Marking a signal is mandatory.
- Remove the leftmost data token, place it in the acting player's pool, and put
  their marker in the emptied position.
- The second signal position immediately scores 2 VP.
- A full sector accepts excess signals. They grant no data but participate in
  majority and latest-marker tiebreaking.
- Completed sectors resolve after all signals from the current action/effect.
- Most markers wins; ties favor the most recently placed tied marker.
- Winner marks the star's win space and gains its current printed reward.
- Every contributor gains 1 publicity.
- Determine second with the same tiebreak. If a distinct second player exists,
  retain one of their markers in the first slot.
- Return all other signal markers and refill the remaining track with data.
- Persistent win markers do not participate in later sector contests.

### Place and analyze data

- Free action: move one data token from the player's pool into the leftmost open
  top computer space (p. 14).
- Resolve covered bonuses immediately.
- Lower tech spaces may be filled only after their upper space is filled and may
  be filled in any order.
- Main Analyze action costs 1 energy and requires all six top spaces filled.
- Clear every data token from the computer, not the pool, and mark a blue trace.

### Play a card

- Main action, pay the printed credit cost (p. 15).
- Resolve the white effect from left to right.
- Embedded named actions waive their standard cost.
- Ordinary cards discard after resolution.
- Conditional and triggerable missions remain face up, then turn face down when
  completed.
- Gold-box end-game cards remain face up.
- A card is used for exactly one purpose: main effect, corner free action, or
  income.
- Every project and alien card has a stable id, authentic-art reference, cost,
  one printed signal color (matching either of the two active sectors of that
  color), free corner, income corner, type, conditions, and typed effect
  operations in the extracted catalog.

### Research a technology

- Main action, cost 6 publicity (p. 16).
- Rotate the indicated solar disc before choosing a tile.
- Choose one of the twelve techs the player does not own.
- Take the top shuffled tile, gain its immediate reward, and flip it onto the
  matching player-board slot.
- The first tile taken from a stack also scores 2 VP.
- Card-granted tech still rotates, charges no publicity, and restricts the type
  if the card says so.

Persistent tech abilities:

- Probe limit 2, with an immediate free launch.
- Entering asteroids grants publicity; leaving asteroids has no surcharge.
- Landing costs 1 less energy.
- Moon landing enabled.
- Earth's Scan signal may move to a sector adjacent to Earth; immediate 2 data.
- During Scan, discard a hand card for an extra matching signal.
- During Scan, pay 1 publicity for an extra signal in a Mercury sector.
- During Scan, pay 1 energy to launch or gain one movement.
- A computer tech is placed in any of the four printed computer-tech slots,
  which align with top-row data spaces 1, 2, 4, and 6. Its upper space is that
  existing top-row space: placing data there later scores 2 VP. If data is
  already there when the tech is installed, put the tile underneath it without
  scoring those 2 VP. Its lower space unlocks only while the aligned upper
  space is filled and resolves the tile's printed reward when filled.

### Pass

- Main action (p. 19).
- The player may take free actions before committing the pass.
- Discard to four cards.
- First passer rotates the solar system, including in round 5.
- In rounds 1-4, choose one card from the round stack and return the rest.
- A passed player is skipped for the rest of the round.
- The last passer chooses from two remaining cards and discards the final card.
- After income, pass the starting-player marker one seat clockwise; passing
  order never determines the next round's starting player.

### Other free actions

- Discard a card for its printed corner effect.
- Tuck a card when an effect grants income and immediately gain its income icon.
- Complete a legal conditional mission.
- Cover one eligible triggerable-mission circle for the current trigger.
- Exchange two identical cards, two credits, or two energy for one card, credit,
  or energy. The received card may come from the row or deck.
- Spend 3 publicity to buy a card from the row or deck.

## 6. Solar-system geometry and rotation

The renderer layers the authentic printed base and three transparent disc PNGs
at their exact TTS transforms. The base remains fixed; each disc has an
independent seeded orientation in steps of 45 degrees.

The engine uses 24 logical cells: three rings by eight sectors. Adjacency is
clockwise/counter-clockwise within a ring and inward/outward within a sector.
Cell contents are derived from the four layer orientations and alpha/support
maps extracted from the source PNGs.

The baseline art transcription is exact (a sector names the wedge immediately
counter-clockwise of that sector ray):

| Layer | Ring 0 | Ring 1 | Ring 2 |
|---|---|---|---|
| Fixed base | s0 comet; s1 asteroid; s2 comet; s4 asteroid; s5 asteroid; s7 comet | s0 asteroid; s2 comet; s3 asteroid; s4 asteroid; s5 comet; s7 asteroid | s0 comet; s1 Uranus; s2 asteroid; s3 comet; s4 Neptune; s5 asteroid; s6 comet |
| Disc 1 | s1 Earth; s5 Mercury; s7 Venus | - | - |
| Disc 2 | s0 asteroid; s2 asteroid | s3 asteroid; s7 Mars | - |
| Disc 3 | s1 comet; s2 asteroid; s6 asteroid; s7 asteroid | s0 comet; s4 asteroid; s7 asteroid | s3 Jupiter; s7 Saturn |

The sampled support masks (s0 through s7) are disc 1
`11101111/00000000/00000000`, disc 2
`11110011/01110011/00000000`, and disc 3
`11100111/11101011/01111011`. A covered lower-layer object is not a feature of
the current cell; all body, comet, asteroid, and publicity predicates use the
single top-visible layer.

Rotation cycles disc 1, disc 2, disc 3, then repeats. Each turn is one sector
counter-clockwise (rulebook p. 16, global Lua `rotate_solar_system`).

- Rotating disc 1 moves disc 1.
- Rotating disc 2 carries discs 1 and 2.
- Rotating disc 3 carries discs 1, 2, and 3.
- A probe/capsule moves with the selected disc if its current topmost physical
  support is that disc or an upper disc.
- A piece initially supported by a lower layer stays still unless the newly
  rotated selected/upper layer would overlap it. In that case it is bumped one
  sector with the rotating layer.
- Rotation movement is free and grants printed visit publicity.

The extractor records lossless-alpha support masks at every canonical cell.
Runtime derives the complete support/carry/bump behavior from those masks for
every legal set of three disc orientations and every cell; it never
approximates cutouts by visual guessing.

## 7. Milestones, traces, and species

### Gold milestones

At 25, 50, and 70 VP, the player marks a different gold tile. Resolve after the
turn, active player first and then clockwise. Tile claim values are:

| Side | Unit | Per-set value for first / second / later claimant |
|---|---|---|
| Tech A | One tech of each type | 11 / 8 / 5 |
| Tech B | Any two techs | 7 / 5 / 3 |
| Mission A | Completed mission | 4 / 3 / 2 |
| Mission B | Pair of missions/end-game cards | 8 / 6 / 4 |
| Income A | Tucked credit + energy + card trio | 11 / 8 / 5 |
| Income B | Larger tucked credit or energy count | 5 / 4 / 3 |
| Other A | Purple + orange + blue trace trio | 8 / 6 / 4 |
| Other B | Sector win paired with orbiter/lander | 8 / 6 / 4 |

Starting income does not count toward income-tile sets.

### Neutral milestones

At 20 and 30 VP, place one available neutral marker into the leftmost empty
discovery space. Neutral milestones resolve after player milestones and never
mark revealed species-board research spaces.

### Traces and discovery

- Purple traces usually come from sectors.
- Orange traces usually come from landing.
- Blue traces usually come from analysis.
- A universal trace may use any color.
- A player may mark any open matching species-board space or voluntarily take a
  matching species overflow for 3 VP.
- When all three discovery colors below a hidden board are filled, reveal that
  species after milestones and execute its setup.
- Only markers on the three discovery spaces receive discovery card rewards.
- Discovery, revealed-board, and overflow markers all count as traces for cards
  and scoring.

### Mascamites

- Shuffle seven samples. Place three on Jupiter, three on Saturn, and reveal the
  seventh as a blue species-board space.
- Discovery-space owners receive one alien card per marker.
- A collection card allows landing and taking one hidden sample from that body.
- Stack a player marker on it to create a movable capsule.
- Capsules use probe movement, publicity, and asteroid rules; count as probes for
  effects; ignore probe limits; and cannot orbit or land.
- Delivering a capsule to a matching mission destination is a free action that
  completes the mission, reveals the reward, and adds that token as a new blue
  species-board research space.

### Anomalies

- Place three random-sided anomaly tokens in the outer ring: Earth's sector,
  three sectors clockwise, and three sectors counter-clockwise.
- After every rotation, if Earth shares a sector with an anomaly, trigger it.
- The highest marked space in the matching species column receives its reward.
  The repeatable top space is always above earlier markers.
- Visiting an anomaly gives no publicity.

### 'Oumuamua

- Add the 'Oumuamua tile to the printed disc-3 position and fill its three data
  slots.
- It is a planet for visits, cards, orbit, and land. Every visit grants
  publicity.
- A matching signal may target either the normal sector or its tile.
- First and third tile signals score 1 and 2 VP.
- Completing the tile gives one exofossil to every contributor, determines no
  winner, retains no markers, and refills all three data.
- Exofossils pay printed research-space costs. Repeatable top spaces can be used
  any number of times.

### Centaurians

- Each player receives one card per discovery marker.
- Place a message milestone 15 VP ahead of every player's current score.
- Alien cards cost energy. Playing one creates another marker 15 VP ahead and
  stores the card in FIFO order.
- Reaching a message milestone resolves the oldest card's green effect and
  covers one available species-board reward.
- Printed data costs are paid from the data pool only.

### Exertians

- Deal three alien cards to every player plus one per discovery marker.
- A discovery marker grants one immediate opportunity to play a card face down.
- Place Exertian milestones 20 and 40 VP ahead of the current leader.
- Crossing a milestone may play one hidden Exertian card; the second costs one
  credit at that moment.
- Add danger from played cards and marked species spaces at final scoring.
- Every player tied for greatest danger loses one-tenth of total VP, rounded
  down, after all other points.

## 8. End of game

After everyone passes in round 5:

1. Score gold-box project cards.
2. Score marked gold tiles.
3. Resolve alien final scoring, including Exertian cards and danger loss.
4. Highest multiplayer score wins. Equal scores share the win.
5. In solo, the player must strictly outscore the rival.

## 9. Official solo rival

Solo uses ordinary two-player setup with one human and one rival (pp. 22-27).

- Difficulties 1-2 share a board; difficulties 3, 4, and 5 use their printed
  boards.
- The rival starts with four basic action cards; difficulty 3+ adds one random
  advanced card.
- Difficulty 1 uses no objective stack.
- The printed rival board defines objective composition, progress thresholds,
  progress rewards, and preferred-tech cycle. These are extracted by difficulty.
- Each rival turn reveals the top action card and executes its first legal
  instruction from top to bottom.
- Credits, energy, cards, and income become printed progress instead of stored
  resources. Data fills the rival computer, then its unlimited pool.
- Rival tech tiles are consumable resources for stronger actions, not persistent
  abilities.
- At end of rounds 1-4, spend 1 / 2 / 3 / 4 completed objectives. Every missing
  objective grants the rival 3 progress.
- At game end, every incomplete objective is worth 5 rival VP.

The solo controller is engine state, not a generic server CPU seat. Rival turns
use the same paced event stream as player turns so movement and scoring animate
on the TV.

## 10. Interaction design

### Shared TV

- Authentic main board fills the view over a subtle animated star field.
- The solar discs are real transparent assets layered and animated through their
  physical parent hierarchy.
- Probes, orbiters, landers, data, signals, wins, techs, and trace markers are
  visible pieces seated on their printed spaces.
- The HUD is restrained glass: round, active agency, score/publicity chips,
  rotation pointer, and a one-line event caption.
- Seat color is an outline, never a dot.
- Selecting a score chip expands public details; it does not permanently occupy
  board space.

### Player device

The default screen is a no-scroll 1024x768 mission-control table with a fixed
personal board and one-tap `PERSONAL / SOLAR SYSTEM` layers. Actions that require
a shared target switch to the solar layer automatically.

Physical action mappings:

| Intent | Gesture |
|---|---|
| Launch | Drag/tap a probe from supply, then Earth glows as the drop target. |
| Move | Touch a probe/capsule; legal adjacent cells glow. Touch or drag to a target. Multi-move paths animate cell by cell. |
| Orbit | Touch a probe at a planet, then touch/drop it into the printed orbit arc. |
| Land | Touch a probe at a planet, then touch/drop it on the planet or an available moon. |
| Scan | Touch the telescope action printed on the player board. Earth's legal sector glows; the three row cards remain visible and can be dragged into matching colored sectors. |
| Analyze | Drag data from the pool into open computer slots. When the top row is full, touch the computer core. |
| Play card | Drag a hand card into mission control or tap its face, then confirm the printed main effect. |
| Research | Touch a visible tech stack on the board. Legal stacks lift and glow after rotation preview. |
| Pass | Touch the round-card stack/rotation reminder, discard visually to four, then take one visible end-round card. |
| Buy | Drag a project-row card toward the hand; a 3-publicity cost ring appears. |
| Exchange | Touch two identical resource pieces, then touch the desired card/credit/energy icon. |
| Tuck income | Drag the chosen card under the income card. |
| Place trace | Drag the earned trace marker to a glowing matching research or overflow space. |

No interaction opens a long list of written destinations. Legal board/card
targets are projected from the engine and shown in place. Invalid targets never
accept a drop; unaffordable gestures are dimmed with a short inline reason.

Card inspection is separate from commitment. Every visible card and tile opens a
large authentic-art closeup. Escape, outside tap, and an explicit close control
all dismiss it.

### Motion

- Pieces lift 8-12 px on grab, cast a stronger shadow, and retain pointer
  capture.
- Legal targets pulse once, then hold a quiet halo.
- Movement follows curved cell-to-cell paths; orbit/landing moves arc from the
  solar board to the planetary board.
- Solar rotation uses a 900-1,200 ms eased mechanical turn with carried probes
  parented to the correct disc. Bumped probes settle after the disc.
- Invalid local drops spring back without sending an action.
- State reconciliation animates from the previous stable identity/position,
  never teleports pieces after server confirmation.
- `prefers-reduced-motion` collapses paths to short fades while preserving state
  clarity.

## 11. Art and data pipeline

`tools/tts-extract/extract-seti.mjs` must be idempotent and produce:

- `games/seti/golden/seti-data.json`
- `games/seti/golden/cards.json`
- `games/seti/golden/solo.json`
- `client/public/seti/scene.json`
- authentic board, disc, sector, player-board, alien-board, card-sheet, token,
  and model assets
- `client/public/seti/rulebook.pdf`
- `client/public/seti/player-aid.pdf`
- `client/public/seti/alien-species.pdf`

The extractor walks ordinary custom assets, contained objects, object states,
attached decals, and URLs embedded in Lua. The existing generic downloader misses
the latter two categories.

Card cells are addressed by TTS `CardID`, never by assumed deck order. Base card
117 uses its single-card replacement scan. Promo singles are catalogued outside
the base deck.

Golden assertions:

- 138 base project cards, plus two optional promo cards.
- Twelve four-tile tech stacks.
- Five alien boards and 55 alien cards.
- 24 solo objectives and 19 rival cards.
- 102 main-board snaps, exact player/alien snap counts, four sector capacities,
  and all render transforms.
- No missing referenced asset.
- Golden and `scene.json` hashes agree for shared ids and coordinates.

## 12. Engine data model

The canonical state includes:

- `game`, `schemaVersion`, seeded RNG counter.
- `round`, `phase`, `activeSeat`, `startingSeat`, passed seats.
- Four layer orientations, rotation pointer, sector-board permutation.
- Solar pieces with stable id, owner, kind, logical cell, and physical support
  layer.
- Planet orbiters/landers, first-bonus occupancy, and moon occupancy.
- Sector data counts, ordered signal markers, excess signals, and sector wins.
- Project deck/discard/row, round-end stacks, hands, income, missions, scoring
  cards.
- Tech stack order, top tile, first-take bonus, player techs, computer data.
- Species ids hidden until reveal, discovery/overflow/research markers, alien
  decks and per-species module state.
- Scores, publicity, credits, energy, data pool, traces, milestone claims.
- Pending decision queue and ordered public event log.
- Optional solo rival state.

Views redact project/alien hands, unrevealed Exertian cards and danger, hidden
species identities, hidden samples, unrevealed tech fronts, deck order, and solo
objective/deck order as required.

## 13. Verification and ship gates

### Engine

- Directed tests for every rule section and FAQ correction.
- Seeded complete games for 1, 2, 3, and 4 players.
- All five alien modules in directed and random playthroughs.
- Solo completion at difficulties 1-5.
- Card, tech, marker, figure, data, sample, exofossil, and objective
  conservation, allowing explicitly unlimited supplies.
- JSON round-trip and deterministic replay.
- Redaction tests for every hidden component.
- Solar support/bump table compared against alpha masks and Lua behavior.

### Runtime

- WebSocket smoke plays a complete game through the live server.
- UI smoke opens one 1024x768 page per seat and finishes a complete game using
  only actual DOM gestures/buttons/cards, never raw actions.
- Solo UI smoke completes one rival game.
- Rulebook UI-coverage audit maps every player choice and public fact to a real
  board/device affordance and checks every action field is reachable.
- TV and device screenshots cover setup, movement, rotation/bump, orbit, land,
  scan completion, analysis, research, both species reveals, milestones, round
  income, and final scoring.
- Device has zero horizontal/vertical page scroll at 1024x768.
- Card closeup is at least 370x540 and all touch targets are at least 40 px.
- Client build, client typecheck, root tests, and `git diff --check` pass.

### FAQ corrections locked into tests

- Cards 58, 60, and 112 include the named planet's moons.
- Card 134 marks one signal. The old FAQ sentence saying two contradicts the
  card image and later official correction.
- Card-granted Scan waives base cost but not optional tech costs.
- One event covers at most one triggerable-mission reward.
- Separate effects inside one action may each trigger a reward; one emitted
  effect still covers at most one triggerable-mission space globally.
- A played card's entire main effect resolves before its mission becomes active
  or may complete. Card 89 therefore draws three cards before its empty-hand
  condition can be completed; the same timing applies to card 51 and every
  other mission card.
- Alien cards may be discarded as hand signals; Exertian cards may not.
- Overflow may be chosen while a normal species-board space remains open.
