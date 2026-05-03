import { useState } from 'react';
import { createPortal } from 'react-dom';
import { compareAttributes, getRegion, REGIONS, ROLE_GROUPS } from '../utils/gameLogic';
import { getIplTeamMeta } from '../utils/iplTeams';
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
    case "Spin bowler": return <>🌀 Spin Bowler</>;
    case "Fast bowler": return <>⚡ Fast Bowler</>;
    case "Batting allrounder": return <>🏏 Bat AR</>;
    case "Bowling allrounder": return <>🏏 Bowl AR</>;
    case "Allrounder": return <>🏏 Allrounder</>;
    default: return role;
  }
};

const formatCount = (value) => Number.isFinite(Number(value)) ? Number(value) : 'Unknown';

const getResultColor = (result) => (typeof result === 'string' ? result : result.color);

const ROLE_SECTIONS = {
  Batsman: ["Top order batter", "Middle order batter", "Wicketkeeper batter"],
  Bowler: ["Spin bowler", "Fast bowler"],
  "All Rounder": ["Batting allrounder", "Bowling allrounder", "Allrounder"]
};

const ROLE_SECTION_BY_GROUP = {
  Batter: "Batsman",
  Bowler: "Bowler",
  Allrounder: "All Rounder"
};

const getIplTeams = (player) => (
  [player.currentIplTeam, ...(player.pastIplTeams || [])]
    .filter((team) => team && team !== 'None' && team !== 'Unknown')
);

const getCommonIplTeams = (guess, target) => {
  const targetTeams = new Set(getIplTeams(target));
  return getIplTeams(guess).filter((team) => targetTeams.has(team));
};

function TooltipList({ items }) {
  return (
    <ul className="tooltip-list">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

function TooltipSections({ sections }) {
  return (
    <div className="tooltip-sections">
      {sections.map(({ title, items }) => (
        <div className="tooltip-section" key={title}>
          <div className="tooltip-subheading">{title}</div>
          <TooltipList items={items} />
        </div>
      ))}
    </div>
  );
}

const createTooltip = (label, content) => ({ label, content });

const getCountryTooltip = (guess, color) => {
  if (color === 'green') {
    return null;
  }

  const region = getRegion(guess.country);
  if (color === 'yellow' && region !== 'Unknown') {
    const possibleCountries = (REGIONS[region] || []).filter((country) => country !== guess.country);
    return createTooltip(
      `Possibilities in ${region}: ${possibleCountries.join(', ')}`,
      <>
        <strong className="tooltip-heading">Possibilities in {region}:</strong>
        <TooltipList items={possibleCountries} />
      </>
    );
  }

  const possibleRegions = Object.keys(REGIONS).filter((candidateRegion) => candidateRegion !== region);
  return createTooltip(
    `Possibilities: ${possibleRegions.join(', ')}`,
    <>
      <strong className="tooltip-heading">Possibilities:</strong>
      <TooltipList items={possibleRegions} />
    </>
  );
};

const getRoleTooltip = (guess, color) => {
  if (color === 'green') {
    return null;
  }

  const roleGroup = ROLE_GROUPS[guess.role];
  const currentSection = ROLE_SECTION_BY_GROUP[roleGroup];
  if (color === 'yellow' && roleGroup) {
    const possibleRoles = ROLE_SECTIONS[currentSection].filter((role) => role !== guess.role);
    return createTooltip(
      `Possibilities: ${currentSection}: ${possibleRoles.join(', ')}`,
      <>
        <strong className="tooltip-heading">Possibilities:</strong>
        <TooltipSections sections={[{ title: currentSection, items: possibleRoles }]} />
      </>
    );
  }

  const possibleSections = Object.entries(ROLE_SECTIONS)
    .filter(([title]) => title !== currentSection)
    .map(([title, items]) => ({ title, items }));

  return createTooltip(
    `Possibilities: ${possibleSections.map(({ title, items }) => `${title}: ${items.join(', ')}`).join('; ')}`,
    <>
      <strong className="tooltip-heading">Possibilities:</strong>
      <TooltipSections sections={possibleSections} />
    </>
  );
};

const getAgeTooltip = (guess, result) => {
  const color = result.color;
  const age = Number(guess.age);
  if (color === 'green' || !Number.isFinite(age) || !result.arrow) {
    return null;
  }

  const bound = `${result.arrow === 'up' ? '>' : '<'} ${age}`;
  return createTooltip(
    bound,
    <div className="tooltip-bound">{bound}</div>
  );
};

const getMatchTooltip = (value, result) => {
  const color = result.color;
  const count = Number(value);
  if (color === 'green' || !Number.isFinite(count) || !result.arrow) {
    return null;
  }

  let bound = `${result.arrow === 'up' ? '>' : '<'} ${count}`;
  if (color === 'yellow') {
    bound = result.arrow === 'up'
      ? `> ${count} and <= ${count + 20}`
      : `>= ${Math.max(0, count - 20)} and < ${count}`;
  }

  return createTooltip(
    bound,
    <div className="tooltip-bound">{bound}</div>
  );
};

const getIplTeamTooltip = (guess, target, color) => {
  if (color === 'green') {
    return null;
  }

  if (color === 'yellow') {
    const teams = getCommonIplTeams(guess, target);
    if (teams.length === 0) {
      return null;
    }

    return createTooltip(
      `Common IPL teams: ${teams.join(', ')}`,
      <>
        <strong className="tooltip-heading">Common IPL teams:</strong>
        <TooltipList items={teams} />
      </>
    );
  }

  return null;
};

function ClueCell({ result, tooltip, children, className = '' }) {
  const color = getResultColor(result);
  const [tooltipPosition, setTooltipPosition] = useState(null);
  const hasTooltip = Boolean(tooltip);

  const showTooltip = (event) => {
    if (!hasTooltip) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const tooltipWidth = Math.min(260, window.innerWidth - 24);
    const left = Math.min(
      Math.max(rect.left + (rect.width / 2), 12 + (tooltipWidth / 2)),
      window.innerWidth - 12 - (tooltipWidth / 2)
    );
    const placement = rect.bottom + 96 > window.innerHeight ? 'top' : 'bottom';
    const top = placement === 'top' ? rect.top - 10 : rect.bottom + 10;

    setTooltipPosition({ left, top, placement });
  };

  const hideTooltip = () => setTooltipPosition(null);

  return (
    <div
      className={`cell ${hasTooltip ? 'clue-cell' : ''} color-${color} ${className}`}
      tabIndex={hasTooltip ? 0 : undefined}
      aria-label={tooltip?.label}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      <div className="cell-content">{children}</div>
      {tooltipPosition && createPortal(
        <div
          className="clue-tooltip"
          data-placement={tooltipPosition.placement}
          role="tooltip"
          style={{
            left: `${tooltipPosition.left}px`,
            top: `${tooltipPosition.top}px`
          }}
        >
          {tooltip.content}
        </div>,
        document.body
      )}
    </div>
  );
}

function ArrowIndicator({ arrow }) {
  if (arrow === 'up') {
    return <ArrowUp size={16} className="arrow-icon" />;
  }
  if (arrow === 'down') {
    return <ArrowDown size={16} className="arrow-icon" />;
  }
  return null;
}

function IplTeamBadge({ team }) {
  const teamMeta = getIplTeamMeta(team);
  if (!teamMeta.logo) {
    return <span>{teamMeta.name}</span>;
  }

  return (
    <span className="ipl-team-badge" title={teamMeta.name}>
      <img className="ipl-team-logo" src={teamMeta.logo} alt="" aria-hidden="true" />
      <span>{team}</span>
    </span>
  );
}

const GREEN_RESULT = {
  country: 'green',
  role: 'green',
  retired: 'green',
  age: { color: 'green', arrow: null },
  matches: { color: 'green', arrow: null },
  iplTeam: 'green',
  iplMatches: { color: 'green', arrow: null }
};

export default function GuessGrid({ guesses, targetPlayer, showAnswerRow = false }) {
  const headers = [
    'Image',
    'Name',
    'Country',
    'Role',
    'Retired',
    'Age',
    'Intl Matches',
    'Current IPL Team',
    'IPL Matches'
  ];

  return (
    <div className="grid-container">
      <div className="grid-header">
        {headers.map((h) => <div key={h} className="header-cell">{h}</div>)}
      </div>
      <div className="grid-body">
        {[
          ...guesses.map((guess, index) => ({ player: guess, key: `guess-${guess.id}-${index}`, isAnswerRow: false })),
          ...(showAnswerRow ? [{ player: targetPlayer, key: `answer-${targetPlayer.id}`, isAnswerRow: true }] : [])
        ].map(({ player: guess, key, isAnswerRow }) => {
          const result = isAnswerRow ? GREEN_RESULT : compareAttributes(guess, targetPlayer);
          const rowClassName = `guess-row animate-pop ${isAnswerRow ? 'answer-row' : ''}`;

          return (
            <div key={key} className={rowClassName}>
              <div className={`cell image-cell ${isAnswerRow ? 'answer-cell color-green' : ''}`}>
                <img
                  src={guess.image}
                  alt={guess.name}
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                />
              </div>
              <div className={`cell name-cell ${isAnswerRow ? 'answer-cell color-green' : ''}`}>
                {guess.name}
              </div>
              <ClueCell result={result.country} tooltip={isAnswerRow ? null : getCountryTooltip(guess, result.country)}>
                {COUNTRY_ABBREV[guess.country] || guess.country}
              </ClueCell>
              <ClueCell result={result.role} tooltip={isAnswerRow ? null : getRoleTooltip(guess, result.role)}>
                {formatRole(guess.role)}
              </ClueCell>
              <ClueCell result={result.retired} tooltip={null}>
                {guess.retired}
              </ClueCell>
              <ClueCell result={result.age} tooltip={isAnswerRow ? null : getAgeTooltip(guess, result.age)} className="flex-center">
                {Number.isFinite(Number(guess.age)) ? guess.age : 'Unknown'} 
                <ArrowIndicator arrow={result.age.arrow} />
              </ClueCell>
              <ClueCell result={result.matches} tooltip={isAnswerRow ? null : getMatchTooltip(guess.matches, result.matches)} className="flex-center">
                {formatCount(guess.matches)}
                <ArrowIndicator arrow={result.matches.arrow} />
              </ClueCell>
              <ClueCell result={result.iplTeam} tooltip={isAnswerRow ? null : getIplTeamTooltip(guess, targetPlayer, result.iplTeam)}>
                <IplTeamBadge team={guess.currentIplTeam} />
              </ClueCell>
              <ClueCell result={result.iplMatches} tooltip={isAnswerRow ? null : getMatchTooltip(guess.iplMatches, result.iplMatches)} className="flex-center">
                {formatCount(guess.iplMatches)}
                <ArrowIndicator arrow={result.iplMatches.arrow} />
              </ClueCell>
            </div>
          );
        })}
      </div>
    </div>
  );
}
