import type { GameState } from '../game/types';
import { analyzePosition } from './solver';
import type { SolverResult } from './solver';

// The worker is terminated (not cancelled) when the position changes,
// so we don't need a cancel mechanism — just run until done or killed.
const cancelToken = { cancelled: false };

self.onmessage = (e: MessageEvent) => {
  const { state } = e.data as { type: string; state: GameState };
  const movesLeft = state.vanillaLeft + state.chocolateLeft;

  analyzePosition(
    state,
    movesLeft,
    cancelToken,
    (partial: SolverResult) => {
      self.postMessage({ ...partial });
    },
  );

  // Final complete message (if we finish all depths without being terminated)
  const moves = state.vanillaLeft + state.chocolateLeft;
  self.postMessage({ analyses: [], depth: moves, complete: true });
};
