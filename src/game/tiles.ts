import type { Direction, TilePattern } from './types';

export const TILE_PATTERNS: TilePattern[] = [
  {
    id: 0,
    name: 'Pattern 1',
    grid: [
      ['A', 'H', 'V'],
      ['D', 'H', 'D'],
      ['A', 'V', 'V'],
    ],
  },
  {
    id: 1,
    name: 'Pattern 2',
    grid: [
      ['A', 'D', 'H'],
      ['H', 'V', 'V'],
      ['H', 'D', 'A'],
    ],
  },
  {
    id: 2,
    name: 'Pattern 3',
    grid: [
      ['D', 'V', 'D'],
      ['A', 'V', 'A'],
      ['A', 'H', 'H'],
    ],
  },
  {
    id: 3,
    name: 'Pattern 4',
    grid: [
      ['H', 'D', 'A'],
      ['V', 'A', 'H'],
      ['A', 'D', 'V'],
    ],
  },
  {
    id: 4,
    name: 'Pattern 5',
    grid: [
      ['H', 'A', 'H'],
      ['V', 'V', 'H'],
      ['D', 'A', 'D'],
    ],
  },
  // Patterns 6-8 to be added when discovered
  {
    id: 5,
    name: 'Pattern 6 (TBD)',
    grid: [
      ['H', 'H', 'H'],
      ['H', 'H', 'H'],
      ['H', 'H', 'H'],
    ],
  },
  {
    id: 6,
    name: 'Pattern 7 (TBD)',
    grid: [
      ['V', 'V', 'V'],
      ['V', 'V', 'V'],
      ['V', 'V', 'V'],
    ],
  },
  {
    id: 7,
    name: 'Pattern 8 (TBD)',
    grid: [
      ['D', 'D', 'D'],
      ['D', 'D', 'D'],
      ['D', 'D', 'D'],
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
        // 90° CW: new[c][2-r] = old[r][c]
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
