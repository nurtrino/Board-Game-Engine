// Phone screenshot that dismisses the game intro first.
// node dtphone-shot.mjs <baseUrl> <roomId> <token> <outPath> [waitMs]
import puppeteer from 'puppeteer';

const [base, room, token, out = 'phone.png', waitMs = '6000'] = process.argv.slice(2);
const browser = await puppeteer.launch({
  headless: 'shell',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1180, height: 820, isMobile: true, hasTouch: true });
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(([r, t]) => localStorage.setItem('bge-token-' + r.toUpperCase(), t), [room, token]);
  await page.goto(`${base}/play/${room}`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, Number(waitMs)));
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      if (b.textContent?.trim() === 'Got it') b.click();
    }
  });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: out });
  console.log('OK ->', out);
} finally {
  await browser.close();
}
