import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardConfig, GameMode, GameState, MoveAnalysis } from '../game/types';
import { createInitialState, getValidMoves, applyMove } from '../game/engine';
import { BoardView } from './BoardView';
import { GameInfo } from './GameInfo';

interface Props {
  config: BoardConfig;
  mode: GameMode;
  onNewGame: () => void;
}

interface SolverMsg {
  type: 'partial' | 'complete';
  analyses: MoveAnalysis[];
  depth: number;
  complete: boolean;
}

export function GameScreen({ config, mode, onNewGame }: Props) {
  const [state, setState] = useState<GameState>(() => createInitialState(config));
  const [hints, setHints] = useState<MoveAnalysis[]>([]);
  const [hintsEnabled, setHintsEnabled] = useState(true);
  const [lastPlaced, setLastPlaced] = useState<[number, number] | null>(null);
  const [solverDepth, setSolverDepth] = useState(0);
  const [solverComplete, setSolverComplete] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize worker
  useEffect(() => {
    const worker = new Worker(
      new URL('../solver/worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<SolverMsg>) => {
      const { analyses, depth, complete } = e.data;
      setHints(analyses ?? []);
      setSolverDepth(depth ?? 0);
      if (complete) setSolverComplete(true);
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // Run solver whenever state changes (if playing)
  useEffect(() => {
    if (state.status.type !== 'playing') return;

    setHints([]);
    setSolverDepth(0);
    setSolverComplete(false);

    workerRef.current?.postMessage({ type: 'cancel' });
    workerRef.current?.postMessage({ type: 'analyze', state });
  }, [state]);

  // AI move: trigger after hints come in (first result available)
  useEffect(() => {
    const isAITurn =
      (mode === 'hva' && state.currentPlayer === 'chocolate') ||
      (mode === 'avh' && state.currentPlayer === 'vanilla');

    if (!isAITurn || state.status.type !== 'playing' || hints.length === 0) return;

    // Wait a moment so the user can see the analysis before the AI moves
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    aiTimerRef.current = setTimeout(() => {
      const best = pickBestMove(hints);
      if (best) handleMove(best[0], best[1]);
    }, solverComplete ? 600 : 300);

    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, [hints, solverComplete, mode, state.currentPlayer, state.status.type]);

  const handleMove = useCallback((row: number, col: number) => {
    setState(prev => {
      const valid = getValidMoves(prev);
      if (!valid.some(([r, c]) => r === row && c === col)) return prev;
      return applyMove(prev, row, col);
    });
    setLastPlaced([row, col]);
  }, []);

  const isAITurn =
    (mode === 'hva' && state.currentPlayer === 'chocolate') ||
    (mode === 'avh' && state.currentPlayer === 'vanilla');

  // Determine cell size based on viewport (simple responsive sizing)
  const cellSize = Math.min(80, Math.floor((window.innerWidth - 320) / 6));

  return (
    <div style={{
      display: 'flex',
      gap: 24,
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '24px 16px',
      flexWrap: 'wrap',
    }}>
      <BoardView
        state={state}
        onMove={isAITurn ? () => {} : handleMove}
        hints={hints}
        hintsEnabled={hintsEnabled}
        lastPlaced={lastPlaced}
        cellSize={cellSize}
      />
      <GameInfo
        state={state}
        mode={mode}
        hintsEnabled={hintsEnabled}
        onToggleHints={() => setHintsEnabled(h => !h)}
        onNewGame={onNewGame}
        solverDepth={solverDepth}
        solverComplete={solverComplete}
        hints={hints}
      />
    </div>
  );
}

function pickBestMove(hints: MoveAnalysis[]): [number, number] | null {
  if (hints.length === 0) return null;
  const wins = hints.filter(h => h.outcome === 'win').sort((a, b) => a.movesToEnd - b.movesToEnd);
  if (wins.length > 0) return [wins[0].row, wins[0].col];
  const draws = hints.filter(h => h.outcome === 'draw');
  if (draws.length > 0) return [draws[0].row, draws[0].col];
  const losses = hints.filter(h => h.outcome === 'loss').sort((a, b) => b.movesToEnd - a.movesToEnd);
  return losses.length > 0 ? [losses[0].row, losses[0].col] : null;
}
