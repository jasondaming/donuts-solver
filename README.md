# Donuts Solver

Local solver service and browser UI for the board game Donuts.

## Solver Model

- The game engine generates legal moves from the current constraint line, including disobedience when the constrained line is full.
- Each candidate move is searched with iterative deepening minimax and alpha-beta pruning.
- The preferred solver runs as a local Node service using worker threads. The browser UI only submits positions and polls for job progress.
- Job checkpoints are saved under `.solver-cache/jobs` after each completed iterative-deepening depth.
- A persistent transposition journal is stored in `.solver-cache/exact.journal`; it reuses exact, lower-bound, and upper-bound entries across jobs and restarts.
- On service restart, unfinished `running` jobs are loaded and resumed from the next depth.
- If the Node service is not running, the UI falls back to the browser Web Worker.
- Results are reported from the side-to-move perspective: win, loss, draw, or unknown while the full proof is still running.
- `Win in N` and `Loss in N` count plies from the current position, including the candidate move. An immediate win is `Win in 1` in the sidebar and `now` on the board.
- Incomplete depth-limited zero scores are shown as `Searching dN`, not as draws. A draw is only shown when the remaining game tree has been exhausted.

## UI

- Colored board overlays summarize each legal move.
- The sidebar lists every legal move sorted by best-play value: fastest wins, draws, unknowns, then slowest losses.
- AI modes use the same solver output and prefer proven wins, then proven draws, then unknown moves, then delayed losses.
- The position editor can set arbitrary pieces, the side to move, and the last-played piece that defines the active constraint.

## Commands

```sh
npm install
npm run solver
npm run dev
npm run lint
npx tsc -b
npm run check:server
npm run build
```

Run `npm run solver` in one terminal and `npm run dev` in another. The UI uses `http://localhost:8787` by default; override it with `VITE_DONUTS_SOLVER_URL` if needed.

The solver service uses `.solver-cache` by default. Override with `DONUTS_SOLVER_CACHE_DIR`, and override the service port with `DONUTS_SOLVER_PORT`.

Checkpoint scope: checkpoints preserve the latest completed search depth and move analyses. The transposition journal is persisted, so repeated solves of related positions can reuse previously searched bounds and exact states instead of starting cold.

`npm run build` runs TypeScript first and then Vite. In the current Codex sandbox, Vite/Rolldown can fail before bundling with `spawn EPERM`; `npx tsc -b`, `npm run check:server`, and `npm run lint` are the reliable local verification steps here.
