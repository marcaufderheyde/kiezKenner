<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import type {
    ContextFeatureCollection,
    GeoJsonFeature,
    GeoJsonFeatureCollection,
    KiezCollection,
    MapPolygonVisualState,
    ResolvedTheme,
    TransitData
  } from '../types';

  interface MapBadge {
    id: string;
    coords: [number, number];
    text: string;
    kind: 'start' | 'end' | 'center' | 'reveal';
  }

  interface Props {
    collection: KiezCollection;
    context: ContextFeatureCollection;
    transit: TransitData;
    theme: ResolvedTheme;
    showTransit: boolean;
    activeLineName?: string | null;
    polygonStates: Record<string, MapPolygonVisualState>;
    pulsingCoords?: [number, number] | null;
    badges?: MapBadge[];
    onPolygonClick: (id: string) => void;
  }

  let {
    collection,
    context,
    transit,
    theme,
    showTransit,
    activeLineName = null,
    polygonStates,
    pulsingCoords = null,
    badges = [],
    onPolygonClick
  }: Props = $props();

  let containerEl: HTMLDivElement;
  let map: maplibregl.Map | null = null;
  let mapReady = $state(false);
  let prevVisualStates: Record<string, MapPolygonVisualState> = {};
  let pulseMarker: maplibregl.Marker | null = null;
  let badgeMarkers: maplibregl.Marker[] = [];

  const PALETTES = {
    dark: {
      bg: '#0b1120',
      park: '#132a23',
      water: '#0c2d48',
      defaultFill: '#1e293b',
      filteredOutFill: '#0f172a',
      border: '#475569',
      ring: '#f59e0b',
      ringCasing: '#0b1120',
      stationStroke: '#0b1120'
    },
    light: {
      bg: '#f4f1ea',
      park: '#cde2c8',
      water: '#a5d8f3',
      defaultFill: '#e7e2d8',
      filteredOutFill: '#ddd7cb',
      border: '#94a3b8',
      ring: '#d97706',
      ringCasing: '#ffffff',
      stationStroke: '#ffffff'
    }
  };

  function buildTransitGeoJson(data: TransitData) {
    const lineFeatures: GeoJsonFeature[] = [];
    for (const line of data.lines) {
      lineFeatures.push({
        type: 'Feature',
        properties: {
          id: line.id,
          name: line.name,
          type: line.type,
          color: line.color,
          isRing: Boolean(line.isRing)
        },
        geometry: {
          type: 'MultiLineString',
          coordinates: line.coordinates
        }
      });
    }

    const stationFeatures: GeoJsonFeature[] = data.stations.map((s) => ({
      type: 'Feature',
      properties: {
        id: s.id,
        name: s.name,
        lines: s.lines.join(',')
      },
      geometry: {
        type: 'Point',
        coordinates: s.coords
      }
    }));

    return {
      lines: { type: 'FeatureCollection', features: lineFeatures } as GeoJsonFeatureCollection,
      ring: {
        type: 'FeatureCollection',
        features: lineFeatures.filter((f) => f.properties?.isRing)
      } as GeoJsonFeatureCollection,
      stations: {
        type: 'FeatureCollection',
        features: stationFeatures
      } as GeoJsonFeatureCollection
    };
  }

  function buildFillColorExpression(palette: (typeof PALETTES)['dark']): any {
    return [
      'match',
      ['feature-state', 'visual'],
      'target', '#3b82f6',
      'correct', '#10b981',
      'wrong', '#ef4444',
      'hot', '#f97316',
      'warm', '#eab308',
      'start', '#06b6d4',
      'end', '#a855f7',
      'path', '#14b8a6',
      'hint', '#6366f1',
      'neighbor-center', '#f59e0b',
      'neighbor-found', '#10b981',
      'filtered-out', palette.filteredOutFill,
      'mastery-0', palette.defaultFill,
      'mastery-1', '#f59e0b',
      'mastery-2', '#3b82f6',
      'mastery-3', '#10b981',
      palette.defaultFill
    ];
  }

  function applyTheme(m: maplibregl.Map, t: ResolvedTheme) {
    const p = PALETTES[t];
    m.setPaintProperty('bg', 'background-color', p.bg);
    m.setPaintProperty('parks-fill', 'fill-color', p.park);
    m.setPaintProperty('water-fill', 'fill-color', p.water);
    m.setPaintProperty('kiez-fill', 'fill-color', buildFillColorExpression(p));
    m.setPaintProperty('kiez-border', 'line-color', p.border);
    m.setPaintProperty('ringbahn-casing', 'line-color', p.ringCasing);
    m.setPaintProperty('ringbahn-line', 'line-color', p.ring);
    m.setPaintProperty('transit-stations', 'circle-stroke-color', p.stationStroke);
  }

  function syncPolygonStates(m: maplibregl.Map, nextStates: Record<string, MapPolygonVisualState>) {
    const allIds = new Set([...Object.keys(prevVisualStates), ...Object.keys(nextStates)]);
    for (const id of allIds) {
      const prev = prevVisualStates[id] ?? 'default';
      const next = nextStates[id] ?? 'default';
      if (prev !== next) {
        m.setFeatureState({ source: 'kieze', id }, { visual: next });
      }
    }
    prevVisualStates = { ...nextStates };
  }

  function syncTransitVisibility(m: maplibregl.Map, visible: boolean, lineFilter: string | null) {
    const vis = visible || Boolean(lineFilter) ? 'visible' : 'none';
    m.setLayoutProperty('transit-lines-casing', 'visibility', vis);
    m.setLayoutProperty('transit-lines', 'visibility', vis);
    m.setLayoutProperty('transit-stations', 'visibility', visible ? 'visible' : 'none');

    if (lineFilter) {
      m.setFilter('transit-lines', ['==', ['get', 'name'], lineFilter]);
      m.setFilter('transit-lines-casing', ['==', ['get', 'name'], lineFilter]);
    } else {
      m.setFilter('transit-lines', null);
      m.setFilter('transit-lines-casing', null);
    }
  }

  export function fitBoundsBbox(
    bbox: [number, number, number, number],
    maxZoom = 14.5
  ) {
    if (!map) return;
    const isNarrow = window.innerWidth < 768;
    map.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]]
      ],
      {
        padding: {
          top: isNarrow ? 112 : 96,
          right: 24,
          bottom: isNarrow ? 260 : 210,
          left: 24
        },
        maxZoom,
        duration: 520
      }
    );
  }

  export function resetOverview(isKiezeDeck: boolean) {
    if (!map) return;
    if (isKiezeDeck) {
      fitBoundsBbox([13.285, 52.462, 13.485, 52.56], 12.8);
    } else {
      fitBoundsBbox([13.088, 52.338, 13.761, 52.675], 11.4);
    }
  }

  onMount(() => {
    const tr = buildTransitGeoJson(transit);
    const p = PALETTES[theme];

    map = new maplibregl.Map({
      container: containerEl,
      center: [13.405, 52.51],
      zoom: 10.6,
      minZoom: 9.2,
      maxZoom: 16,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          context: { type: 'geojson', data: context as any },
          kieze: { type: 'geojson', data: collection as any, promoteId: 'id' },
          ringbahn: { type: 'geojson', data: tr.ring as any },
          'transit-lines': { type: 'geojson', data: tr.lines as any },
          'transit-stations': { type: 'geojson', data: tr.stations as any }
        },
        layers: [
          {
            id: 'bg',
            type: 'background',
            paint: { 'background-color': p.bg }
          },
          {
            id: 'parks-fill',
            type: 'fill',
            source: 'context',
            filter: ['==', ['get', 'kind'], 'park'],
            paint: { 'fill-color': p.park, 'fill-opacity': 0.9 }
          },
          {
            id: 'water-fill',
            type: 'fill',
            source: 'context',
            filter: ['==', ['get', 'kind'], 'water'],
            paint: { 'fill-color': p.water, 'fill-opacity': 0.95 }
          },
          {
            id: 'kiez-fill',
            type: 'fill',
            source: 'kieze',
            paint: {
              'fill-color': buildFillColorExpression(p),
              'fill-opacity': [
                'match',
                ['feature-state', 'visual'],
                'filtered-out', 0.22,
                'default', 0.42,
                'mastery-0', 0.38,
                0.68
              ]
            }
          },
          {
            id: 'kiez-border',
            type: 'line',
            source: 'kieze',
            paint: {
              'line-color': p.border,
              'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 14, 1.5],
              'line-opacity': [
                'match',
                ['feature-state', 'visual'],
                'filtered-out', 0.25,
                0.85
              ]
            }
          },
          {
            id: 'kiez-highlight-border',
            type: 'line',
            source: 'kieze',
            paint: {
              'line-color': [
                'match',
                ['feature-state', 'visual'],
                'target', '#60a5fa',
                'correct', '#34d399',
                'wrong', '#f87171',
                'start', '#22d3ee',
                'end', '#c084fc',
                'path', '#2dd4bf',
                'hint', '#818cf8',
                'neighbor-center', '#fbbf24',
                'neighbor-found', '#34d399',
                'transparent'
              ],
              'line-width': [
                'match',
                ['feature-state', 'visual'],
                [
                  'target',
                  'correct',
                  'wrong',
                  'hot',
                  'warm',
                  'start',
                  'end',
                  'path',
                  'hint',
                  'neighbor-center',
                  'neighbor-found'
                ],
                3,
                0
              ]
            }
          },
          {
            id: 'ringbahn-casing',
            type: 'line',
            source: 'ringbahn',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': p.ringCasing,
              'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 14, 5],
              'line-opacity': 0.55
            }
          },
          {
            id: 'ringbahn-line',
            type: 'line',
            source: 'ringbahn',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': p.ring,
              'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 14, 2.5],
              'line-dasharray': [2, 1.5],
              'line-opacity': 0.85
            }
          },
          {
            id: 'transit-lines-casing',
            type: 'line',
            source: 'transit-lines',
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
              visibility: showTransit ? 'visible' : 'none'
            },
            paint: {
              'line-color': p.bg,
              'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3.5, 14, 6],
              'line-opacity': 0.7
            }
          },
          {
            id: 'transit-lines',
            type: 'line',
            source: 'transit-lines',
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
              visibility: showTransit ? 'visible' : 'none'
            },
            paint: {
              'line-color': ['get', 'color'],
              'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 14, 3.5],
              'line-opacity': 0.92
            }
          },
          {
            id: 'transit-stations',
            type: 'circle',
            source: 'transit-stations',
            layout: {
              visibility: showTransit ? 'visible' : 'none'
            },
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.2, 13, 4.2, 15, 5.8],
              'circle-color': '#f8fafc',
              'circle-stroke-color': p.stationStroke,
              'circle-stroke-width': 1.5,
              'circle-opacity': 0.92
            }
          }
        ]
      }
    });

    map.on('load', () => {
      if (!map) return;
      mapReady = true;
      syncPolygonStates(map, polygonStates);
      syncTransitVisibility(map, showTransit, activeLineName);
      resetOverview(collection.features.length > 120);
    });

    map.on('click', 'kiez-fill', (e) => {
      const feature = e.features?.[0];
      const id = feature?.properties?.id;
      if (id) {
        onPolygonClick(String(id));
      }
    });

    map.on('mouseenter', 'kiez-fill', () => {
      if (map) map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'kiez-fill', () => {
      if (map) map.getCanvas().style.cursor = '';
    });
  });

  // React to deck collection changes
  $effect(() => {
    const col = collection;
    if (!map || !mapReady) return;
    const src = map.getSource('kieze') as maplibregl.GeoJSONSource | undefined;
    if (src) {
      map.removeFeatureState({ source: 'kieze' });
      prevVisualStates = {};
      src.setData(col as any);
      syncPolygonStates(map, polygonStates);
    }
  });

  // React to feature visual states
  $effect(() => {
    const states = polygonStates;
    if (!map || !mapReady) return;
    syncPolygonStates(map, states);
  });

  // React to theme changes
  $effect(() => {
    const currentTheme = theme;
    if (!map || !mapReady) return;
    applyTheme(map, currentTheme);
  });

  // React to transit overlay toggles
  $effect(() => {
    const vis = showTransit;
    const lineFilter = activeLineName;
    if (!map || !mapReady) return;
    syncTransitVisibility(map, vis, lineFilter);
  });

  // React to pulsing station marker
  $effect(() => {
    const coords = pulsingCoords;
    if (!map || !mapReady) return;
    if (pulseMarker) {
      pulseMarker.remove();
      pulseMarker = null;
    }
    if (coords) {
      const el = document.createElement('div');
      el.className = 'station-pulse-marker';
      pulseMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(coords)
        .addTo(map);
    }
  });

  // React to badge markers (Start/End/Center/Reveal labels)
  $effect(() => {
    const items = badges;
    if (!map || !mapReady) return;
    for (const m of badgeMarkers) m.remove();
    badgeMarkers = [];

    for (const b of items) {
      const el = document.createElement('div');
      el.className = `map-pill-badge kind-${b.kind}`;
      el.textContent = b.text;
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(b.coords)
        .addTo(map);
      badgeMarkers.push(marker);
    }
  });

  onDestroy(() => {
    pulseMarker?.remove();
    for (const m of badgeMarkers) m.remove();
    map?.remove();
    map = null;
  });
</script>

<div class="map-root" bind:this={containerEl}></div>

<style>
  .map-root {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
    touch-action: none;
  }

  :global(.map-pill-badge) {
    pointer-events: none;
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.01em;
    color: #ffffff;
    white-space: nowrap;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.45);
    border: 1.5px solid rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(4px);
  }

  :global(.map-pill-badge.kind-start) {
    background: #0891b2;
  }

  :global(.map-pill-badge.kind-end) {
    background: #9333ea;
  }

  :global(.map-pill-badge.kind-center) {
    background: #d97706;
  }

  :global(.map-pill-badge.kind-reveal) {
    background: #059669;
  }
</style>
