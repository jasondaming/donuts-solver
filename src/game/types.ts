export type Direction = 'H' | 'V' | 'D' | 'A';
// H = horizontal row, V = vertical column, D = diagonal (\), A = anti-diagonal (/)

export type Player = 'vanilla' | 'chocolate';
export type CellContent = Player | null;

export interface Cell {
  direction: Direction;
  piece: CellContent;
}

export type Board = Cell[][];  // [6][6]

// Which line the next player is constrained to
// H: index = row (0-5)
// V: index = col (0-5)
// D: index = row - col (-5 to 5)
// A: index = row + col (0 to 10)
export interface ConstrainedLine {
  dir: Direction;
  index: number;
}

export interface Move {
  row: number;
  col: number;
}

export type GameStatus =
  | { type: 'playing' }
  | { type: 'won'; winner: Player; winLine: [number, number][] }
  | { type: 'draw' };

export interface GameState {
  board: Board;
  currentPlayer: Player;
  constrainedLine: ConstrainedLine | null;  // null = free choice
  vanillaLeft: number;
  chocolateLeft: number;
  status: GameStatus;
}

export interface MoveRecord {
  row: number;
  col: number;
  player: Player;
  flipped: [number, number][];
  wasDisobedience: boolean;
  prevConstraint: ConstrainedLine | null;
}

export interface MoveAnalysis {
  row: number;
  col: number;
  outcome: 'win' | 'loss' | 'draw';
  movesToEnd: number;
  depth: number;  // search depth this result came from
}

export interface TilePattern {
  id: number;
  name: string;
  grid: Direction[][];  // 3x3
}

export interface QuadrantConfig {
  patternId: number;   // 0-7
  rotation: 0 | 1 | 2 | 3;  // 0=0°, 1=90°CW, 2=180°, 3=270°CW
}

export interface BoardConfig {
  quadrants: [QuadrantConfig, QuadrantConfig, QuadrantConfig, QuadrantConfig];
  // TL, TR, BL, BR
}

export type GameMode = 'hvh' | 'hva' | 'avh';
// hvh = human vs human, hva = human(vanilla) vs AI(chocolate), avh = AI(vanilla) vs human(chocolate)
