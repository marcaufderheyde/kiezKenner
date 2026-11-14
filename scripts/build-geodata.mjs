import fs from 'node:fs/promises';
import path from 'node:path';
import * as turf from '@turf/turf';

const OUT_DIR = path.resolve(process.cwd(), 'public/data');

const BEZIRKE = {
  '01': 'Mitte',
  '02': 'Friedrichshain-Kreuzberg',
  '03': 'Pankow',
  '04': 'Charlottenburg-Wilmersdorf',
  '05': 'Spandau',
  '06': 'Steglitz-Zehlendorf',
  '07': 'Tempelhof-Schöneberg',
  '08': 'Neukölln',
  '09': 'Treptow-Köpenick',
  '10': 'Marzahn-Hellersdorf',
  '11': 'Lichtenberg',
  '12': 'Reinickendorf'
};

// Enrich dry administrative LOR names with authentic everyday Berlin Kiez names
const KIEZ_ALIASES = {
  'Kollwitzplatz': 'Kollwitzkiez',
  'Helmholtzplatz': 'Helmholtzkiez',
  'Bötzowstraße': 'Bötzowkiez',
  'Reuterplatz': 'Reuterkiez',
  'Maybachufer': 'Kreuzkölln / Maybachufer',
  'Körnerpark': 'Körnerkiez',
  'Soldiner Straße': 'Soldiner Kiez',
  'Belziger Straße': 'Akazienkiez',
  'Bayerischer Platz': 'Bayerisches Viertel',
  'Boxhagener Platz': 'Boxhagener Kiez',
  'Niederbarnimstraße': 'Simon-Dach-Kiez',
  'Oranienburger Straße': 'Scheunenviertel / Oranienburger',
  'Oranienplatz': 'SO36 / Oranienplatz',
  'Lausitzer Platz': 'Lausitzer Kiez',
  'Schillerpromenade Nord': 'Schillerkiez Nord',
  'Schillerpromenade Süd': 'Schillerkiez Süd',
  'Klausenerplatz': 'Klausenerplatz-Kiez',
  'Savignyplatz': 'Savignyplatz-Kiez',
  'Alt-Rixdorf': 'Rixdorf / Böhmisches Dorf',
  'Bouchéstraße': 'Harzer Kiez',
  'Arkonaplatz': 'Arkonaplatz-Kiez',
  'Teutoburger Platz': 'Teutoburger Kiez',
  'Sparrplatz': 'Sprengelkiez / Sparrplatz',
  'Ostseestraße': 'Ostseeviertel',
  'Malmöer Straße': 'Nordisches Viertel',
  'Norweger Viertel': 'Norwegerviertel',
  'Wittenbergplatz': 'Nollendorfkiez / Wittenbergplatz',
  'Frobenstraße': 'Bülowkiez',
  'Rathaus Yorckstraße': 'Bergmannkiez West',
  'Urbanstraße': 'Bergmannkiez Ost',
  'Weberwiese': 'Karl-Marx-Allee / Weberwiese',
  'Traveplatz': 'Ostkreuz / Traveplatz'
};

const LINE_STYLES = {
  U1: { color: '#7DAD4C', textColor: '#ffffff', type: 'u' },
  U2: { color: '#DA421E', textColor: '#ffffff', type: 'u' },
  U3: { color: '#007A5B', textColor: '#ffffff', type: 'u' },
  U4: { color: '#F0D722', textColor: '#111827', type: 'u' },
  U5: { color: '#7E5330', textColor: '#ffffff', type: 'u' },
  U6: { color: '#8C6DAB', textColor: '#ffffff', type: 'u' },
  U7: { color: '#528DBA', textColor: '#ffffff', type: 'u' },
  U8: { color: '#224F86', textColor: '#ffffff', type: 'u' },
  U9: { color: '#F3791D', textColor: '#ffffff', type: 'u' },
  S1: { color: '#DA6BA2', textColor: '#ffffff', type: 's' },
  S2: { color: '#007734', textColor: '#ffffff', type: 's' },
  S25: { color: '#007734', textColor: '#ffffff', type: 's' },
  S26: { color: '#007734', textColor: '#ffffff', type: 's' },
  S3: { color: '#0066AD', textColor: '#ffffff', type: 's' },
  S41: { color: '#C65D21', textColor: '#ffffff', type: 's', isRing: true },
  S42: { color: '#C65D21', textColor: '#ffffff', type: 's', isRing: true },
  S45: { color: '#CD8C42', textColor: '#111827', type: 's' },
  S46: { color: '#CD8C42', textColor: '#111827', type: 's' },
  S47: { color: '#CD8C42', textColor: '#111827', type: 's' },
  S5: { color: '#EC6608', textColor: '#ffffff', type: 's' },
  S7: { color: '#816DA6', textColor: '#ffffff', type: 's' },
  S75: { color: '#816DA6', textColor: '#ffffff', type: 's' },
  S8: { color: '#66AA22', textColor: '#ffffff', type: 's' },
  S85: { color: '#66AA22', textColor: '#ffffff', type: 's' },
  S9: { color: '#992746', textColor: '#ffffff', type: 's' }
};

function roundCoord(c) {
  return [Math.round(c[0] * 100000) / 100000, Math.round(c[1] * 100000) / 100000];
}

function pointKey(c) {
  return `${Math.round(c[0] * 10000)},${Math.round(c[1] * 10000)}`;
}

// Simplify rings while preserving any vertex shared between multiple polygons so borders stay 100% flush
function simplifyCollectionTopologically(features, minStepDeg = 0.00035) {
  const vertexOwners = new Map();

  const walkRings = (geom, cb) => {
    if (geom.type === 'Polygon') {
      geom.coordinates.forEach(cb);
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach((poly) => poly.forEach(cb));
    }
  };

  features.forEach((f, idx) => {
    walkRings(f.geometry, (ring) => {
      for (const pt of ring) {
        const k = pointKey(pt);
        let set = vertexOwners.get(k);
        if (!set) {
          set = new Set();
          vertexOwners.set(k, set);
        }
        set.add(idx);
      }
    });
  });

  // Identify junction vertices (where >2 features meet or boundary ownership transitions)
  const junctionKeys = new Set();
  for (const [k, owners] of vertexOwners.entries()) {
    if (owners.size >= 3) junctionKeys.add(k);
  }

  features.forEach((f) => {
    walkRings(f.geometry, (ring) => {
      for (let i = 0; i < ring.length - 1; i++) {
        const currOwners = vertexOwners.get(pointKey(ring[i]))?.size ?? 1;
        const nextOwners = vertexOwners.get(pointKey(ring[i + 1]))?.size ?? 1;
        if (currOwners !== nextOwners) {
          junctionKeys.add(pointKey(ring[i]));
          junctionKeys.add(pointKey(ring[i + 1]));
        }
      }
    });
  });

  // Thin consecutive non-junction segments deterministically while keeping shared borders intact
  const simplifyRing = (ring) => {
    if (ring.length <= 6) return ring.map(roundCoord);
    const out = [roundCoord(ring[0])];
    let lastKept = ring[0];
    for (let i = 1; i < ring.length - 1; i++) {
      const pt = ring[i];
      const k = pointKey(pt);
      const owners = vertexOwners.get(k)?.size ?? 1;
      const isJunction = junctionKeys.has(k);
      // Keep shared border junctions and any vertex further than minStepDeg (less aggressive on shared borders)
      const step = owners >= 2 ? minStepDeg * 0.75 : minStepDeg;
      const dx = pt[0] - lastKept[0];
      const dy = pt[1] - lastKept[1];
      if (isJunction || Math.hypot(dx, dy) >= step) {
        out.push(roundCoord(pt));
        lastKept = pt;
      }
    }
    const endPt = out[0];
    out.push(endPt);
    return out.length >= 4 ? out : ring.map(roundCoord);
  };

  for (const f of features) {
    if (f.geometry.type === 'Polygon') {
      f.geometry.coordinates = f.geometry.coordinates.map(simplifyRing);
    } else if (f.geometry.type === 'MultiPolygon') {
      f.geometry.coordinates = f.geometry.coordinates.map((poly) => poly.map(simplifyRing));
    }
  }
}

function getExteriorVertices(geom) {
  const pts = [];
  if (geom.type === 'Polygon') {
    for (const pt of geom.coordinates[0]) pts.push(pt);
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      for (const pt of poly[0]) pts.push(pt);
    }
  }
  return pts;
}

function computeAdjacency(features, bridgeThresholdDeg = 0.00055) {
  const bboxes = features.map((f) => f.properties.bbox);
  const verts = features.map((f) => getExteriorVertices(f.geometry));
  const vertexIndex = new Map();

  verts.forEach((pts, i) => {
    for (const pt of pts) {
      const k = pointKey(pt);
      let arr = vertexIndex.get(k);
      if (!arr) {
        arr = [];
        vertexIndex.set(k, arr);
      }
      if (!arr.includes(i)) arr.push(i);
    }
  });

  const adj = features.map(() => new Set());

  // 1. Fast shared-vertex adjacency (count shared snapped vertices >= 2 to avoid diagonal corner touches)
  const sharedCounts = new Map();
  for (const owners of vertexIndex.values()) {
    if (owners.length < 2) continue;
    for (let a = 0; a < owners.length; a++) {
      for (let b = a + 1; b < owners.length; b++) {
        const key = `${owners[a]}_${owners[b]}`;
        sharedCounts.set(key, (sharedCounts.get(key) ?? 0) + 1);
      }
    }
  }
  for (const [key, count] of sharedCounts.entries()) {
    if (count >= 2) {
      const [i, j] = key.split('_').map(Number);
      adj[i].add(j);
      adj[j].add(i);
    }
  }

  // 2. River/canal bridge check (polygons separated only by Spree/Landwehrkanal/Havel width)
  for (let i = 0; i < features.length; i++) {
    const bi = bboxes[i];
    for (let j = i + 1; j < features.length; j++) {
      if (adj[i].has(j)) continue;
      const bj = bboxes[j];
      if (
        bi[2] + bridgeThresholdDeg < bj[0] ||
        bj[2] + bridgeThresholdDeg < bi[0] ||
        bi[3] + bridgeThresholdDeg < bj[1] ||
        bj[3] + bridgeThresholdDeg < bi[1]
      ) {
        continue;
      }
      let closeHits = 0;
      const ptsI = verts[i];
      const ptsJ = verts[j];
      for (let a = 0; a < ptsI.length && closeHits < 2; a++) {
        const [x1, y1] = ptsI[a];
        for (let b = 0; b < ptsJ.length; b++) {
          const dx = x1 - ptsJ[b][0];
          const dy = y1 - ptsJ[b][1];
          if (dx * dx + dy * dy <= bridgeThresholdDeg * bridgeThresholdDeg) {
            closeHits++;
            break;
          }
        }
      }
      if (closeHits >= 2) {
        adj[i].add(j);
        adj[j].add(i);
      }
    }
  }

  // 3. Ensure entire graph is a single connected component (bridge any isolated island via nearest centroids)
  const visited = new Set([0]);
  const queue = [0];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const nxt of adj[cur]) {
      if (!visited.has(nxt)) {
        visited.add(nxt);
        queue.push(nxt);
      }
    }
  }

  while (visited.size < features.length) {
    let bestA = -1;
    let bestB = -1;
    let bestDist = Infinity;
    for (const a of visited) {
      const ca = features[a].properties.centroid;
      for (let b = 0; b < features.length; b++) {
        if (visited.has(b)) continue;
        const cb = features[b].properties.centroid;
        const d = Math.hypot(ca[0] - cb[0], ca[1] - cb[1]);
        if (d < bestDist) {
          bestDist = d;
          bestA = a;
          bestB = b;
        }
      }
    }
    if (bestA === -1 || bestB === -1) break;
    adj[bestA].add(bestB);
    adj[bestB].add(bestA);
    // BFS from bestB to add its entire component
    const compQueue = [bestB];
    visited.add(bestB);
    while (compQueue.length > 0) {
      const cur = compQueue.shift();
      for (const nxt of adj[cur]) {
        if (!visited.has(nxt)) {
          visited.add(nxt);
          compQueue.push(nxt);
        }
      }
    }
    console.log(
      `Bridged isolated cluster: ${features[bestA].properties.name} <-> ${features[bestB].properties.name}`
    );
  }

  features.forEach((f, i) => {
    f.properties.neighbors = [...adj[i]].map((idx) => features[idx].properties.id);
  });
}

function getSafePointInside(feature) {
  try {
    const com = turf.centerOfMass(feature);
    if (turf.booleanPointInPolygon(com, feature)) {
      return roundCoord(com.geometry.coordinates);
    }
    const pof = turf.pointOnFeature(feature);
    return roundCoord(pof.geometry.coordinates);
  } catch {
    const b = turf.bbox(feature);
    return roundCoord([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
  }
}

async function fetchJson(url, label) {
  console.log(`Fetching ${label}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${label}: ${url}`);
  return res.json();
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function buildOrtsteile() {
  const url =
    'https://gdi.berlin.de/services/wfs/alkis_ortsteile?service=WFS&version=2.0.0&request=GetFeature&typeNames=alkis_ortsteile:ortsteile&outputFormat=application/json&srsName=EPSG:4326';
  const raw = await fetchJson(url, 'ALKIS Ortsteile');

  const features = raw.features.map((f) => {
    const bezCode = String(f.properties.sch ?? '').slice(6, 8);
    const bezirk = BEZIRKE[bezCode] ?? 'Berlin';
    const name = String(f.properties.nam ?? 'Unknown').trim();
    const id = `ot-${slugify(name)}`;
    const bbox = turf.bbox(f).map((n) => Math.round(n * 100000) / 100000);
    const centroid = getSafePointInside(f);
    const areaKm2 = Math.round((turf.area(f) / 1e6) * 100) / 100;

    return {
      type: 'Feature',
      id,
      properties: {
        id,
        name,
        bezirk,
        centroid,
        bbox,
        areaKm2,
        insideRing: false,
        neighbors: [],
        stations: []
      },
      geometry: f.geometry
    };
  });

  simplifyCollectionTopologically(features, 0.00035);
  computeAdjacency(features, 0.0006);

  console.log(`Built ${features.length} Ortsteile.`);
  return { type: 'FeatureCollection', features };
}

async function buildKieze(ortsteileFC) {
  const url =
    'https://gdi.berlin.de/services/wfs/lor_2021?service=WFS&version=2.0.0&request=GetFeature&typeNames=lor_2021:a_lor_plr_2021&outputFormat=application/json&srsName=EPSG:4326';
  const raw = await fetchJson(url, 'LOR 2021 Planungsräume');

  const inner = raw.features.filter((f) => f.properties.stadtraum_name === 'Innere Stadt');

  // Detect duplicate plr_name so every Kiez has an unambiguous display name
  const nameCounts = new Map();
  for (const f of inner) {
    const rawName = String(f.properties.plr_name).trim();
    nameCounts.set(rawName, (nameCounts.get(rawName) ?? 0) + 1);
  }

  const features = inner.map((f) => {
    const officialName = String(f.properties.plr_name).trim();
    const bzrName = String(f.properties.bzr_name ?? '').trim();
    const rawBez = String(f.properties.bez ?? '');
    const bezCode = rawBez.slice(0, 2);
    const bezirk = BEZIRKE[bezCode] ?? rawBez;

    let displayName = KIEZ_ALIASES[officialName] ?? officialName;
    if ((nameCounts.get(officialName) ?? 0) > 1 && displayName === officialName) {
      const shortBezirk = bezirk.split('-')[0];
      displayName = `${officialName} (${shortBezirk})`;
    }

    const id = `kz-${f.properties.plr_id}`;
    const bbox = turf.bbox(f).map((n) => Math.round(n * 100000) / 100000);
    const centroid = getSafePointInside(f);
    const areaKm2 = Math.round((turf.area(f) / 1e6) * 100) / 100;

    // Match parent Ortsteil by centroid point-in-polygon
    let ortsteilName = bzrName;
    for (const ot of ortsteileFC.features) {
      if (turf.booleanPointInPolygon(centroid, ot)) {
        ortsteilName = ot.properties.name;
        break;
      }
    }

    return {
      type: 'Feature',
      id,
      properties: {
        id,
        name: displayName,
        officialName,
        ortsteil: ortsteilName,
        bezirk,
        centroid,
        bbox,
        areaKm2,
        insideRing: true,
        neighbors: [],
        stations: []
      },
      geometry: f.geometry
    };
  });

  simplifyCollectionTopologically(features, 0.00018);
  computeAdjacency(features, 0.0005);

  console.log(`Built ${features.length} Inner-City Kieze.`);
  return { type: 'FeatureCollection', features };
}

function findContainingPolygon(coords, collection, snapKm = 0) {
  const pt = turf.point(coords);
  for (const f of collection.features) {
    const [minX, minY, maxX, maxY] = f.properties.bbox;
    if (coords[0] < minX || coords[0] > maxX || coords[1] < minY || coords[1] > maxY) continue;
    if (turf.booleanPointInPolygon(pt, f)) {
      return f;
    }
  }
  if (snapKm > 0) {
    const pad = snapKm / 70;
    let best = null;
    let bestDist = snapKm;
    for (const f of collection.features) {
      const [minX, minY, maxX, maxY] = f.properties.bbox;
      if (
        coords[0] < minX - pad ||
        coords[0] > maxX + pad ||
        coords[1] < minY - pad ||
        coords[1] > maxY + pad
      ) {
        continue;
      }
      try {
        const d = turf.pointToPolygonDistance(pt, f, { units: 'kilometers' });
        if (d < bestDist) {
          bestDist = d;
          best = f;
        }
      } catch {
        // Ignore invalid rings
      }
    }
    return best;
  }
  return null;
}

async function buildTransit(ortsteileFC, kiezeFC) {
  const [vbbLines, vbbStations] = await Promise.all([
    fetchJson('https://unpkg.com/vbb-lines@latest/data.json', 'VBB Lines'),
    fetchJson('https://unpkg.com/vbb-stations@latest/full.json', 'VBB Stations')
  ]);

  // Build stop -> station parent lookup
  const stopToStation = new Map();
  for (const station of Object.values(vbbStations)) {
    stopToStation.set(station.id, station);
    if (Array.isArray(station.stops)) {
      for (const stop of station.stops) {
        if (typeof stop === 'string') {
          stopToStation.set(stop, station);
        } else if (stop?.id) {
          stopToStation.set(stop.id, station);
        }
      }
    }
  }

  const targetLineNames = new Set(Object.keys(LINE_STYLES));
  const stationRegistry = new Map();
  const linesOut = [];
  const ringStopIds = new Set();

  // Group VBB lines by line name (e.g. U1, U8, S41)
  const groupedLines = new Map();
  for (const line of vbbLines) {
    if (line.product !== 'subway' && line.product !== 'suburban') continue;
    const name = String(line.name ?? '').trim();
    if (!targetLineNames.has(name)) continue;
    if (!groupedLines.has(name)) groupedLines.set(name, []);
    groupedLines.get(name).push(line);
  }

  // Ensure U4 is always present (even if a GTFS snapshot omitted it due to temporary works)
  if (!groupedLines.has('U4')) {
    const u4Coords = [
      { id: 'u4-nollendorfplatz', name: 'U Nollendorfplatz', coords: [13.3539, 52.4991] },
      { id: 'u4-viktoria-luise', name: 'U Viktoria-Luise-Platz', coords: [13.3426, 52.4922] },
      { id: 'u4-bayerischer-platz', name: 'U Bayerischer Platz', coords: [13.3401, 52.4884] },
      { id: 'u4-rathaus-schoeneberg', name: 'U Rathaus Schöneberg', coords: [13.3435, 52.4839] },
      { id: 'u4-innsbrucker-platz', name: 'U Innsbrucker Platz', coords: [13.3438, 52.4787] }
    ];
    const u4Stops = u4Coords.map((fallback) => {
      const match = Object.values(vbbStations).find(
        (s) => s?.name && s.name.includes(fallback.name.replace(/^U\s+/, '')) && s.location
      );
      if (match) {
        stopToStation.set(match.id, match);
        return match.id;
      }
      const synthetic = {
        id: fallback.id,
        name: fallback.name,
        location: { longitude: fallback.coords[0], latitude: fallback.coords[1] }
      };
      stopToStation.set(synthetic.id, synthetic);
      return synthetic.id;
    });
    groupedLines.set('U4', [{ name: 'U4', product: 'subway', variants: [{ stops: u4Stops }] }]);
  }

  for (const [lineName, variantsGroups] of groupedLines.entries()) {
    const style = LINE_STYLES[lineName];
    if (style.isRing && linesOut.some((l) => l.isRing)) continue;
    const segments = [];
    const lineStationIds = new Set();
    const ortsteilSet = new Set();
    const kiezSet = new Set();

    // Pick longest variant(s) to construct clean geometry without clutter
    const allVariants = variantsGroups.flatMap((g) => g.variants ?? []);
    allVariants.sort((a, b) => (b.stops?.length ?? 0) - (a.stops?.length ?? 0));

    const seenEdges = new Set();
    // For Ringbahn (S41), one complete loop variant covers the whole ring cleanly; otherwise top 4 variants cover branches
    const maxVariants = style.isRing ? 1 : 4;
    for (const variant of allVariants.slice(0, maxVariants)) {
      const coords = [];
      let prevStation = null;

      for (const stopId of variant.stops ?? []) {
        const st = stopToStation.get(stopId);
        if (!st?.location) continue;
        const c = roundCoord([st.location.longitude, st.location.latitude]);

        // Keep geometry inside Greater Berlin region
        if (c[0] < 13.0 || c[0] > 13.85 || c[1] < 52.3 || c[1] > 52.75) continue;

        const ot = findContainingPolygon(c, ortsteileFC, 0.08);
        const kz = findContainingPolygon(c, kiezeFC, 0.08);

        if (ot) {
          if (!stationRegistry.has(st.id)) {
            const cleanName = st.name
              .replace(/\s*\(Berlin\)$/i, '')
              .replace(/^S\+U\s+/, 'S+U ')
              .replace(/^U\s+/, 'U ')
              .replace(/^S\s+/, 'S ')
              .trim();
            stationRegistry.set(st.id, {
              id: st.id,
              name: cleanName,
              coords: c,
              lines: new Set(),
              ortsteilId: ot.properties.id,
              kiezId: kz ? kz.properties.id : null
            });
          }
          const rec = stationRegistry.get(st.id);
          rec.lines.add(style.isRing ? 'Ring' : lineName);
          lineStationIds.add(st.id);
          ortsteilSet.add(ot.properties.id);
          if (kz) kiezSet.add(kz.properties.id);
          if (style.isRing) ringStopIds.add(ot.properties.id);
        }

        if (prevStation && prevStation.id !== st.id) {
          const edgeKey = [prevStation.id, st.id].sort().join('|');
          if (!seenEdges.has(edgeKey)) {
            seenEdges.add(edgeKey);
            if (coords.length === 0) {
              coords.push(roundCoord([prevStation.location.longitude, prevStation.location.latitude]));
            }
            coords.push(c);
          } else if (coords.length >= 2) {
            segments.push([...coords]);
            coords.length = 0;
          }
        } else if (coords.length === 0) {
          coords.push(c);
        }
        prevStation = st;
      }
      if (style.isRing && coords.length >= 20) {
        const first = coords[0];
        const last = coords[coords.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          coords.push(first);
        }
      }
      if (coords.length >= 2) segments.push(coords);
    }

    if (segments.length > 0 && lineStationIds.size > 0) {
      linesOut.push({
        id: `line-${lineName.toLowerCase()}`,
        name: style.isRing ? 'S41/S42 Ring' : lineName,
        type: style.type,
        color: style.color,
        textColor: style.textColor,
        isRing: Boolean(style.isRing),
        ortsteilIds: [...ortsteilSet],
        kiezIds: [...kiezSet],
        stationIds: [...lineStationIds],
        coordinates: segments
      });
    }
  }

  // Mark Ortsteile inside or intersecting S-Bahn Ring
  const ringOrtsteilNames = new Set([
    'Mitte', 'Moabit', 'Tiergarten', 'Hansaviertel', 'Wedding', 'Gesundbrunnen',
    'Kreuzberg', 'Friedrichshain', 'Prenzlauer Berg', 'Charlottenburg', 'Halensee',
    'Wilmersdorf', 'Schöneberg', 'Friedenau', 'Tempelhof', 'Neukölln', 'Alt-Treptow',
    'Rummelsburg', 'Fennpfuhl', 'Weißensee', 'Charlottenburg-Nord', 'Westend'
  ]);
  for (const ot of ortsteileFC.features) {
    ot.properties.insideRing =
      ringStopIds.has(ot.properties.id) || ringOrtsteilNames.has(ot.properties.name);
  }

  // Sort lines nicely: U1..U9 then Ring then S-Bahn
  linesOut.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'u' ? -1 : 1;
    if (a.isRing && !b.isRing) return -1;
    if (!a.isRing && b.isRing) return 1;
    return a.name.localeCompare(b.name, 'de', { numeric: true });
  });

  // Sort station lines and attach station names to Ortsteile/Kieze for quick fact-card lookup
  const otStations = new Map();
  const kzStations = new Map();
  const stationsOut = [...stationRegistry.values()].map((s) => {
    const lines = [...s.lines].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
    if (s.ortsteilId) {
      if (!otStations.has(s.ortsteilId)) otStations.set(s.ortsteilId, []);
      otStations.get(s.ortsteilId).push(s.name);
    }
    if (s.kiezId) {
      if (!kzStations.has(s.kiezId)) kzStations.set(s.kiezId, []);
      kzStations.get(s.kiezId).push(s.name);
    }
    return { ...s, lines };
  });

  for (const ot of ortsteileFC.features) {
    ot.properties.stations = (otStations.get(ot.properties.id) ?? []).slice(0, 8);
  }
  for (const kz of kiezeFC.features) {
    kz.properties.stations = (kzStations.get(kz.properties.id) ?? []).slice(0, 8);
  }

  console.log(`Built ${linesOut.length} transit lines and ${stationsOut.length} Berlin U/S-Bahn stations.`);
  return { lines: linesOut, stations: stationsOut };
}

async function buildContext() {
  const features = [];

  try {
    const waterUrl =
      'https://gdi.berlin.de/services/wfs/gewaesserkarte?service=WFS&version=2.0.0&request=GetFeature&typeNames=gewaesserkarte:e_gew_gewaesser_fl&outputFormat=application/json&srsName=EPSG:4326';
    const waterRaw = await fetchJson(waterUrl, 'Berlin Waterways');
    let waterCount = 0;
    for (const f of waterRaw.features) {
      if (!f.geometry) continue;
      const area = turf.area(f);
      if (area < 18000) continue;
      const simplified = turf.simplify(f, { tolerance: 0.00018, highQuality: false });
      features.push({
        type: 'Feature',
        properties: { kind: 'water' },
        geometry: simplified.geometry
      });
      waterCount++;
    }
    console.log(`Added ${waterCount} water polygons.`);
  } catch (err) {
    console.warn('Water WFS failed, continuing:', err.message);
  }

  try {
    const parksUrl =
      'https://gdi.berlin.de/services/wfs/gruenanlagen?service=WFS&version=2.0.0&request=GetFeature&typeNames=gruenanlagen:gruenanlagen&outputFormat=application/json&srsName=EPSG:4326';
    const parksRaw = await fetchJson(parksUrl, 'Berlin Parks');
    let parkCount = 0;
    for (const f of parksRaw.features) {
      if (!f.geometry) continue;
      const area = turf.area(f);
      if (area < 90000) continue;
      const simplified = turf.simplify(f, { tolerance: 0.00022, highQuality: false });
      features.push({
        type: 'Feature',
        properties: { kind: 'park' },
        geometry: simplified.geometry
      });
      parkCount++;
    }
    console.log(`Added ${parkCount} major park polygons.`);
  } catch (err) {
    console.warn('Parks WFS failed, continuing:', err.message);
  }

  return { type: 'FeatureCollection', features };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const ortsteileFC = await buildOrtsteile();
  const kiezeFC = await buildKieze(ortsteileFC);
  const transit = await buildTransit(ortsteileFC, kiezeFC);
  const contextFC = await buildContext();

  await Promise.all([
    fs.writeFile(path.join(OUT_DIR, 'ortsteile.geojson'), JSON.stringify(ortsteileFC)),
    fs.writeFile(path.join(OUT_DIR, 'kieze.geojson'), JSON.stringify(kiezeFC)),
    fs.writeFile(path.join(OUT_DIR, 'transit.json'), JSON.stringify(transit)),
    fs.writeFile(path.join(OUT_DIR, 'context.geojson'), JSON.stringify(contextFC))
  ]);

  const files = ['ortsteile.geojson', 'kieze.geojson', 'transit.json', 'context.geojson'];
  for (const name of files) {
    const stat = await fs.stat(path.join(OUT_DIR, name));
    console.log(`Wrote public/data/${name}: ${(stat.size / 1024).toFixed(1)} KB`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
