// Browser fallback: a pool of engine workers kept alive across positions, so their tables stay warm.
import type { EngineReply, EngineTask, EnginePosition } from './wdlEngine.ts';
import { SolverPool, type EngineRunner } from './solver.ts';

interface Reply {
  id: number;
  reply?: EngineReply;
  error?: string;
}

class WebWorkerRunner implements EngineRunner {
  private readonly worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private readonly pending = new Map<number, { resolve: (r: EngineReply) => void; reject: (e: Error) => void }>();
  private nextId = 1;
  private failure: Error | null = null;

  constructor() {
    this.worker.onmessage = (e: MessageEvent<Reply>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.reply) p.resolve(e.data.reply);
      else p.reject(new Error(e.data.error ?? 'Engine worker failed'));
    };
    this.worker.onerror = e => {
      this.failure = new Error(e.message || 'Engine worker crashed');
      for (const p of this.pending.values()) p.reject(this.failure);
      this.pending.clear();
    };
  }

  run(position: EnginePosition, task: EngineTask): Promise<EngineReply> {
    if (this.failure) return Promise.reject(this.failure);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, position, task });
    });
  }
}

let pool: SolverPool | null = null;

export function browserSolverPool(): SolverPool {
  if (!pool) {
    const count = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2) - 1));
    pool = new SolverPool(Array.from({ length: count }, () => new WebWorkerRunner()));
  }
  return pool;
}
