import { useState } from 'react';
import type { BoardConfig, GameMode, QuadrantConfig, Direction } from '../game/types';
import { TILE_PATTERNS, getTileGrid } from '../game/tiles';
import { DirectionLine } from './DirectionLine';
import { ImageSetupModal } from './ImageSetupModal';

interface Props {
  onStart: (config: BoardConfig, mode: GameMode) => void;
}

const QUADRANT_LABELS = ['Top-Left', 'Top-Right', 'Bottom-Left', 'Bottom-Right'];
const ROTATIONS: { value: 0|1|2|3; label: string }[] = [
  { value: 0, label: '0°' },
  { value: 1, label: '90°' },
  { value: 2, label: '180°' },
  { value: 3, label: '270°' },
];

function randomConfig(): BoardConfig {
  const ids = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  return {
    quadrants: ids.map(id => ({
      patternId: id,
      rotation: (Math.floor(Math.random() * 4)) as 0|1|2|3,
    })) as BoardConfig['quadrants'],
  };
}

function TilePreview({ patternId, rotation, size = 66 }: { patternId: number; rotation: 0|1|2|3; size?: number }) {
  const grid = getTileGrid(patternId, rotation);
  const cellSize = size / 3;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(3, ${cellSize}px)`,
      gridTemplateRows: `repeat(3, ${cellSize}px)`,
      border: '1.5px solid rgba(255,255,255,0.35)',
      borderRadius: 4,
      overflow: 'hidden',
      flexShrink: 0,
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
  index, config, allConfigs, onChange,
}: {
  index: number;
  config: QuadrantConfig;
  allConfigs: BoardConfig['quadrants'];
  onChange: (c: QuadrantConfig) => void;
}) {
  // Which tile IDs are used by other quadrants?
  const usedElsewhere = new Set(
    allConfigs.map((q, i) => i !== index ? q.patternId : -1).filter(id => id >= 0)
  );

  function swapTile(newId: number) {
    // If newId is used elsewhere, swap with the quadrant that has it
    const conflictIdx = allConfigs.findIndex((q, i) => i !== index && q.patternId === newId);
    if (conflictIdx >= 0) {
      // Caller handles the swap via onChange — we just signal what we want
    }
    onChange({ ...config, patternId: newId });
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.11)',
      borderRadius: 12,
      padding: 12,
      border: '1px solid rgba(255,255,255,0.22)',
    }}>
      <div style={{ color: '#fff', fontWeight: 700, marginBottom: 8, fontSize: 13 }}>
        {QUADRANT_LABELS[index]}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <TilePreview patternId={config.patternId} rotation={config.rotation} size={66} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
          {/* Tile selector */}
          <div style={{ display: 'flex', gap: 5 }}>
            {TILE_PATTERNS.map(p => (
              <button
                key={p.id}
                onClick={() => swapTile(p.id)}
                style={{
                  flex: 1,
                  padding: '4px 0',
                  borderRadius: 6,
                  border: `2px solid ${config.patternId === p.id ? '#fff' : 'rgba(255,255,255,0.25)'}`,
                  background: config.patternId === p.id
                    ? 'rgba(255,255,255,0.3)'
                    : usedElsewhere.has(p.id)
                    ? 'rgba(255,255,255,0.05)'
                    : 'rgba(255,255,255,0.1)',
                  color: config.patternId === p.id ? '#fff' : usedElsewhere.has(p.id) ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.8)',
                  fontSize: 12,
                  fontWeight: config.patternId === p.id ? 800 : 400,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {p.name.split(' ')[1]}
              </button>
            ))}
          </div>
          {/* Rotation selector */}
          <div style={{ display: 'flex', gap: 5 }}>
            {ROTATIONS.map(r => (
              <button
                key={r.value}
                onClick={() => onChange({ ...config, rotation: r.value })}
                style={{
                  flex: 1,
                  padding: '4px 0',
                  borderRadius: 6,
                  border: `2px solid ${config.rotation === r.value ? '#fff' : 'rgba(255,255,255,0.25)'}`,
                  background: config.rotation === r.value ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)',
                  color: config.rotation === r.value ? '#fff' : 'rgba(255,255,255,0.7)',
                  fontSize: 11,
                  fontWeight: config.rotation === r.value ? 700 : 400,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.18)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.35)',
  borderRadius: 8,
  padding: '6px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export function SetupScreen({ onStart }: Props) {
  const [config, setConfig] = useState<BoardConfig>(randomConfig);
  const [mode, setMode] = useState<GameMode>('hvh');
  const [showImageModal, setShowImageModal] = useState(false);

  function updateQuadrant(index: number, incoming: QuadrantConfig) {
    const quadrants = [...config.quadrants] as BoardConfig['quadrants'];
    const conflictIdx = quadrants.findIndex((q, i) => i !== index && q.patternId === incoming.patternId);
    if (conflictIdx >= 0) {
      // Swap: give the conflict quadrant the tile that index was using
      quadrants[conflictIdx] = { ...quadrants[conflictIdx], patternId: quadrants[index].patternId };
    }
    quadrants[index] = incoming;
    setConfig({ quadrants });
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '28px 20px',
      gap: 20,
      maxWidth: 680,
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
        <p style={{ color: 'rgba(255,255,255,0.7)', margin: '4px 0 0', fontSize: 14 }}>
          Board Game Solver
        </p>
      </div>

      {/* Board preview + actions */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <BoardPreview config={config} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setConfig(randomConfig())}
            style={ghostBtn}
          >
            🎲 Randomize
          </button>
          <button
            onClick={() => setShowImageModal(true)}
            style={ghostBtn}
          >
            📷 From Image
          </button>
        </div>
      </div>

      {showImageModal && (
        <ImageSetupModal
          onConfirm={cfg => { setConfig(cfg); setShowImageModal(false); }}
          onCancel={() => setShowImageModal(false)}
        />
      )}

      {/* Quadrant setup — 2×2 grid matching board layout */}
      <div style={{ width: '100%' }}>
        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 8 }}>
          Each tile (A–D) is used exactly once. Selecting a tile already used elsewhere swaps them automatically.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {QUADRANT_LABELS.map((_, i) => (
            <QuadrantSetup
              key={i}
              index={i}
              config={config.quadrants[i]}
              allConfigs={config.quadrants}
              onChange={(q) => updateQuadrant(i, q)}
            />
          ))}
        </div>
      </div>

      {/* Game mode */}
      <div style={{ width: '100%' }}>
        <div style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700, marginBottom: 8, fontSize: 14 }}>
          Game Mode
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {([
            ['hvh', '👤 vs 👤', 'Human vs Human'],
            ['hva', '👤 vs 🤖', 'You (🍩) vs AI'],
            ['avh', '🤖 vs 👤', 'AI vs You (🍫)'],
          ] as [GameMode, string, string][]).map(([m, emoji, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1,
                padding: '10px 6px',
                borderRadius: 10,
                border: `2px solid ${mode === m ? '#fff' : 'rgba(255,255,255,0.25)'}`,
                background: mode === m ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)',
                color: '#fff',
                fontWeight: mode === m ? 700 : 400,
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
                lineHeight: 1.4,
              }}
            >
              <div style={{ fontSize: 18 }}>{emoji}</div>
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
          padding: '14px 52px',
          fontSize: 20,
          fontWeight: 800,
          cursor: 'pointer',
          fontFamily: 'inherit',
          boxShadow: '0 6px 20px rgba(232,93,154,0.45)',
          letterSpacing: 1,
        }}
      >
        Start Game!
      </button>
    </div>
  );
}

function BoardPreview({ config }: { config: BoardConfig }) {
  const cellSize = 24;
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
      boxShadow: '0 4px 16px rgba(0,0,0,0.28)',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(6, ${cellSize}px)`,
        gridTemplateRows: `repeat(6, ${cellSize}px)`,
      }}>
        {cells.map(({ dir, r, c }) => {
          const bg = ((r + c + Math.floor(r/3) + Math.floor(c/3)) % 2) === 0 ? '#f0a0c0' : '#a8d4f0';
          return (
            <div key={`${r},${c}`} style={{ width: cellSize, height: cellSize, background: bg, position: 'relative', border: '0.5px solid rgba(58,143,199,0.4)' }}>
              <DirectionLine direction={dir} size={cellSize} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
