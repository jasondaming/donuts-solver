import type { Board, BoardConfig, Cell, ConstrainedLine, Direction } from './types';
import { getTileGrid } from './tiles';

const QUADRANT_OFFSETS: [number, number][] = [
  [0, 0], // TL
  [0, 3], // TR
  [3, 0], // BL
  [3, 3], // BR
];

export function createBoard(config: BoardConfig): Board {
  const board: Board = Array.from({ length: 6 }, () =>
    Array.from({ length: 6 }, (): Cell => ({ direction: 'H', piece: null }))
  );

  for (let q = 0; q < 4; q++) {
    const { patternId, rotation } = config.quadrants[q];
    const grid = getTileGrid(patternId, rotation);
    const [rowOff, colOff] = QUADRANT_OFFSETS[q];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        board[rowOff + r][colOff + c] = { direction: grid[r][c], piece: null };
      }
    }
  }
  return board;
}

export function deepCloneBoard(board: Board): Board {
  return board.map(row => row.map(cell => ({ ...cell })));
}

export function getConstrainedLine(dir: Direction, row: number, col: number): ConstrainedLine {
  switch (dir) {
    case 'H': return { dir, index: row };
    case 'V': return { dir, index: col };
    case 'D': return { dir, index: row - col };
    case 'A': return { dir, index: row + col };
  }
}

export function getCellsOnLine(line: ConstrainedLine): [number, number][] {
  const cells: [number, number][] = [];
  const { dir, index } = line;
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      const matches =
        (dir === 'H' && r === index) ||
        (dir === 'V' && c === index) ||
        (dir === 'D' && r - c === index) ||
        (dir === 'A' && r + c === index);
      if (matches) cells.push([r, c]);
    }
  }
  return cells;
}

export function isOnLine(line: ConstrainedLine, row: number, col: number): boolean {
  const { dir, index } = line;
  switch (dir) {
    case 'H': return row === index;
    case 'V': return col === index;
    case 'D': return row - col === index;
    case 'A': return row + col === index;
  }
}
