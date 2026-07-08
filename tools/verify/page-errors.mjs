// Load a page, dump console errors + failed requests, screenshot.
// node page-errors.mjs <url> <outPng> [waitMs]
import puppeteer from 'puppeteer';

const [url, out = 'page.png', waitMs = '9000'] = process.argv.slice(2);
const browser = await puppeteer.launch({
  headless: 'shell',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') console.log(`[${m.type()}]`, m.text().slice(0, 300)); });
  page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0, 500)));
  page.on('requestfailed', (r) => console.log('[REQFAIL]', r.url().slice(-90), r.failure()?.errorText));
  page.on('response', (r) => { if (r.status() >= 400) console.log('[HTTP', r.status() + ']', r.url().slice(-90)); });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, Number(waitMs)));
  await page.screenshot({ path: out });
  console.log('OK ->', out);
} finally {
  await browser.close();
}
