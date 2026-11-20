"""'Wipe everything': revoke Gmail tokens, delete the database and all stored files."""
from __future__ import annotations

import shutil

from sqlalchemy import select

from ..config import get_settings
from ..db import GmailAccount, SessionLocal, dispose_engine
from . import gmail
from .jobs import stop_scheduler


def wipe_everything() -> dict:
    s = get_settings()
    revoked, failed = [], []
    db = SessionLocal()
    try:
        for acct in db.scalars(select(GmailAccount)).all():
            (revoked if gmail.revoke(acct) else failed).append(acct.email)
    finally:
        db.close()
    stop_scheduler()
    dispose_engine()
    for suffix in ("", "-journal", "-wal", "-shm"):
        p = s.db_path.with_name(s.db_path.name + suffix)
        if p.exists():
            p.unlink()
    if s.files_dir.exists():
        shutil.rmtree(s.files_dir)
    s.files_dir.mkdir(parents=True, exist_ok=True)
    return {"revoked": revoked, "revoke_failed": failed}
