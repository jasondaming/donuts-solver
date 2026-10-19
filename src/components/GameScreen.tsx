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
import { browserSolverPool } from '../solver/browserPool';
import { pickBestMove } from '../solver/solver';
import { lookupOpening } from '../solver/openingBook';
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
  provenAt: number | null;  // when every legal move first had a proven outcome
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
  const solverComplete = activeSolver?.complete ?? false;
  const provenAt = activeSolver?.provenAt ?? null;
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
    let browserSolve: { cancel(): void } | null = null;
    const abort = new AbortController();

    // Empty boards get their proven first-move map from the opening book at once; the live solve
    // then adds the distances. Live outcomes win wherever both exist.
    let live: SolverMsg | null = null;
    let opening: MoveAnalysis[] | null = null;

    const publish = () => {
      if (disposed) return;
      const message: SolverMsg = live ?? { analyses: opening ?? [], depth: state.vanillaLeft + state.chocolateLeft, complete: false };
      const book = opening;
      const analyses = (message.analyses ?? []).map(a =>
        a.outcome === 'unknown' && book ? book.find(b => b.row === a.row && b.col === a.col) ?? a : a);
      const allProven = analyses.length > 0 && analyses.every(a => a.proven);
      // With book outcomes merged in, live value searches still running count as remaining work.
      const stats = message.stats && {
        ...message.stats,
        movesSolved: analyses.filter(a => a.proven).length,
        distancesPending: message.stats.distancesPending + message.stats.moveCount - message.stats.movesSolved,
      };
      setSolverState(prev => ({
        positionKey,
        analyses,
        depth: message.depth ?? 0,
        complete: message.complete ?? false,
        stats,
        provenAt: prev?.positionKey === positionKey && prev.provenAt !== null ? prev.provenAt : allProven ? Date.now() : null,
      }));
    };

    const applyResult = (message: SolverMsg) => {
      live = message;
      publish();
    };

    void lookupOpening(state).then(analyses => {
      opening = analyses;
      if (analyses) publish();
    }, () => {});

    const startBrowserWorker = () => {
      if (disposed) return;
      setSolverSource('browser');
      browserSolve = browserSolverPool().analyze(state, applyResult);
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
      browserSolve?.cancel();
    };
  }, [positionKey, state]);

  useEffect(() => {
    const isAITurn =
      (sessionMode === 'hva' && state.currentPlayer === 'chocolate') ||
      (sessionMode === 'avh' && state.currentPlayer === 'vanilla');

    if (!isAtLatestMove || !isAITurn || state.status.type !== 'playing' || provenAt === null) return;

    // Every move is proven by now; give the distance pass a few seconds to find the fastest win.
    const delay = solverComplete ? 600 : Math.max(600, provenAt + 3000 - Date.now());
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    aiTimerRef.current = setTimeout(() => {
      const best = pickBestMove(hints);
      if (best) playAIMove(best[0], best[1]);
    }, delay);

    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, [hints, provenAt, solverComplete, sessionMode, state.currentPlayer, state.status.type, isAtLatestMove]);

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
