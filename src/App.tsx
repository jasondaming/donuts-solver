import { useState } from 'react';
import type { BoardConfig, GameMode } from './game/types';
import { decodeGameSession, SAVED_SESSION_KEY, type GameSessionData } from './game/session';
import { SetupScreen } from './components/SetupScreen';
import { GameScreen } from './components/GameScreen';

type Screen = 'setup' | 'game';

export default function App() {
  const [initialSession] = useState(readInitialSession);
  const [screen, setScreen] = useState<Screen>(initialSession ? 'game' : 'setup');
  const [gameConfig, setGameConfig] = useState<BoardConfig | null>(initialSession?.config ?? null);
  const [gameMode, setGameMode] = useState<GameMode>(initialSession?.mode ?? 'hvh');
  const [loadedSession, setLoadedSession] = useState<GameSessionData | null>(initialSession);
  const [gameKey, setGameKey] = useState(() => initialSession ? `loaded-${Date.now()}` : 'new');

  function handleStart(config: BoardConfig, mode: GameMode) {
    setGameConfig(config);
    setGameMode(mode);
    setLoadedSession(null);
    setGameKey(`new-${Date.now()}`);
    setScreen('game');
  }

  function handleLoadSession(session: GameSessionData) {
    setGameConfig(session.config);
    setGameMode(session.mode);
    setLoadedSession(session);
    setGameKey(`loaded-${Date.now()}`);
    setScreen('game');
  }

  function handleNewGame() {
    window.localStorage.removeItem(SAVED_SESSION_KEY);
    if (window.location.hash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    setLoadedSession(null);
    setScreen('setup');
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a6fa8 0%, #c0387c 100%)',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      {screen === 'setup' || !gameConfig ? (
        <SetupScreen onStart={handleStart} />
      ) : (
        <GameScreen
          key={gameKey}
          config={gameConfig}
          mode={gameMode}
          initialSession={loadedSession}
          onLoadSession={handleLoadSession}
          onNewGame={handleNewGame}
        />
      )}
    </div>
  );
}

function readInitialSession(): GameSessionData | null {
  const fromHash = readHashSession();
  if (fromHash) return fromHash;

  const saved = window.localStorage.getItem(SAVED_SESSION_KEY);
  if (!saved) return null;

  try {
    return decodeGameSession(saved);
  } catch {
    window.localStorage.removeItem(SAVED_SESSION_KEY);
    return null;
  }
}

function readHashSession(): GameSessionData | null {
  const hash = window.location.hash;
  if (!hash.includes('game=')) return null;

  try {
    return decodeGameSession(hash);
  } catch {
    return null;
  }
}
