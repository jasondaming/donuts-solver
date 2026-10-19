import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import type { GameState } from '../src/game/types.ts';
import type { SolveHandle, SolverResult } from '../src/solver/solver.ts';
import type { SolveJobSnapshot, StartSolveRequest } from '../src/solver/serverProtocol.ts';
import { toEnginePosition } from '../src/solver/wdlEngine.ts';
import { createThreadPool } from './enginePool.ts';

// Every solve is exact and finishes in seconds, so jobs live in memory only: the most recent MAX_JOBS
// results are kept, and a running job nobody has polled for ABANDON_MS is cancelled.
interface SolveJob {
  id: string;
  key: string;
  status: SolveJobSnapshot['status'];
  result: SolverResult | null;
  error: string | null;
  startedAt: number;
  updatedAt: number;
  polledAt: number;
  handle: SolveHandle | null;
}

const PORT = Number(process.env.DONUTS_SOLVER_PORT ?? 8787);
const MAX_JOBS = 256;
const ABANDON_MS = 30_000;
const { pool, close } = createThreadPool();
const jobs = new Map<string, SolveJob>();   // insertion order = least recently used first

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

      sendJson(res, 200, snapshot(startSolve(body.state)));
      return;
    }

    const jobMatch = url.pathname.match(/^\/api\/solve\/([^/]+)$/);
    if (req.method === 'GET' && jobMatch) {
      const job = jobs.get(jobMatch[1]);
      if (!job) {
        sendJson(res, 404, { error: 'Unknown solve job' });
        return;
      }

      touch(job);
      sendJson(res, 200, snapshot(job));
      return;
    }

    if (req.method === 'DELETE' && jobMatch) {
      const job = jobs.get(jobMatch[1]);
      if (!job) {
        sendJson(res, 404, { error: 'Unknown solve job' });
        return;
      }

      deleteJob(job);
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

setInterval(() => {
  const now = Date.now();
  for (const job of jobs.values()) {
    if (job.status === 'running' && now - job.polledAt > ABANDON_MS) deleteJob(job);
  }
}, 5_000).unref();

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

function startSolve(state: GameState): SolveJob {
  const key = positionKey(state);
  const id = createHash('sha256').update(key).digest('hex');
  const existing = jobs.get(id);
  if (existing && existing.status !== 'failed') {
    touch(existing);
    return existing;
  }
  if (existing) deleteJob(existing);

  const now = Date.now();
  const job: SolveJob = {
    id, key, status: 'running', result: null, error: null,
    startedAt: now, updatedAt: now, polledAt: now, handle: null,
  };
  job.handle = pool.analyze(state, result => {
    job.result = result;
    job.updatedAt = Date.now();
  });
  job.result = job.handle.current();
  job.handle.done.then(
    result => {
      job.result = result;
      job.status = 'complete';
      job.handle = null;
      job.updatedAt = Date.now();
    },
    error => {
      job.status = 'failed';
      job.error = error instanceof Error ? error.stack ?? error.message : String(error);
      job.handle = null;
      job.updatedAt = Date.now();
    },
  );

  jobs.set(id, job);
  while (jobs.size > MAX_JOBS) deleteJob(jobs.values().next().value!);
  return job;
}

function positionKey(state: GameState): string {
  const p = toEnginePosition(state);
  return `${p.dirs}|${p.cur.join(',')}|${p.oth.join(',')}|${state.currentPlayer}|${p.line}|${state.vanillaLeft},${state.chocolateLeft}|${state.status.type}`;
}

function touch(job: SolveJob): void {
  job.polledAt = Date.now();
  jobs.delete(job.id);
  jobs.set(job.id, job);
}

function deleteJob(job: SolveJob): void {
  job.handle?.cancel();
  job.handle = null;
  jobs.delete(job.id);
}

function snapshot(job: SolveJob): SolveJobSnapshot {
  return {
    id: job.id,
    key: job.key,
    status: job.status,
    result: job.result,
    error: job.error,
    cached: false,
    maxDepth: job.result?.depth ?? 0,
    checkpointDepth: job.result?.depth ?? 0,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
  };
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

async function shutdown(): Promise<void> {
  for (const job of jobs.values()) job.handle?.cancel();
  await close();
  server.close(() => process.exit(0));
}
