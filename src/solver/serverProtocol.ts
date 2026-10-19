import type { GameState } from '../game/types';
import type { SolverResult } from './solver';

export type SolveJobStatus = 'running' | 'complete' | 'failed';

export interface SolveJobSnapshot {
  id: string;
  key: string;
  status: SolveJobStatus;
  result: SolverResult | null;
  error: string | null;
  cached: boolean;
  maxDepth: number;
  checkpointDepth: number;
  startedAt: number;
  updatedAt: number;
}

export interface StartSolveRequest {
  state: GameState;
  maxDepth?: number;
}
