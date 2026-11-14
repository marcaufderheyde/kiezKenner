export type DeckType = 'ortsteile' | 'kieze';
export type GameMode = 'pinpoint' | 'pathfinding' | 'transit' | 'neighbors';
export type TransitSubMode = 'station' | 'line';
export type Lang = 'de' | 'en';
export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

export interface GeoJsonMultiLineString {
  type: 'MultiLineString';
  coordinates: number[][][];
}

export interface GeoJsonPoint {
  type: 'Point';
  coordinates: [number, number];
}

export type GeoJsonGeometry =
  | GeoJsonPolygon
  | GeoJsonMultiPolygon
  | GeoJsonMultiLineString
  | GeoJsonPoint;

export interface GeoJsonFeature<G = GeoJsonGeometry, P = Record<string, unknown>> {
  type: 'Feature';
  id?: string | number;
  properties: P;
  geometry: G;
}

export interface GeoJsonFeatureCollection<F = GeoJsonFeature> {
  type: 'FeatureCollection';
  features: F[];
}

export interface KiezProperties {
  id: string;
  name: string;
  officialName?: string;
  ortsteil?: string;
  bezirk: string;
  centroid: [number, number];
  bbox: [number, number, number, number];
  areaKm2: number;
  insideRing: boolean;
  neighbors: string[];
  stations?: string[];
}

export interface KiezFeature {
  type: 'Feature';
  id: string;
  properties: KiezProperties;
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon;
}

export interface KiezCollection {
  type: 'FeatureCollection';
  features: KiezFeature[];
}

export interface TransitStation {
  id: string;
  name: string;
  coords: [number, number];
  lines: string[];
  ortsteilId: string | null;
  kiezId: string | null;
}

export interface TransitLine {
  id: string;
  name: string;
  type: 'u' | 's';
  color: string;
  textColor: string;
  isRing?: boolean;
  ortsteilIds: string[];
  kiezIds: string[];
  stationIds: string[];
  coordinates: [number, number][][];
}

export interface TransitData {
  lines: TransitLine[];
  stations: TransitStation[];
}

export interface ContextFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

export type MasteryLevel = 0 | 1 | 2 | 3;

export interface KiezMastery {
  attempts: number;
  correct: number;
  streak: number;
  level: MasteryLevel;
  lastSeen: number;
}

export interface ModeStats {
  played: number;
  score: number;
  highScore: number;
  streak: number;
  bestStreak: number;
}

export interface PersistedState {
  lang: Lang;
  deck: DeckType;
  mode: GameMode;
  transitSubMode: TransitSubMode;
  reverseQuiz: boolean;
  showTransit: boolean;
  bezirkFilter: string;
  masteryColorMode: boolean;
  stats: Record<GameMode, ModeStats>;
  mastery: Record<string, KiezMastery>;
  lastPlayedDate: string;
  dailyStreak: number;
}

export type MapPolygonVisualState =
  | 'default'
  | 'target'
  | 'correct'
  | 'wrong'
  | 'warm'
  | 'hot'
  | 'start'
  | 'end'
  | 'path'
  | 'hint'
  | 'neighbor-center'
  | 'neighbor-found'
  | 'filtered-out'
  | 'mastery-0'
  | 'mastery-1'
  | 'mastery-2'
  | 'mastery-3';
