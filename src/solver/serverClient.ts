import type { GameState } from '../game/types';
import type { SolveJobSnapshot, StartSolveRequest } from './serverProtocol';

const SOLVER_URL = (import.meta.env.VITE_DONUTS_SOLVER_URL ?? 'http://localhost:8787').replace(/\/$/, '');

export async function startServerSolve(
  state: GameState,
  signal: AbortSignal,
): Promise<SolveJobSnapshot> {
  const body: StartSolveRequest = { state };
  const response = await fetch(`${SOLVER_URL}/api/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Solver service returned ${response.status}`);
  }

  return await response.json() as SolveJobSnapshot;
}

export async function getServerSolve(
  jobId: string,
  signal: AbortSignal,
): Promise<SolveJobSnapshot> {
  const response = await fetch(`${SOLVER_URL}/api/solve/${jobId}`, { signal });

  if (!response.ok) {
    throw new Error(`Solver service returned ${response.status}`);
  }

  return await response.json() as SolveJobSnapshot;
}
