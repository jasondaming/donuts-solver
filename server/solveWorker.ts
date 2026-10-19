import { parentPort, workerData } from 'node:worker_threads';
import type { GameState } from '../src/game/types.ts';
import { analyzePosition } from '../src/solver/solver.ts';
import type { SolverResult } from '../src/solver/solver.ts';
import { PersistentExactCache } from './exactCache.ts';

interface WorkerData {
  state: GameState;
  maxDepth: number;
  startDepth?: number;
  initialResult?: SolverResult | null;
  cacheDir: string;
}

const { state, maxDepth, startDepth, initialResult, cacheDir } = workerData as WorkerData;
const cancelToken = { cancelled: false };
const exactCache = new PersistentExactCache(cacheDir);

await exactCache.load();

try {
  const result = analyzePosition(
    state,
    maxDepth,
    cancelToken,
    (partial: SolverResult) => {
      parentPort?.postMessage({ type: 'partial', result: partial });
    },
    {
      startDepth,
      initialResult,
      cache: exactCache,
    },
  );

  await exactCache.flush();

  parentPort?.postMessage({ type: 'complete', result });
} catch (error) {
  parentPort?.postMessage({
    type: 'failed',
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  });
}
