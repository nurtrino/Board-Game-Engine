// Multi-angle 3D screenshot: loads a board once, then orbits the camera via the
// app's window.__setCam hook and shoots each angle. Usage:
//   node angles.mjs <url> <outPrefix> [waitMs]
// Angles are [azimuth, elevation, distance].
import puppeteer from 'puppeteer';

const url = process.argv[2];
const prefix = process.argv[3] || 'angle';
const waitMs = Number(process.argv[4] || 6000);
const ANGLES = [
  [0, 40, 13],    // front 3/4
  [50, 24, 13],   // low right
  [0, 85, 13],    // near top-down
  [200, 38, 13],  // behind
];

const browser = await puppeteer.launch({
  headless: 'shell',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, waitMs));
  const hasCam = await page.evaluate(() => typeof window.__setCam === 'function');
  console.log('camera hook present:', hasCam);
  for (let i = 0; i < ANGLES.length; i++) {
    const [az, el, dist] = ANGLES[i];
    if (hasCam) await page.evaluate((a, e, d) => window.__setCam(a, e, d), az, el, dist);
    await new Promise((r) => setTimeout(r, 900));
    await page.screenshot({ path: `${prefix}_${i}.png` });
  }
  console.log(`OK wrote ${ANGLES.length} angles -> ${prefix}_0..${ANGLES.length - 1}.png`);
  if (errs.length) console.log('errors:\n  ' + errs.slice(0, 6).join('\n  '));
} finally {
  await browser.close();
}
