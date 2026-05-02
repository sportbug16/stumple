#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


DEFAULT_IMAGE = "https://a.espncdn.com/i/headshots/cricket/players/default-player-logo-500.png"

IPL_TEAM_ABBREVIATIONS = {
    "Chennai Super Kings": "CSK",
    "Deccan Chargers": "DCG",
    "Delhi Capitals": "DC",
    "Gujarat Lions": "GL",
    "Gujarat Titans": "GT",
    "Kochi Tuskers Kerala": "KTK",
    "Kolkata Knight Riders": "KKR",
    "Lucknow Super Giants": "LSG",
    "Mumbai Indians": "MI",
    "Punjab Kings": "PBKS",
    "Pune Warriors": "PWI",
    "Rajasthan Royals": "RR",
    "Rising Pune Supergiant": "RPS",
    "Royal Challengers Bengaluru": "RCB",
    "Sunrisers Hyderabad": "SRH",
}


def normalise_batting_hand(value: str) -> str:
    value_lower = value.lower()
    if "left" in value_lower:
        return "Left"
    if "right" in value_lower:
        return "Right"
    return "Unknown"


def normalise_retired(value: str) -> str:
    return "Yes" if value.lower() == "yes" else "No"


def team_abbreviation(team_name: str | None) -> str:
    if not team_name:
        return "None"
    return IPL_TEAM_ABBREVIATIONS.get(team_name, team_name)


def build_player(row: dict[str, str]) -> dict[str, object]:
    current_team = team_abbreviation(row.get("ipl_team"))
    all_teams = [
        team_abbreviation(team.strip())
        for team in (row.get("ipl_teams") or "").split(";")
        if team.strip()
    ]
    past_teams = [team for team in all_teams if team != current_team]

    return {
        "id": row["player_id"],
        "name": row.get("display_name") or row.get("full_name") or row["player_name"],
        "country": row.get("country") or "Unknown",
        "currentIplTeam": current_team,
        "pastIplTeams": past_teams,
        "age": int(row["age"]),
        "retired": normalise_retired(row["retired"]),
        "battingHand": normalise_batting_hand(row["batting_hand"]),
        "role": row.get("role") or "Unknown",
        "image": row.get("image") or DEFAULT_IMAGE,
        "matches": int(row["matches"]) if row.get("matches") else None,
        "careerSpan": row.get("career_span") or None,
        "sourceClassId": int(row["source_class_id"]) if row.get("source_class_id") else None,
    }


def has_required_game_fields(row: dict[str, str]) -> bool:
    required = ("player_id", "age", "retired")
    if not all(row.get(field) for field in required):
        return False
    try:
        return int(row.get("matches") or 0) > 0
    except ValueError:
        return False


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert Statsguru scraper CSV to Stumple players.json")
    parser.add_argument(
        "input",
        type=Path,
        help="Input CSV from scripts/espncricinfo_statsguru_scraper.py",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("src/data/players.json"),
        help="Output JSON path. Default: src/data/players.json",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    with args.input.open(encoding="utf-8", newline="") as handle:
        rows = [row for row in csv.DictReader(handle) if has_required_game_fields(row)]

    players = [build_player(row) for row in rows]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(players, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(players)} players to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
