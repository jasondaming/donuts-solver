import { parentPort, workerData } from 'node:worker_threads';
import type { GameState } from '../src/game/types.ts';
import { analyzePosition } from '../src/solver/solver.ts';
import { PersistentExactCache } from './exactCache.ts';

interface WorkerData {
  state: GameState;
  maxDepth: number;
  cacheDir: string;
}

const { state, maxDepth, cacheDir } = workerData as WorkerData;
const cancelToken = { cancelled: false };
const exactCache = new PersistentExactCache(cacheDir);

await exactCache.load();

try {
  analyzePosition(state, maxDepth, cancelToken, undefined, { cache: exactCache });
  await exactCache.flush();
  parentPort?.postMessage({ type: 'done' });
} catch (error) {
  parentPort?.postMessage({
    type: 'failed',
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  });
}
