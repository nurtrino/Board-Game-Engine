import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SETI_CELL_IDS, parseSetiCell, setiCellId, type SetiCellId } from './data.js';
import {
  bodyAtSetiCell,
  createSeti,
  getSetiSolarFeatures,
  isSetiAsteroidCell,
  isSetiPublicityCell,
  setiSupportLayerForCell,
} from './state.js';
import {
  SETI_SOLAR_ALPHA_MASKS,
  SETI_SOLAR_FEATURE_CATALOG,
  getSetiSolarRotationTransition,
  getSetiVisibleSolarFeatures,
  normalizeSetiSolarOrientation,
  resolveSetiSolarFeature,
  rotateSetiSolarOrientations,
  setiSectorFromArtAnchor,
  setiSolarOrientationForLayer,
  setiSolarSupportLayerForCell,
  setiSolarVisitGrantsPublicity,
  setiVisibleSolarFeatureAt,
  type SetiRotatingSolarLayer,
  type SetiSolarLayer,
  type SetiSolarOrientations,
} from './solarGeometry.js';

const equal = assert.equal;
const deepEqual = assert.deepEqual;
const ok = assert.ok;

const assetFiles = {
  'main-board': '../../../client/public/seti/board/main-board.webp',
  'disc-1': '../../../client/public/seti/solar/disc-1.webp',
  'disc-2': '../../../client/public/seti/solar/disc-2.webp',
  'disc-3': '../../../client/public/seti/solar/disc-3.webp',
} as const;
for (const asset of Object.keys(assetFiles) as (keyof typeof assetFiles)[]) {
  const file = fileURLToPath(new URL(assetFiles[asset], import.meta.url));
  const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
  const anchoredDigest = SETI_SOLAR_FEATURE_CATALOG.find((feature) => feature.anchor.asset === asset)?.anchor.digestSha256;
  equal(digest, anchoredDigest, `${asset} art anchors bind to the staged authentic asset digest`);
}
const golden = JSON.parse(readFileSync(fileURLToPath(new URL('../../../games/seti/golden/seti-data.json', import.meta.url)), 'utf8')) as {
  shared: { solarSystem: { geometry: { supportMasks: unknown; features: unknown } } };
};
deepEqual(golden.shared.solarSystem.geometry.supportMasks, SETI_SOLAR_ALPHA_MASKS, 'runtime support masks match deterministic extraction output');
deepEqual(
  golden.shared.solarSystem.geometry.features,
  SETI_SOLAR_FEATURE_CATALOG.map(({ id, layer, ring, sector, kind, body, grantsPrintedPublicity }) => ({
    id, layer, ring, sector, kind, ...(body ? { body } : {}), grantsPrintedPublicity,
  })),
  'runtime feature catalog matches deterministic extraction output',
);

equal(SETI_SOLAR_FEATURE_CATALOG.length, 35, 'all printed solar objects are transcribed');
equal(SETI_SOLAR_FEATURE_CATALOG.filter((feature) => feature.kind === 'planet').length, 8, 'eight printed planets');
equal(SETI_SOLAR_FEATURE_CATALOG.filter((feature) => feature.kind === 'comet').length, 10, 'ten printed comets');
equal(SETI_SOLAR_FEATURE_CATALOG.filter((feature) => feature.kind === 'asteroid').length, 17, 'seventeen printed asteroid spaces');

const expectedLayerCells = {
  0: [
    'r0s0:comet', 'r0s1:asteroid', 'r0s2:comet', 'r0s4:asteroid', 'r0s5:asteroid', 'r0s7:comet',
    'r1s0:asteroid', 'r1s2:comet', 'r1s3:asteroid', 'r1s4:asteroid', 'r1s5:comet', 'r1s7:asteroid',
    'r2s0:comet', 'r2s1:planet:Uranus', 'r2s2:asteroid', 'r2s3:comet', 'r2s4:planet:Neptune', 'r2s5:asteroid', 'r2s6:comet',
  ],
  1: ['r0s1:planet:Earth', 'r0s5:planet:Mercury', 'r0s7:planet:Venus'],
  2: ['r0s0:asteroid', 'r0s2:asteroid', 'r1s3:asteroid', 'r1s7:planet:Mars'],
  3: [
    'r0s1:comet', 'r0s2:asteroid', 'r0s6:asteroid', 'r0s7:asteroid',
    'r1s0:comet', 'r1s4:asteroid', 'r1s7:asteroid', 'r2s3:planet:Jupiter', 'r2s7:planet:Saturn',
  ],
} as const;

for (const layer of [0, 1, 2, 3] as const) {
  const actual = SETI_SOLAR_FEATURE_CATALOG
    .filter((feature) => feature.layer === layer)
    .map((feature) => `r${feature.ring}s${feature.sector}:${feature.kind}${feature.body ? `:${feature.body}` : ''}`);
  deepEqual(actual, expectedLayerCells[layer], `layer ${layer} matches the authentic art transcription`);
}

const featureKeys = new Set<string>();
for (const feature of SETI_SOLAR_FEATURE_CATALOG) {
  const key = `${feature.layer}:${feature.ring}:${feature.sector}`;
  ok(!featureKeys.has(key), `only one printed object occupies ${key}`);
  featureKeys.add(key);
  equal(setiSectorFromArtAnchor(feature.anchor), feature.sector, `${feature.id} art anchor is in its declared wedge`);
  equal(feature.grantsPrintedPublicity, feature.kind === 'comet' || (feature.kind === 'planet' && feature.body !== 'Earth'));
}

deepEqual(SETI_SOLAR_ALPHA_MASKS, {
  1: ['11101111', '00000000', '00000000'],
  2: ['11110011', '01110011', '00000000'],
  3: ['11100111', '11101011', '01111011'],
}, 'support masks are derived from lossless alpha at all 24 canonical points');

const directSupport = (orientations: SetiSolarOrientations, cell: SetiCellId): SetiSolarLayer => {
  const { ring, sector } = parseSetiCell(cell);
  for (const layer of [1, 2, 3] as const) {
    const baseline = normalizeSetiSolarOrientation(sector - setiSolarOrientationForLayer(orientations, layer));
    if (SETI_SOLAR_ALPHA_MASKS[layer][ring][baseline] === '1') return layer;
  }
  return 0;
};

const rotationCounts: Record<SetiRotatingSolarLayer, Record<'carried' | 'bumped' | 'stationary', number>> = {
  1: { carried: 0, bumped: 0, stationary: 0 },
  2: { carried: 0, bumped: 0, stationary: 0 },
  3: { carried: 0, bumped: 0, stationary: 0 },
};

let orientationCount = 0;
const bodiesVisibleInSomeOrientation = new Set<string>();
for (let disc1 = 0; disc1 < 8; disc1++) {
  for (let disc2 = 0; disc2 < 8; disc2++) {
    for (let disc3 = 0; disc3 < 8; disc3++) {
      orientationCount++;
      const orientations: SetiSolarOrientations = { disc1, disc2, disc3 };
      for (const cell of SETI_CELL_IDS) {
        const support = setiSolarSupportLayerForCell(orientations, cell);
        equal(support, directSupport(orientations, cell), `top support is exact at ${disc1}/${disc2}/${disc3}/${cell}`);
        const visible = setiVisibleSolarFeatureAt(orientations, cell);
        if (visible) {
          equal(visible.layer, support, `only the top physical layer is visible at ${cell}`);
          equal(resolveSetiSolarFeature(orientations, visible).cell, cell);
        }

        for (const selected of [1, 2, 3] as const) {
          const transition = getSetiSolarRotationTransition(orientations, selected, cell);
          rotationCounts[selected][transition.reason]++;
          const after = rotateSetiSolarOrientations(orientations, selected);
          deepEqual(transition.orientationsAfter, after);
          const shouldCarry = support >= 1 && support <= selected;
          const afterAtOrigin = directSupport(after, cell);
          const shouldBump = !shouldCarry && afterAtOrigin >= 1 && afterAtOrigin <= selected;
          equal(transition.moved, shouldCarry || shouldBump);
          equal(transition.reason, shouldCarry ? 'carried' : shouldBump ? 'bumped' : 'stationary');
          const parsed = parseSetiCell(cell);
          equal(transition.to, transition.moved ? setiCellId(parsed.ring, parsed.sector - 1) : cell);
          equal(transition.supportAfter, directSupport(after, transition.to));
        }
      }

      const bodies = getSetiVisibleSolarFeatures(orientations).filter((feature) => feature.kind === 'planet');
      equal(new Set(bodies.map((feature) => feature.body)).size, bodies.length, 'no two visible planet cells name the same body');
      for (const body of bodies) if (body.body) bodiesVisibleInSomeOrientation.add(body.body);
    }
  }
}

equal(orientationCount, 512, 'every legal independent three-disc orientation is checked');
deepEqual(
  [...bodiesVisibleInSomeOrientation].sort(),
  ['Earth', 'Jupiter', 'Mars', 'Mercury', 'Neptune', 'Saturn', 'Uranus', 'Venus'],
  'every printed planet is reachable in the orientation state space',
);
for (const selected of [1, 2, 3] as const) {
  ok(rotationCounts[selected].carried > 0, `disc ${selected} has carried transitions`);
  ok(rotationCounts[selected].bumped > 0, `disc ${selected} has bump transitions`);
  if (selected < 3) ok(rotationCounts[selected].stationary > 0, `disc ${selected} has stationary transitions`);
  else equal(rotationCounts[selected].stationary, 0, 'rotating the bottom disc carries or bumps every solar cell');
}

const zero: SetiSolarOrientations = { disc1: 0, disc2: 0, disc3: 0 };
const earth = SETI_SOLAR_FEATURE_CATALOG.find((feature) => feature.body === 'Earth')!;
const venus = SETI_SOLAR_FEATURE_CATALOG.find((feature) => feature.body === 'Venus')!;
const comet = SETI_SOLAR_FEATURE_CATALOG.find((feature) => feature.kind === 'comet')!;
const asteroid = SETI_SOLAR_FEATURE_CATALOG.find((feature) => feature.kind === 'asteroid')!;
equal(setiSolarVisitGrantsPublicity(resolveSetiSolarFeature(zero, earth), false), false, 'Earth never grants visit publicity');
equal(setiSolarVisitGrantsPublicity(resolveSetiSolarFeature(zero, venus), false), true, 'non-Earth planets grant visit publicity');
equal(setiSolarVisitGrantsPublicity(resolveSetiSolarFeature(zero, comet), false), true, 'comets grant visit publicity');
equal(setiSolarVisitGrantsPublicity(resolveSetiSolarFeature(zero, asteroid), false), false, 'asteroids need navigation tech');
equal(setiSolarVisitGrantsPublicity(resolveSetiSolarFeature(zero, asteroid), true), true, 'asteroid navigation grants visit publicity');

// A hidden lower feature must not leak through a blank upper support cell.
let hiddenLowerFeatureChecked = false;
for (let d1 = 0; d1 < 8 && !hiddenLowerFeatureChecked; d1++) for (let d2 = 0; d2 < 8 && !hiddenLowerFeatureChecked; d2++) for (let d3 = 0; d3 < 8 && !hiddenLowerFeatureChecked; d3++) {
  const orientations = { disc1: d1, disc2: d2, disc3: d3 };
  for (const lower of SETI_SOLAR_FEATURE_CATALOG.filter((feature) => feature.layer === 0)) {
    const resolved = resolveSetiSolarFeature(orientations, lower);
    const support = setiSolarSupportLayerForCell(orientations, resolved.cell);
    if (support === 0) continue;
    const visible = setiVisibleSolarFeatureAt(orientations, resolved.cell);
    if (!visible || visible.id !== lower.id) {
      ok(visible === null || visible.layer === support);
      hiddenLowerFeatureChecked = true;
      break;
    }
  }
}
ok(hiddenLowerFeatureChecked, 'covered lower features never affect top-visible predicates');

// The state adapter must expose the exact same visible geometry, never the
// obsolete lower-layer union that used to leak covered asteroids and icons.
const state = createSeti([
  { name: 'Geometry A', color: 'White' },
  { name: 'Geometry B', color: 'Green' },
], 0x5e71);
let stateOrientationCount = 0;
for (let disc1 = 0; disc1 < 8; disc1++) for (let disc2 = 0; disc2 < 8; disc2++) for (let disc3 = 0; disc3 < 8; disc3++) {
  stateOrientationCount++;
  state.solar.orientations = { base: 0, disc1, disc2, disc3 };
  const orientations = { disc1, disc2, disc3 };
  const expected = getSetiVisibleSolarFeatures(orientations);
  const actual = getSetiSolarFeatures(state);
  deepEqual(
    actual.map(({ layer, cell, kind, body, grantsPrintedPublicity }) => ({ layer, cell, kind, body, grantsPrintedPublicity })),
    expected.map(({ layer, cell, kind, body, grantsPrintedPublicity }) => ({ layer, cell, kind, body, grantsPrintedPublicity })),
    `state adapter matches pure visible geometry at ${disc1}/${disc2}/${disc3}`,
  );
  for (const cell of SETI_CELL_IDS) {
    const visible = setiVisibleSolarFeatureAt(orientations, cell);
    equal(setiSupportLayerForCell(state, cell), setiSolarSupportLayerForCell(orientations, cell));
    equal(isSetiAsteroidCell(state, cell), visible?.kind === 'asteroid');
    equal(isSetiPublicityCell(state, cell), visible?.grantsPrintedPublicity === true);
    equal(bodyAtSetiCell(state, cell), visible?.kind === 'planet' ? visible.body ?? null : null);
  }
}
equal(stateOrientationCount, 512, 'state adapter is checked at every orientation');

// Alien overlays are physically above the printed layers. An anomaly hides an
// underlying object and never grants publicity; the Oumuamua tile replaces the
// printed object in its cell and behaves as the visitable planet.
state.solar.orientations = { base: 0, disc1: 0, disc2: 0, disc3: 0 };
const outerPrinted = getSetiSolarFeatures(state).find((feature) => parseSetiCell(feature.cell).ring === 2)!;
const anomalySector = parseSetiCell(outerPrinted.cell).sector;
state.species[0].revealed = true;
state.species[0].speciesId = 'anomalies';
state.species[0].module = { kind: 'anomalies', anomalies: [{ id: 'seti_test_anomaly', sector: anomalySector, side: 0 }], triggerCount: 0 };
equal(getSetiSolarFeatures(state).some((feature) => feature.cell === outerPrinted.cell), false, 'anomaly covers the printed object below it');
equal(isSetiPublicityCell(state, outerPrinted.cell), false, 'anomaly grants no visit publicity');
equal(bodyAtSetiCell(state, outerPrinted.cell), null, 'anomaly is not a planet');

state.species[0].revealed = false;
state.species[0].module = null;
const printedAsteroid = getSetiSolarFeatures(state).find((feature) => feature.kind === 'asteroid')!;
state.species[1].revealed = true;
state.species[1].speciesId = 'oumuamua';
state.species[1].module = { kind: 'oumuamua', cell: printedAsteroid.cell, dataRemaining: 3, signals: [], exofossils: { 0: 0, 1: 0 } };
equal(getSetiSolarFeatures(state).filter((feature) => feature.cell === printedAsteroid.cell).length, 1, 'Oumuamua replaces rather than duplicates the printed cell object');
equal(isSetiAsteroidCell(state, printedAsteroid.cell), false, 'covered asteroid rules do not leak through Oumuamua');
equal(isSetiPublicityCell(state, printedAsteroid.cell), true, 'Oumuamua grants visit publicity');
equal(bodyAtSetiCell(state, printedAsteroid.cell), 'Oumuamua', 'Oumuamua is the visitable body');

console.log(`seti solar geometry: ok (${orientationCount} orientations, ${SETI_CELL_IDS.length * orientationCount * 3} rotation transitions)`);
