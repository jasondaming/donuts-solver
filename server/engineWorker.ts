// Worker thread hosting one engine for the service's SolverPool.
import { parentPort, workerData } from 'node:worker_threads';
import { createWdlEngine, type EnginePosition, type EngineSize, type EngineTask } from '../src/solver/wdlEngine.ts';

interface Request {
  id: number;
  position: EnginePosition;
  task: EngineTask;
}

const engine = await createWdlEngine(workerData as EngineSize);

parentPort?.on('message', ({ id, position, task }: Request) => {
  try {
    parentPort?.postMessage({ id, reply: engine.run(position, task) });
  } catch (error) {
    parentPort?.postMessage({ id, error: error instanceof Error ? error.stack ?? error.message : String(error) });
  }
});
