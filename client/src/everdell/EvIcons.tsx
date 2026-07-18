// Inline SVG resource icons echoing the printed symbols (no emoji — house
// rule): twig sticks, amber resin star-drop, grey pebble, pink berry, card
// back, gold point token, any-resource basket.

import type { EvIconKind } from './ev-assets';

export function ResIcon({ kind, size = 14 }: { kind: EvIconKind; size?: number }) {
  const s = { width: size, height: size, flex: '0 0 auto' } as const;
  switch (kind) {
    case 'twig':
      return (
        <svg style={s} viewBox="0 0 16 16" aria-hidden="true">
          <g stroke="#a4703c" strokeWidth="2.1" strokeLinecap="round">
            <path d="M2.5 11.5 L12 4" />
            <path d="M4.5 13.5 L14 6" />
          </g>
        </svg>
      );
    case 'resin':
      return (
        <svg style={s} viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 1.6 L10 5.4 L14.2 6 L11 9 L11.9 13.4 L8 11.4 L4.1 13.4 L5 9 L1.8 6 L6 5.4 Z"
            fill="#e8a33c" stroke="#8a5c14" strokeWidth="0.8" />
        </svg>
      );
    case 'pebble':
      return (
        <svg style={s} viewBox="0 0 16 16" aria-hidden="true">
          <ellipse cx="8" cy="8.6" rx="6.2" ry="4.8" fill="#b9c0c9" stroke="#6f7680" strokeWidth="0.8" />
          <ellipse cx="6.2" cy="7" rx="2.1" ry="1.2" fill="#dde2e8" opacity="0.8" />
        </svg>
      );
    case 'berry':
      return (
        <svg style={s} viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="9" r="5.4" fill="#d4568f" stroke="#7c2a52" strokeWidth="0.8" />
          <circle cx="6.2" cy="7.4" r="1.5" fill="#eda0c4" opacity="0.85" />
          <path d="M8 3.8 L8 1.8 M8 3 C9.4 2 10.6 2 11.4 2.6" stroke="#4c7c3a" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        </svg>
      );
    case 'card':
      return (
        <svg style={s} viewBox="0 0 16 16" aria-hidden="true">
          <rect x="4" y="2" width="8.4" height="12" rx="1.4" fill="#c9b58f" stroke="#6d5a37" strokeWidth="0.9" />
          <rect x="5.6" y="3.6" width="5.2" height="8.8" rx="0.8" fill="none" stroke="#6d5a37" strokeWidth="0.7" opacity="0.7" />
        </svg>
      );
    case 'point':
      return (
        <svg style={s} viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.2" fill="#e8c33c" stroke="#8a6d14" strokeWidth="0.9" />
          <circle cx="8" cy="8" r="4.1" fill="none" stroke="#8a6d14" strokeWidth="0.8" opacity="0.7" />
        </svg>
      );
    case 'any':
      return (
        <svg style={s} viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 7 L13.5 7 L12.2 13.4 L3.8 13.4 Z" fill="#8a6a42" stroke="#4f3a20" strokeWidth="0.8" />
          <circle cx="5.6" cy="5.8" r="1.9" fill="#d4568f" />
          <circle cx="8.4" cy="5" r="1.9" fill="#e8a33c" />
          <circle cx="11" cy="5.9" r="1.9" fill="#b9c0c9" />
        </svg>
      );
    default:
      return null;
  }
}

/** A count + icon chip, e.g. "3 <twig>". */
export function ResChip({ kind, n, size = 14 }: { kind: EvIconKind; n: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <b style={{ fontVariantNumeric: 'tabular-nums' }}>{n}</b>
      <ResIcon kind={kind} size={size} />
    </span>
  );
}
