# Board Game Engine

Play board games together in the same room: the **shared board lives on a big
screen** (any browser — a laptop or TV) and **each player's private hand and
personal board live on their own phone, tablet, or laptop**. A Node server keeps
everything in sync. The interaction model is a web port of Tabletop Simulator —
players make their moves from their own device and the main screen follows.

First game: **Brass: Birmingham**, rebuilt from the
[ikegami/tts_brass](https://github.com/ikegami/tts_brass) Tabletop Simulator mod,
using the mod's own art and Lua as the source of truth.

## How it plays

- **The big screen** shows only the main board. Scores stay readable, and every
  action flies the camera to where it happened with a caption.
- **Each device** holds that player's board and hand. On your turn you pick an
  action, choose a card, and tap a glowing legal spot — illegal moves never
  light up (and the server re-validates everything). Coal/iron/beer, market
  pricing, network connectivity, and two-era scoring are all enforced.

## Quick start (local, same Wi-Fi)

```
npm install
npm run start        # builds the client, then serves everything on port 8787
```

1. On the screen device, open the printed URL (e.g. `http://192.168.4.132:8787`).
2. Click **Create a room** — a QR code appears.
3. Everyone scans the QR, enters a name, and picks a color.
4. The host presses **Start** on their device.

All devices must be on the same network.

## Deploy to the web (Render)

The lobby uses a public URL instead of a LAN IP when one is available, so it
works over the open internet with no same-network requirement.

1. Push this repo to GitHub.
2. In [Render](https://render.com): **New +** → **Blueprint**, point at the repo.
   [`render.yaml`](render.yaml) sets the build/start commands.
3. Render injects `PORT` and `RENDER_EXTERNAL_URL` automatically; the QR code
   resolves to the public `https://…onrender.com/join/<room>` URL.

To point at a custom domain (or override), set `PUBLIC_URL` in the service env.
WebSockets upgrade to `wss` automatically on https.

## Layout

| Folder | What it is |
|---|---|
| `shared/` | Game engine + protocol. Brass rules in `shared/src/brass/` (`state.ts` setup, `actions.ts` action engine, `*-test.ts` playthrough/invariant tests). |
| `server/` | Express + WebSocket server: rooms, color picks, per-seat redacted state broadcast, join URLs. |
| `client/` | React + three.js app: home/lobby, `/board/:room` (screen), `/play/:room` (device), `/dev/brass` (viewer). The shared 3D renderer is `client/src/brass/TableScene.tsx`. |
| `tools/tts-extract/` | Pipeline that turns the TTS mod into the game: `extract-brass.mjs` (Lua + save → golden setup), `prep-viewer-assets.mjs` (stages art → `client/public/bb/`). |
| `games/brass-birmingham/golden/` | Extracted golden spec (`mod-setup.json`, `board-layout.json`) the engine is validated against. |

## Development

```
npm run dev -w server                       # server only (serves last built client)
npm run dev -w client                       # vite dev server w/ hot reload (proxies to :8787)
npx tsx shared/src/brass/setup-test.ts        # setup vs golden (multiset invariants)
npx tsx shared/src/brass/actions-test.ts      # full bot-vs-bot playthroughs
npx tsx shared/src/brass/connectivity-test.ts # coal/iron routing + slot rules
npx tsx shared/src/brass/playercount-test.ts  # full games at 2, 3, and 4 players
```

Key design points:

- **Server-authoritative**: clients send actions; `applyAction` validates and
  applies them; illegal actions return an error. The client's glow/enable logic
  imports the *same* legality helpers, so the UI can't offer what the server
  would refuse.
- **Hidden information**: `viewFor(state, viewer)` redacts other players' hands
  to counts before broadcast. The screen gets the fully public view.
- **Faithful to the mod**: tile stats, deck composition, cube counts, board
  graph, and slot restrictions are all extracted from the mod's Lua/save/art —
  never hand-keyed from memory. See `tools/tts-extract/`.

## Regenerating the game assets

The staged art in `client/public/bb/` is committed, so the app runs as-is. To
rebuild it from scratch (e.g. after editing the extractor):

```
node tts-mods/brass_birmingham/download-assets.mjs   # re-fetch mod art (gitignored cache)
node tools/tts-extract/extract-brass.mjs             # → golden spec
node tools/tts-extract/prep-viewer-assets.mjs        # → client/public/bb/
```

## A note on assets

The board, card, and piece art belong to the publishers of Brass: Birmingham
and the mod's author. This project renders them for personal in-room play from a
mod you can obtain yourself; it ships no game rules text.
