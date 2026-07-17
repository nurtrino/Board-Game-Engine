export interface CardSpriteFit {
  /** Upright card dimensions inside the requested frame. */
  displayWidth: number;
  displayHeight: number;
  /** Cell dimensions before the optional counter-rotation is applied. */
  spriteWidth: number;
  spriteHeight: number;
}

/**
 * Fits one atlas cell inside a fixed UI frame without changing its aspect.
 * `cellAspect` describes the cell as stored in the source sheet; rotated
 * landscape cards invert that aspect for their upright display.
 */
export function fitCardSprite(
  frameWidth: number,
  frameHeight: number,
  cellAspect: number,
  rotated: boolean,
): CardSpriteFit {
  if (![frameWidth, frameHeight, cellAspect].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('Card sprite dimensions and aspect must be positive finite numbers.');
  }

  const displayAspect = rotated ? 1 / cellAspect : cellAspect;
  const frameAspect = frameWidth / frameHeight;
  const displayWidth = displayAspect >= frameAspect ? frameWidth : frameHeight * displayAspect;
  const displayHeight = displayAspect >= frameAspect ? frameWidth / displayAspect : frameHeight;

  return {
    displayWidth,
    displayHeight,
    spriteWidth: rotated ? displayHeight : displayWidth,
    spriteHeight: rotated ? displayWidth : displayHeight,
  };
}
