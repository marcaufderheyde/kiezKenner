<script lang="ts">
  import { onMount } from 'svelte';
  import MapView from './lib/map/MapView.svelte';
  import AtlasDialog from './lib/components/AtlasDialog.svelte';
  import {
    bearingArrow,
    computeClusterBbox,
    distanceKm,
    findShortestPath,
    isPathConnected,
    loadGeodata,
    pickDistractors,
    type LoadedGeodata
  } from './lib/geo';
  import {
    createLineRound,
    createNeighborsRound,
    createPathfindingRound,
    createPinpointRound,
    createStationRound,
    getFilteredPool
  } from './lib/game';
  import { t } from './lib/i18n';
  import {
    createInitialState,
    loadPersistedState,
    recordKiezOutcome,
    recordModeRound,
    savePersistedState,
    triggerHaptic
  } from './lib/storage';
  import { getResolvedTheme, subscribeThemeChanges, toggleColorScheme } from './lib/theme';
  import type {
    DeckType,
    GameMode,
    KiezFeature,
    MapPolygonVisualState,
    PersistedState,
    ResolvedTheme,
    TransitLine,
    TransitStation
  } from './lib/types';

  let persisted = $state<PersistedState>(loadPersistedState());
  let theme = $state<ResolvedTheme>(getResolvedTheme());
  let geodata = $state<LoadedGeodata | null>(null);
  let loadError = $state<string | null>(null);

  let mapRef: MapView | undefined = $state();
  let atlasRef: AtlasDialog | undefined = $state();

  // Ephemeral UI feedback toast
  let toastMessage = $state<string | null>(null);
  let toastKind = $state<'info' | 'error' | 'success'>('info');
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function showToast(msg: string, kind: 'info' | 'error' | 'success' = 'info') {
    toastMessage = msg;
    toastKind = kind;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastMessage = null;
    }, 2400);
  }

  // Round states for all 4 game modes
  // Mode 1: Pinpoint
  let ppTarget = $state<KiezFeature | null>(null);
  let ppChoices = $state<KiezFeature[]>([]);
  let ppAttempts = $state<
    Array<{ id: string; name: string; distKm: number; arrow: string; heat: 'hot' | 'warm' | 'wrong' }>
  >([]);
  let ppShowHint = $state(false);
  let ppStatus = $state<'playing' | 'won' | 'lost'>('playing');

  // Mode 2: Kiez-Hopping (Pathfinding)
  let pfStart = $state<KiezFeature | null>(null);
  let pfEnd = $state<KiezFeature | null>(null);
  let pfOptimal = $state<string[]>([]);
  let pfSelected = $state<string[]>([]);
  let pfHintId = $state<string | null>(null);
  let pfStatus = $state<'playing' | 'won'>('playing');
  let pfQuizChoices = $state<KiezFeature[]>([]);

  // Mode 3: Umsteigen (Transit)
  let trStation = $state<TransitStation | null>(null);
  let trTargetFeature = $state<KiezFeature | null>(null);
  let trChoices = $state<KiezFeature[]>([]);
  let trWrongIds = $state<string[]>([]);
  let trStatus = $state<'playing' | 'won' | 'lost'>('playing');

  let trLine = $state<TransitLine | null>(null);
  let trLineTargets = $state<string[]>([]);
  let trLineFound = $state<string[]>([]);
  let trLineWrong = $state<string[]>([]);
  let trLineStatus = $state<'playing' | 'won'>('playing');
  let trLineChoices = $state<KiezFeature[]>([]);

  // Mode 4: Neighbors
  let nbCenter = $state<KiezFeature | null>(null);
  let nbTargets = $state<KiezFeature[]>([]);
  let nbFoundIds = $state<string[]>([]);
  let nbWrongIds = $state<string[]>([]);
  let nbHearts = $state(3);
  let nbStatus = $state<'playing' | 'won' | 'lost'>('playing');
  let nbQuizIdx = $state(0);
  let nbQuizChoices = $state<KiezFeature[]>([]);

  // Derived active collection & lookup map
  const activeCollection = $derived.by(() => {
    if (!geodata) return null;
    return persisted.deck === 'ortsteile' ? geodata.ortsteile : geodata.kieze;
  });

  const featureMap = $derived.by(() => {
    const m = new Map<string, KiezFeature>();
    if (activeCollection) {
      for (const f of activeCollection.features) m.set(f.properties.id, f);
    }
    return m;
  });

  const filteredPool = $derived.by(() => {
    if (!activeCollection) return [];
    return getFilteredPool(activeCollection.features, persisted.bezirkFilter, persisted.deck);
  });

  const lineColorMap = $derived.by(() => {
    const m = new Map<string, { color: string; textColor: string }>();
    if (!geodata) return m;
    for (const l of geodata.transit.lines) {
      const key = l.isRing ? 'Ring' : l.name;
      m.set(key, { color: l.color, textColor: l.textColor });
    }
    return m;
  });

  // Save persisted state automatically
  $effect(() => {
    savePersistedState(persisted);
  });

  $effect(() => {
    document.documentElement.lang = persisted.lang;
  });

  onMount(() => {
    const unsubTheme = subscribeThemeChanges((resolved) => {
      theme = resolved;
    });

    loadGeodata()
      .then((data) => {
        geodata = data;
        startRoundForCurrentMode(true);
      })
      .catch((err) => {
        loadError = err instanceof Error ? err.message : 'Failed to load data';
      });

    return () => {
      unsubTheme();
    };
  });

  function refreshPathQuizChoices() {
    if (!activeCollection || !pfStart || !pfEnd) return;
    const frontierId = pfSelected.length > 0 ? pfSelected[pfSelected.length - 1] : pfStart.properties.id;
    const pathToEnd = findShortestPath(frontierId, pfEnd.properties.id, featureMap);
    const nextOptimalId = pathToEnd[1];
    const nextOptimal = nextOptimalId ? featureMap.get(nextOptimalId) : null;
    if (nextOptimal) {
      pfQuizChoices = pickDistractors(nextOptimal, activeCollection.features, 3);
    }
  }

  function refreshLineQuizChoices() {
    if (!activeCollection || !trLine) return;
    const remaining = trLineTargets.filter((id) => !trLineFound.includes(id));
    if (remaining.length === 0) {
      trLineChoices = [];
      return;
    }
    const nextTarget = featureMap.get(remaining[Math.floor(Math.random() * remaining.length)]);
    if (nextTarget) {
      trLineChoices = pickDistractors(nextTarget, activeCollection.features, 3);
    }
  }

  function refreshNeighborQuizChoices() {
    if (!activeCollection) return;
    const remaining = nbTargets.filter((f) => !nbFoundIds.includes(f.properties.id));
    if (remaining.length === 0) {
      nbQuizChoices = [];
      return;
    }
    const target = remaining[0];
    nbQuizIdx = nbTargets.findIndex((f) => f.properties.id === target.properties.id);
    nbQuizChoices = pickDistractors(target, activeCollection.features, 3);
  }

  function startRoundForCurrentMode(resetCamera = false) {
    if (!geodata || !activeCollection) return;
    const all = activeCollection.features;
    const pool = filteredPool;

    if (persisted.mode === 'pinpoint') {
      const { target, choices } = createPinpointRound(
        pool,
        all,
        persisted.mastery,
        ppTarget?.properties.id
      );
      ppTarget = target;
      ppChoices = choices;
      ppAttempts = [];
      ppShowHint = false;
      ppStatus = 'playing';

      if (persisted.reverseQuiz) {
        mapRef?.fitBoundsBbox(target.properties.bbox, 13.4);
      } else if (resetCamera) {
        mapRef?.resetOverview(persisted.deck === 'kieze');
      }
    } else if (persisted.mode === 'pathfinding') {
      const { start, end, optimalPath } = createPathfindingRound(pool, all, featureMap);
      pfStart = start;
      pfEnd = end;
      pfOptimal = optimalPath;
      pfSelected = [];
      pfHintId = null;
      pfStatus = 'playing';
      refreshPathQuizChoices();

      const cluster = optimalPath
        .map((id) => featureMap.get(id))
        .filter((f): f is KiezFeature => Boolean(f));
      if (cluster.length >= 2) {
        mapRef?.fitBoundsBbox(computeClusterBbox(cluster), 13.2);
      }
    } else if (persisted.mode === 'transit') {
      if (persisted.transitSubMode === 'station') {
        const { station, targetFeature, choices } = createStationRound(
          pool,
          all,
          featureMap,
          geodata.transit,
          persisted.deck,
          trStation?.id
        );
        trStation = station;
        trTargetFeature = targetFeature;
        trChoices = choices;
        trWrongIds = [];
        trStatus = 'playing';

        if (persisted.reverseQuiz) {
          mapRef?.fitBoundsBbox(targetFeature.properties.bbox, 13.5);
        } else if (resetCamera) {
          mapRef?.resetOverview(persisted.deck === 'kieze');
        }
      } else {
        const { line, targetIds } = createLineRound(geodata.transit, persisted.deck, trLine?.id);
        trLine = line;
        trLineTargets = targetIds;
        trLineFound = [];
        trLineWrong = [];
        trLineStatus = 'playing';
        refreshLineQuizChoices();

        const cluster = targetIds
          .map((id) => featureMap.get(id))
          .filter((f): f is KiezFeature => Boolean(f));
        if (cluster.length >= 2) {
          mapRef?.fitBoundsBbox(computeClusterBbox(cluster), 12.6);
        }
      }
    } else if (persisted.mode === 'neighbors') {
      const { center, neighborFeatures } = createNeighborsRound(
        pool,
        featureMap,
        persisted.mastery,
        nbCenter?.properties.id
      );
      nbCenter = center;
      nbTargets = neighborFeatures;
      nbFoundIds = [];
      nbWrongIds = [];
      nbHearts = 3;
      nbStatus = 'playing';
      refreshNeighborQuizChoices();

      mapRef?.fitBoundsBbox(computeClusterBbox([center, ...neighborFeatures]), 13.4);
    }
  }

  // Map click handler (inspects Kiez in Atlas view; plays when in Map Tap mode)
  function handleMapPolygonClick(id: string) {
    if (persisted.masteryColorMode) {
      const f = featureMap.get(id);
      if (f) {
        const lvl = persisted.mastery[id]?.level ?? 0;
        const lbl = t(persisted.lang, (`mastery${lvl}`) as 'mastery0' | 'mastery1' | 'mastery2' | 'mastery3');
        showToast(`${f.properties.name} (${f.properties.bezirk}) · ${lbl}`, 'info');
        triggerHaptic('tap');
      }
      return;
    }
    if (persisted.reverseQuiz) return;
    handleAnswer(id);
  }

  // Polygon selection handler (used by BOTH map taps and 4-choice buttons)
  function handleAnswer(id: string) {
    if (!geodata || !activeCollection) return;

    const tapped = featureMap.get(id);
    if (!tapped) return;

    if (persisted.mode === 'pinpoint' && ppTarget && ppStatus === 'playing') {
      const targetId = ppTarget.properties.id;
      if (ppAttempts.some((a) => a.id === id)) return;

      if (id === targetId) {
        ppStatus = 'won';
        triggerHaptic('success');
        const pts = Math.max(25, 100 - ppAttempts.length * 25);
        persisted = recordKiezOutcome(persisted, targetId, ppAttempts.length === 0);
        persisted = recordModeRound(persisted, 'pinpoint', pts, true);
        mapRef?.fitBoundsBbox(ppTarget.properties.bbox, 13.8);
      } else {
        const dist = distanceKm(tapped.properties.centroid, ppTarget.properties.centroid);
        const arrow = bearingArrow(tapped.properties.centroid, ppTarget.properties.centroid, persisted.lang);
        const heat = dist <= 2.2 ? 'hot' : dist <= 5.5 ? 'warm' : 'wrong';
        ppAttempts = [
          ...ppAttempts,
          { id, name: tapped.properties.name, distKm: Math.round(dist * 10) / 10, arrow, heat }
        ];
        triggerHaptic('error');

        if (ppAttempts.length >= 3) {
          ppStatus = 'lost';
          persisted = recordKiezOutcome(persisted, targetId, false);
          persisted = recordModeRound(persisted, 'pinpoint', 0, false);
          mapRef?.fitBoundsBbox(ppTarget.properties.bbox, 13.6);
        }
      }
    } else if (persisted.mode === 'pathfinding' && pfStart && pfEnd && pfStatus === 'playing') {
      const startId = pfStart.properties.id;
      const endId = pfEnd.properties.id;
      if (id === startId || id === endId) return;

      // Allow tapping an existing step to undo it
      if (pfSelected.includes(id)) {
        const idx = pfSelected.indexOf(id);
        pfSelected = pfSelected.slice(0, idx);
        triggerHaptic('tap');
        refreshPathQuizChoices();
        return;
      }

      const activeClusterIds = new Set([startId, ...pfSelected]);
      const bordersFrontier = tapped.properties.neighbors.some((nid) => activeClusterIds.has(nid));

      if (!bordersFrontier) {
        triggerHaptic('error');
        showToast(t(persisted.lang, 'pathNotNeighbor', { name: tapped.properties.name }), 'error');
        return;
      }

      const nextSelected = [...pfSelected, id];
      pfSelected = nextSelected;
      pfHintId = null;
      triggerHaptic('tap');

      if (isPathConnected(startId, endId, new Set(nextSelected), featureMap)) {
        pfStatus = 'won';
        triggerHaptic('success');
        const optimalIntermediates = Math.max(1, pfOptimal.length - 2);
        const diff = Math.max(0, nextSelected.length - optimalIntermediates);
        const pts = Math.max(40, 120 - diff * 20);
        persisted = recordKiezOutcome(persisted, startId, diff <= 1);
        persisted = recordKiezOutcome(persisted, endId, diff <= 1);
        persisted = recordModeRound(persisted, 'pathfinding', pts, true);
      } else {
        refreshPathQuizChoices();
      }
    } else if (persisted.mode === 'transit') {
      if (persisted.transitSubMode === 'station' && trStation && trTargetFeature && trStatus === 'playing') {
        if (trWrongIds.includes(id)) return;
        const targetId = trTargetFeature.properties.id;
        if (id === targetId) {
          trStatus = 'won';
          triggerHaptic('success');
          const pts = trWrongIds.length === 0 ? 100 : 60;
          persisted = recordKiezOutcome(persisted, targetId, trWrongIds.length === 0);
          persisted = recordModeRound(persisted, 'transit', pts, true);
          mapRef?.fitBoundsBbox(trTargetFeature.properties.bbox, 13.8);
        } else {
          trWrongIds = [...trWrongIds, id];
          triggerHaptic('error');
          if (trWrongIds.length >= 3) {
            trStatus = 'lost';
            persisted = recordKiezOutcome(persisted, targetId, false);
            persisted = recordModeRound(persisted, 'transit', 0, false);
            mapRef?.fitBoundsBbox(trTargetFeature.properties.bbox, 13.6);
          }
        }
      } else if (persisted.transitSubMode === 'line' && trLine && trLineStatus === 'playing') {
        if (trLineFound.includes(id) || trLineWrong.includes(id)) return;
        if (trLineTargets.includes(id)) {
          trLineFound = [...trLineFound, id];
          triggerHaptic('tap');
          persisted = recordKiezOutcome(persisted, id, true);

          if (trLineFound.length >= trLineTargets.length) {
            trLineStatus = 'won';
            triggerHaptic('success');
            const pts = Math.max(50, trLineTargets.length * 15 - trLineWrong.length * 10);
            persisted = recordModeRound(persisted, 'transit', pts, trLineWrong.length <= 2);
          } else {
            refreshLineQuizChoices();
          }
        } else {
          trLineWrong = [...trLineWrong, id];
          triggerHaptic('error');
          showToast(
            t(persisted.lang, 'lineWrong', { name: tapped.properties.name, line: trLine.name }),
            'error'
          );
        }
      }
    } else if (persisted.mode === 'neighbors' && nbCenter && nbStatus === 'playing') {
      if (id === nbCenter.properties.id) return;
      if (nbFoundIds.includes(id) || nbWrongIds.includes(id)) return;

      const isNeighbor = nbTargets.some((f) => f.properties.id === id);
      if (isNeighbor) {
        if (persisted.reverseQuiz) {
          const expectedId = nbTargets[nbQuizIdx]?.properties.id;
          if (id !== expectedId) {
            nbHearts = Math.max(0, nbHearts - 1);
            triggerHaptic('error');
            if (nbHearts === 0) {
              nbStatus = 'lost';
              persisted = recordKiezOutcome(persisted, nbCenter.properties.id, false);
              persisted = recordModeRound(persisted, 'neighbors', 0, false);
            }
            return;
          }
        }
        nbFoundIds = [...nbFoundIds, id];
        triggerHaptic('tap');
        persisted = recordKiezOutcome(persisted, id, true);

        if (nbFoundIds.length >= nbTargets.length) {
          nbStatus = 'won';
          triggerHaptic('success');
          const pts = 60 + nbHearts * 20;
          persisted = recordKiezOutcome(persisted, nbCenter.properties.id, nbHearts === 3);
          persisted = recordModeRound(persisted, 'neighbors', pts, true);
        } else {
          refreshNeighborQuizChoices();
        }
      } else {
        nbWrongIds = [...nbWrongIds, id];
        nbHearts = Math.max(0, nbHearts - 1);
        triggerHaptic('error');
        showToast(
          t(persisted.lang, 'neighborsNotBordering', {
            name: tapped.properties.name,
            center: nbCenter.properties.name
          }),
          'error'
        );

        if (nbHearts === 0) {
          nbStatus = 'lost';
          persisted = recordKiezOutcome(persisted, nbCenter.properties.id, false);
          persisted = recordModeRound(persisted, 'neighbors', 0, false);
        }
      }
    }
  }

  // Compute dynamic GPU feature states for MapLibre
  const polygonStates = $derived.by(() => {
    const states: Record<string, MapPolygonVisualState> = {};
    if (!activeCollection) return states;

    const poolIds = new Set(filteredPool.map((f) => f.properties.id));

    if (persisted.masteryColorMode) {
      for (const f of activeCollection.features) {
        const id = f.properties.id;
        if (!poolIds.has(id)) {
          states[id] = 'filtered-out';
          continue;
        }
        const lvl = persisted.mastery[id]?.level ?? 0;
        states[id] = (`mastery-${lvl}`) as MapPolygonVisualState;
      }
      return states;
    }

    for (const f of activeCollection.features) {
      if (!poolIds.has(f.properties.id)) {
        states[f.properties.id] = 'filtered-out';
      }
    }

    if (persisted.mode === 'pinpoint' && ppTarget) {
      for (const a of ppAttempts) {
        states[a.id] = a.heat;
      }
      if (ppStatus === 'won') {
        states[ppTarget.properties.id] = 'correct';
      } else if (ppStatus === 'lost' || (ppStatus === 'playing' && persisted.reverseQuiz)) {
        states[ppTarget.properties.id] = 'target';
      }
    } else if (persisted.mode === 'pathfinding' && pfStart && pfEnd) {
      for (const id of pfSelected) states[id] = 'path';
      if (pfHintId) states[pfHintId] = 'hint';
      states[pfStart.properties.id] = 'start';
      states[pfEnd.properties.id] = 'end';
    } else if (persisted.mode === 'transit') {
      if (persisted.transitSubMode === 'station' && trTargetFeature) {
        for (const wid of trWrongIds) states[wid] = 'wrong';
        if (trStatus === 'won') {
          states[trTargetFeature.properties.id] = 'correct';
        } else if (trStatus === 'lost' || (trStatus === 'playing' && persisted.reverseQuiz)) {
          states[trTargetFeature.properties.id] = 'target';
        }
      } else if (persisted.transitSubMode === 'line') {
        for (const wid of trLineWrong) states[wid] = 'wrong';
        for (const fid of trLineFound) states[fid] = 'correct';
      }
    } else if (persisted.mode === 'neighbors' && nbCenter) {
      for (const wid of nbWrongIds) states[wid] = 'wrong';
      for (const fid of nbFoundIds) states[fid] = 'neighbor-found';
      if (nbStatus === 'lost') {
        for (const nf of nbTargets) {
          if (!nbFoundIds.includes(nf.properties.id)) {
            states[nf.properties.id] = 'target';
          }
        }
      } else if (nbStatus === 'playing' && persisted.reverseQuiz && nbTargets[nbQuizIdx]) {
        states[nbTargets[nbQuizIdx].properties.id] = 'target';
      }
      states[nbCenter.properties.id] = 'neighbor-center';
    }

    return states;
  });

  // Pulsing marker coordinates (Station Spotter reverse quiz or reveal)
  const pulsingCoords = $derived.by((): [number, number] | null => {
    if (persisted.masteryColorMode) return null;
    if (persisted.mode === 'transit' && persisted.transitSubMode === 'station' && trStation) {
      if (persisted.reverseQuiz || trStatus !== 'playing') {
        return trStation.coords;
      }
    }
    return null;
  });

  // Floating pill badges on the map
  const mapBadges = $derived.by(() => {
    const out: Array<{
      id: string;
      coords: [number, number];
      text: string;
      kind: 'start' | 'end' | 'center' | 'reveal';
    }> = [];
    if (persisted.masteryColorMode) return out;

    if (persisted.mode === 'pinpoint' && ppTarget && ppStatus !== 'playing') {
      out.push({
        id: 'pp-reveal',
        coords: ppTarget.properties.centroid,
        text: ppTarget.properties.name,
        kind: ppStatus === 'won' ? 'reveal' : 'center'
      });
    } else if (persisted.mode === 'pathfinding' && pfStart && pfEnd) {
      out.push({
        id: 'pf-start',
        coords: pfStart.properties.centroid,
        text: `${t(persisted.lang, 'pathStart')}: ${pfStart.properties.name}`,
        kind: 'start'
      });
      out.push({
        id: 'pf-end',
        coords: pfEnd.properties.centroid,
        text: `${t(persisted.lang, 'pathEnd')}: ${pfEnd.properties.name}`,
        kind: 'end'
      });
    } else if (
      persisted.mode === 'transit' &&
      persisted.transitSubMode === 'station' &&
      trTargetFeature &&
      trStatus !== 'playing'
    ) {
      out.push({
        id: 'tr-reveal',
        coords: trTargetFeature.properties.centroid,
        text: trTargetFeature.properties.name,
        kind: 'reveal'
      });
    } else if (persisted.mode === 'neighbors' && nbCenter) {
      out.push({
        id: 'nb-center',
        coords: nbCenter.properties.centroid,
        text: nbCenter.properties.name,
        kind: 'center'
      });
      if (persisted.reverseQuiz && nbStatus === 'playing' && nbTargets[nbQuizIdx]) {
        out.push({
          id: 'nb-quiz',
          coords: nbTargets[nbQuizIdx].properties.centroid,
          text: '?',
          kind: 'start'
        });
      }
    }
    return out;
  });

  // Active single transit line filter for Line Runner victory or overlay
  const activeLineFilter = $derived.by(() => {
    if (persisted.mode === 'transit' && persisted.transitSubMode === 'line' && trLine) {
      if (trLineStatus === 'won') return trLine.name;
    }
    return null;
  });

  function switchDeck(deck: DeckType) {
    if (persisted.deck === deck) return;
    triggerHaptic('tap');
    persisted = {
      ...persisted,
      deck,
      bezirkFilter: 'all',
      masteryColorMode: false
    };
    setTimeout(() => startRoundForCurrentMode(true), 20);
  }

  function switchMode(mode: GameMode) {
    if (persisted.mode === mode) return;
    triggerHaptic('tap');
    persisted = { ...persisted, mode, masteryColorMode: false };
    setTimeout(() => startRoundForCurrentMode(true), 20);
  }

  function toggleReverseQuiz() {
    triggerHaptic('tap');
    persisted = { ...persisted, reverseQuiz: !persisted.reverseQuiz };
    setTimeout(() => startRoundForCurrentMode(false), 20);
  }

  function toggleTheme() {
    triggerHaptic('tap');
    theme = toggleColorScheme();
  }

  function toggleLang() {
    triggerHaptic('tap');
    persisted = { ...persisted, lang: persisted.lang === 'de' ? 'en' : 'de' };
  }

  function givePathHint() {
    if (!pfStart || !pfEnd || pfStatus !== 'playing') return;
    const frontierId = pfSelected.length > 0 ? pfSelected[pfSelected.length - 1] : pfStart.properties.id;
    const path = findShortestPath(frontierId, pfEnd.properties.id, featureMap);
    if (path.length >= 2 && path[1] !== pfEnd.properties.id) {
      pfHintId = path[1];
      triggerHaptic('tap');
    } else if (path.length === 2) {
      showToast(pfEnd.properties.name, 'success');
    }
  }

  function undoPathStep() {
    if (pfSelected.length === 0 || pfStatus !== 'playing') return;
    pfSelected = pfSelected.slice(0, -1);
    triggerHaptic('tap');
    refreshPathQuizChoices();
  }

  function selectFilter(filter: string) {
    persisted = { ...persisted, bezirkFilter: filter };
    setTimeout(() => startRoundForCurrentMode(true), 20);
  }

  function resetAllProgress() {
    const fresh = createInitialState();
    persisted = {
      ...fresh,
      lang: persisted.lang,
      deck: persisted.deck,
      mode: persisted.mode,
      showTransit: persisted.showTransit
    };
    startRoundForCurrentMode(true);
  }

  // Current round completion fact feature
  const revealedFactFeature = $derived.by(() => {
    if (persisted.mode === 'pinpoint' && ppStatus !== 'playing') return ppTarget;
    if (
      persisted.mode === 'transit' &&
      persisted.transitSubMode === 'station' &&
      trStatus !== 'playing'
    ) {
      return trTargetFeature;
    }
    if (persisted.mode === 'neighbors' && nbStatus !== 'playing') return nbCenter;
    return null;
  });
</script>

<main class="app-shell">
  {#if geodata && activeCollection}
    <MapView
      bind:this={mapRef}
      collection={activeCollection}
      context={geodata.context}
      transit={geodata.transit}
      {theme}
      showTransit={persisted.showTransit || (persisted.mode === 'transit' && persisted.transitSubMode === 'station' && trStatus !== 'playing')}
      activeLineName={activeLineFilter}
      {polygonStates}
      {pulsingCoords}
      badges={mapBadges}
      onPolygonClick={handleMapPolygonClick}
    />
  {:else}
    <div class="loading-screen">
      {#if loadError}
        <p class="error-text">{t(persisted.lang, 'errorData')} ({loadError})</p>
      {:else}
        <div class="spinner"></div>
        <p>{t(persisted.lang, 'loadingData')}</p>
      {/if}
    </div>
  {/if}

  <!-- Top Floating Header -->
  <header class="top-hud">
    <div class="top-row">
      <div class="brand-group">
        <span class="brand-logo" aria-hidden="true">🚇</span>
        <strong class="brand-name">{t(persisted.lang, 'appName')}</strong>
        <div class="deck-pill" role="group" aria-label="Map layer">
          <button
            type="button"
            class="deck-btn"
            class:active={persisted.deck === 'ortsteile'}
            onclick={() => switchDeck('ortsteile')}
          >
            {t(persisted.lang, 'deckOrtsteile')}
          </button>
          <button
            type="button"
            class="deck-btn"
            class:active={persisted.deck === 'kieze'}
            onclick={() => switchDeck('kieze')}
          >
            {t(persisted.lang, 'deckKieze')}
          </button>
        </div>
      </div>

      <div class="quick-actions">
        <button
          type="button"
          class="hud-icon-btn"
          class:active={persisted.showTransit}
          onclick={() => (persisted = { ...persisted, showTransit: !persisted.showTransit })}
          title={t(persisted.lang, 'toggleTransit')}
          aria-label={t(persisted.lang, 'toggleTransit')}
        >
          🚇
        </button>

        <button
          type="button"
          class="hud-icon-btn quiz-toggle"
          class:active={persisted.reverseQuiz}
          onclick={toggleReverseQuiz}
          title={persisted.reverseQuiz ? t(persisted.lang, 'reverseQuizMode') : t(persisted.lang, 'mapTapMode')}
          aria-label={persisted.reverseQuiz ? t(persisted.lang, 'reverseQuizMode') : t(persisted.lang, 'mapTapMode')}
        >
          {persisted.reverseQuiz ? '🔤' : '🎯'}
        </button>

        <button
          type="button"
          class="hud-icon-btn"
          class:active={persisted.masteryColorMode}
          onclick={() => atlasRef?.open()}
          title={t(persisted.lang, 'toggleAtlas')}
          aria-label={t(persisted.lang, 'toggleAtlas')}
        >
          🗺️
        </button>

        <button
          type="button"
          class="hud-icon-btn lang-btn"
          onclick={toggleLang}
          title={t(persisted.lang, 'toggleLang')}
          aria-label={t(persisted.lang, 'toggleLang')}
        >
          {persisted.lang.toUpperCase()}
        </button>

        <button
          type="button"
          class="hud-icon-btn"
          onclick={toggleTheme}
          title={t(persisted.lang, 'toggleTheme')}
          aria-label={t(persisted.lang, 'toggleTheme')}
        >
          <span class="theme-icon-dark" aria-hidden="true">🌙</span>
          <span class="theme-icon-light" aria-hidden="true">☀️</span>
          <span class="sr-only">{t(persisted.lang, 'toggleTheme')}</span>
        </button>
      </div>
    </div>

    <!-- Mode Switcher Tabs -->
    <nav class="mode-bar" aria-label="Game Modes">
      <button
        type="button"
        class="mode-tab"
        class:active={persisted.mode === 'pinpoint'}
        onclick={() => switchMode('pinpoint')}
      >
        📍 {t(persisted.lang, 'modePinpoint')}
      </button>
      <button
        type="button"
        class="mode-tab"
        class:active={persisted.mode === 'pathfinding'}
        onclick={() => switchMode('pathfinding')}
      >
        🔗 {t(persisted.lang, 'modePathfinding')}
      </button>
      <button
        type="button"
        class="mode-tab"
        class:active={persisted.mode === 'transit'}
        onclick={() => switchMode('transit')}
      >
        🚇 {t(persisted.lang, 'modeTransit')}
      </button>
      <button
        type="button"
        class="mode-tab"
        class:active={persisted.mode === 'neighbors'}
        onclick={() => switchMode('neighbors')}
      >
        🧭 {t(persisted.lang, 'modeNeighbors')}
      </button>
    </nav>
  </header>

  <!-- Toast Banner -->
  {#if toastMessage}
    <div class="toast-banner kind-{toastKind}" role="status" aria-live="polite">
      {toastMessage}
    </div>
  {/if}

  <!-- Atlas Mode Exit Banner -->
  {#if persisted.masteryColorMode}
    <section class="bottom-sheet">
      <div class="atlas-banner">
        <div class="atlas-banner-text">
          <strong>🗺️ {t(persisted.lang, 'atlasColorMapActive')}</strong>
          <span>
            <i class="mini-dot l3"></i> {t(persisted.lang, 'mastery3')} ·
            <i class="mini-dot l2"></i> {t(persisted.lang, 'mastery2')} ·
            <i class="mini-dot l1"></i> {t(persisted.lang, 'mastery1')}
          </span>
        </div>
        <button
          type="button"
          class="primary-btn tap-target"
          onclick={() => (persisted = { ...persisted, masteryColorMode: false })}
        >
          {t(persisted.lang, 'atlasClose')}
        </button>
      </div>
    </section>
  {:else if geodata}
    <!-- Main Thumb-Zone Bottom Sheet HUD -->
    <section class="bottom-sheet">
      <!-- Score & Streak Header inside Bottom Sheet -->
      <div class="hud-meta">
        <div class="meta-pills">
          <span class="meta-pill">🔥 {persisted.stats[persisted.mode].streak}</span>
          <span class="meta-pill">⭐ {persisted.stats[persisted.mode].score}</span>
          {#if persisted.bezirkFilter !== 'all'}
            <span class="meta-pill accent-pill">
              {persisted.bezirkFilter === 'ring' ? t(persisted.lang, 'filterRing') : persisted.bezirkFilter}
            </span>
          {/if}
        </div>
        <button
          type="button"
          class="quiz-badge-btn"
          onclick={toggleReverseQuiz}
        >
          {persisted.reverseQuiz ? `🔤 ${t(persisted.lang, 'reverseQuizMode')}` : `🎯 ${t(persisted.lang, 'mapTapMode')}`}
        </button>
      </div>

      <!-- MODE 1: PINPOINT -->
      {#if persisted.mode === 'pinpoint' && ppTarget}
        <div class="mode-content">
          {#if ppStatus === 'playing'}
            {#if !persisted.reverseQuiz}
              <div class="prompt-header">
                <div>
                  <span class="prompt-eyebrow">{t(persisted.lang, 'pinpointPrompt')}</span>
                  <h1 class="target-title">{ppTarget.properties.name}</h1>
                  {#if ppTarget.properties.officialName && ppTarget.properties.officialName !== ppTarget.properties.name}
                    <span class="sub-official">({ppTarget.properties.officialName})</span>
                  {/if}
                </div>
                <button
                  type="button"
                  class="secondary-btn tap-target"
                  onclick={() => (ppShowHint = !ppShowHint)}
                >
                  💡 {t(persisted.lang, 'hintBtn')}
                </button>
              </div>

              {#if ppShowHint}
                <div class="hint-strip">
                  <span>{t(persisted.lang, 'hintBezirk')}: <strong>{ppTarget.properties.bezirk}</strong></span>
                  {#if ppTarget.properties.stations && ppTarget.properties.stations.length > 0}
                    <span>· {ppTarget.properties.stations.slice(0, 2).join(', ')}</span>
                  {/if}
                </div>
              {/if}
            {:else}
              <div class="prompt-header">
                <div>
                  <span class="prompt-eyebrow">{t(persisted.lang, 'pinpointReversePrompt')}</span>
                </div>
                <span class="tries-badge">{3 - ppAttempts.length} {t(persisted.lang, 'attemptsLeft')}</span>
              </div>
              <div class="choice-grid">
                {#each ppChoices as ch}
                  {@const tried = ppAttempts.find((a) => a.id === ch.properties.id)}
                  <button
                    type="button"
                    class="choice-btn tap-target"
                    class:wrong={Boolean(tried)}
                    disabled={Boolean(tried)}
                    onclick={() => handleAnswer(ch.properties.id)}
                  >
                    <span class="choice-name">{ch.properties.name}</span>
                    <span class="choice-sub">{ch.properties.bezirk}</span>
                  </button>
                {/each}
              </div>
            {/if}

            {#if ppAttempts.length > 0 && !persisted.reverseQuiz}
              <div class="attempt-row">
                {#each ppAttempts as att}
                  <span class="attempt-chip heat-{att.heat}">
                    {att.name}: {att.distKm} km {att.arrow}
                  </span>
                {/each}
              </div>
            {/if}
          {:else}
            <div class="result-banner" class:won={ppStatus === 'won'} class:lost={ppStatus === 'lost'}>
              <div>
                <strong>
                  {#if ppStatus === 'won'}
                    {ppAttempts.length === 0
                      ? t(persisted.lang, 'directHit')
                      : t(persisted.lang, 'foundInTries', { n: ppAttempts.length + 1 })}
                  {:else}
                    {t(persisted.lang, 'missedReveal', { name: ppTarget.properties.name })}
                  {/if}
                </strong>
                {#if revealedFactFeature}
                  <p class="fact-line">
                    {t(persisted.lang, 'bezirkLabel')}: {revealedFactFeature.properties.bezirk}
                    {#if revealedFactFeature.properties.stations && revealedFactFeature.properties.stations.length > 0}
                      · 🚇 {revealedFactFeature.properties.stations.slice(0, 3).join(', ')}
                    {/if}
                  </p>
                {/if}
              </div>
              <button
                type="button"
                class="primary-btn tap-target"
                onclick={() => startRoundForCurrentMode(false)}
              >
                {t(persisted.lang, 'nextRound')}
              </button>
            </div>
          {/if}
        </div>

      <!-- MODE 2: KIEZ-HOPPING (PATHFINDING) -->
      {:else if persisted.mode === 'pathfinding' && pfStart && pfEnd}
        <div class="mode-content">
          <div class="path-header">
            <div class="route-endpoints">
              <span class="ep start">{pfStart.properties.name}</span>
              <span class="arrow">➔</span>
              <span class="ep end">{pfEnd.properties.name}</span>
            </div>
            <span class="par-badge">
              {t(persisted.lang, 'pathSteps')}: {pfSelected.length} / {t(persisted.lang, 'pathOptimal')}: {Math.max(1, pfOptimal.length - 2)}
            </span>
          </div>

          {#if pfStatus === 'playing'}
            <p class="sub-instruction">
              {persisted.reverseQuiz ? t(persisted.lang, 'pathReversePrompt') : t(persisted.lang, 'pathPrompt')}
            </p>

            {#if persisted.reverseQuiz}
              <div class="choice-grid">
                {#each pfQuizChoices as ch}
                  <button
                    type="button"
                    class="choice-btn tap-target"
                    onclick={() => handleAnswer(ch.properties.id)}
                  >
                    <span class="choice-name">{ch.properties.name}</span>
                    <span class="choice-sub">{ch.properties.bezirk}</span>
                  </button>
                {/each}
              </div>
            {:else if pfSelected.length > 0}
              <div class="attempt-row">
                {#each pfSelected as sid}
                  <button type="button" class="path-chip" onclick={() => handleAnswer(sid)}>
                    {featureMap.get(sid)?.properties.name} ✕
                  </button>
                {/each}
              </div>
            {/if}

            <div class="btn-row">
              <button
                type="button"
                class="secondary-btn tap-target"
                disabled={pfSelected.length === 0}
                onclick={undoPathStep}
              >
                ↩ {t(persisted.lang, 'pathUndo')}
              </button>
              <button type="button" class="secondary-btn tap-target" onclick={givePathHint}>
                💡 {t(persisted.lang, 'hintBtn')}
              </button>
              <button
                type="button"
                class="secondary-btn tap-target"
                onclick={() => startRoundForCurrentMode(false)}
              >
                ⏭
              </button>
            </div>
          {:else}
            {@const optimalInter = Math.max(1, pfOptimal.length - 2)}
            {@const detour = Math.max(0, pfSelected.length - optimalInter)}
            <div class="result-banner won">
              <div>
                <strong>
                  {detour === 0 ? t(persisted.lang, 'pathPar') : t(persisted.lang, 'pathGood', { n: detour })}
                </strong>
                <p class="fact-line">
                  {pfOptimal.map((id) => featureMap.get(id)?.properties.name).filter(Boolean).join(' → ')}
                </p>
              </div>
              <button
                type="button"
                class="primary-btn tap-target"
                onclick={() => startRoundForCurrentMode(false)}
              >
                {t(persisted.lang, 'pathNext')}
              </button>
            </div>
          {/if}
        </div>

      <!-- MODE 3: UMSTEIGEN (TRANSIT) -->
      {:else if persisted.mode === 'transit'}
        <div class="mode-content">
          <div class="submode-tabs">
            <button
              type="button"
              class="subtab"
              class:active={persisted.transitSubMode === 'station'}
              onclick={() => {
                persisted = { ...persisted, transitSubMode: 'station' };
                startRoundForCurrentMode(true);
              }}
            >
              🚉 {t(persisted.lang, 'transitSubStation')}
            </button>
            <button
              type="button"
              class="subtab"
              class:active={persisted.transitSubMode === 'line'}
              onclick={() => {
                persisted = { ...persisted, transitSubMode: 'line' };
                startRoundForCurrentMode(true);
              }}
            >
              🚆 {t(persisted.lang, 'transitSubLine')}
            </button>
          </div>

          {#if persisted.transitSubMode === 'station' && trStation && trTargetFeature}
            {#if trStatus === 'playing'}
              <div class="station-prompt-box">
                <div class="line-badges">
                  {#each trStation.lines as lineName}
                    {@const style = lineColorMap.get(lineName) ?? { color: '#334155', textColor: '#fff' }}
                    <span class="vbb-badge" style:background={style.color} style:color={style.textColor}>
                      {lineName}
                    </span>
                  {/each}
                </div>
                <h1 class="target-title">{trStation.name}</h1>
                <span class="prompt-eyebrow">
                  {persisted.reverseQuiz ? t(persisted.lang, 'stationReversePrompt') : t(persisted.lang, 'stationPrompt')}
                </span>
              </div>

              {#if persisted.reverseQuiz}
                <div class="choice-grid">
                  {#each trChoices as ch}
                    {@const isWrong = trWrongIds.includes(ch.properties.id)}
                    <button
                      type="button"
                      class="choice-btn tap-target"
                      class:wrong={isWrong}
                      disabled={isWrong}
                      onclick={() => handleAnswer(ch.properties.id)}
                    >
                      <span class="choice-name">{ch.properties.name}</span>
                      <span class="choice-sub">{ch.properties.bezirk}</span>
                    </button>
                  {/each}
                </div>
              {:else if trWrongIds.length > 0}
                <div class="attempt-row">
                  {#each trWrongIds as wid}
                    <span class="attempt-chip heat-wrong">
                      ✕ {featureMap.get(wid)?.properties.name}
                    </span>
                  {/each}
                </div>
              {/if}
            {:else}
              <div class="result-banner" class:won={trStatus === 'won'} class:lost={trStatus === 'lost'}>
                <div>
                  <strong>
                    {trStatus === 'won'
                      ? t(persisted.lang, 'stationCorrect', {
                          station: trStation.name,
                          name: trTargetFeature.properties.name
                        })
                      : t(persisted.lang, 'missedReveal', { name: trTargetFeature.properties.name })}
                  </strong>
                  <p class="fact-line">
                    {t(persisted.lang, 'bezirkLabel')}: {trTargetFeature.properties.bezirk}
                  </p>
                </div>
                <button
                  type="button"
                  class="primary-btn tap-target"
                  onclick={() => startRoundForCurrentMode(false)}
                >
                  {t(persisted.lang, 'nextRound')}
                </button>
              </div>
            {/if}
          {:else if persisted.transitSubMode === 'line' && trLine}
            <div class="line-runner-header">
              <span
                class="vbb-badge lg"
                style:background={trLine.color}
                style:color={trLine.textColor}
              >
                {trLine.name}
              </span>
              <span class="line-progress">
                {trLineFound.length} / {trLineTargets.length} {t(persisted.lang, 'lineFound')}
              </span>
            </div>

            {#if trLineStatus === 'playing'}
              <p class="sub-instruction">
                {persisted.reverseQuiz
                  ? t(persisted.lang, 'lineReversePrompt', { line: trLine.name })
                  : t(persisted.lang, 'linePrompt', {
                      total: trLineTargets.length,
                      line: trLine.name
                    })}
              </p>

              {#if persisted.reverseQuiz}
                <div class="choice-grid">
                  {#each trLineChoices as ch}
                    {@const isFound = trLineFound.includes(ch.properties.id)}
                    {@const isWrong = trLineWrong.includes(ch.properties.id)}
                    <button
                      type="button"
                      class="choice-btn tap-target"
                      class:wrong={isWrong}
                      disabled={isFound || isWrong}
                      onclick={() => handleAnswer(ch.properties.id)}
                    >
                      <span class="choice-name">{ch.properties.name}</span>
                      <span class="choice-sub">{ch.properties.bezirk}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            {:else}
              <div class="result-banner won">
                <strong>{t(persisted.lang, 'lineComplete', { line: trLine.name })}</strong>
                <button
                  type="button"
                  class="primary-btn tap-target"
                  onclick={() => startRoundForCurrentMode(false)}
                >
                  {t(persisted.lang, 'nextRound')}
                </button>
              </div>
            {/if}
          {/if}
        </div>

      <!-- MODE 4: NEIGHBORS -->
      {:else if persisted.mode === 'neighbors' && nbCenter}
        <div class="mode-content">
          {#if nbStatus === 'playing'}
            <div class="prompt-header">
              <div>
                <span class="prompt-eyebrow">
                  {persisted.reverseQuiz
                    ? t(persisted.lang, 'neighborsReversePrompt', { center: nbCenter.properties.name })
                    : t(persisted.lang, 'neighborsPrompt', { total: nbTargets.length })}
                </span>
                {#if !persisted.reverseQuiz}
                  <h1 class="target-title">{nbCenter.properties.name}</h1>
                {/if}
              </div>
              <div class="hearts-box">
                <span>{'❤️'.repeat(nbHearts)}{'🖤'.repeat(3 - nbHearts)}</span>
                <span class="nb-count">{nbFoundIds.length}/{nbTargets.length}</span>
              </div>
            </div>

            {#if persisted.reverseQuiz}
              <div class="choice-grid">
                {#each nbQuizChoices as ch}
                  <button
                    type="button"
                    class="choice-btn tap-target"
                    onclick={() => handleAnswer(ch.properties.id)}
                  >
                    <span class="choice-name">{ch.properties.name}</span>
                    <span class="choice-sub">{ch.properties.bezirk}</span>
                  </button>
                {/each}
              </div>
            {:else if nbFoundIds.length > 0}
              <div class="attempt-row">
                {#each nbFoundIds as fid}
                  <span class="attempt-chip found">✓ {featureMap.get(fid)?.properties.name}</span>
                {/each}
              </div>
            {/if}
          {:else}
            <div class="result-banner" class:won={nbStatus === 'won'} class:lost={nbStatus === 'lost'}>
              <div>
                <strong>
                  {nbStatus === 'won'
                    ? t(persisted.lang, 'neighborsComplete')
                    : t(persisted.lang, 'neighborsFailed')}
                </strong>
                <p class="fact-line">
                  {nbTargets.map((f) => f.properties.name).join(' · ')}
                </p>
              </div>
              <button
                type="button"
                class="primary-btn tap-target"
                onclick={() => startRoundForCurrentMode(false)}
              >
                {t(persisted.lang, 'nextRound')}
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </section>
  {/if}

  {#if geodata && activeCollection}
    <AtlasDialog
      bind:this={atlasRef}
      lang={persisted.lang}
      deck={persisted.deck}
      features={activeCollection.features}
      stateData={persisted}
      onSelectFilter={selectFilter}
      onToggleMasteryMap={() =>
        (persisted = { ...persisted, masteryColorMode: !persisted.masteryColorMode })}
      onResetProgress={resetAllProgress}
      onResetCamera={() => mapRef?.resetOverview(persisted.deck === 'kieze')}
    />
  {/if}
</main>

<style>
  .app-shell {
    position: relative;
    inline-size: 100%;
    block-size: 100dvh;
    overflow: clip;
  }

  .loading-screen {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 12px;
    background: var(--bg-page);
    color: var(--text-primary);
  }

  .spinner {
    inline-size: 36px;
    block-size: 36px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 999px;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-text {
    color: var(--danger);
    font-weight: 700;
    padding-inline: 24px;
    text-align: center;
  }

  /* Top Floating HUD */
  .top-hud {
    position: absolute;
    inset-block-start: calc(env(safe-area-inset-top, 0px) + 8px);
    inset-inline: 10px;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 6px;
    pointer-events: none;
  }

  .top-row,
  .mode-bar {
    pointer-events: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    backdrop-filter: blur(14px);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
  }

  .top-row {
    border-radius: 16px;
    padding: 4px 6px;
    display: flex;
    align-items: safe center;
    justify-content: space-between;
    gap: 6px;
  }

  .brand-group {
    display: flex;
    align-items: safe center;
    gap: 6px;
    min-inline-size: 0;
  }

  .brand-logo {
    font-size: 1.1rem;
    padding-inline-start: 4px;
  }

  .brand-name {
    font-size: 0.92rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    display: none;
  }

  @media (min-width: 520px) {
    .brand-name {
      display: inline;
    }
  }

  .deck-pill {
    display: flex;
    background: var(--surface-elevated);
    border-radius: 12px;
    padding: 2px;
    gap: 2px;
  }

  .deck-btn {
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.76rem;
    font-weight: 700;
    padding: 0 10px;
    min-block-size: 40px;
    border-radius: 10px;
    cursor: pointer;
    white-space: nowrap;
  }

  .deck-btn.active {
    background: var(--accent);
    color: var(--accent-text);
  }

  .quick-actions {
    display: flex;
    align-items: safe center;
    gap: 2px;
  }

  .hud-icon-btn {
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-primary);
    min-inline-size: 42px;
    min-block-size: 42px;
    border-radius: 12px;
    font-size: 1rem;
    font-weight: 800;
    cursor: pointer;
    display: inline-grid;
    place-items: center;
  }

  .hud-icon-btn.active {
    background: var(--surface-elevated);
    border-color: var(--accent);
  }

  .lang-btn {
    font-size: 0.74rem;
    letter-spacing: 0.03em;
  }

  .mode-bar {
    border-radius: 14px;
    padding: 3px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 3px;
  }

  .mode-tab {
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 700;
    min-block-size: 44px;
    border-radius: 11px;
    cursor: pointer;
    padding: 4px 2px;
    white-space: nowrap;
    overflow: clip;
    text-overflow: ellipsis;
  }

  .mode-tab.active {
    background: var(--surface-elevated);
    color: var(--text-primary);
    box-shadow: inset 0 0 0 1px var(--border);
  }

  /* Toast Banner */
  .toast-banner {
    position: absolute;
    inset-block-start: calc(env(safe-area-inset-top, 0px) + 114px);
    inset-inline-start: 50%;
    transform: translateX(-50%);
    z-index: 20;
    padding: 8px 16px;
    border-radius: 999px;
    font-size: 0.84rem;
    font-weight: 700;
    color: #ffffff;
    background: #1e293b;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    white-space: nowrap;
    max-inline-size: 92dvw;
    overflow: clip;
    text-overflow: ellipsis;
  }

  .toast-banner.kind-error {
    background: #dc2626;
  }

  .toast-banner.kind-success {
    background: #059669;
  }

  /* Bottom Sheet HUD */
  .bottom-sheet {
    position: absolute;
    inset-block-end: calc(env(safe-area-inset-bottom, 0px) + 10px);
    inset-inline: 10px;
    margin-inline: auto;
    max-inline-size: 560px;
    z-index: 10;
    background: var(--surface);
    border: 1px solid var(--border);
    backdrop-filter: blur(16px);
    border-radius: 22px;
    padding: 12px 14px 14px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .hud-meta {
    display: flex;
    align-items: safe center;
    justify-content: space-between;
    gap: 8px;
  }

  .meta-pills {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .meta-pill {
    font-size: 0.76rem;
    font-weight: 700;
    background: var(--surface-elevated);
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--border);
  }

  .accent-pill {
    border-color: var(--accent);
    color: var(--accent);
  }

  .quiz-badge-btn {
    border: 1px solid var(--border);
    background: var(--surface-elevated);
    color: var(--text-primary);
    border-radius: 999px;
    padding: 6px 12px;
    min-block-size: 36px;
    font-size: 0.76rem;
    font-weight: 700;
    cursor: pointer;
  }

  .mode-content {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .prompt-header {
    display: flex;
    align-items: safe center;
    justify-content: space-between;
    gap: 10px;
  }

  .prompt-eyebrow {
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--text-muted);
    display: block;
  }

  .target-title {
    margin: 2px 0 0;
    font-size: 1.28rem;
    font-weight: 800;
    line-height: 1.2;
  }

  .sub-official {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .hint-strip {
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 8px 12px;
    font-size: 0.82rem;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tries-badge,
  .par-badge {
    font-size: 0.76rem;
    font-weight: 700;
    color: var(--text-muted);
    background: var(--surface-elevated);
    padding: 4px 10px;
    border-radius: 999px;
    white-space: nowrap;
  }

  .choice-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .choice-btn {
    border: 1px solid var(--border);
    background: var(--surface-elevated);
    color: var(--text-primary);
    border-radius: 14px;
    padding: 8px 10px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    text-align: start;
    gap: 2px;
    transition: transform 0.1s ease, border-color 0.12s ease;
  }

  .choice-btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  .choice-btn.wrong {
    border-color: var(--danger);
    opacity: 0.52;
  }

  .choice-name {
    font-size: 0.88rem;
    font-weight: 700;
    line-height: 1.15;
  }

  .choice-sub {
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  .attempt-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .attempt-chip,
  .path-chip {
    font-size: 0.74rem;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface-elevated);
    color: var(--text-primary);
  }

  .attempt-chip.heat-hot {
    border-color: #f97316;
    color: #fb923c;
  }
  .attempt-chip.heat-warm {
    border-color: #eab308;
    color: #facc15;
  }
  .attempt-chip.heat-wrong {
    border-color: var(--danger);
    color: var(--danger);
  }
  .attempt-chip.found {
    border-color: var(--success);
    color: var(--success);
  }

  .path-chip {
    cursor: pointer;
    border-color: var(--accent);
  }

  .result-banner {
    display: flex;
    align-items: safe center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 14px;
    background: var(--surface-elevated);
    border: 1px solid var(--border);
  }

  .result-banner.won {
    border-color: var(--success);
  }
  .result-banner.lost {
    border-color: var(--danger);
  }

  .fact-line {
    margin: 3px 0 0;
    font-size: 0.78rem;
    color: var(--text-muted);
    line-height: 1.3;
  }

  .primary-btn {
    border: none;
    background: var(--accent);
    color: var(--accent-text);
    border-radius: 14px;
    padding: 10px 16px;
    font-size: 0.9rem;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
  }

  .secondary-btn {
    border: 1px solid var(--border);
    background: var(--surface-elevated);
    color: var(--text-primary);
    border-radius: 14px;
    padding: 8px 14px;
    font-size: 0.84rem;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }

  .secondary-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .btn-row {
    display: flex;
    gap: 8px;
  }

  /* Pathfinding Header */
  .path-header {
    display: flex;
    align-items: safe center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }

  .route-endpoints {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    font-weight: 800;
    font-size: 0.96rem;
  }

  .ep {
    padding: 3px 9px;
    border-radius: 8px;
    color: #ffffff;
  }
  .ep.start {
    background: #0891b2;
  }
  .ep.end {
    background: #9333ea;
  }

  .sub-instruction {
    margin: 0;
    font-size: 0.82rem;
    color: var(--text-muted);
  }

  /* Transit Sub-tabs & VBB Line Badges */
  .submode-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    background: var(--surface-elevated);
    padding: 3px;
    border-radius: 12px;
  }

  .subtab {
    border: none;
    background: transparent;
    color: var(--text-muted);
    min-block-size: 40px;
    border-radius: 10px;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
  }

  .subtab.active {
    background: var(--surface-solid);
    color: var(--text-primary);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  }

  .station-prompt-box {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .line-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .vbb-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 0.74rem;
    font-weight: 800;
    letter-spacing: 0.02em;
  }

  .vbb-badge.lg {
    font-size: 0.92rem;
    padding: 4px 12px;
    border-radius: 8px;
  }

  .line-runner-header {
    display: flex;
    align-items: safe center;
    justify-content: space-between;
  }

  .line-progress {
    font-size: 0.95rem;
    font-weight: 800;
  }

  .hearts-box {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    font-size: 0.88rem;
  }

  .nb-count {
    font-size: 0.78rem;
    font-weight: 800;
    color: var(--text-muted);
  }

  /* Atlas Banner */
  .atlas-banner {
    display: flex;
    align-items: safe center;
    justify-content: space-between;
    gap: 12px;
  }

  .atlas-banner-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.84rem;
  }

  .mini-dot {
    inline-size: 8px;
    block-size: 8px;
    border-radius: 999px;
    display: inline-block;
  }
  .mini-dot.l1 {
    background: #f59e0b;
  }
  .mini-dot.l2 {
    background: #3b82f6;
  }
  .mini-dot.l3 {
    background: #10b981;
  }
</style>
