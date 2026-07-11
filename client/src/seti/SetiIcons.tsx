import type { SVGProps } from 'react';

export type SetiIconName = 'probe' | 'scan' | 'analyze' | 'research' | 'pass' | 'credit' | 'energy' | 'data' | 'publicity' | 'score' | 'card' | 'close' | 'deck';

export function SetiIcon({ name, ...props }: { name: SetiIconName } & SVGProps<SVGSVGElement>) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props} {...common}>
      {name === 'probe' && <><path d="M12 3v8" /><path d="m8.5 7 3.5-4 3.5 4" /><path d="M7 13c1.4-1.3 3-2 5-2s3.6.7 5 2l-1 6H8z" /><path d="M10 19v2m4-2v2" /></>}
      {name === 'scan' && <><path d="M5 19h14" /><path d="M12 15v4" /><path d="M8 15h8" /><path d="M8.5 4.5a7 7 0 0 1 7 7" /><path d="M5 8a11 11 0 0 1 11 11" /><circle cx="8.5" cy="4.5" r="1.5" /></>}
      {name === 'analyze' && <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 8h3v3H8zm5 0h3v3h-3zM8 13h3v3H8z" /><path d="m14 16 3-3" /></>}
      {name === 'research' && <><circle cx="10" cy="10" r="5" /><path d="m14 14 5 5" /><path d="M10 7v6M7 10h6" /></>}
      {name === 'pass' && <><circle cx="12" cy="12" r="8" /><path d="m8 12 3 3 5-6" /></>}
      {name === 'credit' && <><circle cx="12" cy="12" r="8" /><path d="M15 8.5c-.8-.7-1.8-1-3-1-1.7 0-3 .8-3 2s1 1.8 3 2.5 3 1.3 3 2.7-1.3 2.3-3 2.3c-1.4 0-2.6-.4-3.5-1.2M12 5.5v13" /></>}
      {name === 'energy' && <path d="m13.5 2-7 11h5L10.5 22l7-12h-5z" />}
      {name === 'data' && <><path d="M5 7c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3z" /><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" /><path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /></>}
      {name === 'publicity' && <><path d="M4 14V9l12-4v13L4 14z" /><path d="M8 15v4h4v-3" /><path d="M19 9c1 .8 1 3.2 0 4" /></>}
      {name === 'score' && <><path d="m12 3 2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.9-5.4 2.9 1-6-4.3-4.2 6-.9z" /></>}
      {name === 'card' && <><rect x="6" y="3" width="12" height="18" rx="2" /><path d="M9 7h6M9 11h4" /></>}
      {name === 'deck' && <><rect x="7" y="4" width="12" height="16" rx="2" /><path d="M5 7v10a2 2 0 0 0 2 2M9.5 8h7M9.5 11h5" /></>}
      {name === 'close' && <><path d="M6 6l12 12M18 6 6 18" /></>}
    </svg>
  );
}

