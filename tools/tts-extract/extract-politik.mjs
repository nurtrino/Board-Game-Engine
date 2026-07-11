// Politik - stage the authentic TTS workshop assets and deterministic goldens.
// Source: workshop 3460664356, official in-mod rulebook v3.4.26.
//
// Outputs:
//   games/politik/golden/{manifest,board,cards}.json
//   shared/src/politik/data.json
//   client/public/politik/* + scene.json + rulebook.pdf
//
// Run: node tools/tts-extract/extract-politik.mjs

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MODS = 'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods';
const SAVE = path.join(MODS, 'Workshop', '3460664356.json');
const OUT = path.join(ROOT, 'client/public/politik');
const GOLDEN = path.join(ROOT, 'games/politik/golden');
const SHARED = path.join(ROOT, 'shared/src/politik');
for (const dir of [OUT, GOLDEN, SHARED]) fs.mkdirSync(dir, { recursive: true });

const save = JSON.parse(fs.readFileSync(SAVE, 'utf8'));
const fail = (message) => { throw new Error(`Politik extractor: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };
const munge = (url) => url.replace(/[^A-Za-z0-9]/g, '');

const byGuid = {};
function walk(object) {
  byGuid[object.GUID] = object;
  for (const child of object.ContainedObjects ?? []) walk(child);
  for (const state of Object.values(object.States ?? {})) walk(state);
}
for (const object of save.ObjectStates) walk(object);
const object = (guid) => byGuid[guid] ?? fail(`missing object ${guid}`);

function cached(url, kind = 'image') {
  if (!url) fail(`empty ${kind} URL`);
  const dir = kind === 'pdf' ? 'PDF' : kind === 'model' ? 'Models' : 'Images';
  const extensions = kind === 'pdf' ? ['.PDF', '.pdf'] : kind === 'model' ? ['.obj'] : ['.png', '.jpg', '.jpeg'];
  const base = path.join(MODS, dir, munge(url));
  const found = extensions.map((extension) => base + extension).find((file) => fs.existsSync(file));
  return found ?? fail(`uncached ${kind}: ${url}`);
}

async function stageImage(url, filename, options = {}) {
  const source = cached(url);
  const image = sharp(source, { failOn: 'none' });
  if (options.width) image.resize({ width: options.width, withoutEnlargement: true });
  await image.webp({ quality: options.quality ?? 88, effort: 5 }).toFile(path.join(OUT, filename));
  return `/politik/${filename}`;
}

function cardRef(card) {
  const cardId = Number(card.CardID);
  assert(Number.isFinite(cardId), `card ${card.GUID} has no CardID`);
  return {
    id: `${Math.floor(cardId / 100)}:${cardId % 100}`,
    sheet: Math.floor(cardId / 100),
    cell: cardId % 100,
    guid: card.GUID,
  };
}

function deckCards(guid) {
  const deck = object(guid);
  const cards = (deck.ContainedObjects ?? []).map(cardRef);
  assert(cards.length > 0, `${guid} contains no cards`);
  return cards;
}

const POLITIK_SHEETS = Array.from({ length: 18 }, (_, index) => String(10417 + index));
const allSheets = {};
for (const candidate of Object.values(byGuid)) {
  for (const [id, sheet] of Object.entries(candidate.CustomDeck ?? {})) {
    allSheets[id] ??= sheet;
  }
}

const requiredSheets = [
  '10359', '10361', '10362', '10381',
  '10406', '10407', '10408', '10409', '10412', '10414', '10416',
  ...POLITIK_SHEETS, '10435', '10436',
];
for (const id of requiredSheets) assert(allSheets[id], `missing card sheet ${id}`);

const sheets = {};
for (const id of requiredSheets) {
  const source = allSheets[id];
  sheets[id] = {
    face: await stageImage(source.FaceURL, `sheet-${id}.webp`, {
      width: Number(source.NumWidth) > 1 ? 3060 : 1200,
      quality: Number(source.NumWidth) > 1 ? 90 : 88,
    }),
    back: await stageImage(source.BackURL, `back-${id}.webp`, { width: 900, quality: 88 }),
    cols: Number(source.NumWidth),
    rows: Number(source.NumHeight),
    uniqueBack: Boolean(source.UniqueBack),
  };
}

const boardObject = object('3a55e6');
const boardSource = cached(boardObject.CustomImage.ImageURL);
const boardMeta = await sharp(boardSource).metadata();
assert(boardMeta.width === 5760 && boardMeta.height === 3840,
  `board art changed: expected 5760x3840, got ${boardMeta.width}x${boardMeta.height}`);
const boardImage = await stageImage(boardObject.CustomImage.ImageURL, 'board.webp', { width: 3200, quality: 91 });
const nationBoardImage = await stageImage(object('f1c432').CustomImage.ImageURL, 'nation-board.webp', { width: 933, quality: 91 });
const resourcePadImage = await stageImage(object('2b84d7').CustomImage.ImageURL, 'resource-pad.webp', { width: 520, quality: 90 });

const tagged = (tag) => Object.values(byGuid).find((candidate) => (candidate.Tags ?? []).includes(tag));
const componentArt = {
  companyBoard: await stageImage(tagged('company board').CustomImage.ImageURL, 'company-board.webp', { width: 600, quality: 91 }),
  margin: await stageImage(tagged('margin token').CustomImage.ImageURL, 'margin-token.webp', { width: 256, quality: 91 }),
  corporateLeader: await stageImage(tagged('corp leader').CustomImage.ImageURL, 'leader-corporate.webp', { width: 280, quality: 91 }),
  politicalLeader: await stageImage(tagged('political leader').CustomImage.ImageURL, 'leader-political.webp', { width: 280, quality: 91 }),
  markets: {},
};
for (const industry of ['media', 'energy', 'financial', 'humanities', 'technology', 'manufacturing']) {
  componentArt.markets[industry] = await stageImage(
    tagged(`${industry} token`).CustomImage.ImageURL,
    `market-${industry}.webp`,
    { width: 256, quality: 91 },
  );
}

// Authentic selection tile from the board's POLITIK/press area.
await sharp(boardSource)
  .extract({ left: 4550, top: 20, width: 1180, height: 940 })
  .resize(1280, 760, { fit: 'cover' })
  .webp({ quality: 91, effort: 5 })
  .toFile(path.join(OUT, 'logo.webp'));

const pdf = object('b18209');
const pdfSource = cached(pdf.CustomPDF.PDFUrl, 'pdf');
const pdfTarget = path.join(OUT, 'rulebook.pdf');
if (!fs.existsSync(pdfTarget) || fs.statSync(pdfTarget).size !== fs.statSync(pdfSource).size) {
  fs.copyFileSync(pdfSource, pdfTarget);
}

const px = (x, y) => [Math.round(x * 3), Math.round(y * 3)];
const states = [
  ['A1', 'Elrun', 'A', 'research', 338.333, 420.667],
  ['A2', 'Capro', 'A', 'food', 485.333, 372],
  ['A3', 'Rodjev', 'A', 'food', 698, 359],
  ['A4', 'Qisio', 'A', 'carbon', 340.333, 584.333],
  ['A5', 'Kiri Haka', 'A', 'food', 498, 664],
  ['A6', 'Urek', 'A', 'carbon', 705, 476],
  ['B1', 'Madasa', 'B', 'food', 963.333, 335.333],
  ['B2', 'Jessra', 'B', 'carbon', 1150, 303],
  ['B3', 'Zibir', 'B', 'research', 1515.667, 120],
  ['B4', 'Hanasi', 'B', 'food', 1092.333, 498.333],
  ['B5', 'Onix', 'B', 'food', 1248, 374],
  ['B8', 'Baasa', 'B', 'carbon', 1492, 272],
  ['C1', 'Brontif', 'C', 'carbon', 1312, 538],
  ['C2', 'Moxis', 'C', 'food', 1472, 595],
  ['C3', 'Tibero', 'C', 'food', 1524.667, 462],
  ['C4', 'Centini', 'C', 'carbon', 1305.667, 671.333],
  ['C5', 'Santet', 'C', 'research', 1494, 758],
  ['C6', 'Heshing', 'C', 'carbon', 1622, 698],
  ['D1', 'Emos', 'D', 'carbon', 1054, 679],
  ['D2', 'Aplos', 'D', 'food', 1060, 804],
  ['D3', 'Verrat', 'D', 'carbon', 1308, 918],
  ['D4', 'Iniza', 'D', 'research', 824, 976],
  ['D5', 'Roqoa', 'D', 'research', 973, 908],
  ['D6', 'Parapin', 'D', 'food', 1111, 964],
  ['E1', 'Fang Ro', 'E', 'food', 378.333, 1032.333],
  ['E2', 'Sonu', 'E', 'food', 552.667, 898.333],
  ['E3', 'Osa Tempro', 'E', 'carbon', 600, 796],
  ['E4', 'Adaron', 'E', 'research', 480, 1124],
  ['E5', 'Tahn Ticca', 'E', 'carbon', 611.667, 989],
  ['E6', 'Hypha', 'E', 'food', 781, 752.667],
].map(([id, name, region, benefit, x, y]) => ({ id, name, region, benefit, px: px(x, y) }));

const stations = [
  { id: 'X1', name: 'Nova', regions: ['A', 'B'], px: px(843, 466), card: 0 },
  { id: 'X2', name: 'Meza', regions: ['B', 'C'], px: px(1411, 383), card: 1 },
  { id: 'X5', name: 'Luna', regions: ['C', 'D'], px: px(1251, 782), card: 4 },
  { id: 'X4', name: 'Rosa', regions: ['D', 'E'], px: px(903, 770), card: 3 },
  { id: 'X3', name: 'Arca', regions: ['E', 'A'], px: px(369, 829), card: 2 },
];

// Printed State routes. Military Clash Influence may only be Focused from
// locations connected to the target by one of these board lines.
const adjacency = [
  ['X3', 'A4'], ['A4', 'A1'], ['A4', 'A5'], ['A5', 'A6'],
  ['A6', 'A3'], ['A3', 'A2'], ['A2', 'A1'], ['A6', 'X1'],
  ['X1', 'B1'], ['B1', 'B4'], ['B4', 'B2'], ['B2', 'B3'],
  ['B3', 'B8'], ['B8', 'B5'], ['B5', 'B4'], ['B5', 'X2'],
  ['X2', 'C3'], ['C3', 'C2'], ['C3', 'C6'], ['C6', 'C5'],
  ['C5', 'C2'], ['C2', 'C1'], ['C2', 'C4'], ['C4', 'X5'],
  ['X5', 'D3'], ['D3', 'D2'], ['D3', 'D6'], ['D6', 'D5'],
  ['D5', 'D2'], ['D2', 'D1'], ['D5', 'D4'], ['D1', 'X4'],
  ['X4', 'E6'], ['E6', 'E5'], ['E5', 'E2'], ['E5', 'E4'],
  ['E2', 'E3'], ['E2', 'E1'], ['E1', 'E4'], ['E2', 'X3'],
];

const council = [
  // Centers of the six large black Support fields, not the small header icons.
  ['chair', 'Chair', 810.667, 1216.667], ['justice', 'Justice', 1009, 1216.667],
  ['commerce', 'Commerce', 1207.667, 1216.667], ['labor', 'Labor', 1406, 1216.667],
  ['intel', 'Intel', 1604.333, 1216.667], ['defense', 'Defense', 1802.667, 1216.667],
].map(([id, name, x, y]) => ({ id, name, px: px(x, y) }));

const industries = [
  ['media', 'Media', 280, 58.667, '#f28c59'], ['energy', 'Energy', 279.333, 105.667, '#667344'],
  ['financial', 'Financial', 280, 152.667, '#779650'], ['humanities', 'Humanities', 280, 200, '#da6384'],
  ['technology', 'Technology', 280, 246.667, '#2eb4c8'], ['manufacturing', 'Manufacturing', 280, 293.667, '#6f9887'],
].map(([id, name, x, y, color]) => ({ id, name, color, px: px(x, y) }));

const bases = [
  ['capitalism', 'Capitalism', 1803, 467.667, '#68a07c'],
  ['communism', 'Communism', 1803, 621.333, '#dd413c'],
  ['statism', 'Statism', 1802.667, 775.333, '#76528e'],
  ['fascism', 'Fascism', 1803, 929.333, '#d52469'],
].map(([id, name, x, y, color]) => ({ id, name, color, px: px(x, y) }));

const prices = {
  food: 8, carbon: 5, research: 5, campaign: 5, clash: 2, educate: 2,
};
const priceTrackerGuids = {
  food: '0a732d', carbon: 'da8ca3', research: 'a04cb4',
  campaign: 'be7d07', clash: 'abfcb0', educate: '80be5e',
};
function priceSlots(guid) {
  const script = object(guid).LuaScript ?? '';
  const slots = [...script.matchAll(/\{pos\s*=\s*\{\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\}/g)]
    .map((match) => [
      Math.round(Number(match[1]) * 192 + 2880),
      Math.round(-Number(match[3]) * 192 + 2400),
    ]);
  assert(slots.length === 10, `${guid} expected 10 price slots, got ${slots.length}`);
  return slots;
}
const priceRows = Object.keys(prices).map((id) => ({
  id, px: priceSlots(priceTrackerGuids[id])[0], slots: priceSlots(priceTrackerGuids[id]),
  start: prices[id], min: 1, max: 10,
}));

const powerGrabs = {
  // Centers of the printed crown rings, deliberately clear of condition text.
  military: px(900.333, 597.333), political: px(1386.333, 1026.667), corporate: px(440, 272.667),
};
const nationalActions = {
  // Illustration centers keep each Nation's used token clear of rules text.
  income: px(891.333, 183.333), rally: px(1036, 183.333), produce: px(1180.333, 183.333), refresh: px(1325, 183.333),
};

const nationDefs = [
  ['arden', 'Arden', 25, 1, 2, 1, 1, 0, ['specializations', 'homeland']],
  ['centina', 'Centina', 35, 0, 1, 1, 1, 1, ['cultureOfOpenness', 'intensification']],
  ['granSanti', 'Gran Santi', 25, 2, 0, 1, 1, 2, ['intimidationTactics', 'steelyWit']],
  ['indoverra', 'Indoverra', 20, 0, 3, 1, 1, 3, ['honorCulture', 'oathOfPoverty']],
  ['isantIsay', 'Isant Isay', 35, 1, 1, 1, 1, 4, ['assuredStability', 'loftyRhetoric']],
  ['libris', 'Libris', 30, 1, 1, 1, 1, 5, ['holisticLearnings', 'unity']],
  ['mountRoq', 'Mount Roq', 20, 2, 1, 1, 1, 6, ['improvisation', 'proteges']],
  ['neometro', 'Neometro', 40, 0, 0, 1, 1, 7, ['backchannels', 'cryptocracy']],
  ['rodgrod', 'Rodgrod', 30, 2, 0, 1, 1, 8, ['redEmpire', 'petrostate']],
  ['theBaaslands', 'The Baaslands', 30, 1, 0, 1, 2, 9, ['dogmatic', 'greyArea']],
  ['ticcaRepublic', 'Ticca Republic', 35, 0, 0, 2, 1, 10, ['birthright', 'oldMoney']],
  ['utp', 'UTP', 40, 0, 0, 1, 1, 11, ['catchAndKill', 'marketmaker']],
].map(([id, name, capital, carbon, food, support, leaders, cell, propaganda]) => ({
  id, name, capital, carbon, food, support, leaders, card: { sheet: 10414, cell }, propaganda,
}));

const propagandaDefs = [
  ['specializations', 'Specializations', 0], ['homeland', 'Homeland', 1],
  ['intensification', 'Intensification', 2], ['cultureOfOpenness', 'Culture of Openness', 3],
  ['steelyWit', 'Steely Wit', 4], ['intimidationTactics', 'Intimidation Tactics', 5],
  ['oathOfPoverty', 'Oath of Poverty', 6], ['honorCulture', 'Honor Culture', 7],
  ['assuredStability', 'Assured Stability', 8], ['loftyRhetoric', 'Lofty Rhetoric', 9],
  ['holisticLearnings', 'Holistic Learnings', 10], ['unity', 'Unity', 11],
  ['proteges', 'Proteges', 12], ['improvisation', 'Improvisation', 13],
  ['backchannels', 'Backchannels', 14], ['cryptocracy', 'Cryptocracy', 15],
  ['redEmpire', 'Red Empire', 16], ['petrostate', 'Petrostate', 17],
  ['greyArea', 'Grey Area', 18], ['dogmatic', 'Dogmatic', 19],
  ['oldMoney', 'Old Money', 20], ['birthright', 'Birthright', 21],
  ['marketmaker', 'Marketmaker', 22], ['catchAndKill', 'Catch and Kill', 23],
].map(([id, name, cell]) => ({ id, name, card: { sheet: 10416, cell } }));

// The opening Startup deck is outside the 412-card OCR catalog. These values
// are transcribed from authentic sheet 10435 so the first Company play never
// falls back to guessed Industry, Margin, or cost data.
const startupDefs = [
  ['10435:0', 'RTU', 'energy', 2, 15, 0, true],
  ['10435:1', 'Skyword', 'energy', 3, 15, 0, false],
  ['10435:2', 'Cavalier Capital', 'financial', 3, 15, 0, true],
  ['10435:3', 'Seedley Lifton Mauers', 'financial', 4, 15, 0, false],
  ['10435:4', 'Borleoluru', 'humanities', 3, 15, 0, false],
  ['10435:5', 'Newelm', 'humanities', 1, 15, 0, true],
  ['10435:6', 'Ablewire Holdings', 'manufacturing', 4, 20, 0, false],
  ['10435:7', 'Transaxis', 'manufacturing', 5, 15, 1, true],
  ['10435:8', 'Greyblu', 'media', 5, 15, 1, true],
  ['10435:9', 'Paradiso', 'media', 3, 10, 1, false],
  ['10435:10', 'Cylocore', 'technology', 3, 10, 1, true],
  ['10435:11', 'Raptura', 'technology', 4, 15, 0, false],
].map(([id, name, industry, startingMargin, capitalCost, carbonCost, corruption]) => ({
  id, name, industries: [industry], startingMargin, capitalCost, carbonCost, corruption,
  focus: { military: 1, political: 1, corporate: 1 },
}));

const politics = deckCards('d2135c');
const landscapeObjects = deckCards('652542');
const landscapeCover = landscapeObjects.find((card) => card.sheet === 10409 && card.cell === 0)
  ?? fail('missing fixed Landscape cover 10409:0');
const landscapes = landscapeObjects.filter((card) => card.id !== landscapeCover.id);
// Landscape cards use a fixed icon grammar. All 54 were template-matched and
// visually audited from authentic sheets 10406-10408.
const landscapeRules = {
  '10406:0': { delta: -2, industries: ['humanities'], priceTracks: ['clash', 'food'] },
  '10406:1': { delta: -1, industries: ['energy', 'technology'], priceTracks: ['carbon', 'educate'] },
  '10406:2': { delta: 2, industries: ['manufacturing', 'technology'], priceTracks: ['campaign'] },
  '10406:3': { delta: -1, industries: ['energy', 'financial'], priceTracks: ['educate', 'research'] },
  '10406:4': { delta: -2, industries: ['manufacturing'], priceTracks: ['carbon', 'clash'] },
  '10406:5': { delta: -2, industries: ['manufacturing'], priceTracks: ['campaign', 'clash'] },
  '10407:0': { delta: 2, industries: ['financial', 'media'], priceTracks: ['food'] },
  '10407:1': { delta: -1, industries: ['humanities'], priceTracks: ['carbon', 'food', 'research'] },
  '10407:2': { delta: -2, industries: ['humanities'], priceTracks: ['carbon', 'educate'] },
  '10407:3': { delta: -1, industries: ['media'], priceTracks: ['carbon', 'educate', 'research'] },
  '10407:4': { delta: -1, industries: ['energy', 'media'], priceTracks: ['campaign', 'educate'] },
  '10407:5': { delta: 1, industries: ['financial', 'humanities'], priceTracks: ['clash', 'research'] },
  '10407:6': { delta: -1, industries: ['manufacturing', 'media'], priceTracks: ['carbon', 'clash'] },
  '10407:7': { delta: 1, industries: ['energy', 'manufacturing'], priceTracks: ['campaign', 'research'] },
  '10407:8': { delta: -2, industries: ['technology'], priceTracks: ['campaign', 'educate'] },
  '10407:9': { delta: 2, industries: ['media'], priceTracks: ['carbon', 'clash'] },
  '10407:10': { delta: -1, industries: ['energy', 'humanities'], priceTracks: ['carbon', 'educate'] },
  '10407:11': { delta: 2, industries: ['media', 'technology'], priceTracks: ['clash'] },
  '10407:12': { delta: 1, industries: ['humanities', 'technology'], priceTracks: ['carbon', 'research'] },
  '10407:13': { delta: 2, industries: ['financial'], priceTracks: ['campaign', 'food'] },
  '10407:14': { delta: 1, industries: ['energy', 'technology'], priceTracks: ['carbon', 'educate'] },
  '10407:15': { delta: -1, industries: ['manufacturing'], priceTracks: ['clash', 'educate', 'research'] },
  '10407:16': { delta: -2, industries: ['humanities'], priceTracks: ['carbon', 'food'] },
  '10407:17': { delta: -1, industries: ['financial', 'humanities'], priceTracks: ['clash', 'research'] },
  '10407:18': { delta: -2, industries: ['media'], priceTracks: ['educate', 'research'] },
  '10407:19': { delta: -2, industries: ['humanities'], priceTracks: ['campaign', 'carbon'] },
  '10407:20': { delta: -1, industries: ['financial', 'media'], priceTracks: ['campaign', 'food', 'research'] },
  '10407:21': { delta: -2, industries: ['media'], priceTracks: ['clash', 'food'] },
  '10407:22': { delta: 2, industries: ['energy', 'technology'], priceTracks: ['carbon'] },
  '10407:23': { delta: -1, industries: ['media', 'technology'], priceTracks: ['clash', 'food'] },
  '10408:0': { delta: 2, industries: ['energy', 'media'], priceTracks: ['food'] },
  '10408:1': { delta: -2, industries: ['humanities'], priceTracks: ['carbon', 'research'] },
  '10408:2': { delta: 2, industries: ['energy', 'manufacturing'], priceTracks: ['carbon'] },
  '10408:3': { delta: -2, industries: ['technology'], priceTracks: ['clash', 'food'] },
  '10408:4': { delta: 1, industries: ['energy', 'financial'], priceTracks: ['educate', 'research'] },
  '10408:5': { delta: 2, industries: ['technology'], priceTracks: ['clash', 'research'] },
  '10408:6': { delta: 2, industries: ['financial', 'humanities'], priceTracks: ['food'] },
  '10408:7': { delta: 1, industries: ['energy', 'media'], priceTracks: ['campaign', 'educate'] },
  '10408:8': { delta: 1, industries: ['manufacturing', 'technology'], priceTracks: ['carbon', 'food'] },
  '10408:9': { delta: 2, industries: ['humanities'], priceTracks: ['campaign', 'food'] },
  '10408:10': { delta: -1, industries: ['financial'], priceTracks: ['campaign', 'clash', 'food'] },
  '10408:11': { delta: 1, industries: ['humanities'], priceTracks: ['carbon', 'food', 'research'] },
  '10408:12': { delta: 1, industries: ['humanities'], priceTracks: ['campaign', 'carbon', 'clash'] },
  '10408:13': { delta: -1, industries: ['technology'], priceTracks: ['clash', 'educate', 'research'] },
  '10408:14': { delta: -2, industries: ['humanities'], priceTracks: ['carbon', 'food'] },
  '10408:15': { delta: 2, industries: ['humanities', 'media'], priceTracks: ['educate'] },
  '10408:16': { delta: -2, industries: ['media'], priceTracks: ['educate', 'carbon'] },
  '10408:17': { delta: 1, industries: ['media'], priceTracks: ['campaign', 'carbon', 'educate'] },
  '10408:18': { delta: 2, industries: ['financial', 'manufacturing'], priceTracks: ['clash'] },
  '10408:19': { delta: -2, industries: ['energy'], priceTracks: ['campaign', 'clash'] },
  '10408:20': { delta: 1, industries: ['energy', 'humanities'], priceTracks: ['carbon', 'educate'] },
  '10408:21': { delta: -2, industries: ['energy'], priceTracks: ['carbon', 'educate'] },
  '10408:22': { delta: -2, industries: ['financial'], priceTracks: ['campaign', 'clash'] },
  '10408:23': { delta: 2, industries: ['financial'], priceTracks: ['campaign', 'educate'] },
};
const landscapeDefs = landscapes.map((card) => ({ id: card.id, ...landscapeRules[card.id] }));
const obligations = deckCards('d75693');
const startups = deckCards('2629ce');
const nations = deckCards('6306fe');
const broadcastStations = deckCards('510885');
const immunity = deckCards('7b2729');
const looseStartingPropaganda = save.ObjectStates
  .filter((candidate) => Number(candidate.CardID) >= 1041600 && Number(candidate.CardID) <= 1041623)
  .map(cardRef);

assert(save.ObjectStates.length === 903, `expected 903 top-level objects, got ${save.ObjectStates.length}`);
assert(politics.length === 412, `expected 412 Politik cards, got ${politics.length}`);
assert(landscapes.length === 54, `expected 54 playable Landscapes, got ${landscapes.length}`);
assert(landscapeDefs.every((card) => Number.isInteger(card.delta) && card.industries?.length && card.priceTracks?.length), 'incomplete Landscape transcription');
assert(obligations.length === 24, `expected 24 Obligations, got ${obligations.length}`);
assert(startups.length === 12, `expected 12 Startups, got ${startups.length}`);
assert(nations.length === 12, `expected 12 Nations, got ${nations.length}`);
assert(broadcastStations.length === 5, `expected 5 Broadcast Stations, got ${broadcastStations.length}`);
assert(looseStartingPropaganda.length === 24, `expected 24 Starting Propaganda, got ${looseStartingPropaganda.length}`);
assert(states.length === 30 && stations.length === 5, 'board State count mismatch');
assert(adjacency.length === 40 && adjacency.every((edge) => edge.length === 2), 'board adjacency count mismatch');
assert(adjacency.every((edge) => edge.every((id) => [...states, ...stations].some((location) => location.id === id))), 'board adjacency references an unknown location');

const board = {
  imagePx: [5760, 3840],
  world: { width: 30, height: 20 },
  states, stations, adjacency, council, industries, bases, prices, priceRows, powerGrabs, nationalActions,
};

const cards = {
  politics, landscapes, landscapeDefs, landscapeCover, obligations, startups, nations, broadcastStations, immunity,
  startingPropaganda: looseStartingPropaganda,
  nationDefs, propagandaDefs, startupDefs,
};
const catalogPath = path.join(GOLDEN, 'card-catalog.json');
if (fs.existsSync(catalogPath)) {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  assert(catalog.count === politics.length, `card catalog count ${catalog.count} != ${politics.length}`);
  cards.catalog = Object.fromEntries(Object.entries(catalog.cards).map(([id, card]) => [id, {
    id: card.id, name: card.name, type: card.type, costText: card.costText,
    focus: card.focus, margin: card.margin,
    rulesText: card.rulesText, keywordsText: card.keywordsText,
  }]));
}

const manifest = {
  source: 'TTS workshop 3460664356',
  saveName: save.SaveName,
  ttsVersion: save.VersionNumber,
  objectCount: save.ObjectStates.length,
  counts: {
    politik: politics.length, landscapes: landscapes.length, landscapeCover: 1, obligations: obligations.length,
    startups: startups.length, nations: nations.length, broadcastStations: broadcastStations.length,
    startingPropaganda: looseStartingPropaganda.length,
  },
  sourceGuids: {
    board: '3a55e6', rulebook: 'b18209', politics: 'd2135c', landscapes: '652542',
    obligations: 'd75693', startups: '2629ce', nations: '6306fe', broadcastStations: '510885',
  },
};

const scene = {
  source: manifest.source,
  board: {
    image: boardImage, imagePx: board.imagePx, world: board.world,
    tts: { pos: [0, 5.465079, 2.5], rot: [0, 179.999878, 0], scale: [10, 1, 10] },
    worldToPixel: { sx: 192, tx: 2880, sz: -192, tz: 2400 },
  },
  mat: { board: nationBoardImage, resources: resourcePadImage, ...componentArt },
  logo: '/politik/logo.webp',
  rulebook: '/politik/rulebook.pdf',
  sheets,
  boardData: board,
};

const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
write(path.join(GOLDEN, 'manifest.json'), manifest);
write(path.join(GOLDEN, 'board.json'), board);
write(path.join(GOLDEN, 'cards.json'), cards);
write(path.join(OUT, 'scene.json'), scene);
write(path.join(SHARED, 'data.json'), { manifest, board, cards });

console.log(`Politik: ${politics.length} cards, ${landscapes.length} landscapes, ${states.length} states, ${Object.keys(sheets).length} sheets`);
console.log(`Board: ${boardMeta.width}x${boardMeta.height}; assets: ${OUT}`);
