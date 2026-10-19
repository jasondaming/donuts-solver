// Independently checks a winning-strategy file produced by wdl.exe using the app's own JS rules
// (src/game/engine.ts). The strategy gives one move for every position where the winner moves;
// every reply of the loser must be covered and every line must end in a win for the winner.
//   node --experimental-strip-types verify-proof.ts <proof.txt> [36 arrow chars] [start sequence]
import { readFileSync } from 'node:fs';
import { applyMove, getValidMoves } from '../../src/game/engine.ts';
import type { Board, ConstrainedLine, GameState, Player } from '../../src/game/types.ts';

const [proofPath, dirs = 'DVDAHVAVADHDAHHAVVHDAADHVAHVVHADVHDA', startSeq = ''] = process.argv.slice(2);
const strategy = new Map<string, number>();
for (const line of readFileSync(proofPath, 'utf8').split(/\r?\n/)) {
  if (!line) continue;
  const [board, lineId, move] = line.split('|');
  strategy.set(`${board}|${lineId}`, Number(move));
}

function lineId(l: ConstrainedLine | null): number {
  if (!l) return -1;
  return l.dir === 'H' ? l.index : l.dir === 'V' ? 6 + l.index : l.dir === 'D' ? 12 + l.index + 5 : 23 + l.index;
}
function key(s: GameState): string {
  let b = '';
  for (const row of s.board) for (const cell of row) b += cell.piece === 'vanilla' ? '1' : cell.piece === 'chocolate' ? '2' : '0';
  return `${b}|${lineId(s.constrainedLine)}`;
}

const board: Board = Array.from({ length: 6 }, (_, r) =>
  Array.from({ length: 6 }, (_, c) => ({ direction: dirs[r * 6 + c] as 'H' | 'V' | 'D' | 'A', piece: null })));
let root: GameState = { board, currentPlayer: 'vanilla', constrainedLine: null, vanillaLeft: 15, chocolateLeft: 15, status: { type: 'playing' } };
for (const m of startSeq.split(',').filter(Boolean).map(Number)) root = applyMove(root, Math.floor(m / 6), m % 6);

const winner: Player = strategy.has(key(root)) ? root.currentPlayer : root.currentPlayer === 'vanilla' ? 'chocolate' : 'vanilla';
const verified = new Set<string>();
let positions = 0;

function fail(msg: string, s: GameState): never {
  throw new Error(`${msg} at ${key(s)}`);
}

function check(s: GameState): void {
  const k = key(s);
  if (verified.has(k)) return;
  positions++;
  const legal = getValidMoves(s);
  if (s.currentPlayer === winner) {
    const m = strategy.get(k);
    if (m === undefined) fail('strategy has no move', s);
    const r = Math.floor(m / 6), c = m % 6;
    if (!legal.some(([lr, lc]) => lr === r && lc === c)) fail(`strategy move ${m} is illegal`, s);
    visit(applyMove(s, r, c));
  } else {
    for (const [r, c] of legal) visit(applyMove(s, r, c));
  }
  verified.add(k);
}

function visit(n: GameState): void {
  if (n.status.type === 'won') {
    if (n.status.winner !== winner) fail('loser wins', n);
    return;
  }
  if (n.status.type === 'draw') fail('line ends in a draw', n);
  check(n);
}

const t = Date.now();
check(root);
console.log(`VERIFIED: ${winner} wins from ${startSeq ? 'after moves ' + startSeq : 'the empty board'}. ${positions} distinct positions checked with the app's JS rules in ${Date.now() - t} ms; strategy entries: ${strategy.size}`);
