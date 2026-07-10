# Old Iron King (Mega Boss) — Rulebook Digest

Source: `games/dark-souls/rulebooks/old-iron-king.pdf` (16 pp, official Steamforged rules insert).
Page refs are PDF pages (= printed pages).

## What it is (p2)

Mega boss expansion (Dark Souls 2 flavour): the Old Iron King, faced after a mini boss and a main boss.

## Contents (p4)

- 1x Rules Insert
- 1x Old Iron King Miniature, Health Dial, Data Card
- 12x Behaviour Cards, **6x Fire Beam Cards** (separate Beam deck)
- 2x Treasure Cards
- 4x Level 4 Encounter Cards, 1x Mega Boss Game Board

## Shared mega-boss framework (pp7-11)

Identical to the Four Kings/Kalameet text — see `four-kings-digest.md` for the full framework: setup after main boss (p7), level 4 encounter rules and 8-souls-per-character reward (p8), setup after the L4 encounter with Andre/Firekeeper visit, no free rest, board flip + Fog Gate (p9), mega boss basics (p10), data/behaviour card anatomy (p11), win + campaign-only treasure (p12).

OIK L4 encounter names seen: **Fortress Gates** (pp5, 8), **Ironhearth Hall** (p9), **Blazing Furnace** (campaign, p15).

## Old Iron King data card (pp5, 11)

- Threat Level: **10**
- Starting Health: **44**
- Heat Up Point: **22**
- Behaviour Deck Size: **6**
- Block **3** / Resist **3**
- Special Ability — **Old Iron Rage**: "After heat up, increase the damage and dodge difficulty of all Fire Beam cards by +1."

## Starting the encounter (p12)

1. Characters on entry nodes; Aggro token on one character; OIK model on the **Iron King node opposite the doorway** (NOT a generic mega boss spawn node — see Molten Iron Dweller), front arc facing board centre.
2. Behaviour deck build: separate the **6 standard** cards, **3 Signature** cards (all three are *Fire Beam*), **3 Heat Up** cards, and the **6 Beam cards**.
3. Take **3 random standard** cards, shuffle; reveal one of the three per gravestone in the L4 encounter.
4. Add the 3 Signature Fire Beam cards to the 3 random standard cards; shuffle all six → behaviour deck.
5. Shuffle the 6 Beam cards separately into a face-down **Beam deck** beside the behaviour deck.

Heat up (p12): at Health <= 22, all three Fire Beam cards get **+1 damage and +1 dodge difficulty** (Old Iron Rage), AND add **one random Heat Up card** shuffled into the behaviour deck.

## Custom game elements (p13)

- **Molten Iron Dweller**: there are only **three Iron King nodes** on which OIK may ever be placed; he submerges/emerges between them during Beam attacks. The area behind the Iron King nodes is lava: models can never move into OIK's back arc or that area — treat it as tile wall (core p28 'Boss Arcs').
- **Beam Attacks**: when a behaviour card shows the Beam icon:
  1. Reveal the top Beam card; move OIK to the **movement node** shown on it (front arc to board centre). Models on that node are pushed to any adjacent node (as Leap icon).
  2. The Beam card shows which **nodes are targeted**; resolve a **magical attack** against all characters on those nodes (not arc/range based).
  3. Discard the Beam card.
  - Empty Beam deck when a Beam icon resolves → flip the discard pile face down WITHOUT shuffling; continue.
  - Beam card example name: **Blasted Nodes** (pp5, 12, 13 diagram: shows targeted nodes + OIK movement node).

## Behaviour cards (12 total; faces visible in book, from pp5, 11, 12 vector art)

Format: range (left circle) / dodge difficulty (right circle) / bottom icons.

- **Fire Beam** (Signature x3) — range **\*** (special: targets via Beam card), dodge difficulty 1, damage 5, movement 0. After heat up: damage 6, dodge 2.
- **Magma Blast** (Heat Up example) — range **∞**, dodge 3, magical damage 6.
- **Bash** (standard example) — range 2, dodge 3, physical damage 6, with Push icon.
- **Double Swipe** (standard example) — range 1, dodge 2, two physical attacks of damage 6 each.
- **Shockwave** (standard example, p5) — values printed 1 / 2 / 5 (range 1, dodge 2, damage 5 — mapping from p5 photo is lower-confidence).

Remaining standard/Heat Up faces are not printed in the rulebook.

## Treasure (p5)

- 2x OIK treasure cards. Visible: **Iron King Hammer** — weapon card; raw printed values: 34 / 23 / 23 / 0 / 0 / 1 / 1 / 0 / 1 [2] 1 [4] 1 / "1 1 2" (stat requirements ~23/23, upgrade-slot rows [2] and [4]; exact icon mapping not decodable from the photo — take from mod assets).

## Campaign scenario — "Go Beyond Death" (Dark Souls 2, pp14-15)

Four-session extended campaign using the **Explorers** and **Iron Keep** expansions. Encounters from a shared core+Explorers+Iron Keep deck; L4 encounters from OIK.

- **Section 1 — Tower of Flame**: Bonfire, L1, L1, L1, L2, **Old Dragonslayer (Mini Boss)**
- **Section 2 — Threshold Bridge**: Bonfire, L1, L2, L2, L3, **Smelter Demon (Main Boss)**
- **Section 3 — Ironhearth Hall**: Bonfire, L2, L3, L3, **Fortress Gates L4 Encounter**, **Pursuer (Main Boss)**
- **Section 4 — Eygil's Idol**: Bonfire, L3, **Blazing Furnace L4 Encounter**, **Old Iron King (Mega Boss)**

Campaign placement (p14): during setup for sections 3 and 4 the Mega Boss board (encounter side) aligns with a **level 3 encounter's** doorway rather than the Bonfire tile; flip after clearing. L4 encounters do not reset on rest. Note: named L4 encounters are prescribed (Fortress Gates, Blazing Furnace), unlike the random draw in the standalone flow.

## ENGINE NOTES

- Shares the entire mega-boss framework state from Four Kings (level4 tier, two-sided board, post-main-boss phase). Implement once.
- OIK positioning is CONSTRAINED: legal boss nodes = the 3 Iron King nodes only. No normal boss movement between them except via Beam card resolution. Back-arc/lava region = permanent wall for pathing and pushes.
- Second deck object: `beamDeck[6]`, recycle-without-shuffle on empty. Each Beam card = `{movementNodeId, targetNodeIds[]}` (e.g. Blasted Nodes). Beam resolution: teleport boss to movementNode (push occupants like Leap), magical attack vs all characters on targetNodeIds, discard.
- Heat-up hooks: at `health <= 22` → set `fireBeamBuff = +1 dmg/+1 dodge` (applies to the three Fire Beam behaviour cards; buff also affects future draws) AND shuffle in 1 random Heat Up card. Buff is a persistent modifier, not a card swap.
- Behaviour deck build differs from core: fixed signature cards ALWAYS in deck (3 Fire Beam) + 3-of-6 random standard; gravestone reveals apply to the random subset only (reveal before adding signatures).
- Two-stage attack indirection (behaviour card -> Beam deck draw) needs an interruptible step queue for TV playback.
- Campaign runner: sections may prescribe *named* L4 encounters and place the mega board off an L3 tile mid-section (Section 3 has a main boss AFTER an L4 encounter).
- Iron King Hammer / second treasure card stats must come from mod assets (photo not fully legible).
