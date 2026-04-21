import type { Board, Player } from './types';

// Check both sides of each of the 4 axes through (row, col)
const AXES: [[number, number], [number, number]][] = [
  [[0, 1], [0, -1]],   // Horizontal
  [[1, 0], [-1, 0]],   // Vertical
  [[1, 1], [-1, -1]],  // Diagonal \
  [[1, -1], [-1, 1]],  // Anti-diagonal /
];

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 6 && c >= 0 && c < 6;
}

// After placing player's piece at (row,col), detect and apply insertions.
// Returns list of flipped [row,col] pairs.
export function applyInsertions(board: Board, row: number, col: number, player: Player): [number, number][] {
  const opponent: Player = player === 'vanilla' ? 'chocolate' : 'vanilla';
  const flipped: [number, number][] = [];

  for (const [[dr1, dc1], [dr2, dc2]] of AXES) {
    // Walk direction 1 through contiguous player cells
    let r1 = row + dr1, c1 = col + dc1;
    while (inBounds(r1, c1) && board[r1][c1].piece === player) {
      r1 += dr1; c1 += dc1;
    }
    const end1Opp = inBounds(r1, c1) && board[r1][c1].piece === opponent;

    // Walk direction 2 through contiguous player cells
    let r2 = row + dr2, c2 = col + dc2;
    while (inBounds(r2, c2) && board[r2][c2].piece === player) {
      r2 += dr2; c2 += dc2;
    }
    const end2Opp = inBounds(r2, c2) && board[r2][c2].piece === opponent;

    if (end1Opp && end2Opp) {
      board[r1][c1].piece = player;
      board[r2][c2].piece = player;
      flipped.push([r1, c1], [r2, c2]);
    }
  }

  return flipped;
}
