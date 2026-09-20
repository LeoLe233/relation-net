#!/usr/bin/env python3
"""Run Relation Net offline, serving only dist on the loopback interface."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import webbrowser


def main():
    parser = argparse.ArgumentParser(description="Run Relation Net offline.")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("Port must be between 1 and 65535.")
    public = Path(__file__).resolve().parent / "dist"
    if not (public / "index.html").is_file():
        parser.error("dist/index.html is missing. Extract the complete ZIP first.")
    handler = partial(SimpleHTTPRequestHandler, directory=str(public))
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    except OSError as error:
        parser.exit(1, f"Cannot start on port {args.port}: {error}\nClose an earlier instance or choose --port PORT. Different ports use separate browser storage.\n")
    url = f"http://127.0.0.1:{args.port}/"
    print(f"Relation Net: {url}\nOffline mode. Keep this window open; Ctrl+C stops the app.", flush=True)
    if not args.no_browser:
        timer = threading.Timer(0.3, webbrowser.open, args=(url,))
        timer.daemon = True
        timer.start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
