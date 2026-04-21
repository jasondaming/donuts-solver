import { useRef, useState } from 'react';
import type { BoardConfig, Direction, QuadrantConfig } from '../game/types';
import { TILE_PATTERNS, rotateTile } from '../game/tiles';
import { DirectionLine } from './DirectionLine';

interface Props {
  onConfirm: (config: BoardConfig) => void;
  onCancel: () => void;
}

type Status = 'idle' | 'analyzing' | 'done' | 'error';

// Try all 4 tiles × 4 rotations against a 3×3 detected grid
function matchQuadrant(grid: Direction[][]): QuadrantConfig | null {
  for (const pattern of TILE_PATTERNS) {
    for (let rot = 0; rot < 4; rot++) {
      const rotated = rotateTile(pattern.grid, rot);
      if (rotated.every((row, r) => row.every((d, c) => d === grid[r][c]))) {
        return { patternId: pattern.id, rotation: rot as 0|1|2|3 };
      }
    }
  }
  return null;
}

function extract3x3(board: Direction[][], rowOff: number, colOff: number): Direction[][] {
  return Array.from({ length: 3 }, (_, r) =>
    Array.from({ length: 3 }, (_, c) => board[rowOff + r][colOff + c])
  );
}

function BoardPreviewGrid({ board }: { board: Direction[][] }) {
  const cellSize = 44;
  return (
    <div style={{
      border: '3px solid #3a8fc7', borderRadius: 5, padding: 3, background: '#3a8fc7',
      display: 'inline-block',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(6, ${cellSize}px)`,
        gridTemplateRows: `repeat(6, ${cellSize}px)`,
      }}>
        {board.map((row, r) => row.map((dir, c) => {
          const bg = ((r % 3 + c % 3 + Math.floor(r/3) + Math.floor(c/3)) % 2) === 0 ? '#f0a0c0' : '#a8d4f0';
          return (
            <div key={`${r},${c}`} style={{
              width: cellSize, height: cellSize, background: bg, position: 'relative',
              border: '0.5px solid rgba(58,143,199,0.4)',
            }}>
              <DirectionLine direction={dir} size={cellSize} />
            </div>
          );
        }))}
      </div>
    </div>
  );
}

const VALID_DIRS = new Set<string>(['H', 'V', 'D', 'A']);

export function ImageSetupModal({ onConfirm, onCancel }: Props) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('donuts-api-key') ?? '');
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageType, setImageType] = useState('image/jpeg');
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [detectedBoard, setDetectedBoard] = useState<Direction[][] | null>(null);
  const [matchWarnings, setMatchWarnings] = useState<string[]>([]);
  const [pendingConfig, setPendingConfig] = useState<BoardConfig | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  function loadFile(file: File) {
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target?.result as string;
      setImageSrc(dataUrl);
      const [header, b64] = dataUrl.split(',');
      setImageData(b64);
      setImageType(header.match(/:(.*?);/)?.[1] ?? 'image/jpeg');
      setStatus('idle');
      setDetectedBoard(null);
    };
    reader.readAsDataURL(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) loadFile(file);
  }

  function onPaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
    if (item) loadFile(item.getAsFile()!);
  }

  async function analyze() {
    if (!imageData || !apiKey.trim()) return;
    localStorage.setItem('donuts-api-key', apiKey.trim());
    setStatus('analyzing');
    setErrorMsg('');

    const prompt = `This is an image of the Donuts board game (by Bruno Cathala). The playing area is a 6×6 grid.

Each of the 36 squares has a directional marking. Determine the direction for every square, reading left-to-right, top-to-bottom (ignore the outer border/frame):

Direction codes:
  D = diagonal line from top-left to bottom-right (like the \\ character)
  A = diagonal line from top-right to bottom-left (like the / character)
  H = horizontal line or horizontal color split across the square
  V = vertical line or vertical color split down the square

In the digital companion app, each square is divided into two colored triangles:
  Pink in upper-right triangle → A direction
  Pink in lower-left triangle → A direction
  Pink in upper-left triangle → D direction
  Pink in lower-right triangle → D direction
  Pink on top half → H direction
  Pink on bottom half → H direction
  Pink on left half → V direction
  Pink on right half → V direction

Return ONLY valid JSON, no other text:
{"board":[["?","?","?","?","?","?"],["?","?","?","?","?","?"],["?","?","?","?","?","?"],["?","?","?","?","?","?"],["?","?","?","?","?","?"],["?","?","?","?","?","?"]]}`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 512,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: imageType, data: imageData } },
              { type: 'text', text: prompt },
            ],
          }],
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: { message?: string } }).error?.message ?? `API error ${res.status}`);
      }

      const result = await res.json();
      const text = (result.content[0] as { text: string }).text;

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in Claude response');

      const parsed = JSON.parse(jsonMatch[0]) as { board: string[][] };
      const raw = parsed.board;

      if (!Array.isArray(raw) || raw.length !== 6 || raw.some(row => !Array.isArray(row) || row.length !== 6)) {
        throw new Error('Response has wrong shape (expected 6×6 grid)');
      }

      // Validate and coerce directions
      const board: Direction[][] = raw.map((row, r) =>
        row.map((d, c) => {
          const upper = String(d).toUpperCase().trim();
          if (VALID_DIRS.has(upper)) return upper as Direction;
          console.warn(`Unknown direction "${d}" at [${r},${c}], defaulting to D`);
          return 'D' as Direction;
        })
      );

      setDetectedBoard(board);

      // Try to match each quadrant to a known tile pattern+rotation
      const offsets: [number, number][] = [[0,0],[0,3],[3,0],[3,3]];
      const labels = ['Top-Left', 'Top-Right', 'Bottom-Left', 'Bottom-Right'];
      const warnings: string[] = [];
      const quadrants = offsets.map(([ro, co], i) => {
        const q3x3 = extract3x3(board, ro, co);
        const match = matchQuadrant(q3x3);
        if (!match) {
          warnings.push(`${labels[i]} quadrant doesn't match any known tile — using closest guess.`);
          return { patternId: i % 4, rotation: 0 as const };
        }
        return match;
      }) as BoardConfig['quadrants'];

      setMatchWarnings(warnings);
      setPendingConfig({ quadrants });
      setStatus('done');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
      onPaste={onPaste}
    >
      <div style={{
        background: 'linear-gradient(135deg, #1a6fa8, #c0387c)',
        borderRadius: 16, padding: 24,
        display: 'flex', flexDirection: 'column', gap: 16,
        maxWidth: 620, width: '100%', maxHeight: '95vh', overflowY: 'auto',
        boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
      }}>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>📷 Detect Board from Image</div>
        <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>
          Upload or paste a screenshot of the empty Donuts board. Claude will read the direction of each cell automatically.
        </div>

        {/* API key */}
        <div>
          <label style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, display: 'block', marginBottom: 5 }}>
            Anthropic API Key{' '}
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>(saved locally, never sent anywhere but Anthropic)</span>
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'rgba(0,0,0,0.35)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8,
              padding: '8px 12px', fontSize: 14, fontFamily: 'monospace',
            }}
          />
        </div>

        {/* Drop zone */}
        <div
          ref={dropRef}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={onDrop}
          style={{
            border: '2px dashed rgba(255,255,255,0.4)', borderRadius: 12,
            padding: 20, textAlign: 'center', cursor: 'pointer',
            background: 'rgba(0,0,0,0.2)',
            transition: 'border-color 0.15s',
            minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 6,
          }}
        >
          {imageSrc ? (
            <img src={imageSrc} alt="Board" style={{ maxHeight: 200, maxWidth: '100%', borderRadius: 6 }} />
          ) : (
            <>
              <div style={{ fontSize: 32 }}>🖼️</div>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>Click, drag & drop, or Ctrl+V to paste</div>
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>Screenshot or photo of the empty board</div>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); }} />

        {/* Analyze button */}
        <button
          onClick={analyze}
          disabled={!imageData || !apiKey.trim() || status === 'analyzing'}
          style={{
            background: (!imageData || !apiKey.trim() || status === 'analyzing')
              ? 'rgba(255,255,255,0.15)' : 'linear-gradient(135deg, #e85d9a, #ff8c42)',
            color: (!imageData || !apiKey.trim() || status === 'analyzing') ? 'rgba(255,255,255,0.45)' : '#fff',
            border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 15, fontWeight: 700,
            cursor: (!imageData || !apiKey.trim() || status === 'analyzing') ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {status === 'analyzing' ? '🔍 Analyzing…' : '🔍 Detect Board Directions'}
        </button>

        {/* Error */}
        {status === 'error' && (
          <div style={{ background: 'rgba(220,40,40,0.25)', borderRadius: 8, padding: '10px 14px', color: '#ff9090', fontSize: 13 }}>
            ⚠ {errorMsg}
          </div>
        )}

        {/* Result */}
        {status === 'done' && detectedBoard && pendingConfig && (
          <>
            <div style={{ color: '#fff', fontWeight: 700 }}>Detected Board:</div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <BoardPreviewGrid board={detectedBoard} />
            </div>
            {matchWarnings.map((w, i) => (
              <div key={i} style={{ background: 'rgba(255,160,0,0.2)', borderRadius: 8, padding: '8px 12px', color: '#ffd080', fontSize: 12 }}>
                ⚠ {w}
              </div>
            ))}
            <button
              onClick={() => onConfirm(pendingConfig)}
              style={{
                background: 'linear-gradient(135deg, #4caf50, #2e7d32)',
                color: '#fff', border: 'none', borderRadius: 10, padding: '12px 0',
                fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 4px 12px rgba(76,175,80,0.4)',
              }}
            >
              ✓ Use This Board
            </button>
          </>
        )}

        {/* Cancel */}
        <button
          onClick={onCancel}
          style={{
            background: 'rgba(255,255,255,0.12)', color: '#fff',
            border: '1px solid rgba(255,255,255,0.3)', borderRadius: 10,
            padding: '10px 0', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
