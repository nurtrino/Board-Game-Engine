// Probe the card-play path: gather resources with two workers, then try to
// play an affordable card through the real closeup UI.
// Usage: node ev-play-probe.mjs <roomId> <token>
import puppeteer from 'puppeteer';

const roomId = process.argv[2];
const token = process.argv[3];
const BASE = 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: 'shell',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const context = await browser.createBrowserContext();
const page = await context.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 240)));
await page.setViewport({ width: 1024, height: 768 });
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.evaluate(([r, t]) => localStorage.setItem('bge-token-' + r.toUpperCase(), t), [roomId, token]);
await page.goto(`${BASE}/play/${roomId}`, { waitUntil: 'networkidle2' });
await sleep(2500);

const dump = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const results = [];
  const ledger = () => document.querySelector('[data-testid="ev-ledger"]')?.textContent;
  results.push({ ledger: ledger(), status: document.querySelector('[data-testid="ev-status"]')?.textContent });
  const hand = [...document.querySelectorAll('[data-testid="ev-hand"] .ev-hcard')];
  for (const card of hand) {
    card.click();
    await sleep(250);
    const btn = document.querySelector('[data-testid="ev-play-card"]');
    const name = document.querySelector('.ev-closeup h3')?.textContent;
    results.push({ name, disabled: btn?.disabled, label: btn?.textContent?.slice(0, 60) });
    const close = [...document.querySelectorAll('.ev-sheet .ev-btn')].find((b) => /CLOSE/.test(b.textContent));
    close?.click();
    await sleep(150);
  }
  return results;
});
console.log(JSON.stringify(dump, null, 1));
await browser.close();
