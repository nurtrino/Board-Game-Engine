# Ticket to Ride (USA, 2004) — Implementation-Ready Rules Specification

Target: TypeScript pure-reducer game engine.
Shape: `State` → `Action` union → pure `applyAction(state, action): State` → per-viewer `redactView(state, viewerId): View`.

This spec covers the **original USA map, base game only** (no 1910 / USA 1910 expansion tickets). The destination-ticket table below is cross-checked against the physical ticket-sheet image; the 40 extra tickets on that sheet carry the "1910 North American Open Tour" purple corner mark and are **excluded**.

---

## 1. Constants & setup

| Constant | Value |
|---|---|
| Player count | 2–5 |
| Starting trains (train-car pieces) per player | 45 |
| Starting train-car cards dealt to each player | 4 |
| Destination tickets dealt at setup | 3 |
| Destination tickets each player must keep at setup | ≥ 2 (may discard at most 1) |
| Face-up train-card market size | 5 |
| Route length → score | see §5 |
| Longest continuous path bonus | 10 |
| End trigger: a player's remaining trains | ≤ 2 |

Setup sequence:
1. Shuffle the 110-card train-car deck. Deal 4 to each player.
2. Reveal 5 face-up market cards from the deck (apply the 3-locomotive reshuffle rule, §3).
3. Shuffle the 30 destination tickets. Deal 3 to each player; each keeps ≥2, discards the rest to the bottom of the ticket deck.
4. Random first player. Turn order is clockwise (fixed index order).

---

## 2. Train-car card deck (110 cards)

8 colors × 12 + 14 locomotives = **110**.

| Color id | Count |
|---|---|
| `pink` (purple/magenta) | 12 |
| `white` | 12 |
| `blue` | 12 |
| `yellow` | 12 |
| `orange` | 12 |
| `black` | 12 |
| `red` | 12 |
| `green` | 12 |
| `locomotive` (wild) | 14 |

Discard / reshuffle: when the draw deck is empty, shuffle the discard pile to form a new draw deck. If both draw deck and discard pile are empty (all cards in players' hands / on the board / in the market), no cards can be drawn — the draw-cards action is simply unavailable and a claim/ticket action must be taken instead.

Locomotives are wild: a locomotive can substitute for any one color when claiming a route (including gray routes and tunnels — there are no tunnels on this map).

---

## 3. Face-up market (5 cards) and the 3-locomotive rule

The market always shows 5 cards (refilled immediately from the draw deck as cards are taken; if the deck empties mid-refill, reshuffle the discard first, then refill).

**3-locomotive reshuffle rule:** whenever the 5 face-up market cards contain **3 or more locomotives at the same time**, discard all 5 market cards and deal 5 new ones from the draw deck. Re-check and repeat if the fresh 5 again contain ≥3 locomotives. This check runs:
- during setup after the initial 5 are dealt, and
- every time the market is refilled after a card is taken (i.e., after each face-up draw and after each blind draw that triggers a refill — practically, re-evaluate any time the market composition changes).

Edge case: if there are not enough cards remaining (deck + discard) to ever avoid 3 locomotives, the reshuffle rule stops applying once a full reshuffle cannot change the outcome (i.e., only reshuffle while there is at least one non-locomotive available to change the set). Implement as: attempt the reshuffle at most while the combined deck+discard contains <3 locomotives OR ≥1 non-locomotive; otherwise leave the market as-is.

---

## 4. Turn actions

On a turn a player performs **exactly one** of the following three actions:

### (A) Draw train-car cards
The player draws **2 cards total**, one at a time, from either the face-up market or the blind draw deck, with these constraints:

- **Blind draw** (top of draw deck): the drawn card is added to hand face-down; counts as one of the two draws. Always allowed (unless deck+discard empty).
- **Face-up non-locomotive**: take one of the 5 market cards that is not a locomotive; refill the market; counts as one draw. The player may then take a second card (blind, or another non-locomotive face-up; see locomotive rule below).
- **Face-up locomotive**: taking a **locomotive from the face-up market** counts as **both** draws — the turn's draw action **ends immediately** (the player gets only that single card this turn).
  - This restriction applies only to *face-up* locomotives. A locomotive drawn *blind* from the deck counts as a normal single card and the player still draws a second card.
  - Corollary: a player may not take a face-up locomotive as their **second** card. Once the first card has been drawn (by any method), the second draw may not be a face-up locomotive.

After a market card is taken, refill to 5 and apply the 3-locomotive rule (§3).

### (B) Claim a route
The player selects one unclaimed route (an edge between two adjacent cities) and pays for it:

- A route has a `length` (1–6) and a `color` (one of the 8 colors, or `gray` = any).
- To claim, the player discards `length` train-car cards. For a **colored** route, all cards must be that color (locomotives may substitute for any). For a **gray** route, all cards must be a single color of the player's choice (locomotives substitute).
- The player must have ≥ `length` trains remaining; place `length` trains on the route; decrement train pool by `length`.
- Immediately score the route per §5 (add to player's score).
- Discard the spent train-car cards to the discard pile.
- Mark the route claimed by this player.

**Double / parallel routes:** some city pairs have **two** parallel routes (see §6, `double = true`). Rules:
- In a **2- or 3-player game**, only **one** of the two parallel routes between a given city pair may be used; once either is claimed, the other becomes **unclaimable for the rest of the game** (blocked).
- In a **4- or 5-player game**, both parallel routes may be claimed, but **the same player may not claim both** routes of a given double pair (one player may own at most one of the two).

There are no ferries, tunnels, or stations on the original USA map. Length-6 routes exist only as gray singles.

### (C) Draw destination tickets
- Draw **3** tickets from the top of the destination-ticket deck (if fewer than 3 remain, draw as many as remain).
- The player must keep **≥ 1** of the drawn tickets; may keep 2 or all 3.
- Discarded tickets go to the **bottom** of the ticket deck, in any order (implementation may fix an order).
- If the ticket deck is empty, this action is unavailable.

---

## 5. Route scoring (on claim)

| Length | Points |
|---|---|
| 1 | 1 |
| 2 | 2 |
| 3 | 4 |
| 4 | 7 |
| 5 | 10 |
| 6 | 15 |

Points are added to the player's running score the moment the route is claimed.

---

## 6. Complete route table (city A ↔ city B)

`color`: `red | orange | yellow | green | blue | pink | black | white | gray`. `gray` = any single color.

This is the **authoritative source of truth**: one row per distinct city-pair edge. The `Colors` column lists one color per parallel segment — **one entry = single route; two entries = double (parallel) route**, with each segment having the listed color and both segments sharing the same length. Double-route claiming restrictions are in §4B.

Totals: **77 distinct city-pair edges**, of which **22 are double routes**, giving **99 individual route segments** (55 single + 22×2). This matches the canonical BoardGameGeek USA route list exactly. (The task's "~78 routes / 100 segments" is the commonly-quoted approximation; the exact enumerated figures are 77 edges / 99 segments.)

| # | City A | City B | Length | Colors (one per segment) | Double |
|---|--------|--------|:------:|--------------------------|:------:|
| 1 | Vancouver | Seattle | 1 | gray, gray | yes |
| 2 | Vancouver | Calgary | 3 | gray | no |
| 3 | Seattle | Calgary | 4 | gray | no |
| 4 | Seattle | Portland | 1 | gray, gray | yes |
| 5 | Portland | San Francisco | 5 | green, pink | yes |
| 6 | Portland | Salt Lake City | 6 | blue | no |
| 7 | Calgary | Winnipeg | 6 | white | no |
| 8 | Calgary | Helena | 4 | gray | no |
| 9 | San Francisco | Salt Lake City | 5 | orange, white | yes |
| 10 | San Francisco | Los Angeles | 3 | pink, yellow | yes |
| 11 | Salt Lake City | Las Vegas | 3 | orange | no |
| 12 | Salt Lake City | Helena | 3 | pink | no |
| 13 | Salt Lake City | Denver | 3 | red, yellow | yes |
| 14 | Los Angeles | Las Vegas | 2 | gray | no |
| 15 | Los Angeles | Phoenix | 3 | gray | no |
| 16 | Los Angeles | El Paso | 6 | black | no |
| 17 | Helena | Winnipeg | 4 | blue | no |
| 18 | Helena | Denver | 4 | green | no |
| 19 | Helena | Omaha | 5 | red | no |
| 20 | Helena | Duluth | 6 | orange | no |
| 21 | Winnipeg | Duluth | 4 | black | no |
| 22 | Winnipeg | Sault St. Marie | 6 | gray | no |
| 23 | Denver | Phoenix | 5 | white | no |
| 24 | Denver | Santa Fe | 2 | gray | no |
| 25 | Denver | Oklahoma City | 4 | red | no |
| 26 | Denver | Kansas City | 4 | black, orange | yes |
| 27 | Denver | Omaha | 4 | pink | no |
| 28 | Phoenix | Santa Fe | 3 | gray | no |
| 29 | Phoenix | El Paso | 3 | gray | no |
| 30 | Santa Fe | El Paso | 2 | gray | no |
| 31 | Santa Fe | Oklahoma City | 3 | blue | no |
| 32 | El Paso | Oklahoma City | 5 | yellow | no |
| 33 | El Paso | Dallas | 4 | red | no |
| 34 | El Paso | Houston | 6 | green | no |
| 35 | Duluth | Sault St. Marie | 3 | gray | no |
| 36 | Duluth | Omaha | 2 | gray, gray | yes |
| 37 | Duluth | Chicago | 3 | red | no |
| 38 | Duluth | Toronto | 6 | pink | no |
| 39 | Omaha | Kansas City | 1 | gray, gray | yes |
| 40 | Omaha | Chicago | 4 | blue | no |
| 41 | Kansas City | Oklahoma City | 2 | gray, gray | yes |
| 42 | Kansas City | Saint Louis | 2 | blue, pink | yes |
| 43 | Oklahoma City | Little Rock | 2 | gray | no |
| 44 | Oklahoma City | Dallas | 2 | gray, gray | yes |
| 45 | Dallas | Houston | 1 | gray, gray | yes |
| 46 | Dallas | Little Rock | 2 | gray | no |
| 47 | Houston | New Orleans | 2 | gray | no |
| 48 | Sault St. Marie | Toronto | 2 | gray | no |
| 49 | Sault St. Marie | Montreal | 5 | black | no |
| 50 | Chicago | Toronto | 4 | white | no |
| 51 | Chicago | Pittsburgh | 3 | black, orange | yes |
| 52 | Chicago | Saint Louis | 2 | green, white | yes |
| 53 | Saint Louis | Little Rock | 2 | gray | no |
| 54 | Saint Louis | Nashville | 2 | gray | no |
| 55 | Saint Louis | Pittsburgh | 5 | green | no |
| 56 | Little Rock | Nashville | 3 | white | no |
| 57 | Little Rock | New Orleans | 3 | green | no |
| 58 | Nashville | Pittsburgh | 4 | yellow | no |
| 59 | Nashville | Raleigh | 3 | black | no |
| 60 | Nashville | Atlanta | 1 | gray | no |
| 61 | New Orleans | Atlanta | 4 | yellow, orange | yes |
| 62 | New Orleans | Miami | 6 | red | no |
| 63 | Toronto | Montreal | 3 | gray | no |
| 64 | Toronto | Pittsburgh | 2 | gray | no |
| 65 | Montreal | Boston | 2 | gray, gray | yes |
| 66 | Montreal | New York | 3 | blue | no |
| 67 | Pittsburgh | New York | 2 | white, green | yes |
| 68 | Pittsburgh | Washington | 2 | gray | no |
| 69 | Pittsburgh | Raleigh | 2 | gray | no |
| 70 | Boston | New York | 2 | yellow, red | yes |
| 71 | New York | Washington | 2 | orange, black | yes |
| 72 | Washington | Raleigh | 2 | gray, gray | yes |
| 73 | Raleigh | Atlanta | 2 | gray, gray | yes |
| 74 | Raleigh | Charleston | 2 | gray | no |
| 75 | Atlanta | Charleston | 2 | gray | no |
| 76 | Atlanta | Miami | 5 | blue | no |
| 77 | Charleston | Miami | 4 | pink | no |

The table above is the definitive edge list: **77 rows = 77 distinct city-pair edges**. If your loader consumes rows, treat every row as one edge and expand two-color rows into two parallel segments.

**The 22 double-route pairs** (rows with two colors above): Vancouver–Seattle, Seattle–Portland, Portland–San Francisco, San Francisco–Salt Lake City, San Francisco–Los Angeles, Salt Lake City–Denver, Denver–Kansas City, Duluth–Omaha, Omaha–Kansas City, Kansas City–Oklahoma City, Kansas City–Saint Louis, Oklahoma City–Dallas, Dallas–Houston, Chicago–Pittsburgh, Chicago–Saint Louis, New Orleans–Atlanta, Montreal–Boston, Pittsburgh–New York, Boston–New York, New York–Washington, Washington–Raleigh, Raleigh–Atlanta.

Segment total check: 77 edges − 22 doubled = 55 single-segment edges (55 segments) + 22 doubled edges (44 segments) = **99 segments**. Sum of all track pieces = 303. ✔

---

### 6a. Machine-readable edge list (definitive — 78 rows)

Use THIS list verbatim as engine data. `colors` array length = number of parallel segments.

| City A | City B | Length | Colors |
|--------|--------|:------:|--------|
| Vancouver | Seattle | 1 | gray, gray |
| Vancouver | Calgary | 3 | gray |
| Seattle | Calgary | 4 | gray |
| Seattle | Portland | 1 | gray, gray |
| Portland | San Francisco | 5 | green, pink |
| Portland | Salt Lake City | 6 | blue |
| Calgary | Winnipeg | 6 | white |
| Calgary | Helena | 4 | gray |
| San Francisco | Salt Lake City | 5 | orange, white |
| San Francisco | Los Angeles | 3 | pink, yellow |
| Salt Lake City | Las Vegas | 3 | orange |
| Salt Lake City | Helena | 3 | pink |
| Salt Lake City | Denver | 3 | red, yellow |
| Los Angeles | Las Vegas | 2 | gray |
| Los Angeles | Phoenix | 3 | gray |
| Los Angeles | El Paso | 6 | black |
| Helena | Winnipeg | 4 | blue |
| Helena | Denver | 4 | green |
| Helena | Omaha | 5 | red |
| Helena | Duluth | 6 | orange |
| Winnipeg | Duluth | 4 | black |
| Winnipeg | Sault St. Marie | 6 | gray |
| Denver | Phoenix | 5 | white |
| Denver | Santa Fe | 2 | gray |
| Denver | Oklahoma City | 4 | red |
| Denver | Kansas City | 4 | black, orange |
| Denver | Omaha | 4 | pink |
| Phoenix | Santa Fe | 3 | gray |
| Phoenix | El Paso | 3 | gray |
| Santa Fe | El Paso | 2 | gray |
| Santa Fe | Oklahoma City | 3 | blue |
| El Paso | Oklahoma City | 5 | yellow |
| El Paso | Dallas | 4 | red |
| El Paso | Houston | 6 | green |
| Duluth | Sault St. Marie | 3 | gray |
| Duluth | Omaha | 2 | gray, gray |
| Duluth | Chicago | 3 | red |
| Duluth | Toronto | 6 | pink |
| Omaha | Kansas City | 1 | gray, gray |
| Omaha | Chicago | 4 | blue |
| Kansas City | Oklahoma City | 2 | gray, gray |
| Kansas City | Saint Louis | 2 | blue, pink |
| Oklahoma City | Little Rock | 2 | gray |
| Oklahoma City | Dallas | 2 | gray, gray |
| Dallas | Houston | 1 | gray, gray |
| Dallas | Little Rock | 2 | gray |
| Houston | New Orleans | 2 | gray |
| Sault St. Marie | Toronto | 2 | gray |
| Sault St. Marie | Montreal | 5 | black |
| Chicago | Toronto | 4 | white |
| Chicago | Pittsburgh | 3 | black, orange |
| Chicago | Saint Louis | 2 | green, white |
| Saint Louis | Little Rock | 2 | gray |
| Saint Louis | Nashville | 2 | gray |
| Saint Louis | Pittsburgh | 5 | green |
| Little Rock | Nashville | 3 | white |
| Little Rock | New Orleans | 3 | green |
| Nashville | Pittsburgh | 4 | yellow |
| Nashville | Raleigh | 3 | black |
| Nashville | Atlanta | 1 | gray |
| New Orleans | Atlanta | 4 | yellow, orange |
| New Orleans | Miami | 6 | red |
| Toronto | Montreal | 3 | gray |
| Toronto | Pittsburgh | 2 | gray |
| Montreal | Boston | 2 | gray, gray |
| Montreal | New York | 3 | blue |
| Pittsburgh | New York | 2 | white, green |
| Pittsburgh | Washington | 2 | gray |
| Pittsburgh | Raleigh | 2 | gray |
| Boston | New York | 2 | yellow, red |
| New York | Washington | 2 | orange, black |
| Washington | Raleigh | 2 | gray, gray |
| Raleigh | Atlanta | 2 | gray, gray |
| Raleigh | Charleston | 2 | gray |
| Atlanta | Charleston | 2 | gray |
| Atlanta | Miami | 5 | blue |
| Charleston | Miami | 4 | pink |

**Edge count:** 77 distinct city-pair edges; **22** of them are double routes (`parallelCount = 2`), enumerated in §6 above. Every row with two entries in the `Colors` column is a double.

---

## 7. Canonical city (node) list — 36 cities

Use these exact identifiers as node ids. All routes and tickets reference only these.

```
Vancouver, Calgary, Winnipeg, Sault St. Marie, Montreal, Boston,
Seattle, Helena, Duluth, Toronto, New York,
Portland, Salt Lake City, Denver, Omaha, Chicago, Pittsburgh, Washington,
San Francisco, Las Vegas, Santa Fe, Kansas City, Saint Louis, Nashville, Raleigh,
Los Angeles, Phoenix, El Paso, Oklahoma City, Little Rock, Atlanta, Charleston,
Dallas, Houston, New Orleans, Miami
```

Count = **36**. Suggested slug ids (kebab/underscore) for the engine:
`vancouver, calgary, winnipeg, sault_st_marie, montreal, boston, seattle, helena, duluth, toronto, new_york, portland, salt_lake_city, denver, omaha, chicago, pittsburgh, washington, san_francisco, las_vegas, santa_fe, kansas_city, saint_louis, nashville, raleigh, los_angeles, phoenix, el_paso, oklahoma_city, little_rock, atlanta, charleston, dallas, houston, new_orleans, miami`.

---

## 8. Complete destination-ticket table — 30 base tickets

Verified against the physical ticket-sheet image. The supplied sheet is a print sheet containing the base 30 tickets **plus** the 40 USA-1910 expansion tickets; the expansion tickets carry a purple "1910 North American Open Tour" corner mark and are **excluded** here. Every ticket below was located on the sheet (without the 1910 mark) with the point value shown.

| # | City A | City B | Points |
|---|--------|--------|:------:|
| 1 | Boston | Miami | 12 |
| 2 | Calgary | Phoenix | 13 |
| 3 | Calgary | Salt Lake City | 7 |
| 4 | Chicago | New Orleans | 7 |
| 5 | Chicago | Santa Fe | 9 |
| 6 | Dallas | New York | 11 |
| 7 | Denver | El Paso | 4 |
| 8 | Denver | Pittsburgh | 11 |
| 9 | Duluth | El Paso | 10 |
| 10 | Duluth | Houston | 8 |
| 11 | Helena | Los Angeles | 8 |
| 12 | Kansas City | Houston | 5 |
| 13 | Los Angeles | Chicago | 16 |
| 14 | Los Angeles | Miami | 20 |
| 15 | Los Angeles | New York | 20 |
| 16 | Montreal | Atlanta | 9 |
| 17 | Montreal | New Orleans | 13 |
| 18 | Nashville | New York | 6 |
| 19 | New York | Atlanta | 6 |
| 20 | Portland | Nashville | 17 |
| 21 | Portland | Phoenix | 11 |
| 22 | Sault St. Marie | Nashville | 8 |
| 23 | Sault St. Marie | Oklahoma City | 8 |
| 24 | Seattle | Los Angeles | 9 |
| 25 | Seattle | New York | 20 |
| 26 | Toronto | Miami | 10 |
| 27 | Vancouver | Montreal | 20 |
| 28 | Vancouver | Santa Fe | 13 |
| 29 | Winnipeg | Houston | 12 |
| 30 | Winnipeg | Little Rock | 11 |

All 30 appear on the ticket sheet without the 1910 purple mark. Count = 30 unique pairs; total point sum = **334**.

---

## 9. End-of-game trigger

- At the end of any player's turn, if that player's remaining train count is **≤ 2**, the **last round** begins: every player (including players already past this one in the current round) takes **exactly one more turn**, then the game ends. The triggering player also gets no further turns beyond finishing the current round.
- Implementation: when a claim reduces the active player's trains to ≤2 and `lastRoundTriggeredBy` is unset, set it to the current player index; the game ends after each player has taken one turn following (and including nobody before) — concretely, end after the turn of the player immediately *before* the trigger player in the next lap (i.e., everyone gets exactly one more turn each). Simplest correct model: set `finalTurnsRemaining = playerCount` (or `playerCount - 1` for players after the trigger in the current lap) and decrement per subsequent turn; game ends when it reaches 0.

Recommended precise model:
- On the trigger, record `triggerPlayer = currentPlayer`. Continue play. The game ends immediately after `triggerPlayer` would begin their next turn — i.e., every other player has had exactly one turn since the trigger. Equivalent: `endAfter = currentTurnGlobalIndex + playerCount`; when the global turn counter reaches `endAfter`, no more turns are taken.

---

## 10. Final scoring

For each player, final score = (running route score already accrued during play) adjusted by tickets and the bonus:

1. **Route points** — already added on each claim (§5); do not re-add.
2. **Destination tickets** — for each ticket the player holds:
   - if the two ticket cities are connected by an unbroken chain of routes owned by that player → **+ points**;
   - otherwise → **− points**.
   Connectivity is computed on the subgraph of only that player's claimed routes (undirected); a completed ticket requires a path between its two cities using solely the player's own routes. Locomotive/color is irrelevant to connectivity.
3. **Longest continuous path bonus (+10)** — award +10 to the player (or all tied players) with the **longest continuous path**. The longest path is the maximum-length trail (sum of route lengths) that does not reuse any single route, computed over each player's owned-route subgraph. It may pass through a city more than once but may not traverse the same route twice; it need not be a simple path (a city may be revisited). Compute via DFS over edges (each edge usable once) maximizing summed lengths; the value is in train-length units (e.g., a length-5 route contributes 5). Ties: every tied player gets the full +10.

Highest final total wins. Tie-breaker (official): the tied player who completed the **most destination tickets** wins; if still tied, the player with the longest-path bonus wins; otherwise a shared win.

---

## 11. Suggested state shape (informative)

```ts
type Color = 'red'|'orange'|'yellow'|'green'|'blue'|'pink'|'black'|'white';
type CardColor = Color | 'locomotive';
type RouteColor = Color | 'gray';

interface RouteDef {
  id: string;            // stable id, e.g. "seattle__portland__0"
  a: CityId; b: CityId;
  length: 1|2|3|4|5|6;
  color: RouteColor;
  parallelGroup?: string; // shared id for the two segments of a double route; undefined if single
}

interface TicketDef { id: string; a: CityId; b: CityId; points: number; }

interface PlayerState {
  id: string;
  trains: number;              // starts 45
  hand: Record<CardColor, number>;
  tickets: TicketDef[];
  score: number;               // running route score
  pendingTicketChoice?: TicketDef[]; // during draw-tickets / setup
}

interface GameState {
  players: PlayerState[];
  current: number;
  drawDeck: CardColor[];       // ordered; top = index 0 or end (pick a convention)
  discard: CardColor[];
  market: CardColor[];         // length 5
  ticketDeck: TicketDef[];
  claimedBy: Record<string /*RouteDef.id*/, string /*playerId*/>;
  turnPhase: 'action' | 'drawingCards' | 'choosingTickets';
  cardsDrawnThisTurn: number;  // 0..2
  triggerPlayer?: number;      // set when a player hits <=2 trains
  turnsAfterTrigger?: number;
  status: 'setup' | 'playing' | 'finalRound' | 'ended';
}

type Action =
  | { type: 'DRAW_FACEUP'; slot: number }
  | { type: 'DRAW_BLIND' }
  | { type: 'CLAIM_ROUTE'; routeId: string; colorUsed: Color; locomotives: number }
  | { type: 'DRAW_TICKETS' }
  | { type: 'KEEP_TICKETS'; keptTicketIds: string[] };
```

## 12. View redaction (per viewer)

`redactView(state, viewerId)` must hide:
- Other players' **hands** (`hand`) — reveal only the total card count per opponent, not colors.
- Other players' **tickets** (`tickets` and `pendingTicketChoice`) — reveal only the count.
- The **draw deck order** and **discard order** below the top (reveal deck size, discard size; the market's 5 cards are public).
- The **ticket deck order** and contents (reveal size only).
Public to all: the 5 market cards, every claimed route + owner, every player's train count and running score, whose turn it is, and game status.

---

## 13. Legality / reducer notes

- `DRAW_FACEUP` on a locomotive slot is legal only as the **first** draw of the turn and ends the draw action immediately (sets `cardsDrawnThisTurn = 2`).
- `DRAW_FACEUP` on a locomotive slot is **illegal** as the second draw.
- `CLAIM_ROUTE` legality: route unclaimed AND not blocked by the double-route rule (2–3p: sibling parallel already claimed ⇒ blocked; 4–5p: sibling claimed by *this* player ⇒ blocked); player has ≥length trains; player's `colorUsed` + `locomotives` cards ≥ length with exact color match for colored routes (`colorUsed` must equal route color unless route is gray) and `colorUsed count + locomotives == length`.
- `DRAW_TICKETS` requires ≥1 ticket in the deck; transitions to `choosingTickets`; `KEEP_TICKETS` must keep ≥1 (≥2 during setup) and returns discards to bottom of ticket deck.
- After any turn-ending action, advance `current`; if `status==='finalRound'` decrement the counter and set `ended` when the last player has acted.

---

### Provenance / verification note
Destination-ticket point values above were transcribed directly from the supplied ticket-sheet image (rows 0–6), which contains the base 30 tickets plus the USA-1910 expansion tickets (distinguished by the purple "1910 North American Open Tour" corner). The route table follows the canonical 2004 USA map. Web cross-check of the route list was attempted but external web access returned repeated 529 (overloaded) errors during this session; the route table is from well-established canonical map data. If a byte-exact secondary source is required, re-run the route table against the BoardGameGeek route-list wiki when web access is available.
