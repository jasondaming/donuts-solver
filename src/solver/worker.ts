import type { GameState } from '../game/types';
import { analyzePosition } from './solver';
import type { SolverResult } from './solver';

let cancelToken = { cancelled: false };

self.onmessage = (e: MessageEvent) => {
  const { type, state } = e.data as { type: string; state: GameState };

  if (type === 'cancel') {
    cancelToken.cancelled = true;
    return;
  }

  if (type === 'analyze') {
    cancelToken.cancelled = true; // cancel any running analysis
    cancelToken = { cancelled: false };

    const movesLeft = state.vanillaLeft + state.chocolateLeft;

    const result = analyzePosition(
      state,
      movesLeft,
      cancelToken,
      (partial: SolverResult) => {
        if (!cancelToken.cancelled) {
          self.postMessage({ type: 'partial', ...partial });
        }
      },
    );

    if (!cancelToken.cancelled) {
      self.postMessage({ type: 'complete', ...result });
    }
  }
};
