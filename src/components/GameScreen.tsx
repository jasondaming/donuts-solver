import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { BoardConfig, GameMode, GameState, MoveAnalysis, SolverProgress } from '../game/types';
import {
  canApplyMove,
  createInitialHistory,
  createMoveEntry,
  decodeGameSession,
  encodeGameSession,
  SAVED_SESSION_KEY,
  swapGameSessionColors,
  type GameSessionData,
  type TimelineEntry,
} from '../game/session';
import { analyzeOpening } from '../game/openingGuide';
import { getServerSolve, startServerSolve } from '../solver/serverClient';
import { BoardView } from './BoardView';
import { GameInfo } from './GameInfo';
import { PositionEditor } from './PositionEditor';

interface Props {
  config: BoardConfig;
  mode: GameMode;
  initialSession: GameSessionData | null;
  onLoadSession: (session: GameSessionData) => void;
  onNewGame: () => void;
}

interface SolverMsg {
  analyses: MoveAnalysis[];
  depth: number;
  complete: boolean;
  stats?: SolverProgress;
}

interface SolverState extends SolverMsg {
  positionKey: string;
}

type SolverSource = 'server' | 'browser';

const EMPTY_ANALYSES: MoveAnalysis[] = [];

export function GameScreen({ config, mode, initialSession, onLoadSession, onNewGame }: Props) {
  const [sessionConfig] = useState<BoardConfig>(() => initialSession?.config ?? config);
  const [sessionMode, setSessionMode] = useState<GameMode>(() => initialSession?.mode ?? mode);
  const [history, setHistory] = useState<TimelineEntry[]>(() => initialSession?.history ?? createInitialHistory(config));
  const [historyIndex, setHistoryIndex] = useState(() => initialSession?.currentIndex ?? 0);
  const [solverState, setSolverState] = useState<SolverState | null>(null);
  const [solverSource, setSolverSource] = useState<SolverSource | null>(null);
  const [hintsEnabled, setHintsEnabled] = useState(true);
  const [editingPosition, setEditingPosition] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safeHistoryIndex = Math.max(0, Math.min(historyIndex, history.length - 1));
  const currentEntry = history[safeHistoryIndex] ?? history[0];
  const state = currentEntry.state;
  const lastPlaced = currentEntry.lastPlaced;
  const isAtLatestMove = safeHistoryIndex === history.length - 1;
  const positionKey = encodePosition(state);
  const activeSolver = solverState?.positionKey === positionKey ? solverState : null;
  const hints = activeSolver?.analyses ?? EMPTY_ANALYSES;
  const solverDepth = activeSolver?.depth ?? 0;
  const solverComplete = activeSolver?.complete ?? false;
  const openingGuide = state.status.type === 'playing' ? analyzeOpening(state) : null;

  function handleMove(row: number, col: number) {
    if (!canApplyMove(state, row, col)) return;

    const nextEntry = createMoveEntry(state, row, col);
    setHistory(prev => [...prev.slice(0, safeHistoryIndex + 1), nextEntry]);
    setHistoryIndex(safeHistoryIndex + 1);
  }

  const playAIMove = useEffectEvent((row: number, col: number) => {
    handleMove(row, col);
  });

  function currentSession(): GameSessionData {
    return {
      config: sessionConfig,
      mode: sessionMode,
      history,
      currentIndex: safeHistoryIndex,
    };
  }

  // Prefer the local Node solver service. If it is unavailable, fall back to the
  // browser worker so the UI still works as a standalone app.
  useEffect(() => {
    if (state.status.type !== 'playing') return;

    let disposed = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let worker: Worker | null = null;
    const abort = new AbortController();

    const applyResult = (message: SolverMsg) => {
      if (disposed) return;
      setSolverState({
        positionKey,
        analyses: message.analyses ?? [],
        depth: message.depth ?? 0,
        complete: message.complete ?? false,
        stats: message.stats,
      });
    };

    const startBrowserWorker = () => {
      if (disposed) return;
      setSolverSource('browser');

      worker = new Worker(
        new URL('../solver/worker.ts', import.meta.url),
        { type: 'module' },
      );

      worker.onmessage = (e: MessageEvent<SolverMsg>) => {
        applyResult(e.data);
      };

      worker.postMessage({ type: 'analyze', state });
    };

    const pollServerJob = async (jobId: string) => {
      try {
        const job = await getServerSolve(jobId, abort.signal);
        if (disposed) return;
        if (job.result) applyResult(job.result);

        if (job.status === 'running') {
          pollTimer = setTimeout(() => void pollServerJob(jobId), 250);
        } else if (job.status === 'failed') {
          startBrowserWorker();
        }
      } catch {
        if (!disposed) startBrowserWorker();
      }
    };

    void startServerSolve(state, abort.signal)
      .then(job => {
        if (disposed) return;
        setSolverSource('server');
        if (job.result) applyResult(job.result);

        if (job.status === 'running') {
          pollTimer = setTimeout(() => void pollServerJob(job.id), 250);
        } else if (job.status === 'failed') {
          startBrowserWorker();
        }
      })
      .catch(() => {
        if (!disposed) startBrowserWorker();
      });

    return () => {
      disposed = true;
      abort.abort();
      if (pollTimer) clearTimeout(pollTimer);
      worker?.terminate();
    };
  }, [positionKey, state]);

  useEffect(() => {
    const isAITurn =
      (sessionMode === 'hva' && state.currentPlayer === 'chocolate') ||
      (sessionMode === 'avh' && state.currentPlayer === 'vanilla');

    if (!isAtLatestMove || !isAITurn || state.status.type !== 'playing' || hints.length === 0) return;

    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    aiTimerRef.current = setTimeout(() => {
      const best = pickBestMove(hints);
      if (best) playAIMove(best[0], best[1]);
    }, solverComplete ? 600 : 300);

    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, [hints, solverComplete, sessionMode, state.currentPlayer, state.status.type, isAtLatestMove]);

  useEffect(() => {
    window.localStorage.setItem(SAVED_SESSION_KEY, encodeGameSession({
      config: sessionConfig,
      mode: sessionMode,
      history,
      currentIndex: safeHistoryIndex,
    }));
  }, [history, safeHistoryIndex, sessionConfig, sessionMode]);

  function handlePositionConfirm(newState: GameState) {
    setEditingPosition(false);
    setHistory([{ state: newState, move: null, lastPlaced: null }]);
    setHistoryIndex(0);
  }

  function handleNavigateHistory(index: number) {
    setHistoryIndex(Math.max(0, Math.min(index, history.length - 1)));
  }

  function handleUndo() {
    handleNavigateHistory(safeHistoryIndex - 1);
  }

  function handleRedo() {
    handleNavigateHistory(safeHistoryIndex + 1);
  }

  function handleSwapColors() {
    const swapped = swapGameSessionColors(currentSession());
    setSessionMode(swapped.mode);
    setHistory(swapped.history);
    setHistoryIndex(swapped.currentIndex);
    setShareStatus('Colors swapped');
  }

  async function handleShare() {
    const code = encodeGameSession(currentSession());
    const url = new URL(window.location.href);
    url.hash = `game=${encodeURIComponent(code)}`;

    try {
      await navigator.clipboard.writeText(url.toString());
      setShareStatus('Share link copied');
    } catch {
      window.prompt('Share link', url.toString());
      setShareStatus('Share link ready');
    }
  }

  function handleLoad() {
    const input = window.prompt('Paste a Donuts share link or code');
    if (!input) return;

    try {
      const session = decodeGameSession(input);
      onLoadSession(session);
    } catch (error) {
      setShareStatus(error instanceof Error ? error.message : 'Could not load session');
    }
  }

  const isAITurn =
    (sessionMode === 'hva' && state.currentPlayer === 'chocolate') ||
    (sessionMode === 'avh' && state.currentPlayer === 'vanilla');

  const cellSize = Math.min(80, Math.floor((window.innerWidth - 320) / 6));

  return (
    <>
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
          onMove={isAtLatestMove && isAITurn ? () => {} : handleMove}
          hints={hints}
          hintsEnabled={hintsEnabled}
          lastPlaced={lastPlaced}
          cellSize={cellSize}
        />
        <GameInfo
          state={state}
          mode={sessionMode}
          hintsEnabled={hintsEnabled}
          onToggleHints={() => setHintsEnabled(h => !h)}
          onNewGame={onNewGame}
          onEditPosition={() => setEditingPosition(true)}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onSwapColors={handleSwapColors}
          onShare={handleShare}
          onLoad={handleLoad}
          onNavigateHistory={handleNavigateHistory}
          canUndo={safeHistoryIndex > 0}
          canRedo={safeHistoryIndex < history.length - 1}
          history={history}
          historyIndex={safeHistoryIndex}
          shareStatus={shareStatus}
          solverDepth={solverDepth}
          solverComplete={solverComplete}
          solverSource={solverSource}
          solverStats={activeSolver?.stats ?? null}
          openingGuide={openingGuide}
          hints={hints}
        />
      </div>

      {editingPosition && (
        <PositionEditor
          baseState={state}
          onConfirm={handlePositionConfirm}
          onCancel={() => setEditingPosition(false)}
        />
      )}
    </>
  );
}

function encodePosition(state: GameState): string {
  let key = '';
  for (const row of state.board) {
    for (const cell of row) {
      key += cell.direction;
      key += cell.piece === null ? '0' : cell.piece === 'vanilla' ? '1' : '2';
    }
  }
  key += state.currentPlayer[0];
  key += state.constrainedLine
    ? `${state.constrainedLine.dir}${state.constrainedLine.index}`
    : 'N';
  key += `${state.vanillaLeft},${state.chocolateLeft},${state.status.type}`;
  return key;
}

function pickBestMove(hints: MoveAnalysis[]): [number, number] | null {
  if (hints.length === 0) return null;
  const wins = hints
    .filter(h => h.outcome === 'win' && h.movesToEnd !== null)
    .sort((a, b) => a.movesToEnd! - b.movesToEnd!);
  if (wins.length > 0) return [wins[0].row, wins[0].col];

  const draws = hints.filter(h => h.outcome === 'draw');
  if (draws.length > 0) return [draws[0].row, draws[0].col];

  const unknowns = hints.filter(h => h.outcome === 'unknown').sort((a, b) => b.score - a.score);
  if (unknowns.length > 0) return [unknowns[0].row, unknowns[0].col];

  const losses = hints
    .filter(h => h.outcome === 'loss' && h.movesToEnd !== null)
    .sort((a, b) => b.movesToEnd! - a.movesToEnd!);
  return losses.length > 0 ? [losses[0].row, losses[0].col] : null;
}
