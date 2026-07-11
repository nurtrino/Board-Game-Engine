import type { BrassView } from '@bge/shared';
import type { GameSceneState } from './TableScene';

export function gameSceneState(view: BrassView): GameSceneState {
  return {
    era: view.era,
    turnOrder: view.turnOrder,
    merchants: view.merchants,
    drawCount: view.drawCount,
    colors: view.players.map((player) => player.color),
    spentByColor: Object.fromEntries(view.players.map((player) => [player.color, player.spent])),
    industries: view.board.industries,
    links: view.board.links,
    markers: view.players.map((player) => ({ color: player.color, incomeOffset: player.incomeOffset, vpOffset: player.vp })),
    markets: view.markets,
  };
}
