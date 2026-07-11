declare module '@3d-dice/dice-box-threejs' {
  export interface DiceBoxRollResult {
    notation: string;
    sets: Array<{
      rolls: Array<{ value: number; reason?: string }>;
    }>;
  }

  export default class DiceBox {
    constructor(selector: string, options?: Record<string, unknown>);
    initialize(): Promise<void>;
    roll(notation: string): Promise<DiceBoxRollResult>;
    clearDice(): void;
    renderer?: {
      dispose?: () => void;
      forceContextLoss?: () => void;
    };
  }
}
