# Donuts Solver — Claude Code Guide

## Project Overview

Local solver service (`npm run solver`) + React browser UI (`npm run dev`) for the board game Donuts. The solver runs as a Node.js HTTP service on port 8787; the UI polls it for move analysis. If the service is offline, the UI falls back to an in-browser Web Worker.

## Key Files

| Path | Purpose |
|------|---------|
| `engine/wdl.c` | Win/draw/loss engine (bitboards, alpha-beta, fixed-size tables, bounded distance search), compiled to WebAssembly |
| `scripts/build-engine.mjs` | `npm run build:engine`: clang to wasm, embedded as base64 in `src/solver/wdlWasm.ts` (checked in) |
| `src/solver/wdlEngine.ts` | Loads the wasm; `toEnginePosition(state)`; runs value / distance tasks |
| `src/solver/solver.ts` | `SolverPool`: spreads per-move tasks over engine runners, streams `SolverResult`s; `pickBestMove` |
| `src/solver/worker.ts` + `browserPool.ts` | Browser fallback: persistent pool of engine Web Workers |
| `server/server.ts` | HTTP API (`POST /api/solve`, `GET /api/solve/:id`), in-memory jobs (LRU, 256) |
| `server/enginePool.ts` + `engineWorker.ts` | Worker-thread engine pool (service and scripts) |
| `src/solver/openingBook.ts` / `.json` | Precomputed first-move values for all 1,536 layouts (`scripts/precompute-openings.ts`) |
| `scripts/validate-engine.ts` | `npm run validate`: perft, values, distances, editor positions vs. plain JS searches |
| `scripts/export-proof.ts` | Exports a winner strategy for `experiments/native-wdl/verify-proof.ts` to certify |
| `src/game/engine.ts` | `getValidMoves`, `applyMove`: the reference game rules |
| `src/game/types.ts` | Shared types: `GameState`, `MoveAnalysis`, `SolverProgress`, etc. |

## Architecture Notes

### Solver Pipeline
1. UI POSTs `GameState` to `/api/solve`; the server creates an in-memory job on its `SolverPool`.
2. Pass 1: one `value` task per legal move (full-depth WDL search, exact). Results stream as they finish.
3. Pass 2: one `distance` task per winning/losing move, budgeted (`DISTANCE_BUDGET` nodes); fills `movesToEnd` or leaves it null.
4. UI polls `/api/solve/<jobId>` every 250 ms until `status === 'complete'`. Without the service it runs the same pool in Web Workers.
5. The newest job gets idle engines first; jobs nobody polls for 30 s are cancelled.

### Engine notes
- Each engine keeps its tables across positions; they are invalidated (generation byte) only when the board arrows or the game length (pieces on board + pieces left) change.
- `endPly = pieces on board + vanillaLeft + chocolateLeft`; the donut that reaches it ends the game on the largest-group rule.
- Constraint line ids: H row r = r, V col c = 6+c, D (r-c) = 17+(r-c), A (r+c) = 23+(r+c), free = -1.
- The distance search only follows moves the WDL table has not refuted, so it is cheap where the WDL proof is small.

### Score Encoding
- `MoveAnalysis.score` = `WIN - movesToEnd` for wins, `-(WIN - movesToEnd)` for losses (`WIN = 10000`; unknown N counts as 100), 0 for draws.

## Running

```sh
npm start         # both of the below in one terminal (scripts/start.mjs)

# Or separately — Terminal 1
npm run solver

# Terminal 2
npm run dev       # dev server with hot reload
# OR
npm run preview   # test the production build
```

## Verification Commands

```sh
npx tsc -b            # type-check frontend
npm run check:server  # type-check server
npm run lint          # eslint
npm run build         # full production build
npm run validate      # engine cross-checks against plain JS searches
```

> Note: `npm run build` may fail on some sandboxes with `spawn EPERM` from Vite/Rolldown. The three verification commands above are the reliable check.

## Open Items / Known Issues

- Distances near the empty board often exceed the budget and stay null ("Win" / "Loss" without N).
- Editor positions with impossible piece counts (one side far ahead) are solved as if the game ends after `vanillaLeft + chocolateLeft` more donuts.
