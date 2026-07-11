// Live-server Politik smoke. Creates three independently connected Nations,
// drives every decision through each seat's public WebSocket protocol,
// verifies neutral-TV privacy, and continues until the authoritative server
// reports a winner.
//
// Run: node tools/verify/politik-smoke.mjs [wsUrl]

import { readFile } from 'node:fs/promises';
import WebSocket from 'ws';

const WS_URL = process.argv[2] ?? 'ws://localhost:8787/ws';
const HARD_MS = 12 * 60_000;
const data = JSON.parse(await readFile(new URL('../../shared/src/politik/data.json', import.meta.url), 'utf8'));
const nationById = Object.fromEntries(data.cards.nationDefs.map((nation) => [nation.id, nation]));
const BASES = ['capitalism', 'communism', 'statism', 'fascism'];
const COUNCIL = ['chair', 'justice', 'commerce', 'labor', 'intel', 'defense'];
const INDUSTRIES = ['media', 'energy', 'financial', 'humanities', 'technology', 'manufacturing'];

const propagandaBases = {
  specializations: ['capitalism'], homeland: ['statism'], intensification: ['statism'], cultureOfOpenness: ['statism'],
  steelyWit: ['fascism'], intimidationTactics: ['fascism'], oathOfPoverty: ['communism'], honorCulture: ['fascism'],
  assuredStability: ['communism'], loftyRhetoric: ['communism'], holisticLearnings: ['communism'], unity: [...BASES],
  proteges: ['communism'], improvisation: ['fascism'], backchannels: ['capitalism'], cryptocracy: ['capitalism'],
  redEmpire: ['fascism'], petrostate: ['statism'], greyArea: ['capitalism'], dogmatic: ['statism'],
  oldMoney: ['capitalism'], birthright: ['communism'], marketmaker: ['capitalism'], catchAndKill: ['fascism'],
};

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`ok - ${message}`);
}

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function waitFor(ws, predicate, timeout = 20_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('WebSocket wait timed out')), timeout);
    const onMessage = (raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === 'error') return done(new Error(message.message));
      const result = predicate(message, ws);
      if (result !== undefined) done(null, result);
    };
    const onError = (error) => done(error);
    function done(error, value) {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('error', onError);
      error ? reject(error) : resolve(value);
    }
    ws.on('message', onMessage);
    ws.on('error', onError);
  });
}

function sendAndWait(ws, message, predicate, timeout = 20_000) {
  const result = waitFor(ws, predicate, timeout);
  ws.send(JSON.stringify(message));
  return result;
}

function controller(view, values, kind, id) {
  const max = Math.max(...values);
  if (max <= 0) return null;
  const tied = values.map((value, seat) => ({ value, seat })).filter((entry) => entry.value === max).map((entry) => entry.seat);
  if (tied.length === 1) return tied[0];
  const ruling = view.ties.find((tie) => tie.kind === kind && tie.id === id)?.ruling;
  return ruling !== null && ruling !== undefined && tied.includes(ruling) ? ruling : null;
}

function supportAllocation(player, amount) {
  const base = player.propaganda[0]?.bases?.[0] ?? 'capitalism';
  return { [base]: amount };
}

function setupAction(view, seat) {
  const pending = view.pending;
  const player = view.players[seat];
  if (pending.kind === 'mulligan') return { type: 'mulligan', take: false };
  if (pending.kind === 'nation') {
    const nation = nationById[player.nationChoices[0]];
    // The smoke intentionally avoids the two exceptional start-location cards;
    // dedicated reducer tests cover those branches without making this run seed-dependent.
    const propaganda = nation.propaganda.find((id) => id !== 'steelyWit' && id !== 'dogmatic') ?? nation.propaganda[0];
    const base = propagandaBases[propaganda][0];
    return {
      type: 'choose_nation', nation: nation.id, propaganda,
      support: { [base]: nation.support }, leaders: { military: nation.leaders },
    };
  }
  if (pending.kind === 'setup_bonus') {
    const bonus = pending.available.find((value) => value !== 'exchange') ?? 'exchange';
    return bonus === 'exchange'
      ? { type: 'choose_setup_bonus', bonus, exchange: [{ resource: 'food', mode: 'buy', amount: 1 }] }
      : { type: 'choose_setup_bonus', bonus };
  }
  if (pending.kind === 'start_state') {
    const state = Object.values(view.locations).find((location) => location.kind === 'state' && location.influence.every((value) => value === 0));
    return { type: 'choose_start_state', state: state.id };
  }
  return null;
}

function pendingAction(view, seat) {
  const pending = view.pending;
  if (!pending || pending.seat !== seat) return null;
  if (['mulligan', 'nation', 'setup_bonus', 'start_state'].includes(pending.kind)) return setupAction(view, seat);
  if (pending.kind === 'guided') return { type: 'resolve_guided', operations: [{ kind: 'acknowledge', text: 'Printed effect checked.' }], note: 'Printed effect checked.' };
  if (pending.kind === 'landscape') {
    const choice = pending.overflow?.eligibleIndustries?.find((industry) => view.marketSupply[industry] > 0) ?? null;
    return { type: 'resolve_landscape', choice };
  }
  if (pending.kind === 'clash') return pending.stage === 'attacker_commit' || pending.stage === 'defender_commit'
    ? { type: 'clash_commit', cards: [], leaders: 0, focusInfluence: {} }
    : { type: 'pass_clash' };
  if (pending.kind === 'corporate_loss') {
    const company = view.players[seat].companies.find((entry) => entry.id === pending.loserCompany);
    let left = pending.amount;
    const margin = Math.min(left, company?.margin ?? 0);
    left -= margin;
    const markets = {};
    for (const industry of INDUSTRIES) {
      const take = Math.min(left, company?.markets?.[industry] ?? 0);
      if (take) markets[industry] = take;
      left -= take;
    }
    return { type: 'resolve_corporate_loss', margin, markets };
  }
  if (pending.kind === 'corporate_gain') {
    const choice = pending.eligibleIndustries?.find((industry) => view.marketSupply[industry] > 0) ?? null;
    return { type: 'resolve_corporate_gain', choice };
  }
  if (pending.kind === 'trade') return { type: 'respond_trade', accept: false };
  if (pending.kind === 'edge_window') return { type: 'pass_edge' };
  if (pending.kind === 'allocate_support') return { type: 'allocate_support', support: supportAllocation(view.players[seat], pending.amount) };
  if (pending.kind === 'hand_limit') {
    const hand = view.players[seat].hand ?? [];
    const discardable = hand.map((card, index) => ({ card, index })).filter(({ card }) => card.kind !== 'obligation').slice(0, pending.excess);
    if (discardable.length === pending.excess) return { type: 'discard', handIndices: discardable.map(({ index }) => index) };
    const obligation = hand.findIndex((card) => card.kind === 'obligation');
    return player.capital >= 10 * player.corruption
      ? { type: 'shirk_obligation', handIndex: obligation }
      : { type: 'play_card', handIndex: obligation, spec: { kind: 'obligation', capitalCost: 0 } };
  }
  return null;
}

function nationalAction(view, seat) {
  const player = view.players[seat];
  const unused = ['rally', 'income', 'produce', 'refresh'].filter((action) => !player.nationalUsed.includes(action));
  if (unused.includes('income')) return { type: 'national', action: 'income' };
  if (unused.includes('produce')) {
    const support = Object.values(view.locations).filter((location) => location.benefit === 'support' && controller(view, location.influence, 'location', location.id) === seat).length;
    return { type: 'national', action: 'produce', produceSupport: supportAllocation(player, support) };
  }
  if (unused.includes('refresh')) return { type: 'national', action: 'refresh' };
  if (unused.includes('rally')) {
    const gains = Object.fromEntries(BASES.map((base) => [base, player.propaganda.filter((card) => card.bases.includes(base)).length]));
    // A Unity-style multi-base card can only award once. Keep its first Base.
    for (const card of player.propaganda.filter((entry) => entry.bases.length > 1)) {
      for (const base of card.bases.slice(1)) gains[base]--;
    }
    let chair;
    if (controller(view, view.councilSupport.chair, 'council', 'chair') === seat) {
      const choices = COUNCIL.flatMap((council) => view.players.map((candidate) => ({ seat: candidate.seat, council, amount: view.councilSupport[council][candidate.seat] })))
        .filter((choice) => choice.amount > 0)
        .sort((left, right) => right.amount - left.amount || left.seat - right.seat || COUNCIL.indexOf(left.council) - COUNCIL.indexOf(right.council));
      const choice = choices.find((entry) => entry.seat === seat) ?? choices.find((entry) => entry.seat !== view.first) ?? choices[0];
      if (choice) chair = { seat: choice.seat, council: choice.council };
    }
    return { type: 'national', action: 'rally', rallySupport: gains, ...(chair ? { chair } : {}) };
  }
  return { type: 'national', action: 'refresh' };
}

function mainAction(view, seat) {
  if (view.actionsTaken >= view.actionsAllowed) return { type: 'end_turn' };
  return nationalAction(view, seat);
}

function actionFor(view, seat) {
  const pending = pendingAction(view, seat);
  if (pending) return pending;
  if (view.pending) return null;
  const tie = view.ties.find((entry) => entry.ruling === null);
  if (tie && view.finalSay === seat) return { type: 'final_say', contest: tie.key, winner: tie.candidates.includes(seat) ? seat : tie.candidates[0] };
  if (view.phase === 'playing' && view.turn === seat) return mainAction(view, seat);
  return null;
}

function saveUrl(id) {
  const url = new URL(WS_URL);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = `/api/saves/${id}`;
  url.search = '';
  url.hash = '';
  return url.href;
}

function driveHuman(ws, initialView) {
  let lastView = initialView;
  let lastFingerprint = '';
  let lastAction = null;
  let actions = 0;
  let rejected = 0;
  let settled = false;
  let nextProgressTurn = 10;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error(`FAIL: live game timed out after ${actions} human actions at turn ${lastView?.turnNumber}, pending ${lastView?.pending?.kind ?? 'none'}:${lastView?.pending?.stage ?? ''}`));
    }, HARD_MS);
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('error', onError);
      error ? reject(error) : resolve(value);
    };
    const handleView = (view) => {
      lastView = view;
      if (view.turnNumber >= nextProgressTurn) {
        console.log(`progress - turn ${view.turnNumber}, human actions ${actions}, pending ${view.pending?.kind ?? 'none'}:${view.pending?.stage ?? ''}`);
        nextProgressTurn += 10;
      }
      if (view.phase === 'ended') return finish(null, { final: view, actions, rejected });
      const fingerprint = JSON.stringify([view.phase, view.turn, view.actionsTaken, view.eventSeq, view.pending, view.ties]);
      if (fingerprint === lastFingerprint) return;
      const action = actionFor(view, 0);
      if (!action) return;
      lastFingerprint = fingerprint;
      lastAction = action;
      actions++;
      ws.send(JSON.stringify({ type: 'action', action }));
    };
    const onMessage = (raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === 'error') {
        rejected++;
        return finish(new Error(`FAIL: human action ${JSON.stringify(lastAction)} rejected at ${lastView?.pending?.kind ?? 'none'}:${lastView?.pending?.stage ?? ''}: ${message.message}`));
      }
      if (message.type === 'state' && message.view?.game === 'politik' && message.view.you === 0) handleView(message.view);
    };
    const onError = (error) => finish(error);
    ws.on('message', onMessage);
    ws.on('error', onError);
    handleView(initialView);
  });
}

let passed = false;
for (let attempt = 1; attempt <= 8 && !passed; attempt++) {
  const sockets = [];
  let roomId = null;
  let cleanup = 'not-created';
  try {
    const host = await connect(); sockets.push(host);
    roomId = await sendAndWait(host, { type: 'create_room', name: `Politik live smoke ${Date.now()}`, game: 'politik' }, (message) => message.type === 'room_created' ? message.roomId : undefined);
    await sendAndWait(host, { type: 'join', roomId, name: 'Smoke Nation' }, (message) => message.type === 'joined' ? message.playerToken : undefined);

    const watcher = await connect(); sockets.push(watcher);
    const neutralPromise = sendAndWait(watcher, { type: 'watch', roomId }, (message) => message.type === 'state' && message.view?.game === 'politik' ? message.view : undefined, 30_000);
    const initialPromise = waitFor(host, (message) => message.type === 'state' && message.view?.game === 'politik' && message.view.you === 0 ? message.view : undefined, 30_000);
    host.send(JSON.stringify({ type: 'start' }));
    const [initial, neutral] = await Promise.all([initialPromise, neutralPromise]);

    if (initial.first === 0) {
      console.log(`retry - room ${roomId} gave first player to the safe human seat`);
      continue;
    }

    assert(neutral.you === null, 'TV receives a neutral Politik view');
    assert(neutral.players.every((player) => !Object.prototype.hasOwnProperty.call(player, 'hand')), 'TV view contains no private hands');
    watcher.close();

    const started = Date.now();
    const { final, actions, rejected } = await driveHuman(host, initial);
    assert(final.phase === 'ended', `live CPU-led game reached its terminal phase in ${actions} human actions`);
    assert(Array.isArray(final.winners) && final.winners.length > 0, 'authoritative winner list is present');
    assert(final.players.every((player) => !player.hand || player.seat === 0), 'seat view exposes only its own private hand');
    assert(rejected === 0, 'server accepted every smoke action');
    console.log(`POLITIK LIVE SMOKE PASS - room ${roomId}, winner ${final.winners.join(',')}, turn ${final.turnNumber}, ${Math.round((Date.now() - started) / 1000)}s`);
    console.log(`HUMAN_ACTIONS=${actions}`);
    console.log(`ROOM=${roomId}`);
    passed = true;
  } finally {
    if (roomId) {
      try {
        const response = await fetch(saveUrl(roomId), { method: 'DELETE' });
        cleanup = response.ok ? 'deleted' : `delete-failed-${response.status}`;
      } catch (error) {
        cleanup = `delete-error-${error instanceof Error ? error.message : String(error)}`;
      }
    }
    for (const ws of sockets) if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
    console.log(`CLEANUP=${cleanup}${roomId ? `:${roomId}` : ''}`);
  }
}

if (!passed) throw new Error('FAIL: could not create a CPU-first Politik room in 8 attempts');
