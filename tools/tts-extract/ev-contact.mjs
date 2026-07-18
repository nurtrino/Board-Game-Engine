// Build contact sheets from tmp/evpdf thumbnails (Everdell rulebook mapping)
import sharp from 'sharp';
import fs from 'fs';
const dir = 'C:/Users/chase/Desktop/Board Game Engine/tmp/evpdf';
for (const pfx of ['r', 'a']) {
  const files = fs.readdirSync(dir).filter(f => f.startsWith(pfx) && f.endsWith('.png') && !f.startsWith('sheet')).sort();
  const per = 12; let sheet = 0;
  for (let i = 0; i < files.length; i += per) {
    const batch = files.slice(i, i + per);
    const imgs = [];
    for (const f of batch) {
      const b = await sharp(dir + '/' + f).resize({ width: 180 }).png().toBuffer();
      const m = await sharp(b).metadata();
      imgs.push({ b, m, f });
    }
    const H = Math.max(...imgs.map(x => x.m.height)), W = 180;
    const comps = imgs.map((x, j) => ({ input: x.b, left: j * W, top: 20 }));
    const svg = `<svg width="${W * batch.length}" height="20">` + batch.map((f, j) => `<text x="${j * W + 5}" y="15" font-size="13" fill="white">${f}</text>`).join('') + '</svg>';
    await sharp({ create: { width: W * batch.length, height: H + 20, channels: 3, background: '#222' } })
      .composite([...comps, { input: Buffer.from(svg), left: 0, top: 0 }]).png()
      .toFile(`${dir}/sheet-${pfx}${sheet}.png`);
    sheet++;
  }
}
console.log('sheets done');
