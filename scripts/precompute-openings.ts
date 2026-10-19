// Solves every first move of every distinct board layout and writes src/solver/openingBook.json.
// 4 tile patterns, each used once in some quadrant at some rotation: 4! * 4^4 = 6,144 configs, which are
// 1,536 distinct boards once whole-board rotations are merged. Keys are the canonical (smallest) arrow
// string among the 4 rotations; values list the 36 first moves row-major as W (win), = (draw), L (loss).
// Progress is checkpointed, so an interrupted run resumes where it stopped.
//   node --experimental-strip-types scripts/precompute-openings.ts [threads]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createBoard } from '../src/game/board.ts';
import type { BoardConfig, GameState } from '../src/game/types.ts';
import { canonicalLayout } from '../src/solver/openingBook.ts';
import { createThreadPool } from '../server/enginePool.ts';

const outPath = new URL('../src/solver/openingBook.json', import.meta.url);
const perms = (a: number[]): number[][] =>
  a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p]));

const layouts = new Set<string>();
for (const order of perms([0, 1, 2, 3])) {
  for (let rot = 0; rot < 256; rot++) {
    const config = { quadrants: order.map((patternId, q) => ({ patternId, rotation: (rot >> (2 * q)) & 3 })) } as BoardConfig;
    layouts.add(canonicalLayout(createBoard(config).flat().map(c => c.direction).join('')).dirs);
  }
}
console.log(`${layouts.size} distinct layouts`);

const book: Record<string, string> = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : {};
const todo = [...layouts].sort().filter(d => !book[d]);
const { pool, close } = createThreadPool(process.argv[2] ? Number(process.argv[2]) : undefined, { ttLog2: 21, dtLog2: 10 });
const save = () => writeFileSync(outPath, JSON.stringify(Object.fromEntries(Object.entries(book).sort())) + '\n');
const t0 = Date.now();

for (const [n, dirs] of todo.entries()) {
  const board = Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, c) => ({ direction: dirs[r * 6 + c] as 'H', piece: null })));
  const state: GameState = { board, currentPlayer: 'vanilla', constrainedLine: null, vanillaLeft: 15, chocolateLeft: 15, status: { type: 'playing' } };
  const result = await pool.analyze(state, undefined, { distances: false }).done;
  book[dirs] = result.analyses.map(a => a.outcome === 'win' ? 'W' : a.outcome === 'draw' ? '=' : 'L').join('');
  if (n % 10 === 9 || n === todo.length - 1) {
    save();
    const per = (Date.now() - t0) / (n + 1);
    console.log(`${Object.keys(book).length}/${layouts.size} layouts, ${(per / 1000).toFixed(1)} s each, ~${Math.round(per * (todo.length - n - 1) / 60000)} min left`);
  }
}
save();
await close();
