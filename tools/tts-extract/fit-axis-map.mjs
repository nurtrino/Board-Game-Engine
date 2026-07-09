// fit-axis-map.mjs — Axis & Allies Anniversary (mod 1961347286) map-zone golden tools.
//
// The world map is the custom TABLE image (9500x4956), NOT the two Custom_Boards
// (be20f5 = battle board, 128d09 = R&D chart). All coordinates below are art pixels
// in that table image. See games/axis-allies/golden/NOTES.md.
//
// Usage (run from repo root):
//   node tools/tts-extract/fit-axis-map.mjs build     # embedded tables -> golden/map.json (+worldFit) + validate
//   node tools/tts-extract/fit-axis-map.mjs validate  # re-validate existing map.json
//   node tools/tts-extract/fit-axis-map.mjs overlay   # render overlay PNGs (dots + adjacency lines) to scratchpad
//   node tools/tts-extract/fit-axis-map.mjs anchors   # render setup anchors through worldFit for visual check
//
// Overlay verification rule (playbook §2.4): every line must cross exactly one
// printed border (or one coastline for land-sea adjacency); every printed border
// must have a line.

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const requireC = createRequire(path.resolve('client/package.json'));
const sharp = requireC('sharp');

const W = 9500, H = 4956;
const SRC = 'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods/Images/httpssteamusercontentaakamaihdnetugc778493383644115837C6B6428E7FF791B82A1C53642ED9FECF0CCE6450.png';
const GOLDEN = 'games/axis-allies/golden/map.json';
const SCRATCH = 'C:/Users/chase/AppData/Local/Temp/claude/C--Users-chase-Desktop-Board-Game-Engine/83cf08bf-c658-49c6-bd83-6309f28971a2/scratchpad/overlay';

// ---------------------------------------------------------------------------
// Territories: id, printed name, ipc, originalOwner (printed roundel; 'china'
// = KMT sun), center px, flags. vc = victory city name if printed in red.
// ---------------------------------------------------------------------------
const T = [
  // North America + islands
  ['alaska', 'Alaska', 2, 'usa', 8770, 640],
  ['western-canada', 'Western Canada', 1, 'uk', 9300, 700],
  ['eastern-canada', 'Eastern Canada', 3, 'uk', 775, 1235, { vc: 'Ottawa' }],
  ['western-united-states', 'Western United States', 10, 'usa', 9150, 1730, { vc: 'San Francisco' }],
  ['central-united-states', 'Central United States', 6, 'usa', 9385, 1700],
  ['eastern-united-states', 'Eastern United States', 12, 'usa', 350, 2050, { vc: 'Washington', capital: true }],
  ['mexico', 'Mexico', 2, 'usa', 9345, 2160],
  ['panama', 'Panama', 1, 'usa', 150, 2725],
  ['west-indies', 'West Indies', 1, 'usa', 800, 2620],
  ['greenland', 'Greenland', 0, 'usa', 910, 300],
  ['hawaiian-islands', 'Hawaiian Islands', 1, 'usa', 8420, 2810, { vc: 'Honolulu' }],
  ['midway', 'Midway', 0, 'usa', 8300, 2145],
  ['wake-island', 'Wake Island', 0, 'usa', 7750, 2840],
  // South America
  ['northern-south-america', 'Northern South America', 0, 'neutral', 455, 3060, { impassable: true }],
  ['brazil', 'Brazil', 3, 'usa', 900, 3430],
  ['peruvian-central', 'Peruvian Central', 0, 'neutral', 485, 3540, { impassable: true }],
  ['argentina-chile', 'Argentina Chile', 0, 'neutral', 590, 3920, { impassable: true }],
  // Europe
  ['united-kingdom', 'United Kingdom', 8, 'uk', 2020, 1170, { vc: 'London', capital: true }],
  ['eire', 'Eire', 0, 'neutral', 1630, 1230, { impassable: true }],
  ['iceland', 'Iceland', 0, 'uk', 1490, 520],
  ['gibraltar', 'Gibraltar', 0, 'uk', 1730, 2520],
  ['norway', 'Norway', 3, 'germany', 2380, 900],
  ['sweden', 'Sweden', 0, 'neutral', 2645, 1000, { impassable: true }],
  ['finland', 'Finland', 2, 'germany', 3060, 640],
  ['northwestern-europe', 'Northwestern Europe', 2, 'germany', 2260, 1530],
  ['germany', 'Germany', 10, 'germany', 2560, 1660, { vc: 'Berlin', capital: true }],
  ['france', 'France', 6, 'germany', 1960, 1890, { vc: 'Paris' }],
  ['switzerland', 'Switzerland', 0, 'neutral', 2365, 1915, { impassable: true }],
  ['italy', 'Italy', 6, 'italy', 2445, 2170, { vc: 'Rome', capital: true }],
  ['balkans', 'Balkans', 3, 'italy', 2810, 2190],
  ['czechoslovakia-hungary', 'Czechoslovakia Hungary', 2, 'germany', 2905, 1930],
  ['poland', 'Poland', 3, 'germany', 3050, 1500, { vc: 'Warsaw' }],
  ['bulgaria-romania', 'Bulgaria Romania', 2, 'germany', 3050, 2190],
  ['spain', 'Spain', 0, 'neutral', 1680, 2310, { impassable: true }],
  ['turkey', 'Turkey', 0, 'neutral', 3460, 2560, { impassable: true }],
  // USSR
  ['baltic-states', 'Baltic States', 1, 'ussr', 3315, 1085],
  ['karelia', 'Karelia S.S.R.', 2, 'ussr', 3315, 620, { vc: 'Leningrad' }],
  ['archangel', 'Archangel', 2, 'ussr', 4222, 640],
  ['east-poland', 'East Poland', 1, 'ussr', 3380, 1490],
  ['belorussia', 'Belorussia', 1, 'ussr', 3660, 1215],
  ['ukraine', 'Ukraine', 2, 'ussr', 3555, 1935],
  ['eastern-ukraine', 'Eastern Ukraine', 1, 'ussr', 3760, 1655],
  ['russia', 'Russia', 6, 'ussr', 4270, 1265, { vc: 'Moscow', capital: true }],
  ['caucasus', 'Caucasus', 4, 'ussr', 3910, 2130, { vc: 'Stalingrad' }],
  ['kazakh', 'Kazakh S.S.R.', 2, 'ussr', 4480, 2155],
  ['novosibirsk', 'Novosibirsk', 2, 'ussr', 4780, 1425],
  ['urals', 'Urals', 1, 'ussr', 4900, 465],
  ['evenki-national-okrug', 'Evenki National Okrug', 1, 'ussr', 5400, 690],
  ['yakut', 'Yakut S.S.R.', 1, 'ussr', 6050, 435],
  ['stanovoj-chrebet', 'Stanovoj Chrebet', 1, 'ussr', 6520, 865],
  ['buryatia', 'Buryatia S.S.R.', 1, 'ussr', 6885, 1060],
  ['soviet-far-east', 'Soviet Far East', 1, 'ussr', 7222, 545],
  // Middle East / Central Asia
  ['persia', 'Persia', 1, 'uk', 4183, 2810],
  ['trans-jordan', 'Trans-Jordan', 1, 'uk', 3620, 2765],
  ['saudi-arabia', 'Saudi Arabia', 0, 'neutral', 3790, 3210, { impassable: true }],
  ['afganistan', 'Afganistan', 0, 'neutral', 4570, 2620, { impassable: true }],
  ['himalaya', 'Himalaya', 0, 'neutral', 4915, 2810, { impassable: true }],
  ['mongolia', 'Mongolia', 0, 'neutral', 5720, 1390, { impassable: true }],
  // Africa
  ['morocco-algeria', 'Morocco Algeria', 1, 'germany', 2090, 2665],
  ['libya', 'Libya', 1, 'italy', 2550, 2900],
  ['egypt', 'Egypt', 2, 'uk', 3075, 3060],
  ['anglo-egypt-sudan', 'Anglo-Egypt Sudan', 1, 'uk', 3305, 3435],
  ['sahara', 'Sahara', 0, 'neutral', 2255, 3140, { impassable: true }],
  ['french-west-africa', 'French West Africa', 1, 'uk', 1850, 3440],
  ['french-equatorial-africa', 'French Equatorial Africa', 1, 'uk', 2505, 3600],
  ['belgian-congo', 'Belgian Congo', 1, 'uk', 2885, 3920],
  ['italian-africa', 'Italian Africa', 1, 'uk', 3500, 3760],
  ['rhodesia', 'Rhodesia', 1, 'uk', 3305, 4045],
  ['angola', 'Angola', 0, 'neutral', 2722, 4330, { impassable: true }],
  ['mozambique', 'Mozambique', 0, 'neutral', 3360, 4330, { impassable: true }],
  ['union-of-south-africa', 'Union of South Africa', 2, 'uk', 2900, 4600],
  ['french-madagascar', 'French Madagascar', 1, 'uk', 3630, 4480],
  // Asia
  ['india', 'India', 3, 'uk', 4775, 3140, { vc: 'Calcutta' }],
  ['burma', 'Burma', 2, 'uk', 5465, 3140],
  ['french-indo-china-thailand', 'French Indo-China Thailand', 2, 'japan', 5800, 3250],
  ['yunnan', 'Yunnan', 1, 'china', 5405, 2790],
  ['sikang', 'Sikang', 1, 'china', 5165, 2540],
  ['chinghai', 'Chinghai', 1, 'china', 4928, 1980],
  ['ningxia', 'Ningxia', 1, 'china', 5322, 1980],
  ['suiyuan', 'Suiyuan', 1, 'china', 5708, 1975],
  ['hupeh', 'Hupeh', 1, 'china', 5580, 2405],
  ['fukien', 'Fukien', 1, 'china', 5920, 2580],
  ['kwangtung', 'Kwangtung', 1, 'uk', 6022, 2880, { vc: 'Hong Kong' }],
  ['kiangsu', 'Kiangsu', 2, 'china', 6115, 2165, { vc: 'Shanghai' }],
  ['manchuria', 'Manchuria', 3, 'china', 6585, 1460],
  // Japan + Pacific
  ['japan', 'Japan', 8, 'japan', 7180, 1990, { vc: 'Tokyo', capital: true }],
  ['formosa', 'Formosa', 1, 'japan', 6450, 2870],
  ['okinawa', 'Okinawa', 1, 'japan', 7080, 2665],
  ['iwo-jima', 'Iwo Jima', 0, 'japan', 7620, 2300],
  ['caroline-islands', 'Caroline Islands', 0, 'japan', 7390, 3240],
  ['philippine-islands', 'Philippine Islands', 2, 'usa', 6820, 3400, { vc: 'Manila' }],
  ['borneo', 'Borneo', 4, 'uk', 6228, 3790],
  ['east-indies', 'East Indies', 4, 'uk', 5820, 3960],
  ['new-guinea', 'New Guinea', 1, 'uk', 7250, 3960],
  ['solomon-islands', 'Solomon Islands', 0, 'uk', 7985, 4060],
  ['australia', 'Australia', 2, 'uk', 7100, 4460, { vc: 'Sydney' }],
  ['new-zealand', 'New Zealand', 1, 'uk', 8250, 4760],
];

// Sea zone centers = the printed zone numbers on the art.
const SZ = {
  1: [677, 690], 2: [1385, 745], 3: [2370, 383], 4: [3700, 260], 5: [2830, 1115],
  6: [2210, 1115], 7: [1843, 1565], 8: [1478, 1667], 9: [1145, 1775], 10: [735, 2172],
  11: [1128, 2455], 12: [1413, 2688], 13: [2025, 2452], 14: [2700, 2645], 15: [3085, 2790],
  16: [3460, 2255], 17: [1465, 3490], 18: [1095, 3095], 19: [425, 2690], 20: [135, 2950],
  21: [163, 3655], 22: [1222, 3812], 23: [2135, 3935], 24: [1958, 4290], 25: [435, 4620],
  26: [1968, 4675], 27: [2510, 4715], 28: [3335, 4712], 29: [3855, 4820], 30: [4960, 4858],
  31: [5010, 3893], 32: [4295, 3910], 33: [3660, 4128], 34: [4130, 3568], 35: [5045, 3455],
  36: [6067, 3320], 37: [5370, 3550], 38: [5530, 4122], 39: [5938, 4555], 40: [5940, 4820],
  41: [7590, 4820], 42: [7942, 4635], 43: [8995, 4622], 44: [9255, 3785], 45: [8635, 3908],
  46: [7965, 3800], 47: [7562, 4245], 48: [7105, 3685], 49: [6668, 3855], 50: [6800, 3062],
  51: [7680, 3395], 52: [7675, 2615], 53: [8360, 3270], 54: [8938, 3030], 55: [9305, 2610],
  56: [8800, 2075], 57: [8290, 1675], 58: [7828, 1450], 59: [7730, 2065], 60: [7130, 2907],
  61: [6550, 2215], 62: [7072, 1675], 63: [7855, 915], 64: [8218, 1150], 65: [8755, 1112],
};

// One-sided edge list; symmetrized at build. 'sz-N' for sea zones.
const EDGES = `
alaska/western-canada western-canada/eastern-canada western-canada/western-united-states
western-canada/central-united-states western-united-states/central-united-states
western-united-states/mexico central-united-states/mexico central-united-states/eastern-united-states
eastern-united-states/eastern-canada eastern-united-states/mexico mexico/panama
panama/northern-south-america northern-south-america/brazil northern-south-america/peruvian-central
peruvian-central/brazil peruvian-central/argentina-chile brazil/argentina-chile
united-kingdom/eire norway/sweden norway/finland sweden/finland finland/karelia
northwestern-europe/france northwestern-europe/germany germany/france germany/switzerland
germany/italy germany/balkans germany/czechoslovakia-hungary germany/poland
france/switzerland france/italy france/spain switzerland/italy italy/balkans
balkans/czechoslovakia-hungary balkans/bulgaria-romania balkans/turkey
czechoslovakia-hungary/poland czechoslovakia-hungary/bulgaria-romania
czechoslovakia-hungary/east-poland czechoslovakia-hungary/ukraine poland/east-poland
poland/baltic-states bulgaria-romania/ukraine bulgaria-romania/turkey spain/gibraltar
turkey/trans-jordan turkey/persia turkey/caucasus baltic-states/east-poland
baltic-states/belorussia baltic-states/karelia karelia/belorussia karelia/russia
karelia/archangel east-poland/belorussia east-poland/ukraine belorussia/russia
belorussia/ukraine belorussia/eastern-ukraine ukraine/eastern-ukraine ukraine/caucasus
eastern-ukraine/russia eastern-ukraine/caucasus eastern-ukraine/kazakh russia/archangel
russia/caucasus russia/kazakh russia/novosibirsk russia/urals archangel/urals
caucasus/kazakh caucasus/persia kazakh/novosibirsk kazakh/afganistan kazakh/chinghai
novosibirsk/urals novosibirsk/evenki-national-okrug novosibirsk/mongolia
urals/evenki-national-okrug evenki-national-okrug/yakut evenki-national-okrug/mongolia
yakut/stanovoj-chrebet yakut/soviet-far-east stanovoj-chrebet/buryatia
stanovoj-chrebet/soviet-far-east buryatia/mongolia buryatia/manchuria
buryatia/soviet-far-east soviet-far-east/manchuria mongolia/manchuria mongolia/suiyuan
mongolia/ningxia mongolia/chinghai persia/trans-jordan persia/afganistan persia/india
trans-jordan/saudi-arabia trans-jordan/egypt afganistan/india afganistan/chinghai
afganistan/himalaya himalaya/india himalaya/burma himalaya/sikang himalaya/chinghai
india/burma burma/sikang burma/yunnan burma/french-indo-china-thailand
french-indo-china-thailand/yunnan french-indo-china-thailand/kwangtung yunnan/sikang
yunnan/hupeh yunnan/fukien yunnan/kwangtung sikang/chinghai sikang/ningxia sikang/hupeh
chinghai/ningxia ningxia/hupeh ningxia/suiyuan suiyuan/hupeh suiyuan/kiangsu
suiyuan/manchuria hupeh/kiangsu hupeh/fukien fukien/kiangsu fukien/kwangtung
kiangsu/manchuria morocco-algeria/sahara morocco-algeria/libya libya/sahara libya/egypt
egypt/sahara egypt/anglo-egypt-sudan sahara/french-west-africa
sahara/french-equatorial-africa sahara/anglo-egypt-sudan
french-west-africa/french-equatorial-africa french-equatorial-africa/anglo-egypt-sudan
french-equatorial-africa/belgian-congo anglo-egypt-sudan/belgian-congo
anglo-egypt-sudan/rhodesia anglo-egypt-sudan/italian-africa belgian-congo/rhodesia
belgian-congo/angola italian-africa/rhodesia rhodesia/angola rhodesia/mozambique
rhodesia/union-of-south-africa angola/union-of-south-africa mozambique/union-of-south-africa

greenland/sz-1 greenland/sz-2 iceland/sz-2 alaska/sz-64 alaska/sz-65 western-canada/sz-1
western-canada/sz-65 eastern-canada/sz-1 eastern-canada/sz-9 eastern-canada/sz-10
western-united-states/sz-55 eastern-united-states/sz-10 eastern-united-states/sz-19
mexico/sz-19 mexico/sz-55 panama/sz-19 panama/sz-20 west-indies/sz-19
northern-south-america/sz-19 northern-south-america/sz-20 peruvian-central/sz-21
brazil/sz-22 argentina-chile/sz-21 argentina-chile/sz-22 argentina-chile/sz-25
hawaiian-islands/sz-53 midway/sz-56 wake-island/sz-52 united-kingdom/sz-2
united-kingdom/sz-6 united-kingdom/sz-7 eire/sz-2 eire/sz-7 eire/sz-8 norway/sz-3
norway/sz-5 norway/sz-6 sweden/sz-5 finland/sz-3 finland/sz-5 karelia/sz-4 karelia/sz-5
archangel/sz-4 northwestern-europe/sz-5 northwestern-europe/sz-6 germany/sz-5
france/sz-7 france/sz-13 spain/sz-7 spain/sz-12 spain/sz-13 gibraltar/sz-12
gibraltar/sz-13 italy/sz-14 balkans/sz-14 bulgaria-romania/sz-14 bulgaria-romania/sz-16
turkey/sz-15 turkey/sz-16 ukraine/sz-16 caucasus/sz-16 poland/sz-5 baltic-states/sz-5
trans-jordan/sz-15 trans-jordan/sz-34 egypt/sz-15 egypt/sz-34 saudi-arabia/sz-34
persia/sz-34 morocco-algeria/sz-12 morocco-algeria/sz-13 libya/sz-14
anglo-egypt-sudan/sz-34 italian-africa/sz-33 italian-africa/sz-34 french-west-africa/sz-17
french-west-africa/sz-23 french-equatorial-africa/sz-23 belgian-congo/sz-23 angola/sz-24
rhodesia/sz-33 mozambique/sz-28 mozambique/sz-33 union-of-south-africa/sz-26
union-of-south-africa/sz-27 union-of-south-africa/sz-28 french-madagascar/sz-28
french-madagascar/sz-29 french-madagascar/sz-33 india/sz-35 burma/sz-37
french-indo-china-thailand/sz-36 french-indo-china-thailand/sz-37 kwangtung/sz-36
kwangtung/sz-61 fukien/sz-61 kiangsu/sz-61 manchuria/sz-61 manchuria/sz-62
soviet-far-east/sz-62 soviet-far-east/sz-63 japan/sz-58 japan/sz-62 japan/sz-63
formosa/sz-50 formosa/sz-61 okinawa/sz-60 iwo-jima/sz-59 caroline-islands/sz-51
philippine-islands/sz-50 borneo/sz-36 borneo/sz-49 east-indies/sz-36 east-indies/sz-37
east-indies/sz-38 east-indies/sz-39 east-indies/sz-49 new-guinea/sz-47 new-guinea/sz-48
new-guinea/sz-49 solomon-islands/sz-46 australia/sz-40 australia/sz-41 australia/sz-47
australia/sz-49 new-zealand/sz-42

sz-1/sz-2 sz-1/sz-9 sz-2/sz-3 sz-2/sz-8 sz-3/sz-4 sz-3/sz-6 sz-5/sz-6 sz-6/sz-7
sz-7/sz-8 sz-7/sz-12 sz-8/sz-9 sz-8/sz-11 sz-8/sz-12 sz-9/sz-10 sz-9/sz-11 sz-10/sz-11
sz-10/sz-19 sz-11/sz-12 sz-11/sz-18 sz-11/sz-19 sz-12/sz-13 sz-12/sz-18 sz-13/sz-14
sz-14/sz-15 sz-15/sz-16 sz-15/sz-34 sz-17/sz-18 sz-17/sz-22 sz-17/sz-23 sz-18/sz-22
sz-19/sz-20 sz-20/sz-21 sz-20/sz-55 sz-21/sz-25 sz-21/sz-44 sz-22/sz-23 sz-22/sz-24
sz-22/sz-25 sz-23/sz-24 sz-24/sz-25 sz-24/sz-26 sz-25/sz-26 sz-25/sz-43 sz-26/sz-27
sz-27/sz-28 sz-28/sz-29 sz-29/sz-30 sz-29/sz-32 sz-29/sz-33 sz-30/sz-31 sz-30/sz-40
sz-31/sz-32 sz-31/sz-35 sz-31/sz-38 sz-32/sz-33 sz-32/sz-34 sz-33/sz-34 sz-34/sz-35
sz-35/sz-37 sz-36/sz-37 sz-36/sz-49 sz-36/sz-50 sz-36/sz-61 sz-37/sz-38 sz-38/sz-39
sz-39/sz-40 sz-39/sz-49 sz-40/sz-41 sz-41/sz-42 sz-41/sz-47 sz-42/sz-43 sz-42/sz-46
sz-42/sz-47 sz-43/sz-44 sz-43/sz-45 sz-44/sz-45 sz-44/sz-54 sz-44/sz-55 sz-45/sz-46
sz-45/sz-53 sz-45/sz-54 sz-46/sz-47 sz-46/sz-48 sz-46/sz-51 sz-47/sz-48 sz-47/sz-49
sz-48/sz-49 sz-48/sz-50 sz-48/sz-51 sz-49/sz-50 sz-50/sz-51 sz-50/sz-60 sz-50/sz-61
sz-51/sz-52 sz-51/sz-53 sz-52/sz-53 sz-52/sz-59 sz-52/sz-60 sz-53/sz-54 sz-53/sz-56
sz-54/sz-55 sz-54/sz-56 sz-55/sz-56 sz-55/sz-65 sz-56/sz-57 sz-57/sz-58 sz-57/sz-63
sz-57/sz-64 sz-58/sz-59 sz-58/sz-62 sz-58/sz-63 sz-59/sz-60 sz-60/sz-61 sz-60/sz-62
sz-61/sz-62 sz-62/sz-63 sz-63/sz-64 sz-64/sz-65
`.trim().split(/\s+/).map(s => s.split('/'));

// Edges that cross the board seam (map wraps horizontally through North America
// and the east Pacific). Drawn as two segments out the edges.
const SEAM_EDGES = new Set([
  'western-canada/eastern-canada', 'central-united-states/eastern-united-states',
  'eastern-united-states/mexico', 'western-canada/sz-1',
  'sz-20/sz-55', 'sz-21/sz-44', 'sz-25/sz-43',
].map(s => s.split('/').sort().join('/')));

const CANALS = [
  { id: 'panama-canal', sea: ['sz-19', 'sz-20'], land: ['panama'],
    rule: 'Sea movement between sz-19 and sz-20 requires control of Panama.' },
  { id: 'suez-canal', sea: ['sz-15', 'sz-34'], land: ['egypt', 'trans-jordan'],
    rule: 'Sea movement between sz-15 and sz-34 requires control of both Egypt and Trans-Jordan.' },
  { id: 'turkish-straits', sea: ['sz-15', 'sz-16'], land: ['turkey'],
    rule: 'Passage runs through Turkey, a strict neutral: closed to all ships in the base game.' },
];

// worldFit anchors: TTS world pos of setup units whose territory is unambiguous
// -> art-pixel target (the territory roundel/city). Fitted as a full affine
// (rotation-capable); worst residuals dropped.
const ANCHORS = [
  // 1942 AA guns
  { w: [-11.171, 20.397], px: [3450, 700], note: 'karelia AA' },
  { w: [-28.189, 14.733], px: [2020, 1275], note: 'uk AA' },
  { w: [-18.006, 10.486], px: [2650, 1660], note: 'germany AA' },
  { w: [-38.82, 6.913], px: [500, 2000], note: 'eus AA' },
  { w: [-8.365, 1.891], px: [3908, 2170], note: 'caucasus AA' },
  { w: [-26.692, 7.094], px: [1965, 1995], note: 'france AA' },
  { w: [-19.614, 0.171], px: [2478, 2210], note: 'italy AA' },
  { w: [-1.714, -5.85], px: [4775, 3183], note: 'india AA' },
  { w: [21.68, 4.803], px: [7150, 2050], note: 'japan AA' },
  { w: [18.307, -21.03], px: [7100, 4530], note: 'australia AA' },
  { w: [40.307, 10.62], px: [9150, 1810], note: 'wus AA' },
  // 1942 ICs
  { w: [-12.508, 21.227], px: [3450, 700], note: 'karelia IC' },
  { w: [-26.366, 15.571], px: [2020, 1170], note: 'uk IC' },
  { w: [-19.526, 10.553], px: [2650, 1660], note: 'germany IC' },
  { w: [-2.108, 15.782], px: [4400, 1265], note: 'russia IC' },
  { w: [-20.779, 2.452], px: [2478, 2210], note: 'italy IC' },
  { w: [-9.206, 2.995], px: [3908, 2170], note: 'caucasus IC' },
  { w: [23.708, 10.602], px: [7180, 1900], note: 'japan IC' },
  { w: [41.293, 10.698], px: [9150, 1730], note: 'wus IC' },
  { w: [-37.172, 8.052], px: [700, 1950], note: 'eus IC' },
];

function fitWorld() {
  // solve px = a*wx + b*wz + e ; py = c*wx + d*wz + f  (least squares, drop worst 25%)
  let use = ANCHORS.slice();
  let sol = null;
  for (let iter = 0; iter < 4; iter++) {
    const n = use.length;
    // normal equations for [a,b,e] and [c,d,f]
    let Sxx = 0, Sxz = 0, Sx = 0, Szz = 0, Sz = 0, S1 = n;
    let Spx = 0, Spxx = 0, Spxz = 0, Spy = 0, Spyx = 0, Spyz = 0;
    for (const a of use) {
      const [x, z] = a.w, [px, py] = a.px;
      Sxx += x * x; Sxz += x * z; Sx += x; Szz += z * z; Sz += z;
      Spx += px; Spxx += px * x; Spxz += px * z;
      Spy += py; Spyx += py * x; Spyz += py * z;
    }
    const M = [[Sxx, Sxz, Sx], [Sxz, Szz, Sz], [Sx, Sz, S1]];
    const solve3 = (M, v) => {
      const m = M.map(r => r.slice()); const b = v.slice();
      for (let i = 0; i < 3; i++) {
        let p = i; for (let r = i + 1; r < 3; r++) if (Math.abs(m[r][i]) > Math.abs(m[p][i])) p = r;
        [m[i], m[p]] = [m[p], m[i]]; [b[i], b[p]] = [b[p], b[i]];
        for (let r = i + 1; r < 3; r++) { const f = m[r][i] / m[i][i]; for (let c = i; c < 3; c++) m[r][c] -= f * m[i][c]; b[r] -= f * b[i]; }
      }
      const out = [0, 0, 0];
      for (let i = 2; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < 3; c++) s -= m[i][c] * out[c]; out[i] = s / m[i][i]; }
      return out;
    };
    const [a, b, e] = solve3(M, [Spxx, Spxz, Spx]);
    const [c, d, f] = solve3(M, [Spyx, Spyz, Spy]);
    sol = { a, b, e, c, d, f };
    const res = use.map(an => {
      const [x, z] = an.w;
      const px = a * x + b * z + e, py = c * x + d * z + f;
      return { an, r: Math.hypot(px - an.px[0], py - an.px[1]) };
    }).sort((p, q) => q.r - p.r);
    if (iter < 3 && use.length > 12) use = res.slice(Math.ceil(res.length * 0.15)).map(r => r.an);
  }
  // report
  const rep = ANCHORS.map(an => {
    const [x, z] = an.w;
    const px = sol.a * x + sol.b * z + sol.e, py = sol.c * x + sol.d * z + sol.f;
    return `${an.note}: fit(${px.toFixed(0)},${py.toFixed(0)}) target(${an.px}) res ${Math.hypot(px - an.px[0], py - an.px[1]).toFixed(0)}px`;
  });
  return { sol, rep, kept: use.length };
}

function buildMap() {
  const { sol, rep, kept } = fitWorld();
  const adj = new Map();
  const add = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); };
  for (const [a, b] of EDGES) { add(a, b); add(b, a); }
  const territories = T.map(([id, name, ipc, owner, px, py, fl = {}]) => ({
    id, name, ipc, originalOwner: owner,
    isVictoryCity: !!fl.vc, ...(fl.vc ? { victoryCityName: fl.vc } : {}),
    isCapital: !!fl.capital, isImpassable: !!fl.impassable,
    center: { px, py },
    adj: [...(adj.get(id) || [])].sort(),
  }));
  const seaZones = Object.entries(SZ).map(([n, [px, py]]) => ({
    id: `sz-${n}`, number: +n, center: { px, py },
    adj: [...(adj.get(`sz-${n}`) || [])].sort(),
  }));
  const map = {
    source: {
      workshopId: '1961347286',
      note: 'Map art is the custom TABLE image (TableURL), not the two Custom_Boards. be20f5 = battle board, 128d09 = National Production/R&D chart.',
      tableImageURL: 'http://cloud-3.steamusercontent.com/ugc/778493383644115837/C6B6428E7FF791B82A1C53642ED9FECF0CCE6450/',
      tableImageCache: 'httpssteamusercontentaakamaihdnetugc778493383644115837C6B6428E7FF791B82A1C53642ED9FECF0CCE6450.png',
    },
    art: {
      width: W, height: H,
      wrapsHorizontally: true,
      seam: 'x=0 and x=9500 are the same meridian; the seam cuts through central Canada, the central USA, Mexico and the east Pacific. Seam adjacencies: western-canada~eastern-canada, central-united-states~eastern-united-states, eastern-united-states~mexico, western-canada~sz-1, sz-20~sz-55, sz-21~sz-44, sz-25~sz-43.',
      sideBoards: [
        { guid: 'be20f5', role: 'battle-board', image: 'httpssteamusercontentaakamaihdnetugc7784934896593646649100D1E4EC2E5855100AA2DFC120E98176DE3545.jpg' },
        { guid: '128d09', role: 'research-chart', image: 'httpssteamusercontentaakamaihdnetugc778493489659396932D30E43976E93E812D7FD57470AEA87373331A491.jpg' },
      ],
    },
    worldFit: {
      note: 'Affine TTS world (posX,posZ) -> table art px, least-squares fitted from ' + kept + ' setup-golden anchor units (ICs + AA guns at known territories). Setup unit placement is hand-jittered (same IC differs up to ~3.5 world units between 1941/1942 saves) so expect ~100-300px residuals; zone-assign by nearest/containing region and review border cases.',
      px: ['a*wx + b*wz + e', 'c*wx + d*wz + f'],
      a: sol.a, b: sol.b, e: sol.e, c: sol.c, d: sol.d, f: sol.f,
    },
    canals: CANALS,
    territories, seaZones,
  };
  fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
  fs.writeFileSync(GOLDEN, JSON.stringify(map, null, 1));
  console.log('wrote', GOLDEN, `(${territories.length} territories, ${seaZones.length} sea zones)`);
  console.log('worldFit anchors kept:', kept);
  for (const r of rep) console.log('  ', r);
  return map;
}

function validate(map) {
  const ids = new Set([...map.territories.map(t => t.id), ...map.seaZones.map(z => z.id)]);
  const all = [...map.territories, ...map.seaZones];
  let fail = 0;
  const err = (m) => { console.error('FAIL:', m); fail++; };
  const adjOf = new Map(all.map(o => [o.id, new Set(o.adj)]));
  for (const o of all) {
    for (const n of o.adj) {
      if (!ids.has(n)) err(`${o.id} -> unknown id ${n}`);
      else if (!adjOf.get(n).has(o.id)) err(`asymmetric: ${o.id} -> ${n} but not back`);
      if (n === o.id) err(`self-adjacent: ${o.id}`);
    }
    if (o.adj.length === 0 && !o.isImpassable) err(`isolated: ${o.id}`);
  }
  // dupes
  const seen = new Set();
  for (const o of all) { if (seen.has(o.id)) err('dup id ' + o.id); seen.add(o.id); }
  // sea zone count + numbers 1..65
  for (let n = 1; n <= 65; n++) if (!ids.has('sz-' + n)) err('missing sz-' + n);
  // canals reference real ids
  for (const c of map.canals) for (const r of [...c.sea, ...c.land]) if (!ids.has(r)) err(`canal ${c.id} refs ${r}`);
  console.log(fail ? `VALIDATE: ${fail} failures` : 'VALIDATE: ok — ids resolve, adjacency symmetric, no isolated zones');
  return fail === 0;
}

const centerOf = (map) => {
  const m = new Map();
  for (const t of map.territories) m.set(t.id, [t.center.px, t.center.py, 'land', t]);
  for (const z of map.seaZones) m.set(z.id, [z.center.px, z.center.py, 'sea', z]);
  return m;
};

async function overlay(map) {
  fs.mkdirSync(SCRATCH, { recursive: true });
  const C = centerOf(map);
  // collect unique edges
  const edges = new Set();
  for (const [id, [, , ,]] of C) { }
  for (const o of [...map.territories, ...map.seaZones])
    for (const n of o.adj) edges.add([o.id, n].sort().join('/'));

  const segs = [];
  for (const e of edges) {
    const [a, b] = e.split('/');
    const [x1, y1, k1] = C.get(a), [x2, y2, k2] = C.get(b);
    const kind = k1 === 'land' && k2 === 'land' ? 'll' : (k1 === 'sea' && k2 === 'sea' ? 'ss' : 'ls');
    if (SEAM_EDGES.has(e) || Math.abs(x1 - x2) > W / 2) {
      // wrap: draw from the right-side point out the right edge, and into the left edge
      const [rx, ry] = x1 > x2 ? [x1, y1] : [x2, y2];
      const [lx, ly] = x1 > x2 ? [x2, y2] : [x1, y1];
      const t = (W - rx) / (W - rx + lx || 1);
      const ym = ry + (ly - ry) * t;
      segs.push({ x1: rx, y1: ry, x2: W, y2: ym, kind, e });
      segs.push({ x1: 0, y1: ym, x2: lx, y2: ly, kind, e });
    } else {
      segs.push({ x1, y1, x2, y2, kind, e });
    }
  }
  const colors = { ll: '#00ff40', ls: '#ffe000', ss: '#00e5ff' };

  function svgFor(x0, y0, w, h, scale) {
    let s = `<svg width="${Math.round(w * scale)}" height="${Math.round(h * scale)}" xmlns="http://www.w3.org/2000/svg">`;
    s += `<g transform="scale(${scale}) translate(${-x0},${-y0})">`;
    for (const g of segs) {
      if (Math.max(g.x1, g.x2) < x0 - 60 || Math.min(g.x1, g.x2) > x0 + w + 60) continue;
      if (Math.max(g.y1, g.y2) < y0 - 60 || Math.min(g.y1, g.y2) > y0 + h + 60) continue;
      s += `<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" stroke="${colors[g.kind]}" stroke-width="${3 / scale > 6 ? 6 : 3 / scale}" opacity="0.85"/>`;
    }
    for (const [id, [x, y, k]] of C) {
      if (x < x0 - 60 || x > x0 + w + 60 || y < y0 - 60 || y > y0 + h + 60) continue;
      const col = k === 'land' ? '#ff2020' : '#2040ff';
      const r = 7 / Math.sqrt(scale);
      s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}" stroke="white" stroke-width="2"/>`;
      const label = id.replace(/^sz-/, '');
      const fs2 = Math.round(15 / Math.sqrt(scale));
      s += `<text x="${x + r + 2}" y="${y - r - 2}" font-size="${fs2}" font-family="sans-serif" fill="white" stroke="black" stroke-width="0.6" paint-order="stroke">${label}</text>`;
    }
    s += '</g></svg>';
    return Buffer.from(s);
  }

  // full-map overview
  {
    const scale = 0.22;
    const base = await sharp(SRC).resize(Math.round(W * scale)).toBuffer();
    const ov = svgFor(0, 0, W, H, scale);
    await sharp(base).composite([{ input: ov }]).png().toFile(path.join(SCRATCH, 'full.png'));
    console.log('wrote overlay/full.png');
  }
  // quadrants 4x2 with overlap
  const cols = 4, rows = 2, qw = 2600, qh = 2700, scale = 0.56;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x0 = Math.min(Math.round(c * (W - qw) / (cols - 1)), W - qw);
    const y0 = Math.min(Math.round(r * (H - qh) / (rows - 1)), H - qh);
    const buf = await sharp(SRC).extract({ left: x0, top: y0, width: qw, height: qh })
      .resize(Math.round(qw * scale)).toBuffer();
    const ov = svgFor(x0, y0, qw, qh, scale);
    const name = `q${r}${c}.png`;
    await sharp(buf).composite([{ input: ov }]).png().toFile(path.join(SCRATCH, name));
    console.log('wrote overlay/' + name);
  }
}

async function anchors(map) {
  fs.mkdirSync(SCRATCH, { recursive: true });
  const wf = map.worldFit;
  const toPx = (x, z) => [wf.a * x + wf.b * z + wf.e, wf.c * x + wf.d * z + wf.f];
  let s = `<svg width="${Math.round(W * 0.22)}" height="${Math.round(H * 0.22)}" xmlns="http://www.w3.org/2000/svg"><g transform="scale(0.22)">`;
  for (const f of ['setup-1941.raw.json', 'setup-1942.raw.json']) {
    const j = JSON.parse(fs.readFileSync('games/axis-allies/golden/' + f, 'utf8'));
    const col = f.includes('1941') ? '#ff40ff' : '#40ff80';
    for (const u of j.units) {
      const [px, py] = toPx(u.pos[0], u.pos[1]);
      s += `<circle cx="${px}" cy="${py}" r="9" fill="none" stroke="${col}" stroke-width="4" opacity="0.9"/>`;
    }
  }
  s += '</g></svg>';
  const base = await sharp(SRC).resize(Math.round(W * 0.22)).toBuffer();
  await sharp(base).composite([{ input: Buffer.from(s) }]).png().toFile(path.join(SCRATCH, 'anchors.png'));
  console.log('wrote overlay/anchors.png (magenta=1941, green=1942 setup units through worldFit)');
}

const cmd = process.argv[2] || 'build';
if (cmd === 'build') { const m = buildMap(); validate(m); }
else if (cmd === 'validate') validate(JSON.parse(fs.readFileSync(GOLDEN, 'utf8')));
else if (cmd === 'overlay') await overlay(JSON.parse(fs.readFileSync(GOLDEN, 'utf8')));
else if (cmd === 'anchors') await anchors(JSON.parse(fs.readFileSync(GOLDEN, 'utf8')));
else console.error('unknown cmd', cmd);
