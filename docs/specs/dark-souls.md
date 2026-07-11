# Dark Souls: The Board Game - Port Spec

Source: TTS workshop **1210887127** "Dark Souls The Board Game With Official
Add Ons, Darkroot Expansion, Four Kings, Old Iron King and Black Dragon
Kalameet". The mod is a **dumb table**: the Global Lua is the stock template
and no object carries a script (scout/SCOUT.md). All rules come from the seven
official rulebooks staged at `games/dark-souls/rulebooks/`, digested with page
refs in `docs/specs/dark-souls/*.md`. All card DATA comes from the mod's sheet
images, transcribed into the goldens at `games/dark-souls/golden-draft/`.

**Precedence: goldens > digests > rulebook photos.** The digests were written
from rulebook scans before the card sheets were transcribed; where they
disagree, the golden is right.

## 0. Corrections to the digests (locked, do not re-litigate)

1. **Core digest section 12 icon glosses are INVERTED.** The correct key
   (enemies.json `_meta.iconKey`, calibrated against core p.40): **skull icon
   = target/move toward the AGGRO-token holder**; **ornate ring = nearest
   character**; **(o) node dot = damage all models on the target node**.
2. **Regular enemies have NO behaviour decks.** Behaviour is printed on the
   data card and resolves left to right every activation (core p.24;
   enemies.json `_meta.rules`). Only bosses, invaders, mimics, and summons
   have decks.
3. **This mod contains only 2 of the 12 invaders**: Kirk, Knight of Thorns
   (standard) and Longfinger Kirk (advanced). The other 10 named in the
   add-ons digest have no minis, cards, or decks anywhere in the save
   (enemies.json `_missingFromMod`).
4. **Undrawable level 4 encounter cards.** Five of the twelve L4 cards in
   encounters.json spawn `UNKNOWN` enemies from sets absent from the mod
   (hall-of-wraiths, new-londo-ruins, fortress-gates, blazing-furnace,
   royal-woods-passage). Per the official rule (mega-boss inserts p.7: "if a
   revealed L4 card requires components you don't own, randomly draw a
   different one") the engine must treat any L4 card with unresolvable spawns
   as **undrawable** and redraw. The task brief counted 6; the golden marks 5.
   Trust the golden; flagged below as an open question.
5. **Encounter cards are v1 pictographic**: no trial text, no party-size
   scaling, no printed rewards. Rewards are rulebook constants: 2 souls per
   character for L1-3 (core p.19), 8 souls per character for L4 (mega insert
   p.8), 1 soul per character per remaining spark for boss wins (core p.19).
6. **Dice faces** (dice.json, pixel-transcribed from the mod's face sheets;
   never printed in any rulebook):
   - black {0,1,1,1,2,2}
   - blue {1,1,2,2,2,3}
   - orange {1,2,2,3,3,4}
   - dodge: 3 faces with 1 dodge icon, 3 blank (50% per die)

## 1. Scope

Full parity with the contents of mod 1210887127. That is:

- **Core game**: 10 character classes (Warrior, Knight, Herald, Assassin from
  the core box plus Sorcerer, Thief, Deprived, Cleric, Mercenary, Pyromancer
  from the characters expansion; all 10 have boards, minis/standees, starting
  decks, class treasure, and transposed treasure in the mod), 6 core enemies,
  4 mini bosses (Gargoyle, Titanite Demon, Winged Knight, Boreal Outrider
  Knight), 2 main bosses (Dancer of the Boreal Valley, Ornstein & Smough),
  36 encounter cards (12 per level), 70-card main treasure deck, 20-card
  Transmuted Treasure deck, dungeon tile library, dice, tokens.
- **Darkroot expansion**: 7 enemies, 18 encounter cards (6 per level), 15
  treasure cards, main bosses Great Grey Wolf Sif and Knight Artorias.
- **Mega bosses**: The Four Kings, Old Iron King, Black Dragon Kalameet, each
  with its arena board, 4 L4 encounter cards, behaviour deck(s), and 2
  treasure cards. Shared mega-boss framework implemented once.
- **Add-on content actually present**: invaders Kirk + Longfinger Kirk (plus
  the invasion-token economy), Hungry and Voracious Mimics (plus Mimic?
  ambush tokens), summons Eygon of Carim and Witch Beatrice, extra bosses Old
  Dragonslayer (mini) and Smelter Demon (main), Blacksmith Andre and
  Firekeeper NPC minis (bonfire dressing).
- **Not in scope** (absent from the mod): the other 10 invaders, the other
  summons, Explorers / Iron Keep / Executioner Chariot / other wave-2 enemy
  sets, and the Pursuer boss. The OIK campaign "Go Beyond Death" depends on
  those sets and cannot ship complete (open question 7).

Treasure golden totals for cross-check (treasures.json, 278 cards): core 70 +
transmuted 20 + darkroot 15; starting equipment 13 across the 4 core classes
(matches core p.6) + 23 across the 6 expansion classes; 5 class treasure + 5
transposed per class x 10 classes; boss treasure 18 core (matches core p.6)
+ 6 darkroot + 5 add-on bosses + 6 mega; 2 invader treasures.

### Create options (SelectGame / lobby)

- **Mode**:
  - *Standard game* (default): exploration -> mini boss -> reset ->
    exploration -> main boss (core p.8). Optional **mega boss finale**
    toggle: after the main boss, run the mega-boss framework (L4 encounter ->
    mega boss) for a chosen or random mega boss.
  - *Campaign*: The First Journey (core p.34-35), The Coiled Sword (core
    p.36-37), Facing the Abyss (darkroot-digest p.10-11), Call of the Abyss
    (four-kings-digest p.14-15, requires Darkroot toggle), Bathed in Flame
    (kalameet-digest p.14-15, appends Section 4 to The First Journey).
    Campaign rules overlay from core p.32-33 applies (persistent progression,
    spark economy, dashing through, campaign shop prices).
  - *One-shot*: a single encounter chain (pick 1-3 encounters by level) plus
    one chosen boss. Fast session for testing and short play.
- **Boss picks** (standard mode): mini boss from {Gargoyle, Titanite Demon,
  Winged Knight, Boreal Outrider Knight, Old Dragonslayer}, main boss from
  {Dancer, Ornstein & Smough, Sif, Artorias, Smelter Demon}, or random.
- **Expansion toggles**: Darkroot encounters (mix mode: *append* or
  *replaceSix* per darkroot-digest p.6), Darkroot treasure (replace 15 random
  core commons, darkroot-digest p.6).
- **Add-on modules** (each opt-in at game start, add-ons digest): Mimics,
  Invaders, Summons.
- **Party size 1-4.** Solo starts the soul cache at 16 (core p.13). Seats
  beyond the human players are CPU characters.
- **Class picks**: each seat picks one of the 10 classes, no duplicates.

## 2. Seat / screen model

Playbook section 5 applies: TV is the shared table, devices hold hands and
take actions, full dark, ig-* HUD, no scrolling on the device.

### TV (board)

- Renders the **active tile in 3D**: the current encounter tile (mod room-tile
  art from the States library), or the boss arena (mini tile, mini+main
  combined room, or mega board per core p.28 / mega insert p.9), or the
  bonfire tile between encounters. Orbit camera, capped tilt (playbook
  section 3 parallax).
- All models are the mod's real assets: class minis (pastebin OBJs), enemy
  minis, boss minis, standees for the flat figures, terrain pieces (chest,
  barrel model, tombstone standees), fog wall model, trap/condition/soul
  tokens.
- During exploration a **map strip** shows the tile layout (bonfire + 4 tiles,
  face-down/face-up encounter state, fog gate position) so the party can pick
  where to travel.
- HUD: whose activation it is (enemy wave vs character), aggro holder, spark
  dial, soul cache, boss health dial (see open question 3), the flipped boss
  behaviour card (name + icons) as the turn banner, kill feed / announcement
  text line, per-character chips (name + endurance summary; tap for full
  stats). TV voices actions, turnovers, and the win (sfx.ts conventions).
- Enemy and boss activations play out as **automated step sequences** on the
  TV (move, push, attack, dice results), paced so the table can follow
  (playbook AI pace).

### Device (one per character)

- **Fixed-frame 3D mat**: the class board rendered with its real art, level-up
  cubes on the stat tiers, endurance bar with black/red cubes, token slots
  (estus, luck, heroic, ember), equipment cards laid out in their slots
  (armour, two hands, backup fan). Non-interactive camera (playbook
  section 5).
- **Encounter controls**: walk / run buttons (stamina-costed, greyed with
  reason when unaffordable or when movement is spent), per-weapon attack
  options (each option a button showing stamina cost, dice, icons; greyed
  when out of range / no stamina / shaft at range 0), estus, heroic action,
  backup swap (only at activation start), End Turn (explicit, owner
  directive).
- **Reaction prompts** (pending-decision queue, playbook section 6.4): when an
  enemy attack targets you, choose **block/resist or dodge** (dodge shows the
  optional 1-node move picker first, then rolls); luck reroll offer after any
  of your attack/block/dodge rolls; push-destination picks; enemy tie-break
  picks (activation order, equally good move nodes) routed to the appropriate
  seat; arc choice when stepping onto a boss node from a boundary node;
  casualty-style choices (which of the three models to push off a full node).
- **Bonfire phase = party management screen**: Andre (buy treasure, change
  equipment between board and inventory, install upgrades), Firekeeper (level
  up a stat one tier with cost preview, restore luck), stash/inventory
  browser, spark dial and rest button (rest is a party decision: host
  confirms), campaign extras (sell treasure, buy sparks), Enter Fog Gate when
  eligible. All costs mirrored client-side and greyed with inline reasons.
- Show deck button (view card sheets), view-whole-hand equivalent (view all
  owned equipment grouped by slot), GameIntro with staged rulebook PDFs.

### Automation

The engine automates **all enemy, boss, invader, mimic, and summon AI**.
Behaviour is deterministic given the seeded RNG plus the player-choice ties
that the rules explicitly hand to the players (core p.21, p.24); those ties
surface as pending decisions, never silent engine picks.

## 3. Rules reference (engine contract)

Cites: core = core-rules-digest.md, dr = darkroot-digest.md, fk =
four-kings-digest.md, oik = old-iron-king-digest.md, kal = kalameet-digest.md,
ao = add-ons-digest.md. Page numbers are the printed pages given in each
digest. Full detail lives in the digests; this section is the binding summary
plus every locked ambiguity decision.

### 3.1 Session structure

- Standard game: tile setup (4 random of 6 exploration tiles around the
  bonfire, fog gate on the farthest tile), sparks {1:5, 2:4, 3:3, 4:2}, pick
  mini boss, deal encounter cards face down by the boss data card's encounter
  levels, lower levels nearer the bonfire (core p.8-9).
- Post-mini-boss reset: redo tiles/sparks, pick main boss, add each chosen
  class's 5 transposed cards + 5 random legendary cards to the treasure deck
  (core p.9; see open question 4 on the legendary pool), party rests free
  (core p.15).
- Win: main boss (or mega boss, if the finale is on) defeated (core p.16,
  p.28; mega insert p.12). Loss: a character dies while sparks are 0 (core
  p.8).
- Mega-boss continuation: after the main boss, box the exploration tiles,
  place the mega board encounter side up off the bonfire, one random drawable
  L4 encounter; on clearing it (one-shot, never resets, 8 souls per
  character) allow Andre/Firekeeper but no exploration and no free rest, flip
  the board, fog gate on the doorway, fight the mega boss (fk p.7-9, shared
  text in oik/kal).

### 3.2 Tiles, nodes, movement

- Node graph per tile, adjacency includes diagonals; range is model-to-model
  node distance; range 0 = same node (core p.10).
- Caps: **3 models per node** (4th forces a player-chosen push of one of the
  three), **1 boss per node** (only a boss displaces a boss) (core p.10,
  p.21).
- Terrain: gravestones block movement (and grant boss intel, core p.28);
  barrels block movement and pushes until destroyed by paying +1 stamina to
  enter (reset intact at encounter end); chests block movement, open on
  victory for 2 treasure draws, never re-close (core p.17).
- Traps: on trapped encounters, one face-down token per basic node except
  nodes along doorway walls; first character entry flips it; suffer or dodge,
  **never blockable**; enemies immune; face-down again at encounter end
  without moving (core p.18).

### 3.3 Encounter flow

- Entering a tile with a face-down encounter card flips it and starts the
  encounter; cleared tiles are free passage (core p.16).
- Setup: spawn enemies/terrain per the card's node rows (encounters.json),
  traps if trapped, characters on entry nodes by the door they came from,
  aggro token on the leading character (players choose) (core p.17-19).
- Activation alternates: ALL enemies act, then ONE character; enemies first;
  character order clockwise from the First Activation token holder; the token
  passes so a new encounter resumes the rotation (core p.19).
- Victory: all enemies dead, clear ALL black and red cubes for everyone, +2
  souls per character (L4: +8, one-shot). Defeat: any character killed kills
  the party; drop the whole soul cache on the death node, everyone to the
  bonfire, forced rest (spark -1, all encounters reset face down, embers
  discarded); retrieve dropped souls by re-entering that node, a second wipe
  before pickup discards them (core p.19, p.15, p.12).
- Once entered, an encounter cannot be left until won or lost (campaign
  dash-through is the only exception, core p.33).

### 3.4 Characters

- Endurance bar: 10 boxes; stamina = black cubes from the left, damage = red
  from the right; all 10 filled = dead = party defeat (core p.20).
- Activation: +2 stamina, take the aggro token, optional backup/hand swap,
  then move and attack with movement grouped entirely before or after the
  attack; walk (1 node, free, once), run (1 node, 1 stamina, repeatable)
  (core p.22).
- Attacks: one attack per hand-slot weapon per activation; pay the option's
  stamina, roll its dice + flat modifier, physical subtracts Block, magical
  subtracts Resist; weapon icons: option range override, shift before/after,
  node AoE, shaft (no range 0), repeat xN, conditions, push (core p.22-23).
- Estus: own activation only, clears all cubes, refills on rest (core p.11).
  Luck: reroll one die of an attack/block/dodge roll; back on rest or 1 soul
  at the Firekeeper (core p.11, p.15). Heroic action: per-class, once until
  rest (core p.11). Ember: -1 damage when suffering 3+, discarded only on
  forced rest, max one each; redundant Ember draw reshuffles free (core
  p.12).
- Equipment: 1 armour, 2 hands (two-handed weapons need the other hand
  empty), backup weapons, 3 weapons total; stat requirements gate use; swaps
  only at Andre except the activation-start backup swap; weapon upgrades
  permanent, armour upgrades removable, upgrades installed free at Andre
  (core p.12, p.14, p.22).

### 3.5 Defence resolution

- Enemy damage is fixed; the defender chooses block/resist (roll dice from
  armour + hand slots, subtract from damage, still *hit*: pushes and
  conditions apply at 0 damage) or dodge (1 stamina mandatory, optional
  1-node move, roll dodge dice vs the attack's dodge difficulty,
  all-or-nothing; success = not hit at all; failure = full damage, no
  reduction) (core p.20, p.25).
- Locked decisions (core digest section 19): dodge move resolves before the
  roll; the dodge move never retroactively causes a miss (target lock at
  declaration); aggro-target and nearest-target attacks with no legal target
  in range simply miss.
- Dodge difficulty 0 (Sif, Artorias cards): auto-success for 1 stamina, no
  dice needed; handle in the resolver (dr p.7).
- Conditions (one token of each type per model): bleed (+2 on next damage,
  then clear; persists), poison (1 damage at own activation end), frostbite
  (+1 stamina per walk/run/dodge; enemies move -1), stagger (+1 stamina per
  weapon action; enemies deal -1); poison/frostbite/stagger clear at the
  bearer's activation end, everything clears at encounter end (core p.21).
  Calamity (Kalameet only): -1 success on block/resist/dodge rolls, cleared
  when the bearer suffers attack damage, persists like bleed, 4-token supply
  cap (kal p.13).

### 3.6 Enemy activations

- Every enemy model acts each enemy activation, highest threat first, ties
  ordered by the players (core p.24).
- Behaviour = the data card's printed icon program, left to right
  (enemies.json; correction 2). Movement targets aggro or nearest per the
  corrected icon key (correction 1); nearest ties break to the aggro holder,
  then higher taunt, then player choice; nearest is computed at movement
  start (core p.24). Push moves shove characters out of the way node by node,
  with optional push damage (dodgeable, per enemies.json `pushDamage`),
  chaining across every node entered (core p.21, p.25).
- Attacks: single target, or node AoE; out of range = whiff (core p.25).

### 3.7 Bosses

- Data card: threat, behaviour deck size, heat-up point, block/resist,
  health, special ability, encounter levels (core p.26; values in
  bosses.json when it lands).
- Behaviour deck: random subset of standard cards of deck size, one card
  revealed per gravestone on cleared tiles, shuffled; flip one card per boss
  activation and resolve left to right; empty deck recycles the discard
  face down **unshuffled** (the pattern loops); repeat icon repeats the whole
  card (core p.28-29).
- Heat up at health <= heat-up point: shuffle in 1 random heat-up card,
  unless the special ability overrides: Sif replaces the entire deck with
  Limping Strike at health <= 3 (dr p.8), Artorias removes 2 random cards
  and adds all 3 heat-up cards (dr p.9), Dancer reshuffles after each
  heat-up card resolves (core p.26 example), OIK buffs all Fire Beam cards
  +1 damage/+1 dodge AND adds a heat-up card (oik p.12), Four Kings never
  heats up normally (fk).
- Arcs: front/left/right/back; facing changes only on movement; boundary
  nodes are in both arcs; characters on the boss node carry an arc, keep it
  when entering/leaving/pushed, may spend movement steps to rotate around
  the boss, and ignore arc rules when dodging; a wall-blocked in-arc push
  goes to any adjacent wall node (core p.27-28, p.30).
- Weak arc: attacking from an arc the top discard's last attack icon marks
  weak grants +1 black die, once (core p.28).
- Boss movement ops: moveToward (rotate front, step), moveAway (rotate back,
  step back, facing kept), turn-in-place at own node, directional shifts
  without rotation, 90/180 turns, leap (teleport to target's node, facing
  kept, push to any adjacent node, no arc assigned) (core p.29).
- Bosses cannot be pushed by characters; boss-only Area attacks hit whole
  arcs within range (core p.21, p.29).
- Boss defeat of the party = normal defeat; boss resets to full health each
  attempt (locked decision, core digest section 19). Mini boss victory puts
  its treasure in the inventory and triggers the main-boss reset; main boss
  victory wins the game (core p.28).

### 3.8 Mega bosses (shared framework + specials)

- Framework: section 3.1 above (fk p.7-9). L4 encounters: doubled spawn and
  terrain rows (primary..quaternary), 4 entry nodes, one-shot, never reset,
  8 souls per character (fk p.8; encounters.json).
- **Four Kings** (fk): 4 kings, 25 health each on separate dials, one shared
  data card and one shared deck (4 random of 8 standard); every in-play king
  performs each flipped card in king-number order; first three deck
  exhaustions trigger Royal Summons instead of recycling (spawn next king on
  the mega spawn node with leap-push, remove 1 random card unseen, add 2
  random cards of that king's 4-card pool, shuffle); afterwards normal
  recycle; zero kings in play = flip a card, every character heals 1, done
  ("Take a Breather"); win when all four are dead.
- **Old Iron King** (oik): 44 health, heat up 22, deck = 3 fixed Fire Beam
  signature cards + 3 random of 6 standard; only 3 legal Iron King nodes,
  the lava area behind them is a permanent wall for movement and pushes;
  Beam icon draws from a separate 6-card Beam deck (teleport OIK to the
  card's movement node with leap-push, magical attack on the card's target
  nodes, recycle unshuffled); Old Iron Rage after heat up: all Fire Beam
  cards +1 damage/+1 dodge persistently.
- **Kalameet** (kal): 38 health, heat up 22 (adds Hellfire Barrage), deck =
  2 fixed signatures (Mark of Calamity, Hellfire Blast) + 4 random of 10
  standard; Strafe icon draws from a separate 8-card Strafe deck (despawn
  Kalameet, magical attack on target nodes, land on the card's landing node
  with push); Mark of Calamity applies the calamity condition (section 3.5).

### 3.9 Add-on modules

- **Mimics** (ao): one face-down ambush card per tile at setup; flip on chest
  open; mimic face swaps the chest for the mimic and starts a boss-lite
  fight (no arcs, heat up shuffles in one random unused card, deck 4 of its
  behaviour cards) from current positions with cubes already cleared; Hungry
  before the mini boss is dead, Voracious after; kill = draws as if opening
  two chests, permanent (`mimicDead` survives resets); party wipe returns
  the mimic to its node, re-engageable.
- **Invaders** (ao): on gaining an ember token with no invader tokens in play
  and unexplored tiles remaining, deal one face-down token per unexplored
  tile (1 invader + blanks; standard invader pre-mini-boss, advanced after);
  reveal on entry after normal setup; spawn on the centre node, else any
  free node 2+ from the entry nodes; fights alongside the encounter enemies
  under normal threat ordering; kill = its treasure card + 3 souls
  immediately; a party wipe removes it for the rest of the game. Only Kirk
  (standard) and Longfinger Kirk (advanced) exist in this mod, so each draw
  is deterministic (open question 5). Kirk specials are in enemies.json
  (Iron Spikes: his pushes inflict bleed; Thorns: attacking Longfinger Kirk
  from his node inflicts bleed).
- **Summons** (ao): after clearing the fog-gate tile the party may take zero
  souls to summon; draw one summon at boss setup; the summon activates after
  EVERY character activation, runs all four of its behaviour cards as an
  always-full deck (recycle unshuffled), has taunt/block/resist/dodge like a
  character (it rolls against boss damage), gains the weak-arc die, supports
  shift and distract (virtual aggro for the next boss activation) icons,
  and despawns on death without ending the encounter. Only Eygon of Carim
  and Witch Beatrice exist in this mod (open question 6).

### 3.10 Campaign overlay

- Persistence: souls, sparks, equipment, levels, scenario/section cursor,
  discarded-forever treasure, L4 completion (core p.32-33, p.39).
- Sparks: +1 per boss killed (no reset); purchasable at 2 souls per party
  member, capped at the starting max; join costs 1 spark, leave grants 1
  (core p.33).
- Shop overrides: treasure 2 souls, sellback 1 soul with permanent discard;
  level-up 4/8/16/20 with Tier 4 = stat value 40 (core p.33).
- Dash through: after one full enemy activation, exit to a connected tile;
  no souls, red cubes kept (black cubes also kept, locked decision, core
  digest section 19); enemies removed and the card flips back face down
  (core p.33).
- Multi-boss areas: no spark gain or tile reset until the area's final boss;
  the double Gargoyle must die back to back (core p.35). Scenario tables:
  core p.34-37, dr p.10-11, fk p.14-15, kal p.14-15 (all transcribed in the
  digests; scenarios.json will hold them). Campaign sections may prescribe
  *named* encounters (Hydra Lake, Fortress Gates, Blazing Furnace) and place
  the mega board off an L3 tile (oik p.14, fk p.14).

## 4. Engine architecture sketch

Lives in `shared/src/darksouls/` (grep `export *` collisions first, playbook
section 6.2). Seeded RNG stream (`seed ^ rolls` hash) for every shuffle and
die.

### State shape

```ts
{
  mode: 'standard' | 'campaign' | 'oneshot',
  options: { darkrootMix, darkrootTreasure, mimics, invaders, summons,
             megaFinale, scenarioId },
  stage: 'preMini' | 'postMini' | 'megaL4' | 'megaBoss',
  phase: 'bonfire' | 'encounter' | 'bossEncounter',
  sparks, sparksMax, soulCache,
  droppedSouls: { amount, tileId, nodeId } | null,
  tiles: [{ id, tileArtId, doorways, encounter: { cardId, faceUp },
            ambushCard?, invaderToken?, l4Completed? }],
  fogGate: { tileId, wall },
  characters: [{ seat, classId, tiers: {str,dex,int,fai},
                 stamina, damage,            // black/red cube counts, sum <= 10
                 estus, luck, heroic, ember,
                 armour, handL, handR, backup: CardId[],
                 conditions, arc?,           // arc only while on a boss node
                 walkUsed, movedSide, attacksUsed }],
  inventory: CardId[],
  treasureDeck: CardId[],                    // shuffled, face down
  encounterDecks: { l1, l2, l3, l4 },
  enemies: [{ typeId, nodeId, wounds, conditions }],
  boss?: { id, health, facing, nodeId, heatedUp, deck, discard,
           beamDeck?, strafeDeck?, kings?: [{health,inPlay}],
           summonsRemaining?, fireBeamBuff? },
  summon?: { id, health, deck, discard, distract, abilityUsed },
  invader?: { id, health, deck, discard, heatedUp },
  aggroSeat, firstActivationSeat, activationCursor,
  pending: { seat, decision }[],             // playbook section 6.4 queue
  campaign?: { scenarioId, section, encountersInUse, discardedForever },
  rolls, lastEvent, winner
}
```

### Action union

Bonfire: `buy_treasure`, `sell_treasure` (campaign), `equip_move` (board <->
inventory), `install_upgrade`, `level_up{stat}`, `restore_luck`, `buy_spark`
(campaign), `rest`, `travel{tileId}`, `enter_fog_gate`, `open_mega_l4`.

Encounter: `walk{nodeId}`, `run{nodeId}`, `attack{hand, optionIdx, targetId |
nodeId}`, `use_estus`, `heroic_action`, `swap_backup{...}` (activation start
only), `end_activation`, `dash_through{tileId}` (campaign), `retrieve_souls`
(implicit on node entry), `open_chest`.

`choose{decisionId, pick}` resolves the pending head; every other action is
rejected while the queue is non-empty. Pending decision kinds: `defence`
(block/resist vs dodge), `dodgeMove`, `luckReroll`, `pushDest`, `nodeOverflow`
(which model leaves a full node), `enemyTieOrder`, `enemyMoveTie`,
`arcChoice`, `treasureEquip` (who takes a drawn/chest card), `summonReward`
(souls vs summon), `leadCharacter` (aggro at encounter start),
`castTarget`-style card choices as class data requires. Enemy/boss AI emits
`{step}` sequences for TV playback and pushes decisions only at the
rules-mandated player-choice points.

### Invariants (test suite, playbook section 6.3)

- Card conservation: treasureDeck + inventory + equipped + attached upgrades
  + discarded-forever = the built deck, after every action; encounter decks
  conserve per level; each behaviour deck + discard + revealed = its built
  size; beam/strafe decks conserve.
- Endurance bounds: 0 <= stamina + damage <= 10 per character; death fires
  exactly when the sum hits 10.
- Node caps: never more than 3 models on a node, never 2 bosses; every model
  is on exactly one node of the active tile.
- Aggro: exactly one holder among characters (plus a `distract` override flag
  during summon play, never both applied).
- Sparks 0..sparksMax; souls never negative; droppedSouls xor soulCache holds
  the wiped amount.
- Unshuffled recycle preserves discard order exactly.
- Trap tokens keep their nodes across an encounter reset.
- Boss health within 0..starting; heat-up fires at most once (except
  documented overrides); Four Kings summonsRemaining 3 -> 0 monotonic.

Bot goal (so playthroughs terminate): level toward the class's primary stat,
buy/equip strictly better gear, clear toward the fog gate, enter the boss
when the party is topped up. Directed tests: one per rule in section 3
(icon-key targeting, tie-breaks, dodge-0 auto success, ember reduction,
bleed/calamity stacking, node overflow push, arc rotation costs, weak-arc
die, unshuffled recycle loop, Sif cooldown, Artorias heat-up override, Royal
Summons, Take a Breather, OIK lava wall + beam indirection, strafe despawn,
mimic variant select, invader spawn placement, summon scheduler, campaign
dash-through, undrawable L4 redraw).

## 5. Data pipeline

Goldens (all mirrored into `shared/src/darksouls/` when the engine lands):

- `dice.json` - done (draft).
- `enemies.json` - done (draft): 13 regular enemies + 2 invaders with full
  data-card values and behaviour programs.
- `encounters.json` - done (draft): all 66 encounter cards (36 core, 18
  Darkroot, 12 L4) with spawns, terrain, traps, rulebook-constant rewards,
  UNKNOWN markers for absent-set spawns.
- `treasures.json` - done (draft): 278 cards with slots, requirements,
  actions, defence dice, upgrade slots, deck grouping.
- `bosses.json` - **pending** (may land mid-implementation): data cards +
  full behaviour decks for the 11 bosses, 2 mimics, 2 invader decks (already
  in enemies.json), 2 summons. Include it the moment it exists; the digests
  hold only the printed example faces.
- `classes.json` - **to produce**: per-class stat Base/T1/T2/T3 values, taunt
  level, heroic action text, starting equipment card ids (already grouped in
  treasures.json `starting-*`), endurance bar (10 for all, verify), board art
  mapping. Transcribe from the 10 class-board tiles.
- `tiles.json` - **to produce**: the node graph per room tile face (node px
  coordinates, 8-way adjacency, node types basic/entry/spawn x4/terrain x4/
  boss spawn/Iron King nodes, walls, doorways), plus beam/strafe card node
  mappings. The mod is a dumb table so NO graph exists anywhere; transcribe
  from tile art and verify by overlay (playbook section 2.4: draw every node
  and edge over the art, inspect quadrant by quadrant). Map situation is
  playbook section 3B: node coordinates live in the art's own pixel space,
  no homography.
- `scenarios.json` - **to produce** from the digests: campaign section tables,
  named-encounter constraints, mega board placement rules.

`tools/tts-extract/extract-dark-souls.mjs` must stage to
`client/public/darksouls/` + `scene.json`:

- **Tile images including States variants.** The room library hides in six
  States-chained Custom_Tiles (20/8/8+nested-8/8/7/6 states, one nested
  States object); the extractor must walk `States` recursively or it misses
  most of the library (scout). Also the backdrop board `a7ea11`, the Tiles /
  Boss Tiles / Mega Boss Tiles bags (both faces of the mega board), and the
  Fog Wall model.
- **Minis: meshes + textures.** Class minis are pastebin-hosted OBJs with
  deviantart diffuses; enemy/boss minis are Custom_Models on the Steam CDN;
  flat figures (Eygon, Beatrice, Kirk x2, tombstones) are Figurine_Custom
  images. `download-mod-assets.mjs` only rewrites the dead Steam host;
  **extend the fetch step to Google Drive (632 refs) and pastebin (44 refs)
  and verify early that they still resolve** - this is the port's biggest
  asset risk (scout).
- **Card sheets**: 16, 18, 19, 20, 21, 23, 24, 25, 26, 463-465, 468-482
  (10-wide grids; cell = CardID % 100). 554 of 575 cards are nameless; the
  goldens carry the cardID -> identity mapping.
- **Dice**: the four face-sheet images (Drive-hosted; guids f82a35, 25a9ad,
  217a7d, 3e4967) for 3D dice rendering.
- **Health-dial assets**: the double-sided dial tile (#7cb5fc), knob model,
  and the mega-boss dial mats, per the "Dial Instructions" notecard
  (including the note "use the Ornstein dial for the Corrupted Dragon Slayer
  mini boss"). Wanted whether or not the TV uses a literal dial (open
  question 3).
- **Tokens/terrain**: condition tokens, soul/wound stacks, trap tile, chest
  (normal + mimic variants + Mimic? tokens), barrel model + tile stack,
  invasion tokens, aggro/first-activation pair, ember, calamity, spark/
  bonfire, class boards + healthbar tiles.
- **Rulebooks**: the mod has zero PDFs (scout); stage the seven PDFs already
  at `games/dark-souls/rulebooks/` and link them from GameIntro.
- Extractor must be idempotent (playbook section 2.4) and assert counts:
  66 encounter cards, 278 treasures, 48 dice, deck DeckIDs == contained
  cards, every golden cardID resolves to a staged sheet cell.

## 6. Ship gates (playbook section 6.4b, tailored) and open questions

### Gates

1. **Rulebook UI-coverage audit** across all seven books (core, Darkroot,
   three mega inserts, add-ons, characters expansion). Every player decision
   must have a named home on a screen; special attention to the reaction
   layer (block-vs-dodge choice, optional dodge move, luck reroll timing,
   push destinations, arc choices, tie-break order picks, summon-vs-souls
   fork, chest opening, dash-through). Reverse audit: any engine action or
   `choose` kind the device never sends is a gap.
2. **UI-driven full game**: `tools/verify/darksouls-ui-smoke.mjs`, 4 seats via
   puppeteer clicking the real device DOM through a full standard game
   (exploration -> mini boss -> reset -> main boss), plus a second scripted
   run covering one mega boss (framework path) and one run with all three
   add-on modules on. A stall is a finding.
3. Standard checks: engine test suite green at party sizes 1-4, WS smoke
   driver, page-errors clean, build + client typecheck, overlay diagnostic
   for every tile's node graph.

### Open questions for the owner (flagged, not blocking)

1. **Campaign save persistence across rooms.** Rooms are saves, so a campaign
   naturally lives in one long-lived room. Is that acceptable for a
   multi-session campaign (players re-join the same room across weeks), or do
   you want an explicit campaign export/import between rooms (the physical
   game's p.39 tracking sheet)? Proposal: one room = one campaign, no export.
2. **Solo mode UX.** Rules support a 1-character party (5 sparks, 16-soul
   cache). Should solo also allow one player controlling 2-4 characters from
   one device (physical-game style), or is 1 player = 1 character + CPU
   teammates enough? Proposal: ship 1 seat = 1 character; CPU fills the rest.
3. **Physical dial fidelity.** The mod builds a manual boss-health dial
   contraption (tile + coin + knob, "Dial Instructions" notecard). Reproduce
   it as the TV's boss health display (authentic object, playbook
   section 4.4), or use a plain HUD bar? Proposal: render the real dial art
   as the TV health display, engine-driven, no manual knob.
4. **Legendary treasure pool.** The rulebook injects "5 random of the 10
   legendary weapon cards" after the mini boss (core p.9), but the mod has no
   marked legendary deck; it has a 20-card "Transmuted Treasure" deck
   (ember-glow icon, `embered: true` in treasures.json). Proposal: treat the
   transmuted deck as this mod's legendary pool and inject 5 random of the
   20; confirm.
5. **Invaders module with 2 of 12 invaders.** Each invasion draw is
   deterministic (Kirk pre-mini, Longfinger Kirk post-mini) and the mod ships
   only 3 invasion tokens (the rule wants one per unexplored tile). Keep the
   module as-is with engine-side virtual tokens, or drop it? Proposal: keep,
   virtual tokens, deterministic identity.
6. **Summons pool with 2 of 10 summons.** The rule shuffles five set-aside
   data cards and draws one; the mod has only Eygon of Carim and Witch
   Beatrice (each a 4-card deck + standee). Proposal: draw 1 of the 2
   regardless of mini/main phase; confirm whether either is phase-locked once
   bosses.json identifies their card backs.
7. **Undrawable L4 count: 5 vs 6.** The brief said 6 L4 cards reference
   absent enemy sets; the golden marks 5 (correction 4). If a sixth turns up
   when the L4 set icons are decoded, the undrawable rule already covers it;
   confirm nothing else should be excluded.
8. **"Go Beyond Death" campaign.** It requires Explorers + Iron Keep enemies
   and the Pursuer boss, none of which are in the mod. Options: hide the
   scenario, or offer a house variant (substitute core/Darkroot encounter
   decks and a different second main boss). Proposal: hide it and note why in
   the lobby blurb.
9. **Mimic-marked chests on L4 cards.** Two L4 cards print mimic-silhouette
   chests (encounters.json `mimic-chest`). If the Mimics module is off,
   treat them as normal chests, or force the module for those cards?
   Proposal: mimic-chests resolve as mimic ambushes even with the module
   off, since the card prints them.
10. **Shears Scarecrow repeat scope.** The x2 repeat icon sits beside the
    attack, but core p.29 defines repeat as the whole behaviour. Proposal
    (already noted in enemies.json): repeat the entire behaviour
    (move + attack twice); confirm against how the card is played in the
    community if it matters to you.

## 7. Decision log (engine v1)

The 27 judgment calls the engine builder made where the goldens/digests were
silent or ambiguous. Numbered for cross-reference from code comments
(`decision log N`). Entries 14 and 17 carry post-v1 updates.

1. Linear tile chain bonfire->t1..t4->fog gate.
2. Main-boss arena = main tile face alone, O&S Smough on highest-degree node adjacent to spawn.
3. Trap token values invented (6 blank, 8x 2dmg/dodge1, 4x 3/1, 2x 4/2).
4. Enemy tie pendings only across different enemy types / meaningful move ties.
5. Obstacle-aware BFS movement, pure node-distance range.
6. Luck rerolls lowest die.
7. Voluntary stamina requires free boxes, unaffordable dodge downgrades.
8. Rest clears endurance bar.
9. Cornered push: stay + damage, Kirk spikes bleed all pushed.
10. Character node-AoE hits enemies only.
11. Text-only card actions rejected v1, upgrade text executes +N damage / gain Bleed only - LARGEST KNOWN GAP (25 spells). — UPDATE (reconciled): all 43 no-dice printed actions now carry a structured `effect` in the treasures golden (the spell DSL): grants (heal/stamina to one / self / all / allOthers / upTo2 / oneNode within printed range), magic-weapon attack buffs ((Great) Magic Weapon: attacks magical this activation, +1 damage on the [2] option), timed defence-dice buffs (Sacred Oath +1 blue block, Magic Barrier +1 blue resist, Stone Greatshield +1 black block, Sunlight Straight Sword party block+resist), condition/push afflictions incl. node-wide (Poison Mist, Force, Aural Decoy, Atonement, Kukris, Dung Pie, shield bashes), shift-only movement (Carthus Curved Sword, Lucerne), and Rapport's direct 3 damage to an enemy sharing a node. Casting shares the attack economy (one use per hand item, grouped movement, same stamina modifiers) and is rejected before payment when no legal target exists; a unique target auto-resolves; real choices go through a `spellTarget` pending (chained second pick with skip for Force / Bountiful Light). Ambiguous glyphs were re-verified against sheet crops: Force prints one/two stagger icons; Atonement's [3] is push + node dot; the crest/large-leather "shield bash" IS the stagger glyph; Sacred Oath's badge is a blue die in a SHIELD frame (block) while Magic Barrier's is a HEXAGON frame (resist). Defence buffs expire per the printed wording — "during the next enemy activation" clears when the enemy phase (or boss activation) ends, "until the next character activation" clears when the next character activation starts — and all buffs clear with the encounter.
12. Shift = free move credits, repeat pays once rolls N, enemy repeat = whole behaviour.
13. Character conditions do not stick to bosses v1. — UPDATE (reconciled): condition tokens now stick to boss units and to the summon. On a boss: bleed = +2 on its next wound then clears, poison = 1 damage at the end of its activation, stagger = -1 damage on its attacks, frostbite = -1 node of movement; poison/frostbite/stagger clear when its activation ends (core p.21 applied 1:1). The Boreal Outrider never gains frostbite/stagger (data card note) — a stagger-only cast at it has no legal target. Bosses are still never pushed by characters. The summon mirrors the same rules (boss attacks apply their printed conditions through its auto-defence; its stagger -1 / frostbite -1 apply to its own attack and Shift; ticks resolve at the end of the boss activation round).
14. OIK beam/Kalameet strafe approximated by bands. — UPDATE (reconciled): the goldens now carry exact per-card node lists for OIK's 6 Blasted Nodes and Kalameet's 8 Fiery Ruin cards (`{tile, nodes[], dpadNode}`, `bosses.json _meta.resolved`); the engine consumes them directly (`beamPattern`/`strafePattern`). OIK surfaces at the card's d-pad eye (itself blasted); Kalameet lands on the card's d-pad node (never itself aflame). The band approximation is deleted — nothing about the beam/strafe remains graphical (the 3 Fire Beam behaviour cards target exclusively through the Blasted Nodes deck per oik p.13).
15. Dancer reshuffle = remaining deck only.
16. Mimic ambush 1-in-3, printed mimic chests ambush even module-off.
17. Summons module non-functional pending decks. — UPDATE (reconciled): Eygon of Carim (mini) and Witch Beatrice (main) transcribed from the addon25 sheet (cells 55-64) into the golden `summons` section; the module is functional: fog-gate zero-souls trade (`summonOffer` pending), spawn on an entry node at boss setup, activation after every character activation, 4-card always-all deck with unshuffled recycle, Shift = player-positioned move pending (host seat), Distract = virtual Aggro for the next boss activation, Run for Cover = dodge dice vs the next activation, weak-arc bonus die shared once per flipped card (Beatrice's Curse upgrades hers to blue), summon death despawns without a bonfire reset. New v1 sub-judgments: summon defence is auto-played (dodge when dodging is its only defence, else block/resist), a pushed summon auto-relocates to the first free adjacent node with no push damage, printed stagger vs bosses is not applied (see 13 — SUPERSEDED: conditions now stick per 13's update, including the summon's own), and a party wipe loses the consumed summon.
18. Invasion tokens engine-virtual and visible, re-arm on dash-out, identity once per game.
19. Campaign multi-boss +1 spark lump at final boss, capped.
20. Legendary injection = transmuted deck at mini reset / section 1->2.
21. L4 reserved at draw, CotA third draw cross-deck.
22. Rest host-confirmed seat 0.
23. Ember applies to enemy attack+push damage, not traps/poison; Andre std draw 1 soul.
24. Assassin Backstab auto-picks first legal weapon, Knight Stand Fast post-roll, Winged Knight Heavy Blows block>=3.
25. Arena drops key arena:<bossId>, tile drops auto-collect on next clear.
26. Boss faces entry door initially, move-0 turns in place.
27. Continue = pacing ack, treasure pendings survive endings.

28. Spell target picks pend via `spellTarget` (unique target auto-resolves; Force/Bountiful Light chain a second pick with skip); cast shares the attack economy.
29. Entry placement is the players' choice: one `entryPlace` pending per character (seat order, upfront) and one for the summon (host); a one-node doorway places silently; a node that fills re-pends at the front with fresh options.

## 8. Rulebook UI-coverage audit (ship gate 1)

Audit date 2026-07-10, engine suite 164 green. Method per playbook section
6.4b: every player decision, optional cost, choice of amount, and piece of
public information was extracted from the six digests (full re-read), then
mapped to a concrete control or display; the `DsAction` union and
`DsPendingKind` list were swept in reverse for fields the UI never sends.

Legend:
- FULL - the choice/info lives on a device control or TV display exactly as printed.
- ENGINE - the rule is enforced/resolved by the engine with no player-facing choice because none is meaningful (dominated option, unique legal outcome, or data makes it impossible).
- SIMPLIFIED - deliberately narrowed from the printed freedom; recorded in the decision log.
- MISSING - a printed choice the port does not offer (with the reason).

### 8.1 Setup and lobby

| Rule point | Coverage | Where |
|---|---|---|
| Scenario, party size 1-4, mini/main boss pick, mega finale, Darkroot mix + treasure, mimics/invaders/summons toggles | FULL | SelectGame create panel (7 option rows) |
| Class pick (10 classes) | FULL | device ClassPickScreen, real board scans, taken classes greyed |
| Starting equipment arrangement | ENGINE | auto-equip (armour, then hands, then backup); freely rearranged at the bonfire before the first travel (ManageOverlay) |
| Tile layout around the bonfire (core p.8) | SIMPLIFIED | linear chain bonfire, t1..t4, fog gate (decision log 1); the fog-gate tie choice therefore never arises |

### 8.2 Bonfire phase (device)

| Rule point | Coverage | Where |
|---|---|---|
| Buy treasure (1 soul; 2 campaign) | FULL | Andre panel, cost on the button, deck count shown |
| Drawn treasure: who equips / stash | FULL | treasureKeep pending (card art + per-seat equip options) |
| Equipment changes at Andre | FULL | tap any card, ManageOverlay (equip to armour/handL/handR/backup/inventory, stat gates mirrored) |
| Install upgrades / remove armour upgrades (weapon upgrades permanent) | FULL | ManageOverlay INSTALL ON / REMOVE rows (remove greys with WEAPON UPGRADES ARE PERMANENT) |
| Level up any stat (2/4/8; campaign 4/8/16/20) | FULL | Firekeeper tier table, per-cell cost buttons, greyed when unaffordable |
| Restore Luck (1 soul) | FULL | Firekeeper panel |
| Buy sparks (campaign, 2 souls/member, cap) | FULL | Firekeeper panel |
| Sell treasure (campaign, 1 soul) | FULL | ManageOverlay SELL row |
| Rest (spark -1, resets tiles) | FULL | REST host-gated (seat 0 confirms, decision log 22) |
| Ember assignment | FULL | emberAssign pending |
| Travel / return to bonfire any time out of encounter | FULL | TravelStrip (bonfire + tile buttons, fog-gate flag, invader token flag) |
| Enter the boss any time after fog clear | FULL | ENTER FOG GATE (primary when live) |
| Open chests / re-engage a waiting mimic | FULL | TravelStrip chest buttons |
| Campaign player join/leave mid-campaign (1 spark) | MISSING | the room's seat roster is fixed at create; flagged as owner question (rooms-as-saves model) |

### 8.3 Encounter activation (device)

| Rule point | Coverage | Where |
|---|---|---|
| Entry-node placement (core p.19/p.28) | FULL | entryPlace pending per character, map-tap or buttons (decision log 29) |
| Lead character / Aggro token | FULL | leadCharacter pending |
| First activation of the game | ENGINE | firstActivation token starts at seat 0 and rotates; subsequent order is clockwise per rules |
| Backup swap window (start of activation) | FULL | SWAP BACKUP opens an explicit combo picker (bring in / trade / stow, two-handed + stat reasons) |
| Walk (once) / runs (1 stamina) with node choice | FULL | WALK / RUN then glowing map nodes; movement grouping enforced with inline reasons |
| Barrel smash (+1 stamina) | FULL | barrel nodes included in move plans at the printed cost |
| Attack: hand, option, target | FULL | per-option rail buttons (dice chips, range, icon tags) then target picker / map tap |
| Node-AoE attacks | FULL | an enemy target on the node selects the node; AoE hits enemies only (decision log 10) |
| Spell casts (43 printed text/icon actions) | FULL | CAST buttons with printed text; targets via spellTarget pending (decision log 28) |
| Shift icons | SIMPLIFIED | free-move credits, position free within the activation (decision log 12) |
| Estus / heroic actions | FULL | rail buttons; reactive heroics (Knight/Assassin) offered in postRoll pendings |
| Luck reroll | FULL | postRoll pending |
| End activation | FULL | explicit END ACTIVATION, primary when it is the only act |
| Campaign dash-through | FULL | DASH THROUGH buttons per connected tile (gated until one enemy phase) |

### 8.4 Reactions and party decisions (pendings)

| Rule point | Coverage | Where |
|---|---|---|
| Block/resist vs dodge | FULL | defence pending with live dice pools (incl. cast defence buffs); "suffer" equals rolling a 0-die block |
| Optional pre-dodge move | FULL | dodgeMove pending (map or buttons) |
| Trap / push damage (never blockable) | FULL | trap pending (suffer / dodge) |
| Push destinations, node overflow | FULL | pushDest / nodeOverflow pendings |
| Enemy activation ties, enemy move ties | FULL | enemyTieOrder / enemyMoveTie pendings (only when meaningful, decision log 4) |
| Nearest-target taunt ties | ENGINE | impossible by data: taunt values are a complete permutation (classes 1-10, Eygon 11, Beatrice 0) |
| Boundary arc choice, arc rotation on a boss node | FULL | arcChoice pending; CIRCLE TO THE ARC buttons |
| Summon offer (souls XOR phantom) | FULL | summonOffer pending |
| Summon entry placement + Shift positioning | FULL | entryPlace (host) + summonMove pendings |

### 8.5 Public information (TV + device)

| Rule point | Coverage | Where |
|---|---|---|
| Sparks, souls, dropped-souls cache | FULL | device header + TV bonfire panel; the dropped cache is marked in the log with its node |
| Endurance bars (black from left, red from right), estus/luck/heroic/ember | FULL | device cube bar + TV per-character healthbar chips |
| Conditions on characters/enemies/bosses/summon | FULL | device party chips + node map; TV boss panel condition chips (added this audit) |
| Aggro + first-activation tokens | FULL | TV chips + device AGGRO tag + red map dot |
| Enemy data cards (threat/range/dodge/defence/behaviour) | FULL | node-map + SHOW DECK sheets |
| Encounter card contents, trap values once flipped, terrain, chest states | FULL | TV 3D tile + device map glyphs (T/G/B/C legend) |
| Tile progress (unexplored/revealed/cleared/completed, fog gate, invasion tokens) | FULL | TravelStrip + TV tile strip |
| Boss health dials, heat-up, deck/discard counts, flipped behaviour card | FULL | TV boss panel (mod dial art, KING mats, paired O&S) |
| Gravestone intel (revealed boss cards) | FULL | TV boss panel GRAVESTONE INTEL row (added this audit) |
| Weak/attack arcs of the top discard | FULL | TV arena arc rings + facing tick |
| OIK beam / Kalameet strafe patterns + lava region | FULL | decoded node lists play out on the TV; forbidden nodes enforced |
| Four Kings dials 1-4, summons remaining, Take a Breather | FULL | KING ONE-FOUR mats; log narration |
| Summon dial, deck/discard, Distract state | FULL | device summon chip + TV log; Distract narrated |
| Campaign tracking sheet | ENGINE | the room IS the persistent save (rooms-as-saves) |

### 8.6 Reverse sweep (action union to UI)

Every `DsAction` variant and field is reachable from a device control:
pick_class, buy/sell treasure, equip_move (all five destinations),
install/remove upgrade, level_up (per stat), restore_luck, buy_spark, rest,
travel (incl. bonfire), enter_fog_gate, open_chest (per node), walk/run
(nodeId + arcStep), swap_backup (both ids via the combo picker), attack
(hand/option/targetUid/targetUnit; nodeId is redundant by decision log 10),
use_estus, heroic_action, end_activation, dash_through (per tile), choose
(all 16 pending kinds render), continue (TV pacing ack). No field is
auto-picked by the client anymore (the SWAP BACKUP auto-pick and the missing
dash/remove-upgrade/spell affordances were closed during this audit).

Known deliberate non-offerings: campaign mid-campaign roster changes (8.2,
owner question), tile-layout freedom (8.1, decision log 1), Go Beyond Death
(excluded, absent content).
