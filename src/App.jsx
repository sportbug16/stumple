import React, { useState, useEffect } from 'react';
import { format, subDays } from 'date-fns';
import { getDailyPlayer } from './utils/gameLogic';
import playersData from './data/players.json';
import SearchBar from './components/SearchBar';
import GuessGrid from './components/GuessGrid';
import { Calendar, HelpCircle, BarChart2 } from 'lucide-react';
import './index.css';

function App() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [targetPlayer, setTargetPlayer] = useState(null);
  const [guesses, setGuesses] = useState([]);
  const [gameStatus, setGameStatus] = useState('playing'); // playing, won, lost

  const maxGuesses = 8;
  const dateString = format(selectedDate, 'yyyy-MM-dd');

  useEffect(() => {
    // Initialize game for selected date
    const player = getDailyPlayer(playersData, dateString);
    setTargetPlayer(player);

    const savedGuesses = JSON.parse(localStorage.getItem(`stumple_guesses_${dateString}`)) || [];
    setGuesses(savedGuesses);
    checkGameStatus(savedGuesses, player);
  }, [dateString]);

  const checkGameStatus = (currentGuesses, target) => {
    if (currentGuesses.length === 0) {
      setGameStatus('playing');
      return;
    }
    const lastGuess = currentGuesses[currentGuesses.length - 1];
    if (lastGuess.id === target.id) {
      setGameStatus('won');
    } else if (currentGuesses.length >= maxGuesses) {
      setGameStatus('lost');
    } else {
      setGameStatus('playing');
    }
  };

  const handleGuess = (player) => {
    // Prevent duplicate guesses
    if (guesses.find(g => g.id === player.id)) return;
    
    const newGuesses = [...guesses, player];
    setGuesses(newGuesses);
    localStorage.setItem(`stumple_guesses_${dateString}`, JSON.stringify(newGuesses));
    
    checkGameStatus(newGuesses, targetPlayer);
  };

  const changeDate = (days) => {
    setSelectedDate(prev => subDays(prev, days));
  };

  if (!targetPlayer) return <div className="loading">Loading...</div>;

  return (
    <div className="app-container">
      <header className="header">
        <div className="icon-group">
          <HelpCircle className="icon" />
        </div>
        <h1 className="title">Stumple</h1>
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
            <button className="btn-today" onClick={() => setSelectedDate(new Date())}>
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
