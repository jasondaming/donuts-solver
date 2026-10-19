import type { Board, CellContent, ConstrainedLine, Direction, GameState } from '../game/types';

export type Symmetry =
  | 'identity'
  | 'rot90'
  | 'rot180'
  | 'rot270'
  | 'flipH'
  | 'flipV'
  | 'diag'
  | 'antiDiag';

export interface EncodedStateKey {
  key: string;
  symmetry: Symmetry;
}

const BOARD_SIZE = 6;
const ALL_SYMMETRIES: Symmetry[] = [
  'identity',
  'rot90',
  'rot180',
  'rot270',
  'flipH',
  'flipV',
  'diag',
  'antiDiag',
];

const validSymmetryCache = new Map<string, Symmetry[]>();

export function encodeStateKey(state: GameState): EncodedStateKey {
  const boardSignature = encodeBoardDirections(state.board);
  const validSymmetries = getValidSymmetries(state.board, boardSignature);

  let bestKey = '';
  let bestSymmetry = validSymmetries[0] ?? 'identity';

  for (const symmetry of validSymmetries) {
    const key = buildKey(state, boardSignature, symmetry);
    if (!bestKey || key < bestKey) {
      bestKey = key;
      bestSymmetry = symmetry;
    }
  }

  return { key: bestKey, symmetry: bestSymmetry };
}

export function transformMove(move: [number, number], symmetry: Symmetry): [number, number] {
  return applySymmetryToCoord(symmetry, move[0], move[1]);
}

export function invertMove(move: [number, number], symmetry: Symmetry): [number, number] {
  return applySymmetryToCoord(inverseSymmetry(symmetry), move[0], move[1]);
}

function buildKey(state: GameState, boardSignature: string, symmetry: Symmetry): string {
  const pieces = new Array<string>(BOARD_SIZE * BOARD_SIZE);

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const [tr, tc] = applySymmetryToCoord(symmetry, r, c);
      const index = tr * BOARD_SIZE + tc;
      pieces[index] = encodePiece(state.board[r][c].piece);
    }
  }

  const parts = [
    boardSignature,
    state.currentPlayer,
    state.constrainedLine ? encodeConstrainedLine(state.constrainedLine, symmetry) : 'none',
    `${state.vanillaLeft}:${state.chocolateLeft}`,
    state.status.type,
    pieces.join(''),
  ];

  return parts.join('|');
}

function getValidSymmetries(board: Board, boardSignature: string): Symmetry[] {
  const cached = validSymmetryCache.get(boardSignature);
  if (cached) return cached;

  const valid = ALL_SYMMETRIES.filter(symmetry => isAutomorphism(board, symmetry));
  const result: Symmetry[] = valid.length > 0 ? valid : ['identity'];
  validSymmetryCache.set(boardSignature, result);
  return result;
}

function isAutomorphism(board: Board, symmetry: Symmetry): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const [tr, tc] = applySymmetryToCoord(symmetry, r, c);
      if (board[tr][tc].direction !== transformDirection(symmetry, board[r][c].direction)) {
        return false;
      }
    }
  }
  return true;
}

function encodeBoardDirections(board: Board): string {
  let key = '';
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      key += board[r][c].direction;
    }
  }
  return key;
}

function encodePiece(piece: CellContent): string {
  if (piece === null) return '0';
  return piece === 'vanilla' ? '1' : '2';
}

function encodeConstrainedLine(line: ConstrainedLine, symmetry: Symmetry): string {
  const transformed = transformConstrainedLine(line, symmetry);
  return `${transformed.dir}:${transformed.index}`;
}

function transformConstrainedLine(line: ConstrainedLine, symmetry: Symmetry): ConstrainedLine {
  const [a, b] = samplePointsForLine(line);
  const ta = applySymmetryToCoord(symmetry, a[0], a[1]);
  const tb = applySymmetryToCoord(symmetry, b[0], b[1]);
  return inferLineFromPoints(ta, tb);
}

function samplePointsForLine(line: ConstrainedLine): [[number, number], [number, number]] {
  switch (line.dir) {
    case 'H':
      return [[line.index, 0], [line.index, 1]];
    case 'V':
      return [[0, line.index], [1, line.index]];
    case 'D':
      return [[0, -line.index], [1, 1 - line.index]];
    case 'A':
      return [[0, line.index], [1, line.index - 1]];
  }
}

function inferLineFromPoints(
  a: [number, number],
  b: [number, number],
): ConstrainedLine {
  if (a[0] === b[0]) return { dir: 'H', index: a[0] };
  if (a[1] === b[1]) return { dir: 'V', index: a[1] };

  const diffA = a[0] - a[1];
  const diffB = b[0] - b[1];
  if (diffA === diffB) return { dir: 'D', index: diffA };

  const sumA = a[0] + a[1];
  const sumB = b[0] + b[1];
  if (sumA === sumB) return { dir: 'A', index: sumA };

  throw new Error(`Unable to infer line from transformed points ${a} and ${b}`);
}

function transformDirection(symmetry: Symmetry, direction: Direction): Direction {
  if (symmetry === 'identity' || symmetry === 'rot180') return direction;
  if (symmetry === 'rot90' || symmetry === 'rot270') {
    switch (direction) {
      case 'H': return 'V';
      case 'V': return 'H';
      case 'D': return 'A';
      case 'A': return 'D';
    }
  }
  if (symmetry === 'flipH' || symmetry === 'flipV') {
    switch (direction) {
      case 'H': return 'H';
      case 'V': return 'V';
      case 'D': return 'A';
      case 'A': return 'D';
    }
  }
  if (symmetry === 'diag' || symmetry === 'antiDiag') {
    switch (direction) {
      case 'H': return 'V';
      case 'V': return 'H';
      case 'D': return 'D';
      case 'A': return 'A';
    }
  }

  throw new Error(`Unknown symmetry ${symmetry}`);
}

function applySymmetryToCoord(symmetry: Symmetry, row: number, col: number): [number, number] {
  switch (symmetry) {
    case 'identity':
      return [row, col];
    case 'rot90':
      return [col, BOARD_SIZE - 1 - row];
    case 'rot180':
      return [BOARD_SIZE - 1 - row, BOARD_SIZE - 1 - col];
    case 'rot270':
      return [BOARD_SIZE - 1 - col, row];
    case 'flipH':
      return [BOARD_SIZE - 1 - row, col];
    case 'flipV':
      return [row, BOARD_SIZE - 1 - col];
    case 'diag':
      return [col, row];
    case 'antiDiag':
      return [BOARD_SIZE - 1 - col, BOARD_SIZE - 1 - row];
  }
}

function inverseSymmetry(symmetry: Symmetry): Symmetry {
  switch (symmetry) {
    case 'identity':
      return 'identity';
    case 'rot90':
      return 'rot270';
    case 'rot180':
      return 'rot180';
    case 'rot270':
      return 'rot90';
    case 'flipH':
      return 'flipH';
    case 'flipV':
      return 'flipV';
    case 'diag':
      return 'diag';
    case 'antiDiag':
      return 'antiDiag';
  }
}
