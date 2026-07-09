// Stage Kanban EV assets + goldens from the TTS cache (mod 3589049550).
// The mod's global.lua holds the whole geometry/content golden as plain
// data tables (CARS conveyor graph, PARTS kanban orders, SPOTS, PLAYERS,
// GOALS, ...). This extractor brace-matches those tables, strips their
// function members, converts the Lua literals to JSON, stages every
// referenced object's assets, and emits:
//   games/kanban-ev/golden/layout.json  (the parsed tables)
//   client/public/kanban/scene.json     (asset paths per GUID + sheets)
// Run: node tools/tts-extract/extract-kanban.mjs

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MODS = 'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods';
const OUT = path.join(ROOT, 'client/public/kanban');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'games/kanban-ev/golden'), { recursive: true });
const save = JSON.parse(fs.readFileSync(path.join(MODS, 'Workshop', '3589049550.json'), 'utf8'));
const lua = save.LuaScript ?? '';
const munge = (u) => u.replace(/[^A-Za-z0-9]/g, '');

// ---------- stage files ----------
const staged = new Map();
const stage = (url, kind = 'img') => {
  if (!url || !/^https?:/.test(url)) return null;
  if (staged.has(url)) return staged.get(url);
  const base = munge(url);
  const spots = kind === 'model' ? [['Models', '.obj']] : kind === 'pdf' ? [['PDF', '.PDF'], ['PDF', '.pdf']]
    : [['Images', '.png'], ['Images', '.jpg']];
  for (const [dir, ext] of spots) {
    const src = path.join(MODS, dir, base + ext);
    if (fs.existsSync(src)) {
      const name = base.slice(-24) + ext.toLowerCase();
      fs.copyFileSync(src, path.join(OUT, name));
      const rel = `/kanban/${name}`;
      staged.set(url, rel);
      return rel;
    }
  }
  console.warn('MISSING', kind, url.slice(-44));
  staged.set(url, null);
  return null;
};

// ---------- index objects ----------
const byGuid = {};
const walk = (o) => {
  byGuid[o.GUID] = o;
  for (const c of o.ContainedObjects ?? []) walk(c);
  for (const st of Object.values(o.States ?? {})) walk(st);
};
for (const o of save.ObjectStates) walk(o);

// ---------- lua table -> JSON ----------
function extractTable(name) {
  const start = lua.search(new RegExp(`^${name} =\\s*$`, 'm'));
  if (start < 0) throw new Error(`table ${name} not found`);
  const open = lua.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < lua.length; i++) {
    if (lua[i] === '{') depth++;
    else if (lua[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return lua.slice(open, end);
}

function luaToJson(src) {
  const lines = src.split('\n');
  const out = [];
  let fnDepth = 0; // inside `Key = function ... end` blocks
  for (const raw of lines) {
    let line = raw;
    if (fnDepth > 0) {
      fnDepth += (line.match(/\bfunction\b|\bif\b|\bfor\b|\bwhile\b/g) ?? []).length;
      fnDepth -= (line.match(/\bend\b/g) ?? []).length;
      continue;
    }
    if (/=\s*function/.test(line)) {
      fnDepth = 1 + ((line.match(/\bif\b|\bfor\b|\bwhile\b/g) ?? []).length) - ((line.match(/\bend\b/g) ?? []).length);
      continue;
    }
    // strip SHARED.* member refs (Count/Objects/Take/etc.)
    line = line.replace(/[A-Za-z]+ = SHARED\.[A-Za-z.]+,?/g, '');
    line = line.replace(/--.*$/, '');
    if (!line.trim()) continue;
    out.push(line);
  }
  let s = out.join('\n');
  s = s.replace(/\bnil\b/g, 'null');
  s = s.replace(/([A-Za-z_][A-Za-z0-9_]*)\s*=/g, '"$1":'); // keys
  s = s.replace(/,\s*([}\]])/g, '$1'); // trailing commas (pass 1)
  s = s.replace(/,\s*([}\]])/g, '$1'); // nested leftovers
  s = s.replace(/\{(\s*"[A-Za-z_])/g, '{$1'); // no-op guard
  // lua uses {} for both arrays and objects; JSON.parse can't take {1,2}.
  // Convert brace-arrays (no keys inside at top level) to brackets.
  s = bracify(s);
  s = s.replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(s);
}

// Convert Lua brace-collections to JSON arrays where they hold no keys.
function bracify(s) {
  // parse manually: walk chars, track brace spans, decide array vs object
  const chars = [...s];
  const spans = []; // {open, close, isArray}
  const stack = [];
  let inStr = false;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === '"' && chars[i - 1] !== '\\') inStr = !inStr;
    if (inStr) continue;
    if (c === '{') stack.push({ open: i, hasKey: false });
    else if (c === ':') { if (stack.length) stack[stack.length - 1].hasKey = true; }
    else if (c === '}') {
      const top = stack.pop();
      if (top) spans.push({ open: top.open, close: i, isArray: !top.hasKey });
    }
  }
  for (const sp of spans) {
    if (sp.isArray) { chars[sp.open] = '['; chars[sp.close] = ']'; }
  }
  return chars.join('');
}

const TABLES = ['AWARDS', 'BOOKS', 'CARS', 'CHARGERS', 'DEMANDS', 'DESIGNS', 'ELEMENTS',
  'GOALS', 'PACE', 'PARTS', 'PLAYERS', 'SPEECHS', 'SPOTS', 'UPGRADES', 'VOUCHERS'];
const layout = {};
for (const t of TABLES) layout[t] = luaToJson(extractTable(t));

// ---------- collect + stage every referenced guid ----------
const guids = new Set();
const sweep = (v) => {
  if (typeof v === 'string' && /^[0-9a-f]{6}$/.test(v) && byGuid[v]) guids.add(v);
  else if (Array.isArray(v)) v.forEach(sweep);
  else if (v && typeof v === 'object') Object.values(v).forEach(sweep);
};
sweep(layout);

const sheets = {};
const objects = {};
for (const g of guids) {
  const o = byGuid[g];
  const t = o.Transform ?? {};
  const rec = {
    name: o.Name,
    nick: o.Nickname || undefined,
    pos: [t.posX, t.posY, t.posZ].map((v) => +(v ?? 0).toFixed(2)),
    rot: [t.rotX, t.rotY, t.rotZ].map((v) => +(v ?? 0).toFixed(1)),
    scale: [t.scaleX, t.scaleY, t.scaleZ].map((v) => +(v ?? 1).toFixed(3)),
  };
  if (o.ColorDiffuse) rec.color = [o.ColorDiffuse.r ?? 1, o.ColorDiffuse.g ?? 1, o.ColorDiffuse.b ?? 1].map((v) => +v.toFixed(3));
  if (o.CustomMesh?.MeshURL) {
    rec.mesh = stage(o.CustomMesh.MeshURL, 'model');
    if (o.CustomMesh.DiffuseURL) rec.tex = stage(o.CustomMesh.DiffuseURL);
  }
  if (o.CustomImage?.ImageURL) rec.img = stage(o.CustomImage.ImageURL);
  if (o.CardID !== undefined) { rec.sheet = Math.floor(o.CardID / 100); rec.cell = o.CardID % 100; }
  for (const [id, d] of Object.entries(o.CustomDeck ?? {})) {
    if (!sheets[id]) sheets[id] = { face: stage(d.FaceURL), back: stage(d.BackURL), cols: d.NumWidth, rows: d.NumHeight };
  }
  objects[g] = rec;
}

// contained cards of decks referenced in GOALS/PARTS (goal cards etc. live loose already — guids listed)

// ---------- rulebooks ----------
stage('https://steamusercontent-a.akamaihd.net/ugc/14495613159593403853/05BDE80881FCAB514031FC257923C491D9BA8B04/', 'pdf');
const rb = staged.values().next();
for (const [url, tag] of [
  ['https://steamusercontent-a.akamaihd.net/ugc/14495613159593403853/05BDE80881FCAB514031FC257923C491D9BA8B04/', 'rulebook'],
  ['https://steamusercontent-a.akamaihd.net/ugc/129973573425337906533F60BFBF0E97FF4318A0EEEFCB4D9610A910A257/', 'reference'],
]) {
  const src = path.join(MODS, 'PDF', munge(url) + '.pdf');
  const alt = path.join(MODS, 'PDF', munge(url) + '.PDF');
  const from = fs.existsSync(src) ? src : fs.existsSync(alt) ? alt : null;
  if (from) fs.copyFileSync(from, path.join(OUT, tag + '.pdf'));
  else console.warn('MISSING pdf', tag);
}

const scene = {
  source: 'TTS workshop 3589049550 — Kanban EV [Scripted - All Expansions] — extract-kanban.mjs',
  objects,
  sheets,
};
fs.writeFileSync(path.join(OUT, 'scene.json'), JSON.stringify(scene, null, 1));
fs.writeFileSync(path.join(ROOT, 'games/kanban-ev/golden/layout.json'), JSON.stringify(layout, null, 1));
console.log('tables', TABLES.length, 'guids', guids.size, 'sheets', Object.keys(sheets).length, 'staged', staged.size,
  'missing', [...staged.values()].filter((v) => !v).length);
