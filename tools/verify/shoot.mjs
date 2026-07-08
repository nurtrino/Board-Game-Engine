// Headless screenshot tool for verifying the app renders correctly, including
// WebGL/3D. A single 3D angle can hide problems (gaps, floating pieces, wrong
// orientation), so this can orbit the camera and shoot many angles.
//
// Usage:
//   node shoot.mjs <url> <outPath> [waitMs]
//   node shoot.mjs <url> <outBase.png> [waitMs] --orbit=8            # 8 angles around
//   node shoot.mjs <url> <outBase.png> [waitMs] --orbit=6,35,16      # n, elevation, distance
//   node shoot.mjs <url> <outBase.png> [waitMs] --angles=0,35,16;90,20,14
//
// Orbit/angle modes drive a window.__setCam(azimuthDeg, elevationDeg, distance)
// hook the 3D renderer exposes. If the hook is absent, it falls back to one shot.
import puppeteer from 'puppeteer';

const url = process.argv[2];
const out = process.argv[3] || 'shot.png';
const rest = process.argv.slice(4);
const waitMs = Number(rest.find((a) => /^\d+$/.test(a)) || 3000);

function parseAngles() {
  const anglesArg = rest.find((a) => a.startsWith('--angles='));
  if (anglesArg) {
    return anglesArg
      .slice('--angles='.length)
      .split(';')
      .map((s) => s.split(',').map(Number))
      .filter((a) => a.length === 3 && a.every((n) => Number.isFinite(n)));
  }
  const orbitArg = rest.find((a) => a.startsWith('--orbit='));
  if (orbitArg) {
    const [n, el, dist] = orbitArg.slice('--orbit='.length).split(',').map(Number);
    const count = n || 6;
    const elevation = Number.isFinite(el) ? el : 35;
    const distance = Number.isFinite(dist) ? dist : 16;
    return Array.from({ length: count }, (_, i) => [Math.round((i * 360) / count), elevation, distance]);
  }
  return null;
}

const angles = parseAngles();
const nameFor = ([az, el]) => out.replace(/\.png$/i, '') + `-az${az}-el${el}.png`;

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
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, waitMs));

  if (angles) {
    // wait for the camera hook to appear (renderer mounts async)
    let hasHook = false;
    for (let i = 0; i < 20; i++) {
      hasHook = await page.evaluate(() => typeof window.__setCam === 'function');
      if (hasHook) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!hasHook) {
      console.log('! window.__setCam not found — renderer did not expose the camera hook; single shot instead');
      await page.screenshot({ path: out });
      console.log('OK shot ->', out);
    } else {
      const shots = [];
      for (const angle of angles) {
        await page.evaluate(([az, el, d]) => window.__setCam(az, el, d), angle);
        await new Promise((r) => setTimeout(r, 500));
        const p = nameFor(angle);
        await page.screenshot({ path: p });
        shots.push(p);
      }
      console.log(`OK ${shots.length} angle(s):\n  ` + shots.join('\n  '));
    }
  } else {
    await page.screenshot({ path: out });
    console.log('OK shot ->', out);
  }

  if (errors.length) console.log('console errors:\n  ' + errors.slice(0, 8).join('\n  '));
} finally {
  await browser.close();
}
