# Secret Hitler: source and rules map

## Source

- **Assets:** *Secret Hitler Original*, Workshop mod `3322335081`
  (`Documents/My Games/Tabletop Simulator/Mods/Workshop/3322335081.json`).
  Meshes and most textures were copied from the local TTS cache. Role, membership and ballot card
  sheets and the envelope were never cached (they sit inside the pre-packed boxes), so they were
  downloaded from the URLs in the save (`lithium720.pw/FragaholiC/Secret.Hitler/...`).
  Raw files are vendored in `games/secret-hitler/mod-assets`.
- **Rules:** this mod is a sandbox with no game logic in Lua. Its rules live in its notebook tabs,
  extracted to `games/secret-hitler/rules-notebook.md`, and on the three printed fascist tracks.
- **Setup logic:** role counts and who-knows-whom also match the Lua of *Secret Hitler Rescripted V2*
  (Workshop `693390975`), the only scripted Secret Hitler mod installed. Its script covers setup only.

## Rules as implemented (`shared/src/secret-hitler/rules.ts`)

| Rule | Source | Notes |
|---|---|---|
| Roles: 5p 3L+1F+H, 6p 4L+1F+H, 7p 4L+2F+H, 8p 5L+2F+H, 9p 5L+3F+H, 10p 6L+3F+H | Notebook "Set Up" | `ROLE_COUNTS` |
| Hitler knows the fascists at 5 to 6 players only | Fascist tracks, notebook | `knownTo` |
| Deck of 6 liberal and 11 fascist policies | Save deck `d003c0` | |
| 7 players: 1 fascist policy starts in the discard pile. 9 players: 2 | Notebook "Set Up" | Mod-specific balance rule, kept as written |
| Random first presidential candidate | Notebook, Rescripted Lua | |
| Presidency passes clockwise | Notebook "Election" | Each player picks a colour, which is their chair at the printed table. Order follows the chairs, not join order |
| Term limits: last Chancellor always, last President unless 5 or fewer are alive | Notebook says "five-player game" | Uses the published wording (five players left alive), which covers the notebook's case |
| Majority of ja elects, ties fail | Notebook | |
| Hitler elected Chancellor with 3+ fascist policies: fascists win | Notebook "Object" | Otherwise the Chancellor is publicly confirmed not Hitler (the mod's Not Hitler cards) |
| Three failed elections: top policy enacted, power ignored, term limits reset | Notebook "Election Tracker" | |
| Session: draw 3, President discards 1, Chancellor discards 1 and enacts 1 | Notebook | Discards are never shown |
| Reshuffle when fewer than 3 cards remain after a session | Notebook | |
| Powers by track: 5-6 `-, -, peek, kill, kill`; 7-8 `-, investigate, special election, kill, kill`; 9-10 `investigate, investigate, special election, kill, kill` | Printed tracks | `TRACK_POWERS` |
| Investigate shows party, each player once | Notebook | |
| Special election, then the order returns | Notebook | |
| Execution: Hitler dead means liberals win, others stay hidden | Notebook | |
| Veto after 5 fascist policies; consent discards both and advances the tracker | Notebook | One veto request per session |

## Additions that are not in the mod

- **Claims.** After a session the President and Chancellor may tap what they "saw" (they may lie).
  Investigations and peeks can be claimed too. Claims are public record on the screen and are what
  the Claude seat reads. They never block play.
- **Table talk.** Text from phones appears on the screen and is read by Claude seats. Dead players cannot speak.
- **Standees.** Each seat has a glowing nameplate in its printed seat colour. Everything else on the table is a mod asset.
- **Claude seats.** Empty chairs up to five are played by Claude (or the built-in bot without an API key).

## Layout numbers (TTS units, measured from the save and textures)

- Table 117.5 x 69.5 with the colour-coded 10 seat texture. Seat anchors match the save's hand zones.
- Track boards are 28 x 10. Liberal slot centres `x = -7.73 + 3.865 i`. Fascist `x = -9.63 + 3.865 i`.
- Election tracker circles on the liberal board at `x = -4.16, -1.55, 1.03, 3.64`, `z = +3.37`.
- Three.js maps TTS `(x, y, z)` to `(x, y, -z)`.
