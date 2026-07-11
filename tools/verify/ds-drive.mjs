// Dark Souls TV verification driver: creates a room on the alt server, joins
// seat 0, starts, and plays seat 0 minimally (class pick, choose pendings,
// end own activations, travel the tile chain, enter the fog gate) so the CPU
// party carries a real game forward. Prints STATUS lines the shoot pass reads.
//   node ds-drive.mjs [port] [maxMinutes]
import WebSocket from 'ws';
import fs from 'node:fs';

const PORT = process.argv[2] ?? '8899';
const MAX_MIN = Number(process.argv[3] ?? 20);
const STATUS_FILE = new URL('./ds-drive-status.json', import.meta.url);

const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
let roomId = null;
let lastActAt = 0;
let lastSig = '';
let lastTravelTo = null;
let candidates = []; // fallback actions if the current one is rejected

// tile adjacency straight from the golden (for walking toward enemies)
const tilesGolden = JSON.parse(fs.readFileSync(new URL('../../shared/src/darksouls/data/tiles.json', import.meta.url), 'utf8'));
const faceOf = (id) => tilesGolden.faces.find((f) => f.id === id);
const adjOf = (face) => {
  const adj = {};
  for (const n of face.nodes) adj[n.id] = [];
  for (const [a, b] of face.edges) { adj[a].push(b); adj[b].push(a); }
  return adj;
};
const bfsDist = (face, from, to) => {
  if (from === to) return 0;
  const adj = adjOf(face);
  const seen = new Set([from]);
  let frontier = [from]; let d = 0;
  while (frontier.length) {
    d++;
    const next = [];
    for (const n of frontier) for (const m of adj[n]) {
      if (seen.has(m)) continue;
      if (m === to) return d;
      seen.add(m); next.push(m);
    }
    frontier = next;
  }
  return 99;
};

const send = (o) => ws.send(JSON.stringify(o));
const act = (action) => { send({ type: 'action', action }); lastActAt = Date.now(); };
let lastView = null;
// heartbeat: the throttle can swallow the state that follows our own action,
// so re-run the policy on the latest view every 1.2s
setInterval(() => { if (lastView) policy(lastView); }, 1200);

function fightCandidates(v) {
  const ch = v.characters[0];
  const enc = v.encounter;
  const out = [];
  if (!ch || !enc || !ch.nodeId) return [{ type: 'end_activation' }];
  const face = faceOf(enc.faceId);
  if (ch.damage >= 5 && ch.estus) out.push({ type: 'use_estus' });
  const targets = [...enc.enemies].sort((a, b) => bfsDist(face, ch.nodeId, a.nodeId) - bfsDist(face, ch.nodeId, b.nodeId));
  const bossUnits = (v.boss?.units ?? []).filter((u) => u.inPlay && u.nodeId);
  for (const hand of ['L', 'R']) {
    for (let opt = 0; opt < 3; opt++) {
      for (const en of targets.slice(0, 2)) out.push({ type: 'attack', hand, option: opt, targetUid: en.uid });
      for (const u of bossUnits) out.push({ type: 'attack', hand, option: opt, targetUnit: u.key });
    }
  }
  const goal = targets[0]?.nodeId ?? bossUnits[0]?.nodeId ?? null;
  if (goal && goal !== ch.nodeId && face) {
    const adj = adjOf(face);
    const d0 = bfsDist(face, ch.nodeId, goal);
    const steps = adj[ch.nodeId].filter((n) => bfsDist(face, n, goal) < d0)
      .sort((a, b) => bfsDist(face, a, goal) - bfsDist(face, b, goal));
    for (const n of steps.slice(0, 2)) { out.push({ type: 'walk', nodeId: n }); out.push({ type: 'run', nodeId: n }); }
  }
  out.push({ type: 'end_activation' });
  return out;
}

ws.on('open', () => send({ type: 'create_room', name: 'DS TV verify', game: 'darksouls' }));

ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.type === 'room_created') {
    roomId = m.roomId;
    console.log('ROOM', roomId);
    send({ type: 'join', roomId, name: 'Driver' });
  }
  if (m.type === 'joined') setTimeout(() => send({ type: 'start' }), 400);
  if (m.type === 'error') {
    // rejected action: fall through the candidate list
    const next = candidates.shift();
    if (next) { act(next); return; }
    console.log('ERR', m.message);
  }
  if (m.type !== 'state') return;
  const v = m.view;
  if (v.game !== 'darksouls') return;

  const sig = JSON.stringify({
    phase: v.phase, at: v.partyAt, enc: v.encounter ? [v.encounter.turn, v.encounter.activeSeat, v.encounter.enemies.length] : null,
    head: v.head ? [v.head.id, v.head.seat, v.head.kind] : null, log: v.log.length,
    boss: v.boss ? v.boss.units.map((u) => u.health) : null, w: v.winner,
  });
  if (sig !== lastSig) {
    lastSig = sig;
    const line = `PHASE ${v.phase} at=${v.partyAt} stage=${v.stage} enemies=${v.encounter?.enemies.length ?? '-'} turn=${v.encounter?.turn ?? '-'} boss=${v.boss ? v.boss.id + ':' + v.boss.units.map((u) => u.health).join('/') : '-'} winner=${v.winner}`;
    console.log(line);
    fs.writeFileSync(STATUS_FILE, JSON.stringify({ roomId, phase: v.phase, partyAt: v.partyAt, stage: v.stage, faceId: v.encounter?.faceId ?? null, enemies: v.encounter?.enemies.length ?? 0, turn: v.encounter?.turn ?? null, boss: v.boss ? { id: v.boss.id, hp: v.boss.units.map((u) => u.health) } : null, winner: v.winner, log: v.log.slice(-3).map((e) => e.text) }, null, 1));
  }

  lastView = v;
  policy(v);
});

function policy(v) {
  // ---- seat 0 policy (throttled) ----
  if (Date.now() - lastActAt < 900) return;
  if (v.winner !== null) { console.log('DONE winner', v.winner); setTimeout(() => process.exit(0), 500); return; }

  if (v.phase === 'setup' && v.classPicks && v.classPicks[0] == null) { act({ type: 'pick_class', classId: 'knight' }); return; }
  if (v.head && v.head.seat === 0 && v.head.options?.length) { act({ type: 'choose', pick: v.head.options[0].key }); return; }
  if (v.head || v.busy) return;
  if ((v.phase === 'encounter' || v.phase === 'bossEncounter') && v.encounter?.turn === 'characters' && v.encounter.activeSeat === 0) {
    candidates = fightCandidates(v);
    act(candidates.shift());
    return;
  }
  if (v.phase === 'bonfire') {
    const tiles = v.tiles ?? [];
    const allClear = tiles.every((t) => t.cleared || t.completed);
    if (allClear && tiles.length > 0) {
      if (v.partyAt === v.fogGateTileId) { act({ type: 'enter_fog_gate' }); return; }
      // move along the chain toward the fog gate
    }
    const idx = v.partyAt === 'bonfire' ? -1 : tiles.findIndex((t) => t.id === v.partyAt);
    const next = tiles[idx + 1];
    if (next && lastTravelTo !== `${next.id}:${v.log.length}`) {
      lastTravelTo = `${next.id}:${v.log.length}`;
      act({ type: 'travel', tileId: next.id });
      return;
    }
    if (!next && v.partyAt !== 'bonfire') { act({ type: 'enter_fog_gate' }); return; }
  }
}

setTimeout(() => { console.log('TIME LIMIT'); process.exit(0); }, MAX_MIN * 60 * 1000);
