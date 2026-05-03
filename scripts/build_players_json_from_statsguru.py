#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import dataclass
from pathlib import Path


DEFAULT_IMAGE = "https://a.espncdn.com/i/headshots/cricket/players/default-player-logo-500.png"
DEFAULT_CURRENT_IPL_SQUADS = Path("data/reference/current_ipl_squads_2026.csv")

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

ACTIVE_IPL_TEAMS = {
    "CSK",
    "DC",
    "GT",
    "KKR",
    "LSG",
    "MI",
    "PBKS",
    "RCB",
    "RR",
    "SRH",
}


@dataclass(frozen=True)
class SquadEntry:
    team: str
    player_name: str
    player_id: str | None
    keys: tuple[str, ...]


@dataclass(frozen=True)
class CurrentIplSquads:
    entries: tuple[SquadEntry, ...]
    by_player_id: dict[str, int]
    by_name_key: dict[str, int]


def normalise_batting_hand(value: str) -> str:
    value_lower = value.lower()
    if "left" in value_lower:
        return "Left"
    if "right" in value_lower:
        return "Right"
    return "Unknown"


def normalise_retired(value: str) -> str:
    value_lower = value.lower()
    if value_lower == "yes":
        return "Yes"
    if value_lower == "no":
        return "No"
    return "Unknown"


def parse_optional_int(value: str | None) -> int | None:
    if not value:
        return None
    return int(value)


def parse_count(value: str | None) -> int:
    return int(value) if value else 0


def parse_birth_year(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"(\d{4})", value)
    return int(match.group(1)) if match else None


def team_abbreviation(team_name: str | None) -> str:
    if not team_name:
        return "None"
    return IPL_TEAM_ABBREVIATIONS.get(team_name, team_name)


def unique_teams(teams: list[str]) -> list[str]:
    unique = []
    for team in teams:
        if team not in unique:
            unique.append(team)
    return unique


def player_display_name(row: dict[str, str]) -> str:
    return row.get("display_name") or row.get("full_name") or row["player_name"]


def normalise_player_name_key(value: str | None) -> str:
    value = (value or "").lower()
    value = re.sub(r"\b(mohd|mohammad|mohammed)\b", "mohammed", value)
    return re.sub(r"[^a-z0-9]", "", value)


def csv_list(value: str | None) -> list[str]:
    return [item.strip() for item in (value or "").split(";") if item.strip()]


def add_unique_mapping(mapping: dict[str, int], key: str, entry_index: int, label: str) -> None:
    if not key:
        return
    existing = mapping.get(key)
    if existing is not None and existing != entry_index:
        raise ValueError(f"duplicate current IPL squad {label}: {key}")
    mapping[key] = entry_index


def load_current_ipl_squads(path: Path | None) -> CurrentIplSquads:
    if path is None:
        return CurrentIplSquads(entries=(), by_player_id={}, by_name_key={})
    if not path.exists():
        print(f"warning: current IPL squad file not found at {path}; setting all current teams to None")
        return CurrentIplSquads(entries=(), by_player_id={}, by_name_key={})

    entries: list[SquadEntry] = []
    by_player_id: dict[str, int] = {}
    by_name_key: dict[str, int] = {}

    with path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            team = (row.get("team") or "").strip().upper()
            if team not in ACTIVE_IPL_TEAMS:
                raise ValueError(f"invalid active IPL team in {path}: {team}")

            player_name = (row.get("player_name") or "").strip()
            if not player_name:
                raise ValueError(f"missing player_name in {path}")

            player_id = (row.get("player_id") or "").strip() or None
            names = [player_name, *csv_list(row.get("aliases"))]
            keys = tuple(unique_teams([normalise_player_name_key(name) for name in names]))
            entry = SquadEntry(team=team, player_name=player_name, player_id=player_id, keys=keys)
            entry_index = len(entries)
            entries.append(entry)

            if player_id:
                add_unique_mapping(by_player_id, player_id, entry_index, "player_id")
            else:
                for key in keys:
                    add_unique_mapping(by_name_key, key, entry_index, "name")

    return CurrentIplSquads(
        entries=tuple(entries),
        by_player_id=by_player_id,
        by_name_key=by_name_key,
    )


def resolve_current_ipl_team(
    row: dict[str, str],
    current_ipl_squads: CurrentIplSquads,
) -> tuple[str, int | None]:
    player_id = row.get("player_id") or ""
    entry_index = current_ipl_squads.by_player_id.get(player_id)

    if entry_index is None:
        name_key = normalise_player_name_key(player_display_name(row))
        entry_index = current_ipl_squads.by_name_key.get(name_key)

    if entry_index is None:
        return "None", None

    return current_ipl_squads.entries[entry_index].team, entry_index


def build_player(
    row: dict[str, str],
    current_ipl_squads: CurrentIplSquads,
) -> tuple[dict[str, object], int | None]:
    current_team, current_squad_entry_index = resolve_current_ipl_team(row, current_ipl_squads)
    all_teams = [
        team_abbreviation(team.strip())
        for team in (row.get("ipl_teams") or "").split(";")
        if team.strip()
    ]
    latest_team = team_abbreviation(row.get("ipl_team"))
    if latest_team != "None":
        all_teams.append(latest_team)
    past_teams = unique_teams([team for team in all_teams if team != current_team])

    return {
        "id": row["player_id"],
        "name": player_display_name(row),
        "country": row.get("country") or "Unknown",
        "currentIplTeam": current_team,
        "pastIplTeams": past_teams,
        "age": parse_optional_int(row.get("age")),
        "retired": normalise_retired(row.get("retired") or ""),
        "battingHand": normalise_batting_hand(row.get("batting_hand") or ""),
        "role": row.get("role") or "Unknown",
        "image": row.get("image") or DEFAULT_IMAGE,
        "matches": parse_count(row.get("matches")),
        "iplMatches": parse_count(row.get("ipl_matches")),
        "dateOfBirth": row.get("date_of_birth") or None,
        "birthYear": parse_birth_year(row.get("date_of_birth")),
        "careerSpan": row.get("career_span") or None,
        "sourceClassId": int(row["source_class_id"]) if row.get("source_class_id") else None,
    }, current_squad_entry_index


def has_required_game_fields(row: dict[str, str]) -> bool:
    required = ("player_id",)
    if not all(row.get(field) for field in required):
        return False
    try:
        return int(row.get("matches") or 0) > 0 or int(row.get("ipl_matches") or 0) > 0
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
    parser.add_argument(
        "--current-ipl-squads",
        type=Path,
        default=DEFAULT_CURRENT_IPL_SQUADS,
        help=f"Current IPL squad CSV used to assign currentIplTeam. Default: {DEFAULT_CURRENT_IPL_SQUADS}",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    with args.input.open(encoding="utf-8", newline="") as handle:
        rows = [row for row in csv.DictReader(handle) if has_required_game_fields(row)]

    current_ipl_squads = load_current_ipl_squads(args.current_ipl_squads)
    players = []
    matched_current_squad_entries: set[int] = set()
    for row in rows:
        player, current_squad_entry_index = build_player(row, current_ipl_squads)
        players.append(player)
        if current_squad_entry_index is not None:
            matched_current_squad_entries.add(current_squad_entry_index)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(players, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(players)} players to {args.output}")
    if current_ipl_squads.entries:
        unmatched_entries = [
            entry
            for index, entry in enumerate(current_ipl_squads.entries)
            if index not in matched_current_squad_entries
        ]
        current_player_count = sum(player["currentIplTeam"] != "None" for player in players)
        print(
            "current IPL squads: "
            f"{len(current_ipl_squads.entries)} listed, "
            f"{len(matched_current_squad_entries)} matched to player database, "
            f"{len(unmatched_entries)} unmatched"
        )
        print(f"players with current IPL team: {current_player_count}")
        if unmatched_entries:
            unmatched = ", ".join(f"{entry.player_name} ({entry.team})" for entry in unmatched_entries)
            print(f"unmatched current IPL squad rows: {unmatched}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
