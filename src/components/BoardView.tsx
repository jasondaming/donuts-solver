import { useState } from 'react';
import type { GameState, MoveAnalysis } from '../game/types';
import { getValidMoves } from '../game/engine';
import { isOnLine } from '../game/board';
import { CellView } from './CellView';

interface Props {
  state: GameState;
  onMove: (row: number, col: number) => void;
  hints: MoveAnalysis[];
  hintsEnabled: boolean;
  lastPlaced: [number, number] | null;
  cellSize?: number;
}

export function BoardView({ state, onMove, hints, hintsEnabled, lastPlaced, cellSize = 80 }: Props) {
  const [hovered, setHovered] = useState<[number, number] | null>(null);

  const validMoves = getValidMoves(state);
  const validSet = new Set(validMoves.map(([r, c]) => `${r},${c}`));

  const hintMap = new Map(hints.map(h => [`${h.row},${h.col}`, h]));

  const winLineSet = new Set<string>();
  if (state.status.type === 'won') {
    for (const [r, c] of state.status.winLine) winLineSet.add(`${r},${c}`);
  }

  return (
    <div
      style={{
        display: 'inline-block',
        border: '4px solid #3a8fc7',
        borderRadius: 6,
        background: '#3a8fc7',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        padding: 4,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(6, ${cellSize}px)`,
          gridTemplateRows: `repeat(6, ${cellSize}px)`,
          gap: 0,
        }}
      >
        {state.board.map((row, r) =>
          row.map((cell, c) => {
            const key = `${r},${c}`;
            return (
              <CellView
                key={key}
                cell={cell}
                row={r}
                col={c}
                size={cellSize}
                isValid={validSet.has(key)}
                isConstrained={
                  !!state.constrainedLine && isOnLine(state.constrainedLine, r, c)
                }
                isLastPlaced={lastPlaced?.[0] === r && lastPlaced?.[1] === c}
                isWinLine={winLineSet.has(key)}
                hint={hintMap.get(key)}
                hintsEnabled={hintsEnabled}
                currentPlayer={state.currentPlayer}
                onClick={() => onMove(r, c)}
                onHover={(h) => setHovered(h ? [r, c] : null)}
                isHovered={hovered?.[0] === r && hovered?.[1] === c}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
