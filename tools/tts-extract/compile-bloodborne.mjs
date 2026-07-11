// Compile Bloodborne transcriptions (games/bloodborne/golden/transcribed/*)
// into engine data (shared/src/bloodborne/data/*.json).
//
// Verbatim card text is kept for display; machine effects are parsed from the
// text with a conservative keyword parser + explicit fixup tables (anything
// unparsed is logged so it can be curated, never silently dropped).
// Mission DSL comes from hand-authored overlays in games/bloodborne/golden/dsl/
// merged onto the transcribed text. Idempotent + rerunnable.
// Run: node tools/tts-extract/compile-bloodborne.mjs

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const T = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'games/bloodborne/golden/transcribed', f), 'utf8'));
const G = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'games/bloodborne/golden', f), 'utf8'));
const OUT = path.join(ROOT, 'shared/src/bloodborne/data');
fs.mkdirSync(OUT, { recursive: true });
const write = (f, data) => fs.writeFileSync(path.join(OUT, f), JSON.stringify(data, null, 1));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const warns = [];
const warn = (m) => { warns.push(m); };

// ---------- effect parser (stat cards, weapon abilities, item text) ----------
const parseEffects = (text, ctx) => {
  const fx = {};
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return fx;
  if (/\bdodge\b/i.test(t)) fx.dodge = true;
  if (/\bstagger\b/i.test(t) && !/attacks with stagger/i.test(t)) fx.stagger = true;
  let m;
  if ((m = /block (\d+)/i.exec(t))) fx.block = +m[1];
  if ((m = /draw (\d+)/i.exec(t))) fx.draw = +m[1];
  if ((m = /heal (\d+)/i.exec(t))) fx.heal = +m[1];
  if ((m = /clear (\d+|this|1) slot/i.exec(t))) fx.clearSlots = m[1] === 'this' ? 0 : +m[1] || 1;
  if ((m = /\+(\d+) \{dmg\}/i.exec(t))) fx.dmgBonus = +m[1];
  if ((m = /\+(\d+) \{(speed|arrow)\}/i.exec(t))) fx.speedBonus = +m[1];
  if (/leap/i.test(t) && ctx === 'stat') fx.leaping = true;
  if ((m = /attacks with stagger also deal \+(\d+)/i.exec(t))) fx.staggerBonusDmg = +m[1];
  if ((m = /on kill:?\s*draw (\d+)/i.exec(t))) fx.onKillDraw = +m[1];
  if ((m = /on kill:?[^.]*heal (\d+)/i.exec(t))) fx.onKillHeal = +m[1];
  return fx;
};

// ---------- 1. hunters (weapons.json cells -> hunter defs) ----------
const weapons = T('weapons.json').cells;
const CORE_CELLS = { 8: 'saw-cleaver', 9: 'threaded-cane', 10: 'hunter-axe', 11: 'ludwigs-holy-blade' };
const hunters = {};
{
  const comp = G('components.json');
  for (const [cell, w] of Object.entries(weapons)) {
    const id = slug(w.face.name);
    const side = (sideData) => ({
      label: sideData.name,
      ability: sideData.ability ?? '',
      effects: parseEffects(sideData.ability, 'weapon'),
      slots: (sideData.slots ?? []).map((sl) => ({
        name: sl.name, speed: sl.speed, damage: sl.damage,
        ...(sl.text ? { text: sl.text, effects: parseEffects(sl.text, 'slot') } : {}),
      })),
    });
    // starting firearm: from components mapping where present; default hunter-pistol
    const compHunter = comp.hunters[id];
    hunters[id] = {
      id,
      name: w.face.name,
      set: CORE_CELLS[cell] ? 'core' : 'expansion',
      firearmId: 'hunter-pistol',
      sides: [side(w.face), side(w.back)],
      art: { weaponCell: +cell, mini: compHunter?.hunterMini ?? null, weaponMini: compHunter?.weaponMini ?? null, dashboardSheet: 'sheet-2' },
    };
  }
  // curated starting firearms (mod weapon bags pair some hunters with
  // specific starting guns; core four use the Hunter Pistol per their cards)
  const FIREARM_FIX = {
    'threaded-cane': 'cannon-starting', // mod bag pairs Cannon-Threaded Cane
  };
  // NOTE: physical core box gives every hunter a Hunter Pistol variant; the
  // mod's bag contents mislabel some cards. Keep hunter-pistol default and
  // record the bag pairing for the device art only.
  void FIREARM_FIX;
}
write('hunters.json', hunters);

// ---------- 2. stats ----------
const statsT = T('stats.json');
const stats = { cards: {}, upgrades: {}, startingDeck: [] };
{
  // rulebook p.19 pins the archetypes: endurance=dodge, skill=stagger,
  // strength=+dmg, vitality=draw/defense — lifts the agent's uncertainty.
  const BASIC_BY_CELL = { 0: 'vitality', 1: 'endurance', 2: 'skill', 3: 'strength' };
  for (const [cell, c] of Object.entries(statsT.basic)) {
    const stat = BASIC_BY_CELL[cell] ?? c.stat;
    const id = `basic-${stat}`;
    stats.cards[id] = { id, name: `Basic ${stat[0].toUpperCase()}${stat.slice(1)}`, stat, basic: true, text: c.text, effects: parseEffects(c.text, 'stat'), art: { sheet: 'basic-stat-deck', cell: +cell } };
  }
  stats.startingDeck = ['basic-endurance', 'basic-skill', 'basic-strength', 'basic-vitality'].flatMap((id) => [id, id, id]);
  for (const [cell, c] of Object.entries(statsT.upgrades)) {
    const id = `up-${slug(c.name)}`;
    stats.upgrades[id] = { id, name: c.name, stat: c.stat, basic: false, text: c.text, effects: parseEffects(c.text, 'stat'), art: { sheet: 'upgrade-stat-deck', cell: +cell } };
  }
}
write('stats.json', stats);

// ---------- 3. enemies ----------
const enemiesT = T('enemies.json').cells;
const enemies = {};
{
  const comp = G('components.json');
  const riderOf = (text) => {
    if (!text) return undefined;
    if (/must dodge \(\{(\w+)\}\) or suffer (\d+)/i.test(text)) {
      const m = /must dodge \(\{(\w+)\}\) or suffer (\d+)/i.exec(text);
      return { kind: 'dodge-or-suffer', speed: m[1], damage: +m[2], text };
    }
    if (/suffers? poison/i.test(text) || /gains? a? ?\{?poison/i.test(text)) return { kind: 'poison', text };
    if (/suffers? frenzy/i.test(text) || /gains? a? ?\{?frenzy/i.test(text)) return { kind: 'frenzy', text };
    if (/suffers? stun|is stunned/i.test(text)) return { kind: 'stun', text };
    if (/flip another enemy action/i.test(text)) return { kind: 'flip-another', text };
    return { kind: 'display', text };
  };
  for (const [cell, e] of Object.entries(enemiesT)) {
    const name = e.face.name.replace(/\b\w/g, (c) => c); // keep as printed
    const id = slug(e.face.name);
    const npc = !!(e.face.npcScale || e.back.npcScale);
    const mkAttack = (a) => a ? ({
      name: a.name, speed: a.isAbility ? null : a.speed, damage: a.damage ?? 0,
      ...(a.text ? { text: a.text } : {}), ...(a.isAbility ? { isAbility: true } : {}),
      ...(riderOf(a.text) && !a.isAbility ? { rider: riderOf(a.text) } : {}),
    }) : { name: '', speed: null, damage: 0 };
    const mkAbility = (a) => a ? ({ name: a.name, speed: null, damage: 0, text: a.text, isAbility: true, rider: riderOf(a.text) }) : { name: '', speed: null, damage: 0, isAbility: true };
    const mkSide = (sd) => ({
      hp: sd.hp,
      basic: mkAttack(sd.basic),
      special: mkAttack(sd.special),
      ability: mkAbility(sd.ability),
      ...(sd.passive ? { passive: sd.passive, passiveEffects: /move 2 when activating or pursuing/i.test(sd.passive) ? { moveBonus: 1 } : { custom: slug(sd.passive).slice(0, 40) } } : {}),
    });
    // NPC cards: normalize so sides[0] = 1-2 hunters, sides[1] = 3+
    let a = e.face, b = e.back;
    if (npc && a.npcScale === '3+') [a, b] = [b, a];
    const compEnemy = Object.values(comp.enemies).find((x) => slug(x.name) === id);
    enemies[id] = {
      id, name: e.face.name, npc,
      core: ['hunter-mob', 'huntsman-s-minion', 'scourge-beast', 'male-beast-patient', 'female-beast-patient', 'church-giant', 'church-servant'].includes(id),
      sides: [mkSide(a), mkSide(b)],
      mini: compEnemy?.mini ?? null,
      art: { sheet: 'enemies-2', cell: +cell },
    };
  }
}
write('enemies.json', enemies);

// ---------- 4. bosses ----------
const bossHp = T('boss-hp.json').cells;
const bossActs = T('boss-actions.json').cells;
const bosses = {};
{
  const comp = G('components.json');
  const byDeck = {};
  for (const [cell, a] of Object.entries(bossActs)) {
    (byDeck[a.deck] ??= []).push({ cell: +cell, ...a });
  }
  for (const list of Object.values(byDeck)) list.sort((x, y) => x.cell - y.cell);
  const riderOf = (text) => {
    if (!text) return undefined;
    let m;
    if ((m = /must dodge \(\{(\w+)\}\) or suffer (\d+)/i.exec(text))) return { kind: 'dodge-or-suffer', speed: m[1], damage: +m[2], text };
    if (/poison/i.test(text)) return { kind: 'poison', text };
    if (/frenzy/i.test(text)) return { kind: 'frenzy', text };
    if (/stun/i.test(text)) return { kind: 'stun', text };
    return { kind: 'display', text };
  };
  for (const [cell, hpCard] of Object.entries(bossHp)) {
    const id = slug(hpCard.face.name);
    const p1 = byDeck[`${hpCard.face.name} Phase 1`] ?? [];
    const p2 = byDeck[`${hpCard.face.name} Phase 2`] ?? [];
    const mkAct = (a) => ({
      name: a.name, speed: a.kind === 'ability' ? null : a.speed, damage: a.damage ?? 0,
      ...(a.text ? { text: a.text } : {}), ...(a.kind === 'ability' ? { isAbility: true } : {}),
      ...(a.kind !== 'ability' && a.text ? { rider: riderOf(a.text) } : {}),
    });
    bosses[id] = {
      id, name: hpCard.face.name,
      core: ['blood-starved-beast', 'cleric-beast', 'father-gascoigne', 'father-gascoigne-transformed', 'vicar-amelia'].includes(id),
      hp: [hpCard.face.hp, hpCard.back.hp],
      phases: [p1.map(mkAct), p2.map(mkAct)],
      mini: comp.bosses[id]?.mini ?? null,
      art: { hpSheet: 'sheet-3', hpCell: +cell },
    };
    if (bosses[id].core && (p1.length !== 5 || p2.length !== 5)) warn(`boss ${id} action decks ${p1.length}/${p2.length}`);
  }
}
write('bosses.json', bosses);

// ---------- 5. items (firearms, consumables, rewards) ----------
const fc = T('firearms-consumables.json');
const items = {};
{
  // firearms: dedupe by printed name; count refresh cost from text
  const seen = new Set();
  for (const [cell, f] of Object.entries(fc.firearms)) {
    const id = slug(f.name);
    if (seen.has(id)) continue;
    seen.add(id);
    const refresh = /discard 2/i.test(f.text) ? 'discard2' : 'discard1';
    items[id] = { id, name: f.name, kind: 'firearm', timing: f.timing ?? 'Hunter Turn', text: f.text, effects: { refresh, custom: firearmCustom(f.name) }, art: { sheet: 'firearm-deck', cell: +cell } };
  }
  function firearmCustom(name) { return `fire-${slug(name)}`; }

  // consumables: unique defs + deck counts from the mod's 36-card deck
  const decks = G('decks.json');
  const consDeck = decks.decks.find((d) => d.nick === 'Consumable Deck' && d.path.startsWith('The Long Hunt'));
  const counts = {};
  for (const c of consDeck.cards) counts[c.cell] = (counts[c.cell] ?? 0) + 1;
  const CONS_FX = {
    'blood-vial': { heal: 2 }, 'coldblood-dew': { custom: 'gain-echo' }, 'fire-paper': { dmgBonus: 1 },
    'bolt-paper': { speedBonus: 1 }, 'blue-elixir': { custom: 'move-2' }, 'lead-elixir': { block: 1 },
    'beast-blood-pellet': { clearSlots: 1 }, 'antidote': { draw: 1, custom: 'cure-poison' },
    'sedative': { draw: 1, custom: 'cure-frenzy' }, 'quicksilver-bullets': { custom: 'refresh-firearm' },
    'bone-marrow-ash': { custom: 'refresh-reward' }, 'bold-hunter-s-mark': { custom: 'teleport-lamp' },
    'throwing-knife': { custom: 'damage-1-range-1' }, 'molotov-cocktail': { custom: 'damage-2-same-space' },
    'pebble': { custom: 'move-enemy-2' }, 'beckoning-bell': { custom: 'summon-ally' },
    'pungent-blood-cocktail': { custom: 'suppress-activation' }, 'numbing-mist': { custom: 'strip-enemy-effects' },
  };
  for (const [cell, c] of Object.entries(fc.consumables)) {
    const id = slug(c.name);
    items[id] = { id, name: c.name, kind: 'consumable', timing: c.timing, text: c.text, effects: CONS_FX[id] ?? {}, count: counts[cell] ?? 2, art: { sheet: 'consumable-deck', cell: +cell } };
    if (!CONS_FX[id]) warn(`consumable ${id} has no curated effect`);
  }

  // rewards (tools + runes) — text from the backs pass
  const rw = T('rewards.json').cells;
  const seenR = new Set();
  for (const [cell, r] of Object.entries(rw)) {
    if (+cell > 24) continue; // cells 25+ are expansion copies (icon groups)
    const id = slug(r.name.replace(/^CARYLL RUNE:\s*/i, 'rune-'));
    if (seenR.has(id)) continue;
    seenR.add(id);
    const kind = r.type === 'rune' ? 'rune' : r.type === 'tool' ? 'tool' : (/^caryll rune/i.test(r.name) ? 'rune' : 'tool');
    items[id] = { id, name: r.name, kind, timing: r.timing, text: r.text ?? '', effects: parseEffects(r.text ?? '', 'item'), art: { sheet: 'reward-deck', cell: +cell } };
  }
}
write('items.json', items);

// ---------- 6. tiles ----------
{
  const tilesT = fs.existsSync(path.join(ROOT, 'games/bloodborne/golden/transcribed/tiles-core.json'))
    ? T('tiles-core.json').cells : {};
  const comp = G('components.json');
  const tiles = {};
  // The tile transcription's icon legend numbered the medallions arbitrarily:
  // its enemy1 = purple splayed hand, enemy3 = olive curled larva. The hunt
  // board's printed slot order (verified from the staged art) is slot 1 =
  // olive larva, slot 2 = copper talon, slot 3 = purple hand — swap 1<->3.
  const fixIcon = (i) => (i === 'enemy1' ? 'enemy3' : i === 'enemy3' ? 'enemy1' : i);
  for (const [cell, td] of Object.entries(tilesT)) {
    const staged = comp.tiles.find((t) => t.deck === 'Core Tiles' && t.cell === +cell);
    const name = td.name ?? staged?.name ?? '';
    const id = staged?.id ?? (name ? slug(name) : `core-tiles-c${String(cell).padStart(2, '0')}`);
    tiles[id] = {
      id, name, set: 'core',
      spaces: (td.spaces ?? []).map((sp) => ({ ...sp, icons: (sp.icons ?? []).map(fixIcon) })),
      adjacency: td.adjacency, exits: td.exits,
      specialText: td.specialText ?? null,
      art: staged?.rel ?? '',
      ...(td.uncertain ? { uncertain: true, note: td.note } : {}),
    };
  }
  write('tiles.json', tiles);
  if (Object.keys(tiles).length !== 20) warn(`core tiles: ${Object.keys(tiles).length}/20`);
}

// ---------- 7. campaigns ----------
{
  const luaCamps = G('campaigns.json');
  const NAME_TO_ID = {
    'The Long Hunt': 'the-long-hunt', 'Growing Madness': 'growing-madness',
    'Secrets of the Church': 'secrets-of-the-church', 'Fall of Old Yharnam': 'fall-of-old-yharnam',
  };
  const campaigns = {};
  for (const [name, id] of Object.entries(NAME_TO_ID)) {
    campaigns[id] = { id, name, set: 'core', chapters: luaCamps[name] };
  }
  // FAQ errata: Growing Madness Ch3 setup adds Graveyard, random max 5
  const gm3 = campaigns['growing-madness'].chapters[2];
  if (!gm3.startingTiles.includes('Graveyard')) gm3.startingTiles.push('Graveyard');
  gm3.randomTiles = { perHunter: 2, cap: 5 };
  write('campaigns.json', campaigns);
}

// ---------- 8. missions (transcribed text + hand-authored DSL overlays) ----------
{
  const missions = {};
  const DSL_DIR = path.join(ROOT, 'games/bloodborne/golden/dsl');
  const CAMPS = { 'the-long-hunt': 'missions-the-long-hunt.json', 'growing-madness': 'missions-growing-madness.json', 'secrets-of-the-church': 'missions-secrets-of-the-church.json', 'fall-of-old-yharnam': 'missions-fall-of-old-yharnam.json' };
  for (const [cid, file] of Object.entries(CAMPS)) {
    const p = path.join(ROOT, 'games/bloodborne/golden/transcribed', file);
    if (!fs.existsSync(p)) { warn(`missions transcription missing: ${file}`); continue; }
    const cards = JSON.parse(fs.readFileSync(p, 'utf8')).cards;
    const overlayPath = path.join(DSL_DIR, `${cid}.json`);
    const overlay = fs.existsSync(overlayPath) ? JSON.parse(fs.readFileSync(overlayPath, 'utf8')) : {};
    missions[cid] = {};
    for (const [number, c] of Object.entries(cards)) {
      missions[cid][number] = {
        campaign: cid, number,
        kind: c.kind, title: c.title ?? '', story: c.story ?? null,
        body: c.body ?? '', goalText: c.goal ?? null,
        ...(overlay[number] ?? {}),
      };
      if (!overlay[number] && (c.kind === 'hunt' || c.kind === 'insight')) warn(`no DSL overlay: ${cid} #${number} (${c.title})`);
    }
  }
  write('missions.json', missions);
}

// ---------- 9. hunt board ----------
write('hunt-board.json', { length: 16, resets: [4, 8, 12, 15] });

console.log('compiled. warnings:', warns.length);
for (const w of warns.slice(0, 60)) console.log(' -', w);
