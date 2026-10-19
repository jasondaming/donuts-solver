# Donuts Solver — Claude Code Guide

## Project Overview

Local solver service (`npm run solver`) + React browser UI (`npm run dev`) for the board game Donuts. The solver runs as a Node.js HTTP service on port 8787; the UI polls it for move analysis. If the service is offline, the UI falls back to an in-browser Web Worker.

## Key Files

| Path | Purpose |
|------|---------|
| `server/server.ts` | HTTP API, job management, prefetch logic, cache reconstruction |
| `server/solveWorker.ts` | Worker thread: runs `analyzePosition` and posts partial/complete results |
| `server/exactCache.ts` | `PersistentExactCache` — append-only journal at `.solver-cache/exact.journal` |
| `server/primeWorker.ts` | Silent presolve worker (no partial callbacks) — not yet wired into the API |
| `src/solver/solver.ts` | `analyzePosition` — iterative deepening minimax with alpha-beta |
| `src/solver/stateKey.ts` | Canonical position encoding with board symmetry (8 symmetries) |
| `src/solver/serverClient.ts` | Browser-side fetch wrappers for the solver API |
| `src/game/engine.ts` | `getValidMoves`, `applyMove` — game logic |
| `src/game/types.ts` | All shared types: `GameState`, `MoveAnalysis`, `SolverResult`, etc. |

## Architecture Notes

### Solver Pipeline
1. UI POSTs `GameState` to `/api/solve` → server creates a job and starts a worker thread.
2. Worker calls `analyzePosition`, posts `partial` after each depth, `complete` when done.
3. Server writes checkpoints to `.solver-cache/jobs/<hash>.json` on every partial.
4. On completion, server writes a root-level entry to the exact cache.
5. UI polls `/api/solve/<jobId>` until `status === 'complete'`.

### Exact Cache (`exact.journal`)
- Append-only journal; loaded into memory on startup.
- Stores minimax values, search depth, and best move per canonical position key.
- Used by `minimax` during search to short-circuit subtrees already proven at sufficient depth.
- Score is always stored from **vanilla's perspective** (positive = vanilla winning).
- `WIN - pliesFromRoot` is baked into scores for win/loss positions. This means scores from different search roots differ by a pliesFromRoot offset (off by 1 per ply of distance between roots).

### Prefetch (added 2026-05-12)
After every `partial` message from any worker, `prefetchChildren` queues solve jobs for all legal children of that position, up to `MAX_WORKERS` (CPU count − 1) concurrent running jobs. This ensures the position the player is likely to move to is already being solved in the background.

### Cache Reconstruction (added 2026-05-13)
`tryReconstructFromCache` in `server.ts`: before starting a new worker for position B, checks if every legal move from B leads to a child already proven in the exact cache. If so, reconstructs the full `SolverResult` without starting a worker — effectively instant. **Known caveat**: `movesToEnd` values can be off by ≤1 ply when the cache entry was stored from a different search root (e.g., the parent's search). B's own prefetch job corrects these values once it completes.

### Score Encoding
- `WIN = 10000`
- Terminal win at pliesFromRoot P: score = `WIN - P` (vanilla perspective)
- Terminal loss: `-(WIN - P)`
- `movesToEnd = WIN - |score|`
- Scores near ±WIN are forced wins/losses; score = 0 is draw or unknown

## Running

```sh
# Terminal 1
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
```

> Note: `npm run build` may fail on some sandboxes with `spawn EPERM` from Vite/Rolldown. The three verification commands above are the reliable check.

## Open Items / Known Issues

- `primeWorker.ts` exists for presolving positions offline but is not yet exposed as an API endpoint or CLI command.
- `movesToEnd` in cache-reconstructed results can be off by 1 until the position's own job overwrites the cache entries from the correct root.
- No worker queue/backpressure beyond the `MAX_WORKERS` cap; prefetch jobs beyond the cap are silently skipped until a slot frees up (they get picked up on subsequent partial messages).
