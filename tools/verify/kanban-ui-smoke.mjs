// UI-driven full-game smoke for Kanban EV (playbook §6.4b ship gate).
// Four seats join over WS (setup only), then four puppeteer pages play an
// entire game by clicking the real device DOM — workstation picks, task
// buttons, pending prompts, meetings. A stall means a missing affordance.
// Run: node tools/verify/kanban-ui-smoke.mjs [base] [wsUrl]

import WebSocket from 'ws';
import puppeteer from 'puppeteer';

const BASE = process.argv[2] ?? 'http://localhost:8899';
const WS_URL = process.argv[3] ?? 'ws://localhost:8899/ws';
const SEATS = 4;
const STALL_MS = 120_000;
const HARD_MS = 45 * 60_000;

function wsOnce(setup, wanted) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.on('open', () => setup(ws));
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === 'error') { ws.close(); reject(new Error(m.message)); }
      const out = wanted(m, ws);
      if (out !== undefined) { ws.close(); resolve(out); }
    });
    ws.on('error', reject);
    setTimeout(() => { ws.close(); reject(new Error('ws timeout')); }, 15000);
  });
}

async function setupRoom() {
  const roomId = await wsOnce(
    (ws) => ws.send(JSON.stringify({ type: 'create_room', name: 'Kanban UI smoke', game: 'kanban' })),
    (m) => (m.type === 'room_created' ? m.roomId : undefined),
  );
  const tokens = [];
  for (let i = 0; i < SEATS; i++) {
    tokens.push(await wsOnce(
      (ws) => ws.send(JSON.stringify({ type: 'join', roomId, name: `Seat${i + 1}` })),
      (m) => (m.type === 'joined' ? m.playerToken : undefined),
    ));
  }
  await wsOnce(
    (ws) => ws.send(JSON.stringify({ type: 'join', roomId, name: 'Seat1', playerToken: tokens[0] })),
    (m, ws) => {
      if (m.type === 'joined') { ws.send(JSON.stringify({ type: 'start' })); return undefined; }
      return m.type === 'state' && m.view?.phase ? true : undefined;
    },
  );
  return { roomId, tokens };
}

// one decision tick, entirely inside the page DOM
function tickInPage() {
  const q = (sel, root = document) => [...root.querySelectorAll(sel)];
  const enabled = (els) => els.filter((b) => !b.disabled && b.offsetParent !== null);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const label = document.querySelector('.kb-lab')?.textContent ?? '';

  if (/ wins$/.test(label)) return 'ENDED:' + label;

  const got = q('button').find((b) => b.textContent.trim() === 'Got it');
  if (got) { got.click(); return 'intro'; }

  // all actionable controls except the help button
  const opts = enabled(q('button.kb-opt'));
  const btns = enabled(q('button.kb-btn')).filter((b) => b.textContent.trim() !== '?');
  const endTurn = btns.find((b) => /END TURN/i.test(b.textContent));
  const pass = btns.find((b) => /^PASS$/i.test(b.textContent.trim()));
  const tasks = btns.filter((b) => b !== endTurn && b !== pass);

  // meetings and prompts favour the option lists; work turns mix tasks
  // with an eventual End Turn so days always finish
  if (opts.length && Math.random() < 0.75) { pick(opts).click(); return 'opt'; }
  if (tasks.length && Math.random() < 0.6) { pick(tasks).click(); return 'task'; }
  if (pass && Math.random() < 0.5) { pass.click(); return 'pass'; }
  if (endTurn && Math.random() < 0.55) { endTurn.click(); return 'end-turn'; }
  if (opts.length) { pick(opts).click(); return 'opt'; }
  if (tasks.length) { pick(tasks).click(); return 'task'; }
  if (pass) { pass.click(); return 'pass'; }
  if (endTurn) { endTurn.click(); return 'end-turn'; }
  return null; // not our turn
}

const { roomId, tokens } = await setupRoom();
console.log('room', roomId);

const browser = await puppeteer.launch({
  headless: 'shell',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage'],
});

try {
  const pages = [];
  for (let i = 0; i < SEATS; i++) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(([r, t]) => localStorage.setItem('bge-token-' + r, t), [roomId, tokens[i]]);
    await page.goto(`${BASE}/play/${roomId}`, { waitUntil: 'networkidle2', timeout: 45000 });
    pages.push(page);
  }

  const started = Date.now();
  let lastAct = Date.now();
  let acts = 0;
  let day = '';

  for (;;) {
    for (let i = 0; i < SEATS; i++) {
      let did = null;
      try { did = await pages[i].evaluate(tickInPage); } catch { /* re-render race */ }
      if (did?.startsWith('ENDED:')) {
        console.log(`UI SMOKE PASS — ${did.slice(6)} · ${acts} UI actions · ${Math.round((Date.now() - started) / 1000)}s`);
        process.exit(0);
      }
      if (did) { acts++; lastAct = Date.now(); }
    }
    if (acts > 0 && acts % 200 === 0 && day !== String(acts)) { day = String(acts); console.log(`${acts} acts · ${Math.round((Date.now() - started) / 1000)}s`); }
    if (Date.now() - lastAct > STALL_MS) {
      for (let i = 0; i < SEATS; i++) {
        const state = await pages[i].evaluate(() => ({
          label: document.querySelector('.kb-lab')?.textContent,
          buttons: [...document.querySelectorAll('button')].map((b) => `${b.textContent.trim().slice(0, 26)}${b.disabled ? '(x)' : ''}`).slice(0, 14),
          err: document.querySelector('.kb-err')?.textContent ?? null,
        })).catch(() => null);
        console.error(`seat ${i}:`, JSON.stringify(state));
      }
      console.error('UI SMOKE STALLED — no UI action for 120s');
      process.exit(1);
    }
    if (Date.now() - started > HARD_MS) { console.error('UI SMOKE TIMEOUT'); process.exit(1); }
    await new Promise((r) => setTimeout(r, 140));
  }
} finally {
  await browser.close();
}
