// Prototype native Donuts solver: bitboards + win/draw/loss alpha-beta + transposition table.
// Experiment only (feasibility + speed measurement), not production code. See README.md.
//
// Board arrows come from DONUTS_BOARD (36 chars of H/V/D/A, row-major); default is the board in README.md.
// Positions are read from stdin, one per line: comma-separated cell indices (r*6+c) played from the
// empty board. An empty line is the empty board.
//
//   wdl perft <depth>                       move-generation node counts (cross-check with crosscheck.ts)
//   wdl solve  <ttLog2>                     root win/draw/loss value, nodes, seconds
//   wdl values <ttLog2>                     "seq;v,v,..." value of every legal move, row-major order
//   wdl proof  <ttLog2> <out.txt>           solve, then write the winner's strategy (board|line|move)
//                                           for verify-proof.ts
// <ttLog2> sets the transposition table to 2^ttLog2 entries of 24 bytes (25 -> ~800 MB).
#define __USE_MINGW_ANSI_STDIO 1
#define _CRT_SECURE_NO_WARNINGS
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

typedef uint64_t u64;
#define NC 36
#define FULL ((1ULL << 36) - 1)
#define BIT(i) (1ULL << (i))

static const char *DIRS_DEFAULT = "DVDAHVAVADHDAHHAVVHDAADHVAHVVHADVHDA";
static char DIRS[6][7];

static int lineOfCell[NC];   // constraint line the opponent gets after a donut lands on this cell
static u64 lineMask[34];
static u64 winMask[32];
static int winThrough[NC][8], nWinThrough[NC];
static int ray[NC][8][6], rayLen[NC][8];   // 8 directions, opposite pairs are (0,1) (2,3) (4,5) (6,7)
static u64 COL0, COL5;

static long long nodes;

static void init(void) {
  const char *d = getenv("DONUTS_BOARD") ? getenv("DONUTS_BOARD") : DIRS_DEFAULT;
  for (int r = 0; r < 6; r++) { memcpy(DIRS[r], d + 6 * r, 6); DIRS[r][6] = 0; }
  for (int r = 0; r < 6; r++)
    for (int c = 0; c < 6; c++) {
      int i = r * 6 + c;
      switch (DIRS[r][c]) {
        case 'H': lineOfCell[i] = r; break;
        case 'V': lineOfCell[i] = 6 + c; break;
        case 'D': lineOfCell[i] = 12 + (r - c + 5); break;
        case 'A': lineOfCell[i] = 23 + (r + c); break;
      }
      lineMask[r] |= BIT(i);
      lineMask[6 + c] |= BIT(i);
      lineMask[12 + (r - c + 5)] |= BIT(i);
      lineMask[23 + (r + c)] |= BIT(i);
      if (c == 0) COL0 |= BIT(i);
      if (c == 5) COL5 |= BIT(i);
    }
  int n = 0;
  for (int r = 0; r < 6; r++) for (int s = 0; s <= 1; s++) { u64 m = 0; for (int k = 0; k < 5; k++) m |= BIT(r * 6 + s + k); winMask[n++] = m; }
  for (int c = 0; c < 6; c++) for (int s = 0; s <= 1; s++) { u64 m = 0; for (int k = 0; k < 5; k++) m |= BIT((s + k) * 6 + c); winMask[n++] = m; }
  for (int rs = 0; rs <= 1; rs++) for (int cs = 0; cs <= 1; cs++) { u64 m = 0; for (int k = 0; k < 5; k++) m |= BIT((rs + k) * 6 + cs + k); winMask[n++] = m; }
  for (int rs = 4; rs <= 5; rs++) for (int cs = 0; cs <= 1; cs++) { u64 m = 0; for (int k = 0; k < 5; k++) m |= BIT((rs - k) * 6 + cs + k); winMask[n++] = m; }
  for (int w = 0; w < 32; w++) for (int i = 0; i < NC; i++) if (winMask[w] & BIT(i)) winThrough[i][nWinThrough[i]++] = w;
  static const int DR[8] = {0, 0, 1, -1, 1, -1, 1, -1}, DC[8] = {1, -1, 0, 0, 1, -1, -1, 1};
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

static inline u64 legalMoves(u64 cur, u64 oth, int line) {
  u64 empty = ~(cur | oth) & FULL;
  u64 m = line >= 0 ? (empty & lineMask[line]) : 0;
  return m ? m : empty;
}

// ---- transposition table: exact keys, WDL bounds [lo, hi] ----
typedef struct { u64 cur, oth; int8_t line, lo, hi, move; } TTE;
static TTE *tt; static u64 ttMaskBits;
static inline u64 mix(u64 x) { x ^= x >> 31; x *= 0x7fb5d329728ea185ULL; x ^= x >> 27; x *= 0x81dadef4bc2dd44dULL; x ^= x >> 33; return x; }
static inline u64 ttIndex(u64 cur, u64 oth, int line) { return (mix(cur * 0x9E3779B97F4A7C15ULL ^ mix(oth + (u64)(line + 2) * 0xD6E8FEB86659FD93ULL))) & ttMaskBits & ~3ULL; }

static TTE *ttFind(u64 cur, u64 oth, int line) {
  TTE *b = &tt[ttIndex(cur, oth, line)];
  for (int k = 0; k < 4; k++) if (b[k].lo != 0x7f && b[k].cur == cur && b[k].oth == oth && b[k].line == line) return &b[k];
  return NULL;
}

static void ttStore(u64 cur, u64 oth, int line, int lo, int hi, int move) {
  TTE *b = &tt[ttIndex(cur, oth, line)], *victim = NULL;
  int victimPly = -1;
  for (int k = 0; k < 4; k++) {
    if (b[k].lo != 0x7f && b[k].cur == cur && b[k].oth == oth && b[k].line == line) {
      if (lo > b[k].lo) b[k].lo = (int8_t)lo;
      if (hi < b[k].hi) b[k].hi = (int8_t)hi;
      if (move >= 0) b[k].move = (int8_t)move;
      return;
    }
    int ply = b[k].lo == 0x7f ? 99 : __builtin_popcountll(b[k].cur | b[k].oth);   // keep entries nearer the root
    if (ply > victimPly) { victimPly = ply; victim = &b[k]; }
  }
  victim->cur = cur; victim->oth = oth; victim->line = (int8_t)line; victim->lo = (int8_t)lo; victim->hi = (int8_t)hi; victim->move = (int8_t)move;
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
  int cell[NC], score[NC], n = 0;
  u64 cc[NC], oo[NC];
  int best = -2, bestMove = -1;
  while (moves) {
    int i = __builtin_ctzll(moves); moves &= moves - 1;
    u64 c = cur, o = oth;
    u64 flips = play(&c, &o, i);
    if (isWin(c, i, flips)) { ttStore(cur, oth, line, 1, 1, i); return 1; }
    if (ply + 1 == 30) {   // last donut: largest orthogonal group decides
      int gc = largestGroup(c), go = largestGroup(o);
      int v = gc > go ? 1 : gc < go ? -1 : 0;
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
  if (ply + 1 == 30) {
    int lo = best <= alpha0 ? -1 : best, hi = best >= beta0 ? 1 : best;
    ttStore(cur, oth, line, lo, hi, bestMove);
    return best;
  }
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
  int lo = best <= alpha0 ? -1 : best, hi = best >= beta0 ? 1 : best;
  ttStore(cur, oth, line, lo, hi, bestMove);
  return best;
}


// ---- proof export (winner's strategy) ----
static u64 *seenK1, *seenK2; static int *seenLine; static u64 seenCap, seenCount;
static int seen(u64 a, u64 b, int line) {   // returns 1 if already present, else inserts
  if (seenCount * 2 >= seenCap) { fprintf(stderr, "proof set full\n"); exit(2); }
  u64 h = mix(a * 0x9E3779B97F4A7C15ULL ^ mix(b + (u64)(line + 2))) & (seenCap - 1);
  while (seenLine[h] != -9) {
    if (seenK1[h] == a && seenK2[h] == b && seenLine[h] == line) return 1;
    h = (h + 1) & (seenCap - 1);
  }
  seenK1[h] = a; seenK2[h] = b; seenLine[h] = line; seenCount++;
  return 0;
}
static long long orNodes, andNodes;
static FILE *proofOut;
static void printNode(u64 vanilla, u64 choc, int line, int move) {
  char s[37];
  for (int i = 0; i < NC; i++) s[i] = (vanilla & BIT(i)) ? '1' : (choc & BIT(i)) ? '2' : '0';
  s[36] = 0;
  fprintf(proofOut, "%s|%d|%d\n", s, line, move);
}
// cur = side to move. winnerToMove: cur is the proven winner (OR node) or the loser (AND node).
static void extract(u64 cur, u64 oth, int line, int winnerToMove, int vanillaToMove) {
  if (seen(cur, oth, line)) return;
  int ply = __builtin_popcountll(cur | oth);
  u64 moves = legalMoves(cur, oth, line);
  if (winnerToMove) {
    orNodes++;
    while (moves) {
      int i = __builtin_ctzll(moves); moves &= moves - 1;
      u64 c = cur, o = oth; u64 f = play(&c, &o, i);
      int win;
      if (isWin(c, i, f)) win = 1;
      else if (ply + 1 == 30) win = largestGroup(c) > largestGroup(o);
      else win = search(o, c, lineOfCell[i], -1, 0) == -1;
      if (!win) continue;
      printNode(vanillaToMove ? cur : oth, vanillaToMove ? oth : cur, line, i);
      if (!isWin(c, i, f) && ply + 1 < 30) extract(o, c, lineOfCell[i], 0, !vanillaToMove);
      return;
    }
    fprintf(stderr, "no winning move found at OR node (ply %d)\n", ply); exit(3);
  }
  andNodes++;
  while (moves) {
    int i = __builtin_ctzll(moves); moves &= moves - 1;
    u64 c = cur, o = oth; u64 f = play(&c, &o, i);
    if (isWin(c, i, f)) { fprintf(stderr, "loser has a winning reply (ply %d)\n", ply); exit(4); }
    if (ply + 1 == 30) { if (largestGroup(c) >= largestGroup(o)) { fprintf(stderr, "loser draws/wins at end\n"); exit(5); } continue; }
    extract(o, c, lineOfCell[i], 1, !vanillaToMove);
  }
}

// ---- helpers ----
typedef struct { u64 cur, oth; int line, over; } Pos;
static Pos fromSequence(const char *s) {
  Pos p = {0, 0, -1, 0};
  while (*s && *s != '\n' && *s != '\r') {
    int i = atoi(s);
    u64 f = play(&p.cur, &p.oth, i);
    if (isWin(p.cur, i, f)) p.over = 1;
    p.line = lineOfCell[i];
    u64 t = p.cur; p.cur = p.oth; p.oth = t;
    while (*s && *s != ',' && *s != '\n') s++;
    if (*s == ',') s++;
  }
  return p;
}

static void perft(u64 cur, u64 oth, int line, int depth, long long *leaves, long long *terms) {
  if (depth == 0) { (*leaves)++; return; }
  u64 moves = legalMoves(cur, oth, line);
  while (moves) {
    int i = __builtin_ctzll(moves); moves &= moves - 1;
    u64 c = cur, o = oth; u64 f = play(&c, &o, i);
    if (isWin(c, i, f) || __builtin_popcountll(c | o) == 30) { (*terms)++; continue; }
    perft(o, c, lineOfCell[i], depth - 1, leaves, terms);
  }
}

#ifdef _WIN32
#include <windows.h>
static double now(void) { LARGE_INTEGER f, c; QueryPerformanceFrequency(&f); QueryPerformanceCounter(&c); return (double)c.QuadPart / f.QuadPart; }
#else
static double now(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec + t.tv_nsec * 1e-9; }
#endif

static void allocTT(int log2) {
  ttMaskBits = (1ULL << log2) - 1;
  tt = malloc(sizeof(TTE) << log2);
  for (u64 k = 0; k <= ttMaskBits; k++) tt[k].lo = 0x7f;
}

int main(int argc, char **argv) {
  init();
  if (argc >= 3 && !strcmp(argv[1], "perft")) {
    for (int d = 1; d <= atoi(argv[2]); d++) {
      long long leaves = 0, terms = 0; double t = now();
      perft(0, 0, -1, d, &leaves, &terms);
      printf("perft %d: leaves=%lld terminals=%lld (%.2fs)\n", d, leaves, terms, now() - t);
    }
    return 0;
  }
  allocTT(argc >= 3 ? atoi(argv[2]) : 24);
  char buf[512];
  while (fgets(buf, sizeof buf, stdin)) {
    buf[strcspn(buf, "\r\n")] = 0;
    Pos p = fromSequence(buf);
    if (p.over) continue;
    if (!strcmp(argv[1], "proof")) {
      nodes = 0; double t = now();
      int v = search(p.cur, p.oth, p.line, -1, 1);
      printf("root value=%+d nodes=%lld time=%.2fs\n", v, nodes, now() - t);
      if (v == 0) { printf("draw: no single-winner proof to export\n"); continue; }
      seenCap = 1ULL << 26; seenK1 = malloc(8 * seenCap); seenK2 = malloc(8 * seenCap); seenLine = malloc(sizeof(int) * seenCap);
      for (u64 k = 0; k < seenCap; k++) seenLine[k] = -9;
      proofOut = fopen(argv[3], "w");
      int vanillaToMove = (__builtin_popcountll(p.cur | p.oth) % 2) == 0;
      t = now();
      extract(p.cur, p.oth, p.line, v == 1, vanillaToMove);
      fclose(proofOut);
      printf("proof: winner=%s orNodes=%lld andNodes=%lld extraNodes=%lld time=%.2fs\n",
             (v == 1) == vanillaToMove ? "vanilla" : "chocolate", orNodes, andNodes, nodes, now() - t);
      continue;
    }
    if (!strcmp(argv[1], "values")) {
      printf("%s;", buf);
      u64 moves = legalMoves(p.cur, p.oth, p.line);
      int first = 1, ply = __builtin_popcountll(p.cur | p.oth);
      while (moves) {
        int i = __builtin_ctzll(moves); moves &= moves - 1;
        u64 c = p.cur, o = p.oth; u64 f = play(&c, &o, i);
        int v;
        if (isWin(c, i, f)) v = 1;
        else if (ply + 1 == 30) { int gc = largestGroup(c), go = largestGroup(o); v = gc > go ? 1 : gc < go ? -1 : 0; }
        else v = -search(o, c, lineOfCell[i], -1, 1);
        printf(first ? "%d" : ",%d", v); first = 0;
      }
      printf("\n");
    } else {
      nodes = 0; double t = now();
      int v = search(p.cur, p.oth, p.line, -1, 1);
      double dt = now() - t;
      printf("ply=%d value=%+d nodes=%lld time=%.2fs rate=%.1fM/s\n", __builtin_popcountll(p.cur | p.oth), v, nodes, dt, nodes / dt / 1e6);
      fflush(stdout);
    }
  }
  return 0;
}
