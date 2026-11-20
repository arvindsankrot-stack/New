"""Background jobs: in-process scheduler plus a simple 'run in background' helper
so long scans don't block the UI. Nothing here ever sends a message."""
from __future__ import annotations

import threading
from typing import Callable

from apscheduler.schedulers.background import BackgroundScheduler

from ..db import SessionLocal, log_job

_scheduler: BackgroundScheduler | None = None
_running: dict[str, threading.Thread] = {}
_lock = threading.Lock()


def run_in_background(name: str, fn: Callable) -> bool:
    """Start fn(db) in a thread unless a job with the same name is running."""
    with _lock:
        t = _running.get(name)
        if t and t.is_alive():
            return False

        def target():
            db = SessionLocal()
            try:
                fn(db)
            except Exception as e:  # noqa: BLE001
                log_job(db, name, f"failed: {e}")
            finally:
                db.close()

        t = threading.Thread(target=target, name=f"job-{name}", daemon=True)
        _running[name] = t
        t.start()
        return True


def running_jobs() -> list[str]:
    return [n for n, t in _running.items() if t.is_alive()]


def _tracker_tick() -> None:
    from .tracker import run_tracker

    db = SessionLocal()
    try:
        run_tracker(db)
    finally:
        db.close()


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = BackgroundScheduler(daemon=True)
    # Runs every 6 hours; each request is actually re-checked once its
    # last check is older than RECHECK_DAYS (default 3).
    _scheduler.add_job(_tracker_tick, "interval", hours=6, id="tracker", max_instances=1, coalesce=True)
    _scheduler.start()


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
    _scheduler = None
