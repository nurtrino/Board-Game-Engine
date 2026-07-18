// Screenshot the Everdell device with the PLACE WORKER visual board open.
// Usage: node ev-place-shot.mjs <baseUrl> <roomId> <token> <outPath>
import puppeteer from 'puppeteer';

const base = process.argv[2];
const room = process.argv[3];
const token = process.argv[4];
const out = process.argv[5] || 'ev-place.png';

const browser = await puppeteer.launch({
  headless: 'shell',
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 768 });
await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.evaluate(([r, t]) => localStorage.setItem('bge-token-' + r.toUpperCase(), t), [room, token]);
await page.goto(`${base}/play/${room}`, { waitUntil: 'networkidle2', timeout: 45000 });
await new Promise((r) => setTimeout(r, 4000));
const clicked = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('PLACE WORKER'));
  if (!btn) return false;
  btn.click();
  return true;
});
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: out });
console.log(clicked ? 'OK place sheet ->' : 'NO BUTTON ->', out);
await browser.close();
