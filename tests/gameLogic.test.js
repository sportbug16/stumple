import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ANSWER_MIN_MATCHES,
  NON_INDIA_MIN_INTL_MATCHES,
  NON_INDIA_MIN_IPL_MATCHES,
  SENIOR_MIN_INTL_RUNS,
  SENIOR_MIN_INTL_WICKETS,
  SENIOR_PLAYER_AGE,
  compareAttributes,
  createTestRounds,
  getAnswerPool,
  getDailyPlayer,
  getGuessPool,
  getRegion,
  isEligibleAnswer
} from "../src/utils/gameLogic.js";

const ACTIVE_IPL_TEAMS = new Set(["CSK", "DC", "GT", "KKR", "LSG", "MI", "PBKS", "RCB", "RR", "SRH"]);

const __dirname = dirname(fileURLToPath(import.meta.url));
const playersData = JSON.parse(
  await readFile(resolve(__dirname, "../src/data/players.json"), "utf-8")
);

function player(overrides = {}) {
  return {
    id: "eligible",
    name: "Eligible Player",
    country: "India",
    currentIplTeam: "None",
    pastIplTeams: [],
    age: 30,
    retired: "No",
    battingHand: "Right",
    bowlingHand: "Right",
    role: "Top order batter",
    matches: ANSWER_MIN_MATCHES + 1,
    iplMatches: 0,
    birthYear: 1996,
    intlRuns: 0,
    intlWickets: 0,
    ...overrides
  };
}

test("Indian answer eligibility keeps the more than 20 international or IPL match rule", () => {
  assert.equal(isEligibleAnswer(player({ matches: ANSWER_MIN_MATCHES, iplMatches: 0 })), false);
  assert.equal(isEligibleAnswer(player({ matches: ANSWER_MIN_MATCHES + 1, iplMatches: 0 })), true);
  assert.equal(isEligibleAnswer(player({ matches: 0, iplMatches: ANSWER_MIN_MATCHES + 1 })), true);
});

test("non-Indian answer eligibility uses higher match thresholds or current IPL squad status", () => {
  assert.equal(isEligibleAnswer(player({
    country: "Australia",
    matches: NON_INDIA_MIN_INTL_MATCHES,
    iplMatches: 0,
    currentIplTeam: "None"
  })), false);
  assert.equal(isEligibleAnswer(player({
    country: "Australia",
    matches: NON_INDIA_MIN_INTL_MATCHES + 1,
    iplMatches: 0,
    currentIplTeam: "None"
  })), true);
  assert.equal(isEligibleAnswer(player({
    country: "Australia",
    matches: 0,
    iplMatches: NON_INDIA_MIN_IPL_MATCHES + 1,
    currentIplTeam: "None"
  })), true);
  assert.equal(isEligibleAnswer(player({
    country: "Australia",
    matches: 0,
    iplMatches: 0,
    currentIplTeam: "MI"
  })), true);
});

test("unknown or missing answer fields disqualify answers", () => {
  assert.equal(isEligibleAnswer(player({ country: "Unknown" })), false);
  assert.equal(isEligibleAnswer(player({ battingHand: "Unknown" })), false);
  assert.equal(isEligibleAnswer(player({ bowlingHand: "Unknown" })), false);
  assert.equal(isEligibleAnswer(player({ role: "Unknown" })), false);
  assert.equal(isEligibleAnswer(player({ age: undefined })), false);
  assert.equal(isEligibleAnswer(player({ currentIplTeam: "None" })), true);
});

test("senior answer eligibility requires substantial international runs or wickets", () => {
  assert.equal(isEligibleAnswer(player({
    age: SENIOR_PLAYER_AGE + 1,
    intlRuns: SENIOR_MIN_INTL_RUNS,
    intlWickets: SENIOR_MIN_INTL_WICKETS
  })), false);
  assert.equal(isEligibleAnswer(player({
    age: SENIOR_PLAYER_AGE + 1,
    intlRuns: SENIOR_MIN_INTL_RUNS + 1,
    intlWickets: 0
  })), true);
  assert.equal(isEligibleAnswer(player({
    age: SENIOR_PLAYER_AGE + 1,
    intlRuns: 0,
    intlWickets: SENIOR_MIN_INTL_WICKETS + 1
  })), true);
  assert.equal(isEligibleAnswer(player({
    age: SENIOR_PLAYER_AGE,
    intlRuns: 0,
    intlWickets: 0
  })), true);
});

test("ineligible players remain available as guesses", () => {
  const lowMatchPlayer = player({ id: "low", matches: 5, iplMatches: 4 });
  const unknownRolePlayer = player({ id: "unknown-role", role: "Unknown" });
  const iplOnlyAnswer = player({ id: "ipl-only", matches: 0, iplMatches: 55 });
  const eligiblePlayer = player({ id: "answer" });
  const players = [lowMatchPlayer, unknownRolePlayer, iplOnlyAnswer, eligiblePlayer];

  assert.deepEqual(getAnswerPool(players).map((candidate) => candidate.id), ["ipl-only", "answer"]);
  assert.deepEqual(getGuessPool(players).map((candidate) => candidate.id), [
    "low",
    "unknown-role",
    "ipl-only",
    "answer"
  ]);
});

test("daily answers are selected only from the eligible answer pool", () => {
  const players = [
    player({ id: "low", matches: 1, iplMatches: 1 }),
    player({ id: "unknown", country: "Unknown" }),
    player({ id: "ipl-answer", name: "IPL Answer", matches: 0, iplMatches: 80 }),
    player({ id: "answer-a", name: "Answer A" }),
    player({ id: "answer-b", name: "Answer B", matches: 120 })
  ];

  for (let day = 1; day <= 60; day++) {
    const answer = getDailyPlayer(players, `2026-01-${String(day).padStart(2, "0")}`);
    assert.equal(isEligibleAnswer(answer), true);
  }
});

test("IPL match count uses match-count color logic", () => {
  assert.deepEqual(
    compareAttributes(player({ iplMatches: 75 }), player({ iplMatches: 75 })).iplMatches,
    { color: "green", arrow: null }
  );
  assert.deepEqual(
    compareAttributes(player({ iplMatches: 61 }), player({ iplMatches: 75 })).iplMatches,
    { color: "yellow", arrow: "up" }
  );
  assert.deepEqual(
    compareAttributes(player({ iplMatches: 20 }), player({ iplMatches: 75 })).iplMatches,
    { color: "white", arrow: "up" }
  );
  assert.deepEqual(
    compareAttributes(player({ iplMatches: 95 }), player({ iplMatches: 75 })).iplMatches,
    { color: "yellow", arrow: "down" }
  );
  assert.deepEqual(
    compareAttributes(player({ matches: 140 }), player({ matches: 75 })).matches,
    { color: "white", arrow: "down" }
  );
});

test("batting and bowling hand use exact match color logic", () => {
  const target = player({ battingHand: "Right", bowlingHand: "Left" });

  assert.equal(compareAttributes(player({ battingHand: "Right" }), target).battingHand, "green");
  assert.equal(compareAttributes(player({ battingHand: "Left" }), target).battingHand, "white");
  assert.equal(compareAttributes(player({ bowlingHand: "Left" }), target).bowlingHand, "green");
  assert.equal(compareAttributes(player({ bowlingHand: "Right" }), target).bowlingHand, "white");
});

test("IPL team color compares current team first and answer past teams second", () => {
  assert.equal(
    compareAttributes(
      player({ currentIplTeam: "None", pastIplTeams: [] }),
      player({ currentIplTeam: "None", pastIplTeams: ["MI"] })
    ).iplTeam,
    "green"
  );
  assert.equal(
    compareAttributes(
      player({ currentIplTeam: "MI", pastIplTeams: [] }),
      player({ currentIplTeam: "MI", pastIplTeams: [] })
    ).iplTeam,
    "green"
  );
  assert.equal(
    compareAttributes(
      player({ currentIplTeam: "MI", pastIplTeams: [] }),
      player({ currentIplTeam: "CSK", pastIplTeams: ["MI"] })
    ).iplTeam,
    "yellow"
  );
  assert.equal(
    compareAttributes(
      player({ currentIplTeam: "None", pastIplTeams: ["MI"] }),
      player({ currentIplTeam: "MI", pastIplTeams: [] })
    ).iplTeam,
    "white"
  );
});

test("country regions use full country names from player data", () => {
  assert.equal(getRegion("Zimbabwe"), "Africa");
  assert.equal(getRegion("Netherlands"), "Europe");
  assert.equal(getRegion("United States of America"), "Americas");
  assert.equal(getRegion("United Arab Emirates"), "Middle East");
});

test("real player data has a usable answer pool and keeps ineligible players guessable", () => {
  const answerPool = getAnswerPool(playersData);
  const guessPool = getGuessPool(playersData);
  const ineligiblePlayers = guessPool.filter((candidate) => !isEligibleAnswer(candidate));

  assert.ok(answerPool.length > 500, `expected a broad answer pool, got ${answerPool.length}`);
  assert.ok(ineligiblePlayers.length > 0, "expected low-information players to remain guessable");
  assert.equal(guessPool.length, playersData.length);

  for (const candidate of answerPool) {
    assert.equal(isEligibleAnswer(candidate), true, candidate.name);
    if (candidate.age > SENIOR_PLAYER_AGE) {
      assert.ok(
        candidate.intlRuns > SENIOR_MIN_INTL_RUNS || candidate.intlWickets > SENIOR_MIN_INTL_WICKETS,
        `${candidate.name} should clear senior performance filter`
      );
    }
  }
});

test("real player data marks current IPL teams from the current squad source", () => {
  const sachin = playersData.find((candidate) => candidate.name === "Sachin Tendulkar");
  const dhoni = playersData.find((candidate) => candidate.name === "MS Dhoni");
  const virat = playersData.find((candidate) => candidate.name === "Virat Kohli");
  const jadeja = playersData.find((candidate) => candidate.name === "Ravindra Jadeja");
  const rashids = playersData.filter((candidate) => candidate.name === "Rashid Khan");
  const mohsins = playersData.filter((candidate) => candidate.name === "Mohsin Khan");

  assert.equal(sachin.currentIplTeam, "None");
  assert.deepEqual(sachin.pastIplTeams, ["MI"]);
  assert.equal(dhoni.currentIplTeam, "CSK");
  assert.equal(virat.currentIplTeam, "RCB");
  assert.equal(jadeja.currentIplTeam, "RR");
  assert.ok(jadeja.pastIplTeams.includes("CSK"));
  assert.equal(rashids.find((candidate) => candidate.country === "Afghanistan").currentIplTeam, "GT");
  assert.equal(rashids.find((candidate) => candidate.country === "Pakistan").currentIplTeam, "None");
  assert.equal(rashids.find((candidate) => candidate.country === "Nepal").currentIplTeam, "None");
  assert.equal(mohsins.find((candidate) => candidate.country === "India").currentIplTeam, "LSG");
  assert.equal(mohsins.find((candidate) => candidate.country === "Pakistan").currentIplTeam, "None");

  for (const candidate of playersData) {
    assert.ok(
      candidate.currentIplTeam === "None" || ACTIVE_IPL_TEAMS.has(candidate.currentIplTeam),
      `${candidate.name} has invalid current IPL team ${candidate.currentIplTeam}`
    );
  }
});

test("test rounds provide many unique eligible answers", () => {
  const rounds = createTestRounds(playersData, 250, { seedPrefix: "game-logic-test" });
  const answerIds = new Set(rounds.map((round) => round.answer.id));

  assert.equal(rounds.length, 250);
  assert.equal(answerIds.size, rounds.length);

  for (const round of rounds) {
    assert.equal(isEligibleAnswer(round.answer), true, round.answer.name);
  }
});
