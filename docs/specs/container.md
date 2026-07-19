# Container (2026) — port spec

Source of truth: TTS mod **3745603443** "Container (2026) [Scripted]" — object
layout + per-object Lua (setup buttons, score calculators) — and the mod's own
rulebook PDF (20 pages, staged to `client/public/container/rulebook.pdf`).
Rulebook page refs below are to that PDF. The mod has no Global Lua; the three
BlockSquare buttons (`da3538` Standard / `84aa5d` Short / `5bc067` Extended)
hold setup, and five score tokens (`5fc2dc` etc.) hold the exact final-scoring
algorithm. Game id: `container`. 3–5 players.

**Scope**: base game (2026 edition rules, with Off-Shore Bank). The mod also
carries expansion components — gold containers, player trucks, board-expansion
strips, truck-company bid tile/token, second PDF ("More Containers") — all
**excluded** for now, matching the base-game-first pattern used for Dune.

## 1. Components (rulebook p1–2)

- 5 seats: Brown `#713B17`, Pink `#F570CE`, Teal `#21B19B`, Purple `#A020F0`,
  Orange `#F4641D` (hand-trigger colours in the mod).
- Per seat: player board (factory district bottom / harbor district top), ship
  (5 container slots), player aid, secret final scoring card, hand of cash.
- 5 container colors: Blue, White, Yellow, Red, Green. 20 each (100 total).
- 20 factories (4 per color), 20 warehouses (mod table has only 19 — rulebook
  count 20 wins), 10 loan cards, 10 bluff cards, 2 bank bid tiles (cash tile /
  container tile), 2 bank auction tokens, 10 reserve tokens.
- Board: one water mat (`49790f`, art `container/mat.webp`) with **both islands
  printed on it** — Container Island (left, 5 seat-coloured hex scoring areas)
  and Off-Shore Bank (right: 3 container lots top, 3 cash slots bottom, 5
  seat-coloured holding hexes centre). The mat is the whole TV table surface.

### Supply by player count (rulebook p2 table; mod deletions verified to match)

| players | auction tokens | warehouses | factories/color | containers/color S/Std/E |
|---|---|---|---|---|
| 3 | 1 | 12 | 2 | 9 / 11 / 12 |
| 4 | 1 | 16 | 3 | 11 / 14 / 16 |
| 5 | 2 | 20 | 4 | 13 / 17 / 20 |

Game length (Short/Standard/Extended) is a room create-option; default Standard.
Warehouse/factory supply counts include pieces on player boards.

## 2. Setup (p2–3)

1. Bank containers: take 1 of each color; randomly place 2 (distinct colors) on
   container lot I, 1 on lot II; return the other 2. (Mod: `spawnRandomContainers`
   → 2 at lot I, 1 at lot II.)
2. Bank cash: $1 in slot I, $2 in slot II, $3 in slot III.
3. Each player: 1 warehouse on the FREE warehouse space; 1 random factory
   (deal 1 of each of 5 colors round; leftovers to supply) on FREE factory
   space; 1 container of the factory's color in the **$2 factory lot**; $20
   cash; 2 bluff cards (see §7 digital note); scoring card dealt secret.
4. Ships start in the ocean. First player random.

## 3. Player board tracks (board art, verified from `pboard` art)

- Factory district (bottom): 4 factory slots. Build track: FREE, $6, $9, $12.
  Storage limit = 2 × factories (2/4/6/8). Lots priced **$1 $2 $3 $4**.
  Factories must be different colors.
- Harbor district (top): 5 warehouse slots. Build track: FREE, $4, $5, $6, $7.
  Storage limit = 1 × warehouses (1–5). Lots priced **$2 $3 $4 $5 $6**.
- A lot may hold any number of containers; only the district total is capped.
- Reserve tokens on a district count against its storage limit (p13).

## 4. Turn structure (p6)

1. **Pay loan interest**: $1 per outstanding loan to the Bank's cash lots
   (round-robin I→II→III, skipping token-occupied lots; p14). Must pay before
   anything else; if unable, must take another loan to pay; if already at 2
   loans → **default** (§6).
2. **Win Bank auction**: if you hold the highest bid in an active Bank auction,
   you win it now (p14): distribute your bid round-robin among the matching
   Bank lots (cash bid → cash slots, container bid → container lots; skip
   token'd lots; you pick which color goes in which lot); collect winnings
   (cash → hand; containers → your **holding area** hex on the Bank board);
   return token, tile, reserve tokens. Interest is paid before collecting, so
   auction winnings can't pay this turn's interest (p15).
3. **Take 2 actions** — same action twice allowed, except PRODUCE and CALL BANK
   are once per turn (p7 icon).

### Actions

- **BUILD** (p8): build a factory (pay next track cost **to the supply**; any
  color in supply you don't already have) or a warehouse (next track cost).
- **PRODUCE** (p8–9, once/turn): pay $1 union wage to the player on your
  **right**; take 1 container of the matching color per factory from the
  supply (must produce as many as possible up to the factory storage limit;
  if the supply or limit binds, you pick which); arrange new + may reprice all
  factory-district containers. Can't produce if you can't pay the $1.
- **FACTORY PURCHASE** (p9): buy any number of containers from **one**
  opponent's factory lots, paying that opponent the lot price per container;
  containers move immediately to your harbor lots (any arrangement, may
  reprice whole harbor); can't exceed harbor storage limit; no discarding to
  make room.
- **HARBOR PURCHASE** (p10): ship must be docked at an opponent's harbor. Buy
  any number of containers from that harbor at lot prices, paid to the owner;
  load onto your ship (max 5 on ship, no discarding). Also available as a
  **free anchor action** when you dock there.
- **SAIL** (p11): ocean ↔ (island | opponent harbor). Moving board→board is 2
  sail actions via the ocean. Anchor free actions on arrival: opponent harbor →
  free Harbor Purchase; Off-Shore Bank → load any containers from your holding
  area onto your ship (free); Container Island → **mandatory delivery auction,
  then your turn ends immediately** (even with actions left; no further free
  actions, incl. loan repay).
- **REPRICE** (p10): pick one of your districts; rearrange any containers there.
- **CALL BANK** (p12–14, once/turn): start an auction (if a token is available:
  place token on a chosen lot, take the matching bid tile, place opening bid)
  or outbid the current high bid on an active lot. Cash bids (for container
  lots): must exceed prior bid by ≥$1; cash on the tile is locked (can't be
  spent, even for interest). Container bids (for cash lots): any containers
  from your districts onto the tile, place reserve tokens where they came
  from; only the count matters; must exceed prior count by ≥1. Outbid players
  take their bid back (containers return to their districts, repriced freely;
  reserves returned). Each new bid restarts the clock: the tile holder wins at
  the start of their own next turn. Auction limits: 3–4p max 1 active auction;
  5p 1 cash + 1 container simultaneously. Can't CALL BANK the same turn you
  won a Bank auction, or the turn game end is triggered.

### Delivery auction (p15–16)

On docking at Container Island with ≥1 container on ship: each **opponent**
secretly bids any amount of cash from hand (bluff $0s allowed → digital: just
a secret amount, 0 allowed). Reveal; highest wins; ties → runoff (tied players
add more, totals compare; still tied → deliverer picks the winner). Then the
deliverer either:
- **Accepts**: winner pays the bid to deliverer; deliverer also takes an equal
  government subsidy from the supply (earns 2× bid); all ship containers go to
  the winner's island **scoring area**; or
- **Buys out**: deliverer pays the winning-bid amount to the Bank cash lots
  (round-robin), keeps containers in own scoring area; the high bidder keeps
  their money. (If all bids are 0, accept/buyout are both trivially available;
  accepting a $0 bid gives the containers away for a $0 subsidy.)
Turn ends immediately after the auction.

### Loans (p16–17)

Free action, any time incl. other players' turns and during delivery auctions:
gain $10 from supply + 1 loan card; max 2 outstanding. Repay: own turn only,
after interest, not after collecting delivery cash this turn: pay $10 to
supply. Interest $1/loan/turn to bank cash lots. **Default** (can't pay
interest at 2 loans): bank seizes 1 container per unpaid-interest loan from the
first non-empty of: island scoring area → ship → bank holding area → harbor
district → factory district; the player to the defaulter's right picks among
equals and places seized containers in the Bank container lots; interest
forgiven only if nothing seizable. Loans stay; interest owed again next turn.

## 5. Game end + final scoring (p18; mod score-token Lua cross-checked)

**End trigger**: the supply runs out of **any 2 colors** of containers →
active player finishes the turn, game ends. No CALL BANK on that turn. Active
bank auctions resolve immediately to their current high bidders (containers won
go to holding areas).

Scoring per player:
1. **Discard most common color** in your island scoring area (all of them, $0).
   Tie: you choose which tied color to discard — **unless your two-value color
   is among the tied colors: then you must discard the two-value color** (p18).
   (The mod's Lua instead auto-picks the excluded color minimising loss and
   ignores the forced two-value rule; rulebook wins. Engine may still auto-pick
   the best legal choice for the player when the choice is free.)
2. **Score island** by your secret scoring card. Card values (mod Lua
   `specialConfigs`, GUIDs from deck 6 cells 607–611):
   - White card (`608`): two-value White; Yellow $10, Green $6, Red $4, Blue $2
   - Green (`609`): two-value Green; White $10, Red $6, Blue $4, Yellow $2
   - Yellow (`611`): two-value Yellow; Blue $10, White $6, Green $4, Red $2
   - Red (`610`): two-value Red; Green $10, Blue $6, Yellow $4, White $2
   - Blue (`607`): two-value Blue; Red $10, Yellow $6, White $4, Green $2
   Two-value color: $10 each if your scoring area collected ≥1 of **all 5**
   colors (counting the discarded color), else $5 each.
3. **Leftovers**: $3 per container on your ship and in your bank holding area;
   $2 per container in your harbor district; $0 in factory district. (Matches
   Lua: warehouse zone=2, small/holding=3, boat=3.)
4. **Loans**: −$11 each outstanding.
5. Most total cash wins; tie → most containers in factory district; else shared.

## 6. World layout (mod transforms; render at [x, y, −z])

- Water mat `49790f`: pos (−1.18, −1.23), scale 45, art 4203×3681 jpg. The art
  is fit to world by the affine derived in `extract-container.mjs` from known
  anchors (bank lot card/container positions + player-board positions). The mat
  IS the table: render it full-bleed under everything (owner directive: "water
  mat underneath").
- Player boards (`Custom_Token`, scale 3): Brown (0, −21.42) rot 180 ·
  Pink (−30.5, −12) rot 270 · Orange (−30.5, +12) rot 270 · Teal (30.5, −12)
  rot 90 · Purple (30.5, +12) rot 90. Per-seat art (5 company skins).
- Island scoring hexes (zones): Brown `7fa253` (−7.17, −5.30) · Pink `c84b75`
  (−11.84, −2.51) · Teal `ceceb7` (−7.13, 5.65) · Purple `635699` (−7.13, 0.20)
  · Orange `a3e4bc` (−11.86, 2.90).
- Bank holding hexes: Brown `158b08` (12.69, −2.95) · Pink `c037b5`
  (9.85, −1.33) · Teal `2472b7` (12.75, 3.51) · Purple `7097f3` (12.71, 0.27) ·
  Orange `6462a5` (9.87, 1.90).
- Bank container lots (z≈7.4): I x≈5.9, II x≈9.7 (setup spawns confirm); III
  from art. Bank cash slots (z≈−9.7): I x=6.12, II x=9.70, III x=13.32 (setup
  $1/$2/$3 card positions).
- Ships (OBJ `ADFDA52…`, diffuse `BDDECF0…`, tinted per seat ColorDiffuse):
  start ocean spots (−4.22, −14.73), (−23.99, −7.93), (−23.99, 7.80),
  (23.81, −7.80), (24.00, 8.04).
- Containers: OBJ `DC559B7…`, per-color diffuse (Blue `AB569CB`, White
  `CEA2174`, Yellow `0DACAF0`, Red `3738EDE`, Green `C990F0B`), scale
  (0.225, 0.36, 0.081).
- Factories: flat `Custom_Token` per color; warehouses `Custom_Token`
  `715DB0E…`; auction token `AB4DBE9`; reserve token `7A98FCC`; score disc
  `C0B7CD7`.
- Cards (deck 6, 6×2 sheet `…0B4D0CF`): 600 bluff, 601 $1, 602 $2, 603 $5,
  604 $10, 605 $20, 606 loan, 607–611 scoring cards. Player aid deck 3 (1×1).
  Bid tiles: deck 8 (`a0ca5e`) and deck 10 (`9879a7`) singles.

## 7. Digital adaptations

- Cash is a scalar per player (cards are supply bookkeeping only); bank cash
  lots are scalar amounts per lot; bank container lots are color lists.
- Bluff cards exist to disguise bid card-counts at a physical table; digital
  secret bids need no disguise. Bids are secret amounts (0 allowed). The bluff
  cards are shown in GameIntro as a component note only.
- "Make change with the supply" is a no-op.
- Reserve tokens are represented literally: container bids record their source
  district and count against that district's storage limit until resolved.
- Repricing/arranging = assigning each container in a district to a priced lot.
- Delivery auction, runoff, accept/buyout, and the color choices in default
  seizure and bank-lot distribution are **pending decisions** (queue pattern):
  engine pushes typed decisions; only the head's owner may resolve.
- Free-action loans "during other players' turns" are honored during delivery
  auctions (a bidder may take a loan while deciding a bid — modeled as a flag
  on the bid decision). Outside auctions, loans are taken on your own turn;
  nothing else in the digital flow needs a mid-opponent-turn loan.

## 8. Engine sketch

State: seats[] {cash, loans, factories[colors], warehouses, factoryLots
{price→colors[]}, harborLots, ship {loc, cargo[]}, holding[], scoring[],
scoringCard, reserves {factory, harbor}}, supply {containers per color,
factoriesPerColor, warehouses}, bank {cashLots[3], containerLots[3][],
auctions: {kind, lot, bidder, bid, tokenLot}[], tokensAvail}, turn {seat,
actionsLeft, producedThisTurn, calledBankThisTurn, wonAuctionThisTurn,
endTriggered}, pending queue, lastEvent, rngSeed/rolls, phase.

Actions: `build_factory{color}`, `build_warehouse`, `produce{keep?}`,
`factory_buy{seat, picks[{price,color,count}]}` + `place{lots}` merged,
`harbor_buy{picks}`, `sail{to}`, `reprice{district, lots}`,
`call_bank{start|outbid, lot, cash?|containers?}`, `take_loan`, `repay_loan`,
`end_turn`, `choose{...}` for pending (delivery bids, runoff, accept/buyout,
tie discard, default seizure colors, bank lot color distribution, produce
overflow picks, auction-win lot distribution).

Invariants (tests): every container is in exactly one of supply / factory lot /
harbor lot / ship / holding / scoring / bank lot / bid tile; per-color total
constant; cash ≥ 0 everywhere; storage limits (incl. reserves) never exceeded;
ship ≤ 5.

## 8b. Rulebook UI-coverage audit (ship gate 1, done Jul 18 2026)

Every player decision, optional cost, amount choice, and piece of public
information mapped to a control or display:

- Build factory color → color picker (auto when only one legal color); build
  costs printed on the rail buttons; both builds grey out with reasons.
- Produce: which containers when supply/limit binds → picker; arrangement +
  free repricing of the whole factory district → arrange dialog (existing
  containers are movable); the $1 wage and its recipient named in the dialog
  title.
- Factory purchase: opponent choice → list with for-sale counts; per-lot
  per-color counts → stepper picker with cost + room caps; harbor arrangement
  → arrange dialog.
- Harbor purchase: stepper picker; the free anchor variant applies
  automatically when docked this action (labelled FREE).
- Sail: destination list; island disabled with an empty ship; bank arrival
  offers the optional holding-load picker (any subset, including none).
- Reprice: both districts have explicit buttons (gap found in audit: harbor
  repricing was unreachable — fixed).
- Call Bank: the device board turns into a 3D close-up of the Off-Shore Bank
  (lots, cash, tokens, holding hexes as printed on the mat). Tapping a lot
  hotspot drops the auction token onto it in 3D, then the bid entry opens:
  cash bids via amount dialog (lock warning shown); container bids picked from
  both districts with source labels. Lots under auction offer OUTBID instead
  (disabled when you lead or when cash can't cover the minimum, with reasons);
  the once-per-turn/won-auction/end-turn rules gate the rail button. While you
  hold the high bid, the bid tile with your bid physically on it (money cards /
  containers) sits bottom-right of the device and next to your board on the TV.
- Loans: take (own turn or during a delivery auction — audit fix disabled it
  elsewhere) and repay, both with reasons; also offered inline while bidding.
- Delivery: secret amount dialog ($0 allowed = the bluff cards); runoff add;
  deliverer sees revealed bids and picks accept (tie → explicit winner
  buttons) or buyout (disabled without cash).
- Pending: bank-lot color distribution (forced round-robin counts shown) and
  default seizure (location order simulated so only legal colors are offered).
- Public info: bank lots/auctions/current bids, supply per color (end
  trigger), every opponent's priced lots + ship/loans/island/holding on the
  device; the TV carries the physical table, seat chips (cash hidden — it is
  secret in Container), narration banner, delivery status, and the final
  scoring breakdown.
- Engine action fields the UI sends: all of them (produce.make/lots,
  factory_buy.from/picks/lots, harbor_buy.free, sail.load, call_bank
  cash/containers/lot/lotType, delivery_resolve.winner, choose_* payloads).

## 9. Known mod↔rulebook discrepancies (rulebook wins)

- Mod table has 19 warehouses (rulebook: 20).
- Mod score Lua ignores the forced discard of a tied two-value color.
- Mod score Lua counts every card in the seat zone for cash — physical
  approximation of "cash in hand".
