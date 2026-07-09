// Live WS smoke test for Dune: Imperium. Creates a room, joins one human
// seat, starts (the server pads with CPU seats), and plays the human seat
// with random-legal attempts until the game ends. Exits non-zero on stalls.
// Run: node tools/verify/dune-smoke.mjs [ws-url]

import WebSocket from 'ws';

const URL = process.argv[2] ?? 'ws://localhost:8787/ws';
const ws = new WebSocket(URL);
const send = (m) => ws.send(JSON.stringify(m));
const rand = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rand(a.length)];

let roomId = null;
let seat = null;
let view = null;
let acts = 0;
let lastProgress = Date.now();

const FACTIONS = ['emperor', 'guild', 'beneGesserit', 'fremen'];

function myMove() {
  if (!view || seat === null) return;
  const me = view.players[seat];
  const act = (action) => { acts++; send({ type: 'action', action }); };

  if (view.pending && view.pending.seat === seat) {
    const d = view.pending.decision;
    switch (d.kind) {
      case 'influenceAny': return act({ type: 'choose', faction: pick(FACTIONS) });
      case 'influencePickTwo': case 'baronFactions': {
        const fs = [...FACTIONS].sort(() => Math.random() - 0.5).slice(0, 2);
        return act({ type: 'choose', factions: fs });
      }
      case 'influenceWhereBehind': return act({ type: 'choose', accept: false });
      case 'influencePick': return act({ type: 'choose', faction: d.options[0] });
      case 'voiceSpace': return act({ type: 'choose', space: 'arrakeen' });
      case 'trash': return act({ type: 'choose', accept: false });
      case 'discardOrLoseTroop':
        return me.hand?.length ? act({ type: 'choose', card: me.hand[0] }) : act({ type: 'choose' });
      case 'helenaRow': case 'freeAcquire': {
        const rows = view.imperiumRow.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
        return rows.length ? act({ type: 'choose', option: rows[0] }) : act({ type: 'choose', accept: false });
      }
      case 'recallAgent': {
        const mine = Object.entries(view.spaces).find(([, v]) => v.includes(seat));
        return mine ? act({ type: 'choose', space: mine[0] }) : act({ type: 'choose', accept: false });
      }
      case 'pickOpponentInConflict': {
        const t = view.players.find((q) => q.seat !== seat && q.inConflict > 0);
        return t ? act({ type: 'choose', seat: t.seat }) : act({ type: 'choose', accept: false });
      }
      case 'conflictChoice': {
        if ((d.pick ?? 1) === 1) return act({ type: 'choose', option: rand(d.options.length) });
        return act({ type: 'choose', options: [0, 1] });
      }
      default: return act({ type: 'choose', accept: false });
    }
  }
  if (view.pending || view.turn !== seat || view.phase === 'ended') return;

  if (view.phase === 'leaders') return act({ type: 'pick_leader', leader: pick(view.leaderPool) });
  if (view.phase === 'combat') return act({ type: 'combat_pass' });

  if (me.actedThisTurn === 'reveal') {
    const buys = [];
    view.imperiumRow.forEach((c, i) => { if (c) buys.push({ type: 'acquire', row: i }); });
    if (buys.length && Math.random() < 0.5) return act(pick(buys)); // may bounce; end_turn next tick
    return act({ type: 'end_turn' });
  }
  if (me.actedThisTurn === 'agent') return act({ type: 'end_turn' });

  if ((me.agentsLeft > 0 || me.mentat) && me.hand?.length && Math.random() < 0.9) {
    // one random attempt per tick; the server rejects illegal combos harmlessly
    const spaces = ['arrakeen', 'carthag', 'conspire', 'wealth', 'foldspace', 'heighliner', 'secrets',
      'selectiveBreeding', 'stillsuits', 'hardyWarriors', 'highCouncil', 'mentat', 'swordmaster',
      'rallyTroops', 'hallOfOratory', 'secureContract', 'sellMelange', 'greatFlat', 'haggaBasin',
      'imperialBasin', 'researchStation', 'sietchTabr'];
    const a = { type: 'agent', card: pick(me.hand), space: pick(spaces) };
    if (a.space === 'sellMelange') a.sell = 2;
    a.deploy = 2;
    return act(a);
  }
  if (!me.revealed) return act({ type: 'reveal' });
  return act({ type: 'end_turn' });
}

ws.on('open', () => send({ type: 'create_room', name: 'Dune smoke', game: 'dune' }));
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
    view = m.view;
    lastProgress = Date.now();
    if (view.phase === 'ended') {
      console.log(`ENDED round=${view.round} winner=${view.winner} acts=${acts}`);
      console.log(view.finalScores?.map((f) => `${view.players[f.seat].name}: ${f.vp} VP`).join(' | '));
      process.exit(0);
    }
    setTimeout(myMove, 60);
  } else if (m.type === 'error') {
    // rejected attempt: try something else next state push
    setTimeout(myMove, 60);
  }
});
ws.on('error', (e) => { console.error(e.message); process.exit(1); });

setInterval(() => {
  if (Date.now() - lastProgress > 30000) {
    console.error(`STALLED at phase=${view?.phase} round=${view?.round} turn=${view?.turn} pending=${JSON.stringify(view?.pending)}`);
    process.exit(1);
  }
}, 5000);
