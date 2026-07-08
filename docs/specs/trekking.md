# Trekking the National Parks — Rules Spec for a Pure-Reducer Engine

Target: TypeScript engine shaped `State → Action union → pure applyAction → per-viewer view redactor` (Catan-style).
Sources, in priority order: (1) TTS mod global Lua (scoring/win/tie/river logic), (2) official rulebook PDF from the mod (Underdog Games 2nd-edition printing of the 2016 game — identical core rules), (3) mod save JSON (exact component counts). Where the Lua and the rulebook agree they are treated as ground truth. Conflicts are flagged inline.

> Naming note: the physical game calls the mover a **Trekker**, the tents **Campsites**, and the movement/currency cards **Trek cards**. The TTS mod code calls the same things **Hiker**, **Campsite/tent**, and the letter/number cards. This spec uses the rulebook terms. The prompt's "letter cards" = Trek cards; each is an (icon-suit, number) pair, not a letter.

---

## 1. Players & per-player components

- **Player count: 2–5.** (5 Trekkers, 5 player-aid cards, 5 sets of 3 Campsites in the box.)
- **2-player special rule:** use **only** the Most-Stones Bonus cards; the 2nd-Most-Stones Bonus cards are not used.
- **Per player at start:**
  - **1 Trekker** (pawn) in the player's color, placed on **START**.
  - **3 Campsites** (tents) in the player's color, kept in front of the player (used to occupy Major Parks; each Campsite marks one occupied Major Park).
  - **Starting hand: 2 Trek cards**, dealt from the shuffled Trek deck, kept secret.
- **Hand size limit: 12 Trek cards.** Enforced only at end of a player's turn: if `hand.length > 12`, the player discards down to 12 (discards go to the Trek discard pile).
- Colors in the mod: Green, Yellow, Orange, Red, White, Blue (pick any N for N players). Player color is cosmetic and independent of stone colors and trek-suit colors.

---

## 2. Components

### 2.1 Trek cards — 96 total (the movement/claim currency)
- **6 icon suits × 4 number values (1,2,3,4) × 4 copies = 96.** Confirmed exactly in mod JSON (24 distinct faces, 4 each).
- Each card carries BOTH: one **icon** (its suit) AND one **number** (1–4). On use, a card is spent for **either** its number (to move) **or** its icon (to claim a Park / occupy a Major Park) — never both, and one card is always worth exactly **one** icon (the number is not a quantity of icons).
- Model suits as an enum of 6. Rulebook art names (partial, from examples): Blue=canoe, Purple=mountain, Red=boot, Green=tree; the remaining two suits (mod colors Yellow, Brown) are two more distinct icons. For the reducer only the 6-way suit identity matters; store as `TrekSuit = 0..5`.
- Suggested type: `TrekCard = { suit: 0..5, value: 1|2|3|4 }`.

### 2.2 Park cards — 39 total (the "River"/PARK deck)
- Confirmed 39 in mod JSON. Each Park card = one national park with a **Victory-Point value** printed as the golden-arrowhead number, and an **icon cost** (a set of required Trek icons to claim it).
- **VP-value distribution (from card names in mod):** value 5 ×13 cards, value 7 ×16 cards, value 10 ×10 cards. (Higher-value = harder icon cost / farther park.)
- The **icon cost** of each Park card is a multiset of Trek suits (e.g. the rulebook example claims Lassen Volcanic with blue-canoe + purple-mountain + red-boot). Costs are not derivable from the Lua; treat them as static per-card data to be transcribed from the card faces. Reducer needs, per Park card: `{ id, name, vp: 5|7|10, cost: TrekSuit[] }`.
- 4 example Park VP values verified by name: Isle Royale=5, Lassen Volcanic=7, American Samoa=10, Yosemite=10.

### 2.3 The River (face-up Park cards)
- **3 face-up Park cards** are always available to claim ("PARK ×3" area in the mod, though the physical rulebook is 3 face-up; note the mod board also has extra face-up slots — use **3** per the rulebook). Only these 3 may be claimed at any time.
  - NOTE / CONFLICT: The prompt mentions "PARK (x4 face-up River)". The authoritative rulebook says **3 face-up Park cards**. Use **3**. (Some mod board labels show 4 slots but the rules deal 3.) The `refillRiver` Lua deals into whatever river zones exist; drive count from a config constant `PARK_RIVER_SIZE = 3`.

### 2.4 Face-up Trek "river" (the 5 face-up Trek cards)
- A separate river of **5 face-up Trek cards** beside the Trek deck, from which players may draw (see turn actions). Always kept at 5.

### 2.5 Major Parks — 6 exist, 3 used per game
- **6 Major Park cards** (Acadia, Denali, Everglades, Grand Canyon, Hawai'i Volcanoes, Yellowstone). Shuffle, pick **3 at random**, place face up; return the other 3 to the box.
- Each has an **icon cost** (like Park cards) and a **unique ability** (see §5.4). Major Parks are **never taken or discarded** — they stay in play all game and any player may occupy any of them (even one already occupied by someone else). Each player may occupy **each** Major Park **at most once**, spending one of their 3 Campsites per occupation.
- Occupying a Major Park is worth **5 VP** (the placed Campsite).

### 2.6 Stones — 45 total, 5 colors
- **Counts (rulebook p.3):** Blue 5, Green 7, Black 9, Red 11, Yellow 13 = **45**. (The number on each Stone-Bonus card = that color's starting supply.)
- Stones are drawn blindly from the bag at setup and seeded one per park location on the map; none are used again after setup. Each collected stone = **1 VP**.

### 2.7 Stone Bonus cards — 10 (majority awards)
- **5 "Most Stones" cards** and **5 "2nd Most Stones" cards**, one of each per stone color. Point values (from Lua `MostStonesScore` / `ScndMostStonesScore`), inversely scaled to rarity:

  | Stone color | Most-Stones bonus | 2nd-Most bonus |
  |---|---|---|
  | Yellow | **7** | **5** |
  | Red | **6** | **4** |
  | Black | **5** | **3** |
  | Green | **4** | **2** |
  | Blue | **3** | **1** |

- 2-player: only the 5 Most-Stones cards are in play.

### 2.8 Board
- One US map. Center space **START** (not a park; acts as a trail intersection; multiple Trekkers may occupy it and it never blocks movement). ~45 park locations shown as diamonds, connected by **trails** (edges). Each edge = distance 1. Model as an undirected graph: nodes = {START} ∪ parkLocations; edges = trails. Each park location is seeded with 0-or-1 stone at setup (exactly one until collected).
- The park-location graph and each location's park identity are static board data.

### 2.9 First Player token
- Given at setup to the player who "last visited a national park" (in a pure engine: pick per config / random). Determines turn order start.

---

## 3. Setup (reducer `setup` / initial state)

1. Place board. Build the trails graph.
2. Put all 45 stones in the bag; for **each park location**, draw one random stone and place it there. (Bag then empty and discarded.) → each location gets exactly one stone.
3. Each player: 1 Trekker on START, 3 Campsites in reserve.
4. Shuffle 6 Major Park cards; reveal 3, box the other 3.
5. Shuffle 39 Park cards → Park deck (face down). Deal top **3** face up = Park River.
6. Shuffle 96 Trek cards. Deal **2** to each player (secret hand). Remaining → Trek deck face down. Reveal top **5** face up = Trek River. Reserve a Trek discard pile (empty).
   - After dealing the Trek River, apply the "four-of-five same color" flush check (§4.1) once? Rulebook only triggers it during play; safe to also check at setup — implementation choice, low impact.
7. Place Stone Bonus cards near board (2p: Most only).
8. Assign First Player token; turn order proceeds clockwise (array order).

---

## 4. Turn structure

On your turn you get **exactly TWO actions**. They may be two different actions or the same action twice, in any order. The action set:

- **A. Draw a Trek card**
- **B. Move (your Trekker)**
- **C. Claim a Park card**
- **D. Occupy a Major Park**

(The prompt's "two core options" — take a card / play cards to move — are actions A and B; C and D are the point-scoring actions also selectable as one of the two.)

At **end of turn**: enforce hand limit (discard down to 12), then check end-game trigger (§6).

### 4.1 Action A — Draw a Trek card
- Draw 1 Trek card into hand, from **either**:
  - one of the 5 face-up Trek River cards (then immediately reveal a new top-of-deck card into that slot so the river returns to 5), **or**
  - the top of the Trek deck (blind draw).
- If the Trek deck empties, reshuffle the Trek discard pile to form a new face-down deck.
- **Four-of-five flush rule (automatic, resolves immediately whenever it becomes true — including right after a river refill):** if **4 of the 5** face-up Trek cards share the same suit, discard all 5 and reveal 5 new ones. (Repeat if the new five also trigger it.)

### 4.2 Action B — Move
Steps:
1. Choose a destination park location and a specific **path** (sequence of trails) from your current location to it.
2. Reveal Trek cards from hand whose **number values sum EXACTLY to the path length** (number of trails traversed). Discard them.
   - No limit on how many Trek cards combine in one move (e.g. spend 1+2+2+3 = move 8). All in one move = one action.
   - You may **not** spend a total higher than the distance traveled (must be exact).
3. Move the Trekker to the destination. If a stone is at the **destination**, collect it (place face-up in front of you; 1 VP). You collect **only** the destination stone, never stones you passed through.

**Path legality rules:**
- No trail edge used more than once in a single move.
- May not pass through or land on your **starting** location in the same move.
- May not pass **through** a location occupied by another player's Trekker — occupied locations block routing. **Exception: START never blocks** (multiple Trekkers allowed there; it still works as an intersection).
- You **may end** a move on a location occupied by another player's Trekker: that player is **bumped** — their Trekker returns to START. (Only one Trekker per non-START location otherwise.)
- Grand Canyon ability modifies the required sum by +1 for its owner (see §5.4).

Reducer: this is a shortest-path-ish constraint but the player picks the path; validate (a) the path is a simple walk of length L with no repeated edge, not passing through blocked nodes or the origin, and (b) the revealed cards' values sum to L (or L modified by Grand Canyon).

### 4.3 Action C — Claim a Park card
- Legal only if your Trekker is currently **on** a park location whose card is one of the **3 face-up Park River cards** (you must be physically at that park to claim its face-up card).
- Reveal from hand Trek cards whose **icons** exactly match the Park card's icon **cost** (multiset match). Discard them.
- Take the Park card face down in front of you (scores its VP at game end). Immediately refill the Park River from the top of the Park deck (keep 3 face up). If the Park deck is empty, the river simply shrinks.
- Wild/ability interactions: Acadia lets its owner treat any 2 Trek cards as 1 wildcard icon; Hawai'i Volcanoes / Yellowstone trigger on claim (see §5.4).

### 4.4 Action D — Occupy a Major Park
- Legal only if your Trekker is on that Major Park's location, you have not already occupied that Major Park, and you have at least one unused Campsite.
- Reveal from hand Trek cards whose icons match the Major Park's icon cost; discard them.
- Place one of your Campsites on that Major Park card (= 5 VP at end game) and immediately resolve that Major Park's ability for you (§5.4).
- Each player may occupy each Major Park at most once; any number of players may occupy the same Major Park.

---

## 5. Details, abilities, stones

### 5.1 Stone collection & placement into scoring
- Stones are collected only via Action B step 3 (destination stone). Collected stones sit "in front of" the player = in that player's scoring area. In the Lua these are literally counted by color in each player's ScoreZone at game end. State: `player.stones: { yellow, red, black, green, blue: number }`.

### 5.2 Bumping
- Ending a move on another Trekker sends that Trekker to START. START can hold many Trekkers. A player at START whose spot others pass through is never blocked.

### 5.3 Major Park abilities (from rulebook p.6)
- **Acadia:** for the rest of the game, its occupier may use **any 2 Trek cards as 1 wildcard** icon (any icon) for claiming Parks / occupying Major Parks. (Persistent.)
- **Denali:** on occupying, immediately draw **2** Trek cards from the deck. (One-time, on occupy.)
- **Everglades:** on occupying, immediately **swap one** of your collected stones with **any one** stone another player has collected. (One-time; if no other player has any stone, no swap.)
- **Grand Canyon:** for the rest of the game, on each **move** action you may modify the total value of played cards by **+1** (e.g. a "2" card moves distance 3). (Persistent; affects the exact-sum check in §4.2.)
- **Hawai'i Volcanoes:** for the rest of the game, whenever you **claim a Park card**, you may immediately move your Trekker to a connected Park location at distance **1** (free, no cards). (Persistent trigger.)
- **Yellowstone:** for the rest of the game, whenever you **claim a Park card**, immediately draw **1** Trek card from the deck. (Persistent trigger.)

Only 3 of the 6 are in any given game.

---

## 6. End-game trigger

The end is triggered by **either**:
1. **All stones on the map have been collected**, OR
2. **A player claims their 5th Park card** (Major Parks do NOT count toward this 5).

When triggered, play continues until the player **to the right of the first player** finishes their turn — i.e. finish the current round so every player has had an equal number of turns. Concretely: once triggered on some player's turn, the game ends after the turn of the player immediately before the start player in turn order (the last player in the round completes their turn). Then proceed to Final Scoring.

Reducer: set a `finalRound` flag when a trigger condition first becomes true at any point; end after the last player in the current rotation acts.

---

## 7. Stone-Bonus (majority) awards — resolved once, at end, before final tally

For each stone color independently (Lua `ScoreMostStones` / `ScoreScndMostStones`):

**Most-Stones card (that color):**
- Awarded to the single player who collected **strictly more** of that color than every other player.
- **Tie → card is canceled, awarded to no one** (if two+ players tie for most of a color).

**2nd-Most-Stones card (that color)** — not in 2-player games:
- Awarded to the single player with the **second-highest** count of that color, **excluding** whoever won that color's Most-Stones card.
- **Tie for second → canceled, no one gets it.**
- Special case (rulebook p.7): if the Most-Stones card was canceled by a tie, the players who tied for most are NOT eligible for that color's Most card, but the **next** distinct count down can still take the 2nd-Most card. (The Lua `ScoreScndMostStones` computes 2nd-most among all players where `MostStones[color] != that player`; since a canceled Most sets `MostStones[color]=nil`, the tied-for-most players remain eligible for 2nd-most in the code. Follow the Lua: 2nd-most is "highest count among players who did not win Most; ties cancel.")

Award values per §2.7 table. These points are added to the winners' totals.

**Lua tie semantics to replicate exactly (important edge cases):**
- `ScoreMostStones` iterates players; it uses `>=`, and on an exact equality it sets the winner to `nil` (cancel) but keeps the running max. Net effect: strict-max unique winner is awarded; any tie at the top cancels. A count of 0 with no one holding that color yields no award (guarded by `MostStonesCnt>0` in printing).
- `ScoreScndMostStones` mirrors this among players not equal to the Most winner.
- **Zero-count guard:** do not award a color's card to a player who has 0 of that color even if they're nominally "most/second" (Lua only prints/awards when count > 0; enforce `count > 0` for any award).

---

## 8. Final scoring (Lua `CountScoringObjects` + `ScoreGame`)

Each player's **FinalScore** = sum of:
1. **Stones:** +1 per collected stone (all colors). (`Players[PColor][SColor]` counts, +1 each.)
2. **Claimed Park cards:** + the printed VP (5 / 7 / 10) of each Park card the player holds. (Lua reads the two-digit value embedded in the card name.)
3. **Major Parks occupied (Campsites placed):** **+5 each.** (Lua: each "Campsite" object in the scoring zone = +5.)
4. **Stone-Bonus cards** won in §7: + their point value (Most: 7/6/5/4/3 by color; 2nd-Most: 5/4/3/2/1 by color).

Note: Major Park **abilities** grant no direct VP; only the 5-VP Campsite placement scores. Park-card VP + Campsite(=Major Park) VP together form the "Parks" subtotal used in tie-breaks.

---

## 9. Win condition & tie-breakers

**Winner = highest FinalScore.**

Tie-breakers (Lua `FindWinner → Breaktie → TieBreakFinal`, matching rulebook p.7):
1. **Primary:** most total FinalScore points.
2. **Tie-break 1 (`Breaktie`):** among tied players, most points from **Parks + Campsites** — i.e. (sum of claimed Park-card VP) + (5 × Major Parks occupied). Highest wins.
3. **Tie-break 2 (`TieBreakFinal`):** if still tied, most **total stones collected** (count across all 5 colors, i.e. the stone VP subtotal).
4. **Still tied:** the tied players **share the victory** (Lua sets `winColor=nil` → "we ALL HAD FUN"; rulebook: "they all share the victory"). The Lua tie machinery resolves up to 3-way ties; implement the general N-way version of the same rule.

Rulebook wording confirms exactly this order: total VP → Park cards + Major Parks → stones → shared win.

---

## 10. Suggested state shape (implementation sketch)

```
GameState = {
  players: Player[]            // turn order
  turnIndex: number            // whose turn
  actionsRemaining: 0|1|2      // 2 at start of each turn
  board: { nodes, trails, START }        // static graph
  stonesOnMap: Record<LocationId, StoneColor | null>  // one seeded per park, null once taken
  trekDeck: TrekCard[]         // face down (order = draw order)
  trekDiscard: TrekCard[]
  trekRiver: (TrekCard)[5]     // face up
  parkDeck: ParkCard[]         // face down
  parkRiver: ParkCard[3]       // face up (config PARK_RIVER_SIZE=3)
  majorParks: { card, cost, ability, occupiedBy: Set<playerId> }[3]
  stoneBonusAvailable: { most: color→bool, secondMost: color→bool }  // 2p: secondMost all false
  firstPlayerIndex: number
  finalRoundTriggered: boolean
  finished: boolean
}
Player = {
  id, color
  location: LocationId          // START at setup
  hand: TrekCard[]             // secret; redact for other viewers
  campsitesLeft: 0..3
  stones: Record<StoneColor, number>   // collected
  claimedParks: ParkCard[]     // count for 5th-park trigger; VP for scoring
  majorParksOccupied: MajorParkId[]     // 5 VP each
  abilities: { acadiaWild, grandCanyonPlus1, hawaiiHop, yellowstoneDraw, ... }  // persistent flags set on occupy
}
```

**Action union (sketch):**
`DrawTrek {source: 'river'|'deck', riverSlot?}` · `Move {path: EdgeId[], cardsSpent: CardRef[], usedAcadiaWild?}` · `ClaimPark {parkRiverSlot, cardsSpent, acadiaWildGroups?, hawaiiHopTo?}` · `OccupyMajor {majorId, cardsSpent, evergladesSwap?}` · `EndTurn` · `DiscardToLimit {cards}`.

**View redactor:** hide each player's `hand` contents from other viewers (show count only); hide `trekDeck` / `parkDeck` order/contents (show counts); Trek/Park rivers and all board/stone/scoring state are public. Nothing else is hidden.

---

## 11. Constants table (quick reference)

| Thing | Value |
|---|---|
| Players | 2–5 |
| Start hand | 2 Trek cards |
| Hand limit | 12 (enforced end of turn) |
| Trekker per player | 1 |
| Campsites per player | 3 |
| Trek cards | 96 = 6 suits × values 1–4 × 4 copies |
| Trek River (face up) | 5 (flush if 4/5 same suit) |
| Park cards | 39; VP values 5/7/10 (counts 13/16/10) |
| Park River (face up) | 3 |
| Major Parks | 6 exist, 3 in play; occupy = 5 VP + ability; ≤1 per player each |
| Stones | 45: Blue 5, Green 7, Black 9, Red 11, Yellow 13; 1 per park location; 1 VP each |
| Most-Stones bonus | Yellow 7, Red 6, Black 5, Green 4, Blue 3 (strict max; tie cancels) |
| 2nd-Most bonus | Yellow 5, Red 4, Black 3, Green 2, Blue 1 (not in 2p; tie cancels) |
| Actions per turn | exactly 2 (any mix of Draw/Move/Claim/Occupy) |
| End trigger | all map stones collected OR a player claims 5th Park card; finish the round |
| Tie-breaks | total VP → (Park VP + 5×Major Parks) → total stones → shared win |
```
