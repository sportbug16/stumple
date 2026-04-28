export const REGIONS = {
  "South Asia": ["India", "Pakistan", "Sri Lanka", "Bangladesh", "Afghanistan", "Nepal"],
  "Middle East": ["UAE", "Oman", "Qatar", "Kuwait", "Saudi Arabia"],
  "Europe": ["England", "Ireland", "Scotland", "Netherlands", "Italy", "Jersey"],
  "Oceania": ["Australia", "New Zealand", "Papua New Guinea", "Fiji"],
  "Americas": ["West Indies", "USA", "Canada", "Bermuda"],
  "Africa": ["South Africa", "Zimbabwe", "Namibia", "Uganda", "Kenya"]
};

export const ROLE_GROUPS = {
  "Top order batter": "Batter",
  "Middle order batter": "Batter",
  "Wicketkeeper batter": "Batter",
  "Batting allrounder": "Allrounder",
  "Bowling allrounder": "Allrounder",
  "Spin bowler": "Bowler",
  "Fast bowler": "Bowler"
};

export function getRegion(country) {
  for (const [region, countries] of Object.entries(REGIONS)) {
    if (countries.includes(country)) {
      return region;
    }
  }
  return "Unknown";
}

export function compareAttributes(guess, target) {
  const result = {};

  // Country
  if (guess.country === target.country) {
    result.country = "green";
  } else if (getRegion(guess.country) === getRegion(target.country) && getRegion(guess.country) !== "Unknown") {
    result.country = "yellow";
  } else {
    result.country = "white";
  }

  // IPL Team
  if (guess.currentIplTeam === target.currentIplTeam) {
    result.iplTeam = "green";
  } else {
    // If the guessed player played for the target's current team in the past
    // Or if the guessed player's current team is one the target played for in the past
    // The requirement: "yellow if in past player has played for that ipl team"
    // Let's assume this means if there's an intersection between all teams (current + past) of guess and target
    // Wait, the prompt says: "for ipl team do yellow if in past player has played for that ipl team"
    // Does it mean if target's current team is in guess's past teams?
    // Let's make it yellow if they share ANY team (current or past) but not the exact current match.
    const guessAllTeams = [guess.currentIplTeam, ...(guess.pastIplTeams || [])].filter(t => t !== "None");
    const targetAllTeams = [target.currentIplTeam, ...(target.pastIplTeams || [])].filter(t => t !== "None");
    
    const intersection = guessAllTeams.filter(t => targetAllTeams.includes(t));
    if (intersection.length > 0) {
      result.iplTeam = "yellow";
    } else {
      result.iplTeam = "white";
    }
  }

  // Age
  if (guess.age === target.age) {
    result.age = { color: "green", arrow: null };
  } else if (Math.abs(guess.age - target.age) <= 2) {
    result.age = { color: "yellow", arrow: guess.age < target.age ? "up" : "down" };
  } else {
    result.age = { color: "white", arrow: guess.age < target.age ? "up" : "down" };
  }

  // Retired
  result.retired = guess.retired === target.retired ? "green" : "white";

  // Batting Hand
  result.battingHand = guess.battingHand === target.battingHand ? "green" : "white";

  // Role
  if (guess.role === target.role) {
    result.role = "green";
  } else {
    const guessGroup = ROLE_GROUPS[guess.role];
    const targetGroup = ROLE_GROUPS[target.role];
    if (guessGroup && targetGroup && guessGroup === targetGroup) {
      result.role = "yellow";
    } else {
      result.role = "white";
    }
  }

  return result;
}

// Simple seeded random to get same player for a specific date
export function getDailyPlayer(players, dateString) {
  // Use dateString "YYYY-MM-DD" to seed
  let hash = 0;
  for (let i = 0; i < dateString.length; i++) {
    hash = ((hash << 5) - hash) + dateString.charCodeAt(i);
    hash |= 0; 
  }
  const index = Math.abs(hash) % players.length;
  return players[index];
}
