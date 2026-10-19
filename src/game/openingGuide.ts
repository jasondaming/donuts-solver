import { getCellsOnLine } from './board.ts';
import { applyMove, getValidMoves } from './engine.ts';
import { largestGroup } from './winCheck.ts';
import type { Board, Direction, GameState, Player } from './types';

type MoveBand = 'center' | 'inner' | 'edge' | 'corner';

export interface OpeningMoveInsight {
  row: number;
  col: number;
  direction: Direction;
  band: MoveBand;
  score: number;
  linePotential: number;
  openLinePotential: number;
  replyOptions: number;
  givesFreeChoice: boolean;
  flipsNow: number;
  ownThreats: number;
  opponentThreats: number;
  groupGain: number;
  maxFlipRisk: number;
  tags: string[];
}

export interface OpeningGuide {
  phase: 'opening' | 'midgame' | 'endgame';
  insights: OpeningMoveInsight[];
  centerFour: OpeningMoveInsight[];
  topMoves: OpeningMoveInsight[];
}

const BOARD_SIZE = 6;
const CENTER_FOUR = new Set(['2,2', '2,3', '3,2', '3,3']);
const WIN_LINES = buildWinLines();

export function analyzeOpening(state: GameState): OpeningGuide {
  const moves = getValidMoves(state);
  const insights = moves
    .map(([row, col]) => scoreMove(state, row, col))
    .sort((a, b) => b.score - a.score || a.row - b.row || a.col - b.col);

  const movesPlayed = 30 - state.vanillaLeft - state.chocolateLeft;
  const phase = movesPlayed <= 6 ? 'opening' : movesPlayed <= 20 ? 'midgame' : 'endgame';

  return {
    phase,
    insights,
    centerFour: insights.filter(move => CENTER_FOUR.has(`${move.row},${move.col}`)),
    topMoves: insights.slice(0, 8),
  };
}

function scoreMove(state: GameState, row: number, col: number): OpeningMoveInsight {
  const player = state.currentPlayer;
  const opponent = otherPlayer(player);
  const beforeGroup = largestGroup(state.board, player);
  const next = applyMove(state, row, col);
  const linePotential = countLinesContaining(row, col);
  const openLinePotential = countOpenLinesForMove(state.board, row, col, player);
  const replyOptions = countReplyOptions(next);
  const givesFreeChoice = next.status.type === 'playing' && replyOptions === 0;
  const flipsNow = countFlipped(state.board, next.board, player);
  const ownThreats = countThreats(next.board, player);
  const opponentThreats = countThreats(next.board, opponent);
  const groupGain = largestGroup(next.board, player) - beforeGroup;
  const maxFlipRisk = estimateMaxFlipRisk(next, player);
  const band = classifyBand(row, col);
  const centerScore = Math.max(0, 4 - distanceFromCenter(row, col));
  const constraintScore = givesFreeChoice ? -8 : Math.max(0, 6 - replyOptions);

  const score =
    linePotential * 5 +
    openLinePotential * 3 +
    centerScore * 8 +
    constraintScore * 5 +
    flipsNow * 14 +
    ownThreats * 18 +
    groupGain * 4 -
    opponentThreats * 12 -
    maxFlipRisk * 10 +
    (band === 'center' ? 14 : band === 'inner' ? 6 : band === 'corner' ? -8 : -3);

  return {
    row,
    col,
    direction: state.board[row][col].direction,
    band,
    score: Math.round(score),
    linePotential,
    openLinePotential,
    replyOptions,
    givesFreeChoice,
    flipsNow,
    ownThreats,
    opponentThreats,
    groupGain,
    maxFlipRisk,
    tags: buildTags({
      band,
      linePotential,
      openLinePotential,
      replyOptions,
      givesFreeChoice,
      flipsNow,
      ownThreats,
      opponentThreats,
      groupGain,
      maxFlipRisk,
    }),
  };
}

function countReplyOptions(state: GameState): number {
  if (state.status.type !== 'playing') return 0;
  if (!state.constrainedLine) return getValidMoves(state).length;
  return getCellsOnLine(state.constrainedLine)
    .filter(([r, c]) => !state.board[r][c].piece)
    .length;
}

function estimateMaxFlipRisk(state: GameState, playerAtRisk: Player): number {
  if (state.status.type !== 'playing') return 0;

  let maxRisk = 0;
  for (const [row, col] of getValidMoves(state)) {
    const reply = applyMove(state, row, col);
    maxRisk = Math.max(maxRisk, countPiecesLost(state.board, reply.board, playerAtRisk));
  }
  return maxRisk;
}

function countFlipped(before: Board, after: Board, player: Player): number {
  const opponent = otherPlayer(player);
  let flipped = 0;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (before[r][c].piece === opponent && after[r][c].piece === player) {
        flipped += 1;
      }
    }
  }

  return flipped;
}

function countPiecesLost(before: Board, after: Board, player: Player): number {
  const opponent = otherPlayer(player);
  let lost = 0;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (before[r][c].piece === player && after[r][c].piece === opponent) {
        lost += 1;
      }
    }
  }

  return lost;
}

function countThreats(board: Board, player: Player): number {
  return WIN_LINES.filter(line => {
    let playerCount = 0;
    let emptyCount = 0;

    for (const [r, c] of line) {
      if (board[r][c].piece === player) playerCount += 1;
      else if (board[r][c].piece === null) emptyCount += 1;
      else return false;
    }

    return playerCount === 4 && emptyCount === 1;
  }).length;
}

function countOpenLinesForMove(board: Board, row: number, col: number, player: Player): number {
  const opponent = otherPlayer(player);
  return WIN_LINES.filter(line =>
    line.some(([r, c]) => r === row && c === col) &&
    line.every(([r, c]) => board[r][c].piece !== opponent)
  ).length;
}

function countLinesContaining(row: number, col: number): number {
  return WIN_LINES.filter(line => line.some(([r, c]) => r === row && c === col)).length;
}

function classifyBand(row: number, col: number): MoveBand {
  if (CENTER_FOUR.has(`${row},${col}`)) return 'center';
  if ((row === 0 || row === 5) && (col === 0 || col === 5)) return 'corner';
  if (row === 0 || row === 5 || col === 0 || col === 5) return 'edge';
  return 'inner';
}

function distanceFromCenter(row: number, col: number): number {
  const dr = row - 2.5;
  const dc = col - 2.5;
  return Math.sqrt(dr * dr + dc * dc);
}

function buildTags(input: {
  band: MoveBand;
  linePotential: number;
  openLinePotential: number;
  replyOptions: number;
  givesFreeChoice: boolean;
  flipsNow: number;
  ownThreats: number;
  opponentThreats: number;
  groupGain: number;
  maxFlipRisk: number;
}): string[] {
  const tags: string[] = [];

  if (input.band === 'center') tags.push('center control');
  else if (input.band === 'inner') tags.push('near center');
  if (input.linePotential >= 5) tags.push('many win lines');
  if (input.openLinePotential >= 5) tags.push('open lines');
  if (input.replyOptions > 0 && input.replyOptions <= 2) tags.push('tight reply');
  if (input.givesFreeChoice) tags.push('free-choice risk');
  if (input.flipsNow > 0) tags.push(`${input.flipsNow} flip${input.flipsNow === 1 ? '' : 's'}`);
  if (input.ownThreats > 1) tags.push('fork threat');
  else if (input.ownThreats === 1) tags.push('one threat');
  if (input.opponentThreats > 0) tags.push('allows threat');
  if (input.groupGain >= 2) tags.push('group gain');
  if (input.maxFlipRisk > 0) tags.push('flip risk');

  return tags.slice(0, 4);
}

function otherPlayer(player: Player): Player {
  return player === 'vanilla' ? 'chocolate' : 'vanilla';
}

function buildWinLines(): [number, number][][] {
  const lines: [number, number][][] = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c <= 1; c++) {
      lines.push([[r, c], [r, c + 1], [r, c + 2], [r, c + 3], [r, c + 4]]);
    }
  }

  for (let c = 0; c < BOARD_SIZE; c++) {
    for (let r = 0; r <= 1; r++) {
      lines.push([[r, c], [r + 1, c], [r + 2, c], [r + 3, c], [r + 4, c]]);
    }
  }

  for (let r = 0; r <= 1; r++) {
    for (let c = 0; c <= 1; c++) {
      lines.push([[r, c], [r + 1, c + 1], [r + 2, c + 2], [r + 3, c + 3], [r + 4, c + 4]]);
    }
  }

  for (let r = 4; r <= 5; r++) {
    for (let c = 0; c <= 1; c++) {
      lines.push([[r, c], [r - 1, c + 1], [r - 2, c + 2], [r - 3, c + 3], [r - 4, c + 4]]);
    }
  }

  return lines;
}
