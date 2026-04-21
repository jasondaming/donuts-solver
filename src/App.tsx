import { useState } from 'react';
import type { BoardConfig, GameMode } from './game/types';
import { SetupScreen } from './components/SetupScreen';
import { GameScreen } from './components/GameScreen';

type Screen = 'setup' | 'game';

export default function App() {
  const [screen, setScreen] = useState<Screen>('setup');
  const [gameConfig, setGameConfig] = useState<BoardConfig | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>('hvh');

  function handleStart(config: BoardConfig, mode: GameMode) {
    setGameConfig(config);
    setGameMode(mode);
    setScreen('game');
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
          config={gameConfig}
          mode={gameMode}
          onNewGame={() => setScreen('setup')}
        />
      )}
    </div>
  );
}
