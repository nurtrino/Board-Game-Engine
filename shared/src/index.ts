export * from './protocol.js';
export * from './brass/state.js';
export * from './brass/actions.js';
export * from './brass/rng.js';
export * from './ttr/state.js';
export * from './ttr/actions.js';
export * from './trek/state.js';
export * from './trek/actions.js';
export * from './darktower/state.js';
export * from './darktower/actions.js';
export * from './darktower/territories.js';
export * from './dune/state.js';
export * from './dune/actions.js';
export * from './axis/config.js';
export * from './axis/map.js';
export * from './axis/physical.js';
export * from './axis/airMovement.js';
export * from './axis/movementRules.js';
export * from './axis/mobilizationRules.js';
export * from './axis/carrierCommitments.js';
export * from './axis/defendingCarrierLandings.js';
export * from './axis/specialTechnologyRules.js';
export * from './axis/retreat.js';
export * from './axis/china.js';
export {
  createAxisGame, axisGameViewFor, applyAxisGameAction, axisPowerOfSeat,
  AXIS_MAP, AXIS_MAP_STUB, AXIS_INDEX,
  type AxisSeat, type AxisRoomOptions,
} from './axis/game.js';
export {
  AXIS_SEATS, activePower as axisActivePower, operatingPower as axisOperatingPower, normalizeAxisState, snapshotAxisTurnStartSea,
  allocateAxisCarrierHullRef, allocateAxisDefendingCarrierFighterRef,
  type AxisState, type AxisView, type AxisCreateOptions, type AxisCombatant, type UsaOperationFirst, type UnitStack, type AxisPending,
  type AxisCarrierLandingTag, type AxisDefendingCarrierLandingQueueState,
} from './axis/state.js';
export {
  type AxisAction, type AxisUnitPick, type AxisBomberForce, type AxisBattleTarget,
  type AxisNewCarrierLandingOrder, type AxisParatrooperPieceRef,
  type AxisParatrooperPairOrder, type AxisParatrooperGroupOrder,
} from './axis/actions.js';
export * from './politik/state.js';
export * from './politik/actions.js';
// Dark Souls: everything is Ds/DS_/ds-prefixed (collision-checked)
export {
  DS_SEATS, type DsSeat,
  createDarkSouls, dsViewFor, dsRollDie, dsRollDodgeDie, dsShuffle, dsDrawL4,
  dsStatValue, dsMeetsReqs, dsDefenceDice, dsDodgeDiceCount, dsWeaponCount,
  dsModelsAt, dsOccupancy, dsNodeBlocked, dsPushPending,
  type DsState, type DsView, type DsCreateOptions, type DsCharacter,
  type DsTile, type DsEncounterRun, type DsBossRun, type DsBossUnit,
  type DsPending, type DsPendingKind, type DsPendingOption, type DsEnemyModel,
  type DsPhase, type DsStage, type DsArc, type DsLogEntry, type DsSummon,
  type DsDefBuff,
} from './darksouls/state.js';
export { applyDarkSoulsAction, type DsAction, type DsActionResult } from './darksouls/actions.js';
export {
  DS_DICE, DS_DODGE_DIE, DS_SPARKS, DS_CONDITIONS, DS_MINI_BOSSES,
  DS_MAIN_BOSSES, DS_MEGA_BOSSES, DS_LEVEL_COSTS_STANDARD, DS_LEVEL_COSTS_CAMPAIGN,
  type DsStat, type DsCondition, type DsDieColor,
} from './darksouls/config.js';
export {
  DS_CLASSES, DS_CLASS_IDS, DS_ENEMIES, DS_INVADERS, DS_BOSSES, DS_ENCOUNTERS,
  DS_ENCOUNTER_BY_ID, DS_TREASURES, DS_TREASURE_BY_ID, DS_TILE_FACES,
  DS_SCENARIOS, DS_SUMMONS, dsTileGraph, dsNodeDistance, dsEntryNodes, dsNodesOfTerrain,
  dsIsDrawableEncounter, dsTreasureDeckCards, dsSummonPool,
  type DsClassDef, type DsBossDef, type DsBossCard, type DsBossOp,
  type DsEncounterCard, type DsTreasureCard, type DsTreasureAction, type DsTileFace, type DsScenarioDef,
  type DsSummonDef, type DsSummonCard, type DsSummonOp, type DsNodePatternCard,
  type DsSpellEffect,
} from './darksouls/data.js';
// A Feast for Odin: all public names are Feast/FEAST_/feast-prefixed.
export * from './feast/types.js';
export * from './feast/data.js';
export * from './feast/placement.js';
export * from './feast/occupationRules.js';
export * from './feast/occupationRuntime.js';
export * from './feast/occupationExecutor.js';
export * from './feast/occupationDecisions.js';
export * from './feast/occupationDeferred.js';
export * from './feast/occupationPipeline.js';
export * from './feast/state.js';
export * from './feast/actions.js';
// Bloodborne: The Board Game — all public names are Bb/BB_/bb-prefixed.
export {
  BB_SEATS, createBloodborne, bbViewFor, setupChapter as bbSetupChapter,
  spaceNeighbors as bbSpaceNeighbors, lampSpaces as bbLampSpaces,
  parseRef as bbParseRef, spaceRef as bbSpaceRef, tileDef as bbTileDef,
  worldExits as bbWorldExits, connectedTiles as bbConnectedTiles,
  type BbSeat, type BbState, type BbView, type BbCreateOptions,
  type BbHunterState, type BbEnemyOnMap, type BbBossOnMap, type BbPlacedTile,
  type BbPending, type BbCombat, type BbSpaceRef as BbSpaceRefT, type BbEdge,
} from './bloodborne/state.js';
export { applyBloodborneAction, bbPostProcess, type BbAction } from './bloodborne/actions.js';
export { missionState as bbMissionState, type BbMissionState } from './bloodborne/missions.js';
export {
  BB_HUNTERS, BB_ENEMIES, BB_BOSSES, BB_TILES, BB_CAMPAIGNS, BB_ITEMS,
  BB_STAT_CARDS, BB_BASIC_CARDS, BB_UPGRADE_CARDS, BB_MISSIONS, BB_HUNT_TRACK,
  bbStatCard, bbItem,
  type BbHunterDef, type BbEnemyDef, type BbBossDef, type BbTileDef,
  type BbCampaignDef, type BbChapterDef, type BbItemDef, type BbStatCardDef,
  type BbAttackDef, type BbEffects, type BbMissionDef,
} from './bloodborne/data.js';

// SETI: Search for Extraterrestrial Intelligence. Every public symbol is
// Seti/SETI_/seti-prefixed so this full rules engine remains collision-free.
export * from './seti/data.js';
export * from './seti/solarGeometry.js';
export * from './seti/projectCatalog.js';
export * from './seti/projectRuntime.js';
export * from './seti/projectExecutor.js';
export {
  SETI_ALIEN_CARDS as SETI_TYPED_ALIEN_CARDS,
  SETI_ALIEN_CARDS_BY_ID,
  SETI_ALIEN_CARDS_BY_CARD_ID,
  SETI_ALIEN_CARD_COUNTS,
  SETI_ALIEN_DISCOVERY_SLOTS,
  SETI_ALIEN_OVERFLOW,
  SETI_ALIEN_RESEARCH_RULES,
  SETI_ALIEN_SPECIES,
  SETI_ALIEN_SPECIES_BY_ID,
  SETI_MASCAMITE_SAMPLE_REWARDS,
  SETI_ANOMALY_TOKENS,
  SETI_CENTAURIAN_MESSAGE_REWARDS,
  setiAlienRewardSignature,
} from './seti/alienCatalog.js';
export type {
  SetiAlienSpeciesId,
  SetiAlienTraceColor,
  SetiAlienSignalColor,
  SetiAlienTechType,
  SetiAlienIncome,
  SetiAlienBody,
  SetiAlienReward,
  SetiAlienCondition,
  SetiAlienEffect,
  SetiAlienMission,
  SetiAlienCardArt,
  SetiAlienCardDefinition,
  SetiExertianScoringCondition,
  SetiAlienResearchSpace,
  SetiAlienSpeciesDefinition,
  SetiAlienSpeciesRule,
} from './seti/alienCatalog.js';
export * from './seti/alienRuntime.js';
export * from './seti/soloCatalog.js';
export * from './seti/soloRuntime.js';
export * from './seti/coreRules.js';
export * from './seti/state.js';
export * from './seti/actions.js';
export { BB_MAX_HP, BB_MAX_ECHOES, BB_SPEED_RANK, type BbSpeed, type BbStat } from './bloodborne/config.js';

// Blokus 20x20 — all public names are Blokus/BLOKUS_/blokus-prefixed.
export * from './blokus/state.js';
export * from './blokus/actions.js';

// Everdell (base game) — all public names are Everdell/EVERDELL_/EV_/ev-prefixed.
export * from './everdell/catalog.js';
export * from './everdell/state.js';
export * from './everdell/actions.js';
