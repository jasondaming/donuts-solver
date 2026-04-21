import type { Direction } from '../game/types';

interface Props {
  direction: Direction;
  size: number;
  color?: string;
}

export function DirectionLine({ direction, size, color = 'rgba(255,255,255,0.75)' }: Props) {
  const s = size;
  const mid = s / 2;
  const pad = s * 0.1;

  const lines: Record<Direction, [number, number, number, number]> = {
    H: [pad, mid, s - pad, mid],
    V: [mid, pad, mid, s - pad],
    D: [pad, pad, s - pad, s - pad],
    A: [s - pad, pad, pad, s - pad],
  };

  const [x1, y1, x2, y2] = lines[direction];

  return (
    <svg
      width={s}
      height={s}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
    >
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color}
        strokeWidth={Math.max(2, s * 0.06)}
        strokeLinecap="round"
      />
    </svg>
  );
}
