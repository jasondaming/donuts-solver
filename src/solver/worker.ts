import type { GameState } from '../game/types';
import { analyzePosition } from './solver.ts';
import type { SolverResult } from './solver';

// The worker is terminated (not cancelled) when the position changes,
// so we don't need a cancel mechanism — just run until done or killed.
const cancelToken = { cancelled: false };

self.onmessage = (e: MessageEvent) => {
  const { state } = e.data as { type: string; state: GameState };
  const movesLeft = state.vanillaLeft + state.chocolateLeft;

  const result = analyzePosition(
    state,
    movesLeft,
    cancelToken,
    (partial: SolverResult) => {
      self.postMessage({ ...partial });
    },
  );

  // Final exact message, preserving the last analyses instead of clearing the UI.
  self.postMessage({ ...result });
};
