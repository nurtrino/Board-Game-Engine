# Board Game Engine (version 2)

Shared board on a big screen, private information on phones. Live at boardgamesengine.com, deployed by
Render from `main` of `nurtrino/Board-Game-Engine`. A push to `main` goes live.

The hub lists only games the owner considers finished: **Secret Hitler** and **Brass: Birmingham**.
The older games (Ticket to Ride, Dune, Axis & Allies and the rest) are at the `v1-archive` tag and in
the local folder `../Board Game Engine`. Do not bring one back unless asked.

## Commands

- `npm run start` builds the client and serves on port 8790. `npm run dev` serves without rebuilding.
- `npm test` runs the rules tests for both games, the save store tests and a live WebSocket smoke test.
- `npm run typecheck` checks client and server.
- `npm run autoplay -- CODE 4 --start` plays a Secret Hitler game on the screen with scripted players.
- `npm run stage:sh` restages Secret Hitler mod assets into `client/public/sh`.
- `npm run autoplay:brass -- CODE 3 --start` plays a Brass game on the screen with scripted players (`--fast`, `--turns=N`).
- `node tools/verify/serve-alt.mjs` serves on 8793 with a throwaway save directory, for when 8790 is taken.

## How it fits together

- The hub, lobby, room server and saves are shared by every game: `client/src/pages`, `client/src/net.ts`,
  `server/src/index.ts`, `server/src/store.ts`. A game plugs in through the `engines` table in the server,
  a branch in `BoardPage.tsx` and `PlayPage.tsx`, an entry in `SelectGame.tsx` and in `GAME_SEATS`.
- Seat `i` is `room.players[i]`. Seats beyond the joined players are AI seats.
- Secret Hitler is event driven: `shared/src/secret-hitler/rules.ts` emits events, the screen's
  `Director` plays each as a cutscene, then `Stage.syncTo(view)` snaps the table. The screen reports
  `presented`; until then phones show "Watch the screen" and keep the last settled state.
- AI seats only ever receive the private view for their own seat.
- Brass is staged, not just updated. Every action leaves `state.batch`: a list of beats (`action`, `round`,
  `score`, `era`, `end`), each with a snapshot of the public table right after it (`shared/src/brass/state.ts`).
  The screen's director (`client/src/brass/TvBoard.tsx`) plays the beats in order and shows each snapshot only
  when it reaches it. Pieces animate themselves on any state change (`stage3d.tsx`) and announce what they do on
  an `FxBus`, which is where sound comes from. Brass sound is synthesised (`client/src/brass/audio.ts`), no files.
  Devices show the live state at once and use the same batch for the feed, the turn sweep and the score cards.

## Porting a game

- The TTS Workshop mod is the source of truth: its Lua, its notebook, its printed components.
  Mods live in `Documents/My Games/Tabletop Simulator/Mods/Workshop/<id>.json`; cached assets in `Mods/Images` and `Mods/Models`.
- Use the mod's real meshes and textures in 3D. Measure positions from the save and textures; do not eyeball.
- Write the provenance and rule map to `docs/specs/<game>.md`.

## UI and copy

- The look is the hub's: black, glass cards, hairline borders, Inter, white as the only accent.
  Reuse the classes in `client/src/styles.css` (`card`, `eyebrow`, `big primary`, the `ig-*` in-game set)
  before adding new ones. Game-specific CSS is scoped (Secret Hitler uses `.shx`).
- Plain words, sentence case in panels, short uppercase labels only where the hub already uses them.
  No emoji, no em dashes, no slogans. A seat colour appears as an outline, never a dot.
- The owner checks visuals himself. Verify logic, console and DOM; screenshots are supporting proof.
