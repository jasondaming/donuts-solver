// Cross-checks against the app's JS engine and solver (board: the README default):
//   perft  <depth>                 -> node counts from the empty board (compare with `wdl perft`)
//   dump   <ply> <count> <seed>    -> random positions as move sequences (stdin for `wdl`)
//   truth  <ply> <count> <seed>    -> "seq;v,v,..." per-move values from plain JS alpha-beta (compare with `wdl values`)
//   verify <ply> <count> <seed>    -> compare the app's analyzePosition outcomes with that reference
import { applyMove, getValidMoves } from '../../src/game/engine.ts';
import { analyzePosition } from '../../src/solver/solver.ts';
import type { Board, GameState } from '../../src/game/types.ts';

const DIRS = [
  'DVDAHV',
  'AVADHD',
  'AHHAVV',
  'HDAADH',
  'VAHVVH',
  'ADVHDA',
];

function emptyState(): GameState {
  const board: Board = DIRS.map(row => [...row].map(d => ({ direction: d as 'H' | 'V' | 'D' | 'A', piece: null })));
  return { board, currentPlayer: 'vanilla', constrainedLine: null, vanillaLeft: 15, chocolateLeft: 15, status: { type: 'playing' } };
}

let seed = 1;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x80000000;
}

function randomPosition(ply: number): { state: GameState; moves: [number, number][] } | null {
  let s = emptyState();
  const moves: [number, number][] = [];
  for (let i = 0; i < ply; i++) {
    const legal = getValidMoves(s);
    if (legal.length === 0) return null;
    const m = legal[Math.floor(rand() * legal.length)];
    moves.push(m);
    s = applyMove(s, m[0], m[1]);
    if (s.status.type !== 'playing') return null;
  }
  return { state: s, moves };
}

function perft(s: GameState, depth: number, acc: { leaves: number; terminals: number }) {
  if (s.status.type !== 'playing') { acc.terminals++; return; }
  if (depth === 0) { acc.leaves++; return; }
  for (const [r, c] of getValidMoves(s)) perft(applyMove(s, r, c), depth - 1, acc);
}

let refNodes = 0;
// Negamax WDL from the side-to-move perspective: 1 win, 0 draw, -1 loss. Plain alpha-beta, no TT.
function wdl(s: GameState, alpha: number, beta: number): number {
  refNodes++;
  let best = -2;
  for (const [r, c] of getValidMoves(s)) {
    const n = applyMove(s, r, c);
    let v: number;
    if (n.status.type === 'won') v = n.status.winner === s.currentPlayer ? 1 : -1;
    else if (n.status.type === 'draw') v = 0;
    else v = -wdl(n, -beta, -alpha);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function childValue(s: GameState, r: number, c: number): number {
  const n = applyMove(s, r, c);
  if (n.status.type === 'won') return n.status.winner === s.currentPlayer ? 1 : -1;
  if (n.status.type === 'draw') return 0;
  return -wdl(n, -1, 1);
}

const [cmd, a1, a2, a3] = process.argv.slice(2);
if (cmd === 'perft') {
  for (let d = 1; d <= Number(a1); d++) {
    const acc = { leaves: 0, terminals: 0 };
    const t = Date.now();
    perft(emptyState(), d, acc);
    console.log(`perft ${d}: leaves=${acc.leaves} terminals=${acc.terminals} (${Date.now() - t} ms)`);
  }
} else if (cmd === 'verify' || cmd === 'dump' || cmd === 'truth') {
  const ply = Number(a1), count = Number(a2);
  seed = Number(a3 ?? 1);
  let checked = 0, mismatches = 0, falseDraws = 0, solverMs = 0, solverNodes = 0, partialWrong = 0, earlyComplete = 0;
  while (checked < count) {
    const pos = randomPosition(ply);
    if (!pos) continue;
    checked++;
    if (cmd === 'dump') { console.log(pos.moves.map(([r, c]) => r * 6 + c).join(',')); continue; }
    if (cmd === 'truth') {
      const vals = getValidMoves(pos.state).map(([r, c]) => childValue(pos.state, r, c));
      console.log(`${pos.moves.map(([r, c]) => r * 6 + c).join(',')};${vals.join(',')}`);
      continue;
    }
    const t = Date.now();
    const partials: { depth: number; analyses: typeof res.analyses }[] = [];
    const res = analyzePosition(pos.state, pos.state.vanillaLeft + pos.state.chocolateLeft, { cancelled: false },
      p => partials.push({ depth: p.depth, analyses: p.analyses }));
    solverMs += Date.now() - t;
    solverNodes += res.stats?.nodesVisited ?? 0;
    // Proven claims made in intermediate (depth-limited) iterations, as the UI would display them.
    for (const p of partials) {
      for (const a of p.analyses) {
        if (!a.proven) continue;
        const truth = childValue(pos.state, a.row, a.col);
        const claimed = a.outcome === 'win' ? 1 : a.outcome === 'loss' ? -1 : 0;
        if (claimed !== truth) {
          partialWrong++;
          if (partialWrong <= 5) console.log(`  wrong proven claim at d${p.depth}/${pos.state.vanillaLeft + pos.state.chocolateLeft}: moves=${pos.moves.map(([r, c]) => r * 6 + c).join(',')} move=(${a.row},${a.col}) solver=${a.outcome} truth=${truth}`);
        }
      }
    }
    if (res.depth < pos.state.vanillaLeft + pos.state.chocolateLeft && res.complete) earlyComplete++;
    for (const a of res.analyses) {
      const truth = childValue(pos.state, a.row, a.col);
      const claimed = a.outcome === 'win' ? 1 : a.outcome === 'loss' ? -1 : a.outcome === 'draw' ? 0 : null;
      if (claimed !== truth) {
        mismatches++;
        if (a.outcome === 'draw') falseDraws++;
        if (mismatches <= 5) console.log(`  mismatch: moves=${pos.moves.map(([r, c]) => r * 6 + c).join(',')} move=(${a.row},${a.col}) solver=${a.outcome}${a.proven ? '(proven)' : ''} truth=${truth}`);
      }
    }
  }
  if (cmd === 'verify') {
    console.log(`ply ${ply}: positions=${checked} finalMismatches=${mismatches} (false draws: ${falseDraws}); wrong proven claims in intermediate iterations: ${partialWrong}; finished early: ${earlyComplete}`);
    console.log(`  JS solver: ${solverNodes} nodes in ${solverMs} ms = ${Math.round(solverNodes / Math.max(1, solverMs))}k nodes/s; reference alpha-beta nodes: ${refNodes}`);
  }
}
