# Dark Tower — Rules Spec for a Pure-Reducer Engine

Source of truth: the TTS mod's Global Lua (workshop 873019835, saved at
games/dark-tower/golden/global.lua — line refs below). The mod is itself a
ROM-faithful re-implementation of the 1981 TMS-1400 tower (its comments cite
disassembly). The mod does NOT enforce board position (honor system + CLEAR
undo); our port keeps the mod's exact electronic brain and drops the honor
system: every action is always available on your turn, exactly as the tower's
buttons are. Player count 2-4 (user scoped; the Lua supports 1-4 — keep the
solo-only death branches out by requiring >=2 seats).

## 1. Players, kingdoms, setup

- Seats: Red, Blue, Yellow, Green (Lua order; player index 1-4). Kingdoms by
  seat index: Arisilon(R), Brynthia(B), Durnin(Y), Zenon(G) (scorecards table
  L318). Each player starts at their own citadel in their home kingdom.
- Start inventory (L141): warriors 10, gold 30, food 25, no items, no keys,
  quad 0, moves 0.
- Level select (L743): tower brigands `dtBrigands` = L1: rand(17,32),
  L2: rand(33,64), L3: rand(17,64). (Lua L4 is a practice mode — skip it;
  offer levels 1-3 in the lobby/new-game UI, default 1.)
- Riddle (L180, L762): one of 6 ordered pairs drawn from
  {gold,silver,brass} permutations: [G,S],[G,B],[S,G],[S,B],[B,S],[B,G] —
  the pair is the first two keys of the answer sequence; the SAME riddle is
  used for every player in a game.
- First player: chosen in the lobby (we use seat 0 = first joiner, or random).
- Dragon hoard: dragonWarriors=2, dragonGold=6 (L216).

## 2. Turn structure (playTurn L541 / endTurn L585)

One action per turn. Turn order R→B→Y→G among seated players. Two exceptions
re-run the SAME player's turn: scout award (lost-with-scout, L1695 scouted=1)
and pegasus flight (L777 flew=1).

At the START of a player's first action each turn (foodStatus 'check'):
1. If cursed (L642-647): resolve curse FIRST — lose `curseWarriors` and
   `curseGold` (the globals set when the wizard was cast), cursed=0. Then eat.
2. Eat: `eats = ceil(warriors/15)` food (L650). Food floors at 0.
3. If food == 0 after eating: STARVED — lose 1 warrior (floor 1 with >=2
   players) every turn until fed (L657).
   (Hungry warning when food <= eats*4 — cosmetic.)
Then the chosen action resolves. (Scout re-turns skip the food check —
foodStatus='scout' L556.)

`moves` increments on every action (all buttons do moves+1). `citadel` flag
(the once-only quad-4 doubling) resets to 0 on tomb/bazaar/tower actions
(L1124, L1771, L2365).

Gold encumbrance after any gold/warrior change (maxGold L427):
gold = min(gold, 99, warriors*6 + beast*50).
Warriors and food cap at 99 where the Lua caps them (L1549, L2133 etc.).

## 3. Actions

### MOVE (travel) — moveClick L1429
Roll moveResult (L9): 16ths — lost 3, dragon 2, plague 3, battle 3, safe 5.
- safe: nothing.
- lost (L1659): token returns to previous position (cosmetic); turn ends.
  With a SCOUT (L1673): shows lost then scout; player immediately takes
  ANOTHER turn (scouted=1; no second food charge).
- plague (L1578): lose 2 warriors (floor 1 with >=2 players). With a
  HEALER (L1619): instead GAIN 2 warriors (cap 99).
- dragon (L1464): dragon takes floor(warriors/4) and floor(gold/4) into its
  hoard (hoard caps 99 each). With a SWORD (L1516): dragon dies — player
  GAINS the whole hoard (caps 99 / maxGold), sword is consumed, hoard resets
  to 2 warriors / 6 gold.
- battle: brigand battle (below) with brigands = startingBrigands(warriors)
  = warriors + rand(-2..2), min 1 (L26).

### TOMB / RUIN — tombClick L1114
tombruinResult (L18): 16ths — empty 2, battle 8, treasure 6.
- empty: turn ends. battle: as above. treasure: straight to treasure award.

### Battle — battle L1152 / oneBattle1 L1180
Rounds repeat until brigands reach 0 or the player is beaten/bails:
- Each round: oddsOfVictory (L35) — warriors*d4 vs brigands*d4, ties to
  warriors. Warriors win the round: brigands = floor(brigands/2). Brigands
  win: warriors -= 1.
- After each round the NEXT round's odds are pre-rolled; if that roll is a
  loss and warriors <= 2 (with >=2 players; <=1 solo) the battle force-ends
  as a defeat: bailOut.
- The player may BAIL (NO button) anytime mid-battle: bailOut (L1274) =
  lose 1 more warrior (floor 1 with >=2 players), turn ends.
- brigands == 0: victory — non-tower battle awards treasure; tower battle
  wins the game.

### Treasure — treasureOK L1304
Always: gold += rand(13,20) (goldAward L56), then maxGold. Then one item
roll (itemAward L63): 16ths — key 10, sword 1, pegasus 1, wizard 1, none 3.
- key: you receive the key OF YOUR CURRENT QUAD — quad1=brass, quad2=silver,
  quad3=gold; nothing at quad 0/4 or if you already hold that key (L1322).
- sword / pegasus: gained unless already owned.
- wizard (L1364): only if no one is currently cursed and >=2 players.
  Caster picks a victim: caster IMMEDIATELY gains floor(victim.warriors/4)
  and floor(victim.gold/4) (L836, curse L861); the victim is flagged cursed
  and LOSES those same stored amounts at the start of their next turn
  (iGotCursed/sickWarriors/sickGold L896-945).

### BAZAAR — bazaarClick L1764
Prices rolled fresh per visit (L1775): warrior rand(5,8), food 1 (always),
beast/scout/healer rand(17,26). Offer cycle: warrior → (NO) food → (NO)
beast if unowned → scout if unowned → healer if unowned → warrior…
- warrior/food: YES increments a quantity counter (buy N); exceeding gold
  closes the shop; NO completes the purchase (gold -= N*price; +N).
- beast/scout/healer: YES buys 1 at the price immediately.
- HAGGLE (L1040): price -1, floor 1 — but haggle() (L71) may CLOSE the shop:
  first haggle of the visit fails 4/16, later haggles fail 8/16. Haggling at
  price 1 closes the shop. (Haggling the food offer just closes the shop.)
- Shop closing or completing a purchase ends the turn.
- Beast raises the gold cap (+50). Scout/healer/beast: one each max.

### SANCTUARY / CITADEL — citadelClick L2083
Bonuses (all that apply, L2099): warriors<=4 → +rand(5,8) warriors;
gold<=7 → +rand(9,16) gold; food<=5 → +rand(9,16) food.
Homecoming double (L2100): if quad==4 and 5<=warriors<=24, warriors DOUBLE
instead — once only (citadel flag; cleared when the player next does a
tomb/bazaar/tower action). No bonuses due → nothing happens (turn ends).

### FRONTIER — frontierClick L1934
Advance to the next kingdom (quad += 1). Gated (L1942): leaving quad 1
requires the brass key, quad 2 the silver key, quad 3 the gold key; quad 4
(home again) cannot advance further. Failing shows "key missing" and ends
the turn. quad 0 → 1 is free (leaving home).

### TOWER — towerClick L2358
Requires quad == 4 AND the gold key (plus, implicitly, all three since gold
only drops in quad 3). Then the Riddle of the Keys (L2398):
- The tower shows a key (starting after 'goldkey' in the cycle
  gold→brass→silver→gold, with the already-guessed key skipped in phase 2).
- NO advances to the next key in the cycle; REPEAT re-shows the current key;
  YES locks the shown key in as the guess for the current riddle position.
- Wrong guess at either position: turn ends (the riddle can be retried on a
  later turn; the answer never changes).
- Both positions right: tower battle vs dtBrigands. Win = VICTORY (1812
  fanfare). Lose/bail = normal bailOut turn end (dtBrigands is NOT reduced
  between attempts — the Lua re-arms `brigands = dtBrigands` each attempt).

### INVENTORY — inventoryClick L2216
Costs your turn (moves+1, food check) and replays your holdings on the
display. In our port the phone always shows your inventory, so expose this
only as flavor (or omit the button); the engine supports it as a no-op turn.

### PEGASUS — usePegasus L703
Usable INSTEAD of your action, before acting: consumed, and the player
immediately takes another turn (fly anywhere = in our port just a free
re-turn; cosmetic token relocation). No food re-check on the re-turn.

## 4. Winning, dying, score

- Victory: beat the tower battle after solving the riddle. Game over.
- With >=2 players nobody dies (warrior floors at 1 everywhere); solo death
  branches exist in the Lua but we require 2-4 players.
- Score (finalScore L86): (176 + floor(dtBrigands*1.25)) -
  ((winner.moves + warriorsAtTurnStart) * 4), clamped 0-99. Shown for the
  winner as the classic 2-digit rating.

## 5. Display model (for TV + phone "tower" panel)

The tower's outputs, mirrored in our views (wedgeReels/wedgeLights L158):
- pic: one of cursed lost plague / victory warriors brigands / wizard closed
  missing / dragon sword pegasus / brasskey silverkey goldkey / scout healer
  gold / warrior food beast / off — the reel textures extracted from the
  mod's assetbundle (reel4-10 in trigger order; 3 pictures per reel face lit
  top/middle/bottom).
- lcd: 2 chars — counts, ' R'/'-R' turn markers, 'L1' level, 'CR' curse
  pick, '1 '/'2 ' riddle position, '--' quantity prompt, '  ' blank.
- sound: the mod soundboard's AudioClips (extracted): trigger order
  0 beep,1 tick,2 battle,3 battlelose,4 battlewin,5 bazaar,6 citadel,
  7 clear,8 die,9 done,10 dragon,11 dragondie,12 failure,13 frontier,
  14 intro/1812,15 pegasus,16 rotate,17 tombempty?,18 starving,19 tick2,
  21 tombbattle,22 tomb — exact indices to be confirmed against the bundle's
  m_PreloadTable order when staging; keep a name-keyed map in scene.json.

Every engine event carries {pic, lcd, sfx} so clients replay the authentic
tower sequence (the multi-beat sequences — battle rounds, dragon, sanctuary
payouts — become a list of timed display steps in the event).

## 6. State sketch

```
DarkTowerState = {
  phase: 'playing' | 'ended'
  level: 1|2|3
  dtBrigands: number            // rolled at setup
  riddle: [Key, Key]            // shared answer pair
  dragon: { warriors: number, gold: number }
  turn: seatIndex
  players: DtPlayer[]
  pendingBazaar / pendingBattle / pendingRiddle / pendingCurse: sub-state
  winner: seat | null, score: number | null
}
DtPlayer = { seat, color, kingdom, warriors, gold, food, beast, scout,
  healer, sword, pegasus, brassKey, silverKey, goldKey, quad, cursed,
  curseW, curseG, citadelUsed, moves, tokenSpot }
```
Actions: move | tomb | bazaar(sub: yes/no/haggle) | sanctuary | frontier |
tower(sub: riddle yes/no/repeat) | battle(sub: continue/bail) |
curse_pick(victim) | pegasus | end acknowledgements as needed.

Hidden info: NONE in the mod (scorecards are public; blindfold mode is an
optional variant we skip). Views are fully public — redaction not needed
beyond the standard shape.

## 7. Client scope (user-approved)

- 2-4 players; phones drive everything Brass-style: board main-left, the
  tower panel top-right (swappable focus). Panel = the 12 tower buttons that
  are legal in context + the reel/LCD readout.
- TV: the circular board with the real tower mesh (OBJ 8F48...C840A7C5,
  13.6k verts) center, buildings + tokens on the quadrants, reel wedge +
  LCD rendered on/near the tower, captions per event, authentic sounds.
- Assets: board disc + building OBJs (plain tints per Lua colorCodes),
  tower OBJ, reel/LCD textures from bundle 56DA...D6B8F + 9FA8...FE85D,
  sounds from 22CE...3CBAF.
```
