# Everdell — base game spec

Source of truth: TTS mod **1929354615** "Everdell [reworked] (All Expansions)"
(`C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods/Workshop/1929354615.json`)
plus the mod's bundled official rulebook **"The Gilded Book"** (88pp, `Rules` PDF,
GUID `4d1d0a`) and **"The Archive"** appendix (40pp, `Appendix` PDF, GUID `d12c28`).
Scope: **base game only** (owner directive Jul 17 2026). The mod bundles every
expansion; all expansion content is excluded (`setup.EXP* = 0` paths in the Lua).

Lua refs are into `tmp/everdell-global.lua` (dumped from the mod JSON, 119k chars).
Rulebook refs are print page numbers (= PDF page index +0; the PDF's page N shows
printed page N).

## Components (base)

- **Resources**: twig, resin, pebble, berry (unlimited supply — Gilded Book p13
  "There is no limit to the amount of resources"; physical counts 30/30/25/30 are
  NOT a cap: "If any of the resources run out, use something else as a substitute").
- **Point tokens**: 1s and 3s, unlimited (treated as a count).
- **Occupied tokens**: mark a Construction whose free-Critter link has been used
  (Gilded Book p33).
- **Workers** per player: 6 max — 2 at start (winter), +1 spring, +1 summer,
  +2 autumn (Lua `meeple_GUID` start1/start2/spring/summer/autumn1/autumn2 98-158;
  NextSeason 672-767; Gilded Book p38).
- **Main deck**: 128 cards = mod deck `4d3c01` (120) + `da6ee5` "Base Farms" (8)
  merged at setup (Lua 1928-1934). 48 unique cards.
- **Forest cards**: 11 (deck `751d69`), deal 3 in a 2p game, 4 with 3+ players
  (Lua setupForest 1017-1048).
- **Special events**: 16 = deck `60cfda` "Base Event Cards" (15) + single card
  `6c0a05` "Everdell Games" (Lua 1563-1612). Deal 4 random (Lua 1637-1652,
  eventpositions 1-4).
- **Basic events**: 4 tiles — Harvest Festival (4+ Production), Tour (3+
  Destination), City Monument (3+ Governance), Expedition (3+ Traveler)
  (`baseitems_GUID` 389-394; requirements printed on board art, verified from
  board texture crops).
- **Board**: Custom_Token `24b026` (base board art, 3717kb, transparency outside
  the shape). Per-player boards exist in the mod (e.g. `dc69f7`
  WhitePlayerBoard) as city mats — 15 slots + resource area.

## Setup (Lua StartSetup 1691-2250, Gilded Book p13-14)

1. Player count 2-4 for our port (mod supports 1-6; 5-6 requires Bellfaire).
   Seats in Lua PlayerColors order: White, Brown, Teal, Orange.
2. Shuffle main deck (base + farms; Lua 1928-1934, 2045).
3. Meadow: 8 face-up cards refilled from deck (refillMeadow 509-621, zones
   baseposition1-8).
4. Forest locations: shuffle 11, deal 3 (2p) / 4 (3-4p), Lua 1038-1047.
5. Special events: shuffle 16, deal 4 (Lua setupSpecialEvents).
6. Basic events: all 4 out.
7. Starting player chosen (random or picked; Lua 922-932). Deal hands clockwise
   from starting player: 5/6/7/8 cards by seat order (2p: 5,6; 3p: 5,6,7;
   4p: 5,6,7,8) — Lua 2173-2185.
8. Each player: 2 workers, 0 resources, season = winter.

## Turn structure (Gilded Book p28)

Play proceeds clockwise. On your turn take exactly ONE action:
**Place a Worker** | **Play a Card** | **Prepare for Season**.
(Players season-shift independently; no shared round structure.)

### Place a Worker (p28-31)

- Deploy 1 available worker onto an unoccupied-for-you valid location.
- **You may not place a worker only to block a location; you must be able to
  perform some or all of the actions there** (p28). (Engine: require the
  placement to have at least one performable effect — e.g. Inn requires room in
  city + a playable meadow card; Haven requires ≥2 cards in hand? No — Haven
  says "may discard any"; a 0-gain visit performs nothing, so require ≥1 card
  discarded? Rule intent: must be able to perform SOME action. We enforce:
  each location's `canVisit` predicate.)
- **Exclusive** locations: 1 worker total. **Shared**: any number, even same
  player (p28). Most board basic locations are exclusive; the "2 cards +1 pt"
  basic location and Haven are shared (board art: open ring), Journey 2-pt is
  shared.
- Worker stays until owner Prepares for Season; effect resolves only when
  placed (p28).
- **Basic locations** (board art, top path; exact list verified from the board
  texture — see golden `locations.json`):
  L1 `3 twig + 1 card` (exclusive), L2 `2 twig + 1 card` (exclusive),
  L3 `2 resin` (exclusive), L4 `1 resin + 1 card` (exclusive),
  L5 `2 cards + 1 point` (SHARED), L6 `1 berry` (SHARED per official base board
  — verified from art: open ring), L7 `1 berry + 1 card` (exclusive),
  L8 `1 pebble` (exclusive).
- **Forest locations**: dealt cards; exclusive; in 2-3p games only 1 worker per
  forest card ("room for only 1 worker"); with 4+ players the cards marked with
  the 4+ symbol allow 2 workers (two paw circles, the second with a "4+" broach
  — Gilded Book p29). Regardless of player count **you may never place 2 of
  your own workers on a single Forest card** (p29).
- **Haven** (board, shared): discard any number of cards from hand, gain 1 any
  resource per 2 discarded, round down (p29).
- **Journey** (board, autumn only): discard cards from hand equal to listed
  points: 5/4/3 exclusive, 2 shared. Worker is worth those points at game end
  and is PERMANENT (never returns) (p29).
- **Destination cards** (red, in cities): place on any available location on
  your own city's Destination cards; on an OPPONENT's card only if it shows
  OPEN — then that opponent gains point tokens as printed (1) (p30).
- **Events** (basic or special, on the shared board): place a worker ONLY IF
  you can immediately achieve it: your city meets all requirements and you pay
  any listed cost at placement. Only one player may achieve each event. The
  event card/tile moves to your city with the worker on it; worker returns as
  normal next Prepare for Season. Keeping it does not depend on later keeping
  the required cards (p31). Events with abilities resolve when achieved;
  point values score at end.

### Play a Card (p32-36)

- Play 1 card from **the Meadow or your hand**, paying its resource cost to
  supply. If played from Meadow, refill Meadow to 8 immediately after the first
  3 steps (p35 steps 1-3, "replenish the Meadow").
- **City limit 15 spaces**; each Critter/Construction takes 1. Event
  cards/achievements do NOT count (p34). Multiple copies of any COMMON card
  allowed; only one copy of each UNIQUE card per city (p33).
- **Free Critter via Construction**: each Construction lists a linked Critter;
  if that Construction is in your city and unoccupied, you may play the linked
  Critter for free, placing an occupied token on the Construction (one free
  critter per construction, permanent even if either card later leaves) (p33).
- **Card-playing abilities** (cost modifiers: Judge swap, Innkeeper -3 for
  Critter, Crane -3 for Construction, Inn worker effect, Dungeon prisoner -3,
  forest "play for -1" etc.): **you may never use more than one card-playing
  ability to play a card** (p35 step 1). Occupied-token free play is also
  in this category ("any effect that influences the cost").
- Sequence when playing a card (p35): 1 choose ability, 2 pay, 3 replenish
  meadow if needed, 4 place into city (city-removal effects apply before
  placement), 5 resolve the new card's effect (green immediate; red/blue/purple
  just place), 6 resolve triggered effects of other city cards (Shopkeeper,
  Courthouse, Historian...) in active player's chosen order. A card's own
  bonus does not trigger for itself (p34 Governance note).
- **Card types** (p34):
  - Tan **Traveler**: activates once when played.
  - Green **Production**: activates when played AND during Prepare for Season
    into spring and autumn.
  - Red **Destination**: activates when a worker visits. OPEN = visitable by
    opponents.
  - Blue **Governance**: discounts/bonuses after playing certain cards; not
    for itself.
  - Purple **Prosperity**: base points + bonus points at end.
- Resources/points placed ON a card stay with that card; if the card is
  discarded they are lost (p34). Point tokens on cards count at scoring.

### Drawing/discarding (p37)

- **Hand limit 8, strict** (2-4p). Drawing past limit: only up to limit.
- Give-cards-to-opponent effects: must pick an opponent with room if possible;
  give as many as possible, discard the rest.
- Meadow card played → replace immediately. Ability draws from Meadow: draw all
  first, then replenish.
- Deck empty → shuffle discard into new deck (Lua refillMeadow does the same
  548-559). Discards are face-down; "discard" = from hand unless specified.

### Prepare for Season (p38)

When it's your turn (any time — typically when out of workers/options):
1. Bring back ALL deployed workers (except permanent: Journey, Monastery,
   Cemetery ... those stay).
2. Advance your season; gain the new season's workers and bonus:
   - **→ Spring**: +1 worker; activate ALL green Production in your city, any
     order.
   - **→ Summer**: +1 worker; draw up to 2 cards from the MEADOW (then
     replenish; hand limit applies).
   - **→ Autumn**: +2 workers; activate ALL green Production.
3. Your turn ends. Players season-shift at their own pace (p38 "do not have to
   perform the Prepare for Season action at the same time").

Autumn is the last season: a player in autumn who has placed all workers and
cannot/will not act must **pass** permanently (p40). Passed players cannot be
given cards/resources (discard instead), but their workers stay and their OPEN
destinations still grant them point tokens.
Game ends when all players have passed.

### Scoring (p40)

Sum: base card values (Fool is -2) + point tokens (incl. tokens on cards) +
purple Prosperity bonuses + Journey points + Event points (base values printed
+ any event-specific bonuses). Tie-break 1: most events achieved (basic+special).
Tie-break 2: most leftover resources.

## Engine notes

- Full enforcement (Brass model): affordability, uniqueness, city limit,
  legal worker spots, event requirements, hand limit, phase legality.
- Pending-decision queue for branching effects (choose resources, choose cards
  to discard/give, Miner Mole / Chip Sweep copy target, Fool target, Ruins
  demolish target, Bard/Post Office discard counts, etc.).
- Seeded RNG stream (`seed ^ rolls` hash) for shuffles.
- Season is per-player state: `winter | spring | summer | autumn | passed`.
- Workers: track `total`, `deployed[]` list with location refs; permanent
  workers (Journey, Cemetery, Monastery) flagged.
- Occupied tokens: per Construction instance boolean.
- Card instances carry `storedResources` / `storedPoints` (Storehouse, Chapel,
  Clock Tower...).
- The deck/discard/meadow/hands/cities conservation invariant = 128 always.

## Card database

`shared/src/everdell/cards.json` (mirrored in `games/everdell/golden/`).
48 unique base cards (14 common critters? — verified counts below), 11 forest,
16 special events, 4 basic events. Identified from the mod's card sheets by
(CustomDeck id, cell): sheet 109 = 5x6 grid 30 cells, sheet 127 = 4x7 grid 28
cells, farms sheet 365(=427) 1x1, Ranger 364(=418) 1x1, Husband? 366 1x1 (x3
copies + cell 43000 dup), forest sheet 150 2x6, events sheet 149 6x3.
Transcribed from the reworked sheet art (full rules text printed on cards),
cross-checked against The Archive appendix glossary (critters a04-a08,
constructions a09-a12, basic events a14, special events a15-a17, forest a21-a22)
and the official distribution list (Gilded Book p34 "Quantity in deck" corner
icons).

Verified totals: 128 cards; per-card copy counts from the mod deck tally
(`4d3c01` + `da6ee5`), which must equal the printed "quantity in deck" values.

See `cards.json` for the full data (name, type, rarity, cost, points, color,
free-critter link, effect id, copies, sheet/cell for art).

## Screens

- **TV**: the main board (mod art `24b026`) — basic locations, forest cards,
  events row, Journey/Haven, meadow 8 cards, deck/discard, per-player city
  summaries via chips (name + points-visible-things), turn banner, ig-* HUD.
  Orbit camera.
- **Device**: full personal tableau — city grid (15 slots), hand fan, resources,
  workers by season, season indicator, actions (place worker via board targets,
  play card with payment/ability picker, prepare for season, End Turn), Show
  deck, card close-ups, greyed-out illegal/unaffordable options with reasons.

## Ship gate 1: rulebook UI-coverage audit (Jul 17 2026)

Every player decision, optional cost, amount choice, and piece of public
information was walked against the built screens; the reverse pass checked the
engine action union for fields the UI never sends.

Covered (decision → where it lives):
- One action per turn → device rail (PLACE WORKER / card close-up play /
  PREPARE / PASS), explicit END TURN in the header (turnDone gate).
- Worker placement, all location kinds → visual board sheet (real art,
  glowing legal spots, per-spot disabled reasons); destinations render as
  card art incl. open opponents'; events as tiles/cards with requirements.
- Haven discard set + gains; Journey discard picks; forest choice effects;
  Lookout/forest copy → visual board picker; Inn/Queen/Cemetery/Pigeon plays
  → card pick sheets with per-card reasons; Post Office give+redraw;
  University target + gain-any; Monastery give+opponent; Chapel automatic
  (no choice per rules).
- Card play cost abilities → close-up options: pay, occupied-token free
  critter (per construction + Ever Tree), Innkeeper, Crane, Judge (from/to
  pickers), Dungeon (prisoner picker); Crane/Dungeon discount allocation is
  player-editable steppers (engine accepts arbitrary allocation).
- Shepherd pay-to-opponent picker; Fool target picker.
- Production choices (Storehouse set, Woodcarver/Doctor amounts, Peddler
  trade, Monk gift, Chip Sweep / Miner Mole targets, Teacher keep/give,
  Harvester any) → typed prompts; Clock Tower pre-recall prompt; summer
  meadow draws (skippable, "up to 2").
- Special-event onAchieve choices (fireworks/performer/new-management
  amounts, acorn/graduation/scrolls card sets, marketing donations, croak
  city discards, well-run worker recall) → typed prompts.
- Public info: TV chips + city modal; device rail OPPONENTS summaries
  (season, workers, hand count, resources, points) with a tap-through city
  browser; deck/discard counts on both screens; events state on both.

Deliberate simplifications (recorded, rules-safe):
- Post-play triggers (Shopkeeper/Courthouse/Historian) resolve in fixed city
  order instead of active-player-chosen order (no known base-game
  interaction where the order matters materially).
- Gatherer/Harvester auto-pair into a shared space when a partner is
  unpaired (sharing is strictly beneficial in the base game).
- Give-cards effects let the giver pick any opponent; overflow beyond the
  receiver's hand limit discards (rulebook prefers an opponent with room).
- Production during Prepare resolves mandatory gains immediately and queues
  choice cards as prompts, rather than full any-order sequencing.
- Chip Sweep may not activate a Chip Sweep (self-loop guard); Miner Mole may
  not copy Storehouse (Archive p6) or Miner Mole.

## Ship gate 2: UI-driven full game

`tools/verify/everdell-ui-smoke.mjs` — 4 puppeteer pages, one per seat, play
a complete game by clicking the real device DOM (close-ups, visual placement
board, pending prompts, END TURN). `tools/verify/ev-room.mjs` spins a room;
`ev-place-shot.mjs` screenshots the placement sheet.

## Open items / decisions

- Fool plays into an OPPONENT's city (takes a slot there, -2 to them).
  Engine: choosing the opponent is part of the play action; Fool ignores
  triggered effects for that opponent (p35 sidebar).
- Ruins: discard a Construction from your city first (occupied token rules
  p33 note), gain its cost back, then draw 1(? see appendix) — encode from
  appendix entry.
- Events UI: 4 basic + 4 special tiles on TV; claim action from device.
- Bot: greedy — prefer playing affordable cards, then worker spots by value,
  then season; must pass eventually (goal: end the game).
