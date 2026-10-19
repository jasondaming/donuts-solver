// One engine per worker. Messages are stateless: each carries its position, so any worker can take any task.
import { createWdlEngine, type EnginePosition, type EngineTask } from './wdlEngine.ts';

interface Request {
  id: number;
  position: EnginePosition;
  task: EngineTask;
}

// 2^20 WDL entries (24 MB) and 2^18 distance entries (6 MB) per worker.
const engine = createWdlEngine({ ttLog2: 20, dtLog2: 18 });

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, position, task } = e.data;
  try {
    const reply = (await engine).run(position, task);
    self.postMessage({ id, reply });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
