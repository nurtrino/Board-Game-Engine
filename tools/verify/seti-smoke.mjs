// Live SETI engine smoke. Setup uses WebSocket protocol directly and every
// gameplay decision is chosen from the owner's redacted view. The separate
// seti-ui-smoke.mjs ship gate performs gameplay through the DOM only.
//
// Run:
//   node tools/verify/seti-smoke.mjs [ws-url] [seats] [solo-difficulty]

import WebSocket from 'ws';

const URL = process.argv[2] ?? 'ws://localhost:8899/ws';
const SEATS = Math.max(1, Math.min(4, Number(process.argv[3] ?? 4)));
const SOLO_DIFFICULTY = Math.max(1, Math.min(5, Number(process.argv[4] ?? 3)));
const STALL_MS = 45_000;
const HARD_MS = 5 * 60_000;

const sockets = [];
const views = [];
const errors = [];
let roomId = null;
let started = false;
let actions = 0;
let lastProgress = Date.now();
let lastRound = 0;
let finished = false;
const sentSignatures = new Set();

const send = (ws, message) => ws.send(JSON.stringify(message));

function choiceAction(view, seat) {
  const pending = view.pending?.decision;
  if (!pending || view.pending.owner !== seat) return null;
  const first = pending.options?.[0];
  const firstNonSkip = pending.options?.find((option) => option !== 'skip' && option !== 'done') ?? first;
  switch (pending.kind) {
    case 'initial-income-card':
      return { type: 'choose_initial_income', cardId: first };
    case 'discard-to-four': {
      const me = view.players[seat];
      const cards = [...(me.hand ?? []), ...(me.alienHand ?? [])].slice(0, pending.count);
      return { type: 'choose', choice: { kind: 'cards', cardIds: cards } };
    }
    case 'end-round-card':
    case 'tuck-income-card':
      return first === 'skip'
        ? { type: 'choose', choice: { kind: 'option', option: 'skip' } }
        : { type: 'choose', choice: { kind: 'card', cardId: first } };
    case 'signal-sector': {
      const row = pending.source === 'project-row' ? pending.rowOptions?.[0] : undefined;
      return { type: 'choose', choice: { kind: 'sector', sectorId: first, ...(row === undefined ? {} : { row }) } };
    }
    case 'completed-sector-order':
      return { type: 'choose', choice: { kind: 'sector', sectorId: first } };
    case 'trace-space':
      return { type: 'choose', choice: { kind: 'trace-space', spaceId: first } };
    case 'gold-tile':
      return { type: 'choose', choice: { kind: 'gold-tile', tileId: first } };
    case 'tech-stack':
      return { type: 'choose', choice: { kind: 'tech-stack', stackId: first } };
    case 'mars-first-data':
    case 'computer-tech-slot':
      return { type: 'choose', choice: { kind: 'number', value: Number(first) } };
    case 'card-effect-choice':
    case 'alien-card-source':
    case 'centaurian-reward':
    case 'exertian-card':
    case 'solo-objective-task':
    case 'project-visit-reward':
    case 'manual-trigger-choice':
      return { type: 'choose', choice: { kind: 'option', option: firstNonSkip ?? first } };
    default:
      throw new Error(`Unmapped SETI pending kind in smoke: ${pending.kind}`);
  }
}

function nextAction(view, seat) {
  const pendingAction = choiceAction(view, seat);
  if (pendingAction) return pendingAction;
  if (view.pending || view.phase !== 'playing' || view.activeSeat !== seat) return null;
  if (view.mainActionTaken) return view.legal?.canEndTurn ? { type: 'end_turn' } : null;
  return view.legal?.canPass ? { type: 'pass' } : null;
}

function signature(view, seat, action) {
  return JSON.stringify([
    seat,
    view.phase,
    view.round,
    view.activeSeat,
    view.mainActionTaken,
    view.lastEvent?.seq,
    view.pending,
    action,
  ]);
}

function maybeAct(seat) {
  if (!started || finished) return;
  const view = views[seat];
  const ws = sockets[seat];
  if (!view || !ws || ws.readyState !== WebSocket.OPEN) return;
  if (view.phase === 'ended') {
    finished = true;
    const scores = view.players.map((player) => `${player.name}:${player.finalScore ?? player.score}`).join(' | ');
    console.log(`SETI WS SMOKE PASS - ${SEATS} seat(s), ${actions} actions, scores ${scores}`);
    closeAll(0);
    return;
  }
  const action = nextAction(view, seat);
  if (!action) return;
  const key = signature(view, seat, action);
  if (sentSignatures.has(key)) return;
  sentSignatures.add(key);
  actions++;
  send(ws, { type: 'action', action });
}

function connectSeat(index, token = null) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    ws.on('open', () => {
      if (index === 0 && roomId === null) {
        send(ws, {
          type: 'create_room',
          name: 'SETI engine smoke',
          game: 'seti',
          options: { soloDifficulty: SOLO_DIFFICULTY },
        });
      } else {
        send(ws, { type: 'join', roomId, name: `Smoke ${index + 1}`, ...(token ? { playerToken: token } : {}) });
      }
    });
    ws.on('message', (raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === 'room_created') {
        roomId = message.roomId;
        send(ws, { type: 'join', roomId, name: 'Smoke 1' });
        return;
      }
      if (message.type === 'joined' && !settled) {
        sockets[index] = ws;
        settled = true;
        resolve({ seat: message.playerIndex, token: message.playerToken });
        return;
      }
      if (message.type === 'state') {
        views[index] = message.view;
        lastProgress = Date.now();
        if (message.view.round !== lastRound) {
          lastRound = message.view.round;
          console.log(`round ${lastRound} - ${actions} actions`);
        }
        queueMicrotask(() => {
          for (let seat = 0; seat < sockets.length; seat++) maybeAct(seat);
        });
        return;
      }
      if (message.type === 'error') {
        errors.push(message.message);
        sentSignatures.clear();
        if (!settled) fail(new Error(message.message));
      }
    });
    ws.on('error', fail);
    setTimeout(() => fail(new Error(`SETI seat ${index + 1} setup timeout`)), 15_000);
  });
}

function closeAll(code) {
  for (const ws of sockets) ws?.close();
  setTimeout(() => process.exit(code), 20);
}

const began = Date.now();
const first = await connectSeat(0);
if (first.seat !== 0) throw new Error(`First SETI smoke seat was ${first.seat}`);
for (let index = 1; index < SEATS; index++) {
  const joined = await connectSeat(index);
  if (joined.seat !== index) throw new Error(`SETI smoke seat ${index} joined as ${joined.seat}`);
}
send(sockets[0], { type: 'start' });
started = true;

const watchdog = setInterval(() => {
  if (finished) return;
  if (Date.now() - began > HARD_MS) {
    console.error(`SETI WS SMOKE TIMEOUT after ${actions} actions`);
    closeAll(1);
    return;
  }
  if (Date.now() - lastProgress > STALL_MS) {
    console.error(`SETI WS SMOKE STALLED after ${actions} actions`);
    for (let seat = 0; seat < views.length; seat++) {
      const view = views[seat];
      console.error(`seat ${seat}: ${JSON.stringify({ phase: view?.phase, round: view?.round, activeSeat: view?.activeSeat, pending: view?.pending, error: errors.at(-1) })}`);
    }
    closeAll(1);
  }
}, 2_000);
watchdog.unref();

for (let seat = 0; seat < sockets.length; seat++) maybeAct(seat);
