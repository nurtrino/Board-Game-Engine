// Live WS smoke test for Bloodborne. Creates a room, joins one hunter seat,
// starts (the server pads with CPU hunters), and plays the human seat with
// the same goal heuristics as the engine test bot until the chapter ends.
// Exits 0 on ENDED (victory or defeat both prove the loop), 1 on stalls.
// Run: node tools/verify/bb-smoke.mjs [ws-url]

import WebSocket from 'ws';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const TILES = JSON.parse(readFileSync(path.join(here, '../../shared/src/bloodborne/data/tiles.json'), 'utf8'));
const STATS = JSON.parse(readFileSync(path.join(here, '../../shared/src/bloodborne/data/stats.json'), 'utf8'));
const MISSIONS = JSON.parse(readFileSync(path.join(here, '../../shared/src/bloodborne/data/missions.json'), 'utf8'));
const HUNTERS = JSON.parse(readFileSync(path.join(here, '../../shared/src/bloodborne/data/hunters.json'), 'utf8'));
const CARDS = { ...STATS.cards, ...STATS.upgrades };
const RANK = { fast: 3, medium: 2, slow: 1 };

const URL = process.argv[2] ?? 'ws://localhost:8787/ws';
const CAMPAIGN = process.argv[3] ?? 'the-long-hunt';
const ws = new WebSocket(URL);
const send = (m) => ws.send(JSON.stringify(m));

let roomId = null;
let seat = null;
let view = null;
let acts = 0;
let lastProgress = Date.now();

// ---- tile graph (mirror of state.ts helpers) ----
const EDGES = ['N', 'E', 'S', 'W'];
const rotEdge = (e, rot) => EDGES[(EDGES.indexOf(e) + rot) % 4];
const facing = (e) => EDGES[(EDGES.indexOf(e) + 2) % 4];
const delta = (e) => (e === 'N' ? [0, -1] : e === 'S' ? [0, 1] : e === 'E' ? [1, 0] : [-1, 0]);
const worldExits = (t) => TILES[t.tileId].exits.map((x) => ({ edge: rotEdge(x.edge, t.rot), space: x.space }));
const tileAt = (x, y) => view.tiles.find((t) => t.x === x && t.y === y);

const neighbors = (ref) => {
  const [uidS, space] = [ref.slice(0, ref.indexOf(':')), ref.slice(ref.indexOf(':') + 1)];
  const uid = +uidS;
  const t = view.tiles.find((x) => x.uid === uid);
  if (!t) return [];
  const def = TILES[t.tileId];
  const out = [];
  for (const [a, b] of def.adjacency) {
    if (a === space) out.push(`${uid}:${b}`);
    else if (b === space) out.push(`${uid}:${a}`);
  }
  for (const ex of worldExits(t)) {
    if (ex.space !== space) continue;
    const [dx, dy] = delta(ex.edge);
    const nb = tileAt(t.x + dx, t.y + dy);
    if (!nb) continue;
    const match = worldExits(nb).find((e) => e.edge === facing(ex.edge));
    if (!match) continue;
    if (view.fogGates.includes(uid)) continue;
    out.push(`${nb.uid}:${match.space}`);
  }
  return out;
};

const nextStepToward = (from, to) => {
  const prev = new Map([[from, '']]);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    if (cur === to) break;
    for (const nb of neighbors(cur)) {
      if (!prev.has(nb)) { prev.set(nb, cur); q.push(nb); }
    }
  }
  if (!prev.has(to)) return null;
  let cur = to;
  while (prev.get(cur) !== from && prev.get(cur) !== '') cur = prev.get(cur);
  return cur === from ? null : cur;
};

// ---- seat heuristics ----
let plan = null; // {kind:'goto'|'reveal', target, edge}

const DEBUG = !!process.env.BB_SMOKE_DEBUG;
function myMove() {
  if (!view || seat === null || view.phase === 'ended') return;
  const act = (action) => { acts++; if (DEBUG) console.log('->', JSON.stringify(action).slice(0, 90)); send({ type: 'action', action }); };
  const me = view.hunters[seat];

  // pendings owned by us
  if (view.pending.length > 0) {
    const p = view.pending[0];
    if (p.seat !== seat) return;
    switch (p.kind) {
      case 'round-refresh': return act({ type: 'round_refresh', discard: [] });
      case 'combat-attack': {
        const slot = me.slots.findIndex((x) => x === null);
        const card = me.hand.find((c) => !CARDS[c]?.effects?.dodge) ?? me.hand[0];
        if (slot >= 0 && card) return act({ type: 'choose', cardId: card, slot });
        return act({ type: 'choose', pass: true });
      }
      case 'combat-dodge': case 'combat-rider': {
        const card = me.hand.find((c) => CARDS[c]?.effects?.dodge);
        const need = typeof p.speed === 'number' ? p.speed : (RANK[p.speed] ?? 1);
        const slots = HUNTERS[me.hunterId]?.sides?.[me.weaponSide]?.slots ?? [];
        const slot = me.slots.findIndex((x, i) => x === null && (RANK[slots[i]?.speed] ?? 0) >= need);
        if (card && slot >= 0) return act({ type: 'choose', cardId: card, slot });
        return act({ type: 'choose', pass: true });
      }
      case 'discard-for-stun': return act({ type: 'choose', cardId: me.hand[0] });
      case 'onkill-reward': return act({ type: 'choose', use: true });
      case 'dream-upgrades': return act({ type: 'choose', upgradeId: view.upgradeRow[0] });
      case 'dream-incorporate': return act({ type: 'choose', discard: true });
      case 'return-placement': {
        // any lamp space: central lamp space a on tile 1 is safest bet; find lamp icon
        for (const t of view.tiles) {
          const sp = TILES[t.tileId].spaces.find((x) => x.icons.includes('lamp') && !view.brokenLamps.includes(`${t.uid}:${x.id}`));
          if (sp) return act({ type: 'choose', side: 0, space: `${t.uid}:${sp.id}` });
        }
        return;
      }
      case 'tile-orientation': return act({ type: 'choose', rot: p.options[0] });
      case 'reward-overflow': return act({ type: 'choose', giveTo: null });
      case 'mission-choice': return act({ type: 'choose', option: p.options[0] });
      default: return;
    }
  }

  if (view.phase === 'setup') {
    if (!me.hunterId) return act({ type: 'pick_hunter', hunterId: ['saw-cleaver', 'threaded-cane', 'hunter-axe', 'ludwig-s-holy-blade'].find((h) => !view.pickedHunters.includes(h)) });
    return;
  }

  if (view.activeSeat === null) {
    if (!me.tookTurnThisRound && !me.skipTurn) return act({ type: 'begin_turn' });
    return;
  }
  if (view.activeSeat !== seat) return;

  const emptySlot = me.slots.findIndex((x) => x === null);
  const here = me.space;
  const movingNow = view.moving && view.moving.seat === seat;
  if (movingNow) {
    // a move is in progress: an enemy in our space means stop and fight
    if (view.enemies.some((e) => e.space === here) || view.bosses.some((b) => b.space === here)) {
      plan = null;
      return act({ type: 'end_move' });
    }
  } else {
    const target = view.enemies.find((e) => e.space === here);
    const bossHere = view.bosses.find((b) => b.space === here);
    if ((target || bossHere) && emptySlot >= 0 && me.hand.length > 1) {
      const card = me.hand.find((c) => !CARDS[c]?.effects?.dodge) ?? me.hand[0];
      return act({ type: 'attack', cardId: card, slot: emptySlot, enemyUid: target?.uid, bossUid: bossHere?.uid });
    }
    if (here && view.consumableTokens.includes(here) && me.hand.length > 1) {
      return act({ type: 'interact', cardId: me.hand[0] });
    }
    if (emptySlot === -1 && me.hand.length > 1) return act({ type: 'transform', cardId: me.hand[0] });
    if ((me.echoes >= 3 || me.hp <= 1) && me.hand.length > 0 && here) return act({ type: 'dream', cardId: me.hand[0] });
    if (me.hand.length <= 1) return act({ type: 'end_turn' });
  }
  // movement plan
  if (plan == null && movingNow) {
    // resume: leftover budget from a reveal — just spend or end it
    plan = { kind: 'goto', target: here };
  }
  if (plan == null) {
    const tagged = view.enemies.find((e) => e.missionTag);
    const boss = view.bosses[0];
    if (tagged) plan = { kind: 'goto', target: tagged.space };
    else if (boss) plan = { kind: 'goto', target: boss.space };
    else {
      const defs = MISSIONS[view.campaignId] ?? {};
      const ch = defs[`Chapter ${view.chapter} - Setup`];
      let found = null;
      for (const t of ch?.triggers ?? []) {
        if (t.on !== 'endMoveOnTile' || view.missions[t.reveal]?.revealed) continue;
        const tt = view.tiles.find((x) => TILES[x.tileId].name.toLowerCase() === (t.tile ?? '').toLowerCase());
        if (tt) { found = { kind: 'goto', target: `${tt.uid}:${TILES[tt.tileId].spaces[0].id}` }; break; }
      }
      if (!found && view.insightCollected >= 2) {
        const central = view.tiles.find((x) => TILES[x.tileId].name === 'CENTRAL LAMP');
        if (central) found = { kind: 'goto', target: `${central.uid}:${TILES[central.tileId].spaces.find((x) => x.named)?.id ?? TILES[central.tileId].spaces[0].id}` };
      }
      if (!found) {
        outer: for (const t of view.tiles) {
          if (view.fogGates.includes(t.uid)) continue;
          for (const ex of worldExits(t)) {
            const [dx, dy] = delta(ex.edge);
            if (!tileAt(t.x + dx, t.y + dy) && view.tileDeckCount > 0) {
              found = { kind: 'reveal', target: `${t.uid}:${ex.space}`, edge: ex.edge };
              break outer;
            }
          }
        }
      }
      plan = found ?? { kind: 'goto', target: here };
    }
    if (!movingNow) return act({ type: 'move', cardId: me.hand[0] });
  }
  // we are moving (plan set): step toward target, reveal when at the exit
  if (plan.kind === 'reveal' && here === plan.target) {
    const edge = plan.edge;
    plan = null;
    return act({ type: 'step_reveal', edge });
  }
  if (here === plan.target) { plan = null; return act({ type: 'end_move' }); }
  const next = nextStepToward(here, plan.target);
  if (next) return act({ type: 'step', to: next });
  plan = null;
  return act({ type: 'end_move' });
}

ws.on('open', () => send({ type: 'create_room', name: 'BB smoke ' + CAMPAIGN, game: 'bloodborne', options: { campaign: CAMPAIGN, chapter: 1, partySize: 4 } }));
ws.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.type === 'room_created') {
    roomId = m.roomId;
    console.log('room', roomId);
    send({ type: 'join', roomId, name: 'Smoke' });
  } else if (m.type === 'joined') {
    seat = m.playerIndex;
    send({ type: 'start' });
  } else if (m.type === 'state') {
    if (m.view.you !== seat && m.view.you !== null) return; // watcher frame
    if (m.view.you === null && seat !== null && view) return; // TV frame after joined
    view = m.view;
    lastProgress = Date.now();
    if (view.phase === 'ended') {
      console.log(`ENDED outcome=${view.outcome} round=${view.round} track=${view.huntTrack} insight=${view.insightCollected} acts=${acts}`);
      process.exit(0);
    }
    setTimeout(myMove, 50);
  } else if (m.type === 'error') {
    if (DEBUG) console.log('ERR:', m.message);
    plan = null; // rejected: rethink next frame
    setTimeout(myMove, 80);
  }
});
ws.on('error', (e) => { console.error(e.message); process.exit(1); });

setInterval(() => {
  if (Date.now() - lastProgress > 30000) {
    console.error(`STALLED phase=${view?.phase} round=${view?.round} active=${view?.activeSeat} pending=${JSON.stringify(view?.pending?.[0])}`);
    process.exit(1);
  }
}, 5000);
