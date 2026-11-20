"""Tracker: re-checks URLs, notices replies, drafts (never sends) follow-ups."""
from __future__ import annotations

import datetime as dt
import html
import re
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import Finding, RemovalRequest, log_job, utcnow
from . import gmail
from .http import polite_get
from .removal import draft_followup, draft_request

ACTIVE = ("Sent", "Acknowledged")
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
REDDIT_GONE = {"[removed]", "[deleted]"}


@dataclass
class CheckResult:
    gone: bool
    detail: str


def _normalise(text: str) -> str:
    return _WS_RE.sub(" ", html.unescape(_TAG_RE.sub(" ", text))).strip().lower()


def check_reddit(f: Finding) -> CheckResult | None:
    """Use the official API for Reddit items (comment bodies become [removed]/[deleted])."""
    from .search import reddit_api_get, reddit_token

    fullname = (f.meta or {}).get("fullname")
    if not fullname or not reddit_token():
        return None
    r = reddit_api_get("/api/info", {"id": fullname, "raw_json": 1})
    if r.status_code != 200:
        return None
    children = r.json().get("data", {}).get("children", [])
    if not children:
        return CheckResult(True, "Reddit API: item no longer exists")
    d = children[0]["data"]
    body = (d.get("body") or d.get("selftext") or "").strip()
    if body in REDDIT_GONE or d.get("removed_by_category") or d.get("author") == "[deleted]":
        return CheckResult(True, "Reddit API: item removed/deleted")
    return CheckResult(False, "Reddit API: item still visible")


def check_url(f: Finding) -> CheckResult:
    """Removed only when the URL is 404/410, or the stored fingerprint text is gone.
    Anything else (errors, blocks, redirects to a login page) counts as still present."""
    if f.source == "reddit":
        res = check_reddit(f)
        if res is not None:
            return res
    target = f.image_url if f.content_type == "photo" and f.image_url else f.url
    r = polite_get(target)
    if r.status == -1:
        return CheckResult(False, "robots.txt disallows automated checking - check this one by hand")
    if r.status == 0:
        return CheckResult(False, f"network error: {r.error}")
    if r.status in (404, 410):
        return CheckResult(True, f"HTTP {r.status}")
    if r.status >= 400:
        return CheckResult(False, f"HTTP {r.status} - not treated as removed")
    if target == f.image_url:
        if not r.content_type.startswith("image/"):
            return CheckResult(True, f"image URL now returns {r.content_type or 'non-image'}")
        return CheckResult(False, "image still loads")
    if f.fingerprint:
        if _normalise(f.fingerprint)[:120] not in _normalise(r.text):
            return CheckResult(True, "page loads but the content is no longer on it")
        return CheckResult(False, "content still on page")
    return CheckResult(False, f"HTTP {r.status} - page still loads")


def mark_removed(db: Session, req: RemovalRequest, detail: str) -> None:
    req.status = "Removed"
    req.last_check_result = detail
    f = req.finding
    # sibling requests for the same finding are resolved too
    for other in f.requests:
        if other.id != req.id and other.status in ("Draft",) + ACTIVE and other.route != "google_refresh":
            other.status = "Removed"
            other.last_check_result = f"resolved via request #{req.id}"
    db.commit()
    # page is gone: offer a Google refresh request if it came from Google search
    if f.source in ("google_cse", "brave") and not any(r.route == "google_refresh" for r in f.requests):
        draft_request(db, f, "google_refresh")


def check_request(db: Session, req: RemovalRequest) -> str:
    s = get_settings()
    now = utcnow()
    # 1. reply in Gmail thread -> Acknowledged
    if req.status == "Sent" and req.gmail_thread_id and req.gmail_account:
        try:
            if gmail.thread_has_reply(db, req.gmail_account, req.gmail_thread_id):
                req.status = "Acknowledged"
                req.reply_seen_at = now
        except Exception as e:  # noqa: BLE001
            log_job(db, "tracker", f"request {req.id}: gmail check failed: {e}")
    # 2. URL check -> Removed
    if req.route != "google_refresh":
        result = check_url(req.finding)
        req.last_checked_at = now
        req.last_check_result = result.detail
        db.commit()
        if result.gone:
            mark_removed(db, req, result.detail)
            return "Removed"
    else:
        req.last_checked_at = now
    # 3. no reply after N days -> draft a follow-up (owner must review & send)
    if (req.status == "Sent" and req.channel == "email" and req.sent_at
            and now - req.sent_at >= dt.timedelta(days=s.followup_days)
            and not req.reply_seen_at):
        has_followup = db.scalars(select(RemovalRequest).where(RemovalRequest.parent_id == req.id)).first()
        if not has_followup:
            draft_followup(db, req)
            req.notes = (req.notes + f"\nFollow-up drafted {now:%Y-%m-%d}").strip()
    db.commit()
    return req.status


def due_requests(db: Session) -> list[RemovalRequest]:
    s = get_settings()
    cutoff = utcnow() - dt.timedelta(days=s.recheck_days)
    reqs = db.scalars(select(RemovalRequest).where(RemovalRequest.status.in_(ACTIVE))).all()
    return [r for r in reqs if r.last_checked_at is None or r.last_checked_at <= cutoff]


def run_tracker(db: Session) -> dict:
    stats = {"checked": 0, "removed": 0}
    for req in due_requests(db):
        try:
            if check_request(db, req) == "Removed":
                stats["removed"] += 1
            stats["checked"] += 1
        except Exception as e:  # noqa: BLE001
            log_job(db, "tracker", f"request {req.id}: {e}")
    log_job(db, "tracker", f"done: {stats}")
    return stats
