// Screenshot a phone /play view by injecting a seat token into localStorage so
// the page reconnects to an existing seat. Usage:
//   node phone-shot.mjs <baseUrl> <roomId> <token> <outPath> [waitMs]
import puppeteer from 'puppeteer';

const base = process.argv[2];
const room = process.argv[3];
const token = process.argv[4];
const out = process.argv[5] || 'phone.png';
const waitMs = Number(process.argv[6] || 6000);
const vw = Number(process.argv[7] || 390);
const vh = Number(process.argv[8] || 844);

const browser = await puppeteer.launch({
  headless: 'shell',
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage',
  ],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: vw, height: vh, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  // seed the token, then load the play route so it reconnects to the seat
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(([r, t]) => localStorage.setItem('bge-token-' + r.toUpperCase(), t), [room, token]);
  await page.goto(`${base}/play/${room}`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, waitMs));
  await page.screenshot({ path: out });
  console.log('OK phone shot ->', out);
  if (errors.length) console.log('console errors:\n  ' + errors.slice(0, 8).join('\n  '));
} finally {
  await browser.close();
}
