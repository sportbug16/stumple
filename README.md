# Stumple

Stumple is a daily cricket-player guessing game built with React and Vite. The app selects a deterministic player for each date and lets users narrow the answer by comparing country, IPL team history, age, retirement status, batting hand, and role.

The runtime player database lives at `src/data/players.json`. It is generated from ESPNcricinfo Statsguru data with the scripts in `scripts/`.

## Project Layout

```text
src/                                  React app
src/data/players.json                 Game-ready player database
scripts/espncricinfo_statsguru_scraper.py
scripts/build_players_json_from_statsguru.py
data/raw/                             Raw scraper CSV outputs
.cache/espncricinfo/                  Cached Statsguru pages and ESPN athlete JSON
```

## App Commands

```bash
npm install
npm run dev
npm test
npm run build
```

## Game Answer Rules

Players can appear in search and guesses as long as they are present in `src/data/players.json`.
Daily answers are stricter:

- must have more than 20 international matches or more than 20 IPL matches
- must have known values for answer fields used by the game
- cannot have `Unknown`, blank, null, or missing values in those answer fields

`currentIplTeam: "None"` is treated as known information, so non-IPL players can still be answers if the rest of their answer fields are known.
IPL-only players can be answers when they clear the IPL match threshold and have known answer fields.

The test helper `createTestRounds` generates many deterministic rounds from the eligible answer pool, which lets tests exercise more than the single daily answer path.

## Python Setup

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

## Data Pipeline

Default scraper run for the combined international player universe:

```bash
.venv/bin/python scripts/espncricinfo_statsguru_scraper.py \
  --page-workers 12 \
  --max-workers 16
```

That writes `data/raw/international_players.csv` by default.

Rebuild the game JSON:

```bash
.venv/bin/python scripts/build_players_json_from_statsguru.py \
  data/raw/international_players.csv \
  --output src/data/players.json
```

Fast rebuild from an existing CSV, without crawling Statsguru again:

```bash
.venv/bin/python scripts/espncricinfo_statsguru_scraper.py \
  --reuse-base-from-output
```

Force a fully fresh scrape:

```bash
.venv/bin/python scripts/espncricinfo_statsguru_scraper.py \
  --refresh-cache
```

## Scraper Sources

The scraper avoids ESPNcricinfo profile HTML pages because they often return `403` to simple scraping. It uses:

1. Statsguru result pages on `stats.espncricinfo.com` for player universe, international match counts, career span, and IPL franchise history.
2. ESPN's public athlete JSON endpoint on `site.api.espn.com` for age, batting style, display name, role, and headshot image.

The default `--class-id 11` is the combined international universe: Tests, ODIs, and T20Is. The `matches` field is international matches only. IPL team pages are merged in to add `ipl_matches` and include IPL-only players.

## Scraper Output

The raw CSV includes one row per player with fields including:

- `player_id`
- `display_name`
- `country`
- `batting_hand`
- `role`
- `image`
- `age`
- `matches`
- `ipl_matches`
- `career_span`
- `retired`
- `ipl_team`
- `ipl_teams`
- source URLs

`ipl_team` is the most recent IPL franchise observed in Statsguru Twenty20 team pages. `ipl_teams` contains all observed IPL franchises for that player, separated by semicolons. `ipl_matches` is the summed match count across those IPL franchise rows. This is appearance history, not a current contract source.

## Caching And Parallelism

The scraper caches Statsguru HTML pages and ESPN athlete JSON responses under `.cache/espncricinfo`.

On repeat runs it:

- loads cached Statsguru pages unless `--refresh-cache` is used
- checks cached athlete JSON before submitting API work
- reuses matching rows from the existing output CSV
- fetches Statsguru result pages in parallel after page 1 reveals the total page count
- maps IPL teams in parallel across franchises

Long runs print progress continuously. You will see:

- run configuration and stage timings
- Statsguru page progress with completed pages, cached-vs-network counts, elapsed time, rate, and ETA
- parsed row progress with total rows and unique player counts
- IPL team mapping progress by team and merged player counts
- athlete metadata progress for missing API fetches with failure counts, rate, and ETA

Useful flags:

```bash
--page-workers 12          # parallel Statsguru page/IPL team workers
--max-workers 16           # parallel athlete API workers
--reuse-base-from-output   # skip the Statsguru base crawl and reuse existing output rows
--ignore-output-cache      # ignore reusable fields in the existing CSV
--refresh-cache            # ignore all scraper caches and existing output reuse
--skip-ipl                 # skip IPL franchise enrichment
```

## Other Scrapes

Broader all-T20 universe, including leagues:

```bash
.venv/bin/python scripts/espncricinfo_statsguru_scraper.py \
  --class-id 6 \
  --output data/raw/t20_players.csv
```

Quick smoke test:

```bash
.venv/bin/python scripts/espncricinfo_statsguru_scraper.py \
  --max-players 25 \
  --output data/raw/sample_players.csv
```

## Retirement Caveat

ESPN's public endpoints do not expose a reliable retirement flag for cricket players.

`retired` is inferred from the player's most recent year in the chosen Statsguru universe:

- default rule: `yes` if the last observed year is older than the current year minus 1
- configurable with `--retirement-grace-years`

Treat this field as a heuristic if you need official retirement status.
