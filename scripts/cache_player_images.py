#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import mimetypes
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


DEFAULT_HEADERS = {
    "user-agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
    ),
    "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
}


@dataclass(frozen=True)
class DownloadResult:
    asset_id: str
    local_path: str | None
    reason: str | None = None


def extension_for_response(url: str, content_type: str | None) -> str:
    guessed = mimetypes.guess_extension((content_type or "").split(";", 1)[0].strip())
    if guessed in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        return ".jpg" if guessed == ".jpeg" else guessed

    suffix = Path(urlparse(url).path).suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        return ".jpg" if suffix == ".jpeg" else suffix
    return ".png"


def is_remote_image(value: str | None) -> bool:
    return bool(value and re.match(r"^https?://", value))


def download_player_image(
    asset_id: str,
    image_url: str,
    output_dir: Path,
    public_prefix: str,
    refresh: bool,
) -> DownloadResult:
    existing = next(output_dir.glob(f"{asset_id}.*"), None)
    if existing is not None and not refresh:
        return DownloadResult(asset_id=asset_id, local_path=f"{public_prefix}/{existing.name}")

    extension = extension_for_response(image_url, None)
    output_path = output_dir / f"{asset_id}{extension}"
    tmp_path = output_path.with_suffix(f"{extension}.tmp")
    result = subprocess.run(
        [
            "curl",
            "--fail",
            "--location",
            "--silent",
            "--show-error",
            "--max-time",
            "25",
            "--retry",
            "2",
            "--retry-delay",
            "1",
            "-A",
            DEFAULT_HEADERS["user-agent"],
            "-H",
            f"Accept: {DEFAULT_HEADERS['accept']}",
            "-o",
            str(tmp_path),
            image_url,
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        tmp_path.unlink(missing_ok=True)
        return DownloadResult(
            asset_id=asset_id,
            local_path=None,
            reason=result.stderr.strip() or f"curl exited {result.returncode}",
        )

    if not tmp_path.exists() or tmp_path.stat().st_size == 0:
        tmp_path.unlink(missing_ok=True)
        return DownloadResult(asset_id=asset_id, local_path=None, reason="empty download")

    tmp_path.replace(output_path)
    return DownloadResult(asset_id=asset_id, local_path=f"{public_prefix}/{output_path.name}")


def image_asset_id(player: dict[str, Any]) -> str:
    image_url = str(player.get("image") or "")
    if "default-player-logo" in image_url:
        return "default-player"
    return re.sub(r"[^a-zA-Z0-9_-]", "-", str(player["id"]))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Cache remote player headshots as local public assets.")
    parser.add_argument(
        "--players-json",
        type=Path,
        default=Path("src/data/players.json"),
        help="Player JSON file to read and update. Default: src/data/players.json",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("public/player-images"),
        help="Directory for downloaded public image assets. Default: public/player-images",
    )
    parser.add_argument(
        "--public-prefix",
        default="/player-images",
        help="Public URL prefix written into players.json. Default: /player-images",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional max number of remote images to process.",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Redownload images even when a local file already exists.",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=12,
        help="Concurrent curl downloads. Default: 12",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    players: list[dict[str, Any]] = json.loads(args.players_json.read_text(encoding="utf-8"))
    remote_players = [
        player
        for player in players
        if player.get("id") and is_remote_image(player.get("image"))
    ]
    if args.limit is not None:
        remote_players = remote_players[: args.limit]

    image_url_by_asset_id: dict[str, str] = {}
    asset_id_by_player_id: dict[str, str] = {}
    for player in remote_players:
        asset_id = image_asset_id(player)
        asset_id_by_player_id[str(player["id"])] = asset_id
        image_url_by_asset_id.setdefault(asset_id, str(player["image"]))

    args.output_dir.mkdir(parents=True, exist_ok=True)
    local_path_by_asset_id: dict[str, str] = {}
    failures: list[DownloadResult] = []
    started_at = time.monotonic()

    image_items = list(image_url_by_asset_id.items())
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = [
            executor.submit(
                download_player_image,
                asset_id=asset_id,
                image_url=image_url,
                output_dir=args.output_dir,
                public_prefix=args.public_prefix,
                refresh=args.refresh,
            )
            for asset_id, image_url in image_items
        ]
        for index, future in enumerate(as_completed(futures), start=1):
            result = future.result()
            if result.local_path:
                local_path_by_asset_id[result.asset_id] = result.local_path
            else:
                failures.append(result)

            if index == len(image_items) or index % 100 == 0:
                elapsed = max(time.monotonic() - started_at, 0.001)
                print(
                    f"[info] player images {index}/{len(image_items)}; "
                    f"cached={len(local_path_by_asset_id)}; failed={len(failures)}; "
                    f"{index / elapsed:.1f}/s",
                    file=sys.stderr,
                    flush=True,
                )

    for player in players:
        asset_id = asset_id_by_player_id.get(str(player.get("id")))
        local_path = local_path_by_asset_id.get(asset_id or "")
        if local_path:
            player["image"] = local_path

    args.players_json.write_text(json.dumps(players, indent=2) + "\n", encoding="utf-8")
    local_player_count = sum(
        1
        for player in players
        if str(player.get("image") or "").startswith(args.public_prefix)
    )
    print(f"updated {local_player_count} player image paths in {args.players_json}")
    if failures:
        print(f"failed to cache {len(failures)} player images", file=sys.stderr)
        for failure in failures[:20]:
            print(f"[warn] {failure.asset_id}: {failure.reason}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
