// National markings for the models' decal panels, and the blur drawn in place of spinning blades.
// One sheet: a column per nation; the top row is the aircraft and vehicle marking, the bottom the flag.
import * as THREE from 'three';
import { flagCanvas } from './scenery';

export const MARK_NATIONS = ['germany', 'ussr', 'japan', 'uk', 'italy', 'usa', 'china'] as const;
export const MARK_COLS = MARK_NATIONS.length;
export const MARK_ROWS = 2;
const CELL = 256;

export const markColumn = (power: string): number => Math.max(0, MARK_NATIONS.indexOf(power as (typeof MARK_NATIONS)[number]));
/** aCell.y for a decal kind. The texture is flipped, so the top row is the higher v. */
export const markRow = (kind: string): number => (kind === 'flag' || kind === 'fin' ? 0 : 1);

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, points = 5, inner = 0.4) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 === 0 ? r : r * inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function mark(ctx: CanvasRenderingContext2D, power: string) {
  const c = CELL / 2, R = CELL * 0.44;
  const disc = (r: number, color: string) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fill(); };
  switch (power) {
    case 'germany': {
      // a straight-armed cross, black with a white edge
      const arm = (w: number, color: string) => { ctx.fillStyle = color; ctx.fillRect(c - R, c - w / 2, R * 2, w); ctx.fillRect(c - w / 2, c - R, w, R * 2); };
      arm(R * 0.62, '#f2f0ea');
      arm(R * 0.4, '#101010');
      break;
    }
    case 'ussr':
      ctx.fillStyle = '#f2f0ea'; star(ctx, c, c, R * 1.04); ctx.fill();
      ctx.fillStyle = '#c4201c'; star(ctx, c, c, R * 0.88); ctx.fill();
      break;
    case 'japan':
      disc(R, '#f2f0ea'); disc(R * 0.9, '#bf1d24');
      break;
    case 'uk':
      disc(R, '#1c3a7a'); disc(R * 0.66, '#f2f0ea'); disc(R * 0.33, '#c4201c');
      break;
    case 'italy':
      disc(R, '#2f8a4a'); disc(R * 0.66, '#f2f0ea'); disc(R * 0.33, '#c4201c');
      break;
    case 'usa':
      disc(R, '#1d3260');
      ctx.fillStyle = '#f2f0ea'; star(ctx, c, c, R * 0.94, 5, 0.39); ctx.fill();
      break;
    case 'china': {
      disc(R, '#1c3f94');
      ctx.fillStyle = '#f2f0ea'; star(ctx, c, c, R * 0.82, 12, 0.56); ctx.fill();
      disc(R * 0.4, '#1c3f94'); disc(R * 0.33, '#f2f0ea');
      break;
    }
    default:
      disc(R, '#888888');
  }
  // paint is never perfect: take a little off, unevenly
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.22})`;
    ctx.beginPath();
    ctx.arc(Math.random() * CELL, Math.random() * CELL, 1 + Math.random() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

export function markSheet(): THREE.CanvasTexture {
  const sheet = document.createElement('canvas');
  sheet.width = CELL * MARK_COLS;
  sheet.height = CELL * MARK_ROWS;
  const ctx = sheet.getContext('2d')!;
  MARK_NATIONS.forEach((power, i) => {
    ctx.save();
    ctx.translate(i * CELL, 0);
    mark(ctx, power);
    ctx.restore();
    ctx.drawImage(flagCanvas(power), i * CELL + 3, CELL + 3, CELL - 6, CELL - 6);
  });
  const t = new THREE.CanvasTexture(sheet);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Blades at speed: a faint smear with a yellow edge where the tips run. */
export function discTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 6, 128, 128, 127);
  g.addColorStop(0, 'rgba(20,20,22,0.5)');
  g.addColorStop(0.12, 'rgba(24,24,26,0.2)');
  g.addColorStop(0.86, 'rgba(26,26,28,0.14)');
  g.addColorStop(0.93, 'rgba(210,170,40,0.26)');
  g.addColorStop(0.985, 'rgba(210,170,40,0.2)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  // a few soft streaks so the smear is not a perfect dish
  ctx.translate(128, 128);
  for (let i = 0; i < 9; i++) {
    ctx.rotate((Math.PI * 2) / 9 + Math.random() * 0.2);
    const s = ctx.createLinearGradient(0, 0, 122, 0);
    s.addColorStop(0, 'rgba(0,0,0,0)');
    s.addColorStop(0.5, 'rgba(10,10,12,0.1)');
    s.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = s;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 122, -0.16, 0.16);
    ctx.closePath();
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
