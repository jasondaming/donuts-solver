// Solves a position with the thread pool and prints every move's value as it streams in.
//   node --experimental-strip-types scripts/solve-position.ts [36 arrow chars] [moves r*6+c,...] [threads]
import { applyMove } from '../src/game/engine.ts';
import type { Board, GameState } from '../src/game/types.ts';
import { createThreadPool } from '../server/enginePool.ts';

const [dirs = 'DVDAHVAVADHDAHHAVVHDAADHVAHVVHADVHDA', seq = '', threads] = process.argv.slice(2);
const board: Board = Array.from({ length: 6 }, (_, r) =>
  Array.from({ length: 6 }, (_, c) => ({ direction: dirs[r * 6 + c] as 'H' | 'V' | 'D' | 'A', piece: null })));
let state: GameState = { board, currentPlayer: 'vanilla', constrainedLine: null, vanillaLeft: 15, chocolateLeft: 15, status: { type: 'playing' } };
for (const m of seq.split(',').filter(Boolean).map(Number)) state = applyMove(state, Math.floor(m / 6), m % 6);

const { pool, close } = createThreadPool(threads ? Number(threads) : undefined);
let wdlAt = 0;
const result = await pool.analyze(state, r => {
  if (!wdlAt && r.stats && r.stats.movesSolved === r.stats.moveCount) wdlAt = r.stats.elapsedMs;
}).done;
const fmt = (o: string) => o === 'win' ? 'W' : o === 'loss' ? '.' : o === 'draw' ? '=' : '?';
const grid = Array.from({ length: 6 }, () => Array(6).fill(' '));
for (const a of result.analyses) grid[a.row][a.col] = fmt(a.outcome);
console.log(grid.map(row => ' ' + row.join(' ')).join('\n'));
console.log(result.analyses.map(a => `(${a.row},${a.col}) ${a.outcome}${a.movesToEnd ? ' in ' + a.movesToEnd : ''}`).join('; '));
console.log(`all moves proven in ${wdlAt} ms; distances done in ${result.stats?.elapsedMs} ms; ${result.stats?.nodesVisited} nodes`);
await close();
