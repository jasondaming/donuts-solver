import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ExactCacheEntry, ExactCacheLike } from '../src/solver/exactCacheTypes.ts';

export class PersistentExactCache implements ExactCacheLike {
  private readonly entries = new Map<string, ExactCacheEntry>();
  private readonly journalPath: string;
  private writeQueue: Promise<void> = Promise.resolve();
  private loaded = false;
  private readonly cacheDir: string;

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
    this.journalPath = path.join(cacheDir, 'exact.journal');
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    await mkdir(this.cacheDir, { recursive: true });

    try {
      const raw = await readFile(this.journalPath, 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const entry = JSON.parse(line) as { key: string; entry: ExactCacheEntry };
        this.entries.set(entry.key, entry.entry);
      }
    } catch {
      // Fresh cache is normal.
    }

    this.loaded = true;
  }

  get(key: string): ExactCacheEntry | null {
    return this.entries.get(key) ?? null;
  }

  set(key: string, entry: ExactCacheEntry): void {
    const existing = this.entries.get(key);
    if (existing) {
      if (existing.depth > entry.depth) return;
      if (existing.depth === entry.depth && priority(existing.type) >= priority(entry.type)) return;
    }

    this.entries.set(key, entry);
    this.writeQueue = this.writeQueue
      .then(() => appendFile(this.journalPath, `${JSON.stringify({ key, entry })}\n`, 'utf8'))
      .catch(error => {
        console.warn('Failed to append exact cache entry:', error);
      });
  }

  size(): number {
    return this.entries.size;
  }

  async flush(): Promise<void> {
    await this.writeQueue;
  }
}

function priority(type: ExactCacheEntry['type']): number {
  if (type === 'exact') return 3;
  if (type === 'lower') return 2;
  return 1;
}
