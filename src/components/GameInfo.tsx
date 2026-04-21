import type { GameState, MoveAnalysis, GameMode } from '../game/types';

interface Props {
  state: GameState;
  mode: GameMode;
  hintsEnabled: boolean;
  onToggleHints: () => void;
  onNewGame: () => void;
  onEditPosition: () => void;
  solverDepth: number;
  solverComplete: boolean;
  hints: MoveAnalysis[];
}

export function GameInfo({
  state, mode, hintsEnabled, onToggleHints, onNewGame, onEditPosition,
  solverDepth, solverComplete, hints,
}: Props) {
  const { currentPlayer, status, vanillaLeft, chocolateLeft, constrainedLine } = state;

  const playerLabel = (p: 'vanilla' | 'chocolate') =>
    p === 'vanilla' ? '🍩 Vanilla' : '🍫 Chocolate';

  const isAITurn =
    (mode === 'hva' && currentPlayer === 'chocolate') ||
    (mode === 'avh' && currentPlayer === 'vanilla');

  let statusLine = '';
  if (status.type === 'playing') {
    if (isAITurn) {
      statusLine = 'AI is thinking…';
    } else {
      statusLine = `${playerLabel(currentPlayer)}'s turn`;
    }
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

  const bestHint = hints.length > 0
    ? hints.reduce((best, h) => {
        if (!best) return h;
        if (h.outcome === 'win' && best.outcome !== 'win') return h;
        if (h.outcome === 'win' && best.outcome === 'win' && h.movesToEnd < best.movesToEnd) return h;
        if (h.outcome === 'draw' && best.outcome === 'loss') return h;
        return best;
      }, null as MoveAnalysis | null)
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 220 }}>
      {/* Player status */}
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

      {/* Piece counts */}
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

      {/* Solver status */}
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
          {solverDepth === 0
            ? 'Calculating…'
            : solverComplete
            ? `Perfect analysis (depth ${solverDepth})`
            : `Searching depth ${solverDepth}…`}

          {bestHint && (
            <div style={{ marginTop: 6, fontSize: 12 }}>
              Best move:{' '}
              <span style={{
                color: bestHint.outcome === 'win' ? '#6fff8e'
                  : bestHint.outcome === 'loss' ? '#ff7070' : '#ffe566',
                fontWeight: 700,
              }}>
                {bestHint.outcome === 'win' ? `Win in ${bestHint.movesToEnd}`
                  : bestHint.outcome === 'loss' ? `Loss in ${bestHint.movesToEnd}`
                  : 'Draw'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Hints toggle */}
      {status.type === 'playing' && (
        <button onClick={onToggleHints} style={btnStyle(hintsEnabled ? '#4caf50' : '#666')}>
          {hintsEnabled ? '🟢 Hints On' : '⚫ Hints Off'}
        </button>
      )}

      {/* Edit position */}
      <button onClick={onEditPosition} style={btnStyle('#7b5ea7')}>
        ✏️ Edit Position
      </button>

      {/* New game */}
      <button onClick={onNewGame} style={btnStyle('#e85d9a')}>
        New Game
      </button>
    </div>
  );
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
