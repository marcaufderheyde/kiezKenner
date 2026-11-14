import { findShortestPath, pickDistractors, pickWeightedTarget } from './geo';
import type {
  DeckType,
  KiezFeature,
  KiezMastery,
  TransitData,
  TransitLine,
  TransitStation
} from './types';

export function getFilteredPool(features: KiezFeature[], bezirkFilter: string, deck: DeckType): KiezFeature[] {
  let pool = features;
  if (bezirkFilter === 'ring' && deck === 'ortsteile') {
    pool = features.filter((f) => f.properties.insideRing);
  } else if (bezirkFilter !== 'all' && bezirkFilter !== 'ring') {
    pool = features.filter((f) => f.properties.bezirk === bezirkFilter);
  }
  return pool.length >= 4 ? pool : features;
}

export function createPinpointRound(
  pool: KiezFeature[],
  allFeatures: KiezFeature[],
  mastery: Record<string, KiezMastery>,
  prevId?: string
) {
  const exclude = prevId ? new Set([prevId]) : new Set<string>();
  const target = pickWeightedTarget(pool, mastery, exclude);
  const choices = pickDistractors(target, allFeatures, 3);
  return { target, choices };
}

export function createPathfindingRound(
  pool: KiezFeature[],
  allFeatures: KiezFeature[],
  featureMap: Map<string, KiezFeature>
) {
  const minHops = pool.length <= 12 ? 2 : 3;
  const maxHops = pool.length <= 12 ? 4 : 6;

  for (let attempt = 0; attempt < 40; attempt++) {
    const start = pool[Math.floor(Math.random() * pool.length)];
    const end = allFeatures[Math.floor(Math.random() * allFeatures.length)];
    if (start.properties.id === end.properties.id) continue;
    const path = findShortestPath(start.properties.id, end.properties.id, featureMap);
    // path includes start and end, so hops = path.length - 1
    if (path.length - 1 >= minHops && path.length - 1 <= maxHops) {
      return { start, end, optimalPath: path };
    }
  }

  // Fallback deterministic pick
  const start = pool[0];
  for (const candidate of allFeatures) {
    if (candidate.properties.id === start.properties.id) continue;
    const path = findShortestPath(start.properties.id, candidate.properties.id, featureMap);
    if (path.length >= 3) {
      return { start, end: candidate, optimalPath: path };
    }
  }
  const fallbackEnd = allFeatures.find((f) => f.properties.id !== start.properties.id) ?? start;
  return {
    start,
    end: fallbackEnd,
    optimalPath: findShortestPath(start.properties.id, fallbackEnd.properties.id, featureMap)
  };
}

export function createStationRound(
  pool: KiezFeature[],
  allFeatures: KiezFeature[],
  featureMap: Map<string, KiezFeature>,
  transit: TransitData,
  deck: DeckType,
  prevStationId?: string
) {
  const poolIds = new Set(pool.map((f) => f.properties.id));
  const idField = deck === 'ortsteile' ? 'ortsteilId' : 'kiezId';

  let validStations: TransitStation[] = transit.stations.filter((s) => {
    const fid = s[idField];
    return fid !== null && poolIds.has(fid);
  });

  if (validStations.length === 0) {
    validStations = transit.stations.filter((s) => s[idField] !== null && featureMap.has(s[idField]!));
  }

  const filtered = prevStationId
    ? validStations.filter((s) => s.id !== prevStationId)
    : validStations;
  const source = filtered.length > 0 ? filtered : validStations;
  const station = source[Math.floor(Math.random() * source.length)];
  const targetId = station[idField]!;
  const targetFeature = featureMap.get(targetId)!;
  const choices = pickDistractors(targetFeature, allFeatures, 3);

  return { station, targetFeature, choices };
}

export function createLineRound(
  transit: TransitData,
  deck: DeckType,
  prevLineId?: string
): { line: TransitLine; targetIds: string[] } {
  const field = deck === 'ortsteile' ? 'ortsteilIds' : 'kiezIds';
  const eligible = transit.lines.filter((l) => l[field].length >= 3);
  const filtered = prevLineId ? eligible.filter((l) => l.id !== prevLineId) : eligible;
  const source = filtered.length > 0 ? filtered : eligible;
  const line = source[Math.floor(Math.random() * source.length)];
  return { line, targetIds: [...line[field]] };
}

export function createNeighborsRound(
  pool: KiezFeature[],
  featureMap: Map<string, KiezFeature>,
  mastery: Record<string, KiezMastery>,
  prevCenterId?: string
) {
  const goodCandidates = pool.filter(
    (f) =>
      f.properties.neighbors.length >= 3 &&
      f.properties.neighbors.length <= 8 &&
      f.properties.id !== prevCenterId
  );
  const candidates = goodCandidates.length > 0 ? goodCandidates : pool;
  const center = pickWeightedTarget(candidates, mastery);
  const neighborFeatures = center.properties.neighbors
    .map((id) => featureMap.get(id))
    .filter((f): f is KiezFeature => Boolean(f));

  return { center, neighborFeatures };
}
