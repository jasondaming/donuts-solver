// Cross-checks the WebAssembly engine and the SolverPool against plain searches over the app's JS rules.
//   node --experimental-strip-types scripts/validate-engine.ts [seed]
// 1. perft 1-7 from the empty board (engine vs JS move generation)
// 2. per-move win/draw/loss at plies 14-22 of random games (pool vs JS alpha-beta)
// 3. per-move "win/loss in N" at plies 20-23 (pool vs exhaustive JS minimax with distances)
// 4. arbitrary editor-style positions: random arrows, random pieces of both colors, either side to move,
//    any constrained line (pool vs JS alpha-beta)
import { applyMove, getValidMoves } from '../src/game/engine.ts';
import { checkWin } from '../src/game/winCheck.ts';
import type { Board, ConstrainedLine, Direction, GameState, MoveAnalysis } from '../src/game/types.ts';
import { getConstrainedLine } from '../src/game/board.ts';
import { createWdlEngine, toEnginePosition } from '../src/solver/wdlEngine.ts';
import { createThreadPool } from '../server/enginePool.ts';

const MAY = 'DVDAHVAVADHDAHHAVVHDAADHVAHVVHADVHDA';
let seed = Number(process.argv[2] ?? 7);
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x80000000;
}

function emptyState(dirs: string): GameState {
  const board: Board = Array.from({ length: 6 }, (_, r) =>
    Array.from({ length: 6 }, (_, c) => ({ direction: dirs[r * 6 + c] as Direction, piece: null })));
  return { board, currentPlayer: 'vanilla', constrainedLine: null, vanillaLeft: 15, chocolateLeft: 15, status: { type: 'playing' } };
}

function randomGame(dirs: string, ply: number): GameState | null {
  let s = emptyState(dirs);
  for (let i = 0; i < ply; i++) {
    const legal = getValidMoves(s);
    const [r, c] = legal[Math.floor(rand() * legal.length)];
    s = applyMove(s, r, c);
    if (s.status.type !== 'playing') return null;
  }
  return s;
}

function randomEditorPosition(pieces: number): GameState | null {
  const dirs = Array.from({ length: 36 }, () => 'HVDA'[Math.floor(rand() * 4)]).join('');
  const s = emptyState(dirs);
  const cells = [...Array(36).keys()].sort(() => rand() - 0.5).slice(0, pieces);
  const vanilla = Math.ceil(pieces / 2) - (rand() < 0.5 ? 0 : pieces % 2);   // either side may be one ahead
  cells.forEach((cell, k) => { s.board[Math.floor(cell / 6)][cell % 6].piece = k < vanilla ? 'vanilla' : 'chocolate'; });
  const chocolate = pieces - vanilla;
  if (checkWin(s.board, 'vanilla') || checkWin(s.board, 'chocolate')) return null;
  s.vanillaLeft = 15 - vanilla;
  s.chocolateLeft = 15 - chocolate;
  // The side with more donuts left moves (ties: either), as in a real game.
  s.currentPlayer = s.vanillaLeft > s.chocolateLeft ? 'vanilla' : s.chocolateLeft > s.vanillaLeft ? 'chocolate' : rand() < 0.5 ? 'vanilla' : 'chocolate';
  const last = cells[Math.floor(rand() * cells.length)];
  const line: ConstrainedLine | null = rand() < 0.15 ? null : getConstrainedLine(dirs[last] as Direction, Math.floor(last / 6), last % 6);
  s.constrainedLine = line;
  return s;
}

// Plain negamax alpha-beta over the JS rules, no tables: 1 win, 0 draw, -1 loss for the side to move.
function wdl(s: GameState, alpha: number, beta: number): number {
  let best = -2;
  for (const [r, c] of getValidMoves(s)) {
    const v = childValue(s, r, c, -beta, -alpha);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}
function childValue(s: GameState, r: number, c: number, alpha = -1, beta = 1): number {
  const n = applyMove(s, r, c);
  if (n.status.type === 'won') return n.status.winner === s.currentPlayer ? 1 : -1;
  if (n.status.type === 'draw') return 0;
  return -wdl(n, alpha, beta);
}

// Exhaustive minimax with distances: [value, plies to the end] for the side to move.
function dtm(s: GameState, memo: Map<string, [number, number]>): [number, number] {
  const k = JSON.stringify([s.board.map(row => row.map(x => x.piece?.[0] ?? '-').join('')), s.currentPlayer, s.constrainedLine]);
  const hit = memo.get(k);
  if (hit) return hit;
  let best: [number, number] | null = null;
  for (const [r, c] of getValidMoves(s)) {
    const cand = moveDtm(s, r, c, memo);
    if (!best || better(cand, best)) best = cand;
  }
  memo.set(k, best!);
  return best!;
}
function moveDtm(s: GameState, r: number, c: number, memo: Map<string, [number, number]>): [number, number] {
  const n = applyMove(s, r, c);
  if (n.status.type === 'won') return [n.status.winner === s.currentPlayer ? 1 : -1, 1];
  if (n.status.type === 'draw') return [0, 1];
  const [v, d] = dtm(n, memo);
  return [-v, d + 1];
}
function better(a: [number, number], b: [number, number]): boolean {
  if (a[0] !== b[0]) return a[0] > b[0];
  return a[0] > 0 ? a[1] < b[1] : a[0] < 0 ? a[1] > b[1] : false;
}

const outcomeValue = (a: MoveAnalysis) => a.outcome === 'win' ? 1 : a.outcome === 'loss' ? -1 : a.outcome === 'draw' ? 0 : null;
let failures = 0;
function fail(msg: string) {
  failures++;
  if (failures <= 10) console.log(`  MISMATCH ${msg}`);
}

// 1. perft
const engine = await createWdlEngine({ ttLog2: 18, dtLog2: 16 });
const perftJs = (s: GameState, d: number, acc: { leaves: number; terminals: number }): void => {
  if (s.status.type !== 'playing') { acc.terminals++; return; }
  if (d === 0) { acc.leaves++; return; }
  for (const [r, c] of getValidMoves(s)) perftJs(applyMove(s, r, c), d - 1, acc);
};
for (let d = 1; d <= 7; d++) {
  const js = { leaves: 0, terminals: 0 };
  perftJs(emptyState(MAY), d, js);
  const wasm = engine.perft(toEnginePosition(emptyState(MAY)), d);
  if (js.leaves !== wasm.leaves || js.terminals !== wasm.terminals) fail(`perft ${d}: js ${JSON.stringify(js)} wasm ${JSON.stringify(wasm)}`);
  if (d === 7) console.log(`perft 1-7: engine matches JS (depth 7: ${wasm.leaves} leaves, ${wasm.terminals} terminals)`);
}

const { pool, close } = createThreadPool();
const solve = (s: GameState) => pool.analyze(s).done;

// 2. values in random games
let checkedMoves = 0, checkedPositions = 0;
for (const ply of [12, 14, 16, 18, 20, 22]) {
  for (let n = 0; n < 30;) {
    const s = randomGame(MAY, ply);
    if (!s) continue;
    n++;
    checkedPositions++;
    const result = await solve(s);
    const legal = getValidMoves(s);
    if (legal.length !== result.analyses.length) fail(`move count at ply ${ply}`);
    for (const a of result.analyses) {
      checkedMoves++;
      const truth = childValue(s, a.row, a.col);
      if (!a.proven || outcomeValue(a) !== truth) fail(`ply ${ply} move (${a.row},${a.col}): pool ${a.outcome} truth ${truth}`);
    }
  }
}
console.log(`values: ${checkedMoves} moves in ${checkedPositions} random-game positions (plies 12-22) match JS alpha-beta`);

// 3. distances
let distChecked = 0, distUnknown = 0;
for (const ply of [20, 21, 22, 23]) {
  for (let n = 0; n < 25;) {
    const s = randomGame(MAY, ply);
    if (!s) continue;
    n++;
    const result = await solve(s);
    const memo = new Map<string, [number, number]>();
    for (const a of result.analyses) {
      const [v, d] = moveDtm(s, a.row, a.col, memo);
      if (outcomeValue(a) !== v) fail(`dtm value ply ${ply} (${a.row},${a.col})`);
      if (v === 0) continue;
      if (a.movesToEnd === null) { distUnknown++; continue; }
      distChecked++;
      if (a.movesToEnd !== d) fail(`ply ${ply} move (${a.row},${a.col}) ${a.outcome}: pool in ${a.movesToEnd}, truth in ${d}`);
    }
  }
}
console.log(`distances: ${distChecked} win/loss-in-N values at plies 20-23 match exhaustive JS minimax (${distUnknown} left unknown)`);

// 4. arbitrary editor positions
let editorMoves = 0, editorPositions = 0, draws = 0;
for (const pieces of [16, 18, 20, 22, 24, 26]) {
  for (let n = 0; n < 40;) {
    const s = randomEditorPosition(pieces);
    if (!s || getValidMoves(s).length === 0) continue;
    n++;
    editorPositions++;
    const result = await solve(s);
    for (const a of result.analyses) {
      editorMoves++;
      const truth = childValue(s, a.row, a.col);
      if (truth === 0) draws++;
      if (outcomeValue(a) !== truth) fail(`editor ${pieces} pieces move (${a.row},${a.col}): pool ${a.outcome} truth ${truth}`);
    }
  }
}
console.log(`editor positions: ${editorMoves} moves in ${editorPositions} random arbitrary positions match JS alpha-beta (${draws} draws)`);

await close();
console.log(failures ? `FAILED: ${failures} mismatches` : 'ALL CHECKS PASSED');
process.exitCode = failures ? 1 : 0;
