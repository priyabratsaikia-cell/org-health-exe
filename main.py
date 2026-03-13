#!/usr/bin/env python3
"""Salesforce Org Health Proactive Monitoring Agent – entry point.

Starts the FastAPI server and opens the browser UI.
"""

from __future__ import annotations

import logging
import sys
import threading
import time
import webbrowser

import uvicorn

HOST = "127.0.0.1"
PORT = 8502

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("org-health-agent")


def open_browser():
    time.sleep(1.5)
    url = f"http://{HOST}:{PORT}"
    logger.info("Opening browser at %s", url)
    webbrowser.open(url)


def main():
    logger.info("Starting Salesforce Org Health Monitoring Agent…")
    logger.info("Server will be available at http://%s:%s", HOST, PORT)

    threading.Thread(target=open_browser, daemon=True).start()

    uvicorn.run(
        "app.server:app",
        host=HOST,
        port=PORT,
        log_level="info",
        reload=False,
    )


if __name__ == "__main__":
    main()
