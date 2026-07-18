// Dump the placement sheet's spot state for one seat (debug).
// Usage: node ev-spot-dump.mjs <roomId> <token>
import puppeteer from 'puppeteer';

const roomId = process.argv[2];
const token = process.argv[3];
const BASE = 'http://localhost:5173';

const browser = await puppeteer.launch({
  headless: 'shell',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const context = await browser.createBrowserContext();
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text().slice(0, 200)); });
page.on('pageerror', (e) => console.log('page error:', e.message.slice(0, 300)));
await page.setViewport({ width: 1024, height: 768 });
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.evaluate(([r, t]) => localStorage.setItem('bge-token-' + r.toUpperCase(), t), [roomId, token]);
await page.goto(`${BASE}/play/${roomId}`, { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 3000));

const out = await page.evaluate(async () => {
  const id = document.querySelector('.ev-id')?.textContent;
  const status = document.querySelector('[data-testid="ev-status"]')?.textContent;
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('PLACE WORKER'));
  btn?.click();
  await new Promise((r) => setTimeout(r, 600));
  const sheet = document.querySelector('[data-testid="ev-place-sheet"]');
  const spots = [...(sheet?.querySelectorAll('.ev-spot') ?? [])].map((s) => ({
    cls: s.className, label: s.getAttribute('aria-label'), disabled: s.disabled,
  }));
  const forest = [...(sheet?.querySelectorAll('.ev-map-forest') ?? [])].map((s) => s.className);
  return { id, status, sheetOpen: !!sheet, spots, forest };
});
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: '../../tmp/ev-spot-dump.png' });
await browser.close();
