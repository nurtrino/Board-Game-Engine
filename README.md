# Board Game Engine

Play board games together in the same room: the **shared board lives on a big screen** (any browser,
a laptop or a TV) and **each player's private hand lives on their own phone**. A Node server keeps
everything in sync. Games are rebuilt from Tabletop Simulator workshop mods, using each mod's own
art and rules as the source of truth.

This is version 2 of the engine. Two games are in the hub:

- **Secret Hitler**, from the *Secret Hitler Original* mod (Workshop 3322335081). 5 to 10 players,
  a 3D table with cutscenes for every moment, and seats that Claude can play.
- **Brass: Birmingham**, from the [ikegami/tts_brass](https://github.com/ikegami/tts_brass) mod.

## Quick start (local, same Wi-Fi)

```
npm install
npm run start        # builds the client, then serves everything on port 8790
```

1. On the screen device, open the printed URL.
2. Press **New game**, pick a game, name the save. A QR code appears.
3. Everyone scans the QR, enters a name and picks a colour.
4. The host presses **Start** on their device.

## Claude seats (Secret Hitler)

Secret Hitler needs five players. Claude takes any chair nobody sits in, up to five, and you can ask
for more Claude seats when you create the save.

Set `ANTHROPIC_API_KEY` (copy `.env.example` to `.env` locally, or add it to the service's environment
when hosted). Without a key those seats still play, using a built-in bot, and the screen says so.

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Lets Claude play seats |
| `SH_CLAUDE_MODEL` | `claude-opus-5-5` | Model used for Claude seats |
| `SH_CLAUDE_EFFORT` | `low` | Thinking effort per decision (`low` keeps turns quick) |

Claude gets exactly what a person in that chair would see: its own role, what that role knows, its
private intel, the public record and the table talk. Each decision comes back as a choice, an
optional line of table talk (a speech bubble, spoken aloud on the screen) and private notes it
carries to its next turn. Players talk to it from their phones.

## Deploy (Render)

[`render.yaml`](render.yaml) sets the build and start commands and provisions the saves database.
Render injects `PORT` and `RENDER_EXTERNAL_URL`; `PUBLIC_URL` overrides the address in the QR code.
Saves go to Postgres when `DATABASE_URL` is set, otherwise to `server/.rooms.json`.

## Layout

| Folder | What it is |
|---|---|
| `shared/` | Rules engines and the wire protocol. `brass/`, `secret-hitler/` (`rules.ts` is the pure reducer, `room.ts` adds the event stream the screen plays). |
| `server/` | Express + WebSocket server: rooms, saves, colour picks, per-seat redacted state, AI seats (`claude.ts`). |
| `client/` | React app: the hub (`pages/`), Brass (`brass/`, react-three-fiber), Secret Hitler (`sh/`, a vanilla three.js stage with a cutscene director). |
| `games/` | Per-game source material: the mods' raw assets, rules notebook and golden setup data. |
| `tools/` | Asset staging (`stage-secret-hitler.mjs`). |
| `docs/specs/` | Where every rule and asset comes from. |

## Test

```
npm test                               # Brass and Secret Hitler rules, save store, live WebSocket smoke test
npm run autoplay -- ABCD 4 --start     # seat 4 scripted players in Secret Hitler room ABCD and play it out on the screen
```

Screen keys in Secret Hitler: `Space` skips the current scene.

## Credits

Secret Hitler was designed by Max Temkin, Mike Boxleiter and Tommy Maranges and illustrated by
Mackenzie Schubert, and is licensed CC BY-NC-SA 4.0. The TTS mod was assembled by FragaholiC.
Brass: Birmingham is by Roxley Games; the TTS mod is by ikegami.
