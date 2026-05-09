import { useState, useEffect, useRef } from 'react';
import playersData from '../data/players.json';

export default function SearchBar({ onGuess, disabled }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef(null);
  const suggestionRefs = useRef([]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
        setActiveIndex(-1);
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
      setActiveIndex(filtered.length > 0 ? 0 : -1);
    } else {
      setSuggestions([]);
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  const handleSelect = (player) => {
    onGuess(player);
    setQuery('');
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (!isOpen || suggestions.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((currentIndex) => (
        currentIndex >= suggestions.length - 1 ? 0 : currentIndex + 1
      ));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((currentIndex) => (
        currentIndex <= 0 ? suggestions.length - 1 : currentIndex - 1
      ));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  useEffect(() => {
    if (activeIndex < 0) {
      return;
    }

    suggestionRefs.current[activeIndex]?.scrollIntoView({
      block: 'nearest'
    });
  }, [activeIndex]);

  return (
    <div className="search-wrapper" ref={wrapperRef}>
      <input
        type="text"
        placeholder="Guess a cricketer..."
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="search-input"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls="player-suggestions"
        aria-activedescendant={activeIndex >= 0 ? `player-suggestion-${suggestions[activeIndex]?.id}-${activeIndex}` : undefined}
      />
      {isOpen && suggestions.length > 0 && (
        <ul className="suggestions-list" id="player-suggestions" role="listbox">
          {suggestions.map((player, index) => (
            <li 
              key={`${player.id}-${index}`}
              id={`player-suggestion-${player.id}-${index}`}
              ref={(element) => {
                suggestionRefs.current[index] = element;
              }}
              onClick={() => handleSelect(player)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`suggestion-item ${index === activeIndex ? 'active' : ''}`}
              role="option"
              aria-selected={index === activeIndex}
            >
              {player.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
