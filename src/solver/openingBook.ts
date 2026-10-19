// Precomputed first-move values for every board layout (scripts/precompute-openings.ts), so the empty
// board shows proven wins and losses instantly. The book is loaded lazily to keep it out of the main bundle.
import type { GameState, MoveAnalysis } from '../game/types';

const ROTATE_DIR: Record<string, string> = { H: 'V', V: 'H', D: 'A', A: 'D' };

// Rotates a row-major 6x6 arrow string 90 degrees clockwise: cell (r, c) moves to (c, 5 - r).
function rotateDirs(dirs: string): string {
  const out = Array<string>(36);
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) out[c * 6 + (5 - r)] = ROTATE_DIR[dirs[r * 6 + c]];
  return out.join('');
}

// The smallest of the 4 rotations, and how many clockwise quarter turns map `dirs` onto it.
export function canonicalLayout(dirs: string): { dirs: string; turns: number } {
  let best = { dirs, turns: 0 };
  let cur = dirs;
  for (let turns = 1; turns < 4; turns++) {
    cur = rotateDirs(cur);
    if (cur < best.dirs) best = { dirs: cur, turns };
  }
  return best;
}

export function isOpeningPosition(state: GameState): boolean {
  return state.status.type === 'playing' && state.currentPlayer === 'vanilla' && !state.constrainedLine
    && state.vanillaLeft === 15 && state.chocolateLeft === 15 && state.board.every(row => row.every(cell => !cell.piece));
}

let book: Promise<Record<string, string>> | null = null;

// First-move analyses for an empty board, or null if the layout is not in the book.
export async function lookupOpening(state: GameState): Promise<MoveAnalysis[] | null> {
  if (!isOpeningPosition(state)) return null;
  book ??= import('./openingBook.json').then(m => m.default as Record<string, string>);
  const dirs = state.board.flat().map(cell => cell.direction).join('');
  const { dirs: key, turns } = canonicalLayout(dirs);
  const values = (await book)[key];
  if (!values) return null;
  return Array.from({ length: 36 }, (_, i) => {
    // Cell i of this board sits at (c, 5 - r) after each clockwise turn.
    let r = Math.floor(i / 6), c = i % 6;
    for (let t = 0; t < turns; t++) [r, c] = [c, 5 - r];
    const v = values[r * 6 + c];
    const outcome = v === 'W' ? 'win' : v === '=' ? 'draw' : 'loss';
    const score = outcome === 'win' ? 9900 : outcome === 'loss' ? -9900 : 0;
    return { row: Math.floor(i / 6), col: i % 6, outcome, movesToEnd: null, depth: 30, proven: true, score };
  });
}
