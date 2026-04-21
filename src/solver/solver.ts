import type { GameState, MoveAnalysis } from '../game/types';
import { getValidMoves, applyMove } from '../game/engine';

const WIN = 10000;
const INF = 999999;

// Transposition table entry
interface TEntry {
  score: number;
  depth: number;
  type: 'exact' | 'lower' | 'upper';
}

const transTable = new Map<string, TEntry>();

function encodeState(state: GameState): string {
  let s = '';
  for (const row of state.board) {
    for (const cell of row) {
      s += cell.piece === null ? '0' : cell.piece === 'vanilla' ? '1' : '2';
    }
  }
  s += state.currentPlayer[0]; // 'v' or 'c'
  if (state.constrainedLine) {
    s += state.constrainedLine.dir + state.constrainedLine.index;
  } else {
    s += 'N';
  }
  return s;
}

// Returns score from vanilla's perspective.
// +WIN - movesPlayed = vanilla wins sooner = better
// -(WIN - movesPlayed) = chocolate wins sooner = worse for vanilla
function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  movesPlayed: number,
  cancelToken: { cancelled: boolean },
): number {
  if (cancelToken.cancelled) return 0;

  if (state.status.type !== 'playing') {
    if (state.status.type === 'draw') return 0;
    const score = WIN - movesPlayed;
    return state.status.winner === 'vanilla' ? score : -score;
  }

  if (depth === 0) return 0;

  const key = encodeState(state);
  const cached = transTable.get(key);
  if (cached && cached.depth >= depth) {
    if (cached.type === 'exact') return cached.score;
    if (cached.type === 'lower') alpha = Math.max(alpha, cached.score);
    if (cached.type === 'upper') beta = Math.min(beta, cached.score);
    if (alpha >= beta) return cached.score;
  }

  const moves = getValidMoves(state);
  const isMaximizing = state.currentPlayer === 'vanilla';

  // Move ordering: check for immediate wins first
  const orderedMoves = orderMoves(state, moves);

  let bestScore = isMaximizing ? -INF : INF;
  let entryType: TEntry['type'] = 'upper';

  for (const [row, col] of orderedMoves) {
    if (cancelToken.cancelled) return 0;

    const next = applyMove(state, row, col);
    const score = minimax(next, depth - 1, alpha, beta, movesPlayed + 1, cancelToken);

    if (isMaximizing) {
      if (score > bestScore) {
        bestScore = score;
        entryType = 'exact';
      }
      if (score > alpha) { alpha = score; entryType = 'exact'; }
    } else {
      if (score < bestScore) {
        bestScore = score;
        entryType = 'exact';
      }
      if (score < beta) { beta = score; entryType = 'exact'; }
    }

    if (alpha >= beta) {
      entryType = isMaximizing ? 'lower' : 'upper';
      break;
    }
  }

  transTable.set(key, { score: bestScore, depth, type: entryType });
  return bestScore;
}

function orderMoves(state: GameState, moves: [number, number][]): [number, number][] {
  // Score each move heuristically for ordering (higher = try first)
  const scored = moves.map(([r, c]) => {
    const next = applyMove(state, r, c);
    let score = 0;
    // Immediate win
    if (next.status.type === 'won') score += 10000;
    // Insertion happened (flipped opponent pieces)
    const flipped = countFlipped(state, next);
    score += flipped * 100;
    // Center preference
    const dr = r - 2.5, dc = c - 2.5;
    score += Math.max(0, 4 - Math.sqrt(dr*dr + dc*dc)) * 10;
    return { r, c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => [s.r, s.c] as [number, number]);
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
}

export function analyzePosition(
  state: GameState,
  maxDepth: number,
  cancelToken: { cancelled: boolean },
  onPartial?: (result: SolverResult) => void,
): SolverResult {
  transTable.clear();

  const moves = getValidMoves(state);
  if (moves.length === 0) return { analyses: [], depth: 0, complete: true };

  const totalMovesPlayed = 30 - state.vanillaLeft - state.chocolateLeft;
  const movesLeft = state.vanillaLeft + state.chocolateLeft;
  const isVanilla = state.currentPlayer === 'vanilla';

  let currentAnalyses: MoveAnalysis[] = moves.map(([r, c]) => ({
    row: r, col: c, outcome: 'draw', movesToEnd: movesLeft, depth: 0,
  }));

  for (let depth = 1; depth <= maxDepth; depth++) {
    if (cancelToken.cancelled) break;

    const analyses: MoveAnalysis[] = [];

    for (const [row, col] of moves) {
      if (cancelToken.cancelled) break;

      const next = applyMove(state, row, col);

      let outcome: 'win' | 'loss' | 'draw';
      let movesToEnd: number;

      if (next.status.type !== 'playing') {
        if (next.status.type === 'draw') {
          outcome = 'draw';
          movesToEnd = 1;
        } else {
          outcome = next.status.winner === state.currentPlayer ? 'win' : 'loss';
          movesToEnd = 1;
        }
      } else {
        const score = minimax(next, depth - 1, -INF, INF, totalMovesPlayed + 1, cancelToken);

        if (score === 0) {
          outcome = 'draw';
          movesToEnd = movesLeft;
        } else if (score > 0) {
          outcome = isVanilla ? 'win' : 'loss';
          movesToEnd = WIN - score;
        } else {
          outcome = isVanilla ? 'loss' : 'win';
          movesToEnd = WIN + score;
        }
      }

      analyses.push({ row, col, outcome, movesToEnd, depth });
    }

    if (!cancelToken.cancelled) {
      currentAnalyses = analyses;
      const result: SolverResult = { analyses, depth, complete: depth === maxDepth || depth >= movesLeft };
      if (onPartial) onPartial(result);

      // If we found a forced win/loss for all moves, no need to go deeper
      if (analyses.every(a => a.outcome !== 'draw')) {
        return { ...result, complete: true };
      }

      if (result.complete) break;
    }
  }

  return {
    analyses: currentAnalyses,
    depth: currentAnalyses[0]?.depth ?? 0,
    complete: !cancelToken.cancelled && currentAnalyses[0]?.depth >= movesLeft,
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
  const wins = analyses.filter(a => a.outcome === 'win').sort((a, b) => a.movesToEnd - b.movesToEnd);
  if (wins.length > 0) return [wins[0].row, wins[0].col];

  const draws = analyses.filter(a => a.outcome === 'draw');
  if (draws.length > 0) return [draws[0].row, draws[0].col];

  const losses = analyses.filter(a => a.outcome === 'loss').sort((a, b) => b.movesToEnd - a.movesToEnd);
  return [losses[0].row, losses[0].col];
}
