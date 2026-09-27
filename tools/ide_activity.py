#!/usr/bin/env python3
"""Query the Severus IDE activity store.

Reads the append-only JSONL store written by the Rust IDE activity collector
(desktop/src-tauri/src/ide_activity.rs) and answers "what were we just working
on" with a top-movers table, workspace and source breakdowns, plus the latest
collector health lines.

Usage:
  python tools/ide_activity.py                 # last 24 hours, 15 entries
  python tools/ide_activity.py --hours 168     # last 7 days
  python tools/ide_activity.py --limit 40      # more rows in the recent tail
  python tools/ide_activity.py --json          # machine-readable summary
"""

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

SEVERUS_ROOT = Path(__file__).resolve().parents[1]
ACTIVITY_DIR = SEVERUS_ROOT / "second-brain" / "activity"
STORE = ACTIVITY_DIR / "ide_activity.jsonl"
STATUS = ACTIVITY_DIR / "collector_status.jsonl"


def parse_ts(raw):
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except (ValueError, AttributeError, TypeError):
        return None


def load_events(hours):
    """Return (events in window, malformed line count, store availability)."""
    if not STORE.is_file():
        return [], 0, False
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    events, malformed = [], 0
    with STORE.open("r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                malformed += 1
                continue
            ts = parse_ts(event.get("ts"))
            if ts is None or ts < cutoff:
                continue
            events.append(event)
    events.sort(key=lambda e: e.get("ts", ""))
    return events, malformed, True


def load_status(tail=8):
    if not STATUS.is_file():
        return []
    lines = STATUS.read_text(encoding="utf-8", errors="replace").strip().splitlines()
    out = []
    for line in lines[-tail:]:
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out


def fmt_count(counter, label):
    rows = counter.most_common(8)
    if not rows:
        return [f"  (none in window)"]
    return [f"  {count:>5}  {name}" for name, count in rows]


def main():
    parser = argparse.ArgumentParser(description="Query the Severus IDE activity store.")
    parser.add_argument("--hours", type=float, default=24.0, help="lookback window in hours (default 24)")
    parser.add_argument("--limit", type=int, default=15, help="rows in the recent tail (default 15)")
    parser.add_argument("--json", action="store_true", help="emit the summary as JSON")
    args = parser.parse_args()

    events, malformed, store_ok = load_events(args.hours)
    if args.json:
        files = Counter((e.get("workspace", ""), e.get("path", "")) for e in events if e.get("path"))
        print(json.dumps({
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "store_available": store_ok,
            "window_hours": args.hours,
            "total_events": len(events),
            "malformed_lines": malformed,
            "by_workspace": dict(Counter(e.get("workspace") or "(no workspace)" for e in events)),
            "by_source": dict(Counter(e.get("source", "?") for e in events)),
            "top_files": [
                {"workspace": ws, "path": path, "count": count}
                for (ws, path), count in files.most_common(12)
            ],
            "recent": events[-args.limit:],
        }, indent=2))
        return 0

    print("SEVERUS IDE ACTIVITY")
    print(f"store: {STORE}")
    if not store_ok:
        print("status: MISSING. The collector has not run yet or the store was rotated away.")
        print("        This is reported loudly, not treated as zero activity.")
        return 1
    print(f"window: last {args.hours:g}h   events: {len(events)}   malformed lines: {malformed}")

    files = Counter((e.get("workspace", ""), e.get("path", "")) for e in events if e.get("path"))
    print("\nTOP MOVERS (file, workspace-relative)")
    for (ws, path), count in files.most_common(12):
        print(f"  {count:>5}  {path}   [{ws}]")
    if not files:
        print("  (none in window)")

    print("\nBY SOURCE")
    for row in fmt_count(Counter(e.get("source", "?") for e in events), "source"):
        print(row)

    print("\nBY WORKSPACE")
    for row in fmt_count(Counter(e.get("workspace") or "(no workspace)" for e in events), "workspace"):
        print(row)

    print("\nRECENT TAIL (oldest first)")
    for e in events[-args.limit:]:
        detail = e.get("detail", "")
        suffix = f"   # {detail}" if detail else ""
        print(f"  {e.get('ts', '?')}  {e.get('source', '?'):<20} {e.get('event', '?'):<7} {e.get('path', '')}{suffix}")

    print("\nCOLLECTOR HEALTH (latest status transitions)")
    for s in load_status():
        print(f"  {s.get('ts', '?')}  {s.get('source', '?')}/{s.get('target', '?')}: {s.get('status', '?')} ({s.get('detail', '')})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
