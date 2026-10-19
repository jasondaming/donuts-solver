// A SolverPool backed by worker threads, for the service and for scripts.
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import { SolverPool, type EngineRunner } from '../src/solver/solver.ts';
import type { EnginePosition, EngineReply, EngineSize, EngineTask } from '../src/solver/wdlEngine.ts';

interface Reply {
  id: number;
  reply?: EngineReply;
  error?: string;
}

class ThreadRunner implements EngineRunner {
  readonly worker: Worker;
  private readonly pending = new Map<number, { resolve: (r: EngineReply) => void; reject: (e: Error) => void }>();
  private nextId = 1;
  private failure: Error | null = null;

  constructor(size: EngineSize) {
    this.worker = new Worker(new URL('./engineWorker.ts', import.meta.url), {
      execArgv: ['--experimental-strip-types', '--no-warnings'],
      workerData: size,
    });
    this.worker.on('message', (m: Reply) => {
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.reply) p.resolve(m.reply);
      else p.reject(new Error(m.error ?? 'Engine worker failed'));
    });
    const fail = (error: Error) => {
      this.failure ??= error;
      for (const p of this.pending.values()) p.reject(this.failure);
      this.pending.clear();
    };
    this.worker.on('error', fail);
    this.worker.on('exit', code => fail(new Error(`Engine worker exited with code ${code}`)));
    this.worker.unref();
  }

  run(position: EnginePosition, task: EngineTask): Promise<EngineReply> {
    if (this.failure) return Promise.reject(this.failure);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.ref();
      this.worker.postMessage({ id, position, task });
    }).finally(() => {
      if (this.pending.size === 0) this.worker.unref();
    }) as Promise<EngineReply>;
  }
}

export interface ThreadPool {
  pool: SolverPool;
  close(): Promise<void>;
}

export function createThreadPool(
  threads = Math.max(1, cpus().length - 1),
  size: EngineSize = { ttLog2: 21, dtLog2: 19 },
): ThreadPool {
  const runners = Array.from({ length: threads }, () => new ThreadRunner(size));
  return {
    pool: new SolverPool(runners),
    close: async () => { await Promise.all(runners.map(r => r.worker.terminate())); },
  };
}
