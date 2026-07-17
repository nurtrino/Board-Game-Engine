# Blokus 20x20 — rules spec

Source: TTS mod 295656883 "Blokus 20x20" (scriptless physical mod: board art +
84 piece models = 21 shapes x 4 colors) plus the official rulebook PDF staged
from mod 3063151698 (`client/public/blokus/rulebook.pdf`). The mod carries no
rules Lua, so the rulebook is the rules authority; the mod supplies the board
art, seat colors, corner assignment, and authentic piece proportions.

## Components (from the mod)

- 20x20 board (`board.webp`, mod's `Custom_Board`, imgur `baN7ALp`). Printed
  corner markers in image space: Red top-left, Green top-right, Yellow
  bottom-left, Blue bottom-right.
- 21 pieces per color: the 1 monomino, 1 domino, 2 trominoes, 5 tetrominoes,
  12 pentominoes (89 squares per color). Shapes are mathematically fixed; the
  client rebuilds geometry at the mod's measured proportions (cell 0.775 world
  units, piece height 0.284, beveled) because 19/21 mod meshes are on dead
  pastebin links. Colors sampled from the mod's diffuse maps:
  Blue `#3d5aaa`, Yellow `#cfc331`, Red `#bf3835`, Green `#2f974c`.

## Rules (rulebook.pdf)

- Turn order: Blue, Yellow, Red, Green. 4 colors always in play; CPU seats
  cover unclaimed colors.
- First placement per color must cover that color's printed corner square.
- Every later placement must touch at least one same-color piece
  corner-to-corner and must never touch a same-color piece edge-to-edge.
  Contact with other colors is unrestricted. No overlaps, fully on board.
- Pieces may be rotated and flipped freely (8 orientations).
- A player with no legal placement passes; passing is permanent (the color is
  done for the game). The game ends when all four colors are done.
- Scoring: minus 1 per unplaced square. A color that placed all 21 pieces
  scores +15, and +5 more if the monomino was the last piece it placed
  (score 20). Highest score wins; ties share the win.

## Engine mapping

- `shared/src/blokus/state.ts` — `BLOKUS_PIECES` (21 canonical cell sets),
  board as a flat 400-cell array of seat indices, `players[4]`
  (remaining piece ids, passed flag, last piece), `turn`, `phase`,
  `lastEvent`/`lastPlaced` for the TV.
- `shared/src/blokus/actions.ts` — `place {pieceId, rot, flip, x, y}` (cells
  transformed then normalized so `x,y` is the min corner), `pass`. Reducer
  enforces every rule above; `blokusLegalPlacements`/`blokusHasMove` are
  shared by client greying and the server bot.
- Full information game: `viewFor` returns the state plus `you`.
- Ends: all players passed-or-empty; scores computed per the rulebook.
- Seats: humans keep their room seat index (server contract); unclaimed colors
  become engine CPU seats after them; `order` carries the color rotation.

## UI coverage audit (ship gate)

Every player decision and engine action field is reachable on the device:

- piece choice — the tray (`bk-piece-<id>`), one button per remaining piece;
- orientation — ROTATE (4 rotations) x FLIP = all 8 orientations;
- position — tap the board grid (ghost previews the footprint; PLACE greys
  with the engine's own reason until legal);
- pass — PASS with an inline permanent-pass confirmation; it goes primary
  when no legal placement exists (`blokusHasMove` mirror);
- public info — per-color chips (squares left, DONE, final scores) on the TV
  and squares-left in the device header; first-move corner is marked on the
  grid; the rulebook PDF is linked from the device header.

No action field is auto-picked by the UI; `place {pieceId, rot, flip, x, y}`
and `pass` are both fully player-controlled.

## Verification (2026-07-17)

- `npx tsx shared/src/blokus/blokus-test.ts` — all green (piece-set sanity,
  directed rules, conservation invariants, 0/1/2/4-human playthroughs).
- `tools/verify/blokus-smoke.mjs` — full game through the live server:
  ENDED, 281 squares placed, all colors scored.
- `tools/verify/blokus-shot.mjs` — mid-game TV + device screenshots; device
  has zero scroll at 1024x768.
