import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { GameState, MoveAnalysis } from '../src/game/types.ts';
import type { SolverResult } from '../src/solver/solver.ts';
import type { SolveJobSnapshot, StartSolveRequest } from '../src/solver/serverProtocol.ts';
import { encodeStateKey, transformMove } from '../src/solver/stateKey.ts';
import { PersistentExactCache } from './exactCache.ts';
import { getValidMoves, applyMove } from '../src/game/engine.ts';

interface SolveJob extends SolveJobSnapshot {
  state: GameState;
  worker: Worker | null;
}

interface PersistedJob {
  id: string;
  key: string;
  state: GameState;
  status: SolveJobSnapshot['status'];
  result: SolverResult | null;
  error: string | null;
  cached: boolean;
  maxDepth: number;
  checkpointDepth: number;
  startedAt: number;
  updatedAt: number;
}

interface WorkerMessage {
  type: 'partial' | 'complete' | 'failed';
  result?: SolverResult;
  error?: string;
}

const PORT = Number(process.env.DONUTS_SOLVER_PORT ?? 8787);
const CACHE_DIR = path.resolve(process.env.DONUTS_SOLVER_CACHE_DIR ?? path.join(process.cwd(), '.solver-cache'));
const JOBS_DIR = path.join(CACHE_DIR, 'jobs');
const MAX_WORKERS = Math.max(1, cpus().length - 1);
const jobs = new Map<string, SolveJob>();
const activeJobsByKey = new Map<string, string>();
const exactCache = new PersistentExactCache(CACHE_DIR);

await mkdir(JOBS_DIR, { recursive: true });
await exactCache.load();
await loadPersistedJobs();

export const server = createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        jobs: jobs.size,
        running: [...jobs.values()].filter(job => job.status === 'running').length,
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/solve') {
      sendJson(res, 200, [...jobs.values()].map(snapshot));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/solve') {
      const body = await readJson<StartSolveRequest>(req);
      if (!body.state) {
        sendJson(res, 400, { error: 'Missing state' });
        return;
      }

      const snapshot = await startSolve(body.state, body.maxDepth);
      sendJson(res, 200, snapshot);
      return;
    }

    const jobMatch = url.pathname.match(/^\/api\/solve\/([^/]+)$/);
    if (req.method === 'GET' && jobMatch) {
      const job = jobs.get(jobMatch[1]);
      if (!job) {
        sendJson(res, 404, { error: 'Unknown solve job' });
        return;
      }

      sendJson(res, 200, snapshot(job));
      return;
    }

    if (req.method === 'DELETE' && jobMatch) {
      const job = jobs.get(jobMatch[1]);
      if (!job) {
        sendJson(res, 404, { error: 'Unknown solve job' });
        return;
      }

      await deleteJob(job);
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, () => {
  console.log(`Donuts solver service listening on http://localhost:${PORT}`);
});

process.once('SIGINT', () => void shutdown(0));
process.once('SIGTERM', () => void shutdown(0));

async function loadPersistedJobs(): Promise<void> {
  const entries = await readdir(JOBS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

    try {
      const raw = await readFile(path.join(JOBS_DIR, entry.name), 'utf8');
      const persisted = JSON.parse(raw) as PersistedJob;
      const job = hydrateJob(persisted);
      jobs.set(job.id, job);
      activeJobsByKey.set(job.key, job.id);
    } catch (error) {
      console.warn(`Skipping unreadable solver checkpoint ${entry.name}:`, error);
    }
  }

  for (const job of jobs.values()) {
    if (job.status === 'running' && !job.result?.complete) {
      startWorker(job);
    }
  }
}

async function startSolve(state: GameState, maxDepth?: number): Promise<SolveJobSnapshot> {
  const key = encodeStateKey(state).key;
  const id = hashKey(key);
  const requestedDepth = maxDepth ?? state.vanillaLeft + state.chocolateLeft;
  const existing = jobs.get(id);

  if (existing) {
    if (requestedDepth > existing.maxDepth) {
      existing.maxDepth = requestedDepth;
      existing.status = existing.result?.complete ? 'complete' : 'running';
      existing.error = null;
      existing.updatedAt = Date.now();
      await persistJob(existing);
    } else if (existing.status === 'failed') {
      existing.status = 'running';
      existing.error = null;
      existing.updatedAt = Date.now();
      await persistJob(existing);
    }

    if (existing.status === 'running' && !existing.worker) startWorker(existing);
    return snapshot(existing);
  }

  const reconstructed = tryReconstructFromCache(state);
  if (reconstructed) {
    const job = createJob(id, key, state, requestedDepth, true);
    job.status = 'complete';
    job.result = reconstructed;
    job.checkpointDepth = reconstructed.depth;
    job.updatedAt = Date.now();
    jobs.set(job.id, job);
    activeJobsByKey.set(job.key, job.id);
    await persistJob(job);
    return snapshot(job);
  }

  const job = createJob(id, key, state, requestedDepth, false);
  jobs.set(job.id, job);
  activeJobsByKey.set(job.key, job.id);
  await persistJob(job);
  startWorker(job);
  return snapshot(job);
}

function startWorker(job: SolveJob): void {
  if (job.worker || job.status !== 'running') return;

  const startDepth = Math.min(job.maxDepth + 1, (job.result?.depth ?? 0) + 1);
  const worker = new Worker(new URL('./solveWorker.ts', import.meta.url), {
    execArgv: ['--experimental-strip-types'],
    workerData: {
      state: job.state,
      maxDepth: job.maxDepth,
      startDepth,
      initialResult: job.result,
      cacheDir: CACHE_DIR,
    },
  });
  job.worker = worker;

  worker.on('message', (message: WorkerMessage) => {
    job.updatedAt = Date.now();

    if (message.type === 'partial' && message.result) {
      job.result = message.result;
      job.checkpointDepth = message.result.depth;
      void persistJob(job);
      prefetchChildren(job.state);
      return;
    }

    if (message.type === 'complete' && message.result) {
      job.result = message.result;
      job.checkpointDepth = message.result.depth;
      job.status = message.result.complete ? 'complete' : 'running';
      job.worker = null;
      void persistJob(job);
      if (message.result.complete) {
        const best = chooseBestRootAnalysis(message.result);
        const canonical = encodeStateKey(job.state);
        const vanillaScore = job.state.currentPlayer === 'vanilla' ? best.score : -best.score;
        exactCache.set(job.key, {
          score: vanillaScore,
          depth: message.result.depth,
          bestMove: best.bestMove ? transformMove(best.bestMove, canonical.symmetry) : null,
          type: 'exact',
          updatedAt: Date.now(),
        });
      }
      if (job.status === 'running' && job.result.depth < job.maxDepth) {
        startWorker(job);
      }
      return;
    }

    if (message.type === 'failed') {
      job.status = 'failed';
      job.error = message.error ?? 'Solver worker failed';
      job.worker = null;
      void persistJob(job);
    }
  });

  worker.on('error', error => {
    job.status = 'failed';
    job.error = error.stack ?? error.message;
    job.worker = null;
    job.updatedAt = Date.now();
    void persistJob(job);
  });

  worker.on('exit', code => {
    if (code !== 0 && job.status === 'running') {
      job.status = 'failed';
      job.error = `Solver worker exited with code ${code}`;
      job.updatedAt = Date.now();
      void persistJob(job);
    }
    if (job.status !== 'running') job.worker = null;
  });
}

function createJob(id: string, key: string, state: GameState, maxDepth: number, cached: boolean): SolveJob {
  const now = Date.now();
  return {
    id,
    key,
    state,
    status: 'running',
    result: null,
    error: null,
    cached,
    maxDepth,
    checkpointDepth: 0,
    startedAt: now,
    updatedAt: now,
    worker: null,
  };
}

function hydrateJob(persisted: PersistedJob): SolveJob {
  return {
    ...persisted,
    status: persisted.result?.complete ? 'complete' : persisted.status,
    checkpointDepth: persisted.result?.depth ?? persisted.checkpointDepth ?? 0,
    worker: null,
  };
}

function snapshot(job: SolveJob): SolveJobSnapshot {
  return {
    id: job.id,
    key: job.key,
    status: job.status,
    result: job.result,
    error: job.error,
    cached: job.cached,
    maxDepth: job.maxDepth,
    checkpointDepth: job.checkpointDepth,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
  };
}

async function persistJob(job: SolveJob): Promise<void> {
  const persisted: PersistedJob = {
    ...snapshot(job),
    state: job.state,
  };
  await writeJsonAtomic(jobPath(job.id), persisted);
}

async function deleteJob(job: SolveJob): Promise<void> {
  job.worker?.terminate();
  activeJobsByKey.delete(job.key);
  jobs.delete(job.id);
  await rm(jobPath(job.id), { force: true });
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function jobPath(id: string): string {
  return path.join(JOBS_DIR, `${id}.json`);
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const payload = JSON.stringify(value);
  const tmpPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, payload, 'utf8');
  try {
    await rename(tmpPath, filePath);
  } catch (error) {
    if (isPermissionError(error)) {
      await writeFile(filePath, payload, 'utf8');
      await rm(tmpPath, { force: true });
      return;
    }
    throw error;
  }
}

function isPermissionError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EPERM';
}

function chooseBestRootAnalysis(result: SolverResult): { score: number; bestMove: [number, number] | null } {
  const ranked = [...result.analyses].sort((a, b) => {
    const rank = (h: { outcome: string; movesToEnd: number | null }) =>
      h.outcome === 'win' ? 0 :
      h.outcome === 'draw' ? 1 :
      h.outcome === 'unknown' ? 2 :
      3;

    const ar = rank(a), br = rank(b);
    if (ar !== br) return ar - br;
    if (a.outcome === 'win' && b.outcome === 'win') return (a.movesToEnd ?? 0) - (b.movesToEnd ?? 0);
    if (a.outcome === 'loss' && b.outcome === 'loss') return (b.movesToEnd ?? 0) - (a.movesToEnd ?? 0);
    if (a.outcome === 'unknown' && b.outcome === 'unknown') return b.score - a.score;
    return a.row - b.row || a.col - b.col;
  });

  const best = ranked[0];
  if (!best) return { score: 0, bestMove: null };

  const score = best.score;
  return { score, bestMove: [best.row, best.col] };
}

function setCorsHeaders(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 5_000_000) throw new Error('Request body too large');
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const WIN = 10000;

function tryReconstructFromCache(state: GameState): SolverResult | null {
  const moves = getValidMoves(state);
  if (moves.length === 0) return { analyses: [], depth: 0, complete: true };

  const movesLeft = state.vanillaLeft + state.chocolateLeft;
  const isVanilla = state.currentPlayer === 'vanilla';
  const analyses: MoveAnalysis[] = [];

  for (const [row, col] of moves) {
    const child = applyMove(state, row, col);

    if (child.status.type !== 'playing') {
      const outcome = child.status.type === 'draw' ? 'draw'
        : child.status.winner === state.currentPlayer ? 'win' : 'loss';
      const score = outcome === 'win' ? WIN - 1 : outcome === 'loss' ? -(WIN - 1) : 0;
      analyses.push({ row, col, outcome, movesToEnd: 1, depth: movesLeft, proven: true, score });
      continue;
    }

    const { key: childKey } = encodeStateKey(child);
    const entry = exactCache.get(childKey);
    if (!entry || entry.type !== 'exact') return null;

    // entry.score is from vanilla's perspective; adjust sign to current player's perspective.
    // The cached score may have been written at a different pliesFromRoot, so we normalize
    // by stripping the embedded distance and rebuilding it from the current position (1 ply away).
    const rawScore = isVanilla ? entry.score : -entry.score;
    let outcome: MoveAnalysis['outcome'];
    let movesToEnd: number | null;
    let score: number;

    if (rawScore === 0) {
      outcome = 'draw';
      movesToEnd = null;
      score = 0;
    } else if (rawScore > 0) {
      // WIN - pliesFromRoot is baked into the cached score. The stored root may differ
      // from the current position by 1 ply, so movesToEnd can be off by 1 until B's
      // own job overwrites the entry from the correct search root.
      movesToEnd = WIN - rawScore;
      outcome = 'win';
      score = rawScore;
    } else {
      movesToEnd = WIN + rawScore;
      outcome = 'loss';
      score = rawScore;
    }

    analyses.push({ row, col, outcome, movesToEnd, depth: movesLeft, proven: true, score });
  }

  return { analyses, depth: movesLeft, complete: true };
}

function runningJobCount(): number {
  let count = 0;
  for (const job of jobs.values()) {
    if (job.status === 'running') count++;
  }
  return count;
}

function prefetchChildren(state: GameState): void {
  if (runningJobCount() >= MAX_WORKERS) return;
  const moves = getValidMoves(state);
  for (const [row, col] of moves) {
    if (runningJobCount() >= MAX_WORKERS) break;
    const child = applyMove(state, row, col);
    if (child.status.type !== 'playing') continue;
    const childKey = encodeStateKey(child).key;
    const childId = hashKey(childKey);
    if (!jobs.has(childId)) {
      void startSolve(child);
    }
  }
}

async function shutdown(code: number): Promise<void> {
  for (const job of jobs.values()) {
    if (job.worker) {
      job.worker.terminate();
      job.worker = null;
    }
    await persistJob(job);
  }

  server.close(() => process.exit(code));
}
