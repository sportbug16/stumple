import React, { useState, useEffect, useRef } from 'react';
import playersData from '../data/players.json';

export default function SearchBar({ onGuess, disabled }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [wrapperRef]);

  const handleChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    if (value.length > 0) {
      const filtered = playersData.filter(player => 
        player.name.toLowerCase().includes(value.toLowerCase())
      );
      setSuggestions(filtered);
      setIsOpen(true);
    } else {
      setSuggestions([]);
      setIsOpen(false);
    }
  };

  const handleSelect = (player) => {
    onGuess(player);
    setQuery('');
    setSuggestions([]);
    setIsOpen(false);
  };

  return (
    <div className="search-wrapper" ref={wrapperRef}>
      <input
        type="text"
        placeholder="Guess a cricketer..."
        value={query}
        onChange={handleChange}
        disabled={disabled}
        className="search-input"
        autoComplete="off"
      />
      {isOpen && suggestions.length > 0 && (
        <ul className="suggestions-list">
          {suggestions.map((player) => (
            <li 
              key={player.id} 
              onClick={() => handleSelect(player)}
              className="suggestion-item"
            >
              {player.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
