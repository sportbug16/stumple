export const REGIONS = {
  "South Asia": [
    "Afghanistan", "BAN", "Bangladesh", "Bhutan", "India", "Maldives", "Nepal", "Pakistan", "Sri Lanka"
  ],
  "Middle East": [
    "Bahrain", "Iran", "Israel", "Kuwait", "Oman", "Qatar", "Saudi Arabia", "United Arab Emirates"
  ],
  "Europe": [
    "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czech Republic", "Denmark", "England",
    "Estonia", "Finland", "France", "Germany", "Gibraltar", "Greece", "Guernsey", "Hungary", "Iceland",
    "Ireland", "Isle of Man", "Italy", "Jersey", "Luxembourg", "Malta", "Netherlands", "Norway",
    "Portugal", "Romania", "Scotland", "Serbia", "Slovenia", "Spain", "Sweden", "Switzerland", "Turkey"
  ],
  "Oceania": [
    "Australia", "Cook Islands", "Fiji", "Indonesia", "New Zealand", "Papua New Guinea", "Samoa", "Vanuatu"
  ],
  "Americas": [
    "Argentina", "Bahamas", "Belize", "Bermuda", "Brazil", "Canada", "Cayman Islands", "Chile",
    "Colombia", "Costa Rica", "Falkland Islands", "Mexico", "Panama", "Peru", "St Helena", "Suriname",
    "Turks and Caicos Island", "Turks and Caicos Islands", "United States of America", "West Indies"
  ],
  "Africa": [
    "Botswana", "Cameroon", "East and Central Africa", "Eswatini", "Gambia", "Ghana", "Ivory Coast",
    "Kenya", "Lesotho", "Malawi", "Mali", "Mozambique", "Namibia", "Nigeria", "Rwanda", "Seychelles",
    "Sierra Leone", "South Africa", "Tanzania", "Uganda", "Zambia", "Zimbabwe"
  ],
  "Asia": [
    "Cambodia", "China", "Hong Kong", "Japan", "Malaysia", "Mongolia", "Myanmar", "Philippines",
    "Singapore", "South Korea", "Thailand", "Timor-Leste"
  ]
};

export const ROLE_GROUPS = {
  "Top order batter": "Batter",
  "Middle order batter": "Batter",
  "Wicketkeeper batter": "Batter",
  "Batting allrounder": "Allrounder",
  "Bowling allrounder": "Allrounder",
  "Allrounder": "Allrounder",
  "Spin bowler": "Bowler",
  "Fast bowler": "Bowler"
};

export const ANSWER_MIN_MATCHES = 20;
export const NON_INDIA_MIN_INTL_MATCHES = 80;
export const NON_INDIA_MIN_IPL_MATCHES = 25;
export const SENIOR_PLAYER_AGE = 45;
export const SENIOR_MIN_INTL_RUNS = 5000;
export const SENIOR_MIN_INTL_WICKETS = 200;

export const REQUIRED_ANSWER_FIELDS = [
  "id",
  "name",
  "country",
  "currentIplTeam",
  "age",
  "retired",
  "battingHand",
  "bowlingHand",
  "role",
  "matches",
  "iplMatches"
];

export function isKnownAnswerValue(value) {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized !== "" && normalized !== "unknown";
  }
  return true;
}

export function hasKnownAnswerFields(player) {
  return REQUIRED_ANSWER_FIELDS.every((field) => isKnownAnswerValue(player?.[field]));
}

export function hasEnoughSeniorPerformance(player) {
  if (Number(player?.age) <= SENIOR_PLAYER_AGE) {
    return true;
  }

  return (
    Number(player?.intlRuns) > SENIOR_MIN_INTL_RUNS
    || Number(player?.intlWickets) > SENIOR_MIN_INTL_WICKETS
  );
}

export function hasEnoughInternationalExperience(player, minMatches = ANSWER_MIN_MATCHES) {
  return Number(player?.matches) > minMatches;
}

export function hasEnoughIplExperience(player, minMatches = ANSWER_MIN_MATCHES) {
  return Number(player?.iplMatches) > minMatches;
}

export function isCurrentIplSquadPlayer(player) {
  return Boolean(
    player?.currentIplTeam
    && player.currentIplTeam !== "None"
    && player.currentIplTeam !== "Unknown"
  );
}

export function hasEnoughAnswerExperience(player, minMatches = ANSWER_MIN_MATCHES) {
  if (player?.country !== "India") {
    return (
      Number(player?.matches) > NON_INDIA_MIN_INTL_MATCHES
      || Number(player?.iplMatches) > NON_INDIA_MIN_IPL_MATCHES
      || isCurrentIplSquadPlayer(player)
    );
  }

  return (
    hasEnoughInternationalExperience(player, minMatches)
    || hasEnoughIplExperience(player, minMatches)
  );
}

export function isEligibleAnswer(player, minMatches = ANSWER_MIN_MATCHES) {
  return (
    hasEnoughSeniorPerformance(player)
    && hasEnoughAnswerExperience(player, minMatches)
    && hasKnownAnswerFields(player)
  );
}

export function getAnswerPool(players, minMatches = ANSWER_MIN_MATCHES) {
  return players.filter((player) => isEligibleAnswer(player, minMatches));
}

export function getGuessPool(players) {
  return players;
}

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

  // Current IPL squad is green; yellow means the answer has past history with the guessed current team.
  if (guess.currentIplTeam === target.currentIplTeam) {
    result.iplTeam = "green";
  } else {
    const guessedCurrentTeam = guess.currentIplTeam;
    const targetPastTeams = target.pastIplTeams || [];
    if (
      guessedCurrentTeam
      && guessedCurrentTeam !== "None"
      && guessedCurrentTeam !== "Unknown"
      && targetPastTeams.includes(guessedCurrentTeam)
    ) {
      result.iplTeam = "yellow";
    } else {
      result.iplTeam = "white";
    }
  }

  // Age
  if (!Number.isFinite(Number(guess.age)) || !Number.isFinite(Number(target.age))) {
    result.age = { color: "white", arrow: null };
  } else if (guess.age === target.age) {
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

  // Bowling Hand
  result.bowlingHand = guess.bowlingHand === target.bowlingHand ? "green" : "white";

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

  result.matches = compareMatchCount(guess.matches, target.matches);
  result.iplMatches = compareMatchCount(guess.iplMatches, target.iplMatches);

  return result;
}

export function compareMatchCount(guessValue, targetValue) {
  const guessMatches = Number(guessValue);
  const targetMatches = Number(targetValue);
  if (!Number.isFinite(guessMatches) || !Number.isFinite(targetMatches)) {
    return { color: "white", arrow: null };
  }
  if (guessMatches === targetMatches) {
    return { color: "green", arrow: null };
  }
  return {
    color: Math.abs(guessMatches - targetMatches) <= 20 ? "yellow" : "white",
    arrow: guessMatches < targetMatches ? "up" : "down"
  };
}

export function seededIndex(seed, length) {
  if (length <= 0) {
    throw new Error("Cannot pick a player from an empty pool");
  }

  let hash = 0;
  const normalizedSeed = String(seed);
  for (let i = 0; i < normalizedSeed.length; i++) {
    hash = ((hash * 31) + normalizedSeed.charCodeAt(i)) >>> 0;
  }
  return hash % length;
}

export function getDailyPlayer(players, dateString) {
  const answerPool = getAnswerPool(players);
  return answerPool[seededIndex(dateString, answerPool.length)];
}

function greatestCommonDivisor(a, b) {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right !== 0) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left;
}

export function createTestRounds(players, roundCount, options = {}) {
  const answerPool = getAnswerPool(players, options.minMatches ?? ANSWER_MIN_MATCHES);
  const totalRounds = Math.min(Math.max(0, roundCount), answerPool.length);
  if (totalRounds === 0) {
    return [];
  }

  const seedPrefix = options.seedPrefix ?? "test-round";
  const startIndex = seededIndex(seedPrefix, answerPool.length);
  let step = seededIndex(`${seedPrefix}:step`, Math.max(1, answerPool.length - 1)) + 1;
  while (greatestCommonDivisor(step, answerPool.length) !== 1) {
    step = (step % answerPool.length) + 1;
  }

  return Array.from({ length: totalRounds }, (_, index) => {
    const answer = answerPool[(startIndex + (index * step)) % answerPool.length];
    return {
      roundNumber: index + 1,
      seed: `${seedPrefix}:${index + 1}`,
      answer
    };
  });
}
