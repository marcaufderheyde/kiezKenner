# KiezKenner

Interactive, mobile-first web game to learn the geography of Berlin — its **97 official Ortsteile**, **186 inner-city Kieze** (LOR Planungsräume), borders, and **U-Bahn / S-Bahn** network.

**Live:** [https://aufderheyde.com/kiezKenner/](https://aufderheyde.com/kiezKenner/)

## Game Modes

- **Pinpoint (`📍`)**: Locate the named Kiez or Ortsteil on an unlabeled map (with distance in km, directional arrow, and proximity heat hints) — or toggle **4-Choice Reverse Quiz (`🔤`)** to identify the highlighted area.
- **Kiez-Hop (`🔗`)**: Travel from Start to Goal across contiguous bordering neighborhoods, scored against the optimal BFS shortest path.
- **Umsteigen (`🚇`)**:
  - **Station → Kiez**: Identify which neighborhood a U/S-Bahn station sits in.
  - **Line Runner**: Tap every neighborhood served by a selected U-Bahn or S-Bahn line.
- **Nachbarn (`🧭`)**: Find all bordering neighbors around a highlighted center area with 3 lives.

## Features

- Dual geographic layers: **96/97 Ortsteile** (city-wide) & **Inner-City Kieze** (enriched LOR Planungsräume)
- Always-on waterways, major parks, and S-Bahn Ring (`S41/S42`) + toggleable full U/S-Bahn network overlay
- Instant **DE / EN** language switch and **Light / Dark** theme toggle
- Local mastery tracking, daily streaks, and region filtering via `localStorage`
- 100% static & serverless (Svelte 5 + Vite + TypeScript + MapLibre GL JS)

## Data Sources

- **Boundaries**: GDI Berlin ALKIS Ortsteile (`dl-de/zero-2-0`) & LOR Planungsräume 2021 (`CC BY 3.0`)
- **Waterways & Parks**: GDI Berlin Gewässerverzeichnis & Grünanlagenbestand
- **Transit**: VBB open GTFS station & line data (`vbb-stations`, `vbb-lines`)

## Local Development

```sh
npm install
npm run dev
```

To regenerate the pre-processed GeoJSON & transit files in `public/data/`:

```sh
npm run build:data
```

To build for production:

```sh
npm run build
```
