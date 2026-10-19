import type { GameState, MoveAnalysis, SolverProgress } from '../game/types';
import { getValidMoves, applyMove } from '../game/engine.ts';
import { encodeStateKey, invertMove, transformMove } from './stateKey.ts';
import type { ExactCacheLike } from './exactCacheTypes.ts';

const WIN = 10000;
const INF = 999999;

// Transposition table entry
interface TEntry {
  score: number;
  depth: number;
  type: 'exact' | 'lower' | 'upper';
  bestMove: [number, number] | null;
}

const transTable = new Map<string, TEntry>();

interface SearchValue {
  score: number;
  exact: boolean;
  bestMove: [number, number] | null;
}

interface SearchContext {
  cache?: ExactCacheLike;
  stats?: SolverProgress;
}

// Returns score from vanilla's perspective.
// +WIN - pliesFromRoot = vanilla wins sooner = better.
// -(WIN - pliesFromRoot) = chocolate wins sooner = worse for vanilla.
function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  pliesFromRoot: number,
  cancelToken: { cancelled: boolean },
  context: SearchContext,
): SearchValue {
  if (cancelToken.cancelled) return { score: 0, exact: false, bestMove: null };
  if (context.stats) context.stats.nodesVisited += 1;

  if (state.status.type !== 'playing') {
    if (state.status.type === 'draw') return { score: 0, exact: true, bestMove: null };
    const score = WIN - pliesFromRoot;
    return { score: state.status.winner === 'vanilla' ? score : -score, exact: true, bestMove: null };
  }

  if (depth === 0) return { score: 0, exact: false, bestMove: null };

  const encoded = encodeStateKey(state);
  const key = encoded.key;
  const symmetry = encoded.symmetry;
  const cachedExact = context.cache?.get(key);
  if (cachedExact && cachedExact.depth >= depth) {
    if (context.stats) context.stats.cacheHits += 1;
    if (cachedExact.type === 'exact') {
      return {
        score: cachedExact.score,
        exact: true,
        bestMove: cachedExact.bestMove ? invertMove(cachedExact.bestMove, symmetry) : null,
      };
    }
    if (cachedExact.type === 'lower') alpha = Math.max(alpha, cachedExact.score);
    if (cachedExact.type === 'upper') beta = Math.min(beta, cachedExact.score);
    if (alpha >= beta) {
      return {
        score: cachedExact.score,
        exact: false,
        bestMove: cachedExact.bestMove ? invertMove(cachedExact.bestMove, symmetry) : null,
      };
    }
  }

  const cached = transTable.get(key);
  if (cached && cached.depth >= depth) {
    if (cached.type === 'exact') {
      return {
        score: cached.score,
        exact: true,
        bestMove: cached.bestMove ? invertMove(cached.bestMove, symmetry) : null,
      };
    }
    if (cached.type === 'lower') alpha = Math.max(alpha, cached.score);
    if (cached.type === 'upper') beta = Math.min(beta, cached.score);
    if (alpha >= beta) {
      return {
        score: cached.score,
        exact: false,
        bestMove: cached.bestMove ? invertMove(cached.bestMove, symmetry) : null,
      };
    }
  }

  const moves = getValidMoves(state);
  const isMaximizing = state.currentPlayer === 'vanilla';

  // Move ordering: check for immediate wins first
  const orderedMoves = orderMoves(
    state,
    moves,
    cached?.bestMove ? invertMove(cached.bestMove, symmetry) : null,
  );

  let bestScore = isMaximizing ? -INF : INF;
  let bestMove: [number, number] | null = null;
  const originalAlpha = alpha;
  const originalBeta = beta;
  let allChildrenExact = true;

  for (const [row, col] of orderedMoves) {
    if (cancelToken.cancelled) return { score: 0, exact: false, bestMove: null };

    const next = applyMove(state, row, col);
    const child = minimax(next, depth - 1, alpha, beta, pliesFromRoot + 1, cancelToken, context);
    const score = child.score;
    if (!child.exact) allChildrenExact = false;

    if (isMaximizing) {
      if (score > bestScore) {
        bestScore = score;
        bestMove = [row, col];
      }
      if (score > alpha) alpha = score;
    } else {
      if (score < bestScore) {
        bestScore = score;
        bestMove = [row, col];
      }
      if (score < beta) beta = score;
    }

    if (alpha >= beta) break;
  }

  const entryType: TEntry['type'] = allChildrenExact
    ? 'exact'
    : bestScore <= originalAlpha
    ? 'upper'
    : bestScore >= originalBeta
    ? 'lower'
    : 'exact';
  transTable.set(key, {
    score: bestScore,
    depth,
    type: entryType,
    bestMove: bestMove ? transformMove(bestMove, symmetry) : null,
  });
  const exact = allChildrenExact;
  if (context.cache) {
    context.cache.set(key, {
      score: bestScore,
      depth,
      bestMove: bestMove ? transformMove(bestMove, symmetry) : null,
      type: entryType,
      updatedAt: Date.now(),
    });
    if (context.stats) context.stats.cacheStores += 1;
  }
  return { score: bestScore, exact, bestMove };
}

function orderMoves(
  state: GameState,
  moves: [number, number][],
  preferredMove: [number, number] | null,
): [number, number][] {
  // Score each move heuristically from vanilla's perspective.
  const scored = moves.map(([r, c]) => {
    const next = applyMove(state, r, c);
    let score = 0;
    if (next.status.type === 'won') {
      score += next.status.winner === 'vanilla' ? 10000 : -10000;
    }
    const flipped = countFlipped(state, next);
    score += (state.currentPlayer === 'vanilla' ? 1 : -1) * flipped * 100;
    const dr = r - 2.5, dc = c - 2.5;
    score += (state.currentPlayer === 'vanilla' ? 1 : -1)
      * Math.max(0, 4 - Math.sqrt(dr*dr + dc*dc)) * 10;
    if (preferredMove && preferredMove[0] === r && preferredMove[1] === c) {
      score += 5000;
    }
    return { r, c, score };
  });

  scored.sort((a, b) =>
    state.currentPlayer === 'vanilla' ? b.score - a.score : a.score - b.score
  );
  return scored.map(s => [s.r, s.c] as [number, number]);
}

function orderRootMoves(
  state: GameState,
  moves: [number, number][],
  analyses: MoveAnalysis[] | null,
): [number, number][] {
  if (!analyses || analyses.length === 0) {
    return orderMoves(state, moves, null);
  }

  const prior = new Map(analyses.map(a => [`${a.row},${a.col}`, a]));
  return [...moves].sort((a, b) => compareRootAnalyses(prior.get(`${a[0]},${a[1]}`), prior.get(`${b[0]},${b[1]}`), state.currentPlayer));
}

function compareRootAnalyses(
  a: MoveAnalysis | undefined,
  b: MoveAnalysis | undefined,
  currentPlayer: 'vanilla' | 'chocolate',
): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  const rank = (h: MoveAnalysis) =>
    h.outcome === 'win' ? 0 :
    h.outcome === 'draw' ? 1 :
    h.outcome === 'unknown' ? 2 :
    3;

  const ar = rank(a), br = rank(b);
  if (ar !== br) return ar - br;
  if (a.outcome === 'win' && b.outcome === 'win') {
    return currentPlayer === 'vanilla'
      ? (a.movesToEnd ?? Number.MAX_SAFE_INTEGER) - (b.movesToEnd ?? Number.MAX_SAFE_INTEGER)
      : (a.movesToEnd ?? Number.MAX_SAFE_INTEGER) - (b.movesToEnd ?? Number.MAX_SAFE_INTEGER);
  }
  if (a.outcome === 'loss' && b.outcome === 'loss') {
    return currentPlayer === 'vanilla'
      ? (b.movesToEnd ?? 0) - (a.movesToEnd ?? 0)
      : (b.movesToEnd ?? 0) - (a.movesToEnd ?? 0);
  }
  if (a.outcome === 'unknown' && b.outcome === 'unknown') {
    return b.score - a.score;
  }
  return a.row - b.row || a.col - b.col;
}

function countFlipped(before: GameState, after: GameState): number {
  let count = 0;
  const player = before.currentPlayer;
  const opp = player === 'vanilla' ? 'chocolate' : 'vanilla';
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      if (before.board[r][c].piece === opp && after.board[r][c].piece === player) count++;
    }
  }
  return count;
}

export interface SolverResult {
  analyses: MoveAnalysis[];
  depth: number;
  complete: boolean;
  stats?: SolverProgress;
}

export interface AnalyzeOptions {
  startDepth?: number;
  initialResult?: SolverResult | null;
  cache?: ExactCacheLike;
  stats?: SolverProgress;
}

export function analyzePosition(
  state: GameState,
  maxDepth: number,
  cancelToken: { cancelled: boolean },
  onPartial?: (result: SolverResult) => void,
  options: AnalyzeOptions = {},
): SolverResult {
  transTable.clear();
  const startedAt = Date.now();
  const stats = options.stats ?? {
    nodesVisited: 0,
    cacheHits: 0,
    cacheStores: 0,
    elapsedMs: 0,
  };

  const moves = getValidMoves(state);
  if (moves.length === 0) {
    stats.elapsedMs = Date.now() - startedAt;
    return { analyses: [], depth: 0, complete: true, stats: { ...stats } };
  }

  const movesLeft = state.vanillaLeft + state.chocolateLeft;
  const isVanilla = state.currentPlayer === 'vanilla';
  let rootOrder = orderRootMoves(state, moves, null);

  const initialResult = options.initialResult ?? null;
  let currentAnalyses: MoveAnalysis[] = initialResult?.analyses ?? moves.map(([r, c]) => ({
    row: r,
    col: c,
    outcome: 'unknown',
    movesToEnd: null,
    depth: 0,
    proven: false,
    score: 0,
  }));

  if (initialResult && (initialResult.complete || initialResult.depth >= maxDepth)) {
    stats.elapsedMs = Date.now() - startedAt;
    return { ...initialResult, stats: { ...stats } };
  }

  const startDepth = Math.max(1, options.startDepth ?? 1);
  for (let depth = startDepth; depth <= maxDepth; depth++) {
    if (cancelToken.cancelled) break;

    const depthStartedAt = Date.now();
    const depthStartNodes = stats.nodesVisited;
    const depthStartCacheHits = stats.cacheHits;
    const depthStartCacheStores = stats.cacheStores;
    const analyses: MoveAnalysis[] = [];

    for (const [row, col] of rootOrder) {
      if (cancelToken.cancelled) break;

      const next = applyMove(state, row, col);

      let outcome: MoveAnalysis['outcome'];
      let movesToEnd: number | null;
      let proven = false;
      let score = 0;

      if (next.status.type !== 'playing') {
        proven = true;
        movesToEnd = 1;
        if (next.status.type === 'draw') {
          outcome = 'draw';
        } else {
          outcome = next.status.winner === state.currentPlayer ? 'win' : 'loss';
          score = outcome === 'win' ? WIN - 1 : -(WIN - 1);
        }
      } else {
        const vanillaEval = minimax(next, depth - 1, -INF, INF, 1, cancelToken, {
          cache: options.cache,
          stats,
        });
        score = isVanilla ? vanillaEval.score : -vanillaEval.score;

        if (score === 0) {
          if (vanillaEval.exact) {
            proven = true;
            outcome = 'draw';
          } else {
            proven = false;
            outcome = 'unknown';
          }
          movesToEnd = null;
        } else if (score > 0) {
          proven = true;
          outcome = 'win';
          movesToEnd = WIN - score;
        } else {
          proven = true;
          outcome = 'loss';
          movesToEnd = WIN + score;
        }
      }

      analyses.push({ row, col, outcome, movesToEnd, depth, proven, score });
    }

    if (!cancelToken.cancelled) {
      currentAnalyses = analyses;
      rootOrder = orderRootMoves(state, moves, analyses);
      stats.elapsedMs = Date.now() - startedAt;
      stats.depthTimings = [
        ...(stats.depthTimings ?? []).filter(timing => timing.depth !== depth),
        {
          depth,
          depthNodes: stats.nodesVisited - depthStartNodes,
          depthCacheHits: stats.cacheHits - depthStartCacheHits,
          depthCacheStores: stats.cacheStores - depthStartCacheStores,
          depthElapsedMs: Date.now() - depthStartedAt,
          nodesVisited: stats.nodesVisited,
          elapsedMs: stats.elapsedMs,
        },
      ].slice(-12);
      const result: SolverResult = {
        analyses,
        depth,
        complete: depth >= movesLeft || analyses.every(a => a.proven),
        stats: { ...stats },
      };
      if (onPartial) onPartial(result);

      if (analyses.every(a => a.proven)) {
        return { ...result, complete: true };
      }

      if (result.complete) break;
    }
  }

  return {
    analyses: currentAnalyses,
    depth: currentAnalyses[0]?.depth ?? 0,
    complete: !cancelToken.cancelled && (
      currentAnalyses[0]?.depth >= movesLeft || currentAnalyses.every(a => a.proven)
    ),
    stats: { ...stats, elapsedMs: Date.now() - startedAt },
  };
}

export function getBestMove(state: GameState): [number, number] | null {
  const moves = getValidMoves(state);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  const cancel = { cancelled: false };
  const movesLeft = state.vanillaLeft + state.chocolateLeft;
  const result = analyzePosition(state, movesLeft, cancel);

  const analyses = result.analyses;
  const wins = analyses
    .filter(a => a.outcome === 'win' && a.movesToEnd !== null)
    .sort((a, b) => a.movesToEnd! - b.movesToEnd!);
  if (wins.length > 0) return [wins[0].row, wins[0].col];

  const draws = analyses.filter(a => a.outcome === 'draw');
  if (draws.length > 0) return [draws[0].row, draws[0].col];

  const unknowns = analyses.filter(a => a.outcome === 'unknown');
  if (unknowns.length > 0) return [unknowns[0].row, unknowns[0].col];

  const losses = analyses
    .filter(a => a.outcome === 'loss' && a.movesToEnd !== null)
    .sort((a, b) => b.movesToEnd! - a.movesToEnd!);
  return [losses[0].row, losses[0].col];
}
