import { useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { getDailyPlayer } from './utils/gameLogic';
import playersData from './data/players.json';
import SearchBar from './components/SearchBar';
import GuessGrid from './components/GuessGrid';
import { CricketBall } from './components/Icons';
import { Calendar, HelpCircle, BarChart2 } from 'lucide-react';
import './index.css';

const maxGuesses = 8;

function readStoredGuesses(dateString) {
  const storedGuesses = localStorage.getItem(`stumple_guesses_${dateString}`);
  if (!storedGuesses) {
    return [];
  }

  try {
    const parsedGuesses = JSON.parse(storedGuesses);
    return Array.isArray(parsedGuesses) ? parsedGuesses : [];
  } catch {
    return [];
  }
}

function getGameStatus(currentGuesses, target) {
  if (currentGuesses.length === 0 || !target) {
    return 'playing';
  }

  const lastGuess = currentGuesses[currentGuesses.length - 1];
  if (lastGuess.id === target.id) {
    return 'won';
  }
  return currentGuesses.length >= maxGuesses ? 'lost' : 'playing';
}

function App() {
  const [gameState, setGameState] = useState(() => {
    const selectedDate = new Date();
    const dateString = format(selectedDate, 'yyyy-MM-dd');
    return {
      selectedDate,
      guesses: readStoredGuesses(dateString)
    };
  });

  const { selectedDate, guesses } = gameState;
  const dateString = format(selectedDate, 'yyyy-MM-dd');
  const targetPlayer = useMemo(() => getDailyPlayer(playersData, dateString), [dateString]);
  const gameStatus = getGameStatus(guesses, targetPlayer);

  const setGameDate = (selectedDate) => {
    const nextDateString = format(selectedDate, 'yyyy-MM-dd');
    setGameState({
      selectedDate,
      guesses: readStoredGuesses(nextDateString)
    });
  };

  const handleGuess = (player) => {
    // Prevent duplicate guesses
    if (guesses.find(g => g.id === player.id)) return;
    
    const newGuesses = [...guesses, player];
    localStorage.setItem(`stumple_guesses_${dateString}`, JSON.stringify(newGuesses));
    setGameState((previousState) => ({
      ...previousState,
      guesses: newGuesses
    }));
  };

  const changeDate = (days) => {
    setGameState((previousState) => {
      const selectedDate = subDays(previousState.selectedDate, days);
      const nextDateString = format(selectedDate, 'yyyy-MM-dd');
      return {
        selectedDate,
        guesses: readStoredGuesses(nextDateString)
      };
    });
  };

  if (!targetPlayer) return <div className="loading">Loading...</div>;

  return (
    <div className="app-container">
      <header className="header">
        <div className="icon-group">
          <HelpCircle className="icon" />
        </div>
        <div className="title-group flex-center">
          <CricketBall size={32} />
          <h1 className="title">Stumple</h1>
        </div>
        <div className="icon-group">
          <BarChart2 className="icon" />
          <Calendar className="icon" onClick={() => {
            const days = prompt("Enter days to go back (0 for today):", "0");
            if(days !== null && !isNaN(days)) changeDate(parseInt(days));
          }} />
        </div>
      </header>

      <main className="main-content">
        <div className="date-display">
          Playing archive: {dateString} 
          {dateString !== format(new Date(), 'yyyy-MM-dd') && (
            <button className="btn-today" onClick={() => setGameDate(new Date())}>
              Back to Today
            </button>
          )}
        </div>

        {gameStatus === 'playing' && (
          <div className="search-section">
            <SearchBar onGuess={handleGuess} disabled={gameStatus !== 'playing'} />
            <div className="guess-count">
              Guess {guesses.length + 1} of {maxGuesses}
            </div>
          </div>
        )}

        {gameStatus !== 'playing' && (
          <div className={`status-banner ${gameStatus}`}>
            {gameStatus === 'won' 
              ? `You won in ${guesses.length} guesses!` 
              : `Game over. The player was ${targetPlayer.name}.`}
          </div>
        )}

        {guesses.length > 0 && (
          <div className="grid-wrapper">
             <GuessGrid guesses={guesses} targetPlayer={targetPlayer} />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
