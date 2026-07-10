# Darkroot Expansion — Rulebook Digest

Source: `games/dark-souls/rulebooks/darkroot.pdf` (12 pp, official Steamforged rules insert).
Page refs are PDF pages (= printed page numbers in this book).

## What it adds (p2)

New enemies, encounter cards, and treasure cards, plus TWO new main bosses: **Knight Artorias** and **Great Grey Wolf Sif**. Multilingual card pools — set aside non-English flagged cards before first play (p2).

## Contents (p4)

- 1x Rules Insert
- 18x Encounter Cards
- 15x Treasure Cards
- 14x Enemy Miniatures, 7x Enemy Data Cards
- Sif: miniature, health dial, data card, 14 behaviour cards, 3 treasure cards
- Artorias: miniature, health dial, data card, 13 behaviour cards, 3 treasure cards

New regular enemies (pp4-5): **Mushroom Child, Mushroom Parent, Shears Scarecrow, Plow Scarecrow, Demonic Foliage, Stone Knight, Stone Guardian** (7 data cards).

## Enemy data cards (read from card photos, pp4-5)

Values transcribed from the angled component photographs; format: threat / health / block|resist / dodge / behaviour.

| Enemy | Threat | Health | Block/Resist | Dodge | Behaviour (visible icons) |
|---|---|---|---|---|---|
| Mushroom Child | 2 | 5 | 1 / 2 | 1 | attack range 0; move 1 then physical attack 5 |
| Mushroom Parent | 1 (as printed) | 10 | ? / 2 (block digit obscured) | 1 | move 1, attack 6, includes Push icon (large push arrow) |
| Shears Scarecrow | 8 | 1 | (obscured) | 2 | range 0; physical attack 3 with repeat x2 (bottom-right circle 2) |
| Plow Scarecrow | 4 | 1 | 1 / 1 | 2 | attack with Node (skull) icon; damage digit obscured by miniature |
| Demonic Foliage | 3 | 1 | 2 / 1 | 1 | move ?, physical attack 5 |
| Stone Knight | 7 | 5 | 3 / 2 | 1 | range 0; move 1 + icons partly obscured (shield/magic icons visible) |
| Stone Guardian | 6 | 5 | 2 / 3 | 1 | move 1 with Node (skull) icons, physical attack 5 |

CAUTION: several icons are partially hidden behind miniatures in the photos. Treat the TTS mod Lua as golden for exact behaviour strings; the table above is for cross-checking only.

## Using expansion encounters (p6)

Two legal ways to mix in the 18 encounter cards (they spawn the seven new enemies):
1. Simply shuffle them into the core encounter decks by level.
2. "Greater focus" option: first REMOVE six level-1, six level-2, and six level-3 core encounter cards, then shuffle in the Darkroot cards.

## Using expansion treasure (p6)

At setup step 6 (core rulebook p9): remove 15 random cards from the core common treasure cards and replace with all 15 Darkroot common treasure cards, then shuffle.

## 0 Dodge difficulty rule (p7)

Both Sif and Artorias have behaviour cards with **0 Dodge difficulty**: even a character with zero dodge dice can dodge and automatically succeed by spending 1 Stamina (unless a treasure card forbids dodging). Blocking instead is still allowed (risk damage, pay no Stamina).

## Great Grey Wolf Sif — main boss (p8, data card photographed p5)

- Data card: Threat 10; Starting Health **36**; Heat Up point **19**; Block **2** / Resist **3**; Behaviour deck size **5**; encounter-level circles 0 / 1 / 3.
- Special ability — **Mournful Howl**: "Limping Strike is not a starting behaviour card or a heat up behaviour card. When Sif is reduced to **3 HP or less**, replace the behaviour deck with the Limping Strike card." (transcribed from data card photo, p5)
- First boss in the game with a **Cool Down** mechanic (p8): the Limping Strike card takes over near death — Sif limps but is still dangerous.
- 14 behaviour cards total; visible example card name: "…word Slam" (Sword Slam). Card faces not printed legibly in this book.
- 3 Sif treasure cards; visible in photo: **Greatsword of Artorias** (stat requirements 24 / 20 visible, rest obscured).

## Knight Artorias — main boss (p9, data card photographed p5)

- Data card: Threat 10; Starting Health **25**; Heat Up point **15**; Block **3** / Resist **3**; Behaviour deck size **5**; encounter-level circles 0 / 0 / 4.
- Special ability — **Walking the Abyss**: "When Artorias heats up, remove 2 random behaviour cards from the behaviour deck. Then add all **3 Heat Up cards** to the behaviour deck and shuffle it." (data card photo, p5). p9 restates: he does NOT heat up like other bosses (normally +1 heat-up card); instead remove two random cards, add all three heat-up cards — combination leap attacks.
- 13 behaviour cards total; visible example: "…erhead Cleave" (Overhead Cleave), dodge difficulty 1 visible.
- 3 Artorias treasure cards; visible: **Abyss Greatsword** (upgrade rows "[1] 3", "[4] 3", text fragment "…ds gain +1…").

## Campaign scenario — "Facing the Abyss" (Dark Souls 1 themed, pp10-11)

Three sections; after completing Section 1, augment the treasure deck with transposed + legendary treasure cards and reset the play area per "Setup After the Mini Boss" (core p9).

- **Section 1 — Darkroot Garden**: Bonfire, L1, L1, L2, L2, then the specifically named **Hydra Lake** level-3 encounter (party proceeds to Section 2 when it is defeated).
- **Section 2 — Darkroot Basin**: Bonfire, L1, L2, L3, L3, **Great Grey Wolf Sif (Main Boss)**.
- **Section 3 — Royal Wood**: Bonfire, L2, L3, L3, L3, **Artorias (Main Boss)**.

## ENGINE NOTES

- Seven new enemy archetypes with standard enemy AI fields (threat, health, block, resist, dodge, behaviour icon list). All fit the existing enemy schema; no new enemy-side mechanics except Push on Mushroom Parent and repeat/node icons already in core.
- Encounter deck builder needs two mix-in modes: `append` and `replaceSix` (remove 6 per level before shuffle). Treasure builder needs `replace15Random` mode.
- Boss framework additions:
  - `dodgeDifficulty: 0` must auto-succeed on dodge if stamina >= 1 (no dice) — handle in dodge resolver, not as UI shortcut.
  - Sif: `coolDownCard` state — trigger `health <= 3` replaces ENTIRE behaviour deck+discard with the single Limping Strike card. Persistent low-HP override, checked after each damage application.
  - Artorias heat-up override: `onHeatUp: removeRandom(2) then addAll(heatUpCards[3]) then shuffle` instead of default `addRandom(1)`.
- Campaign runner: named-encounter constraint (Hydra Lake fixed as the final L3 of Section 1), 3-section structure, treasure-deck augmentation checkpoint after Section 1, two different main bosses in one campaign.
- Data-card numbers above that were photo-read (esp. Mushroom Parent threat=1, scarecrow healths=1) should be verified against the TTS mod Lua during import.
