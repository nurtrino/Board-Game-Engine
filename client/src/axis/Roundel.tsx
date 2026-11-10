// National emblems, drawn the way the printed board marks each power's home ground.
import type { ReactNode } from 'react';

const star = (cx: number, cy: number, r: number, inner = 0.4, points = 5, turn = -Math.PI / 2) => {
  const out: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 === 0 ? r : r * inner;
    const a = turn + (i * Math.PI) / points;
    out.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  return out.join(' ');
};

const ART: Record<string, ReactNode> = {
  germany: (
    <>
      <circle cx="32" cy="32" r="30" fill="#c8281e" />
      <path d="M26 10h12v16h16v12H38v16H26V38H10V26h16z" fill="#f2f2f2" />
      <path d="M29 13h6v16h16v6H35v16h-6V35H13v-6h16z" fill="#15161a" />
    </>
  ),
  ussr: (
    <>
      <circle cx="32" cy="32" r="30" fill="#17181c" />
      <polygon points={star(32, 33, 23)} fill="#d6281e" />
    </>
  ),
  japan: (
    <>
      <circle cx="32" cy="32" r="30" fill="#f4f1ea" />
      {Array.from({ length: 16 }, (_, i) => {
        const a0 = (i * Math.PI) / 8 - 0.11;
        const a1 = (i * Math.PI) / 8 + 0.11;
        return <polygon key={i} fill="#c8281e" points={`32,32 ${32 + Math.cos(a0) * 30},${32 + Math.sin(a0) * 30} ${32 + Math.cos(a1) * 30},${32 + Math.sin(a1) * 30}`} />;
      })}
      <circle cx="32" cy="32" r="11" fill="#c8281e" />
    </>
  ),
  uk: (
    <>
      <circle cx="32" cy="32" r="30" fill="#e2bd3a" />
      <circle cx="32" cy="32" r="25" fill="#1f3f8f" />
      <circle cx="32" cy="32" r="16" fill="#f4f1ea" />
      <circle cx="32" cy="32" r="8" fill="#c8281e" />
    </>
  ),
  italy: (
    <>
      <circle cx="32" cy="32" r="30" fill="#1f8a43" />
      <circle cx="32" cy="32" r="20" fill="#f4f1ea" />
      <circle cx="32" cy="32" r="10" fill="#c8281e" />
    </>
  ),
  usa: (
    <>
      <circle cx="32" cy="32" r="30" fill="#254f9e" />
      <polygon points={star(32, 33, 24, 0.4)} fill="#f4f1ea" />
      <circle cx="32" cy="33" r="6" fill="#c8281e" />
    </>
  ),
  china: (
    <>
      <circle cx="32" cy="32" r="30" fill="#f4f1ea" />
      <polygon points={star(32, 32, 26, 0.62, 12)} fill="#2a4fa3" />
      <circle cx="32" cy="32" r="11" fill="#f4f1ea" />
    </>
  ),
};

export function Roundel({ power, size = 28 }: { power: string | null | undefined; size?: number }) {
  const art = ART[power ?? ''];
  return (
    <svg className="axr" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      {art ?? <circle cx="32" cy="32" r="30" fill="#2a2c31" />}
      <circle cx="32" cy="32" r="30.5" fill="none" stroke="rgba(0,0,0,.55)" strokeWidth="1.5" />
    </svg>
  );
}
