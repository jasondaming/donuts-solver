# Native win/draw/loss solver (prototype)

Experiment from 2026-10-18 that tested whether a full solve is possible. It is, in seconds per board.
This folder is not part of the app build. The app's solver now uses `engine/wdl.c`, which grew out of this prototype and runs as WebAssembly (see the main README). `crosscheck.ts verify` checks that engine against a plain JS search.

## Results

Board from the May 2026 overnight run (arrows row by row: `DVDAHV AVADHD AHHAVV HDAADH VAHVVH ADVHDA`):

- The empty board is a **first-player (vanilla) win**. Solved in 2.5 s and 10.3M nodes on one core of an i7-9700KF. The app's JS solver ran out of heap at depth 19 on this board with all 36 first moves still unresolved.
- 5 of the 36 first moves win: (1,0), (1,3), (2,1), (4,1), (5,1) as (row, col). The other 31 lose. All four center squares lose, and each of those losses has its own verified chocolate strategy.

```
First move for vanilla (W = forced win, . = forced loss)
 . . . . . .
 W . . W . .
 . W . . . .
 . . . . . .
 . W . . . .
 . W . . . .
```

All 23 boards found in the May solver cache (the board above is board 17): see [results.md](results.md). The first player wins on all 23, every result certified. 215 of 828 first moves win (26%), and only 29 of 92 center-square openings do (32%).

20 more random layouts (seed 99, root value only, not certified) were also first-player wins. Root solves took 0.2 to 8.3 s, with a mean of 2.0 s. At that rate the root values of all 1,536 distinct layouts take about 50 core-minutes. A full first-move map took about 6 times as long as the root solve on the May board (16 s vs. 2.5 s), so maps for every layout come to roughly 5 core-hours, or under an hour on 7 cores.

Every result above was certified. `wdl proof` writes the winner's complete strategy: one move for every position where the winner is to play. `verify-proof.ts` then replays it with the app's own `src/game/engine.ts`, tries every reply of the loser, and checks that every line ends in a win for the winner. The certificate does not depend on the C search being correct, only on the app's rules.

Engine cross-checks against the JS engine:
- perft 1 to 8 identical (depth 8: 1,231,654 positions and 1,782 finished games)
- 404 per-move values at plies 16 to 21 identical to a plain JS alpha-beta search
- per-move analysis of 25 positions at ply 12: same outcomes as the app's solver, 0.04 s vs. 9.6 s

## Why it is fast

1. **Win/draw/loss instead of "win in N".** A position stops at its first winning move, and searches use tiny windows. The app's solver tracks exact distances, so it must keep searching for faster wins and cannot share results between search roots.
2. **One full-depth search instead of iterative deepening.** The game always ends by ply 30, so depth limits only produce "unknown" results that get thrown away.
3. **Bitboards.** The 36 cells fit in a 64-bit integer: about 4 to 5M nodes/s, vs. about 0.1 to 0.15M nodes/s for the JS solver's object boards and string keys.
4. **Fixed-size transposition table** with exact keys, win/loss bounds, and replacement, so memory stays flat (about 800 MB at `ttLog2 = 25`).
5. **Move ordering.** Immediate wins first, then the stored best move, flips, and a history heuristic. Moves that hand the opponent a free placement go last.

## Build and run

```sh
gcc -O3 -march=native -o wdl wdl.c          # Linux/WSL; on Windows MinGW gcc works too (-o wdl.exe)
echo "" | ./wdl solve 25                    # value of the empty board
echo "" | ./wdl values 25                   # value of all 36 first moves
echo "" | ./wdl proof 25 proof.txt          # export the winner's strategy
node --experimental-strip-types verify-proof.ts proof.txt     # certify it with the app's JS rules
DONUTS_BOARD=<36 arrow chars> ./wdl ...     # any other board (row-major H/V/D/A)
WDL=./wdl ./solve-boards.sh > results.txt   # every board in boards.txt
node --experimental-strip-types crosscheck.ts perft 8         # JS reference counts
```

Positions are given on stdin as comma-separated cells (`row*6+col`) played from the empty board.

## Limits of the prototype

- Single-threaded, no "win in N" distances, and no integration with the app.
- `proof` keeps the first winning move in row-major order, not the fastest win, so strategy sizes vary a lot between boards.
- `tiles.ts` has 4 tile patterns: 6,144 layouts, or 1,536 distinct ones once whole-board rotations are merged.
