import React from 'react';
import { compareAttributes } from '../utils/gameLogic';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { BatIcon } from './Icons';

const COUNTRY_ABBREV = {
  "India": "🇮🇳 IND",
  "Pakistan": "🇵🇰 PAK",
  "Australia": "🇦🇺 AUS",
  "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿 ENG",
  "South Africa": "🇿🇦 SA",
  "New Zealand": "🇳🇿 NZ",
  "West Indies": "🌴 WI",
  "Sri Lanka": "🇱🇰 SL",
  "Bangladesh": "🇧🇩 BAN",
  "Afghanistan": "🇦🇫 AFG"
};

const formatRole = (role) => {
  switch (role) {
    case "Top order batter": return <><BatIcon /> Top Order</>;
    case "Middle order batter": return <><BatIcon /> Mid Order</>;
    case "Wicketkeeper batter": return <>🧤 WK</>;
    case "Spin bowler": return <>🌀 Spin</>;
    case "Fast bowler": return <>⚡ Fast</>;
    case "Batting allrounder": return <>🏏 Bat AR</>;
    case "Bowling allrounder": return <>🏏 Bowl AR</>;
    case "Allrounder": return <>🏏 Allrounder</>;
    default: return role;
  }
};

export default function GuessGrid({ guesses, targetPlayer }) {
  const headers = ['Image', 'Name', 'Country', 'Role', 'Retired', 'Age', 'IPL Team'];

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
                {COUNTRY_ABBREV[guess.country] || guess.country}
              </div>
              <div className={`cell color-${result.role}`}>
                {formatRole(guess.role)}
              </div>
              <div className={`cell color-${result.retired}`}>
                {guess.retired}
              </div>
              <div className={`cell color-${result.age.color} flex-center`}>
                {guess.age} 
                {result.age.arrow === 'up' && <ArrowUp size={16} className="arrow-icon" />}
                {result.age.arrow === 'down' && <ArrowDown size={16} className="arrow-icon" />}
              </div>
              <div className={`cell color-${result.iplTeam}`}>
                <div className="ipl-abbrev">{guess.currentIplTeam}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
