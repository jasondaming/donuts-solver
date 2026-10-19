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

## Setting Up on a New Computer

Prerequisites: [Node.js](https://nodejs.org/) 22.18 or newer (24 LTS recommended; `.nvmrc` pins 24) and Git. Nothing else needs to be installed globally.

```sh
git clone https://github.com/jasondaming/donuts-solver.git
cd donuts-solver
npm ci
npm start
```

`npm start` runs the solver service and the dev server together and opens the UI at `http://localhost:5173/donuts-solver/`. Ctrl+C stops both. To run them separately, use `npm run solver` in one terminal and `npm run dev` in another.

No API keys or `.env` files are required. The optional photo board-detection feature asks for an Anthropic API key in the UI and keeps it in that browser's local storage only.

To carry over solver progress from another machine, copy its `.solver-cache` folder into the repo root before starting the service. A backup of the cache, the rulebook PDF, and a git bundle of the full history are kept outside the repo (see the hosting package README on the external drive).

## Commands

```sh
npm start             # solver service + dev server
npm run solver        # solver service only (http://localhost:8787)
npm run dev           # dev server only
npm run lint
npx tsc -b            # type-check frontend
npm run check:server  # type-check server
npm run build         # production build (also what GitHub Pages deploys)
```

The UI uses `http://localhost:8787` by default; override it with `VITE_DONUTS_SOLVER_URL` if needed.

The solver service uses `.solver-cache` by default. Override with `DONUTS_SOLVER_CACHE_DIR`, and override the service port with `DONUTS_SOLVER_PORT`.

Checkpoint scope: checkpoints preserve the latest completed search depth and move analyses. The transposition journal is persisted, so repeated solves of related positions can reuse previously searched bounds and exact states instead of starting cold.

Pushing to `main` deploys the UI to GitHub Pages (https://jasondaming.github.io/donuts-solver/). The hosted page has no solver service, so it falls back to the in-browser worker unless a local service is running.
