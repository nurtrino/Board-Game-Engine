# Axis & Allies Anniversary Edition — map golden notes

Source: TTS workshop mod 1961347286. The mod is a dumb table (Lua is a 320-char stub);
the world map is the custom TABLE texture, 9500x4956 px:
`Mods/Images/httpssteamusercontentaakamaihdnetugc778493383644115837C6B6428E7FF791B82A1C53642ED9FECF0CCE6450.png`.
The two Custom_Boards are NOT map halves: `be20f5` is the battle board (combat strip),
`128d09` is the National Production / Research & Development chart. Both are recorded in
`map.json` under `art.sideBoards`.

Everything in `map.json` was transcribed from the printed art (28 grid tiles + ~15
targeted zooms with an absolute-pixel coordinate grid), then verified with the line
overlay from `tools/tts-extract/fit-axis-map.mjs overlay` (playbook §2.4/§6): every
center dot must sit in its region, every adjacency line must cross exactly one printed
border. Nothing was taken from memory of other A&A editions.

Counts: 97 territories, 65 sea zones, 398 undirected edges
(154 land-land, 125 land-sea, 119 sea-sea), 18 victory cities, 6 capitals,
15 impassable territories.

## Coordinate spaces

- **Art space** (`center.px/py` everywhere in map.json): pixels in the 9500x4956 table
  image, origin top-left.
- **World space**: TTS `posX/posZ` as found in `setup-1941.raw.json` /
  `setup-1942.raw.json`.
- `worldFit` is a single 6-parameter affine `px = a*wx + b*wz + e`,
  `py = c*wx + d*wz + f`, least-squares fitted from IC/AA-gun anchor units in the two
  setup goldens (outliers dropped iteratively). One affine is sufficient — the table is
  a flat quad with the map as its texture.
- **Accuracy caveat**: unit placement in the mod is hand-jittered. The same factory
  differs by up to ~3.5 world units between the 1941 and 1942 saves, so projected
  positions carry ~100–300 px residuals (~0.5–1.5% of map width). Zone-assign setup
  stacks by nearest/containing region and hand-review anything that lands near a border.
- Two anchor labels in the mod are misnamed: the AA gun nicked "Kiangsu" actually sits
  on Japan, and the one nicked "Egypt" sits on India. The fit uses the *actual*
  positions; do not trust those two nicks when zone-assigning.

## Horizontal wraparound

`art.wrapsHorizontally = true`: x=0 and x=9500 are the same meridian. The seam cuts
through central Canada, the central USA, Mexico and the east Pacific. Adjacencies that
cross the seam (present in `adj` like any other edge):

- land: western-canada~eastern-canada, central-united-states~eastern-united-states,
  eastern-united-states~mexico
- land-sea: western-canada~sz-1 (Hudson Bay sits on the seam)
- sea: sz-20~sz-55, sz-21~sz-44, sz-25~sz-43 (the three wraps named in the rulebook)

## Canals / straits (rules gates, not adjacency)

- **panama-canal**: sz-19↔sz-20 usable only if you control Panama.
- **suez-canal**: sz-15↔sz-34 usable only if you control BOTH Egypt and Trans-Jordan.
  (Red Sea and Persian Gulf are both part of printed sz-34 on this map.)
- **turkish-straits**: sz-15↔sz-16 passage runs through Turkey, a strict neutral —
  closed to all ships in the base game.
- **Danish straits**: sz-5↔sz-6 have NO gate on this edition — plain sea adjacency
  (border line runs (2400,1045)-(2450,1170)); listed here only because other editions
  gate it.

## Owner enum

The brief's enum was germany|ussr|japan|uk|italy|usa|neutral. The Anniversary map also
prints Kuomintang white-sun roundels on 9 Chinese territories; these are recorded as
`originalOwner: "china"` (an addition to the enum) because folding them into `usa`
or `neutral` would lose information the engine needs (AA50 China rules). Owner counts:
usa 13, uk 25, ussr 17, germany 9, italy 3, japan 6, china 9, neutral 15.

Strict/impassable: all 15 `isImpassable` entries are either terrain (Sahara, Himalaya)
or strict political neutrals (Turkey, Spain, Sweden, Switzerland, Ireland, Afghanistan,
Saudi Arabia, Mongolia territories, various South American neutrals). They keep their
printed adjacencies but are excluded from the validator's isolation check.

## Ambiguities and best readings

1. **sz-57 / sz-63 corner** — the vertical borders measured at x≈8071 (57) vs x≈8100
   (63); at this art resolution it is unclear whether they meet at a point or share a
   short segment. KEPT as adjacent (best reading: shared segment). Flag for playtest.
2. **sz-22 / sz-24 border** — partially hidden under the printed "Mobilization Zone"
   panel in the mid-Atlantic. Kept adjacent per the visible border geometry either side
   of the panel.
3. **Panama vs sz-55** — Panama's west coast is close to the seam; it may touch sz-55
   art-wise across the wrap. EXCLUDED from adj (Panama coasts sz-19/sz-20 only, which
   matches the canal rule). If playtest shows amphibious moves expected from sz-55,
   revisit.
4. **Midway** — sits inside sz-57's printed box (x8071–8511, y1300–2493), NOT sz-56.
   Verified by zoom; differs from some other editions.
5. **Formosa** — coasts sz-61 only. The diagonal 61/50 border passes south of Formosa
   (zoom-verified), so no sz-50 adjacency.
6. **East Indies / Borneo vs sz-36** — the 36/37/49 junction (5966,3605) and the 36/49
   border (y≈3528–3582) run just off both coasts, so neither island touches sz-36; they
   coast 37/38/39/49 only.
7. **Australia / sz-39** — the 39/49 diagonal meets the west Australian coast at
   (6620,4245), so Australia does coast sz-39 (in addition to 40/41/47/49… as printed).
8. **sz-47 / sz-42** — nearly a corner in the Coral Sea, but they share a short printed
   jog segment (x≈7738, y4394–4541). Kept adjacent.
9. **No Malaya territory** — this map merges the peninsula into
   french-indo-china-thailand / adjacent regions; there is no separate Malaya label.
10. **Cuba** — no separate territory; part of West Indies as printed.
11. **Korea** — no separate territory; part of Manchuria as printed.
12. **New Britain / Bismarck islets** — small islands in sz-48 with no printed label or
    IPC; best reading is that they are decorative parts of New Guinea territory art.
    Not given their own territory.
13. **Corner-only sea meetings excluded**: sz-8/sz-11 and (after zooming) sz-58/sz-62
    (Japan's land mass lies between), sz-55/sz-65 (sz-56 owns the WUS coast).
14. **Label transcription** — a few territory labels are printed in small type over
    busy art (e.g. central Africa, minor Pacific islands); IPC values and roundels were
    read at zoom and are believed exact, but any engine-visible name mismatch should be
    checked against the art before trusting other editions' spellings.

## Regenerating the diagnostics

```
node tools/tts-extract/fit-axis-map.mjs build      # tables -> map.json (+ validate)
node tools/tts-extract/fit-axis-map.mjs validate   # graph checks only
node tools/tts-extract/fit-axis-map.mjs overlay    # full.png + q00..q13 quadrants
node tools/tts-extract/fit-axis-map.mjs anchors    # projects all setup units via worldFit
```

Overlay colour code: green = land-land, yellow = land-sea, cyan = sea-sea; red dots =
land centers, blue = sea; seam-crossing edges are drawn as two segments running out of
the map edges. Overlays are written to the session scratchpad (`overlay/` subdir), not
into the repo.
