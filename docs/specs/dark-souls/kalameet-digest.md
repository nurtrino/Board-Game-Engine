# Black Dragon Kalameet (Mega Boss) — Rulebook Digest

Source: `games/dark-souls/rulebooks/black-dragon-kalameet.pdf` (16 pp, official Steamforged rules insert).
Page refs are PDF pages (= printed pages).

## What it is (p2)

Mega boss expansion (Dark Souls 1 / Artorias of the Abyss flavour): Black Dragon Kalameet, faced after a mini boss and a main boss. Signature ideas: flying **Strafe attacks** and the **Mark of Calamity**.

## Contents (p4)

- 1x Rules Insert
- 1x Kalameet Miniature, Health Dial, Data Card
- 13x Behaviour Cards, **8x Strafe Cards** (separate Strafe deck)
- 2x Treasure Cards
- **4x Calamity Condition Tokens**
- 4x Level 4 Encounter Cards, 1x Mega Boss Game Board

## Shared mega-boss framework (pp7-11)

Identical to the Four Kings/OIK text — see `four-kings-digest.md`: setup after main boss (p7), level 4 encounter rules + 8 souls/character (p8), setup after L4 (Andre/Firekeeper, no free rest, flip board, Fog Gate) (p9), mega boss basics (p10), card anatomy (p11), win + campaign-only treasure (p12).

Kalameet L4 encounter names seen: **Gough's Perch** (pp5, 8), **Great Stone Bridge** (p9).

## Kalameet data card (pp5, 11)

- Threat Level: **10**
- Starting Health: **38**
- Heat Up Point: **22**
- Behaviour Deck Size: **6**
- Block **4** / Resist **3**
- Special Ability — **Calamity & Ruin**: "Kalameet's behaviour deck always includes the Mark of Calamity and Hellfire Blast cards."

## Starting the encounter (p12)

1. Characters on entry nodes; Aggro token; Kalameet model on the mega boss spawn node, front arc facing board centre.
2. Behaviour deck build: separate the **10 standard** cards, **2 Signature** cards (**Mark of Calamity**, **Hellfire Blast**), the **1 Heat Up card** (**Hellfire Barrage**), and the **8 Strafe cards**.
3. Take **4 random standard** cards, shuffle; reveal one of the four per gravestone in the L4 encounter.
4. Add the 2 Signature cards to the 4 random cards; shuffle all six → behaviour deck.
5. Shuffle the 8 Strafe cards into a face-down **Strafe deck** beside the behaviour deck.

Heat up (p12): at Health <= 22, shuffle the **Hellfire Barrage** Heat Up card into the behaviour deck (deck becomes 7; "another Hellfire card" to track).

## Custom game elements (p13)

- **Calamity Condition** (new condition, 4 tokens): when an attack has the calamity condition, place a Calamity token on each character hit. A character with a Calamity token suffers **-1 success on block, resist, and dodge rolls**. When they suffer damage from an attack, remove the token. Like Bleed, it is NOT removed at the end of the character's activation.
- **Strafe Attacks**: when a behaviour card shows the Strafe icon:
  1. Remove Kalameet from the tile (he flies). Models sharing his node stay put.
  2. Reveal the top Strafe card; it shows the **targeted nodes** — resolve a **magical attack** against all characters on them (not arc/range based).
  3. Discard the Strafe card; place Kalameet on the **landing node** shown on it. Characters on the landing node are pushed to any adjacent node.
  - Empty Strafe deck when a Strafe icon resolves → flip discard face down WITHOUT shuffling; continue.
  - Strafe card example name: **Fiery Ruin** (pp5, 12, 13 diagram: targeted nodes + landing node).

## Behaviour cards (13 total; faces visible in book, from pp5, 11, 12 vector art)

Format: range (left circle) / dodge difficulty (right circle) / bottom icons.

- **Mark of Calamity** (Signature) — range 1, dodge 2, damage 4, movement 0; applies the Calamity condition (name + condition per p13).
- **Hellfire Blast** (Signature) — range **\*** (targets via Strafe deck), dodge 2, magical damage 5, movement 0.
- **Hellfire Barrage** (Heat Up) — range **\***, dodge 2, magical damage 6, movement 0.
- **Flame Feint** (standard example, pp5, 11) — range 2, dodge 1; bottom icons: movement 2 (with shield modifier), a turn icon, then a magical attack 6 with target sub-icon and a two-tone diamond icon (icon-level reading from render; exact sequence lower-confidence).

The remaining 9 standard faces are not printed in the rulebook.

## Treasure (p5)

- 2x Kalameet treasure cards. Visible: **Obsidian Greatsword** — weapon card; raw printed values: 33 / 0 / 0 / 33 / 0 / 1 / 1 / 0 / 1 [1] 2 [5] 2, text: "**Hits all enemies within 1**" (upgrade rows [1] and [5]; exact icon mapping from mod assets).

## Campaign — "Bathed in Flame" (Dark Souls 1, pp14-15)

Designed to bolt onto the end of **The First Journey** campaign (core rulebook pp34-35):

- **Section 4 — Royal Wood**: Bonfire, L3, L3, **L4 Encounter**, **Black Dragon Kalameet (Mega Boss)**.

Placement (p15): Mega Boss board (encounter side) aligns its doorway with a **level 3 encounter's** doorway rather than the Bonfire tile; flip it once the L4 encounter is defeated. L4 encounters do not reset when the party rests.

## ENGINE NOTES

- Reuses the shared mega-boss framework (level4 tier, two-sided board, post-main-boss phase) — implement once with Four Kings/OIK.
- New character condition `calamity`: token on hit-by-calamity-attack; modifier `-1 success` on block/resist/dodge rolls; cleared when the bearer suffers attack damage; persists across activations. Max 4 tokens in supply (cap concurrent marked characters at 4).
- Second deck object: `strafeDeck[8]`, recycle-without-shuffle. Each Strafe card = `{targetNodeIds[], landingNodeId}`. Strafe resolution: despawn boss (occupants stay), magical attack vs targeted nodes, respawn boss on landing node with push of occupants. Boss facing after landing: front arc to board centre is implied by the general rule — verify against mod Lua.
- Unlike OIK, Kalameet is NOT node-constrained; he uses the normal mega boss spawn node and normal boss movement plus Strafe teleports.
- Deck build: 2 fixed signature cards always in deck + 4-of-10 random standard; single heat-up card (no random choice). Gravestone reveals from the random subset only.
- `range: "*"` attacks resolve exclusively through the Strafe deck (never direct) — model as attack-type `strafe`.
- Treasure and the 9 unprinted standard behaviour faces must come from TTS mod assets/Lua.
