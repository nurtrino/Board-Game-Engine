import type { PowerKey } from '@bge/shared';

// Piece colors remain historically authentic on the map. Text needs a lighter
// companion palette to stay readable on the operations-room background.
const POWER_TEXT: Record<PowerKey | 'china', string> = {
  germany: '#c3c6c4',
  ussr: '#e27777',
  japan: '#efa858',
  uk: '#dfbd83',
  italy: '#d09a67',
  usa: '#74c879',
  china: '#f0c86f',
};

export const powerTextColor = (power: PowerKey | 'china' | null): string =>
  power == null ? '#b4bab4' : POWER_TEXT[power];
