// Dark Souls TBG mod scout — full recursive inventory of workshop save 1210887127.
// Usage: node scan.mjs   (writes inventory.json next to this script)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOD = 'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods/Workshop/1210887127.json';
const save = JSON.parse(fs.readFileSync(MOD, 'utf8'));

const objects = [];        // flat list of every object, recursively
const typeCounts = {};     // Name -> count (all depths)
const urlHosts = {};       // host -> count
const problems = [];       // anomalies

function round(n) { return typeof n === 'number' ? Math.round(n * 1000) / 1000 : n; }

function noteUrl(u) {
  if (!u) return;
  try { const h = new URL(u).host; urlHosts[h] = (urlHosts[h] || 0) + 1; }
  catch { urlHosts['<unparseable>'] = (urlHosts['<unparseable>'] || 0) + 1; }
}

function extractUrls(o) {
  const urls = {};
  const cm = o.CustomMesh;
  if (cm) {
    if (cm.MeshURL) urls.mesh = cm.MeshURL;
    if (cm.DiffuseURL) urls.diffuse = cm.DiffuseURL;
    if (cm.NormalURL) urls.normal = cm.NormalURL;
    if (cm.ColliderURL) urls.collider = cm.ColliderURL;
  }
  const ci = o.CustomImage;
  if (ci) {
    if (ci.ImageURL) urls.image = ci.ImageURL;
    if (ci.ImageSecondaryURL) urls.imageBack = ci.ImageSecondaryURL;
  }
  const ca = o.CustomAssetbundle;
  if (ca) {
    if (ca.AssetbundleURL) urls.assetbundle = ca.AssetbundleURL;
    if (ca.AssetbundleSecondaryURL) urls.assetbundleSecondary = ca.AssetbundleSecondaryURL;
  }
  const cp = o.CustomPDF;
  if (cp && cp.PDFUrl) urls.pdf = cp.PDFUrl;
  for (const v of Object.values(urls)) noteUrl(v);
  return Object.keys(urls).length ? urls : undefined;
}

function extractCustomDeck(o) {
  if (!o.CustomDeck) return undefined;
  const sheets = {};
  for (const [id, s] of Object.entries(o.CustomDeck)) {
    sheets[id] = {
      faceURL: s.FaceURL, backURL: s.BackURL,
      numWidth: s.NumWidth, numHeight: s.NumHeight,
      backIsHidden: s.BackIsHidden, uniqueBack: s.UniqueBack,
    };
    noteUrl(s.FaceURL); noteUrl(s.BackURL);
  }
  return sheets;
}

let seq = 0;
function walk(o, containerPath, depth, viaState) {
  const id = seq++;
  typeCounts[o.Name] = (typeCounts[o.Name] || 0) + 1;
  const t = o.Transform || {};
  const rec = {
    idx: id,
    guid: o.GUID,
    type: o.Name,
    nickname: o.Nickname || '',
    description: o.Description || '',
    path: containerPath,
    depth,
    transform: {
      posX: round(t.posX), posY: round(t.posY), posZ: round(t.posZ),
      rotY: round(t.rotY),
      scaleX: round(t.scaleX), scaleY: round(t.scaleY), scaleZ: round(t.scaleZ),
    },
  };
  if (viaState) rec.stateOf = viaState;
  if (o.Tags && o.Tags.length) rec.tags = o.Tags;
  if (o.CardID !== undefined) rec.cardID = o.CardID;
  if (o.DeckIDs) rec.deckIDs = o.DeckIDs;
  const urls = extractUrls(o);
  if (urls) rec.urls = urls;
  const cd = extractCustomDeck(o);
  if (cd) rec.customDeck = cd;
  if (o.Number !== undefined && /Die|Dice/i.test(o.Name)) rec.dieValue = o.Number;
  if (o.RotationValues && o.RotationValues.length) rec.rotationValueCount = o.RotationValues.length;
  if (o.LuaScript && o.LuaScript.trim().length) {
    rec.luaScriptChars = o.LuaScript.length;
    rec.luaScriptHead = o.LuaScript.slice(0, 200);
  }
  if (o.Text && o.Text.Text !== undefined) rec.textContent = o.Text.Text; // 3DText
  if (o.ContainedObjects) rec.containedCount = o.ContainedObjects.length;
  if (o.States) rec.stateKeys = Object.keys(o.States);
  objects.push(rec);

  const label = `${o.Name}${o.Nickname ? `"${o.Nickname}"` : ''}#${o.GUID || '?'}`;
  const childPath = containerPath ? `${containerPath}/${label}` : label;
  if (o.ContainedObjects) for (const c of o.ContainedObjects) walk(c, childPath, depth + 1, null);
  if (o.States) for (const [k, s] of Object.entries(o.States)) walk(s, childPath, depth + 1, `${o.GUID}:state${k}`);
  if (o.ChildObjects) for (const c of o.ChildObjects) walk(c, childPath, depth + 1, null);
  return rec;
}

for (const o of save.ObjectStates) walk(o, '', 0, null);

// ---- aggregations ----------------------------------------------------------

// PDFs
const pdfs = objects.filter(r => r.type === 'Custom_PDF' || (r.urls && r.urls.pdf))
  .map(r => ({ guid: r.guid, nickname: r.nickname, description: r.description, path: r.path, url: r.urls?.pdf }));

// Decks & standalone cards
const decks = objects.filter(r => r.type === 'Deck' || r.type === 'DeckCustom').map(r => {
  const kids = objects.filter(k => k.path.endsWith(`#${r.guid}`) && k.depth === r.depth + 1 && (k.type === 'Card' || k.type === 'CardCustom'));
  return {
    guid: r.guid, nickname: r.nickname, path: r.path, cardCount: r.deckIDs ? r.deckIDs.length : kids.length,
    sheets: r.customDeck,
    cards: kids.map(k => ({ guid: k.guid, cardID: k.cardID, nickname: k.nickname, description: k.description || undefined })),
  };
});
const looseCards = objects.filter(r => (r.type === 'Card' || r.type === 'CardCustom') &&
  !/Deck|DeckCustom/.test((r.path.split('/').pop() || '').split('"')[0] || '') &&
  !objects.some(d => (d.type === 'Deck' || d.type === 'DeckCustom') && r.path.endsWith(`#${d.guid}`)))
  .map(r => ({ guid: r.guid, cardID: r.cardID, nickname: r.nickname, path: r.path, sheets: r.customDeck, description: r.description || undefined }));

// Bags (incl. infinite) with dispensed contents
const bags = objects.filter(r => /Bag/.test(r.type)).map(r => {
  const kids = objects.filter(k => k.depth === r.depth + 1 && k.path.endsWith(`#${r.guid}`));
  return {
    guid: r.guid, type: r.type, nickname: r.nickname, path: r.path,
    transform: r.transform,
    contents: kids.map(k => ({ type: k.type, nickname: k.nickname, guid: k.guid, urls: k.urls, containedCount: k.containedCount })),
  };
});

// Figurines / models
const minis = objects.filter(r => r.type === 'Custom_Model' || r.type === 'Figurine_Custom')
  .map(r => ({ guid: r.guid, type: r.type, nickname: r.nickname, path: r.path, urls: r.urls, scale: r.transform.scaleX, transform: r.transform }));

// Tiles & tokens
const tiles = objects.filter(r => /^Custom_Tile/.test(r.type))
  .map(r => ({ guid: r.guid, type: r.type, nickname: r.nickname, path: r.path, urls: r.urls, transform: r.transform, containedCount: r.containedCount }));
const tokens = objects.filter(r => /^Custom_Token/.test(r.type))
  .map(r => ({ guid: r.guid, type: r.type, nickname: r.nickname, path: r.path, urls: r.urls, transform: r.transform, containedCount: r.containedCount }));

// Assetbundles
const bundles = objects.filter(r => r.urls && (r.urls.assetbundle || r.urls.assetbundleSecondary))
  .map(r => ({ guid: r.guid, type: r.type, nickname: r.nickname, path: r.path, urls: r.urls }));

// Oddities
const oddities = objects.filter(r => ['3DText', 'Chinese_Checkers_Piece', 'Quarter', 'Notecard', 'BlockSquare', 'backgammon_piece_white', 'Counter'].includes(r.type))
  .map(r => ({ guid: r.guid, type: r.type, nickname: r.nickname, description: r.description, text: r.textContent, path: r.path, transform: r.transform }));

// Dice
const dice = objects.filter(r => /Die|Dice/i.test(r.type))
  .map(r => ({ guid: r.guid, type: r.type, nickname: r.nickname, path: r.path, urls: r.urls, value: r.dieValue }));

// ---- cross-checks ----------------------------------------------------------

// every card's CardID sheet must exist in its own or an ancestor deck's CustomDeck
const byGuid = new Map();
for (const r of objects) if (r.guid) byGuid.set(`${r.guid}@${r.depth}@${r.path}`, r);
const cardLikes = objects.filter(r => r.cardID !== undefined);
for (const c of cardLikes) {
  const sheetId = String(Math.floor(c.cardID / 100));
  let found = !!(c.customDeck && c.customDeck[sheetId]);
  if (!found) {
    // walk ancestor labels in path: Type"Nick"#guid segments
    for (const seg of c.path.split('/')) {
      const g = (seg.match(/#([0-9a-f?]+)$/) || [])[1];
      if (!g) continue;
      const anc = objects.find(o => o.guid === g && o.customDeck && o.customDeck[sheetId]);
      if (anc) { found = true; break; }
    }
  }
  if (!found) problems.push({ kind: 'card-missing-sheet', guid: c.guid, nickname: c.nickname, cardID: c.cardID, path: c.path });
}
const unnamedCards = cardLikes.filter(c => !c.nickname)
  .map(c => ({ guid: c.guid, cardID: c.cardID, path: c.path }));

// deck DeckIDs vs contained cards count
for (const d of decks) {
  const declared = objects.find(o => o.guid === d.guid && (o.type === 'Deck' || o.type === 'DeckCustom'));
  if (declared?.deckIDs && declared.deckIDs.length !== d.cards.length) {
    problems.push({ kind: 'deck-count-mismatch', guid: d.guid, nickname: d.nickname, deckIDs: declared.deckIDs.length, containedCards: d.cards.length });
  }
}
// objects missing GUIDs or URLs where expected
for (const r of objects) {
  if (!r.guid) problems.push({ kind: 'no-guid', type: r.type, nickname: r.nickname, path: r.path });
  if (r.type === 'Custom_Model' && (!r.urls || !r.urls.mesh))
    problems.push({ kind: 'model-missing-mesh', guid: r.guid, nickname: r.nickname, path: r.path });
  if (r.type === 'Figurine_Custom' && (!r.urls || !r.urls.image))
    problems.push({ kind: 'figurine-missing-image', guid: r.guid, nickname: r.nickname, path: r.path });
  if (/^Custom_Tile|^Custom_Token/.test(r.type) && (!r.urls || !r.urls.image))
    problems.push({ kind: 'tile-missing-image', guid: r.guid, type: r.type, nickname: r.nickname, path: r.path });
}
// dead-host detection
const deadHosts = Object.keys(urlHosts).filter(h => /cloud-3\.steamusercontent\.com/.test(h));

const inventory = {
  saveName: save.SaveName,
  luaScript: save.LuaScript,
  luaScriptChars: (save.LuaScript || '').length,
  totalObjects: objects.length,
  topLevelObjects: save.ObjectStates.length,
  typeCounts,
  urlHosts,
  deadHosts,
  pdfs,
  decks,
  looseCards,
  bags,
  minis,
  tiles,
  tokens,
  bundles,
  dice,
  oddities,
  unnamedCards,
  problems,
  objects,
};

fs.writeFileSync(path.join(HERE, 'inventory.json'), JSON.stringify(inventory, null, 1));
console.log('objects:', objects.length, 'decks:', decks.length, 'bags:', bags.length,
  'minis:', minis.length, 'tiles:', tiles.length, 'tokens:', tokens.length,
  'pdfs:', pdfs.length, 'bundles:', bundles.length, 'problems:', problems.length,
  'unnamedCards:', unnamedCards.length);
console.log('typeCounts:', JSON.stringify(typeCounts));
console.log('hosts:', JSON.stringify(urlHosts));
