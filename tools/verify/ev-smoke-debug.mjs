// Dense-log debug of the Everdell UI smoke: existing room, 4 tokens, log all.
// Usage: node ev-smoke-debug.mjs <roomId> <t1> <t2> <t3> <t4>
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:5173';
const roomId = process.argv[2];
const tokens = process.argv.slice(3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function step(page) {
  return page.evaluate(() => {
    const q = (sel) => document.querySelector(sel);
    const qa = (sel) => [...document.querySelectorAll(sel)];
    const enabled = (el) => el && !el.disabled;
    const click = (el, what) => { el.click(); return what; };
    if (q('.ev-end')) return 'ENDED';
    const sheet = q('[data-testid="ev-pending-sheet"]');
    if (sheet) {
      const inSheet = (sel) => [...sheet.querySelectorAll(sel)];
      const primary = inSheet('.ev-btn.primary').find(enabled);
      if (primary) return click(primary, `pending:${primary.textContent.slice(0, 20)}`);
      const mapOk = inSheet('.ev-spot.ok, .ev-map-forest.ok, .ev-map-dest.ok, .ev-map-event.ok').find(enabled);
      if (mapOk) return click(mapOk, 'pending:map');
      const pick = inSheet('.ev-pick:not(.sel):not(.dim)').find(enabled);
      if (pick) return click(pick, 'pending:pick');
      const plus = inSheet('.ev-stepper button:last-child').find(enabled);
      if (plus) return click(plus, 'pending:step+');
      const anyBtn = inSheet('.ev-btn').find((b) => enabled(b) && !/CLOSE/.test(b.textContent));
      if (anyBtn) return click(anyBtn, `pending:${anyBtn.textContent.slice(0, 20)}`);
      return 'pending:stuck';
    }
    const status = q('[data-testid="ev-status"]')?.textContent ?? '';
    const endBtn = q('[data-testid="ev-end-turn"]');
    if (/PRESS END TURN/.test(status) && enabled(endBtn)) return click(endBtn, 'end-turn');
    if (!/YOUR TURN/.test(status)) return `wait:${status.slice(0, 30)}`;
    const playBtn = q('[data-testid="ev-play-card"]');
    if (playBtn) {
      if (enabled(playBtn)) return click(playBtn, 'play-card');
      const close = qa('.ev-sheet .ev-btn').find((b) => /CLOSE/.test(b.textContent));
      if (close) return click(close, 'closeup-close(' + (playBtn.textContent || '').slice(0, 30) + ')');
    }
    const place = q('[data-testid="ev-place-sheet"]');
    if (place) {
      const spots = [...place.querySelectorAll('.ev-spot.ok')];
      const others = [...place.querySelectorAll('.ev-map-forest.ok, .ev-map-event.ok, .ev-map-dest.ok')];
      const spot = spots.find(enabled) ?? others.find(enabled);
      if (spot) return click(spot, 'place-worker(' + (spot.getAttribute('aria-label') || '').slice(0, 20) + ')');
      const close = [...place.querySelectorAll('.ev-btn')].find((b) => /CLOSE/.test(b.textContent));
      if (close) return click(close, `place-close(spots:${spots.length})`);
    }
    const hand = qa('[data-testid="ev-hand"] .ev-hcard');
    const meadow = qa('[data-testid="ev-meadow"] .ev-mcard');
    const tryCards = [...hand, ...meadow];
    const turnCount = (window.__evTried = (window.__evTried ?? 0) + 1);
    const card = tryCards[turnCount % Math.max(1, tryCards.length)];
    if (card && turnCount % 3 !== 0) return click(card, 'open-closeup');
    const placeBtn = qa('.ev-act').find((b) => /PLACE WORKER/.test(b.textContent) && enabled(b));
    if (placeBtn) return click(placeBtn, 'open-place');
    const prep = qa('.ev-act').find((b) => /PREPARE FOR SEASON/.test(b.textContent) && enabled(b));
    if (prep) return click(prep, 'prepare');
    const pass = qa('.ev-act').find((b) => /^PASS/.test(b.textContent.trim()) && enabled(b));
    if (pass) return click(pass, 'pass-arm');
    const confirm = qa('.ev-act').find((b) => /CONFIRM PASS/.test(b.textContent) && enabled(b));
    if (confirm) return click(confirm, 'pass-confirm');
    if (card) return click(card, 'open-closeup-fallback');
    return 'no-move';
  });
}

const browser = await puppeteer.launch({
  headless: 'shell',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const pages = [];
for (let i = 0; i < tokens.length; i++) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 768 });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(([r, t]) => localStorage.setItem('bge-token-' + r.toUpperCase(), t), [roomId, tokens[i]]);
  await page.goto(`${BASE}/play/${roomId}`, { waitUntil: 'networkidle2' });
  pages.push(page);
}
await sleep(2500);

for (let iter = 0; iter < 80; iter++) {
  for (let i = 0; i < pages.length; i++) {
    const what = await step(pages[i]).catch((e) => 'err:' + e.message.slice(0, 60));
    if (what && !what.startsWith('wait')) console.log(`[${iter}] s${i + 1}: ${what}`);
  }
  await sleep(150);
}
await browser.close();
