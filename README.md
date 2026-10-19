# Donuts Solver

Local solver service and browser UI for the board game Donuts.

## Solver Model

- The game engine generates legal moves from the current constraint line, including disobedience when the constrained line is full.
- Every legal move is solved exactly: win, draw, or loss with perfect play by both sides. The solver is a win/draw/loss alpha-beta search over bitboards with a fixed-size transposition table, written in C (`engine/wdl.c`) and compiled to WebAssembly. The Node service and the browser run the same engine.
- Moves are spread over a pool of engines, one per worker thread (service) or Web Worker (browser), and each move's result appears as soon as it is proven. On one 8-core machine the empty board takes about 3 s; mid-game positions take milliseconds.
- A second pass fills in `Win in N` / `Loss in N` for the winning and losing moves with node-budgeted searches. A move whose budget runs out keeps its proven result and shows just `Win` or `Loss`.
- `Win in N` and `Loss in N` count plies from the current position, including the candidate move. An immediate win is `Win in 1` in the sidebar and `now` on the board.
- Empty boards are answered instantly from `src/solver/openingBook.json`: the first-move values of all 1,536 distinct layouts (`scripts/precompute-openings.ts`).
- Arbitrary positions work too (position editor): any pieces of both colors, either side to move, and any constrained line. The game is taken to end after `vanillaLeft + chocolateLeft` more donuts.
- Memory stays flat: each engine allocates its tables once (about 60 MB per service thread, 30 MB per browser worker) and nothing is cached on disk.
- The preferred solver is the local Node service; if it is not running, the UI uses the browser workers instead.

## UI

- Colored board overlays summarize each legal move.
- The sidebar lists every legal move sorted by best-play value: fastest wins, draws, unknowns, then slowest losses.
- AI modes wait until every move is proven, then play the fastest win, else a draw, else the slowest loss.
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

The rulebook PDF and a git bundle of the full history are kept outside the repo (see the hosting package README on the external drive).

## Commands

```sh
npm start             # solver service + dev server
npm run solver        # solver service only (http://localhost:8787)
npm run dev           # dev server only
npm run lint
npx tsc -b            # type-check frontend
npm run check:server  # type-check server
npm run build         # production build (also what GitHub Pages deploys)
npm run validate      # engine vs. plain JS searches: perft, values, distances, editor positions
npm run build:engine  # recompile engine/wdl.c into src/solver/wdlWasm.ts (needs clang + wasm-ld)
```

The compiled engine is checked in (`src/solver/wdlWasm.ts`), so only changes to `engine/wdl.c` need LLVM.

The UI uses `http://localhost:8787` by default; override it with `VITE_DONUTS_SOLVER_URL` if needed.

Override the service port with `DONUTS_SOLVER_PORT`.

Pushing to `main` deploys the UI to GitHub Pages (https://jasondaming.github.io/donuts-solver/). The hosted page has no solver service, so it uses the in-browser engine workers unless a local service is running.
