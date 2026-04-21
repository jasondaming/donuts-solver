import type { Direction, TilePattern } from './types';

// 4 unique tile face patterns. Each physical tile can be placed in any of the
// 4 board quadrants at any of 4 rotations (0°/90°/180°/270° CW).
// Note: patterns that look different are just rotations of one of these 4.
// Verified: the apparent "5th pattern" is Pattern 1 rotated 270° CW.
export const TILE_PATTERNS: TilePattern[] = [
  {
    id: 0,
    name: 'Tile A',
    grid: [
      ['A', 'H', 'V'],
      ['D', 'H', 'D'],
      ['A', 'V', 'V'],
    ],
  },
  {
    id: 1,
    name: 'Tile B',
    grid: [
      ['A', 'D', 'H'],
      ['H', 'V', 'V'],
      ['H', 'D', 'A'],
    ],
  },
  {
    id: 2,
    name: 'Tile C',
    grid: [
      ['D', 'V', 'D'],
      ['A', 'V', 'A'],
      ['A', 'H', 'H'],
    ],
  },
  {
    id: 3,
    name: 'Tile D',
    grid: [
      ['H', 'D', 'A'],
      ['V', 'A', 'H'],
      ['A', 'D', 'V'],
    ],
  },
];

function rotateDir90(dir: Direction): Direction {
  switch (dir) {
    case 'H': return 'V';
    case 'V': return 'H';
    case 'D': return 'A';
    case 'A': return 'D';
  }
}

export function rotateTile(grid: Direction[][], times: number): Direction[][] {
  let g = grid;
  for (let t = 0; t < (times % 4); t++) {
    const next: Direction[][] = Array.from({ length: 3 }, () => Array(3).fill('H'));
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        // 90° CW: new[c][2-r] = rotateDir(old[r][c])
        next[c][2 - r] = rotateDir90(g[r][c]);
      }
    }
    g = next;
  }
  return g;
}

export function getTileGrid(patternId: number, rotation: 0 | 1 | 2 | 3): Direction[][] {
  const pattern = TILE_PATTERNS.find(p => p.id === patternId) ?? TILE_PATTERNS[0];
  return rotateTile(pattern.grid, rotation);
}
