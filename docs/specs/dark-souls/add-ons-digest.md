# Add Ons Booklet — Rulebook Digest (Summons, Invaders, Mimics)

Source: `games/dark-souls/rulebooks/add-ons.pdf` (15 pp, fully scanned images — read via page renders).
The scan is an excerpt of a larger book; PDF page N carries a printed page number. Refs below give `PDF pN (printed pM)`.

Covered systems: **Summons** (NPC white-phantom allies, printed pp6-9), **Invaders** (hostile NPC add-on characters + invasion token economy, printed pp10-15), **Mimics** (ambush chests, printed pp10-13 of a different chapter). NOTE: this booklet defines the three FRAMEWORKS and shows example cards (Lucatiel of Mirrah, Fencer Sharron, Hungry/Voracious Mimic). Individual character data cards (Old Dragonslayer, Eygon, Beatrice, Smelter Demon as bosses, etc.) are card components, not reprinted here. Andre and the Firekeeper have no rules in this booklet beyond being visitable at the bonfire (see mega boss digests).

---

## MIMICS

### Setup (PDF p2, printed p10)
- Opt-in at game start. During tile setup, place **one face-down Ambush card beside each tile**.
- When the party opens a chest (core p17): flip the Ambush card beside that tile. **Treasure face** → resolve the chest normally. **Mimic face** → a mimic battle ensues.

### Mimic data cards (PDF p3, printed p11)
Same anatomy as boss data cards (name, threat level, behaviour deck size, heat up point, block/resist, special ability, starting health, set symbol).

- **Hungry Mimic** — threat 10, health **18**, behaviour deck size **4**, heat up **8**, block **1** / resist **1**. Special — *Loot the Body*: "When the Mimic is defeated, the players gain treasure cards as if they had opened two chests."
- **Voracious Mimic** (PDF p4, printed p12) — threat 10, health **18**, deck size **4**, heat up **8**, block **2** / resist **2**, same *Loot the Body* special.

### Mimic behaviour cards (PDF p3, printed p11)
Work like boss behaviour cards (core p27) with two differences:
1. **No dedicated Heat Up cards**: on heat up, shuffle any one REMAINING (unused) behaviour card into the deck.
2. **No arc markings** (no attack arcs / weak arcs) — mimics don't use facing.

Example faces: **Heavy Punch** (Voracious) — range 1, dodge 2, move 1, physical damage 5 (large example, PDF p3; the small photo on PDF p4 appears to show 6 — verify against mod assets). **Raking Slash** (Hungry, PDF p4) — dodge 1, damage 4 (small photo).

### Starting a mimic encounter (PDF p4, printed p12)
- Characters recover all Health/Stamina at end of the (cleared) encounter as usual BEFORE opening the chest. If it's a mimic: replace the chest with the mimic miniature; fight like a boss encounter before claiming treasure.
- Characters are NOT placed on entry nodes; they stay on the nodes they occupied at the end of the encounter.
- Which mimic: mini boss not yet defeated → **Hungry Mimic**; mini boss already defeated → **Voracious Mimic**.
- Behaviour deck: take a number of random standard behaviour cards equal to deck size (4), shuffle, place face down. No gravestone reveals mentioned.
- Heat up at health <= 8: shuffle in one random unused behaviour card (players must relearn the pattern).
- Empty behaviour deck at start of its activation → recycle discard face down WITHOUT shuffling.

### Defeating a mimic (PDF p5, printed p13)
- Remove it; players gain treasure **as if they had opened two chests**. A defeated mimic never returns (even after encounter resets from bonfire rest).
- If the party is defeated: the mimic returns to its terrain node and remains on the tile. On re-clearing the encounter, the party MAY engage the mimic again (repeatable until it dies or sparks run out).

---

## INVADERS

### Setup (PDF p6, printed p10)
- Opt-in at game start. Invaders are lured by **embers**: when a player finds an Ember card in the treasure deck and gains an Ember token (core p12), an invader is added to a future encounter.
- During setup, separate three face-down piles: **blank tokens**, **standard invader tokens**, **advanced invader tokens**.
- Token roster (12 named invaders):
  - Standard: **Kirk, Knight of Thorns; Melinda the Butcher; Maldron the Assassin; Maneater Mildred; Oliver the Collector; Xanthous King Jeremiah**
  - Advanced: **Longfinger Kirk; Armorer Dennis; Marvelous Chester; Invader Brylex; Paladin Leeroy; Fencer Sharron**

### Using invader tokens (PDF p7, printed p11)
When a character gains an Ember token, if there are **no invader tokens already in play** and at least one unexplored tile:
- Mini boss NOT yet defeated → take one random **standard** invader token + enough **blank** tokens to have one token per unexplored encounter tile; randomly place one face-down token on each face-down encounter card.
- Mini boss defeated → same but with one random **advanced** invader token.
- With a single unexplored tile the invader is guaranteed there; otherwise players don't know when the invasion strikes.

### Invader data cards (PDF p8, printed p12)
Anatomy: name, threat level, behaviour deck size, heat up point, block/resist, special ability, starting health, **Mini or Main Boss Invader icon** (black orb = standard/mini-boss-phase; red orb = advanced/main-boss-phase). All else functions like boss data cards (core p26).

Example — **Fencer Sharron** (advanced): threat 10, health **20**, deck size **5**, heat up **12**, block **1** / resist **1**. Special — *Counter Slash*: "If Sharron suffers three or more damage during one character activation, she performs two behaviours on her next activation (instead of one)."

### Invader behaviour cards (PDF p9, printed p13)
Like boss behaviour cards with two differences: no dedicated Heat Up cards (on heat up, shuffle in one random remaining behaviour card) and **no arc markings**.
Example face — **Spider Fang Sword Strike**: range 0, dodge 1, move 1 with Node (skull) attack icon, physical damage 6.

### Starting an invaded encounter (PDF p10, printed p14)
- Enter a tile with a token beside it → set up the encounter normally, then flip the token. Blank → return it to the blank pool. Invader → fetch that invader's miniature, data card, behaviour cards, **treasure card**, and Health dial (set to starting Health); token back to the box.
- Placement: invader fights ALONGSIDE the other enemies. Place on the tile's **centre node** if unoccupied; otherwise on any unoccupied node **at least two nodes away from the entry nodes** beside the door the party entered from.
- Behaviour deck: random standard behaviour cards equal to data card deck size; shuffle face down.
- Heat up at threshold: shuffle in one random unused behaviour card. Some invaders have special rules altering activation or heat up — check the data card.
- Empty deck at start of its activation → recycle discard unshuffled.

### Defeating an invader (PDF p11, printed p15)
- On killing the invader: IMMEDIATELY add the invader's treasure card to the inventory and IMMEDIATELY add **three soul tokens to the soul cache**, even if other enemies remain.
- If the party is defeated first: remove the invader; it will NOT return this game — its treasure is missed.

---

## SUMMONS (white-phantom NPC allies)

### Summon data cards (PDF p12, printed p6)
Opt-in at game start. Summons are temporary allies (white phantoms). Data card fields: name, **Taunt Level** (like characters, not threat — used for enemy targeting, core p25), starting health, **Block / Resist / Dodge values** (dice, like characters — they ROLL against boss damage), special ability, **Mini or Main Boss Summon icon** (black starburst = mini boss version, orange = main boss version), set symbol.
- Special abilities: some are ongoing; others once per encounter (cover with a wound token as used-marker).

Example — **Lucatiel of Mirrah**: taunt 0, health **9**, block 0, resist 0, dodge **3**, special — *Saving Grace*: "Once per encounter, you may reroll one of Lucatiel's dodge dice."

### Summon behaviour cards (PDF p13, printed p7)
Like boss behaviour cards with three differences: summons never heat up (no Heat Up symbols); no arc markings; **no Dodge difficulty** (bosses never dodge).
Example face — **Slashing Advance** (Lucatiel): range 0, repeat x2, move 1, attack damage 1.

### Earning a summon — Ending an encounter beside the Fog Gate (PDF p13, printed p7)
After defeating the encounter on the tile with the Fog Gate token, the party chooses: take the normal souls reward, OR take **zero souls** and summon an ally for the upcoming boss encounter. If they choose zero souls: place the five corresponding summon data cards face down beside the Fog Gate (use the five mini-boss-back cards before a mini boss, the five main-boss-back cards before a main boss).

### Starting a boss encounter with a summon (PDF p14, printed p8)
- Set up the boss encounter normally, then shuffle the five set-aside summon data cards and draw one — that's the ally. Set its Health dial; place its miniature on an entry node as if it were a character.
- **Summon activation after EVERY character activation.** Example order with 2 characters: 1. Boss, 2. Assassin, 3. Summon, 4. Boss, 5. Knight, 6. Summon. (Summons activate more often than individual characters but have fewer options.)
- Summon behaviour deck = ALL FOUR of its behaviour cards shuffled together (no random subset).
- Summons are partially deck-controlled, partially player-positioned: use them to soak hits or attack weak arcs; like characters they gain an additional black die attacking a weak arc.
- Empty summon deck at start of a summon activation → recycle discard face down without shuffling.

### Summon-specific icons (PDF p15, printed p9)
- **Shift icon** (cross with number): the summon may move up to that many nodes; shift icons BEFORE the dice icons move before rolling, AFTER move after rolling (same as weapon shift).
- **Distract icon** (flaming skull): the summon is treated as holding the Aggro token during the next boss activation (don't physically move the token).

### Death of a summon (PDF p15, printed p9)
Remove the model. Summons are not characters — their death does NOT force the party back to the bonfire.

---

## ENGINE NOTES

- Three opt-in modules toggled at game creation: `mimics`, `invaders`, `summons`.
- **Mimics**: per-tile `ambushCard` (treasure|mimic) dealt face down at setup; chest-open intercept flips it. Mimic entity = boss-lite: no arcs (attacks ignore facing), heat-up = move one random unused card into deck, deck recycle unshuffled. Variant selection keyed on `miniBossDefeated`. Rewards: `2x chest treasure draw`. Defeat-persistence flag `mimicDead[tileId]` survives bonfire resets; party wipe returns mimic to its terrain node with re-engage option after re-clear.
- **Invaders**: trigger on ember-token gain; guard `noInvaderTokensInPlay && unexploredTiles > 0`. Deal one face-down token per unexplored tile (1 real + N-1 blanks); reveal on tile entry after normal encounter setup. Spawn placement rule: centre node else >= 2 nodes from entry. Invader activates as an additional enemy alongside encounter enemies (standard threat-level ordering). Kill reward: immediate treasure card + 3 souls mid-encounter. One-shot per game (no respawn on wipe). Per-invader special hooks needed (e.g. Sharron: damage>=3 in one character activation → next activation flips/resolves two behaviour cards).
- **Summons**: fog-gate-encounter reward fork (souls XOR summon). Summon pools: 5 mini-boss summons, 5 main-boss summons; random draw of 1 at boss setup. Turn scheduler: insert summon activation after every character activation in boss encounters. Summon = ally entity with taunt level (enemy targeting must consider summons), rolls block/resist/dodge dice vs fixed boss damage, weak-arc bonus black die, 4-card always-all deck, recycle unshuffled, `distract` status (virtual aggro for next boss activation), shift-move before/after dice, once-per-encounter ability flags. Death: despawn only, no party reset.
- All twelve invader identities, the ten summon identities, and full card faces are NOT in this booklet — data must come from the TTS mod Lua/assets. The booklet gives only Lucatiel, Sharron, and the two Mimics as printed examples.
- Note for parity planning: Old Dragonslayer and Smelter Demon are mini/main BOSSES (see `old-iron-king-digest.md` campaign), not invaders; Eygon and Beatrice are expected to be summon characters (not named in this booklet — confirm from mod assets).
