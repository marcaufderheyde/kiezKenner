import type { GameMode, KiezMastery, MasteryLevel, PersistedState } from './types';

const STORAGE_KEY = 'kiezkenner_state_v1';

const defaultModeStats = () => ({
  played: 0,
  score: 0,
  highScore: 0,
  streak: 0,
  bestStreak: 0
});

export function createInitialState(): PersistedState {
  return {
    lang: 'de',
    deck: 'ortsteile',
    mode: 'pinpoint',
    transitSubMode: 'station',
    reverseQuiz: false,
    showTransit: false,
    bezirkFilter: 'all',
    masteryColorMode: false,
    stats: {
      pinpoint: defaultModeStats(),
      pathfinding: defaultModeStats(),
      transit: defaultModeStats(),
      neighbors: defaultModeStats()
    },
    mastery: {},
    lastPlayedDate: '',
    dailyStreak: 0
  };
}

export function loadPersistedState(): PersistedState {
  const fallback = createInitialState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      ...fallback,
      ...parsed,
      stats: {
        pinpoint: { ...defaultModeStats(), ...parsed.stats?.pinpoint },
        pathfinding: { ...defaultModeStats(), ...parsed.stats?.pathfinding },
        transit: { ...defaultModeStats(), ...parsed.stats?.transit },
        neighbors: { ...defaultModeStats(), ...parsed.stats?.neighbors }
      },
      mastery: parsed.mastery ?? {}
    };
  } catch {
    return fallback;
  }
}

export function savePersistedState(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage quota or privacy mode; ignore gracefully
  }
}

export function computeMasteryLevel(correct: number, streak: number): MasteryLevel {
  if (streak >= 3 || correct >= 4) return 3;
  if (streak >= 2 || correct >= 2) return 2;
  if (correct >= 1) return 1;
  return 0;
}

export function recordKiezOutcome(
  state: PersistedState,
  featureId: string,
  wasSuccess: boolean
): PersistedState {
  const prev: KiezMastery = state.mastery[featureId] ?? {
    attempts: 0,
    correct: 0,
    streak: 0,
    level: 0,
    lastSeen: 0
  };

  const attempts = prev.attempts + 1;
  const correct = prev.correct + (wasSuccess ? 1 : 0);
  const streak = wasSuccess ? prev.streak + 1 : 0;
  const level = computeMasteryLevel(correct, streak);

  const today = new Date().toISOString().slice(0, 10);
  let dailyStreak = state.dailyStreak;
  if (state.lastPlayedDate !== today) {
    if (!state.lastPlayedDate) {
      dailyStreak = 1;
    } else {
      const prevDate = new Date(state.lastPlayedDate);
      const currDate = new Date(today);
      const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / 86400000);
      dailyStreak = diffDays === 1 ? state.dailyStreak + 1 : 1;
    }
  }

  return {
    ...state,
    lastPlayedDate: today,
    dailyStreak,
    mastery: {
      ...state.mastery,
      [featureId]: {
        attempts,
        correct,
        streak,
        level,
        lastSeen: Date.now()
      }
    }
  };
}

export function recordModeRound(
  state: PersistedState,
  mode: GameMode,
  pointsEarned: number,
  wasSuccess: boolean
): PersistedState {
  const prev = state.stats[mode];
  const streak = wasSuccess ? prev.streak + 1 : 0;
  const score = prev.score + pointsEarned;
  const highScore = Math.max(prev.highScore, score);
  const bestStreak = Math.max(prev.bestStreak, streak);

  return {
    ...state,
    stats: {
      ...state.stats,
      [mode]: {
        played: prev.played + 1,
        score,
        highScore,
        streak,
        bestStreak
      }
    }
  };
}

export function triggerHaptic(pattern: 'tap' | 'success' | 'error'): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    if (pattern === 'tap') navigator.vibrate(12);
    else if (pattern === 'success') navigator.vibrate([18, 30, 28]);
    else navigator.vibrate([40, 25, 40]);
  } catch {
    // Ignore unsupported environments
  }
}
