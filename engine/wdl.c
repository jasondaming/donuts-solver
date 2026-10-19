// Donuts win/draw/loss engine, compiled to WebAssembly (see scripts/build-engine.mjs).
// Grown from experiments/native-wdl/wdl.c: bitboards, WDL alpha-beta and a fixed-size transposition table,
// plus arbitrary root positions and a bounded "win/loss in N" search.
//
// Freestanding: no libc. Memory comes from a bump allocator over memory.grow, so the tables are allocated
// once by configure() and never grow. Tables are invalidated by bumping a generation byte, not by clearing.
//
// Cells are r*6+c. Lines: H row r -> r, V col c -> 6+c, D (r-c) -> 17+(r-c), A (r+c) -> 23+(r+c), none -> -1.
#include <stdint.h>

typedef uint64_t u64;
typedef uint32_t u32;
#define NC 36
#define FULL ((1ULL << 36) - 1)
#define BIT(i) (1ULL << (i))
#define EXPORT(name) __attribute__((export_name(#name)))

static int lineOfCell[NC];   // constraint line the opponent gets after a donut lands on this cell
static u64 lineMask[34];
static u64 winMask[32];
static int winThrough[NC][8], nWinThrough[NC];
static int ray[NC][8][6], rayLen[NC][8];   // 8 directions, opposite pairs are (0,1) (2,3) (4,5) (6,7)
static u64 COL0, COL5;
static int endPly = 30;   // donuts on the board when the game ends on the largest-group rule

static double nodes;
static unsigned char io[64];   // JS writes the 36 arrow characters here before set_board()

// ---- memory ----
extern unsigned char __heap_base;
static uintptr_t heapTop = (uintptr_t)&__heap_base;
static void *alloc(u32 bytes) {
  uintptr_t p = (heapTop + 63) & ~(uintptr_t)63;
  uintptr_t end = p + bytes;
  uintptr_t have = __builtin_wasm_memory_size(0) * 65536;
  if (end > have && __builtin_wasm_memory_grow(0, (end - have + 65535) / 65536) == (uintptr_t)-1) return 0;
  heapTop = end;
  return (void *)p;   // fresh pages are zero-filled
}

// ---- board geometry ----
static void initGeometry(void) {
  static const int DR[8] = {0, 0, 1, -1, 1, -1, 1, -1}, DC[8] = {1, -1, 0, 0, 1, -1, -1, 1};
  int n = 0;
  for (int r = 0; r < 6; r++)
    for (int c = 0; c < 6; c++) {
      int i = r * 6 + c;
      lineMask[r] |= BIT(i);
      lineMask[6 + c] |= BIT(i);
      lineMask[12 + (r - c + 5)] |= BIT(i);
      lineMask[23 + (r + c)] |= BIT(i);
      if (c == 0) COL0 |= BIT(i);
      if (c == 5) COL5 |= BIT(i);
    }
  for (int r = 0; r < 6; r++) for (int s = 0; s <= 1; s++) { u64 m = 0; for (int k = 0; k < 5; k++) m |= BIT(r * 6 + s + k); winMask[n++] = m; }
  for (int c = 0; c < 6; c++) for (int s = 0; s <= 1; s++) { u64 m = 0; for (int k = 0; k < 5; k++) m |= BIT((s + k) * 6 + c); winMask[n++] = m; }
  for (int rs = 0; rs <= 1; rs++) for (int cs = 0; cs <= 1; cs++) { u64 m = 0; for (int k = 0; k < 5; k++) m |= BIT((rs + k) * 6 + cs + k); winMask[n++] = m; }
  for (int rs = 4; rs <= 5; rs++) for (int cs = 0; cs <= 1; cs++) { u64 m = 0; for (int k = 0; k < 5; k++) m |= BIT((rs - k) * 6 + cs + k); winMask[n++] = m; }
  for (int w = 0; w < 32; w++) for (int i = 0; i < NC; i++) if (winMask[w] & BIT(i)) winThrough[i][nWinThrough[i]++] = w;
  for (int i = 0; i < NC; i++)
    for (int d = 0; d < 8; d++) {
      int r = i / 6 + DR[d], c = i % 6 + DC[d];
      while (r >= 0 && r < 6 && c >= 0 && c < 6) { ray[i][d][rayLen[i][d]++] = r * 6 + c; r += DR[d]; c += DC[d]; }
    }
}

// Place the mover's donut on cell i and apply insertions. Returns the flipped cells.
static inline u64 play(u64 *cur, u64 *oth, int i) {
  u64 c = *cur | BIT(i), o = *oth, flips = 0;
  for (int ax = 0; ax < 4; ax++) {
    int e1 = -1, e2 = -1;
    for (int k = 0; k < rayLen[i][2 * ax]; k++) { int x = ray[i][2 * ax][k]; if (!(c & BIT(x))) { e1 = x; break; } }
    if (e1 < 0 || !(o & BIT(e1))) continue;
    for (int k = 0; k < rayLen[i][2 * ax + 1]; k++) { int x = ray[i][2 * ax + 1][k]; if (!(c & BIT(x))) { e2 = x; break; } }
    if (e2 < 0 || !(o & BIT(e2))) continue;
    flips |= BIT(e1) | BIT(e2);
  }
  c |= flips; o &= ~flips;
  *cur = c; *oth = o;
  return flips;
}

static inline int hasWinThrough(u64 b, int i) {
  for (int k = 0; k < nWinThrough[i]; k++) { u64 m = winMask[winThrough[i][k]]; if ((b & m) == m) return 1; }
  return 0;
}

static inline int isWin(u64 b, int placed, u64 flips) {
  if (hasWinThrough(b, placed)) return 1;
  while (flips) { int x = __builtin_ctzll(flips); flips &= flips - 1; if (hasWinThrough(b, x)) return 1; }
  return 0;
}

static int largestGroup(u64 b) {
  int best = 0;
  while (b) {
    u64 comp = b & (~b + 1);
    for (;;) {
      u64 g = (comp | ((comp << 1) & ~COL0) | ((comp >> 1) & ~COL5) | (comp << 6) | (comp >> 6)) & b;
      if (g == comp) break;
      comp = g;
    }
    int sz = __builtin_popcountll(comp);
    if (sz > best) best = sz;
    b &= ~comp;
  }
  return best;
}

static inline int groupResult(u64 c, u64 o) {
  int gc = largestGroup(c), go = largestGroup(o);
  return gc > go ? 1 : gc < go ? -1 : 0;
}

static inline u64 legalMoves(u64 cur, u64 oth, int line) {
  u64 empty = ~(cur | oth) & FULL;
  u64 m = line >= 0 ? (empty & lineMask[line]) : 0;
  return m ? m : empty;
}

static inline u64 mix(u64 x) { x ^= x >> 31; x *= 0x7fb5d329728ea185ULL; x ^= x >> 27; x *= 0x81dadef4bc2dd44dULL; x ^= x >> 33; return x; }
static inline u32 hashPos(u64 cur, u64 oth, int line) { return (u32)mix(cur * 0x9E3779B97F4A7C15ULL ^ mix(oth + (u64)(line + 2) * 0xD6E8FEB86659FD93ULL)); }

// ---- WDL transposition table: exact keys, bounds [lo, hi], 4-way buckets ----
typedef struct { u64 cur, oth; int8_t line, lo, hi, move; uint8_t gen; } TTE;
static TTE *tt; static u32 ttMask; static uint8_t gen = 1;

static TTE *ttFind(u64 cur, u64 oth, int line) {
  TTE *b = &tt[hashPos(cur, oth, line) & ttMask & ~3u];
  for (int k = 0; k < 4; k++) if (b[k].gen == gen && b[k].cur == cur && b[k].oth == oth && b[k].line == line) return &b[k];
  return 0;
}

static void ttStore(u64 cur, u64 oth, int line, int lo, int hi, int move) {
  TTE *b = &tt[hashPos(cur, oth, line) & ttMask & ~3u], *victim = 0;
  int victimPly = -1;
  for (int k = 0; k < 4; k++) {
    if (b[k].gen == gen && b[k].cur == cur && b[k].oth == oth && b[k].line == line) {
      if (lo > b[k].lo) b[k].lo = (int8_t)lo;
      if (hi < b[k].hi) b[k].hi = (int8_t)hi;
      if (move >= 0) b[k].move = (int8_t)move;
      return;
    }
    int ply = b[k].gen != gen ? 99 : __builtin_popcountll(b[k].cur | b[k].oth);   // keep entries nearer the root
    if (ply > victimPly) { victimPly = ply; victim = &b[k]; }
  }
  victim->cur = cur; victim->oth = oth; victim->line = (int8_t)line;
  victim->lo = (int8_t)lo; victim->hi = (int8_t)hi; victim->move = (int8_t)move; victim->gen = gen;
}

static int history[NC];

// Negamax over {-1, 0, +1} from the side to move. Every move adds exactly one donut, so ply = popcount.
static int search(u64 cur, u64 oth, int line, int alpha, int beta) {
  nodes++;
  int ply = __builtin_popcountll(cur | oth);
  int ttMove = -1;
  TTE *e = ttFind(cur, oth, line);
  if (e) {
    if (e->lo >= beta) return e->lo;
    if (e->hi <= alpha) return e->hi;
    if (e->lo == e->hi) return e->lo;
    if (e->lo > alpha) alpha = e->lo;
    if (e->hi < beta) beta = e->hi;
    ttMove = e->move;
  }
  int alpha0 = alpha, beta0 = beta;

  u64 moves = legalMoves(cur, oth, line);
  if (!moves) return 0;   // only reachable from inconsistent editor positions
  int cell[NC], score[NC], n = 0;
  u64 cc[NC], oo[NC];
  int best = -2, bestMove = -1;
  int last = ply + 1 == endPly;
  while (moves) {
    int i = __builtin_ctzll(moves); moves &= moves - 1;
    u64 c = cur, o = oth;
    u64 flips = play(&c, &o, i);
    if (isWin(c, i, flips)) { ttStore(cur, oth, line, 1, 1, i); return 1; }
    if (last) {   // last donut: largest orthogonal group decides
      int v = groupResult(c, o);
      if (v > best) { best = v; bestMove = i; }
      continue;
    }
    // Ordering: TT move, flips, history; avoid handing the opponent a free choice.
    u64 nextEmpty = ~(c | o) & FULL;
    int s = history[i] + 64 * __builtin_popcountll(flips);
    if (!(nextEmpty & lineMask[lineOfCell[i]])) s -= 1 << 20;
    if (i == ttMove) s += 1 << 28;
    cell[n] = i; score[n] = s; cc[n] = c; oo[n] = o; n++;
  }
  if (!last) {
    for (int a = 1; a < n; a++)   // insertion sort, descending score
      for (int b = a; b > 0 && score[b] > score[b - 1]; b--) {
        int t = score[b]; score[b] = score[b - 1]; score[b - 1] = t;
        t = cell[b]; cell[b] = cell[b - 1]; cell[b - 1] = t;
        u64 x = cc[b]; cc[b] = cc[b - 1]; cc[b - 1] = x;
        x = oo[b]; oo[b] = oo[b - 1]; oo[b - 1] = x;
      }
    for (int k = 0; k < n; k++) {
      int v = -search(oo[k], cc[k], lineOfCell[cell[k]], -beta, -alpha);
      if (v > best) { best = v; bestMove = cell[k]; }
      if (best > alpha) alpha = best;
      if (alpha >= beta) { history[cell[k]] += 30 - ply; break; }
    }
  }
  int lo = best <= alpha0 ? -1 : best, hi = best >= beta0 ? 1 : best;
  ttStore(cur, oth, line, lo, hi, bestMove);
  return best;
}

// ---- distance search: "can the side to move force a win within d plies?" ----
// Monotone in d, so each entry keeps the largest d known to fail and the smallest d known to succeed.
// The WDL table prunes it: a position whose WDL value is not a win can never win within any d.
typedef struct { u64 cur, oth; int8_t line, noWinUpTo, winBy, move; uint8_t gen; } DTE;
static DTE *dt; static u32 dtMask;
static double dnodes, dlimit;
static int aborted;

static DTE *dtSlot(u64 cur, u64 oth, int line, int create) {
  DTE *b = &dt[hashPos(cur, oth, line) & dtMask & ~3u], *victim = 0;
  int victimPly = -1;
  for (int k = 0; k < 4; k++) {
    if (b[k].gen == gen && b[k].cur == cur && b[k].oth == oth && b[k].line == line) return &b[k];
    int ply = b[k].gen != gen ? 99 : __builtin_popcountll(b[k].cur | b[k].oth);
    if (ply > victimPly) { victimPly = ply; victim = &b[k]; }
  }
  if (!create) return 0;
  victim->cur = cur; victim->oth = oth; victim->line = (int8_t)line;
  victim->noWinUpTo = 0; victim->winBy = 127; victim->move = -1; victim->gen = gen;
  return victim;
}

static int loseWithin(u64 cur, u64 oth, int line, int d);

static int winWithin(u64 cur, u64 oth, int line, int d) {
  if (d <= 0 || aborted) return 0;
  if (++dnodes > dlimit) { aborted = 1; return 0; }
  TTE *e = ttFind(cur, oth, line);
  if (e && e->hi <= 0) return 0;
  DTE *s = dtSlot(cur, oth, line, 0);
  if (s) {
    if (d >= s->winBy) return 1;
    if (d <= s->noWinUpTo) return 0;
  }
  int ply = __builtin_popcountll(cur | oth), last = ply + 1 == endPly;
  int first = s ? s->move : -1;
  u64 moves = legalMoves(cur, oth, line);
  int cell[NC], n = 0;
  u64 cc[NC], oo[NC];
  while (moves) {
    int i = __builtin_ctzll(moves); moves &= moves - 1;
    u64 c = cur, o = oth;
    u64 flips = play(&c, &o, i);
    if (isWin(c, i, flips) || (last && groupResult(c, o) > 0)) {
      s = dtSlot(cur, oth, line, 1); s->winBy = 1; s->move = (int8_t)i;
      return 1;
    }
    if (last || d < 2) continue;
    TTE *ce = ttFind(o, c, lineOfCell[i]);
    if (ce && ce->lo >= 0) continue;   // the opponent does not lose after this move
    cell[n] = i; cc[n] = c; oo[n] = o;
    if (i == first || (ce && ce->hi <= -1)) {   // proven winning moves first
      int k = n;
      while (k > 0) { cell[k] = cell[k - 1]; cc[k] = cc[k - 1]; oo[k] = oo[k - 1]; k--; }
      cell[0] = i; cc[0] = c; oo[0] = o;
    }
    n++;
  }
  for (int k = 0; k < n; k++) {
    if (loseWithin(oo[k], cc[k], lineOfCell[cell[k]], d - 1)) {
      if (aborted) return 0;
      s = dtSlot(cur, oth, line, 1);
      if (d < s->winBy) s->winBy = (int8_t)d;
      s->move = (int8_t)cell[k];
      return 1;
    }
    if (aborted) return 0;
  }
  s = dtSlot(cur, oth, line, 1);
  if (d > s->noWinUpTo) s->noWinUpTo = (int8_t)d;
  return 0;
}

// The side to move loses within d plies whatever it plays.
static int loseWithin(u64 cur, u64 oth, int line, int d) {
  if (d <= 0 || aborted) return 0;
  TTE *e = ttFind(cur, oth, line);
  if (e && e->lo >= 0) return 0;
  int ply = __builtin_popcountll(cur | oth), last = ply + 1 == endPly;
  u64 moves = legalMoves(cur, oth, line);
  if (!moves) return 0;
  int cell[NC], n = 0;
  u64 cc[NC], oo[NC];
  while (moves) {
    int i = __builtin_ctzll(moves); moves &= moves - 1;
    u64 c = cur, o = oth;
    u64 flips = play(&c, &o, i);
    if (isWin(c, i, flips)) return 0;
    if (last) { if (groupResult(c, o) >= 0) return 0; continue; }
    if (d < 2) return 0;
    TTE *ce = ttFind(o, c, lineOfCell[i]);
    if (ce && ce->hi <= 0) return 0;   // this reply escapes a forced loss entirely
    cell[n] = i; cc[n] = c; oo[n] = o; n++;
  }
  for (int k = 0; k < n; k++)
    if (!winWithin(oo[k], cc[k], lineOfCell[cell[k]], d - 1)) return 0;
  return 1;
}

// ---- exported API ----
static u64 rootCur, rootOth; static int rootLine, rootPly, rootRemaining;
static char boardDirs[NC];
static int configured;

EXPORT(io_buffer) unsigned char *io_buffer(void) { return io; }

// Allocates the tables once: 2^ttLog2 WDL entries and 2^dtLog2 distance entries (24 bytes each).
EXPORT(configure) int configure(int ttLog2, int dtLog2) {
  if (configured) return 1;
  tt = (TTE *)alloc((u32)sizeof(TTE) << ttLog2);
  dt = (DTE *)alloc((u32)sizeof(DTE) << dtLog2);
  if (!tt || !dt) return 0;
  ttMask = (1u << ttLog2) - 1;
  dtMask = (1u << dtLog2) - 1;
  initGeometry();
  configured = 1;
  return 1;
}

static void invalidate(void) {
  if (++gen == 0) {   // generation wrapped: really clear the tables once
    for (u32 k = 0; k <= ttMask; k++) tt[k].gen = 0;
    for (u32 k = 0; k <= dtMask; k++) dt[k].gen = 0;
    gen = 1;
  }
  for (int i = 0; i < NC; i++) history[i] = 0;
}

// Reads 36 arrow characters (H/V/D/A, row-major) from io_buffer. Returns 0 on bad input.
EXPORT(set_board) int set_board(void) {
  int changed = 0;
  for (int i = 0; i < NC; i++) {
    char d = (char)io[i];
    int r = i / 6, c = i % 6;
    switch (d) {
      case 'H': lineOfCell[i] = r; break;
      case 'V': lineOfCell[i] = 6 + c; break;
      case 'D': lineOfCell[i] = 12 + (r - c + 5); break;
      case 'A': lineOfCell[i] = 23 + (r + c); break;
      default: return 0;
    }
    if (boardDirs[i] != d) { boardDirs[i] = d; changed = 1; }
  }
  if (changed) invalidate();
  return 1;
}

// Root position: masks of the side to move and the other side (as 32-bit halves), the constrained line,
// and the donuts left in both supplies together (the game ends on group size when that reaches 0).
EXPORT(set_root) void set_root(u32 curLo, u32 curHi, u32 othLo, u32 othHi, int line, int remaining) {
  rootCur = ((u64)curHi << 32 | curLo) & FULL;
  rootOth = ((u64)othHi << 32 | othLo) & FULL & ~rootCur;
  rootLine = line;
  rootPly = __builtin_popcountll(rootCur | rootOth);
  rootRemaining = remaining;
  if (rootPly + remaining != endPly) { endPly = rootPly + remaining; invalidate(); }
}

EXPORT(legal_lo) u32 legal_lo(void) { return (u32)legalMoves(rootCur, rootOth, rootLine); }
EXPORT(legal_hi) u32 legal_hi(void) { return (u32)(legalMoves(rootCur, rootOth, rootLine) >> 32); }

// Value of playing `cell` from the root, for the side to move: 1 win, 0 draw, -1 loss.
EXPORT(move_value) int move_value(int cell) {
  u64 c = rootCur, o = rootOth;
  u64 f = play(&c, &o, cell);
  if (isWin(c, cell, f)) return 1;
  if (rootRemaining <= 1) return groupResult(c, o);
  return -search(o, c, lineOfCell[cell], -1, 1);
}

// Plies until the game ends after playing `cell` (counting that move), with best play by both sides,
// for a move whose value (from move_value) is a win or a loss. 0 if the node budget ran out first.
EXPORT(move_distance) int move_distance(int cell, int value, double budget) {
  u64 c = rootCur, o = rootOth;
  u64 f = play(&c, &o, cell);
  if (isWin(c, cell, f) || rootRemaining <= 1) return 1;
  if (value == 0) return 0;
  int line = lineOfCell[cell];
  dnodes = 0; dlimit = budget; aborted = 0;
  for (int k = 1; k < rootRemaining; k++) {
    int hit = value > 0 ? loseWithin(o, c, line, k) : winWithin(o, c, line, k);
    if (aborted) break;
    if (hit) { nodes += dnodes; return k + 1; }
  }
  nodes += dnodes;
  return 0;
}

EXPORT(node_count) double node_count(void) { return nodes; }
EXPORT(reset_nodes) void reset_nodes(void) { nodes = 0; }

// perft from the root: leaves at `depth`, finished games counted in perft_terminals().
static double pLeaves, pTerms;
static void perftRec(u64 cur, u64 oth, int line, int depth) {
  if (depth == 0) { pLeaves++; return; }
  u64 moves = legalMoves(cur, oth, line);
  while (moves) {
    int i = __builtin_ctzll(moves); moves &= moves - 1;
    u64 c = cur, o = oth; u64 f = play(&c, &o, i);
    if (isWin(c, i, f) || __builtin_popcountll(c | o) == endPly) { pTerms++; continue; }
    perftRec(o, c, lineOfCell[i], depth - 1);
  }
}
EXPORT(perft) double perft(int depth) { pLeaves = pTerms = 0; perftRec(rootCur, rootOth, rootLine, depth); return pLeaves; }
EXPORT(perft_terminals) double perft_terminals(void) { return pTerms; }
