import type { BoardConfig, GameState, GameStatus, Player } from './types';
import { createBoard, deepCloneBoard, getConstrainedLine, getCellsOnLine } from './board';
import { applyInsertions } from './insertion';
import { checkWin, largestGroup } from './winCheck';

export function createInitialState(config: BoardConfig): GameState {
  return {
    board: createBoard(config),
    currentPlayer: 'vanilla',
    constrainedLine: null,
    vanillaLeft: 15,
    chocolateLeft: 15,
    status: { type: 'playing' },
  };
}

export function getValidMoves(state: GameState): [number, number][] {
  if (state.status.type !== 'playing') return [];

  const { board, constrainedLine } = state;

  if (!constrainedLine) {
    // Free choice: any empty cell
    const moves: [number, number][] = [];
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        if (!board[r][c].piece) moves.push([r, c]);
      }
    }
    return moves;
  }

  // Cells on constrained line that are empty
  const lineCells = getCellsOnLine(constrainedLine).filter(([r, c]) => !board[r][c].piece);
  if (lineCells.length > 0) return lineCells;

  // Disobedience: all empty cells
  const moves: [number, number][] = [];
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      if (!board[r][c].piece) moves.push([r, c]);
    }
  }
  return moves;
}

export function isDisobedience(state: GameState, row: number, col: number): boolean {
  if (!state.constrainedLine) return false;
  const lineCells = getCellsOnLine(state.constrainedLine).filter(([r, c]) => !state.board[r][c].piece);
  if (lineCells.length === 0) return true; // no cells on line → disobedience
  return !lineCells.some(([r, c]) => r === row && c === col);
}

export function applyMove(state: GameState, row: number, col: number): GameState {
  const board = deepCloneBoard(state.board);
  const player = state.currentPlayer;
  const opponent: Player = player === 'vanilla' ? 'chocolate' : 'vanilla';

  board[row][col].piece = player;
  applyInsertions(board, row, col, player);

  const vanillaLeft = player === 'vanilla' ? state.vanillaLeft - 1 : state.vanillaLeft;
  const chocolateLeft = player === 'chocolate' ? state.chocolateLeft - 1 : state.chocolateLeft;

  let status: GameStatus;
  const winLine = checkWin(board, player);

  if (winLine) {
    status = { type: 'won', winner: player, winLine };
  } else if (vanillaLeft === 0 && chocolateLeft === 0) {
    const vg = largestGroup(board, 'vanilla');
    const cg = largestGroup(board, 'chocolate');
    if (vg > cg) status = { type: 'won', winner: 'vanilla', winLine: [] };
    else if (cg > vg) status = { type: 'won', winner: 'chocolate', winLine: [] };
    else status = { type: 'draw' };
  } else {
    status = { type: 'playing' };
  }

  const nextLine = status.type === 'playing'
    ? getConstrainedLine(board[row][col].direction, row, col)
    : null;

  return {
    board,
    currentPlayer: opponent,
    constrainedLine: nextLine,
    vanillaLeft,
    chocolateLeft,
    status,
  };
}
