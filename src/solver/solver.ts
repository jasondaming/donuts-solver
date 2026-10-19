// Perfect-play analysis of every legal move, shared by the browser and the Node service.
//
// Pass 1 proves each move a win, draw, or loss with the WebAssembly engine (engine/wdl.c): a full-depth
// win/draw/loss search, so every answer is exact and no depth limit is involved.
// Pass 2 fills in "win in N" / "loss in N" for the winning and losing moves with node-budgeted searches;
// a move whose budget runs out keeps its proven outcome with movesToEnd = null.
//
// Moves are spread over a pool of engines (one per worker). The newest analysis gets idle engines first.
import type { GameState, MoveAnalysis, SolverProgress } from '../game/types';
import { applyMove, getValidMoves } from '../game/engine.ts';
import { toEnginePosition, type EnginePosition, type EngineReply, type EngineTask } from './wdlEngine.ts';

export interface SolverResult {
  analyses: MoveAnalysis[];
  depth: number;      // plies left in the game: every value is searched to the end
  complete: boolean;  // both passes finished
  stats?: SolverProgress;
}

export interface EngineRunner {
  run(position: EnginePosition, task: EngineTask): Promise<EngineReply>;
}

export interface AnalyzeOptions {
  distances?: boolean;  // run the "win/loss in N" pass (default true)
}

export interface SolveHandle {
  done: Promise<SolverResult>;
  current(): SolverResult;
  cancel(): void;
}

// Distance searches per move. About a second of engine time; larger N near the empty board stays null.
export const DISTANCE_BUDGET = 3_000_000;
const WIN = 10000;

class Job {
  readonly analyses: MoveAnalysis[];
  readonly position: EnginePosition;
  private readonly valueQueue: number[] = [];
  private readonly distanceQueues: number[][];
  private inFlight = 0;
  private nodes = 0;
  private readonly startedAt = Date.now();
  private finished = false;
  cancelled = false;
  readonly done: Promise<SolverResult>;
  private resolve!: (result: SolverResult) => void;
  private reject!: (error: unknown) => void;
  private readonly onUpdate?: (result: SolverResult) => void;

  private readonly distances: boolean;

  constructor(state: GameState, runnerCount: number, onUpdate?: (result: SolverResult) => void, options: AnalyzeOptions = {}) {
    this.onUpdate = onUpdate;
    this.distances = options.distances ?? true;
    this.done = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
    this.position = toEnginePosition(state);
    this.distanceQueues = Array.from({ length: runnerCount }, () => []);
    const remaining = this.position.remaining;
    this.analyses = getValidMoves(state).map(([row, col]) => {
      const next = applyMove(state, row, col);
      if (next.status.type === 'playing') {
        this.valueQueue.push(row * 6 + col);
        return { row, col, outcome: 'unknown', movesToEnd: null, depth: remaining, proven: false, score: 0 };
      }
      const outcome = next.status.type === 'draw' ? 'draw' : next.status.winner === state.currentPlayer ? 'win' : 'loss';
      return { row, col, outcome, movesToEnd: 1, depth: remaining, proven: true, score: scoreOf(outcome, 1) };
    });
  }

  get idle(): boolean {
    return this.finished || this.cancelled;
  }

  nextTask(runner: number): EngineTask | null {
    if (this.idle) return null;
    const value = this.valueQueue.shift();
    if (value !== undefined) return this.take({ kind: 'value', cell: value });
    // Prefer distance searches on moves this engine solved: its table already holds that subtree.
    const queue = this.distanceQueues[runner].length ? this.distanceQueues[runner] : this.distanceQueues.find(q => q.length);
    const cell = queue?.shift();
    if (cell === undefined) return null;
    const value0 = this.find(cell).outcome === 'win' ? 1 : -1;
    return this.take({ kind: 'distance', cell, value: value0, budget: DISTANCE_BUDGET });
  }

  complete(runner: number, task: EngineTask, reply: EngineReply): void {
    this.inFlight--;
    this.nodes += reply.nodes;
    if (this.idle) return;
    const a = this.find(task.cell);
    if (task.kind === 'value') {
      a.outcome = reply.result > 0 ? 'win' : reply.result < 0 ? 'loss' : 'draw';
      a.proven = true;
      a.score = scoreOf(a.outcome, null);
      if (a.outcome !== 'draw' && this.distances) this.distanceQueues[runner].push(task.cell);
    } else if (reply.result > 0) {
      a.movesToEnd = reply.result;
      a.score = scoreOf(a.outcome, reply.result);
    }
    this.publish();
  }

  fail(error: unknown): void {
    if (this.idle) return;
    this.finished = true;
    this.reject(error);
  }

  publish(): void {
    const result = this.current();
    this.onUpdate?.(result);
    if (result.complete && !this.finished) {
      this.finished = true;
      this.resolve(result);
    }
  }

  current(): SolverResult {
    const pending = this.valueQueue.length + this.distanceQueues.reduce((n, q) => n + q.length, 0) + this.inFlight;
    const movesSolved = this.analyses.filter(a => a.proven).length;
    return {
      analyses: this.analyses.map(a => ({ ...a })),
      depth: this.position.remaining,
      complete: pending === 0,
      stats: {
        nodesVisited: this.nodes,
        elapsedMs: Date.now() - this.startedAt,
        movesSolved,
        moveCount: this.analyses.length,
        distancesPending: pending - (this.analyses.length - movesSolved),
      },
    };
  }

  private take(task: EngineTask): EngineTask {
    this.inFlight++;
    return task;
  }

  private find(cell: number): MoveAnalysis {
    return this.analyses.find(a => a.row * 6 + a.col === cell)!;
  }
}

function scoreOf(outcome: MoveAnalysis['outcome'], movesToEnd: number | null): number {
  const n = movesToEnd ?? 100;
  return outcome === 'win' ? WIN - n : outcome === 'loss' ? -(WIN - n) : 0;
}

export class SolverPool {
  private jobs: Job[] = [];   // newest first
  private readonly runners: EngineRunner[];
  private readonly busy: boolean[];

  constructor(runners: EngineRunner[]) {
    this.runners = runners;
    this.busy = runners.map(() => false);
  }

  analyze(state: GameState, onUpdate?: (result: SolverResult) => void, options?: AnalyzeOptions): SolveHandle {
    const job = new Job(state, this.runners.length, onUpdate, options);
    const handle: SolveHandle = {
      done: job.done,
      current: () => job.current(),
      cancel: () => {
        job.cancelled = true;
        this.jobs = this.jobs.filter(j => j !== job);
      },
    };
    queueMicrotask(() => job.publish());
    if (state.status.type !== 'playing') return handle;
    this.jobs.unshift(job);
    this.runners.forEach((_, i) => this.pump(i));
    return handle;
  }

  private pump(runner: number): void {
    if (this.busy[runner]) return;
    this.jobs = this.jobs.filter(j => !j.idle);
    for (const job of this.jobs) {
      const task = job.nextTask(runner);
      if (!task) continue;
      this.busy[runner] = true;
      this.runners[runner].run(job.position, task).then(
        reply => job.complete(runner, task, reply),
        error => job.fail(error),
      ).finally(() => {
        this.busy[runner] = false;
        this.pump(runner);
      });
      return;
    }
  }
}

// Best move for the side to move: fastest win, then a draw, then the longest loss.
export function pickBestMove(analyses: MoveAnalysis[]): [number, number] | null {
  const known = analyses.filter(a => a.outcome !== 'unknown');
  if (known.length === 0) return null;
  const best = [...known].sort((a, b) => b.score - a.score)[0];
  return [best.row, best.col];
}
