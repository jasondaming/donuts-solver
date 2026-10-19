import { applyMove, createInitialState, getValidMoves, isDisobedience } from './engine';
import type { BoardConfig, GameMode, GameState, Player } from './types';

export const SAVED_SESSION_KEY = 'donuts.savedSession.v1';

export interface TimelineMove {
  row: number;
  col: number;
  player: Player;
  flipped: [number, number][];
  wasDisobedience: boolean;
}

export interface TimelineEntry {
  state: GameState;
  move: TimelineMove | null;
  lastPlaced: [number, number] | null;
}

export interface GameSessionData {
  config: BoardConfig;
  mode: GameMode;
  history: TimelineEntry[];
  currentIndex: number;
}

interface CompactMove {
  r: number;
  c: number;
}

interface CompactSession {
  v: 1;
  config: BoardConfig;
  mode: GameMode;
  baseState: GameState;
  moves: CompactMove[];
  index: number;
}

const SHARE_PREFIX = 'donuts:';

export function createInitialHistory(config: BoardConfig): TimelineEntry[] {
  return [{
    state: createInitialState(config),
    move: null,
    lastPlaced: null,
  }];
}

export function createMoveEntry(state: GameState, row: number, col: number): TimelineEntry {
  const player = state.currentPlayer;
  const nextState = applyMove(state, row, col);

  return {
    state: nextState,
    move: {
      row,
      col,
      player,
      flipped: findFlippedPieces(state, nextState, player),
      wasDisobedience: isDisobedience(state, row, col),
    },
    lastPlaced: [row, col],
  };
}

export function encodeGameSession(session: GameSessionData): string {
  const compact: CompactSession = {
    v: 1,
    config: session.config,
    mode: session.mode,
    baseState: session.history[0]?.state ?? createInitialState(session.config),
    moves: session.history.slice(1).map(entry => ({
      r: entry.move?.row ?? -1,
      c: entry.move?.col ?? -1,
    })),
    index: clampIndex(session.currentIndex, session.history.length),
  };

  return `${SHARE_PREFIX}${base64UrlEncode(JSON.stringify(compact))}`;
}

export function decodeGameSession(input: string): GameSessionData {
  const code = extractShareCode(input);
  const payload = code.startsWith(SHARE_PREFIX) ? code.slice(SHARE_PREFIX.length) : code;
  const compact = JSON.parse(base64UrlDecode(payload)) as CompactSession;

  if (compact.v !== 1) {
    throw new Error('Unsupported session version');
  }

  const history = hydrateHistory(compact.baseState, compact.moves);
  return {
    config: compact.config,
    mode: compact.mode,
    history,
    currentIndex: clampIndex(compact.index, history.length),
  };
}

export function swapGameSessionColors(session: GameSessionData): GameSessionData {
  return {
    config: session.config,
    mode: swapMode(session.mode),
    currentIndex: session.currentIndex,
    history: session.history.map(entry => ({
      state: swapStateColors(entry.state),
      lastPlaced: entry.lastPlaced,
      move: entry.move
        ? { ...entry.move, player: swapPlayer(entry.move.player) }
        : null,
    })),
  };
}

export function canApplyMove(state: GameState, row: number, col: number): boolean {
  return getValidMoves(state).some(([r, c]) => r === row && c === col);
}

function hydrateHistory(baseState: GameState, moves: CompactMove[]): TimelineEntry[] {
  const history: TimelineEntry[] = [{
    state: baseState,
    move: null,
    lastPlaced: null,
  }];

  for (const move of moves) {
    const previous = history[history.length - 1].state;
    if (!canApplyMove(previous, move.r, move.c)) {
      throw new Error(`Invalid move in shared session: R${move.r + 1} C${move.c + 1}`);
    }
    history.push(createMoveEntry(previous, move.r, move.c));
  }

  return history;
}

function findFlippedPieces(before: GameState, after: GameState, player: Player): [number, number][] {
  const opponent = swapPlayer(player);
  const flipped: [number, number][] = [];

  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      if (before.board[r][c].piece === opponent && after.board[r][c].piece === player) {
        flipped.push([r, c]);
      }
    }
  }

  return flipped;
}

function swapStateColors(state: GameState): GameState {
  return {
    ...state,
    board: state.board.map(row => row.map(cell => ({
      ...cell,
      piece: cell.piece ? swapPlayer(cell.piece) : null,
    }))),
    currentPlayer: swapPlayer(state.currentPlayer),
    vanillaLeft: state.chocolateLeft,
    chocolateLeft: state.vanillaLeft,
    status: state.status.type === 'won'
      ? { ...state.status, winner: swapPlayer(state.status.winner) }
      : state.status,
  };
}

function swapPlayer(player: Player): Player {
  return player === 'vanilla' ? 'chocolate' : 'vanilla';
}

function swapMode(mode: GameMode): GameMode {
  if (mode === 'hva') return 'avh';
  if (mode === 'avh') return 'hva';
  return 'hvh';
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

function extractShareCode(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Empty session code');

  try {
    const url = new URL(trimmed);
    const hash = url.hash.replace(/^#/, '');
    if (hash.startsWith('game=')) {
      return decodeURIComponent(hash.slice('game='.length));
    }
  } catch {
    // Not a URL; continue treating the input as a raw code or hash.
  }

  const withoutHash = trimmed.replace(/^#/, '');
  if (withoutHash.startsWith('game=')) {
    return decodeURIComponent(withoutHash.slice('game='.length));
  }

  return trimmed;
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
