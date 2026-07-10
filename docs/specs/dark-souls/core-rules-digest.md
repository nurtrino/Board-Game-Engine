# Dark Souls: The Board Game — Core Rulebook Digest

Source: `games/dark-souls/rulebooks/core-rulebook.pdf` (official Steamforged, 40 pages).
Every rule below carries its page reference. This document is the engine's source of truth
for RULES. Card DATA (enemy stats, weapon dice, behaviour cards, class boards) is NOT fully
printed in the rulebook — it must come from the TTS mod's Lua/assets (see AMBIGUITIES at end).

Page map: contents/credits p.2 | intro p.3 | components p.4-7 | setup p.8-9 | tiles/nodes p.10 |
characters p.11 | equipment p.12 | bonfire tile p.13-15 | exploration p.16 | encounter setup p.17-18 |
encounters p.19 | combat basics p.20-21 | character activations p.22-23 | enemy activations p.24-25 |
boss encounters p.26-28 | boss activations p.29-30 | post-game p.31 | campaign p.32-33 |
scenarios p.34-37 | tracking sheet p.39 | icon reference p.40.

---

## 1. Components (p.4-7)

### Characters (p.4)
- 4 classes: **Assassin, Herald, Knight, Warrior**.
- Each has: miniature, player board, **three or four starting equipment cards**, and **ten class-specific treasure cards** (p.4).
- (Starting equipment card names are only shown as photos on p.4 — not legible/transcribable; take from mod data.)

### Enemies (p.4)
- 2x Sentinel
- 3x Silver Knight Swordsman
- 3x Silver Knight Greatbowman
- 2x Large Hollow Soldier
- 3x Hollow Soldier
- 3x Crossbow Hollow
- Each enemy has a miniature and a data card.

### Bosses (p.5)
- **Main bosses:** Dancer of the Boreal Valley; Dragon Slayer Ornstein & Executioner Smough.
- **Mini bosses:** Boreal Outrider Knight, Gargoyle, Titanite Demon, Winged Knight.
- Each boss has: miniature, Health dial, boss data card, deck of behaviour cards, and 2-4 treasure cards.

### Treasure deck (p.6)
- 13x Starting Equipment cards
- 40x Class-Specific Treasure cards (10 per class)
- 60x Common Treasure cards
- 10x Legendary Treasure cards
- 18x Boss Treasure cards
- Card-back types shown on p.6: per-class starting equipment, per-class class treasure, per-class **transposed** treasure, common, legendary, and per-boss treasure (Dancer, O&S, Gargoyle, Titanite Demon, Winged Knight, Boreal Outrider Knight).

### Encounter deck (p.6)
- 12x Encounter Level 1 cards
- 12x Encounter Level 2 cards
- 12x Encounter Level 3 cards

### Dice (p.7)
- 5x Black dice, 4x Blue dice, 2x Orange dice (attack/defence dice), 4x Green Dodge dice.
- NOTE: the rulebook NEVER prints the face distributions of any die. See AMBIGUITIES.

### Gameplay tokens (p.7)
- 1x Aggro token, 1x First Activation token.
- Wound tokens: 6x "1", 3x "3", 1x "5".
- Soul tokens: 10x "1", 5x "3", 3x "5", 1x "8".
- 1x Spark dial.

### Cubes (p.7)
- 32x Damage tokens (red cubes), 32x Stamina tokens (black cubes), 16x Level Up tokens (white cubes).

### Character board tokens (p.7)
- 4x Luck tokens, 4x Heroic Action tokens, 4x Estus Flask tokens, 4x Ember tokens (all double-sided ready/used or full/empty).

### Condition tokens (p.7)
- 5x each: Bleed, Poison, Frostbite, Stagger.

### Terrain & board elements (p.7)
- 1x Fog Gate token, 4x Treasure Chest tokens, 5x Gravestone tokens, 8x Barrel tokens, 20x Trap tokens.

### Board tiles (p.7)
- 1x Bonfire tile, 6x Exploration tiles, 1x Main Boss tile, 1x Mini Boss tile.

---

## 2. Setup (p.8-9)

Game structure: exploration → **mini boss** → reset/second exploration → **main boss** (p.8).

### Initial setup steps (p.8-9)
1. **Tile setup (p.8):** Place Bonfire tile; set Mini Boss and Main Boss tiles aside. Shuffle the six exploration tiles; lay out **four** of them around the Bonfire tile in any arrangement, aligning doorways. Place the **Fog Gate token** on an empty wall portion of the tile farthest (or tied farthest) from the Bonfire tile. Return the remaining two tiles to the box.
2. **Bonfire sparks (p.8):** Set spark dial on the Bonfire tile:
   | Players | Sparks |
   |---|---|
   | 1 | 5 |
   | 2 | 4 |
   | 3 | 3 |
   | 4 | 2 |
   Turn the dial down 1 when the party is defeated in an encounter or chooses to rest. **Once the dial reads 0, characters can no longer rest, and the next time a character is killed, the game is lost** (p.8).
3. **Boss selection (p.8):** Choose the mini boss; set aside its model, Health dial, boss data card, behaviour cards, boss treasure cards.
4. **Encounter cards (p.9):** Separate encounter cards by difficulty level, shuffle each pile. The boss data card lists the difficulty level of each encounter leading up to that boss (its "Encounter Levels"). Draw random encounter cards of those levels; place one **face down** on each exploration tile — lower-level cards nearer the Bonfire tile, higher-level cards farther away.
5. **Characters (p.9):** Each player picks a class; takes model, character board, starting equipment. Armour card → armour slot; other cards → hand slots and/or backup slot. Place one Estus Flask token, one Heroic Action token, one Luck token on each board. Place all character models on the Bonfire tile (collectively "the party"). Place one white Level Up cube in each **Base**-column square hole for Strength, Dexterity, Intelligence, Faith (4 cubes per character).
6. **Treasure deck (p.9):** Shuffle together the common treasure cards + each chosen character's five class treasure cards; place face down on the Bonfire tile's Treasure Deck space. (Only chosen classes' class treasure is included.)
7. **Tokens (p.9):** Sort remaining tokens by type within reach.

### Setup after the mini boss (p.9)
- After defeating the mini boss, redo steps 1 and 2. In step 3, select a **main boss**. Do step 4 with the main boss's encounter levels. Skip step 5 (characters persist).
- Step 6 replacement: ADD to the existing treasure deck: the **five transposed treasure cards per chosen character** plus **five randomly selected legendary weapon cards** (shuffle the 10 legendaries, pick 5). Shuffle the deck.
- After tile re-setup, place characters on the Bonfire tile; they **rest without spending a spark** before continuing (p.15).

### Solo game
- The soul cache starts with **16 soul tokens** in a 1-player game (0 otherwise) (p.13).

---

## 3. Tiles and Nodes (p.10)

- All tiles have one or more **doorways**; doorways connect tiles for party travel (p.10).
- Every tile except the Bonfire tile has **nodes** (circular symbols) — the movement spaces. Node types: **basic**, **spawn**, **terrain** (p.10).
  - Basic nodes adjacent to doorways are also **entry nodes** (characters placed there on entering the tile).
  - Spawn nodes: enemy placement at encounter start. The mini boss tile has a **mini boss spawn node**; the main boss tile has a **main boss spawn node** (p.10).
  - Terrain nodes: terrain feature placement at encounter start.
  - The p.40 reference further distinguishes **primary vs secondary spawn nodes** and **primary vs secondary terrain nodes** (encounter cards reference them by colour).
- **Node movement (p.10):** in an encounter every model is on a node; moving = current node → adjacent node. Adjacent = directly next horizontally, vertically, **or diagonally**.
- **Range (p.10):** counted model-to-model. Range 0 = same node. Range 1 = adjacent or closer. Range 2 = up to two nodes apart, etc. Range ∞ = unlimited, affects any model in the encounter.
- **Node model limit (p.10):** max **3 models per node** (friendly + enemy combined). If a 4th model moves on, players must **push** one of the three already there (p.21).
- **Boss limit (p.10):** max **1 boss model per node**. If a boss moves onto a node containing a boss, push the boss that was there first.

---

## 4. Characters (p.11)

### Character board anatomy (p.11)
1. Name, 2. Illustration, 3. Heroic Action, 4. Equipment Slots, 5. Endurance Bar, 6. Stat Progression, 7. Taunt Level, 8. Heroic Action Token Slot, 9. Luck Token Slot, 10. Estus Flask Token Slot, 11. Ember Token Slot.

- **Heroic Action (p.11):** class-specific limited-use ability usable during encounters. Flip token ready→used on use; unusable until flipped back. Flipped to ready at game start and each bonfire rest. (The actual ability text is per-class board data — from mod.)
- **Stat progression (p.11):** four stats — **Strength, Dexterity, Intelligence, Faith** — each with Base value plus Tier 1/2/3 values (Tier 4 in campaign, p.33). Stats gate equipment by minimum requirements. (Example board legible on p.15 photo, Herald: STR 12/19/28/37, DEX 11/17/26/34, INT 8/12/20/29, FAI 13/22/31/40 — treat as illustrative; take exact per-class values from mod data.)
- **Taunt level (p.11):** used when determining which character an enemy attacks (tie-break, p.24-25).

### Estus Flask (p.11)
- One per character, double-sided full/empty; starts full.
- **During that character's activation**, they may use it to **remove ALL black and red cubes from their endurance bar**. Then flip to empty.
- Refilled only when the party rests at the bonfire.

### Luck token (p.11)
- One per character; starts ready.
- Any character may flip theirs to used to **reroll one die in their attack, block, or dodge roll**.
- All flipped back to ready on bonfire rest; can also be individually restored at the Firekeeper for 1 soul (p.15).

---

## 5. Equipment (p.12)

### Equipment card anatomy (p.12)
1. Name, 2. Illustration, 3. Actions, 4. Card Type, 5. Equipment Slot, 6. Range, 7. Stat Requirements, 8. Block, 9. Resist, 10. Dodge, 11. Upgrade Slots, 12. Set Symbol.

- **Actions**: attacks or special effects used in encounters (p.22).
- **Card type** icon: starting equipment / common treasure / class treasure / etc. (p.9).
- **Slots (p.12):** Armour cards → armour slot (exactly one armour card, p.14). One-handed weapons → left OR right hand slot. **Two-handed weapons → either hand slot and require the other hand slot to be empty.** A character holds up to **three weapon cards total**; weapons not in hand slots go to the **backup slot** (the only slot that can hold more than one weapon). Backup weapons provide swap options during encounters (p.22).
- **Range**: base attack/assist range; individual actions may override it (p.12, p.23).
- **Stat requirements**: must be met or exceeded to use the card (p.12).
- **Block / Resist / Dodge values**: dice granted for defence rolls (p.25).
- **Upgrade slots**: 0, 1, or 2 (p.12).

### Equipment modifiers (p.12)
- Some cards add/subtract a fixed value to/from the die roll. Example: Estoc 3-Stamina attack = 3 black dice **-1**; rolling 2+1+blank = 2 final damage.

### Upgrade cards (p.12, p.14)
- Upgrades are equipment cards that attach beneath a weapon/armour card, rules visible.
- Weapon upgrades attach to weapons; armour upgrades to armour.
- Installed at Blacksmith Andre, **no soul cost** (p.14).
- **Armour upgrades can be freely added/removed. Weapon upgrades are PERMANENT — never removable** (p.14).
- When equipping an upgraded weapon from the inventory, the character must meet **both** the weapon's and the upgrade's stat requirements (p.14).
- Examples (p.14): Morning Star + Titanite Shard (+1 damage, 1 slot, now full, shard permanent); Sunless Armour + Chloranthy Ring (removable, 2 slots so a second upgrade could be added).

### Embers (p.12)
- Finding an Ember card in the treasure deck → place an Ember token on one character's board.
- While embered: **if that character suffers 3 or more damage from an attack, reduce the damage by 1.**
- **When the party is DEFEATED in an encounter and forced to rest, discard all Ember tokens** (voluntary rest does not discard them).
- Max one Ember token per character. If an Ember card is drawn while everyone is embered: shuffle it back into the treasure deck and draw a replacement **without spending an additional soul**.

---

## 6. The Bonfire Tile (p.13-15)

- Home base; the party may return to it **any time they are not in an encounter** (p.13). No nodes; never an encounter location.
- Features (p.13): 1. Bonfire (holds spark dial), 2. Treasure Deck space, 3. Inventory (spare equipment pile), 4. Soul Cache, 5. Blacksmith Andre, 6. The Firekeeper.
- **Souls** are the currency; soul cache starts at 0 (16 solo) (p.13).

### Blacksmith Andre (p.14) — available when the party returns to the bonfire between encounters
- **Purchase treasure:** remove 1 soul from the cache → draw + reveal top treasure card. Any character meeting stat requirements may equip it; otherwise it goes to the inventory. Unlimited purchases while souls last.
- **Change equipment:** ONLY at Andre. Move any weapon/armour between character board and inventory (respecting stat requirements, 1 armour + up to 3 weapons).
- **Upgrade equipment:** free (no souls). Armour upgrades removable; weapon upgrades permanent (see §5).

### The Firekeeper (p.15)
- **Level up:** spend souls to raise ONE stat one tier. Per stat, per character, individually:
  | Upgrade | Cost |
  |---|---|
  | Base → Tier 1 | 2 souls |
  | Tier 1 → Tier 2 | 4 souls |
  | Tier 2 → Tier 3 | 8 souls |
  (Full table transcribed; example on p.15: STR+DEX to T1 = 2+2, FAI to T3 = 2+4+8=14, total 18 souls.)
- **No respec rule exists in the core rulebook** — leveling is one-way; there is no rule for refunding or reallocating tiers.
- **Restore luck:** spend 1 soul to flip that character's Luck token to ready.

### Resting at the bonfire (p.15)
- Forced when the party is defeated in an encounter; optional any time the party is on the Bonfire tile.
- Effects, in order:
  1. Turn the spark dial down one number.
  2. Flip all Estus Flask tokens to filled.
  3. Flip all Heroic Action tokens to ready.
  4. Flip all Luck tokens to ready.
  5. Turn ALL encounter cards face down (all encounters reset — enemies respawn, souls farmable again).
- After the post-mini-boss re-setup, the party rests **without using a spark** (p.15).

---

## 7. Exploration (p.16)

- **Win condition: the party defeats the main boss** (p.16, p.28).
- The party moves tile to tile through doorways. Entering a tile with a face-down encounter card: flip it face up → encounter begins (p.16).
- The party moves freely through tiles whose encounter cards are already face up (cleared) (p.16).
- **Fog Gate (p.16):** after defeating the encounter on the Fog Gate tile, the party may enter the boss encounter immediately or keep exploring; they may enter it at any time they are not in an encounter. If they rest, that tile's encounter resets and they must fight back to the Fog Gate.

---

## 8. Encounter Setup (p.17-18)

### Encounter card anatomy (p.17)
1. Name, 2. Enemy Spawn, 3. Terrain Spawn, 4. Trap Icons, 5. Difficulty Level (1/2/3), 6. Set Symbol.
- Enemy spawn: model quantities/types per spawn node (some encounters use only a single spawn node). Fetch matching enemy data cards.
- Terrain spawn: which terrain tokens on which terrain nodes.
- Trap icons present → encounter is trapped (see below).
- Higher difficulty = harder; buy/equip treasure before harder encounters (p.17).

### Terrain (p.17) — one node per terrain feature
- **Gravestones:** block movement. At the start of a boss encounter, the party gains information about the boss (a revealed behaviour card) per gravestone (p.28).
- **Barrels:** placed barrel-side up. Block movement AND pushes, but characters may destroy them: a character can walk, run, or dodge onto a barrel node by spending **1 additional Stamina**; flip to destroyed side (no longer blocks). At encounter end flip all barrels back to intact (p.17).
- **Chests:** placed closed-side up. Block movement. If the party defeats the encounter they may open the chest: flip to opened and immediately draw **two treasure cards**; characters meeting requirements may immediately equip; unequipped items go to inventory. **Once opened, never flipped back to closed — even after resting** (p.17).

### Trap tokens (p.18)
- If the encounter card has trap icons: mix all 20 trap tokens face down; place one face-down token on **each basic node EXCEPT basic nodes along a wall that has a doorway**.
- First time a character moves onto a node with a face-down trap token, flip it. Blank = nothing. Otherwise the character must **suffer the damage or attempt to dodge** (p.22/25). **Trap damage cannot be blocked.**
- Traps don't reset during an encounter and won't trigger again that encounter. At encounter end flip all trap tokens face down **without moving them off their nodes**.
- Traps have no effect on enemies and cannot be triggered by them.
- (Damage value / dodge difficulty printed on each token, not in the rulebook — from mod data.)

### Setup example (p.18)
- Party enters from bottom doorway; "The Forgotten" card: 2 Hollow Soldiers on top-left spawn node, Silver Knight Greatbowman on lower-right spawn node, barrel on lower-left terrain node; trapped → traps on the four basic nodes not adjacent to the bottom/right walls (those walls have doorways); characters placed on any node along the bottom edge.

---

## 9. Encounters (p.19)

### Starting
- After spawning enemies/terrain/traps, place characters on the **entry nodes beside the door aligned with the tile the party moved from** (max 3 models per node) (p.19).
- Choose which character **led the way** → place the **Aggro token** on that character (p.19).

### Activation order (p.19)
- Alternating: enemies ALL activate together, then ONE character activates. Pattern with 3 characters: enemies → char A → enemies → char B → enemies → char C → repeat.
- **Enemies activate first** in each encounter.
- Very first character activation of the game: players pick any character. Thereafter character order proceeds **clockwise around the table**.
- When a new encounter begins, the first character to activate is the one who **would have activated next** when the previous encounter ended — tracked by the **First Activation token** (p.19).

### Ending an encounter (p.19)
- **Victory:** all enemies defeated with no character killed. Remove ALL black and red cubes from all characters' endurance bars (full stamina+health reset). Then:
  - Non-boss encounter: add **2 souls per character** to the soul cache.
  - Boss encounter: add **1 soul per character for each spark remaining** on the bonfire.
- **Defeat:** ANY character killed → the whole party is defeated. Place all characters on the Bonfire tile; place ALL soul tokens from the soul cache **on the node where the character was killed**. The party must rest (spark -1, encounters reset).
  - To retrieve dropped souls, one character must move onto that node (during the re-fought encounter). If a character dies before retrieval, the dropped souls are **discarded**.
- **Once the party has entered an encounter, it cannot leave until either the party or the encounter is defeated** (p.19). (Campaign "dashing through" is the exception, p.33.)
- Win or lose, give the **First Activation token** to the player next in turn order after the last player who activated (p.19).

---

## 10. Combat Basics (p.20-21)

### Target versus hit (p.20)
- The model defending an attack is the **target**. Most attacks: single target; some target all opposing models on a node; some boss attacks target all opposing models on multiple nodes.
- Characters never target characters; enemies never target enemies.
- A character is **hit** even if damage is reduced to 0 by Block/Resist — pushes and conditions still apply. A **successful dodge means NOT hit** (no damage, no push, no conditions) (p.20, p.25).

### The endurance bar (p.20)
- **10 boxes** shared by Stamina and Health.
- Spending Stamina: add 1 **black** cube per Stamina, filling **from the left**.
- Suffering damage: add 1 **red** cube per damage, filling **from the right**.
- Uncovered boxes = remaining capacity for either.
- **If all ten boxes have cubes, that character is killed and the party is immediately defeated** (p.20). (Black cubes count — you can die from over-exertion meeting damage.)
- Gaining Stamina/Health: remove that many black/red cubes; no effect if none to remove (p.20).

### Enemy data card anatomy (p.20)
1. Name, 2. Threat Level, 3. Attack Range, 4. Dodge Difficulty, 5. Block and Resist Values, 6. Behaviour Icons, 7. Starting Health, 8. Enemy Icon, 9. Set Symbol.
- Threat level → enemy activation order (p.24).
- Attack range = max range of the enemy's attack; dodge difficulty = dodge icons needed to dodge it (p.25).
- Block reduces physical damage suffered; Resist reduces magical damage suffered.
- Behaviour icons: resolved every activation (p.24).
- Starting Health: damage capacity. Track damage with wound tokens next to the model; at damage ≥ Starting Health, remove the model (p.20).

### Pushing (p.21)
- Push movement costs no Stamina.
- **Boss models cannot be pushed** by character movement/attacks; only by another boss moving onto their node (p.21, p.10).
- **Push icon on an attack:** each model hit is pushed to an adjacent node **farther from the attacker**; if several qualify, the players choose.
- **Push icon on enemy movement:** immediately move each character on that enemy's node to an adjacent node chosen by the players; repeat for each node the enemy moves onto (multi-node pushes chain).

### Conditions (p.21)
- Attack with a condition icon → place that condition token on each model **hit**.
- A model can hold only one token of each type (Bleed + Poison OK; two Bleeds not).
- **When a model ends its activation, remove its Poison, Frostbite, and Stagger tokens** (Bleed persists until triggered). All condition tokens are removed at encounter end.
- **Bleed:** when the bleeding model next suffers damage, it suffers **+2 damage**, then remove the token.
- **Poison:** at the end of the poisoned model's activation, it suffers 1 damage.
- **Frostbite:** a character must spend +1 Stamina each time it walks, runs, or dodges. An enemy has the movement value on its Move icons reduced by 1.
- **Stagger:** a character must spend +1 Stamina to use their weapons' actions. An enemy has the damage values on its attack icons reduced by 1.

---

## 11. Character Activations (p.22-23)

### Start of activation (p.22)
1. Gain **2 Stamina** (remove up to 2 black cubes).
2. **Gain the Aggro token** (it moves to the activating character).
3. May swap items between backup slot and hand slots (free, only at this moment).
Then move and attack; then activation ends and the next enemy activation begins.

### Movement (p.22)
- A character may move **before OR after attacking, not both** (all movement grouped on one side of the attack).
- **Walk (0 Stamina):** once per activation, move 1 node.
- **Run (1 Stamina):** any number of times per activation, move 1 node each.
- **Dodge (1 Stamina):** during an enemy's activation, when attacked, move 1 node and roll to dodge (p.25).
- (Example p.22: walk + three runs = 3 Stamina, 4 nodes.)

### Attacks (p.22)
- Up to **one attack with EACH weapon in the hand slots** per activation.
- To attack: target an enemy within range of a weapon → choose one of that weapon's attack options → spend its Stamina cost → roll the dice shown (quantity + colour). **Each pip rolled = 1 damage.**
- Physical damage: subtract target's **Block**. Magical damage (spells/elemental weapons, magic icon): subtract target's **Resist**. If Block/Resist ≥ total, enemy suffers 0 damage.
- Place wound tokens equal to damage; at wounds ≥ Health the enemy is destroyed (remove model + tokens).
- (Example p.22: Shortsword — 0 Stamina: 2 black dice; 2 Stamina: 3 black dice.)

### Weapon/action icons (p.23)
- **Option-specific range:** an attack option's printed range replaces the weapon's base range for that attack.
- **Shift icon:** move up to the shown number of nodes for 0 Stamina; icon before the dice = move before rolling; after the dice = move after rolling. Does not consume/replace walk or run.
- **Node icon:** target ALL enemies on one node within range; one roll compared to each enemy's Block/Resist.
- **Shaft icon** (bows/polearms): cannot be used against targets at Range 0.
- **Repeat icon (xN):** use the entire weapon option N times.
- **Magical damage icon:** attack targets Resist instead of Block.
- Condition icons on weapons inflict conditions (p.21).
- (Example p.23: Dragonslayer Spear — 0 Stamina: 1 black + 1 blue, magical, Shaft; 4 Stamina: 1 black + 2 blue, magical, Shaft; 4 Stamina alt: 2 blue, magical, Shaft, Range 4.)

---

## 12. Enemy Activations (p.24-25)

### Order (p.24)
- Every enemy model activates during each enemy activation.
- Order: **highest threat level first**, descending. **Ties: players choose the order.**
- Non-boss enemies follow their data card's behaviour icons; icons resolve **left to right**. Behaviours may include multiple moves and/or attacks.

### Enemy movement (p.24)
- Movement icon = number of nodes + direction modifiers:
  - **Towards the character with the Aggro token** (aggro-head icon).
  - **Towards the nearest character** (skull icon). Ties for nearest: move towards the aggro holder; **if the aggro holder is not among the tied-nearest, towards the tied character with the higher Taunt level.** Nearest is determined at the **start** of the movement, not per step.
  - **Away from the aggro character** or **away from the nearest character** (same tie-breaks).
- An enemy moving towards a model stops when on its target's node; moving away stops when no node is farther (cornered).
- When two different nodes are equally good, **players choose** which the enemy enters.
- **Push icon on movement:** pushes characters out of its way (p.21). If the push icon includes a number, pushed characters suffer that damage during the push.
- **Movement attacks (p.25):** some movement behaviours include an attack targeting all characters on **each node the enemy moves into** (not the starting node); physical damage; block or dodge as usual; a multi-node move can hit the same character several times.
- (Examples p.24: "move 1 towards nearest, push, 5 damage"; "move 1 away from aggro"; "move 2 towards nearest, pushing through".)

### Enemy attacks (p.25)
- Enemy attack damage is **fixed** (no enemy roll); the defending player rolls to reduce/avoid it.
- Attack types: physical (vs Block dice) and magical (vs Resist dice).
- Targeting icons:
  - **Attack the aggro character**: if out of range, the attack **misses and has no effect**.
  - **Attack the nearest character**: ties → aggro holder; if aggro holder not tied-nearest → higher Taunt level. No character in range → miss, no effect.
  - **Push icon:** each character hit is pushed after the roll resolves.
  - **Node icon:** targets all characters on one node (the nearest character's node or the aggro character's node per the base icon). Each character rolls Block/Resist/Dodge separately. Node out of range → miss.
- **Block/Resist roll procedure (p.25):**
  1. Read the enemy attack's strength and type (physical/magical).
  2. Gather dice equal to the Block icons (physical) or Resist icons (magical) across the character's equipped items (armour + hand slots only).
  3. Roll and sum.
  4. Subtract the total from the attack strength.
  5. Roll ≥ attack value → 0 damage (still hit); otherwise suffer the difference.
- **Dodge roll procedure (p.25):** dodging replaces the Block/Resist roll; all-or-nothing; success = NOT hit (no damage, push, or conditions).
  1. Read the dodge difficulty from the enemy data card (or boss behaviour card).
  2. **Spend 1 Stamina and move 1 node** (the move is "can", i.e. optional; the Stamina is mandatory).
  3. Gather dice equal to the Dodge icons on equipped items (green dodge dice).
  4. Roll.
  5. Dodge icons rolled ≥ dodge difficulty → 0 damage; otherwise hit for **full** damage (no Block/Resist reduction).
- No reroll mechanic exists except the Luck token (one die of an attack, block, or dodge roll, p.11).

---

## 13. Boss Encounters (p.26-28)

### Basics (p.26)
- Two boss types: mini bosses and main bosses. Follow standard enemy encounter/activation rules except as below.

### Boss data card anatomy (p.26)
1. Name, 2. Threat Level, 3. Behaviour Deck Size, 4. Heat Up Point, 5. Block and Resist Values, 6. Special Ability, 7. Encounter Levels, 8. Starting Health, 9. Mini/Main Boss icon, 10. Set Symbol.
- Threat, Block, Resist, Health work as on enemy data cards.
- **Special Ability**: unique per boss, applies for its encounter (e.g. p.26 photo, Dancer "Unpredictable Onslaught: after a heat up behaviour card is drawn and resolved, shuffle the Dancer's behaviour deck").
- **Encounter Levels**: the difficulty levels of exploration encounters leading to this boss (drives setup step 4).

### Behaviour cards (p.27)
1. Name, 2. Attack Range, 3. Dodge Difficulty, 4. Heat Up Symbol, 5. Behaviour Icons.
- Each behaviour card carries its own attack range and dodge difficulty (bosses have none on the data card).
- Cards WITHOUT the Heat Up symbol = starting behaviour cards; WITH it = Heat Up behaviour cards.

### Boss arcs (p.27-28)
- Boss bases are split by an X into four arcs: **front, left, right, back**.
- A boss always **directly faces an adjacent node** (centre of front arc lined up with that node's centre). This divides the tile into four areas; **every node is in at least one arc; nodes on the boundary lines are in BOTH adjacent arcs**.
- **Characters on a boss's node** stand in a specific arc, base-to-base:
  - Moving onto the boss's node: the character stays in the arc they approached from (if they were in two arcs, choose one).
  - Moving or being pushed off the boss's node: must stay in the same arc. If a push has no available node in that arc because of a wall, the character may move to any adjacent node touching the wall.
  - While on the boss's node, a 1-node walk/run step may instead move the character to an **adjacent arc** around the boss. (Example p.28: front→back = 1 Stamina: 0-cost walk + 1 run, i.e. two arc steps.)
  - **Dodging while on a boss's node ignores arc rules: move to any arc or any adjacent node.**
- **Weak arcs (p.28):** boss attacks affect nodes by arc and can leave the boss vulnerable. When a character attacks a boss, look at the **last attack icon on the behaviour card on top of the discard pile**; its arc diagram marks each arc as neutral, attack, or weak. If the character is attacking from a weak arc, the attack gains **one additional black die** — only one bonus die even if the character stands in two weak arcs. A character on an arc-boundary node counts as in both arcs (easier weak-arc access, but targeted by attacks against either arc).

### Starting a boss encounter (p.28)
- Entering the Fog Gate begins the boss encounter.
- **Mini boss: place just the mini boss tile.** **Main boss: place BOTH mini boss and main boss tiles, forming one large rectangular room.**
- Place characters on the entry nodes beside the door (3-model limit). Place the Aggro token on one character (players' choice). Place the boss on its spawn node.
- **Build the behaviour deck:**
  1. Separate standard from Heat Up behaviour cards.
  2. Take **random** standard cards equal to the data card's Behaviour Deck Size (there are more cards than needed — encounters vary between attempts).
  3. **Reveal one random card from the behaviour deck for each gravestone on a tile with a face-up encounter card** (i.e. gravestones in cleared encounters = intel).
  4. Shuffle the behaviour deck face down.
- **Heat up:** when the boss's Health is reduced **to its Heat Up Point or below**, take **one random Heat Up behaviour card and shuffle it into the behaviour deck** (pattern must be relearned). Some bosses' special rules alter how heat up works — check the data card.

### Ending a boss encounter (p.28)
- Mini boss defeated: place that boss's treasure cards **in the inventory**; then reset the play area for main-boss exploration (p.9).
- Main boss defeated: **the players win the game**. Main boss treasure cards are used only in campaign play (p.32).
- (Boss defeat of the party = normal defeat: souls dropped, rest, spark -1; boss Health persists? NO rule preserves boss damage — encounters reset on rest; players "often need to battle these bosses more than once" p.26.)

---

## 14. Boss Activations (p.29-30)

### Overview (p.29)
- At the start of a boss's activation, **flip the top behaviour card** and place it face up on a discard pile beside the deck; resolve its icons left to right.
- **Repeat icon** on a behaviour card: the boss performs its ENTIRE behaviour that many times.
- **When the behaviour deck is empty at the start of a boss activation: pick up the discard pile and turn it face down WITHOUT shuffling** — the attack pattern loops (players can learn it).

### Boss movement (p.29)
- **Moving towards a character:** turn the boss so the centre of its **front** arc faces an adjacent node closer to the target, then move forward onto that node.
- **Moving away:** turn the boss so the centre of its **back** arc faces an adjacent node farther from the target, then back up onto that node **without changing facing**.
- **Target on the boss's own node:** the boss only **turns** in place so its front arc faces that model; it does not move. Characters on the node do **not** move when a boss turns.
- **Moving onto a node containing a character:** place that character base-to-base with the boss at the centre of the arc that was facing the character before the boss moved; the character is now on the boss's node in that arc.
- **Directional shift moves** (reference icons): a boss can move a number of nodes in an indicated direction (forwards/backwards/left/right) WITHOUT rotating — arcs keep orientation.
- **Turn icons:** rotate 90° left or right in place. **Rotate icon:** 180° in place.
- **Leap icon:** remove the boss and place it on its target's node (target = aggro holder or nearest character per icon). Unlimited distance. Facing does not change (keep arc orientation). **All leaps have the Push icon: characters pushed by a leap may be pushed onto ANY adjacent node and are not considered to be in any particular arc.**

### Boss attacks (p.29)
- **Bosses do not turn when attacking** — facing changes only during movement; attacks can whiff entirely based on range/positions.
- Resolved like enemy attacks, plus the boss-only **Area icon**: a multi-node attack; the arc diagram under the attack icon shows the affected arcs; ALL characters on a node in one of those arcs **within the attack's range** are targeted; each rolls Block/Resist/Dodge separately.

### Boss activation example (p.30)
- Card: "move 2 towards aggro holder, Push" then "7 damage, Range 1, nearest character, Push".
- Sequence shown: boss already faces target → pushes both characters on its own node (each pushed within the arc they occupied) → moves; each node entered pushes its occupants (aggro character pushed again, onto the only node in the front arc) → second move; wall leaves no node in the arc, so the character is pushed to an adjacent node along the wall → attack resolves at Range 1 vs nearest with push; a dodging character could move to any adjacent node, a blocking character is pushed farther from the boss.

---

## 15. Post-Game Ritual (p.31)

- Re-sort all cards after a game: encounter cards by level, treasure by type and class, boss materials per boss.

---

## 16. Campaign Rules (p.32-33)

### Concept (p.32)
- Supplementary rule set for multi-session play with gradual progression. Scenarios mirror the video games and are played in recommended order. **Souls, sparks, equipment, and character levels persist for the whole campaign unless spent or lost.**

### Setup (p.33)
- Largely standard, but each scenario section specifies the number and difficulty of exploration encounters (see §17).
- Some areas contain **two or more boss encounters**; the party does **not** gain sparks or reset tiles until the FINAL boss of the area is defeated.

### Adding and dropping players (p.33)
- **Join mid-campaign: costs 1 spark**; new character starts with starting stats/equipment; max sparks recalculated for the new player count.
- **Leaving: party gains 1 spark**; the character's equipment goes to the inventory; max sparks recalculated.

### Dashing through (p.33)
- Party may dash through non-boss encounters: enter the room, set up the encounter normally, enemies activate once (all enemy behaviours resolved); THEN the party may dash: immediately place characters on the entry nodes of a connected tile.
- No souls awarded; **no Health restored — all red cubes stay** on endurance bars. Enemies are removed, the encounter card is turned face down, and the encounter must be fought (or dashed) again on re-entry.

### Sparks (p.33)
- Campaign starts with the standard spark count (§2).
- **Each mini boss / main boss / mega boss defeated: party gains 1 spark** (instead of resetting sparks).
- Sparks purchasable from the Firekeeper: **2 souls per character in the group** per spark, up to the starting maximum (example: 3-player group pays 6 souls, cap 3 sparks).

### Progressing (p.33)
- Killing bosses lights new bonfires opening new areas. **Campaign ends when the party runs out of sparks or the final boss of the scenario is defeated.**

### Campaign bonfire changes (p.33)
- **Andre:** treasure costs **2 souls** per card. Unwanted treasure can be sold back for **1 soul**; sold treasure is discarded and can never be found again this campaign.
- **Firekeeper level-up costs:**
  | Upgrade | Cost |
  |---|---|
  | Base → Tier 1 | 4 souls |
  | Tier 1 → Tier 2 | 8 souls |
  | Tier 2 → Tier 3 | 16 souls |
  | Tier 3 → Tier 4 | 20 souls |
- **Tier 4 exists only in campaign; any stat at Tier 4 has value 40.**

---

## 17. Campaign Scenarios (p.34-37)

### The First Journey (Dark Souls 1) (p.34-35)
- **Section 1 — Undead Burg (p.35):** Bonfire tile; Level 1; Level 1; Level 2; Gargoyle (mini boss); Gargoyle (mini boss).
  - *Both Gargoyles must be defeated back-to-back to receive the Gargoyles' treasure. If defeated by the second Gargoyle, the party must fight BOTH again after returning to the Fog Gate.*
- **Section 2 — Sen's Fortress (p.35):** Bonfire tile; Level 1; Level 1; Level 2; Level 2; Titanite Demon (mini boss).
- **Section 3 — Anor Londo (p.35):** Bonfire tile; Level 2; Level 2; Level 3; Level 3; Level 3; Ornstein & Smough (main boss).

### The Coiled Sword (Dark Souls 3) (p.36-37)
- **Section 1 — High Wall of Lothric (p.37):** Bonfire tile; Level 1 x3; Level 2 x2; Winged Knight (mini boss).
- **Section 2 — Undead Settlement (p.37):** Bonfire tile; Level 1 x2; Level 2 x2; Level 3; Boreal Outrider Knight (mini boss).
- **Section 3 — High Wall of Lothric (p.37):** Bonfire tile; Level 2 x2; Level 3 x3; Dancer of the Boreal Valley (main boss).

### Campaign tracking sheet (p.39)
- Records: scenario in progress, section reached, encounters in use, sparks remaining, souls in cache, inventory; per player: character & name, equipment, Estus ready, Luck ready, Heroic Action ready, Ember token.

---

## 18. Icon Reference (p.40) — transcription

**Encounter cards:** primary spawn node; secondary spawn node; primary terrain node; secondary terrain node; trapped encounter; encounter level 1/2/3; enemy icons (Hollow Soldier, Crossbow Hollow, Large Hollow Soldier, Silver Knight Swordsman, Silver Knight Greatbowman, Sentinel); terrain icons (Treasure Chest, Barrels, Gravestone).

**Enemy statistics:** Threat; Behaviour deck size; Block (vs physical); Resist (vs magic); Starting Health; Heat Up Point.

**Enemy movement icons:** move N nodes in indicated direction; turn 90° right; turn 90° left; turn around (180°); move towards aggro-token character; move towards nearest character; push characters while moving; deal damage while pushing; leap to specified character (nearest or aggro holder).

**Enemy attack icons:** deal physical damage; deal magical damage; attack nearest character; attack aggro-token character; push characters after attack; damage all characters on target node; damage all nodes in specified arcs (Area); neutral boss arc; attack boss arc; weak boss arc.

**Equipment icons:** one-handed weapon; two-handed weapon; armour; upgrade slots; weapon upgrade; armour upgrade; Block (vs physical); Resist (vs magic).

**Character attack icons:** black dice; blue dice; orange dice; deal magical damage; damage all enemies on target node; Shaft (can't attack at Range 0); move indicated number of nodes in any direction (Shift); push affected enemies.

**Other icons:** Taunt; Attack range; Repeat behaviour or attack; Dodge.

**Conditions:** Bleed; Frostbite; Poison; Stagger.

---

## 19. AMBIGUITIES / NOT IN THE RULEBOOK

Data the rulebook does not print (must come from the TTS mod's Lua/card scans, per project policy):
- **Dice face distributions** for black/blue/orange attack dice and green dodge dice. Nowhere in the book. Pull from the mod's dice models/scripts.
- **Per-class data:** stat Base/Tier values, Taunt levels, Heroic Action texts, endurance-bar specifics per class, starting equipment card lists (p.4 says "three or four" cards; card names illegible in photos).
- **All card data:** enemy data card values (threat/range/dodge/block/resist/health/behaviours), boss data values (deck size/heat-up point/special abilities), behaviour card contents, all 36 encounter cards, all 141 treasure cards, trap token damage/dodge values.
- Tier values other than campaign Tier 4 = 40 are board data (Herald example legible on p.15: STR 12/19/28/37, DEX 11/17/26/34, INT 8/12/20/29, FAI 13/22/31/40).

Genuine rule ambiguities to decide (document decisions in engine spec):
- **Dodge movement timing:** procedure lists "spend 1 Stamina and can move 1 node" as step 2, before rolling (p.25). Move appears optional ("can"), Stamina mandatory. Not stated whether the move can wait until after seeing the roll — reading the numbered steps literally: move before roll. Engine: move (optional) then roll.
- **Dodging out of range:** not addressed whether a dodge move that takes the character out of the attack's range/targeted node negates the attack. The steps imply the roll still decides (attack targeting was already resolved). Engine: target lock at declaration; the dodge move does not retroactively cause a miss.
- **Dash through and black cubes (campaign, p.33):** text explicitly keeps red cubes; silent on black cubes. Victory cleanup (p.19) removes both, but a dash is not a victory. Engine decision needed (suggest: keep both — only the red-cube retention is called out because normally cubes clear on encounter end).
- **Estus timing:** "during a character's activation" (p.11) — cannot be used reactively during enemy activations.
- **Aggro at boss-encounter start:** "place the Aggro token on one of the characters" (p.28) — players' free choice (exploration encounters specify "the character who led the way", p.19, also effectively player choice).
- **Enemy movement/targeting ties are PLAYER choice** at every level: equal threat order (p.24), equally-close movement nodes (p.24), push destination choice for enemy-movement pushes (p.21). Attack-target ties resolve aggro → higher taunt (p.24-25) with no rule for a taunt tie (engine: player choice).
- **Boss Health persistence between attempts:** not explicitly stated; resting resets encounters (p.15) and p.26 says bosses are usually fought multiple times — engine: boss resets to full Health (dial) each attempt; behaviour deck rebuilt per p.28.
- **"Mega boss"** (p.33) refers to expansion content; core has none.
- p.38 is blank; p.1 is the cover.

---

## ENGINE NOTES — state and actions the engine must track

### Global / session state
- `playerCount` (1-4) → `sparksMax` {1:5, 2:4, 3:3, 4:2} (p.8); campaign spark purchase cap = starting max (p.33).
- `sparks` (dial value); decrement on rest/defeat; at 0: resting disabled, next character death = game over (p.8).
- `soulCache` (int); init 0, or 16 solo (p.13); +2/character on non-boss victory; +1/character/spark on boss victory (p.19).
- `droppedSouls` {amount, tileId, nodeId} — set on party defeat; picked up when a character enters the node; discarded on a second death before pickup (p.19).
- `phase`: bonfire (shop/level/rest/travel) vs encounter vs bossEncounter (p.13, p.19, p.28).
- `gameStage`: pre-mini-boss / post-mini-boss (drives treasure deck injection + re-setup, p.9).
- `treasureDeck` (shuffled list), `inventory` (list of cards, incl. attached upgrades), per-boss treasure sets.
- `firstActivationToken` → seat index; clockwise character order; alternation cursor (enemiesNext vs whichCharacter) (p.19).
- Win flag: main boss defeated (p.16/28). Loss: character killed with sparks == 0 (p.8).

### Map state
- Tile graph: 4 exploration tiles (random of 6) + bonfire, doorway adjacency; fogGate wall position (farthest tile) (p.8).
- Per tile: encounterCard (id, level), faceUp flag (reset all face-down on rest, p.15).
- Node graph per tile: coordinates, 8-way adjacency (incl. diagonal, p.10), node type (basic/entry/spawn-primary/spawn-secondary/terrain-primary/terrain-secondary/bossSpawn) (p.10, p.40).
- Node occupancy list; enforce 3-model cap with forced push; 1-boss-per-node cap with boss push (p.10).
- Terrain per node: gravestone (blocks movement), barrel {intact|destroyed} (blocks movement+push while intact; +1 Stamina to enter & destroy; reset intact at encounter end), chest {closed|open} (blocks movement; open on victory → draw 2; never re-closes) (p.17).
- Trap tokens per basic node (excluding doorway-wall nodes): {faceDown|revealed}, value; trigger on first character entry; dodge-or-suffer, unblockable; reset face-down at encounter end without repositioning (p.18).

### Character state (per player)
- Class id → board data: stats {STR, DEX, INT, FAI} × tier values, taunt level, heroic action def (mod data).
- Stat tiers: 0-3 (0-4 campaign); level-up costs [2,4,8] standard, [4,8,16,20] campaign; Tier-4 value = 40 (p.15, p.33). No respec.
- Endurance bar: 10 slots; `stamina` (black, fills left), `damage` (red, fills right); dead when stamina+damage ≥ 10 → immediate party defeat (p.20).
- Tokens: estus {full|empty} (activation-only; clears all cubes), luck {ready|used} (reroll 1 die in attack/block/dodge, any time those rolls occur), heroicAction {ready|used}, ember {none|held} (damage ≥3 from an attack → -1; discarded only on forced rest) (p.11, p.12).
- Equipment: armourSlot (1), handL, handR (two-handed occupies one hand and requires the other empty), backupSlot (weapons only, unlimited within 3-weapon total cap); weapon count ≤ 3 (p.12, p.14). Equipment changes only at Andre; hand↔backup swap free at activation start (p.14, p.22).
- Per-card: actions (stamina cost, dice pool by colour, flat modifier, range/override, icons: magical/node/shaft/shift-before/shift-after/repeat/push/condition), block/resist/dodge icon counts, stat requirements, upgrade slots + attached upgrades (weapon upgrades permanent) (p.12, p.23).
- Conditions on character: bleed/poison/frostbite/stagger (one each). Frostbite: +1 Stamina per walk/run/dodge; Stagger: +1 Stamina per weapon action; Poison: 1 dmg at own activation end; Bleed: +2 on next damage then clear. Poison/frostbite/stagger clear at own activation end; all clear at encounter end (p.21).
- `walkUsed` flag per activation (walk once free); movement-phase state: moved-before-attack XOR after (p.22).
- Per-activation attack tracking: each hand weapon may attack once (p.22).

### Aggro / targeting
- `aggroHolder`: set at encounter start (lead character / choice at boss start); transfers to each character at the START of their activation (p.19, p.22, p.28).
- Enemy target resolution function: (a) aggro-target attacks: miss if out of range; (b) nearest-target: min node distance, tie → aggro holder if tied, else highest taunt among tied, else player choice; computed at movement start for moves (p.24-25).
- Hit vs dodge distinction: hit applies push/conditions even at 0 damage; successful dodge = not hit (p.20, p.25).

### Enemy state (per model in encounter)
- Type id → data card (threat, range, dodgeDifficulty, block, resist, health, behaviour icon program) (mod data).
- Wounds (remove at wounds ≥ health); conditions (frostbite: move value -1; stagger: attack damage -1) (p.20, p.21).
- Enemy activation: all models, threat desc, ties player-ordered; behaviour program left→right; movement w/ push (+optional push damage) chaining per node entered; movement attacks hit every node entered except start (p.24-25).

### Defence resolution
- Block roll: sum(block dice from armour+hand items) vs fixed attack damage; damage = max(0, atk - roll); always "hit" (p.25).
- Resist roll: same with resist dice vs magical attacks (p.25).
- Dodge: cost 1 Stamina, optional 1-node move, roll dodge dice, success iff dodgeIcons ≥ difficulty; failure = full damage (p.25).
- Luck reroll hook on any single die of attack/block/dodge (p.11).
- Ember damage reduction hook (attack damage ≥ 3 → -1) (p.12).
- Trap damage: dodge-only, unblockable (p.18).

### Boss state
- Boss id → data card {threat, deckSize, heatUpPoint, block, resist, health, specialAbility, encounterLevels, isMini} (mod data).
- Health dial; heat-up trigger at health ≤ heatUpPoint: shuffle 1 random heat-up card into remaining deck (once; special abilities may modify) (p.28).
- Behaviour deck: random subset of standard cards (size = deckSize); discard pile; on empty at activation start, flip discard face-down UNSHUFFLED (pattern loop) (p.28, p.29).
- Gravestone intel: at boss setup, reveal 1 random deck card per gravestone on tiles with face-up encounter cards (p.28).
- Boss position + **facing** (N/E/S/W toward an adjacent node); arc partition of the tile (front/left/right/back; boundary nodes in both arcs) (p.27).
- Characters sharing the boss's node carry an `arc` attribute; arc preserved entering/leaving/pushed; 1-node walk/run step may move between adjacent arcs; dodge from boss node = any arc or any adjacent node; push blocked by wall in-arc → any adjacent wall-touching node (p.28, p.30).
- Weak-arc bonus: on character attack vs boss, read last attack icon of top discard card; attacker in a weak arc → +1 black die (max once) (p.28).
- Boss movement ops: moveToward (rotate front to closer node, step forward), moveAway (rotate back to farther node, step back, facing unchanged), turnInPlaceToTargetOnOwnNode, directional shift (no rotation), turn90L/90R, rotate180, leap (teleport to target's node, facing unchanged, push-to-any-adjacent, no arc for pushed) (p.29).
- Boss attack ops: never rotate on attack; single-target / node / Area (arc set + range, each character defends separately) (p.29); per-card attackRange + dodgeDifficulty (p.27).
- Bosses immune to character pushes (p.21).
- Boss encounter tiles: mini = mini tile; main = mini+main combined room (p.28).

### Campaign-mode overlay (optional rules)
- Persistent save: souls, sparks, equipment, levels, scenario/section cursor, discarded-forever treasure list, encounter cards in use (p.32-33, p.39).
- Scenario definitions (§17 lists), multi-boss areas (no spark/tile reset until final boss), double-Gargoyle back-to-back rule (p.35).
- Cost table overrides (treasure 2, sellback 1 + permanent discard, level 4/8/16/20, Tier 4), spark gain +1 per boss, spark purchase 2 souls × party size, join/leave spark adjustments, dash-through action (after first full enemy activation; exit to connected tile; no souls; keep red cubes) (p.33).
