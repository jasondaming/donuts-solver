import type { Cell, MoveAnalysis, Player } from '../game/types';
import { DirectionLine } from './DirectionLine';
import { DonutPiece } from './DonutPiece';

interface Props {
  cell: Cell;
  row: number;
  col: number;
  size: number;
  isValid: boolean;
  isConstrained: boolean;
  isLastPlaced: boolean;
  isWinLine: boolean;
  hint?: MoveAnalysis;
  hintsEnabled: boolean;
  currentPlayer: Player;
  onClick: () => void;
  onHover: (hovered: boolean) => void;
  isHovered: boolean;
}

const OUTCOME_COLORS: Record<string, string> = {
  win: 'rgba(0, 200, 80, 0.55)',
  loss: 'rgba(220, 40, 40, 0.55)',
  draw: 'rgba(255, 200, 0, 0.55)',
};

// Alternating cell background: pink / blue like the physical game
function cellBg(row: number, col: number): string {
  const quadR = Math.floor(row / 3);
  const quadC = Math.floor(col / 3);
  const localR = row % 3;
  const localC = col % 3;
  // Checkerboard within quadrant, shifted per quadrant
  const base = (localR + localC + quadR + quadC) % 2;
  return base === 0 ? '#f0a0c0' : '#a8d4f0';
}

export function CellView({
  cell, row, col, size, isValid, isConstrained, isLastPlaced, isWinLine,
  hint, hintsEnabled, currentPlayer, onClick, onHover, isHovered,
}: Props) {
  const bg = cellBg(row, col);
  const showHint = hintsEnabled && isValid && !cell.piece && hint;
  const canClick = isValid && !cell.piece;

  const borderColor = isConstrained ? 'rgba(255,255,80,0.9)' : 'rgba(255,255,255,0.25)';
  const borderWidth = isConstrained ? 2 : 1;

  return (
    <div
      onClick={canClick ? onClick : undefined}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{
        width: size,
        height: size,
        position: 'relative',
        background: bg,
        border: `${borderWidth}px solid ${borderColor}`,
        boxSizing: 'border-box',
        cursor: canClick ? 'pointer' : 'default',
        outline: isConstrained ? '2px solid rgba(255,255,80,0.6)' : 'none',
        outlineOffset: -2,
        transition: 'outline 0.15s',
      }}
    >
      {/* Direction line */}
      <DirectionLine direction={cell.direction} size={size} />

      {/* Donut piece */}
      {cell.piece && (
        <DonutPiece
          player={cell.piece}
          size={size}
          isLastPlaced={isLastPlaced}
          isWinLine={isWinLine}
        />
      )}

      {/* Hint overlay */}
      {showHint && hint && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: OUTCOME_COLORS[hint.outcome],
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 0,
            zIndex: 2,
            pointerEvents: 'none',
          }}
        >
          <span style={{
            fontSize: size * 0.22,
            fontWeight: 800,
            color: '#fff',
            textShadow: '0 1px 3px rgba(0,0,0,0.6)',
            lineHeight: 1.1,
            textAlign: 'center',
          }}>
            {hint.outcome === 'win' ? '✓' : hint.outcome === 'loss' ? '✗' : '='}
          </span>
          <span style={{
            fontSize: size * 0.17,
            fontWeight: 700,
            color: '#fff',
            textShadow: '0 1px 3px rgba(0,0,0,0.6)',
            lineHeight: 1.1,
          }}>
            {hint.movesToEnd <= 1 ? 'now' : `in ${hint.movesToEnd}`}
          </span>
          <span style={{
            fontSize: size * 0.13,
            color: 'rgba(255,255,255,0.85)',
            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
          }}>
            {hint.depth < (hint.movesToEnd > 0 ? 30 : 1) ? '~' : ''}
          </span>
        </div>
      )}

      {/* Hover highlight for valid moves */}
      {canClick && isHovered && !showHint && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: currentPlayer === 'vanilla'
              ? 'rgba(245, 212, 138, 0.45)'
              : 'rgba(123, 74, 42, 0.45)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}

      {/* Valid move dot (no hint) */}
      {canClick && !showHint && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: size * 0.18,
            height: size * 0.18,
            borderRadius: '50%',
            background: currentPlayer === 'vanilla'
              ? 'rgba(245, 212, 138, 0.7)'
              : 'rgba(123, 74, 42, 0.7)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}
    </div>
  );
}
