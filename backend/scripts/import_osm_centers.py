"""Official places from OpenStreetMap: hospitals, fire stations, police (all of Thailand).

  make centers-fetch    # Overpass → data/centers_osm_snapshot.json (run once, before the demo)
  make centers-load     # snapshot → database (replaces previous OSM rows; no network)
  make centers-export   # database → snapshot (keeps coordinator edits before the next load)

The snapshot is the source of truth for official places and is committed to the repo. Before it is
overwritten, the previous version is copied to data/backups/. Never scrape live on stage.
"""

import asyncio
import json
import os
import shutil
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from app.core.base_model import utc_now
from app.core.database import engine, session_factory
from app.integrations.osm import deduplicate_centers, element_to_center, fetch_overpass
from app.modules.centers import service as centers_service
from app.modules.centers.enums import CenterSource
from app.modules.centers.schemas import CenterImport

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SNAPSHOT_FILE = DATA_DIR / "centers_osm_snapshot.json"
BACKUP_DIR = DATA_DIR / "backups"
# A much smaller result usually means Overpass returned a partial answer: don't overwrite.
MIN_SIZE_RATIO = 0.8
ATTRIBUTION = "OpenStreetMap data © OpenStreetMap contributors, ODbL."


def read_snapshot() -> dict[str, Any] | None:
    return json.loads(SNAPSHOT_FILE.read_text()) if SNAPSHOT_FILE.exists() else None


def write_snapshot(centers: list[dict[str, Any]], retrieved_at: str, note: str) -> None:
    """Back up the current snapshot, then write the new one."""
    if SNAPSHOT_FILE.exists():
        BACKUP_DIR.mkdir(exist_ok=True)
        backup = BACKUP_DIR / f"centers_osm_{utc_now():%Y%m%d_%H%M%S}.json"
        shutil.copy2(SNAPSHOT_FILE, backup)
        print(f"Previous snapshot backed up to {backup.relative_to(DATA_DIR.parent)}")
    snapshot = {"_note": f"{ATTRIBUTION} {note}", "retrieved_at": retrieved_at, "centers": centers}
    SNAPSHOT_FILE.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1))
    counts = dict(Counter(c["center_type"] for c in centers))
    print(f"Saved {len(centers)} places to {SNAPSHOT_FILE.name}: {counts}")


def ensure_not_much_smaller(new_count: int) -> None:
    previous = read_snapshot()
    if previous is None or os.environ.get("FORCE") == "1":
        return
    old_count = len(previous["centers"])
    if new_count < old_count * MIN_SIZE_RATIO:
        sys.exit(
            f"New result has {new_count} places, the snapshot has {old_count}. Not overwriting "
            "(Overpass may have returned a partial answer). Run with FORCE=1 to save anyway."
        )


async def fetch_snapshot() -> None:
    retrieved_at = utc_now()
    print("Querying Overpass (can take a minute)…")
    elements = await fetch_overpass()
    centers = deduplicate_centers(
        [c for e in elements if (c := element_to_center(e, retrieved_at)) is not None]
    )
    print(f"{len(centers)} places from {len(elements)} OSM elements.")
    ensure_not_much_smaller(len(centers))
    write_snapshot(centers, retrieved_at.isoformat(), "Fetched by `make centers-fetch`.")


async def load_snapshot() -> None:
    snapshot = read_snapshot()
    if snapshot is None:
        sys.exit(f"{SNAPSHOT_FILE.name} not found: run `make centers-fetch` first.")
    items = [CenterImport.model_validate(item) for item in snapshot["centers"]]
    async with session_factory() as session:
        count = await centers_service.replace_official_centers(session, CenterSource.OSM, items)
    await engine.dispose()
    print(f"Loaded {count} OSM centers (retrieved {snapshot['retrieved_at']}).")


async def export_snapshot() -> None:
    async with session_factory() as session:
        items = await centers_service.export_official_centers(session, CenterSource.OSM)
    await engine.dispose()
    if not items:
        sys.exit("No OSM centers in the database: nothing to export.")
    previous = read_snapshot()
    retrieved_at = previous["retrieved_at"] if previous else utc_now().isoformat()
    write_snapshot(
        [item.model_dump(mode="json") for item in items],
        retrieved_at,
        "Exported from the database by `make centers-export` (includes edits).",
    )


COMMANDS = {"fetch": fetch_snapshot, "load": load_snapshot, "export": export_snapshot}

if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in COMMANDS:
        sys.exit("Usage: python -m scripts.import_osm_centers fetch|load|export")
    asyncio.run(COMMANDS[sys.argv[1]]())
