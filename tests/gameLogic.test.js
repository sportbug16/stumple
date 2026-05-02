import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ANSWER_MIN_MATCHES,
  compareAttributes,
  createTestRounds,
  getAnswerPool,
  getDailyPlayer,
  getGuessPool,
  isEligibleAnswer
} from "../src/utils/gameLogic.js";

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
    role: "Top order batter",
    matches: ANSWER_MIN_MATCHES + 1,
    iplMatches: 0,
    ...overrides
  };
}

test("answer eligibility requires more than 20 international or IPL matches", () => {
  assert.equal(isEligibleAnswer(player({ matches: ANSWER_MIN_MATCHES, iplMatches: 0 })), false);
  assert.equal(isEligibleAnswer(player({ matches: ANSWER_MIN_MATCHES + 1, iplMatches: 0 })), true);
  assert.equal(isEligibleAnswer(player({ matches: 0, iplMatches: ANSWER_MIN_MATCHES + 1 })), true);
});

test("unknown or missing answer fields disqualify answers", () => {
  assert.equal(isEligibleAnswer(player({ country: "Unknown" })), false);
  assert.equal(isEligibleAnswer(player({ battingHand: "Unknown" })), false);
  assert.equal(isEligibleAnswer(player({ role: "Unknown" })), false);
  assert.equal(isEligibleAnswer(player({ age: undefined })), false);
  assert.equal(isEligibleAnswer(player({ currentIplTeam: "None" })), true);
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
  assert.equal(
    compareAttributes(player({ iplMatches: 75 }), player({ iplMatches: 75 })).iplMatches,
    "green"
  );
  assert.equal(
    compareAttributes(player({ iplMatches: 61 }), player({ iplMatches: 75 })).iplMatches,
    "yellow"
  );
  assert.equal(
    compareAttributes(player({ iplMatches: 20 }), player({ iplMatches: 75 })).iplMatches,
    "white"
  );
});

test("real player data has a usable answer pool and keeps ineligible players guessable", () => {
  const answerPool = getAnswerPool(playersData);
  const guessPool = getGuessPool(playersData);
  const ineligiblePlayers = guessPool.filter((candidate) => !isEligibleAnswer(candidate));

  assert.ok(answerPool.length > 1000, `expected a broad answer pool, got ${answerPool.length}`);
  assert.ok(ineligiblePlayers.length > 0, "expected low-information players to remain guessable");
  assert.equal(guessPool.length, playersData.length);

  for (const candidate of answerPool) {
    assert.equal(isEligibleAnswer(candidate), true, candidate.name);
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
