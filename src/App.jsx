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
const archiveDayCount = 365;
const defaultPlayerImage = '/player-images/default-player.svg';

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

function hasStoredGuesses(dateString) {
  return readStoredGuesses(dateString).length > 0;
}

function createArchiveDates(today = new Date()) {
  return Array.from({ length: archiveDayCount }, (_, index) => {
    const date = subDays(today, index);
    const value = format(date, 'yyyy-MM-dd');
    return {
      value,
      label: index === 0 ? "Today" : format(date, 'MMM d, yyyy'),
      played: hasStoredGuesses(value)
    };
  });
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
        <p className="result-answer-line">
          The correct answer was <strong>{targetPlayer.name}</strong>.
        </p>
        <img
          className="result-player-image"
          src={targetPlayer.image}
          alt={targetPlayer.name}
          loading="eager"
          decoding="async"
          onError={(event) => {
            event.currentTarget.src = defaultPlayerImage;
          }}
        />
        <p className="result-copy">
          {isWin
            ? `Solved in ${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'}.`
            : 'Try another archive round.'}
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

function HelpDialog({ onClose }) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <button className="dialog-close" type="button" aria-label="Close help" onClick={onClose}>
          <X size={18} />
        </button>
        <h2 id="help-title" className="help-title">How to Play</h2>

        <ol className="help-steps">
          <li><strong>Guess a cricketer.</strong> Type a name, use the suggestion list, and submit up to 8 guesses.</li>
          <li><strong>Read the clue colors.</strong> Each row compares your guess with the answer across country, role, age, matches, IPL team, and hands.</li>
          <li><strong>Narrow it down.</strong> Use green exact matches, yellow near matches, and arrows to find the player.</li>
        </ol>

        <div className="help-board" aria-label="Color examples">
          <div className="help-board-row">
            <div className="help-cell color-green">IND</div>
            <div className="help-text"><strong>Green</strong><span>Exact match.</span></div>
          </div>
          <div className="help-board-row">
            <div className="help-cell color-yellow">Top Order</div>
            <div className="help-text"><strong>Yellow</strong><span>Close clue: same region, same role group, nearby number, or answer has past IPL history with that team.</span></div>
          </div>
          <div className="help-board-row">
            <div className="help-cell color-white">42 ↓</div>
            <div className="help-text"><strong>Gray</strong><span>No match. Arrows mean the answer is higher or lower than your guess.</span></div>
          </div>
        </div>

        <div className="help-example-strip" aria-label="Example clue row">
          <span className="help-chip color-green" title="Exact match">🇮🇳 IND</span>
          <span className="help-chip color-yellow" title="Hover game cells to see possible matching values">🏏 Allrounder</span>
          <span className="help-chip color-white" title="The answer has more international matches">180 ↑</span>
          <span className="help-chip color-yellow" title="The answer has played for this IPL team in the past">MI</span>
        </div>

        <div className="help-hover-hint">
          <span className="help-pointer" aria-hidden="true">↖</span>
          <span>Hover or focus yellow and gray cells during the game for extra hints.</span>
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
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const { selectedDate, guesses } = gameState;
  const dateString = format(selectedDate, 'yyyy-MM-dd');
  const todayString = format(new Date(), 'yyyy-MM-dd');
  const targetPlayer = useMemo(() => getDailyPlayer(playersData, dateString), [dateString]);
  const archiveDates = createArchiveDates();
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

  const handleArchiveSelect = (event) => {
    const nextDateString = event.target.value;
    if (!nextDateString) {
      return;
    }

    setGameDate(new Date(`${nextDateString}T00:00:00`));
  };

  const openArchivePicker = () => {
    const yesterday = subDays(new Date(), 1);
    setGameDate(yesterday);
  };

  if (!targetPlayer) return <div className="loading">Loading...</div>;

  return (
    <div className="app-container">
      <header className="header">
        <div className="icon-group">
          <button className="icon-button" type="button" aria-label="How to play" onClick={() => setIsHelpOpen(true)}>
            <HelpCircle className="icon" />
          </button>
        </div>
        <div className="title-group flex-center">
          <CricketBall size={32} />
          <h1 className="title">Stumple</h1>
        </div>
        <div className="icon-group">
          <BarChart2 className="icon" />
          <div className="archive-select-wrap">
            <Calendar className="icon archive-icon" aria-hidden="true" />
            <select
              className="archive-select"
              aria-label="Select archive date"
              value={dateString}
              onChange={handleArchiveSelect}
            >
              {archiveDates.map(({ value, label, played }) => (
                <option key={value} value={value}>
                  {played ? "✓ " : "  "}{label}
                </option>
              ))}
            </select>
          </div>
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
          onPlayArchive={openArchivePicker}
        />
      )}

      {isHelpOpen && (
        <HelpDialog onClose={() => setIsHelpOpen(false)} />
      )}
    </div>
  );
}

export default App;
