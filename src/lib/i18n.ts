import type { Lang } from './types';

export const translations = {
  de: {
    appName: 'KiezKenner',
    deckOrtsteile: '96 Ortsteile',
    deckKieze: 'Kieze',
    modePinpoint: 'Pinpoint',
    modePathfinding: 'Kiez-Hop',
    modeTransit: 'Umsteigen',
    modeNeighbors: 'Nachbarn',
    mapTapMode: 'Karte tippen',
    reverseQuizMode: '4er-Quiz',
    toggleTransit: 'U/S-Bahn Netz',
    toggleTheme: 'Hell / Dunkel',
    toggleAtlas: 'Berlin-Atlas',
    toggleLang: 'DE / EN',
    streakLabel: 'Serie',
    scoreLabel: 'Punkte',
    bestLabel: 'Rekord',
    loadingData: 'Lade Berliner Geodaten…',
    errorData: 'Geodaten konnten nicht geladen werden.',

    // Filter
    filterAll: 'Ganz Berlin',
    filterRing: 'S-Bahn-Ring',

    // Mode 1: Pinpoint
    pinpointPrompt: 'Wo liegt dieser Ort?',
    pinpointReversePrompt: 'Welcher Kiez / Ortsteil ist markiert?',
    attemptsLeft: 'Versuche übrig',
    hintBtn: 'Tipp',
    hintBezirk: 'Bezirk',
    hintStations: 'Stationen',
    hintNone: 'Keine U/S-Bahn-Station',
    directHit: 'Volltreffer!',
    foundInTries: 'Gefunden in {n} Versuchen',
    missedReveal: 'Das war {name}',
    nextRound: 'Nächster Kiez →',
    away: 'entfernt',

    // Mode 2: Kiez-Hopping
    pathPrompt: 'Verbinde Start & Ziel über angrenzende Nachbarn',
    pathReversePrompt: 'Wähle den nächsten Nachbarn auf dem Weg zum Ziel',
    pathStart: 'Start',
    pathEnd: 'Ziel',
    pathSteps: 'Schritte',
    pathOptimal: 'Optimal',
    pathComplete: 'Route komplett!',
    pathPar: 'Perfekt (Optimal)!',
    pathGood: 'Angekommen! +{n} Umweg',
    pathNotNeighbor: '{name} grenzt nicht an deinen Pfad!',
    pathUndo: 'Zurück',
    pathNext: 'Neue Route →',

    // Mode 3: Umsteigen (Transit)
    transitSubStation: 'Bahnhof → Kiez',
    transitSubLine: 'Linien-Lauf',
    stationPrompt: 'In welchem Kiez liegt diese Station?',
    stationReversePrompt: 'Welcher Kiez enthält die pulsierende Station?',
    linePrompt: 'Tippe alle {total} Kieze/Ortsteile mit Station auf der {line}',
    lineReversePrompt: 'Wähle alle Gebiete auf der Linie {line}',
    lineFound: 'Gefunden',
    lineComplete: 'Linie {line} gemeistert!',
    lineWrong: '{name} hat keine Station der {line}',
    stationCorrect: 'Richtig! {station} liegt in {name}',
    stationWrong: 'Falsch — das war {tapped}',

    // Mode 4: Neighbors
    neighborsPrompt: 'Tippe alle {total} Nachbarn von',
    neighborsReversePrompt: 'Welcher Nachbar von {center} blinkt?',
    neighborsFound: 'Nachbarn',
    heartsLeft: 'Leben',
    neighborsComplete: 'Alle Nachbarn gefunden!',
    neighborsFailed: 'Keine Leben mehr! Markiert in Blau.',
    neighborsNotBordering: '{name} grenzt nicht an {center}',

    // Fact Card
    bezirkLabel: 'Bezirk',
    officialLabel: 'LOR-Name',
    bordersLabel: 'Grenzt an',
    stationsLabel: 'U/S-Bahn',

    // Mastery Atlas Dialog
    atlasTitle: 'Mein Berlin-Atlas',
    atlasSubtitle: 'Lernfortschritt & Filter',
    atlasClose: 'Schließen',
    atlasColorMap: 'Karte nach Fortschritt färben',
    atlasColorMapActive: 'Atlas-Ansicht aktiv',
    atlasFilterTitle: 'Gebiet filtern',
    atlasResetBtn: 'Fortschritt zurücksetzen',
    atlasResetConfirm: 'Wirklich alle Lernstände zurücksetzen?',
    mastery0: 'Unentdeckt',
    mastery1: 'In Übung',
    mastery2: 'Vertraut',
    mastery3: 'Kiez-Kenner',
    dailyStreak: 'Tages-Serie',
    overallProgress: 'Fortschritt',
    resetCamera: 'Berlin-Übersicht'
  },
  en: {
    appName: 'KiezKenner',
    deckOrtsteile: '96 Districts',
    deckKieze: 'Kieze',
    modePinpoint: 'Pinpoint',
    modePathfinding: 'Kiez-Hop',
    modeTransit: 'Transit',
    modeNeighbors: 'Neighbors',
    mapTapMode: 'Map Tap',
    reverseQuizMode: '4-Choice',
    toggleTransit: 'U/S-Bahn Overlay',
    toggleTheme: 'Light / Dark',
    toggleAtlas: 'Berlin Atlas',
    toggleLang: 'DE / EN',
    streakLabel: 'Streak',
    scoreLabel: 'Score',
    bestLabel: 'Best',
    loadingData: 'Loading Berlin geodata…',
    errorData: 'Failed to load geodata.',

    // Filter
    filterAll: 'All Berlin',
    filterRing: 'S-Bahn Ring',

    // Mode 1: Pinpoint
    pinpointPrompt: 'Where is this area?',
    pinpointReversePrompt: 'Which Kiez / Ortsteil is highlighted?',
    attemptsLeft: 'tries left',
    hintBtn: 'Hint',
    hintBezirk: 'Borough',
    hintStations: 'Stations',
    hintNone: 'No U/S-Bahn station',
    directHit: 'Bullseye!',
    foundInTries: 'Found in {n} tries',
    missedReveal: 'That was {name}',
    nextRound: 'Next Kiez →',
    away: 'away',

    // Mode 2: Kiez-Hopping
    pathPrompt: 'Connect Start to Goal via bordering areas',
    pathReversePrompt: 'Pick the next neighbor toward the destination',
    pathStart: 'Start',
    pathEnd: 'Goal',
    pathSteps: 'Steps',
    pathOptimal: 'Par',
    pathComplete: 'Route complete!',
    pathPar: 'Optimal route!',
    pathGood: 'Arrived! +{n} detour',
    pathNotNeighbor: '{name} does not border your path!',
    pathUndo: 'Undo',
    pathNext: 'New Route →',

    // Mode 3: Umsteigen (Transit)
    transitSubStation: 'Station → Kiez',
    transitSubLine: 'Line Runner',
    stationPrompt: 'Which Kiez contains this station?',
    stationReversePrompt: 'Pick the Kiez where the pulsing station sits',
    linePrompt: 'Tap all {total} areas with a station on {line}',
    lineReversePrompt: 'Select areas served by {line}',
    lineFound: 'Found',
    lineComplete: '{line} mastered!',
    lineWrong: '{name} has no {line} station',
    stationCorrect: 'Correct! {station} is in {name}',
    stationWrong: 'Nope — you tapped {tapped}',

    // Mode 4: Neighbors
    neighborsPrompt: 'Tap all {total} neighbors of',
    neighborsReversePrompt: 'Which neighbor of {center} is pulsing?',
    neighborsFound: 'Neighbors',
    heartsLeft: 'Lives',
    neighborsComplete: 'All neighbors found!',
    neighborsFailed: 'Out of lives! Missing shown in blue.',
    neighborsNotBordering: '{name} does not border {center}',

    // Fact Card
    bezirkLabel: 'Borough',
    officialLabel: 'LOR Name',
    bordersLabel: 'Borders',
    stationsLabel: 'U/S-Bahn',

    // Mastery Atlas Dialog
    atlasTitle: 'My Berlin Atlas',
    atlasSubtitle: 'Mastery & Region Filter',
    atlasClose: 'Close',
    atlasColorMap: 'Color map by mastery',
    atlasColorMapActive: 'Atlas view active',
    atlasFilterTitle: 'Filter Region',
    atlasResetBtn: 'Reset Progress',
    atlasResetConfirm: 'Reset all mastery progress?',
    mastery0: 'Unseen',
    mastery1: 'Learning',
    mastery2: 'Familiar',
    mastery3: 'Mastered',
    dailyStreak: 'Day Streak',
    overallProgress: 'Mastery',
    resetCamera: 'Berlin Overview'
  }
} as const;

export type TranslationKey = keyof typeof translations.de;

export function t(lang: Lang, key: TranslationKey, vars?: Record<string, string | number>): string {
  let str: string = translations[lang][key] ?? translations.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}
