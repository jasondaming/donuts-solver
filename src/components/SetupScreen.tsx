import { useState } from 'react';
import type { BoardConfig, GameMode, QuadrantConfig, Direction } from '../game/types';
import { TILE_PATTERNS, getTileGrid } from '../game/tiles';
import { DirectionLine } from './DirectionLine';

interface Props {
  onStart: (config: BoardConfig, mode: GameMode) => void;
}

const QUADRANT_LABELS = ['Top-Left', 'Top-Right', 'Bottom-Left', 'Bottom-Right'];
const KNOWN_PATTERNS = TILE_PATTERNS.slice(0, 5); // Only show the 5 known patterns

const DEFAULT_CONFIG: BoardConfig = {
  quadrants: [
    { patternId: 0, rotation: 0 },
    { patternId: 1, rotation: 1 },
    { patternId: 2, rotation: 2 },
    { patternId: 3, rotation: 3 },
  ],
};

function TilePreview({ patternId, rotation, size = 60 }: { patternId: number; rotation: 0|1|2|3; size?: number }) {
  const grid = getTileGrid(patternId, rotation);
  const cellSize = size / 3;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(3, ${cellSize}px)`,
      gridTemplateRows: `repeat(3, ${cellSize}px)`,
      border: '1.5px solid rgba(255,255,255,0.4)',
      borderRadius: 4,
      overflow: 'hidden',
    }}>
      {grid.map((row, r) => row.map((dir, c) => {
        const bg = (r + c) % 2 === 0 ? '#f0a0c0' : '#a8d4f0';
        return (
          <div key={`${r},${c}`} style={{ width: cellSize, height: cellSize, background: bg, position: 'relative' }}>
            <DirectionLine direction={dir} size={cellSize} />
          </div>
        );
      }))}
    </div>
  );
}

function QuadrantSetup({
  label, config, onChange,
}: {
  label: string;
  config: QuadrantConfig;
  onChange: (c: QuadrantConfig) => void;
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.12)',
      borderRadius: 12,
      padding: 14,
      border: '1px solid rgba(255,255,255,0.25)',
    }}>
      <div style={{ color: '#fff', fontWeight: 700, marginBottom: 10, fontSize: 14 }}>{label}</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <TilePreview patternId={config.patternId} rotation={config.rotation} size={75} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
          <div>
            <label style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, display: 'block', marginBottom: 3 }}>
              Pattern
            </label>
            <select
              value={config.patternId}
              onChange={e => onChange({ ...config, patternId: Number(e.target.value) })}
              style={selectStyle}
            >
              {KNOWN_PATTERNS.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, display: 'block', marginBottom: 3 }}>
              Rotation
            </label>
            <select
              value={config.rotation}
              onChange={e => onChange({ ...config, rotation: Number(e.target.value) as 0|1|2|3 })}
              style={selectStyle}
            >
              <option value={0}>0°</option>
              <option value={1}>90° CW</option>
              <option value={2}>180°</option>
              <option value={3}>270° CW</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.3)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.3)',
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: 13,
  width: '100%',
  cursor: 'pointer',
};

export function SetupScreen({ onStart }: Props) {
  const [config, setConfig] = useState<BoardConfig>(DEFAULT_CONFIG);
  const [mode, setMode] = useState<GameMode>('hvh');

  function updateQuadrant(index: number, q: QuadrantConfig) {
    const quadrants = [...config.quadrants] as BoardConfig['quadrants'];
    quadrants[index] = q;
    setConfig({ quadrants });
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '32px 24px',
      gap: 24,
      maxWidth: 700,
      margin: '0 auto',
    }}>
      {/* Title */}
      <div style={{ textAlign: 'center' }}>
        <h1 style={{
          color: '#fff',
          fontSize: 52,
          fontWeight: 900,
          margin: 0,
          textShadow: '0 3px 12px rgba(0,0,0,0.4)',
          letterSpacing: 2,
        }}>
          🍩 DONUTS
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.75)', margin: '4px 0 0', fontSize: 14 }}>
          Board Game Solver
        </p>
      </div>

      {/* Board preview */}
      <BoardPreview config={config} />

      {/* Quadrant setup */}
      <div style={{ width: '100%' }}>
        <h3 style={{ color: '#fff', margin: '0 0 12px', fontSize: 16 }}>Board Configuration</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {QUADRANT_LABELS.map((label, i) => (
            <QuadrantSetup
              key={i}
              label={label}
              config={config.quadrants[i]}
              onChange={(q) => updateQuadrant(i, q)}
            />
          ))}
        </div>
      </div>

      {/* Game mode */}
      <div style={{ width: '100%' }}>
        <h3 style={{ color: '#fff', margin: '0 0 10px', fontSize: 16 }}>Game Mode</h3>
        <div style={{ display: 'flex', gap: 10 }}>
          {([['hvh', 'Human vs Human'], ['hva', 'Human (🍩) vs AI (🍫)'], ['avh', 'AI (🍩) vs Human (🍫)']] as [GameMode, string][]).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1,
                padding: '10px 8px',
                borderRadius: 10,
                border: `2px solid ${mode === m ? '#fff' : 'rgba(255,255,255,0.3)'}`,
                background: mode === m ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
                color: '#fff',
                fontWeight: mode === m ? 700 : 400,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Start button */}
      <button
        onClick={() => onStart(config, mode)}
        style={{
          background: 'linear-gradient(135deg, #e85d9a, #ff8c42)',
          color: '#fff',
          border: 'none',
          borderRadius: 14,
          padding: '14px 48px',
          fontSize: 20,
          fontWeight: 800,
          cursor: 'pointer',
          fontFamily: 'inherit',
          boxShadow: '0 6px 20px rgba(232,93,154,0.5)',
          letterSpacing: 1,
        }}
      >
        Start Game!
      </button>
    </div>
  );
}

function BoardPreview({ config }: { config: BoardConfig }) {
  const cellSize = 22;
  const offsets: [number, number][] = [[0,0],[0,3],[3,0],[3,3]];

  const cells: { dir: Direction; r: number; c: number }[] = [];
  for (let q = 0; q < 4; q++) {
    const { patternId, rotation } = config.quadrants[q];
    const grid = getTileGrid(patternId, rotation);
    const [ro, co] = offsets[q];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        cells.push({ dir: grid[r][c], r: ro + r, c: co + c });
      }
    }
  }

  return (
    <div style={{
      border: '3px solid #3a8fc7',
      borderRadius: 6,
      padding: 3,
      background: '#3a8fc7',
      boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(6, ${cellSize}px)`,
        gridTemplateRows: `repeat(6, ${cellSize}px)`,
      }}>
        {cells.map(({ dir, r, c }) => {
          const bg = ((r + c + Math.floor(r/3) + Math.floor(c/3)) % 2) === 0 ? '#f0a0c0' : '#a8d4f0';
          return (
            <div key={`${r},${c}`} style={{ width: cellSize, height: cellSize, background: bg, position: 'relative', border: '0.5px solid rgba(58,143,199,0.5)' }}>
              <DirectionLine direction={dir} size={cellSize} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
