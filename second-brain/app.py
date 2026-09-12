#!/usr/bin/env python3
"""Second Brain desktop app.

A native window (pywebview / WebView2) showing the 3D knowledge graph, backed by a
localhost server that watches second-brain/notes/ and rebuilds graph.html live —
the open window reloads itself whenever a note changes.

Boot: a shortcut in the user's Startup folder runs this file with pythonw.exe at
login, so the graph is on screen when the laptop starts. `--browser` opens the
default browser instead of the native window; `--no-open` starts the service
without opening anything (used for headless testing).
"""

import argparse
import http.server
import os
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

if sys.stdout is None:  # running under pythonw — no console attached
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")

BRAIN_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BRAIN_DIR))

import build_graph

PORT_DEFAULT = 8622
POLL_SECONDS = 3.0
LOG_FILE = BRAIN_DIR / "service.log"


def log(message: str) -> None:
    line = f"{datetime.now():%Y-%m-%d %H:%M:%S}  {message}"
    try:
        with LOG_FILE.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
        if LOG_FILE.stat().st_size > 1_000_000:
            LOG_FILE.write_text(LOG_FILE.read_text(encoding="utf-8")[-200_000:], encoding="utf-8")
    except OSError:
        pass


def notes_snapshot() -> dict:
    return {p.name: p.stat().st_mtime for p in build_graph.NOTES_DIR.glob("*.md")}


def watch_notes() -> None:
    last = notes_snapshot()
    while True:
        time.sleep(POLL_SECONDS)
        try:
            current = notes_snapshot()
        except OSError:
            continue
        if current == last:
            continue
        last = current
        try:
            info = build_graph.build()
            log(f"rebuilt graph: {info['notes']} notes, {info['links']} links")
        except Exception as exc:  # keep serving the last good graph
            log(f"rebuild failed: {exc}")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BRAIN_DIR), **kwargs)

    def do_GET(self):
        if self.path.split("?")[0] in ("/version", "/version/"):
            body = str(int(build_graph.OUTPUT.stat().st_mtime)).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def log_message(self, *args):  # per-request noise stays out of the log
        pass


def run_forever() -> None:
    while True:
        time.sleep(3600)


def main() -> None:
    parser = argparse.ArgumentParser(description="Second Brain desktop app")
    parser.add_argument("--port", type=int, default=PORT_DEFAULT)
    parser.add_argument("--browser", action="store_true",
                        help="open in the default browser instead of a native window")
    parser.add_argument("--no-open", action="store_true",
                        help="start the service without opening any window")
    args = parser.parse_args()

    url = f"http://127.0.0.1:{args.port}/graph.html"

    try:
        server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    except OSError:
        log("port busy — the app is already running, exiting")
        return

    log(f"second brain service started at {url}")
    info = build_graph.build()
    log(f"initial graph: {info['notes']} notes, {info['links']} links")
    threading.Thread(target=watch_notes, daemon=True).start()
    threading.Thread(target=server.serve_forever, daemon=True).start()

    if args.no_open:
        run_forever()
        return

    if args.browser:
        import webbrowser
        webbrowser.open(url)
        run_forever()
        return

    try:
        import webview
        webview.create_window("Second Brain", url, width=1280, height=840,
                              background_color="#0b0e14", min_size=(900, 600))
        log("native window opening")
        webview.start()
        log("window closed — service stopping")
    except Exception as exc:
        log(f"native window unavailable ({exc}); falling back to the default browser")
        import webbrowser
        webbrowser.open(url)
        run_forever()


if __name__ == "__main__":
    main()
