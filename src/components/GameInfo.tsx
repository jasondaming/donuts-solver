import type { GameState, MoveAnalysis, GameMode, SolverProgress } from '../game/types';
import type { TimelineEntry } from '../game/session';
import type { OpeningGuide, OpeningMoveInsight } from '../game/openingGuide';

interface Props {
  state: GameState;
  mode: GameMode;
  hintsEnabled: boolean;
  onToggleHints: () => void;
  onNewGame: () => void;
  onEditPosition: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSwapColors: () => void;
  onShare: () => void;
  onLoad: () => void;
  onNavigateHistory: (index: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  history: TimelineEntry[];
  historyIndex: number;
  shareStatus: string | null;
  solverComplete: boolean;
  solverSource: 'server' | 'browser' | null;
  solverStats: SolverProgress | null;
  openingGuide: OpeningGuide | null;
  hints: MoveAnalysis[];
}

export function GameInfo({
  state, mode, hintsEnabled, onToggleHints, onNewGame, onEditPosition,
  onUndo, onRedo, onSwapColors, onShare, onLoad, onNavigateHistory,
  canUndo, canRedo, history, historyIndex, shareStatus,
  solverComplete, solverSource, solverStats, openingGuide, hints,
}: Props) {
  const { currentPlayer, status, vanillaLeft, chocolateLeft, constrainedLine } = state;

  const playerLabel = (p: 'vanilla' | 'chocolate') =>
    p === 'vanilla' ? 'Vanilla' : 'Chocolate';

  const isAITurn =
    (mode === 'hva' && currentPlayer === 'chocolate') ||
    (mode === 'avh' && currentPlayer === 'vanilla');

  let statusLine = '';
  if (status.type === 'playing') {
    statusLine = isAITurn ? 'AI is thinking...' : `${playerLabel(currentPlayer)}'s turn`;
  } else if (status.type === 'won') {
    statusLine = `${playerLabel(status.winner)} wins!`;
  } else {
    statusLine = "It's a draw!";
  }

  let constraintLine = '';
  if (status.type === 'playing' && constrainedLine) {
    const dirNames: Record<string, string> = { H: 'Row', V: 'Col', D: 'Diagonal \\', A: 'Diagonal /' };
    constraintLine = `Constrained to: ${dirNames[constrainedLine.dir]} ${constrainedLine.index >= 0 ? '+' : ''}${constrainedLine.index}`;
  } else if (status.type === 'playing' && !constrainedLine) {
    constraintLine = 'Free choice (first move)';
  }

  const sortedHints = [...hints].sort(compareAnalyses);
  const bestHint = sortedHints[0] ?? null;
  const movesLeft = vanillaLeft + chocolateLeft;
  const openingHints = movesLeft >= 24 ? sortedHints.slice(0, 6) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 240, maxWidth: 320 }}>
      <div style={{
        background: 'rgba(255,255,255,0.15)',
        borderRadius: 12,
        padding: '12px 16px',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.3)',
      }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
          {statusLine}
        </div>
        {constraintLine && (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{constraintLine}</div>
        )}
      </div>

      <div style={{
        background: 'rgba(255,255,255,0.15)',
        borderRadius: 12,
        padding: '10px 16px',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.3)',
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <PieceCount player="vanilla" left={vanillaLeft} current={currentPlayer} />
        <PieceCount player="chocolate" left={chocolateLeft} current={currentPlayer} />
      </div>

      <div style={{
        background: 'rgba(255,255,255,0.12)',
        borderRadius: 12,
        padding: '10px 12px',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.25)',
      }}>
        <div style={{ fontWeight: 700, marginBottom: 8, color: '#fff', fontSize: 13 }}>Game Controls</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
          <button onClick={onUndo} disabled={!canUndo} style={smallBtnStyle('#386e9f', !canUndo)}>
            Undo
          </button>
          <button onClick={onRedo} disabled={!canRedo} style={smallBtnStyle('#386e9f', !canRedo)}>
            Forward
          </button>
          <button onClick={onSwapColors} style={smallBtnStyle('#8b6f2f')}>
            Swap Colors
          </button>
          <button onClick={onShare} style={smallBtnStyle('#2f8b64')}>
            Share
          </button>
          <button onClick={onLoad} style={smallBtnStyle('#655d96')}>
            Load
          </button>
          <button onClick={onEditPosition} style={smallBtnStyle('#7b5ea7')}>
            Edit
          </button>
        </div>
        {shareStatus && (
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 7 }}>
            {shareStatus}
          </div>
        )}
      </div>

      <div style={{
        background: 'rgba(255,255,255,0.12)',
        borderRadius: 12,
        padding: '10px 12px',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 700, color: '#fff', fontSize: 13 }}>Move History</div>
          <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12 }}>
            {historyIndex}/{Math.max(0, history.length - 1)}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
          {history.map((entry, index) => {
            const active = index === historyIndex;
            const future = index > historyIndex;
            return (
              <button
                key={index}
                onClick={() => onNavigateHistory(index)}
                style={{
                  border: `1px solid ${active ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.10)'}`,
                  background: active ? 'rgba(255,255,255,0.18)' : future ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.16)',
                  color: future ? 'rgba(255,255,255,0.55)' : '#fff',
                  borderRadius: 7,
                  padding: '6px 7px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 12,
                  lineHeight: 1.25,
                }}
              >
                {historyLabel(entry, index)}
              </button>
            );
          })}
        </div>
      </div>

      {openingGuide && openingGuide.phase !== 'endgame' && (
        <OpeningGuidePanel guide={openingGuide} />
      )}

      {status.type === 'playing' && (
        <div style={{
          background: 'rgba(255,255,255,0.12)',
          borderRadius: 12,
          padding: '10px 16px',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.25)',
          fontSize: 13,
          color: 'rgba(255,255,255,0.85)',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4, color: '#fff' }}>Solver</div>
          <div style={{ marginBottom: 4, color: 'rgba(255,255,255,0.72)' }}>
            {solverSource === 'server' ? 'Node service' : solverSource === 'browser' ? 'Browser fallback' : 'Connecting...'}
          </div>
          {solverStatusLine(solverStats, solverComplete)}

          {solverStats && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.78)', lineHeight: 1.45 }}>
              <div>Nodes: {solverStats.nodesVisited.toLocaleString()}</div>
              <div>Elapsed: {formatElapsed(solverStats.elapsedMs)}</div>
            </div>
          )}

          {bestHint && (
            <div style={{ marginTop: 6, fontSize: 12 }}>
              Best move: R{bestHint.row + 1} C{bestHint.col + 1}{' '}
              <span style={{ color: analysisColor(bestHint), fontWeight: 700 }}>
                {analysisLabel(bestHint)}
              </span>
            </div>
          )}

          {openingHints.length > 0 && (
            <div style={{
              marginTop: 10,
              padding: '8px 10px',
              borderRadius: 10,
              background: 'rgba(0,0,0,0.14)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}>
              <div style={{ fontWeight: 700, color: '#fff', marginBottom: 5 }}>Opening candidates</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', marginBottom: 8 }}>
                Best-ranked moves for the current early position.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {openingHints.map(h => (
                  <div
                    key={`open-${h.row},${h.col}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: '#fff', fontWeight: 700 }}>
                      R{h.row + 1} C{h.col + 1}
                    </span>
                    <span style={{ color: analysisColor(h), fontWeight: 700 }}>
                      {analysisLabel(h)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sortedHints.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 210, overflowY: 'auto' }}>
              {sortedHints.map(h => (
                <div
                  key={`${h.row},${h.col}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '5px 7px',
                    borderRadius: 7,
                    background: 'rgba(0,0,0,0.16)',
                    border: `1px solid ${h.proven ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'}`,
                  }}
                >
                  <span style={{ color: '#fff', fontWeight: 700 }}>R{h.row + 1} C{h.col + 1}</span>
                  <span style={{ color: analysisColor(h), fontWeight: 700 }}>{analysisLabel(h)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {status.type === 'playing' && (
        <button onClick={onToggleHints} style={btnStyle(hintsEnabled ? '#4caf50' : '#666')}>
          {hintsEnabled ? 'Hints On' : 'Hints Off'}
        </button>
      )}

      <button onClick={onNewGame} style={btnStyle('#e85d9a')}>
        New Game
      </button>
    </div>
  );
}

function historyLabel(entry: TimelineEntry, index: number): string {
  if (!entry.move) return 'Start position';
  const move = entry.move;
  const player = move.player === 'vanilla' ? 'Vanilla' : 'Chocolate';
  const suffix = [
    move.wasDisobedience ? 'disobey' : '',
    move.flipped.length > 0 ? `${move.flipped.length} flipped` : '',
  ].filter(Boolean).join(', ');

  return `${index}. ${player} R${move.row + 1} C${move.col + 1}${suffix ? ` (${suffix})` : ''}`;
}

function OpeningGuidePanel({ guide }: { guide: OpeningGuide }) {
  const top = guide.topMoves.slice(0, 5);
  const centerFour = guide.centerFour
    .slice()
    .sort((a, b) => b.score - a.score || a.row - b.row || a.col - b.col);
  const best = top[0] ?? null;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.12)',
      borderRadius: 12,
      padding: '10px 12px',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255,255,255,0.25)',
      color: 'rgba(255,255,255,0.85)',
      fontSize: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 800, color: '#fff', fontSize: 13 }}>Opening Guide</div>
        <div style={{ color: 'rgba(255,255,255,0.68)', textTransform: 'capitalize' }}>{guide.phase}</div>
      </div>

      {best && (
        <div style={{
          padding: '7px 8px',
          borderRadius: 8,
          background: 'rgba(0,0,0,0.16)',
          border: '1px solid rgba(255,255,255,0.10)',
          marginBottom: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
            <span style={{ color: '#fff', fontWeight: 800 }}>Heuristic pick: {moveName(best)}</span>
            <span style={{ color: '#93f0b5', fontWeight: 800 }}>{best.score}</span>
          </div>
          <TagList tags={best.tags} />
        </div>
      )}

      {centerFour.length > 0 && (
        <div style={{ marginBottom: 9 }}>
          <div style={{ color: 'rgba(255,255,255,0.72)', marginBottom: 5, fontWeight: 700 }}>Center four</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 5 }}>
            {centerFour.map(move => (
              <MoveInsightMini key={`center-${move.row},${move.col}`} move={move} />
            ))}
          </div>
        </div>
      )}

      <div style={{ color: 'rgba(255,255,255,0.72)', marginBottom: 5, fontWeight: 700 }}>Top themes</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {top.map(move => (
          <div
            key={`guide-${move.row},${move.col}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '58px 1fr 34px',
              gap: 7,
              alignItems: 'center',
              padding: '5px 6px',
              borderRadius: 7,
              background: 'rgba(0,0,0,0.13)',
            }}
          >
            <span style={{ color: '#fff', fontWeight: 800 }}>{moveName(move)}</span>
            <span style={{ color: 'rgba(255,255,255,0.72)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {moveSummary(move)}
            </span>
            <span style={{ color: '#93f0b5', textAlign: 'right', fontWeight: 800 }}>{move.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MoveInsightMini({ move }: { move: OpeningMoveInsight }) {
  return (
    <div style={{
      borderRadius: 7,
      padding: '5px 6px',
      background: 'rgba(0,0,0,0.13)',
      border: '1px solid rgba(255,255,255,0.08)',
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
        <span style={{ color: '#fff', fontWeight: 800 }}>{moveName(move)}</span>
        <span style={{ color: '#93f0b5', fontWeight: 800 }}>{move.score}</span>
      </div>
      <div style={{ color: 'rgba(255,255,255,0.64)', marginTop: 2 }}>
        {move.direction} / {move.replyOptions || 'free'} replies
      </div>
    </div>
  );
}

function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {tags.map(tag => (
        <span
          key={tag}
          style={{
            borderRadius: 999,
            padding: '2px 6px',
            background: 'rgba(255,255,255,0.13)',
            color: 'rgba(255,255,255,0.82)',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function moveName(move: OpeningMoveInsight): string {
  return `R${move.row + 1} C${move.col + 1}`;
}

function moveSummary(move: OpeningMoveInsight): string {
  const parts = [
    `${move.linePotential} lines`,
    `${move.replyOptions || 'free'} replies`,
  ];
  if (move.flipsNow > 0) parts.push(`${move.flipsNow} flips`);
  if (move.maxFlipRisk > 0) parts.push(`${move.maxFlipRisk} risk`);
  return parts.join(' / ');
}

function solverStatusLine(stats: SolverProgress | null, complete: boolean): string {
  if (!stats) return 'Calculating...';
  if (complete) return 'Solved with perfect play';
  if (stats.movesSolved < stats.moveCount) return `Proving moves: ${stats.movesSolved} of ${stats.moveCount}`;
  return `All moves proven; finding distances (${stats.distancesPending} left)`;
}

function formatElapsed(ms: number): string {
  if (ms === 0) return 'complete';
  if (!Number.isFinite(ms)) return 'very large';
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const rem = (seconds % 60).toFixed(0).padStart(2, '0');
    return `${minutes}m ${rem}s`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    const rem = (minutes % 60).toString().padStart(2, '0');
    return `${hours}h ${rem}m`;
  }
  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d ${hours % 24}h`;
  const years = days / 365;
  return `${years.toFixed(1)} years`;
}

function compareAnalyses(a: MoveAnalysis, b: MoveAnalysis): number {
  const rank = (h: MoveAnalysis) =>
    h.outcome === 'win' ? 0 :
    h.outcome === 'draw' ? 1 :
    h.outcome === 'unknown' ? 2 :
    3;

  return rank(a) - rank(b) || b.score - a.score || a.row - b.row || a.col - b.col;
}

function analysisLabel(h: MoveAnalysis): string {
  if (h.outcome === 'win') return h.movesToEnd ? `Win in ${h.movesToEnd}` : 'Win';
  if (h.outcome === 'loss') return h.movesToEnd ? `Loss in ${h.movesToEnd}` : 'Loss';
  if (h.outcome === 'draw') return 'Draw';
  return 'Solving...';
}

function analysisColor(h: MoveAnalysis): string {
  if (h.outcome === 'win') return '#6fff8e';
  if (h.outcome === 'loss') return '#ff7070';
  if (h.outcome === 'draw') return '#ffe566';
  return '#9ed0ff';
}

function PieceCount({ player, left, current }: { player: 'vanilla' | 'chocolate'; left: number; current: 'vanilla' | 'chocolate' }) {
  const isCurrent = player === current;
  const color = player === 'vanilla' ? '#f5d48a' : '#7b4a2a';
  const border = player === 'vanilla' ? '#c9a84c' : '#4a2a12';

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: color, border: `3px solid ${border}`,
        margin: '0 auto 4px',
        boxShadow: isCurrent ? `0 0 10px ${color}` : 'none',
        transition: 'box-shadow 0.3s',
      }} />
      <div style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>{left}</div>
      <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>left</div>
    </div>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '10px 16px',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: '0 3px 8px rgba(0,0,0,0.25)',
    transition: 'opacity 0.15s',
  };
}

function smallBtnStyle(bg: string, disabled = false): React.CSSProperties {
  return {
    background: disabled ? 'rgba(255,255,255,0.10)' : bg,
    color: disabled ? 'rgba(255,255,255,0.35)' : '#fff',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 8,
    padding: '7px 8px',
    minHeight: 34,
    fontSize: 12,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    boxShadow: disabled ? 'none' : '0 2px 5px rgba(0,0,0,0.18)',
  };
}
