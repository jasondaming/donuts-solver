import type { Player } from '../game/types';

interface Props {
  player: Player;
  size: number;
  isLastPlaced?: boolean;
  isWinLine?: boolean;
}

const COLORS = {
  vanilla: {
    body: '#f5d48a',
    bodyBorder: '#c9a84c',
    hole: '#e8c570',
    icing: '#ffedb3',
  },
  chocolate: {
    body: '#7b4a2a',
    bodyBorder: '#4a2a12',
    hole: '#5a3318',
    icing: '#a06040',
  },
};

export function DonutPiece({ player, size, isLastPlaced, isWinLine }: Props) {
  const c = COLORS[player];
  const outerR = size * 0.42;
  const holeR = outerR * 0.38;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <svg
      width={size}
      height={size}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        filter: isWinLine
          ? 'drop-shadow(0 0 6px gold) drop-shadow(0 0 12px gold)'
          : isLastPlaced
          ? 'drop-shadow(0 0 4px rgba(255,255,255,0.8))'
          : 'drop-shadow(1px 2px 3px rgba(0,0,0,0.4))',
        transition: 'filter 0.2s',
      }}
    >
      {/* Outer donut body */}
      <circle cx={cx} cy={cy} r={outerR} fill={c.body} stroke={c.bodyBorder} strokeWidth={size * 0.03} />
      {/* Icing highlight */}
      <circle cx={cx - outerR * 0.15} cy={cy - outerR * 0.2} r={outerR * 0.5} fill={c.icing} opacity={0.35} />
      {/* Hole */}
      <circle cx={cx} cy={cy} r={holeR} fill={c.hole} stroke={c.bodyBorder} strokeWidth={size * 0.02} />
    </svg>
  );
}
