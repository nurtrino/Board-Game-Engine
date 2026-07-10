declare module '@3d-dice/dice-box' {
  export default class DiceBox {
    constructor(selector: string, options?: Record<string, unknown>);
    init(): Promise<void>;
    roll(notation: string): void;
    clear(): void;
  }
}
