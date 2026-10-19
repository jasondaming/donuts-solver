// Writes the winner's complete strategy from a position, found with the WebAssembly engine, in the format
// experiments/native-wdl/verify-proof.ts checks with the app's own rules (board|line|move per winner node).
//   node --experimental-strip-types scripts/export-proof.ts <out.txt> [36 arrow chars] [moves r*6+c,...]
import { writeFileSync } from 'node:fs';
import { applyMove, getValidMoves } from '../src/game/engine.ts';
import type { Board, GameState, Player } from '../src/game/types.ts';
import { createWdlEngine, lineId, toEnginePosition } from '../src/solver/wdlEngine.ts';

const [outPath, dirs = 'DVDAHVAVADHDAHHAVVHDAADHVAHVVHADVHDA', seq = ''] = process.argv.slice(2);
if (!outPath) throw new Error('usage: export-proof.ts <out.txt> [dirs] [moves]');
const board: Board = Array.from({ length: 6 }, (_, r) =>
  Array.from({ length: 6 }, (_, c) => ({ direction: dirs[r * 6 + c] as 'H' | 'V' | 'D' | 'A', piece: null })));
let root: GameState = { board, currentPlayer: 'vanilla', constrainedLine: null, vanillaLeft: 15, chocolateLeft: 15, status: { type: 'playing' } };
for (const m of seq.split(',').filter(Boolean).map(Number)) root = applyMove(root, Math.floor(m / 6), m % 6);

const engine = await createWdlEngine({ ttLog2: 22, dtLog2: 16 });
const value = (s: GameState, r: number, c: number) => engine.run(toEnginePosition(s), { kind: 'value', cell: r * 6 + c }).result;

function key(s: GameState): string {
  let b = '';
  for (const row of s.board) for (const cell of row) b += cell.piece === 'vanilla' ? '1' : cell.piece === 'chocolate' ? '2' : '0';
  return `${b}|${lineId(s.constrainedLine)}`;
}

const t = Date.now();
const rootMoves = getValidMoves(root).map(([r, c]) => value(root, r, c));
const rootValue = Math.max(...rootMoves);
if (rootValue === 0) throw new Error('The position is a draw: there is no single-winner strategy to export');
const winner: Player = rootValue > 0 ? root.currentPlayer : root.currentPlayer === 'vanilla' ? 'chocolate' : 'vanilla';
const lines: string[] = [];
const seen = new Set<string>();

// Depth-first over the proof tree with an explicit stack (the tree can be a million nodes).
const stack: GameState[] = [root];
while (stack.length) {
  const s = stack.pop()!;
  const k = key(s);
  if (seen.has(k)) continue;
  seen.add(k);
  const moves = getValidMoves(s);
  const next = s.currentPlayer === winner
    ? (() => {
      const m = moves.find(([r, c]) => value(s, r, c) === 1);
      if (!m) throw new Error(`no winning move at ${k}`);
      lines.push(`${k}|${m[0] * 6 + m[1]}`);
      return [applyMove(s, m[0], m[1])];
    })()
    : moves.map(([r, c]) => applyMove(s, r, c));
  for (const n of next) if (n.status.type === 'playing') stack.push(n);
}

writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`${winner} wins; strategy for ${lines.length} winner positions, ${seen.size} positions visited, ${Date.now() - t} ms -> ${outPath}`);
