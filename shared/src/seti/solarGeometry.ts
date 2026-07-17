import {
  SETI_CELL_IDS,
  parseSetiCell,
  setiCellId,
  type SetiCellId,
  type SetiPrimaryBody,
  type SetiRing,
  type SetiSectorIndex,
} from './data.js';

/** The physical stack is disc 1 (top), disc 2, disc 3, fixed base. */
export type SetiSolarLayer = 0 | 1 | 2 | 3;
export type SetiRotatingSolarLayer = 1 | 2 | 3;
export type SetiSolarFeatureKind = 'planet' | 'asteroid' | 'comet';

export interface SetiSolarOrientations {
  readonly disc1: number;
  readonly disc2: number;
  readonly disc3: number;
}

export interface SetiSolarArtAnchor {
  /** The staged authentic asset used for the transcription. */
  readonly asset: 'main-board' | 'disc-1' | 'disc-2' | 'disc-3';
  readonly imageSize: readonly [number, number];
  /** Rotation center in the same source-image coordinate system. */
  readonly center: readonly [number, number];
  /** A point inside the printed object, in source-image pixels. */
  readonly point: readonly [number, number];
  readonly digestSha256: string;
}

export interface SetiSolarLayerFeature {
  readonly id: string;
  readonly layer: SetiSolarLayer;
  readonly ring: SetiRing;
  readonly sector: SetiSectorIndex;
  readonly kind: SetiSolarFeatureKind;
  readonly body?: SetiPrimaryBody;
  readonly grantsPrintedPublicity: boolean;
  readonly anchor: SetiSolarArtAnchor;
}

export interface SetiResolvedPrintedSolarFeature extends SetiSolarLayerFeature {
  readonly cell: SetiCellId;
}

const MAIN_BOARD_DIGEST = '11085d1f64c03b743c76822c14e32e940bb8ee5c509af9f5a034a0f6c2bc7b3b';
const DISC_1_DIGEST = 'f3a80ce2dc9c9464322e1ee736faf5639c37d84cd0a2bc0eaabc62e6bc9d1c6b';
const DISC_2_DIGEST = '419875ee635a37457916ef9cfc480b8c529af4e522b41113e002b1b20aeaae06';
const DISC_3_DIGEST = 'db0056d1cb488e68fdd8539faa08c386d568e0f7ceca6d434c868f67ca382a39';

const anchor = (
  asset: SetiSolarArtAnchor['asset'],
  point: readonly [number, number],
): SetiSolarArtAnchor => {
  // Base points were sampled from the exact 2008 px solar crop at board
  // offset (737, 2081); store them in the authoritative main-board image's
  // coordinate system rather than depending on that diagnostic crop.
  if (asset === 'main-board') return {
    asset,
    imageSize: [3507, 5612],
    center: [1741, 3085],
    point: [point[0] + 737, point[1] + 2081],
    digestSha256: MAIN_BOARD_DIGEST,
  };
  const size = asset === 'disc-1' ? 396 : asset === 'disc-2' ? 608 : 1008;
  return {
    asset,
    imageSize: [size, size],
    center: [size / 2, size / 2],
    point,
    digestSha256: asset === 'disc-1' ? DISC_1_DIGEST : asset === 'disc-2' ? DISC_2_DIGEST : DISC_3_DIGEST,
  };
};

const feature = (
  id: string,
  layer: SetiSolarLayer,
  ring: SetiRing,
  sector: SetiSectorIndex,
  kind: SetiSolarFeatureKind,
  artAnchor: SetiSolarArtAnchor,
  body?: SetiPrimaryBody,
): SetiSolarLayerFeature => ({
  id,
  layer,
  ring,
  sector,
  kind,
  ...(body ? { body } : {}),
  grantsPrintedPublicity: kind === 'comet' || (kind === 'planet' && body !== 'Earth'),
  anchor: artAnchor,
});

/**
 * Exact baseline transcription of the authentic board art.
 *
 * A logical cell is the wedge immediately counter-clockwise of its sector ray.
 * The base is fixed. Disc sectors are shifted by their runtime orientation.
 * The art anchors deliberately live beside the data so a cell cannot silently
 * drift away from the staged source image that was used to transcribe it.
 */
export const SETI_SOLAR_FEATURE_CATALOG: readonly SetiSolarLayerFeature[] = [
  // Fixed printed base - inner ring.
  feature('base-r0s0-comet', 0, 0, 0, 'comet', anchor('main-board', [1285, 885])),
  feature('base-r0s1-asteroid', 0, 0, 1, 'asteroid', anchor('main-board', [1240, 1080])),
  feature('base-r0s2-comet', 0, 0, 2, 'comet', anchor('main-board', [1100, 1240])),
  feature('base-r0s4-asteroid', 0, 0, 4, 'asteroid', anchor('main-board', [760, 1110])),
  feature('base-r0s5-asteroid', 0, 0, 5, 'asteroid', anchor('main-board', [760, 845])),
  feature('base-r0s7-comet', 0, 0, 7, 'comet', anchor('main-board', [1110, 710])),

  // Fixed printed base - middle ring.
  feature('base-r1s0-asteroid', 0, 1, 0, 'asteroid', anchor('main-board', [1510, 690])),
  feature('base-r1s2-comet', 0, 1, 2, 'comet', anchor('main-board', [1200, 1400])),
  feature('base-r1s3-asteroid', 0, 1, 3, 'asteroid', anchor('main-board', [720, 1410])),
  feature('base-r1s4-asteroid', 0, 1, 4, 'asteroid', anchor('main-board', [405, 1090])),
  feature('base-r1s5-comet', 0, 1, 5, 'comet', anchor('main-board', [575, 795])),
  feature('base-r1s7-asteroid', 0, 1, 7, 'asteroid', anchor('main-board', [1135, 485])),

  // Fixed printed base - outer ring.
  feature('base-r2s0-comet', 0, 2, 0, 'comet', anchor('main-board', [1825, 685])),
  feature('base-r2s1-uranus', 0, 2, 1, 'planet', anchor('main-board', [1845, 1220]), 'Uranus'),
  feature('base-r2s2-asteroid', 0, 2, 2, 'asteroid', anchor('main-board', [1270, 1640])),
  feature('base-r2s3-comet', 0, 2, 3, 'comet', anchor('main-board', [735, 1590])),
  feature('base-r2s4-neptune', 0, 2, 4, 'planet', anchor('main-board', [255, 1410]), 'Neptune'),
  feature('base-r2s5-asteroid', 0, 2, 5, 'asteroid', anchor('main-board', [365, 650])),
  feature('base-r2s6-comet', 0, 2, 6, 'comet', anchor('main-board', [710, 160])),

  // Top disc.
  feature('disc1-earth', 1, 0, 1, 'planet', anchor('disc-1', [335, 285]), 'Earth'),
  feature('disc1-mercury', 1, 0, 5, 'planet', anchor('disc-1', [68, 130]), 'Mercury'),
  feature('disc1-venus', 1, 0, 7, 'planet', anchor('disc-1', [270, 60]), 'Venus'),

  // Middle disc.
  feature('disc2-r0s0-asteroid', 2, 0, 0, 'asteroid', anchor('disc-2', [455, 245])),
  feature('disc2-r0s2-asteroid', 2, 0, 2, 'asteroid', anchor('disc-2', [365, 452])),
  feature('disc2-r1s3-asteroid', 2, 1, 3, 'asteroid', anchor('disc-2', [180, 535])),
  feature('disc2-mars', 2, 1, 7, 'planet', anchor('disc-2', [470, 65]), 'Mars'),

  // Bottom disc.
  feature('disc3-r0s1-comet', 3, 0, 1, 'comet', anchor('disc-3', [672, 575])),
  feature('disc3-r0s2-asteroid', 3, 0, 2, 'asteroid', anchor('disc-3', [604, 657])),
  feature('disc3-r0s6-asteroid', 3, 0, 6, 'asteroid', anchor('disc-3', [428, 342])),
  feature('disc3-r0s7-asteroid', 3, 0, 7, 'asteroid', anchor('disc-3', [562, 340])),
  feature('disc3-r1s0-comet', 3, 1, 0, 'comet', anchor('disc-3', [788, 399])),
  feature('disc3-r1s4-asteroid', 3, 1, 4, 'asteroid', anchor('disc-3', [202, 608])),
  feature('disc3-r1s7-asteroid', 3, 1, 7, 'asteroid', anchor('disc-3', [620, 222])),
  feature('disc3-jupiter', 3, 2, 3, 'planet', anchor('disc-3', [327, 927]), 'Jupiter'),
  feature('disc3-saturn', 3, 2, 7, 'planet', anchor('disc-3', [718, 102]), 'Saturn'),
];

/**
 * Lossless-alpha samples at the 24 canonical cell points. Values at or above
 * 128 are physical support. Out-of-image samples are recorded as zero.
 */
export const SETI_SOLAR_ALPHA_SAMPLES = {
  1: [
    [255, 255, 255, 0, 255, 255, 255, 255],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
  2: [
    [133, 255, 255, 255, 0, 0, 255, 255],
    [0, 255, 255, 255, 0, 0, 255, 255],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
  3: [
    [255, 255, 255, 0, 62, 255, 255, 255],
    [206, 255, 255, 0, 255, 0, 255, 255],
    [0, 255, 255, 255, 129, 0, 255, 255],
  ],
} as const satisfies Record<SetiRotatingSolarLayer, readonly [readonly number[], readonly number[], readonly number[]]>;

const maskRow = (samples: readonly number[]): string => samples.map((value) => value >= 128 ? '1' : '0').join('');
const maskRows = (samples: readonly [readonly number[], readonly number[], readonly number[]]): readonly [string, string, string] => [
  maskRow(samples[0]),
  maskRow(samples[1]),
  maskRow(samples[2]),
];

export const SETI_SOLAR_ALPHA_MASKS = {
  1: maskRows(SETI_SOLAR_ALPHA_SAMPLES[1]),
  2: maskRows(SETI_SOLAR_ALPHA_SAMPLES[2]),
  3: maskRows(SETI_SOLAR_ALPHA_SAMPLES[3]),
} as const satisfies Record<SetiRotatingSolarLayer, readonly [string, string, string]>;

export function normalizeSetiSolarOrientation(value: number): SetiSectorIndex {
  return ((Math.trunc(value) % 8) + 8) % 8 as SetiSectorIndex;
}

export function setiSolarOrientationForLayer(
  orientations: SetiSolarOrientations,
  layer: SetiSolarLayer,
): SetiSectorIndex {
  if (layer === 0) return 0;
  return normalizeSetiSolarOrientation(
    layer === 1 ? orientations.disc1 : layer === 2 ? orientations.disc2 : orientations.disc3,
  );
}

export function setiSolarSupportLayerForCell(
  orientations: SetiSolarOrientations,
  cell: SetiCellId,
): SetiSolarLayer {
  const { ring, sector } = parseSetiCell(cell);
  for (const layer of [1, 2, 3] as const) {
    const orientation = setiSolarOrientationForLayer(orientations, layer);
    const baselineSector = normalizeSetiSolarOrientation(sector - orientation);
    if (SETI_SOLAR_ALPHA_MASKS[layer][ring][baselineSector] === '1') return layer;
  }
  return 0;
}

export function resolveSetiSolarFeature(
  orientations: SetiSolarOrientations,
  feature: SetiSolarLayerFeature,
): SetiResolvedPrintedSolarFeature {
  return {
    ...feature,
    cell: setiCellId(feature.ring, feature.sector + setiSolarOrientationForLayer(orientations, feature.layer)),
  };
}

export function setiVisibleSolarFeatureAt(
  orientations: SetiSolarOrientations,
  cell: SetiCellId,
): SetiResolvedPrintedSolarFeature | null {
  const support = setiSolarSupportLayerForCell(orientations, cell);
  for (const feature of SETI_SOLAR_FEATURE_CATALOG) {
    if (feature.layer !== support) continue;
    const resolved = resolveSetiSolarFeature(orientations, feature);
    if (resolved.cell === cell) return resolved;
  }
  return null;
}

export function getSetiVisibleSolarFeatures(
  orientations: SetiSolarOrientations,
): SetiResolvedPrintedSolarFeature[] {
  return SETI_CELL_IDS
    .map((cell) => setiVisibleSolarFeatureAt(orientations, cell))
    .filter((feature): feature is SetiResolvedPrintedSolarFeature => feature !== null);
}

export function setiSolarVisitGrantsPublicity(
  feature: Pick<SetiResolvedPrintedSolarFeature, 'kind' | 'body' | 'grantsPrintedPublicity'> | null,
  asteroidNavigation: boolean,
): boolean {
  if (!feature) return false;
  if (feature.kind === 'asteroid') return asteroidNavigation;
  return feature.grantsPrintedPublicity;
}

export function rotateSetiSolarOrientations(
  orientations: SetiSolarOrientations,
  selected: SetiRotatingSolarLayer,
): SetiSolarOrientations {
  return {
    disc1: normalizeSetiSolarOrientation(orientations.disc1 - 1),
    disc2: selected >= 2 ? normalizeSetiSolarOrientation(orientations.disc2 - 1) : normalizeSetiSolarOrientation(orientations.disc2),
    disc3: selected >= 3 ? normalizeSetiSolarOrientation(orientations.disc3 - 1) : normalizeSetiSolarOrientation(orientations.disc3),
  };
}

export interface SetiSolarRotationTransition {
  readonly from: SetiCellId;
  readonly to: SetiCellId;
  readonly moved: boolean;
  readonly reason: 'carried' | 'bumped' | 'stationary';
  readonly supportBefore: SetiSolarLayer;
  readonly supportAfterAtOrigin: SetiSolarLayer;
  readonly supportAfter: SetiSolarLayer;
  readonly orientationsAfter: SetiSolarOrientations;
}

/** Pure counterpart of the physical TTS attachment/cutout rotation algorithm. */
export function getSetiSolarRotationTransition(
  orientations: SetiSolarOrientations,
  selected: SetiRotatingSolarLayer,
  from: SetiCellId,
): SetiSolarRotationTransition {
  const supportBefore = setiSolarSupportLayerForCell(orientations, from);
  const orientationsAfter = rotateSetiSolarOrientations(orientations, selected);
  const supportAfterAtOrigin = setiSolarSupportLayerForCell(orientationsAfter, from);
  const carried = supportBefore >= 1 && supportBefore <= selected;
  const bumped = !carried && supportAfterAtOrigin >= 1 && supportAfterAtOrigin <= selected;
  const moved = carried || bumped;
  const parsed = parseSetiCell(from);
  const to = moved ? setiCellId(parsed.ring, parsed.sector - 1) : from;
  return {
    from,
    to,
    moved,
    reason: carried ? 'carried' : bumped ? 'bumped' : 'stationary',
    supportBefore,
    supportAfterAtOrigin,
    supportAfter: setiSolarSupportLayerForCell(orientationsAfter, to),
    orientationsAfter,
  };
}

/** Sector mapping used by the art-anchor verifier. */
export function setiSectorFromArtAnchor(anchorValue: SetiSolarArtAnchor): SetiSectorIndex {
  const [x, y] = anchorValue.point;
  const [centerX, centerY] = anchorValue.center;
  const angle = ((Math.atan2(y - centerY, x - centerX) * 180 / Math.PI) + 360) % 360;
  return normalizeSetiSolarOrientation(Math.ceil(angle / 45));
}
