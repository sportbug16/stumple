#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


STATSGURU_BASE = "https://stats.espncricinfo.com"
ATHLETE_API_BASE = "https://site.api.espn.com/apis/common/v3/sports/cricket/athletes"

DEFAULT_HEADERS = {
    "user-agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
    ),
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    "pragma": "no-cache",
}

# Statsguru currently exposes these IPL franchise names in the team selector.
IPL_TEAMS = {
    "Chennai Super Kings",
    "Deccan Chargers",
    "Delhi Capitals",
    "Gujarat Lions",
    "Gujarat Titans",
    "Kochi Tuskers Kerala",
    "Kolkata Knight Riders",
    "Lucknow Super Giants",
    "Mumbai Indians",
    "Punjab Kings",
    "Pune Warriors",
    "Rajasthan Royals",
    "Rising Pune Supergiant",
    "Royal Challengers Bengaluru",
    "Sunrisers Hyderabad",
}


@dataclass(frozen=True)
class BasePlayerRow:
    player_id: str
    short_name: str
    country_code: str | None
    span: str | None
    matches: int | None
    source_url: str


def format_duration(seconds: float) -> str:
    seconds = max(0, int(seconds))
    minutes, seconds = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}h{minutes:02d}m{seconds:02d}s"
    if minutes:
        return f"{minutes}m{seconds:02d}s"
    return f"{seconds}s"


def progress_text(
    label: str,
    completed: int,
    total: int | None,
    started_at: float,
    extra: str | None = None,
) -> str:
    elapsed = time.monotonic() - started_at
    parts = [f"[info] {label}: {completed}/{total if total is not None else '?'}"]
    if total:
        parts.append(f"{(completed / total) * 100:.1f}%")
    parts.append(f"elapsed {format_duration(elapsed)}")

    if completed and elapsed > 0:
        rate_per_minute = (completed / elapsed) * 60
        parts.append(f"{rate_per_minute:.1f}/min")
        if total and completed < total:
            eta_seconds = (total - completed) / (completed / elapsed)
            parts.append(f"eta {format_duration(eta_seconds)}")

    if extra:
        parts.append(extra)
    return "; ".join(parts)


def build_session() -> requests.Session:
    retry = Retry(
        total=5,
        connect=5,
        read=5,
        backoff_factor=1.0,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=20, pool_maxsize=20)

    session = requests.Session()
    session.headers.update(DEFAULT_HEADERS)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def normalise_space(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip()


def parse_int(value: str | None) -> int | None:
    if not value:
        return None
    digits = re.sub(r"[^\d]", "", value)
    return int(digits) if digits else None


def extract_player_id(href: str | None) -> str | None:
    if not href:
        return None
    match = re.search(r"/player/(\d+)\.html", href)
    return match.group(1) if match else None


def extract_country_code(cell_text: str, player_name: str) -> str | None:
    text = normalise_space(cell_text)
    if not text:
        return None
    stripped = text
    if stripped.startswith(player_name):
        stripped = stripped[len(player_name) :].strip()
    match = re.search(r"\(([^()]*)\)\s*$", stripped)
    return match.group(1).strip() if match else None


def parse_span_end_year(span: str | None) -> int | None:
    if not span:
        return None
    tail = normalise_space(span).split("-")[-1]
    if "/" not in tail:
        return parse_int(tail)

    left, right = tail.split("/", 1)
    left = left.strip()
    right = right.strip()
    left_year = parse_int(left)
    if left_year is None:
        return None
    if len(right) == 2:
        century = (left_year // 100) * 100
        return century + int(right)
    return parse_int(right)


def infer_retired(span_end_year: int | None, grace_years: int) -> str | None:
    if span_end_year is None:
        return None
    current_year = date.today().year
    return "yes" if span_end_year < (current_year - grace_years) else "no"


def bat_style_to_hand(athlete: dict[str, Any]) -> str | None:
    bat_styles = athlete.get("batStyle") or []
    if not bat_styles:
        return None
    first = bat_styles[0]
    return normalise_space(first.get("description"))


def athlete_display_name(athlete: dict[str, Any], fallback_name: str) -> str:
    return (
        normalise_space(athlete.get("shortName"))
        or normalise_space(athlete.get("displayName"))
        or normalise_space(athlete.get("fullName"))
        or fallback_name
    )


def athlete_country(athlete: dict[str, Any], fallback_country_code: str | None) -> str | None:
    country = normalise_space((athlete.get("team") or {}).get("displayName"))
    return country or fallback_country_code


def athlete_role(athlete: dict[str, Any]) -> str | None:
    position = normalise_space((athlete.get("position") or {}).get("name"))
    position_lower = position.lower()

    if not position:
        return None
    if "wicketkeeper" in position_lower:
        return "Wicketkeeper batter"
    if "top" in position_lower or "opening" in position_lower:
        return "Top order batter"
    if "middle" in position_lower:
        return "Middle order batter"
    if "batting" in position_lower and "all" in position_lower:
        return "Batting allrounder"
    if "bowling" in position_lower and "all" in position_lower:
        return "Bowling allrounder"
    if "all" in position_lower:
        return "Allrounder"
    if "bowler" in position_lower:
        bowl_styles = athlete.get("bowlStyle") or []
        descriptions = " ".join(
            normalise_space(style.get("description")).lower() for style in bowl_styles
        )
        is_spin = any(
            marker in descriptions
            for marker in ("spin", "break", "orthodox", "wrist", "chinaman", "googly")
        )
        return "Spin bowler" if is_spin else "Fast bowler"
    if "batter" in position_lower:
        return "Middle order batter"
    return position


def athlete_headshot_url(athlete: dict[str, Any]) -> str | None:
    return normalise_space((athlete.get("headshot") or {}).get("href")) or None


class StatsguruClient:
    def __init__(
        self,
        delay_seconds: float,
        cache_dir: Path,
        refresh_cache: bool,
        page_workers: int,
    ) -> None:
        self.delay_seconds = delay_seconds
        self.cache_dir = cache_dir
        self.refresh_cache = refresh_cache
        self.page_workers = max(1, page_workers)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._thread_local = threading.local()
        self._request_lock = threading.Lock()
        self._last_request_at = 0.0

    def _session(self) -> requests.Session:
        session = getattr(self._thread_local, "session", None)
        if session is None:
            session = build_session()
            self._thread_local.session = session
        return session

    def _throttle(self) -> None:
        with self._request_lock:
            elapsed = time.monotonic() - self._last_request_at
            sleep_for = self.delay_seconds - elapsed
            if sleep_for > 0:
                time.sleep(sleep_for)
            self._last_request_at = time.monotonic()

    def _cache_key(self, path: str, params: dict[str, Any]) -> str:
        payload = json.dumps(
            {
                "path": path,
                "params": sorted((str(key), str(value)) for key, value in params.items()),
            },
            separators=(",", ":"),
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _cache_paths(self, path: str, params: dict[str, Any]) -> tuple[Path, Path]:
        key = self._cache_key(path, params)
        return self.cache_dir / f"{key}.html", self.cache_dir / f"{key}.json"

    def _load_cache(self, path: str, params: dict[str, Any]) -> tuple[str, str] | None:
        if self.refresh_cache:
            return None

        html_path, meta_path = self._cache_paths(path, params)
        if not html_path.exists() or not meta_path.exists():
            return None

        try:
            metadata = json.loads(meta_path.read_text(encoding="utf-8"))
            return html_path.read_text(encoding="utf-8"), metadata["url"]
        except (OSError, KeyError, json.JSONDecodeError) as exc:
            print(f"[warn] ignoring unreadable Statsguru cache entry {html_path}: {exc}", file=sys.stderr)
            return None

    def _save_cache(self, path: str, params: dict[str, Any], html: str, response_url: str) -> None:
        html_path, meta_path = self._cache_paths(path, params)
        html_tmp_path = html_path.with_suffix(".html.tmp")
        meta_tmp_path = meta_path.with_suffix(".json.tmp")
        html_tmp_path.write_text(html, encoding="utf-8")
        meta_tmp_path.write_text(json.dumps({"url": response_url}), encoding="utf-8")
        html_tmp_path.replace(html_path)
        meta_tmp_path.replace(meta_path)

    def get_soup(self, path: str, params: dict[str, Any]) -> tuple[BeautifulSoup, str, bool]:
        cached = self._load_cache(path, params)
        if cached is not None:
            html, response_url = cached
            return BeautifulSoup(html, "lxml"), response_url, True

        self._throttle()
        response = self._session().get(urljoin(STATSGURU_BASE, path), params=params, timeout=45)
        response.raise_for_status()
        self._save_cache(path, params, response.text, response.url)
        return BeautifulSoup(response.text, "lxml"), response.url, False

    def _last_page_number(self, soup: BeautifulSoup, current_page: int) -> int | None:
        page_numbers = [current_page]
        for link in soup.select("a.PaginationLink[href]"):
            href = link.get("href") or ""
            match = re.search(r"(?:[?;])page=(\d+)", href)
            if match:
                page_numbers.append(int(match.group(1)))
        return max(page_numbers) if page_numbers else None

    def iter_result_pages(
        self,
        params: dict[str, Any],
        progress_label: str | None = None,
        parallel: bool = True,
    ) -> Iterator[tuple[int, int | None, BeautifulSoup, str]]:
        def page_params(page_number: int) -> dict[str, Any]:
            result = dict(params)
            result["template"] = "results"
            result["page"] = page_number
            return result

        def fetch_page(page_number: int) -> tuple[int, BeautifulSoup, str, bool]:
            soup, response_url, from_cache = self.get_soup(
                "/ci/engine/stats/index.html",
                page_params(page_number),
            )
            return page_number, soup, response_url, from_cache

        started_at = time.monotonic()
        completed_pages = 0
        cached_pages = 0
        network_pages = 0

        def log_page(page_number: int, page_total: int | None, from_cache: bool) -> None:
            nonlocal cached_pages, completed_pages, network_pages
            if not progress_label:
                return
            completed_pages += 1
            if from_cache:
                cached_pages += 1
            else:
                network_pages += 1
            source = "cached" if from_cache else "network"
            total_text = str(page_total) if page_total is not None else "?"
            print(
                progress_text(
                    f"{progress_label} pages",
                    completed_pages,
                    page_total,
                    started_at,
                    extra=(
                        f"last={source} page {page_number}/{total_text}; "
                        f"cached={cached_pages}; network={network_pages}"
                    ),
                ),
                file=sys.stderr,
                flush=True,
            )

        page, first_soup, first_response_url, first_from_cache = fetch_page(1)
        last_page = self._last_page_number(first_soup, page)
        log_page(page, last_page, first_from_cache)
        yield page, last_page, first_soup, first_response_url

        if last_page is None or last_page <= 1:
            return

        remaining_pages = range(2, last_page + 1)
        if not parallel or self.page_workers == 1:
            for page_number in remaining_pages:
                page, soup, response_url, from_cache = fetch_page(page_number)
                log_page(page, last_page, from_cache)
                yield page, last_page, soup, response_url
            return

        with ThreadPoolExecutor(max_workers=self.page_workers) as executor:
            future_by_page = {
                executor.submit(fetch_page, page_number): page_number for page_number in remaining_pages
            }
            result_by_page: dict[int, tuple[BeautifulSoup, str, bool]] = {}
            for future in as_completed(future_by_page):
                page_number, soup, response_url, from_cache = future.result()
                result_by_page[page_number] = (soup, response_url, from_cache)
                log_page(page_number, last_page, from_cache)

            for page_number in remaining_pages:
                soup, response_url, _ = result_by_page[page_number]
                yield page_number, last_page, soup, response_url

    def _find_player_table(self, soup: BeautifulSoup) -> BeautifulSoup | None:
        for table in soup.select("table.engineTable"):
            headers = [
                normalise_space(header.get_text(" ", strip=True))
                for header in table.select("thead th")
            ]
            if "Span" in headers and "Mat" in headers:
                return table
        return None

    def _table_headers(self, table: BeautifulSoup) -> list[str]:
        headers: list[str] = []
        for index, header in enumerate(table.select("thead th")):
            text = normalise_space(header.get_text(" ", strip=True))
            if not text and index == 0:
                text = "Player"
            elif not text:
                text = f"column_{index}"
            headers.append(text)
        return headers

    def parse_player_rows(self, soup: BeautifulSoup, response_url: str) -> list[BasePlayerRow]:
        table = self._find_player_table(soup)
        if table is None:
            return []

        headers = self._table_headers(table)
        rows: list[BasePlayerRow] = []

        for tr in table.select("tbody tr.data1, tbody tr.data2"):
            cells = tr.find_all("td", recursive=False)
            if not cells:
                continue

            row_values = {
                headers[index]: normalise_space(cells[index].get_text(" ", strip=True))
                for index in range(min(len(headers), len(cells)))
            }
            link = cells[0].find("a", href=re.compile(r"/ci/content/player/\d+\.html"))
            player_id = extract_player_id(link.get("href") if link else None)
            if not player_id or link is None:
                continue

            short_name = normalise_space(link.get_text())
            country_code = extract_country_code(cells[0].get_text(" ", strip=True), short_name)
            rows.append(
                BasePlayerRow(
                    player_id=player_id,
                    short_name=short_name,
                    country_code=country_code,
                    span=row_values.get("Span"),
                    matches=parse_int(row_values.get("Mat")),
                    source_url=response_url,
                )
            )
        return rows

    def collect_base_players(
        self,
        class_id: int,
        stats_type: str,
        max_players: int | None,
    ) -> list[BasePlayerRow]:
        params = {"class": class_id, "type": stats_type}
        players_by_id: dict[str, BasePlayerRow] = {}
        started_at = time.monotonic()
        parsed_pages = 0
        parsed_rows = 0

        for page, last_page, soup, response_url in self.iter_result_pages(
            params,
            progress_label="base player list",
            parallel=max_players is None,
        ):
            page_rows = self.parse_player_rows(soup, response_url)
            parsed_pages += 1
            parsed_rows += len(page_rows)
            for row in page_rows:
                players_by_id.setdefault(row.player_id, row)
                if max_players and len(players_by_id) >= max_players:
                    print(
                        progress_text(
                            "base player list parsed",
                            parsed_pages,
                            last_page,
                            started_at,
                            extra=(
                                f"reached max_players={max_players}; page={page}; "
                                f"rows={parsed_rows}; unique={len(players_by_id)}"
                            ),
                        ),
                        file=sys.stderr,
                        flush=True,
                    )
                    return list(players_by_id.values())
            print(
                progress_text(
                    "base player list parsed",
                    parsed_pages,
                    last_page,
                    started_at,
                    extra=(
                        f"last_page={page}; page_rows={len(page_rows)}; "
                        f"rows={parsed_rows}; unique={len(players_by_id)}"
                    ),
                ),
                file=sys.stderr,
                flush=True,
            )

        return list(players_by_id.values())

    def discover_ipl_team_ids(self) -> dict[str, str]:
        soup, _, _ = self.get_soup("/ci/engine/stats/index.html", {"class": 6, "type": "allround"})
        team_ids: dict[str, str] = {}
        for option in soup.select("option[value]"):
            team_name = normalise_space(option.get_text())
            if team_name in IPL_TEAMS:
                team_ids[team_name] = option.get("value", "")
        return team_ids

    def collect_ipl_team_players(
        self,
        team_index: int,
        team_total: int,
        team_name: str,
        team_id: str,
    ) -> dict[str, dict[str, Any]]:
        team_players: dict[str, dict[str, Any]] = {}
        params = {"class": 6, "type": "allround", "team": team_id}
        progress_label = f"IPL mapping {team_index}/{team_total}: {team_name}"
        started_at = time.monotonic()
        parsed_pages = 0
        parsed_rows = 0
        for page, last_page, soup, response_url in self.iter_result_pages(
            params,
            progress_label=progress_label,
            parallel=False,
        ):
            page_rows = self.parse_player_rows(soup, response_url)
            parsed_pages += 1
            parsed_rows += len(page_rows)
            for row in page_rows:
                span_end_year = parse_span_end_year(row.span)
                entry = team_players.setdefault(
                    row.player_id,
                    {
                        "ipl_team_history": [],
                        "ipl_teams": [],
                    },
                )

                if team_name not in entry["ipl_teams"]:
                    entry["ipl_teams"].append(team_name)

                entry["ipl_team_history"].append(
                    {
                        "ipl_team": team_name,
                        "ipl_team_span": row.span,
                        "ipl_team_last_seen_year": span_end_year,
                        "ipl_team_source_url": response_url,
                    }
                )
                entry.update(
                    {
                        "ipl_team": team_name,
                        "ipl_team_span": row.span,
                        "ipl_team_last_seen_year": span_end_year,
                        "ipl_team_source_url": response_url,
                    }
                )

            print(
                progress_text(
                    f"{progress_label} parsed",
                    parsed_pages,
                    last_page,
                    started_at,
                    extra=(
                        f"last_page={page}; page_rows={len(page_rows)}; "
                        f"rows={parsed_rows}; team_players={len(team_players)}"
                    ),
                ),
                file=sys.stderr,
                flush=True,
            )
        return team_players

    def _merge_ipl_team_players(
        self,
        latest_team_by_player: dict[str, dict[str, Any]],
        team_players: dict[str, dict[str, Any]],
    ) -> None:
        for player_id, team_entry in team_players.items():
            entry = latest_team_by_player.setdefault(
                player_id,
                {
                    "ipl_team_history": [],
                    "ipl_teams": [],
                },
            )
            for team_name in team_entry["ipl_teams"]:
                if team_name not in entry["ipl_teams"]:
                    entry["ipl_teams"].append(team_name)

            entry["ipl_team_history"].extend(team_entry["ipl_team_history"])

            span_end_year = team_entry.get("ipl_team_last_seen_year")
            previous_year = entry.get("ipl_team_last_seen_year")
            should_replace = previous_year is None or (span_end_year or -1) > previous_year
            if should_replace:
                entry.update(
                    {
                        "ipl_team": team_entry.get("ipl_team"),
                        "ipl_team_span": team_entry.get("ipl_team_span"),
                        "ipl_team_last_seen_year": span_end_year,
                        "ipl_team_source_url": team_entry.get("ipl_team_source_url"),
                    }
                )

    def collect_latest_ipl_teams(self) -> dict[str, dict[str, Any]]:
        latest_team_by_player: dict[str, dict[str, Any]] = {}
        team_ids = self.discover_ipl_team_ids()
        if not team_ids:
            return latest_team_by_player

        sorted_team_ids = sorted(team_ids.items())
        started_at = time.monotonic()
        with ThreadPoolExecutor(max_workers=min(self.page_workers, len(sorted_team_ids))) as executor:
            future_by_index = {
                executor.submit(
                    self.collect_ipl_team_players,
                    team_index,
                    len(sorted_team_ids),
                    team_name,
                    team_id,
                ): team_index
                for team_index, (team_name, team_id) in enumerate(sorted_team_ids, start=1)
            }
            team_results: dict[int, dict[str, dict[str, Any]]] = {}
            completed_teams = 0
            for future in as_completed(future_by_index):
                team_index = future_by_index[future]
                team_results[team_index] = future.result()
                completed_teams += 1
                print(
                    progress_text(
                        "IPL mapping teams completed",
                        completed_teams,
                        len(sorted_team_ids),
                        started_at,
                        extra=f"last_team={sorted_team_ids[team_index - 1][0]}",
                    ),
                    file=sys.stderr,
                    flush=True,
                )

        for team_index in range(1, len(sorted_team_ids) + 1):
            self._merge_ipl_team_players(latest_team_by_player, team_results[team_index])
            print(
                f"[info] IPL mapping merged {team_index}/{len(sorted_team_ids)} teams; "
                f"{len(latest_team_by_player)} IPL players mapped",
                file=sys.stderr,
                flush=True,
            )
        return latest_team_by_player


class AthleteClient:
    def __init__(self, cache_dir: Path, refresh_cache: bool) -> None:
        self.cache_dir = cache_dir
        self.refresh_cache = refresh_cache
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._thread_local = threading.local()

    def _session(self) -> requests.Session:
        session = getattr(self._thread_local, "session", None)
        if session is None:
            session = build_session()
            self._thread_local.session = session
        return session

    def _cache_path(self, player_id: str) -> Path:
        return self.cache_dir / f"{player_id}.json"

    def _load_cache(self, player_id: str) -> dict[str, Any] | None:
        if self.refresh_cache:
            return None
        cache_path = self._cache_path(player_id)
        if not cache_path.exists():
            return None
        try:
            return json.loads(cache_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(
                f"[warn] ignoring unreadable athlete cache entry {cache_path}: {exc}",
                file=sys.stderr,
            )
            return None

    def _save_cache(self, player_id: str, payload: dict[str, Any]) -> None:
        cache_path = self._cache_path(player_id)
        tmp_path = cache_path.with_suffix(".tmp")
        tmp_path.write_text(json.dumps(payload), encoding="utf-8")
        tmp_path.replace(cache_path)

    def fetch_one(self, player_id: str) -> dict[str, Any]:
        cached = self._load_cache(player_id)
        if cached is not None:
            return cached

        response = self._session().get(f"{ATHLETE_API_BASE}/{player_id}", timeout=45)
        response.raise_for_status()
        payload = response.json().get("athlete") or {}
        self._save_cache(player_id, payload)
        return payload

    def fetch_many(self, player_ids: list[str], max_workers: int) -> dict[str, dict[str, Any]]:
        athletes: dict[str, dict[str, Any]] = {}
        missing_player_ids: list[str] = []
        for player_id in player_ids:
            cached = self._load_cache(player_id)
            if cached is None:
                missing_player_ids.append(player_id)
            else:
                athletes[player_id] = cached

        print(
            f"[info] athlete metadata cache hits: {len(athletes)}/{len(player_ids)}; "
            f"fetching {len(missing_player_ids)} missing",
            file=sys.stderr,
        )
        if not missing_player_ids:
            return athletes

        started_at = time.monotonic()
        failed_count = 0
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_by_id = {
                executor.submit(self.fetch_one, player_id): player_id
                for player_id in missing_player_ids
            }
            total = len(future_by_id)
            for completed_count, future in enumerate(as_completed(future_by_id), start=1):
                player_id = future_by_id[future]
                try:
                    athletes[player_id] = future.result()
                except Exception as exc:  # pragma: no cover - operational safeguard
                    print(f"[warn] athlete lookup failed for {player_id}: {exc}", file=sys.stderr)
                    athletes[player_id] = {}
                    failed_count += 1

                if completed_count == total or completed_count % 25 == 0:
                    print(
                        progress_text(
                            "athlete metadata fetched",
                            completed_count,
                            total,
                            started_at,
                            extra=f"failures={failed_count}",
                        ),
                        file=sys.stderr,
                        flush=True,
                    )
        return athletes


def load_existing_output_rows(output_path: Path, class_id: int) -> dict[str, dict[str, str]]:
    if not output_path.exists():
        return {}

    rows_by_id: dict[str, dict[str, str]] = {}
    with output_path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            if row.get("source_class_id") != str(class_id):
                continue
            player_id = row.get("player_id")
            if player_id:
                rows_by_id[player_id] = row
    return rows_by_id


def existing_row_has_enrichment(row: dict[str, str] | None) -> bool:
    if not row:
        return False
    return bool(
        row.get("age")
        and (row.get("display_name") or row.get("full_name") or row.get("player_name"))
    )


def base_players_from_existing_rows(
    existing_rows: dict[str, dict[str, str]],
    max_players: int | None,
) -> list[BasePlayerRow]:
    players: list[BasePlayerRow] = []
    for row in existing_rows.values():
        if max_players and len(players) >= max_players:
            break
        player_id = row.get("player_id")
        if not player_id:
            continue
        players.append(
            BasePlayerRow(
                player_id=player_id,
                short_name=normalise_space(row.get("player_name"))
                or normalise_space(row.get("display_name"))
                or player_id,
                country_code=normalise_space(row.get("country_code")) or None,
                span=normalise_space(row.get("career_span")) or None,
                matches=parse_int(row.get("matches")),
                source_url=normalise_space(row.get("statsguru_source_url")),
            )
        )
    return players


def ipl_meta_from_existing_row(row: dict[str, str] | None) -> dict[str, Any]:
    if not row:
        return {}
    ipl_teams = [
        normalise_space(team)
        for team in (row.get("ipl_teams") or "").split(";")
        if normalise_space(team)
    ]
    ipl_team = normalise_space(row.get("ipl_team")) or None
    if ipl_team and ipl_team not in ipl_teams:
        ipl_teams.insert(0, ipl_team)
    return {
        "ipl_team": ipl_team,
        "ipl_teams": ipl_teams,
        "ipl_team_last_seen_year": parse_int(row.get("ipl_team_last_seen_year")),
        "ipl_team_span": normalise_space(row.get("ipl_team_span")) or None,
        "ipl_team_source_url": normalise_space(row.get("ipl_team_source_url")) or None,
    }


def build_rows(
    base_players: list[BasePlayerRow],
    athletes: dict[str, dict[str, Any]],
    ipl_teams: dict[str, dict[str, Any]],
    existing_rows: dict[str, dict[str, str]],
    class_id: int,
    grace_years: int,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for player in base_players:
        athlete = athletes.get(player.player_id, {})
        existing = existing_rows.get(player.player_id, {})
        span_end_year = parse_span_end_year(player.span)
        ipl_meta = ipl_teams.get(player.player_id) or ipl_meta_from_existing_row(existing)
        existing_country = normalise_space(existing.get("country"))
        existing_country_code = normalise_space(existing.get("country_code"))
        existing_batting_hand = normalise_space(existing.get("batting_hand"))
        existing_role = normalise_space(existing.get("role"))
        existing_image = normalise_space(existing.get("image"))
        existing_date_of_birth = normalise_space(existing.get("date_of_birth"))

        rows.append(
            {
                "player_id": player.player_id,
                "player_name": player.short_name,
                "display_name": normalise_space(existing.get("display_name"))
                or athlete_display_name(athlete, player.short_name),
                "full_name": normalise_space(existing.get("full_name"))
                or normalise_space(athlete.get("fullName"))
                or player.short_name,
                "country": existing_country or athlete_country(athlete, player.country_code),
                "country_code": player.country_code or existing_country_code,
                "batting_hand": existing_batting_hand or bat_style_to_hand(athlete),
                "role": existing_role or athlete_role(athlete),
                "image": existing_image or athlete_headshot_url(athlete),
                "age": parse_int(existing.get("age")) or athlete.get("age"),
                "date_of_birth": existing_date_of_birth
                or normalise_space(athlete.get("displayDOB")),
                "matches": player.matches,
                "career_span": player.span,
                "career_span_end_year": span_end_year,
                "retired": infer_retired(span_end_year, grace_years),
                "retirement_rule": (
                    f"inferred_from_last_seen_year_with_{grace_years}_year_grace"
                    if span_end_year is not None
                    else None
                ),
                "ipl_team": ipl_meta.get("ipl_team"),
                "ipl_teams": ";".join(ipl_meta.get("ipl_teams", [])),
                "ipl_team_last_seen_year": ipl_meta.get("ipl_team_last_seen_year"),
                "ipl_team_span": ipl_meta.get("ipl_team_span"),
                "source_class_id": class_id,
                "statsguru_source_url": player.source_url,
                "ipl_team_source_url": ipl_meta.get("ipl_team_source_url"),
                "athlete_api_url": f"{ATHLETE_API_BASE}/{player.player_id}",
            }
        )
    return rows


def write_csv(output_path: Path, rows: list[dict[str, Any]]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "player_id",
        "player_name",
        "display_name",
        "full_name",
        "country",
        "country_code",
        "batting_hand",
        "role",
        "image",
        "age",
        "date_of_birth",
        "matches",
        "career_span",
        "career_span_end_year",
        "retired",
        "retirement_rule",
        "ipl_team",
        "ipl_teams",
        "ipl_team_last_seen_year",
        "ipl_team_span",
        "source_class_id",
        "statsguru_source_url",
        "ipl_team_source_url",
        "athlete_api_url",
    ]
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Scrape cricket player data from Statsguru result pages and ESPN's public athlete API "
            "without using the blocked player profile HTML pages."
        )
    )
    parser.add_argument(
        "--class-id",
        type=int,
        default=11,
        help=(
            "Statsguru class id used to define the player universe. "
            "Default: 11 (combined Tests + ODIs + T20Is)."
        ),
    )
    parser.add_argument(
        "--stats-type",
        default="allround",
        help="Statsguru result type used for the base player universe. Default: allround.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/raw/international_players.csv"),
        help="CSV output path. Default: data/raw/international_players.csv",
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path(".cache") / "espncricinfo" / "athletes",
        help="Directory for cached athlete JSON responses.",
    )
    parser.add_argument(
        "--statsguru-cache-dir",
        type=Path,
        default=Path(".cache") / "espncricinfo" / "statsguru",
        help="Directory for cached Statsguru HTML pages.",
    )
    parser.add_argument(
        "--max-players",
        type=int,
        default=None,
        help="Optional cap for quick test runs.",
    )
    parser.add_argument(
        "--max-workers",
        type=int,
        default=8,
        help="Concurrent workers used for athlete API lookups. Default: 8.",
    )
    parser.add_argument(
        "--page-workers",
        type=int,
        default=8,
        help="Concurrent workers used for Statsguru page fetches and IPL team mapping. Default: 8.",
    )
    parser.add_argument(
        "--request-delay-seconds",
        type=float,
        default=0.35,
        help="Minimum delay between Statsguru HTML requests. Default: 0.35 seconds.",
    )
    parser.add_argument(
        "--retirement-grace-years",
        type=int,
        default=1,
        help=(
            "Retirement is inferred as 'yes' if the player's last observed year is older than "
            "the current year minus this grace window. Default: 1."
        ),
    )
    parser.add_argument(
        "--skip-ipl",
        action="store_true",
        help="Skip IPL franchise enrichment.",
    )
    parser.add_argument(
        "--refresh-cache",
        action="store_true",
        help="Ignore cached Statsguru pages, cached athlete API responses, and existing output reuse.",
    )
    parser.add_argument(
        "--ignore-output-cache",
        action="store_true",
        help="Do not reuse enrichment/IPL fields from an existing output CSV.",
    )
    parser.add_argument(
        "--reuse-base-from-output",
        action="store_true",
        help=(
            "Use matching rows from the existing output CSV as the base player universe, "
            "skipping the Statsguru base crawl."
        ),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    run_started_at = time.monotonic()
    print(
        "[info] run configuration: "
        f"class_id={args.class_id}; output={args.output}; "
        f"page_workers={args.page_workers}; max_workers={args.max_workers}; "
        f"refresh_cache={args.refresh_cache}; reuse_base_from_output={args.reuse_base_from_output}",
        file=sys.stderr,
        flush=True,
    )

    existing_rows: dict[str, dict[str, str]] = {}
    if not args.refresh_cache and not args.ignore_output_cache:
        existing_rows = load_existing_output_rows(args.output, args.class_id)
        if existing_rows:
            print(
                f"[info] loaded {len(existing_rows)} reusable rows from existing output {args.output}",
                file=sys.stderr,
            )

    statsguru = StatsguruClient(
        delay_seconds=args.request_delay_seconds,
        cache_dir=args.statsguru_cache_dir,
        refresh_cache=args.refresh_cache,
        page_workers=args.page_workers,
    )
    athlete_client = AthleteClient(cache_dir=args.cache_dir, refresh_cache=args.refresh_cache)

    stage_started_at = time.monotonic()
    if args.reuse_base_from_output and existing_rows:
        print("[info] reusing base player list from existing output CSV", file=sys.stderr)
        base_players = base_players_from_existing_rows(existing_rows, args.max_players)
    else:
        if args.reuse_base_from_output:
            print("[warn] no matching existing output rows found; falling back to Statsguru", file=sys.stderr)
        print("[info] collecting base player list from Statsguru", file=sys.stderr)
        base_players = statsguru.collect_base_players(
            class_id=args.class_id,
            stats_type=args.stats_type,
            max_players=args.max_players,
        )
    if not base_players:
        print("[error] no players were found for the requested Statsguru query", file=sys.stderr)
        return 1
    print(
        f"[info] collected {len(base_players)} base players "
        f"in {format_duration(time.monotonic() - stage_started_at)}",
        file=sys.stderr,
        flush=True,
    )

    player_ids = [player.player_id for player in base_players]
    all_players_have_existing_output = bool(player_ids) and all(
        player_id in existing_rows for player_id in player_ids
    )

    ipl_teams: dict[str, dict[str, Any]] = {}
    stage_started_at = time.monotonic()
    if args.skip_ipl:
        print("[info] skipping IPL enrichment", file=sys.stderr)
    elif all_players_have_existing_output:
        print("[info] reusing IPL fields from existing output CSV", file=sys.stderr)
    else:
        print("[info] building latest IPL team mapping from Statsguru Twenty20 team pages", file=sys.stderr)
        ipl_teams = statsguru.collect_latest_ipl_teams()
        print(f"[info] collected IPL mappings for {len(ipl_teams)} players", file=sys.stderr)
    print(
        f"[info] IPL stage complete in {format_duration(time.monotonic() - stage_started_at)}",
        file=sys.stderr,
        flush=True,
    )

    stage_started_at = time.monotonic()
    reusable_output_ids = {
        player_id
        for player_id in player_ids
        if existing_row_has_enrichment(existing_rows.get(player_id))
    }
    if reusable_output_ids:
        print(
            f"[info] reusing athlete enrichment from existing output for "
            f"{len(reusable_output_ids)}/{len(player_ids)} players",
            file=sys.stderr,
        )
    missing_enrichment_ids = [
        player_id for player_id in player_ids if player_id not in reusable_output_ids
    ]
    athletes: dict[str, dict[str, Any]] = {}
    if missing_enrichment_ids:
        print("[info] fetching missing athlete metadata from ESPN public API", file=sys.stderr)
        athletes = athlete_client.fetch_many(
            player_ids=missing_enrichment_ids,
            max_workers=max(1, args.max_workers),
        )
    else:
        print("[info] all athlete enrichment was reused; no athlete API work needed", file=sys.stderr)
    print(
        f"[info] athlete enrichment stage complete in "
        f"{format_duration(time.monotonic() - stage_started_at)}",
        file=sys.stderr,
        flush=True,
    )

    stage_started_at = time.monotonic()
    rows = build_rows(
        base_players=base_players,
        athletes=athletes,
        ipl_teams=ipl_teams,
        existing_rows=existing_rows,
        class_id=args.class_id,
        grace_years=args.retirement_grace_years,
    )
    write_csv(args.output, rows)
    print(
        f"[info] wrote {len(rows)} rows to {args.output} "
        f"in {format_duration(time.monotonic() - stage_started_at)}; "
        f"total elapsed {format_duration(time.monotonic() - run_started_at)}",
        file=sys.stderr,
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
