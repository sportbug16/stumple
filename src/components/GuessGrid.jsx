import React from 'react';
import { compareAttributes } from '../utils/gameLogic';
import { ArrowUp, ArrowDown } from 'lucide-react';

export default function GuessGrid({ guesses, targetPlayer }) {
  const headers = ['Image', 'Name', 'Country', 'IPL Team', 'Age', 'Retired', 'Batting', 'Role'];

  return (
    <div className="grid-container">
      <div className="grid-header">
        {headers.map((h) => <div key={h} className="header-cell">{h}</div>)}
      </div>
      <div className="grid-body">
        {guesses.map((guess, index) => {
          const result = compareAttributes(guess, targetPlayer);

          return (
            <div key={index} className="guess-row animate-pop">
              <div className="cell image-cell">
                <img src={guess.image} alt={guess.name} />
              </div>
              <div className="cell name-cell">
                {guess.name}
              </div>
              <div className={`cell color-${result.country}`}>
                {guess.country}
              </div>
              <div className={`cell color-${result.iplTeam}`}>
                <div className="ipl-abbrev">{guess.currentIplTeam}</div>
              </div>
              <div className={`cell color-${result.age.color} flex-center`}>
                {guess.age} 
                {result.age.arrow === 'up' && <ArrowUp size={16} className="arrow-icon" />}
                {result.age.arrow === 'down' && <ArrowDown size={16} className="arrow-icon" />}
              </div>
              <div className={`cell color-${result.retired}`}>
                {guess.retired}
              </div>
              <div className={`cell color-${result.battingHand}`}>
                {guess.battingHand}
              </div>
              <div className={`cell color-${result.role}`}>
                {guess.role}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

