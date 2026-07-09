// Headless screenshots of the A&A model lineup (/dev/axis-models) so mesh
// scale/grounding/orientation can be inspected without a live browser.
// Run: node tools/verify/shoot-axis-models.mjs [base] [outDir]

import puppeteer from 'puppeteer';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5273';
const OUT = process.argv[3] ?? path.resolve(process.cwd(), 'shots');
import fs from 'node:fs';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'shell',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage'],
});

const shots = [
  ['all', '/dev/axis-models'],
  ['all-raw', '/dev/axis-models?scale=raw'],
  ['germany', '/dev/axis-models?row=germany'],
  ['usa', '/dev/axis-models?row=usa'],
  ['japan', '/dev/axis-models?row=japan'],
  ['shared', '/dev/axis-models?row=shared'],
];

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  for (const [name, url] of shots) {
    await page.goto(BASE + url, { waitUntil: 'networkidle2', timeout: 60000 });
    // meshes stream in through Suspense; give the OBJ parses time
    await new Promise((r) => setTimeout(r, 9000));
    await page.screenshot({ path: path.join(OUT, `models-${name}.png`) });
    console.log('shot', name);
  }
} finally {
  await browser.close();
}
console.log('done ->', OUT);
