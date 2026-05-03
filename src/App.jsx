import { useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { getDailyPlayer } from './utils/gameLogic';
import playersData from './data/players.json';
import SearchBar from './components/SearchBar';
import GuessGrid from './components/GuessGrid';
import { CricketBall } from './components/Icons';
import { Calendar, HelpCircle, BarChart2, X, Check, CircleAlert } from 'lucide-react';
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

function ResultDialog({ status, guesses, targetPlayer, onClose, onPlayArchive }) {
  if (status === 'playing') {
    return null;
  }

  const isWin = status === 'won';

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="result-dialog" role="dialog" aria-modal="true" aria-labelledby="result-title">
        <button className="dialog-close" type="button" aria-label="Close result" onClick={onClose}>
          <X size={18} />
        </button>
        <div className={`result-mark ${isWin ? 'won' : 'lost'}`}>
          {isWin ? <Check size={22} /> : <CircleAlert size={22} />}
        </div>
        <h2 id="result-title" className="result-title">
          {isWin ? 'Yay! You got it right!' : 'Sorry! Better luck next time'}
        </h2>
        <p className="result-copy">
          {isWin
            ? `Solved in ${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'}.`
            : `The player was ${targetPlayer.name}.`}
        </p>
        <div className="dialog-actions">
          <button className="btn-secondary" type="button" onClick={onClose}>
            Close
          </button>
          <button className="btn-primary" type="button" onClick={onPlayArchive}>
            <Calendar size={16} />
            Play Archive
          </button>
        </div>
      </div>
    </div>
  );
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
  const [dismissedResultKey, setDismissedResultKey] = useState(null);

  const { selectedDate, guesses } = gameState;
  const dateString = format(selectedDate, 'yyyy-MM-dd');
  const todayString = format(new Date(), 'yyyy-MM-dd');
  const targetPlayer = useMemo(() => getDailyPlayer(playersData, dateString), [dateString]);
  const gameStatus = getGameStatus(guesses, targetPlayer);
  const resultDialogKey = `${dateString}:${gameStatus}:${guesses.length}`;
  const isResultDialogOpen = gameStatus !== 'playing' && dismissedResultKey !== resultDialogKey;

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

  const openArchivePrompt = () => {
    const days = prompt("Enter days to go back (0 for today):", "1");
    const dayCount = Number.parseInt(days, 10);
    if (days === null || Number.isNaN(dayCount)) {
      return;
    }

    setGameDate(subDays(new Date(), Math.max(0, dayCount)));
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
          <Calendar className="icon" onClick={openArchivePrompt} />
        </div>
      </header>

      <main className="main-content">
        <div className="date-display">
          {dateString === todayString ? "Playing today's Stumple" : `Playing archive: ${dateString}`}
          {dateString !== todayString && (
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

        {guesses.length > 0 && (
          <div className="grid-wrapper">
             <GuessGrid guesses={guesses} targetPlayer={targetPlayer} showAnswerRow={gameStatus === 'lost'} />
          </div>
        )}
      </main>

      {isResultDialogOpen && (
        <ResultDialog
          status={gameStatus}
          guesses={guesses}
          targetPlayer={targetPlayer}
          onClose={() => setDismissedResultKey(resultDialogKey)}
          onPlayArchive={openArchivePrompt}
        />
      )}
    </div>
  );
}

export default App;
