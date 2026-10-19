// Thin wrapper over the WebAssembly win/draw/loss engine (engine/wdl.c). One instance owns its own
// fixed-size tables, so memory stays flat no matter how many positions it solves.
import type { ConstrainedLine, GameState } from '../game/types';
import { WDL_WASM_BASE64 } from './wdlWasm.ts';

interface WdlExports {
  memory: WebAssembly.Memory;
  io_buffer(): number;
  configure(ttLog2: number, dtLog2: number): number;
  set_board(): number;
  set_root(curLo: number, curHi: number, othLo: number, othHi: number, line: number, remaining: number): void;
  legal_lo(): number;
  legal_hi(): number;
  move_value(cell: number): number;
  move_distance(cell: number, value: number, budget: number): number;
  node_count(): number;
  reset_nodes(): void;
  perft(depth: number): number;
  perft_terminals(): number;
}

// A position in the engine's terms. Masks are split into 32-bit halves so they survive postMessage/JSON.
export interface EnginePosition {
  dirs: string;        // 36 arrow characters, row-major
  cur: [number, number];  // side to move: [bits 0-31, bits 32-35]
  oth: [number, number];
  line: number;        // constrained line id, -1 for a free choice
  remaining: number;   // donuts left in both supplies together
}

export type EngineTask =
  | { kind: 'value'; cell: number }
  | { kind: 'distance'; cell: number; value: number; budget: number };

export interface EngineReply {
  result: number;  // value task: 1 / 0 / -1; distance task: plies, or 0 if the budget ran out
  nodes: number;
}

export interface WdlEngine {
  run(position: EnginePosition, task: EngineTask): EngineReply;
  legalCells(position: EnginePosition): number[];
  perft(position: EnginePosition, depth: number): { leaves: number; terminals: number };
}

export interface EngineSize {
  ttLog2: number;  // WDL table: 2^ttLog2 entries of 24 bytes
  dtLog2: number;  // distance table: 2^dtLog2 entries of 24 bytes
}

let compiled: Promise<WebAssembly.Module> | null = null;

function wasmBytes(): Uint8Array<ArrayBuffer> {
  const raw = atob(WDL_WASM_BASE64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function createWdlEngine(size: EngineSize): Promise<WdlEngine> {
  compiled ??= WebAssembly.compile(wasmBytes());
  const instance = await WebAssembly.instantiate(await compiled, {});
  const x = instance.exports as unknown as WdlExports;
  if (!x.configure(size.ttLog2, size.dtLog2)) throw new Error('WDL engine: out of memory');

  const load = (p: EnginePosition) => {
    const io = new Uint8Array(x.memory.buffer, x.io_buffer(), 36);
    for (let i = 0; i < 36; i++) io[i] = p.dirs.charCodeAt(i);
    if (!x.set_board()) throw new Error(`WDL engine: bad board ${p.dirs}`);
    x.set_root(p.cur[0], p.cur[1], p.oth[0], p.oth[1], p.line, p.remaining);
  };

  return {
    run(position, task) {
      load(position);
      x.reset_nodes();
      const result = task.kind === 'value'
        ? x.move_value(task.cell)
        : x.move_distance(task.cell, task.value, task.budget);
      return { result, nodes: x.node_count() };
    },
    legalCells(position) {
      load(position);
      return maskCells(x.legal_lo() >>> 0, x.legal_hi() >>> 0);
    },
    perft(position, depth) {
      load(position);
      const leaves = x.perft(depth);
      return { leaves, terminals: x.perft_terminals() };
    },
  };
}

function maskCells(lo: number, hi: number): number[] {
  const cells: number[] = [];
  for (let i = 0; i < 32; i++) if (lo & (1 << i)) cells.push(i);
  for (let i = 0; i < 4; i++) if (hi & (1 << i)) cells.push(32 + i);
  return cells;
}

export function lineId(line: ConstrainedLine | null): number {
  if (!line) return -1;
  switch (line.dir) {
    case 'H': return line.index;
    case 'V': return 6 + line.index;
    case 'D': return 17 + line.index;
    case 'A': return 23 + line.index;
  }
}

export function toEnginePosition(state: GameState): EnginePosition {
  let dirs = '';
  const cur: [number, number] = [0, 0];
  const oth: [number, number] = [0, 0];
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      const cell = state.board[r][c];
      dirs += cell.direction;
      if (!cell.piece) continue;
      const i = r * 6 + c;
      const mask = cell.piece === state.currentPlayer ? cur : oth;
      if (i < 32) mask[0] = (mask[0] | (1 << i)) >>> 0;
      else mask[1] |= 1 << (i - 32);
    }
  }
  return { dirs, cur, oth, line: lineId(state.constrainedLine), remaining: state.vanillaLeft + state.chocolateLeft };
}
