import type { GameState } from '../game/types';
import type { SolveJobSnapshot, StartSolveRequest } from './serverProtocol';

const SOLVER_URL = (import.meta.env.VITE_DONUTS_SOLVER_URL ?? 'http://localhost:8787').replace(/\/$/, '');

// After a failed connection, skip the service for a while: a refused localhost connection can take
// seconds on Windows, and the browser engine solves most positions faster than that.
const RETRY_AFTER_MS = 60_000;
const CONNECT_TIMEOUT_MS = 1_500;
let unavailableUntil = 0;

export async function startServerSolve(
  state: GameState,
  signal: AbortSignal,
): Promise<SolveJobSnapshot> {
  if (Date.now() < unavailableUntil) throw new Error('Solver service unavailable');
  const body: StartSolveRequest = { state };
  let response: Response;
  try {
    response = await fetch(`${SOLVER_URL}/api/solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(CONNECT_TIMEOUT_MS)]),
    });
  } catch (error) {
    if (!signal.aborted) unavailableUntil = Date.now() + RETRY_AFTER_MS;
    throw error;
  }

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
