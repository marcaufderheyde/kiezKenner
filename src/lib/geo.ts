import type {
  ContextFeatureCollection,
  KiezCollection,
  KiezFeature,
  KiezMastery,
  TransitData
} from './types';

export interface LoadedGeodata {
  ortsteile: KiezCollection;
  kieze: KiezCollection;
  transit: TransitData;
  context: ContextFeatureCollection;
}

let cachedPromise: Promise<LoadedGeodata> | null = null;

export function loadGeodata(): Promise<LoadedGeodata> {
  if (!cachedPromise) {
    cachedPromise = Promise.all([
      fetch('./data/ortsteile.geojson').then((r) => {
        if (!r.ok) throw new Error('Failed to load ortsteile.geojson');
        return r.json() as Promise<KiezCollection>;
      }),
      fetch('./data/kieze.geojson').then((r) => {
        if (!r.ok) throw new Error('Failed to load kieze.geojson');
        return r.json() as Promise<KiezCollection>;
      }),
      fetch('./data/transit.json').then((r) => {
        if (!r.ok) throw new Error('Failed to load transit.json');
        return r.json() as Promise<TransitData>;
      }),
      fetch('./data/context.geojson').then((r) => {
        if (!r.ok) throw new Error('Failed to load context.geojson');
        return r.json() as Promise<ContextFeatureCollection>;
      })
    ]).then(([ortsteile, kieze, transit, context]) => ({
      ortsteile,
      kieze,
      transit,
      context
    }));
  }
  return cachedPromise;
}

export function distanceKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function bearingArrow(
  from: [number, number],
  to: [number, number],
  lang: 'de' | 'en' = 'de'
): string {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const y = Math.sin(toRad(to[0] - from[0])) * Math.cos(toRad(to[1]));
  const x =
    Math.cos(toRad(from[1])) * Math.sin(toRad(to[1])) -
    Math.sin(toRad(from[1])) * Math.cos(toRad(to[1])) * Math.cos(toRad(to[0] - from[0]));
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const arrows =
    lang === 'de'
      ? ['↑ N', '↗ NO', '→ O', '↘ SO', '↓ S', '↙ SW', '← W', '↖ NW']
      : ['↑ N', '↗ NE', '→ E', '↘ SE', '↓ S', '↙ SW', '← W', '↖ NW'];
  const idx = Math.round(deg / 45) % 8;
  return arrows[idx];
}

export function findShortestPath(
  startId: string,
  endId: string,
  featureMap: Map<string, KiezFeature>
): string[] {
  if (startId === endId) return [startId];
  const queue: string[][] = [[startId]];
  const visited = new Set<string>([startId]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const last = path[path.length - 1];
    const feat = featureMap.get(last);
    if (!feat) continue;
    for (const neighborId of feat.properties.neighbors) {
      if (neighborId === endId) {
        return [...path, neighborId];
      }
      if (!visited.has(neighborId) && featureMap.has(neighborId)) {
        visited.add(neighborId);
        queue.push([...path, neighborId]);
      }
    }
  }
  return [];
}

export function isPathConnected(
  startId: string,
  endId: string,
  selectedIds: Set<string>,
  featureMap: Map<string, KiezFeature>
): boolean {
  const queue = [startId];
  const visited = new Set<string>([startId]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === endId) return true;
    const feat = featureMap.get(cur);
    if (!feat) continue;
    for (const nxt of feat.properties.neighbors) {
      if (!visited.has(nxt) && (selectedIds.has(nxt) || nxt === endId)) {
        visited.add(nxt);
        queue.push(nxt);
      }
    }
  }
  return false;
}

export function pickWeightedTarget(
  pool: KiezFeature[],
  mastery: Record<string, KiezMastery>,
  excludeIds: Set<string> = new Set()
): KiezFeature {
  const candidates = pool.filter((f) => !excludeIds.has(f.properties.id));
  const list = candidates.length > 0 ? candidates : pool;

  const weighted = list.map((f) => {
    const m = mastery[f.properties.id];
    const level = m?.level ?? 0;
    // Prefer unseen (weight 6) > learning (weight 4) > familiar (weight 2) > mastered (weight 1)
    const weight = level === 0 ? 6 : level === 1 ? 4 : level === 2 ? 2 : 1;
    return { f, weight };
  });

  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let r = Math.random() * total;
  for (const item of weighted) {
    r -= item.weight;
    if (r <= 0) return item.f;
  }
  return list[Math.floor(Math.random() * list.length)];
}

export function pickDistractors(
  target: KiezFeature,
  allFeatures: KiezFeature[],
  count = 3
): KiezFeature[] {
  const targetId = target.properties.id;
  const neighborSet = new Set(target.properties.neighbors);

  const neighbors = allFeatures.filter(
    (f) => f.properties.id !== targetId && neighborSet.has(f.properties.id)
  );
  const sameBezirk = allFeatures.filter(
    (f) =>
      f.properties.id !== targetId &&
      !neighborSet.has(f.properties.id) &&
      f.properties.bezirk === target.properties.bezirk
  );
  const others = allFeatures.filter(
    (f) =>
      f.properties.id !== targetId &&
      !neighborSet.has(f.properties.id) &&
      f.properties.bezirk !== target.properties.bezirk
  );

  const shuffle = <T>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const picked: KiezFeature[] = [];
  for (const bucket of [shuffle(neighbors), shuffle(sameBezirk), shuffle(others)]) {
    for (const item of bucket) {
      if (picked.length >= count) break;
      picked.push(item);
    }
    if (picked.length >= count) break;
  }

  return shuffle([target, ...picked]);
}

export function computeClusterBbox(features: KiezFeature[]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of features) {
    const [x1, y1, x2, y2] = f.properties.bbox;
    if (x1 < minX) minX = x1;
    if (y1 < minY) minY = y1;
    if (x2 > maxX) maxX = x2;
    if (y2 > maxY) maxY = y2;
  }
  return [minX, minY, maxX, maxY];
}
