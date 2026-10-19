export interface ExactCacheEntry {
  score: number;
  depth: number;
  bestMove: [number, number] | null;
  type: 'exact' | 'lower' | 'upper';
  updatedAt: number;
}

export interface ExactCacheLike {
  get(key: string): ExactCacheEntry | null;
  set(key: string, entry: ExactCacheEntry): void;
  size(): number;
}

export interface SolverStats {
  nodesVisited: number;
  cacheHits: number;
  cacheStores: number;
  elapsedMs: number;
}
