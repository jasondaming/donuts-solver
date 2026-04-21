import { useState } from 'react';
import type { GameState, Player, ConstrainedLine } from '../game/types';
import { DirectionLine } from './DirectionLine';
import { DonutPiece } from './DonutPiece';
import { deepCloneBoard } from '../game/board';
import { checkWin, largestGroup } from '../game/winCheck';

interface Props {
  baseState: GameState;   // board directions come from here
  onConfirm: (state: GameState) => void;
  onCancel: () => void;
}

type CycleState = null | 'vanilla' | 'chocolate';
function cycle(s: CycleState): CycleState {
  if (s === null) return 'vanilla';
  if (s === 'vanilla') return 'chocolate';
  return null;
}

export function PositionEditor({ baseState, onConfirm, onCancel }: Props) {
  const [board, setBoard] = useState(() => deepCloneBoard(baseState.board));
  const [currentPlayer, setCurrentPlayer] = useState<Player>('vanilla');
  // null = free choice; set by clicking a placed piece as "last played"
  const [lastPlayed, setLastPlayed] = useState<[number, number] | null>(null);

  function clickCell(r: number, c: number) {
    const next = deepCloneBoard(board);
    next[r][c].piece = cycle(next[r][c].piece);
    // Clear lastPlayed if the cell is now empty
    if (!next[r][c].piece && lastPlayed?.[0] === r && lastPlayed?.[1] === c) {
      setLastPlayed(null);
    }
    setBoard(next);
  }

  function setAsLastPlayed(r: number, c: number) {
    if (!board[r][c].piece) return;
    setLastPlayed(prev => prev?.[0] === r && prev?.[1] === c ? null : [r, c]);
  }

  // Count pieces
  let vanillaCount = 0, chocolateCount = 0;
  for (const row of board) for (const cell of row) {
    if (cell.piece === 'vanilla') vanillaCount++;
    if (cell.piece === 'chocolate') chocolateCount++;
  }
  const vanillaLeft = 15 - vanillaCount;
  const chocolateLeft = 15 - chocolateCount;

  const constrainedLine: ConstrainedLine | null = lastPlayed
    ? (() => {
        const [r, c] = lastPlayed;
        const dir = board[r][c].direction;
        const index = dir === 'H' ? r : dir === 'V' ? c : dir === 'D' ? r - c : r + c;
        return { dir, index };
      })()
    : null;

  const errors: string[] = [];
  if (vanillaLeft < 0) errors.push(`Vanilla has too many pieces (max 15, found ${vanillaCount})`);
  if (chocolateLeft < 0) errors.push(`Chocolate has too many pieces (max 15, found ${chocolateCount})`);

  function handleConfirm() {
    if (errors.length > 0) return;

    // Determine game status
    const winV = checkWin(board, 'vanilla');
    const winC = checkWin(board, 'chocolate');
    let status: GameState['status'] = { type: 'playing' };
    if (winV) status = { type: 'won', winner: 'vanilla', winLine: winV };
    else if (winC) status = { type: 'won', winner: 'chocolate', winLine: winC };
    else if (vanillaLeft === 0 && chocolateLeft === 0) {
      const vg = largestGroup(board, 'vanilla');
      const cg = largestGroup(board, 'chocolate');
      if (vg > cg) status = { type: 'won', winner: 'vanilla', winLine: [] };
      else if (cg > vg) status = { type: 'won', winner: 'chocolate', winLine: [] };
      else status = { type: 'draw' };
    }

    onConfirm({
      board,
      currentPlayer,
      constrainedLine,
      vanillaLeft,
      chocolateLeft,
      status,
    });
  }

  const cellSize = 64;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100,
      padding: 16,
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #1a6fa8, #c0387c)',
        borderRadius: 16,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        maxWidth: 580,
        width: '100%',
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      }}>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>
          Set Up Position
        </div>
        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 1.5 }}>
          <b>Left-click</b> a cell to cycle: empty → 🍩 vanilla → 🍫 chocolate → empty.<br />
          <b>Right-click</b> a filled cell to mark it as the last piece played (sets the constraint line).
        </div>

        {/* Board */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{
            border: '3px solid #3a8fc7',
            borderRadius: 5,
            padding: 3,
            background: '#3a8fc7',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(6, ${cellSize}px)`,
              gridTemplateRows: `repeat(6, ${cellSize}px)`,
            }}>
              {board.map((row, r) => row.map((cell, c) => {
                const quadR = Math.floor(r / 3), quadC = Math.floor(c / 3);
                const bg = ((r % 3 + c % 3 + quadR + quadC) % 2) === 0 ? '#f0a0c0' : '#a8d4f0';
                const isLast = lastPlayed?.[0] === r && lastPlayed?.[1] === c;
                const isConstrained = constrainedLine && (() => {
                  const { dir, index } = constrainedLine;
                  return (dir === 'H' && r === index) || (dir === 'V' && c === index) ||
                         (dir === 'D' && r - c === index) || (dir === 'A' && r + c === index);
                })();
                return (
                  <div
                    key={`${r},${c}`}
                    onClick={() => clickCell(r, c)}
                    onContextMenu={e => { e.preventDefault(); setAsLastPlayed(r, c); }}
                    style={{
                      width: cellSize, height: cellSize,
                      position: 'relative',
                      background: bg,
                      border: isLast ? '3px solid #ffe566' : isConstrained ? '2px solid rgba(255,230,100,0.5)' : '1px solid rgba(58,143,199,0.4)',
                      boxSizing: 'border-box',
                      cursor: 'pointer',
                    }}
                  >
                    <DirectionLine direction={cell.direction} size={cellSize} />
                    {cell.piece && (
                      <DonutPiece player={cell.piece} size={cellSize} isLastPlaced={isLast} />
                    )}
                    {isLast && (
                      <div style={{
                        position: 'absolute', top: 2, right: 3,
                        fontSize: 10, color: '#ffe566', fontWeight: 800,
                        textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                      }}>★</div>
                    )}
                  </div>
                );
              }))}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Piece counts */}
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#fff' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Pieces remaining</div>
            <div style={{ color: vanillaLeft < 0 ? '#ff7070' : '#f5d48a' }}>🍩 Vanilla: {vanillaLeft}</div>
            <div style={{ color: chocolateLeft < 0 ? '#ff7070' : '#c8a070' }}>🍫 Chocolate: {chocolateLeft}</div>
          </div>

          {/* Whose turn */}
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#fff' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Whose turn?</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['vanilla', 'chocolate'] as Player[]).map(p => (
                <button key={p} onClick={() => setCurrentPlayer(p)} style={{
                  padding: '5px 10px', borderRadius: 7,
                  border: `2px solid ${currentPlayer === p ? '#fff' : 'rgba(255,255,255,0.3)'}`,
                  background: currentPlayer === p ? 'rgba(255,255,255,0.25)' : 'transparent',
                  color: '#fff', fontWeight: currentPlayer === p ? 700 : 400,
                  fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  {p === 'vanilla' ? '🍩' : '🍫'}
                </button>
              ))}
            </div>
          </div>

          {/* Constraint info */}
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#fff', flex: 1, minWidth: 140 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Constraint</div>
            {lastPlayed
              ? <div style={{ color: '#ffe566' }}>★ row {lastPlayed[0]}, col {lastPlayed[1]}</div>
              : <div style={{ color: 'rgba(255,255,255,0.6)' }}>Free choice<br />(right-click a piece to set)</div>}
          </div>
        </div>

        {/* Errors */}
        {errors.map((e, i) => (
          <div key={i} style={{ background: 'rgba(220,40,40,0.25)', borderRadius: 8, padding: '8px 12px', color: '#ff9090', fontSize: 13 }}>
            ⚠ {e}
          </div>
        ))}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={errors.length > 0} style={{
            background: errors.length > 0 ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #e85d9a, #ff8c42)',
            color: errors.length > 0 ? 'rgba(255,255,255,0.4)' : '#fff',
            border: 'none', borderRadius: 10, padding: '10px 24px', fontSize: 14, fontWeight: 700,
            cursor: errors.length > 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            boxShadow: errors.length > 0 ? 'none' : '0 4px 12px rgba(232,93,154,0.4)',
          }}>
            Analyze Position
          </button>
        </div>
      </div>
    </div>
  );
}
