import datetime as dt

import httpx

from app.db import Finding, GmailAccount, RemovalRequest, utcnow
from app.crypto import encrypt_str
from app.services import gmail, http, tracker


def mock(routes):
    def handler(request: httpx.Request):
        key = str(request.url)
        if key.endswith("/robots.txt"):
            return httpx.Response(200, text=routes.get("robots", ""))
        status, body = routes.get(key, (404, ""))
        return httpx.Response(status, text=body, headers={"content-type": "text/html"})
    http.transport = httpx.MockTransport(handler)


def sent_request(db, url="https://site.example/post/1", fingerprint="", source="brave", sent_days_ago=1):
    acct = GmailAccount(email="me@example.com", token_enc=encrypt_str("{}"))
    db.add(acct)
    f = Finding(url=url, source=source, site_domain="site.example", fingerprint=fingerprint, decision="remove")
    db.add(f)
    db.commit()
    req = RemovalRequest(finding_id=f.id, route="platform_privacy", channel="email", to_address="p@site.example",
                         subject="Request", body="Please remove", status="Sent", gmail_account_id=acct.id,
                         sent_at=utcnow() - dt.timedelta(days=sent_days_ago))
    db.add(req)
    db.commit()
    return req


def test_404_marks_removed_and_drafts_google_refresh(db):
    mock({})
    req = sent_request(db)
    assert tracker.check_request(db, req) == "Removed"
    routes = [r.route for r in db.query(RemovalRequest).all()]
    assert "google_refresh" in routes
    g = db.query(RemovalRequest).filter_by(route="google_refresh").one()
    assert g.status == "Draft"  # drafted, never sent


def test_page_still_up_is_not_removed(db):
    mock({"https://site.example/post/1": (200, "<p>hello my old comment here</p>")})
    req = sent_request(db, fingerprint="my old comment")
    assert tracker.check_request(db, req) == "Sent"


def test_content_gone_from_page_is_removed(db):
    mock({"https://site.example/post/1": (200, "<p>This comment was deleted</p>")})
    req = sent_request(db, fingerprint="my old comment")
    assert tracker.check_request(db, req) == "Removed"


def test_server_error_is_not_removed(db):
    mock({"https://site.example/post/1": (500, "")})
    req = sent_request(db)
    assert tracker.check_request(db, req) == "Sent"


def test_robots_disallow_is_not_removed(db):
    mock({"robots": "User-agent: *\nDisallow: /"})
    req = sent_request(db)
    assert tracker.check_request(db, req) == "Sent"
    assert "robots.txt" in req.last_check_result


def test_followup_drafted_after_15_days_without_reply(db, monkeypatch):
    mock({"https://site.example/post/1": (200, "still here")})
    monkeypatch.setattr(gmail, "thread_has_reply", lambda *a: False)
    req = sent_request(db, sent_days_ago=16)
    req.gmail_thread_id = "t1"
    db.commit()
    tracker.check_request(db, req)
    follow = db.query(RemovalRequest).filter_by(parent_id=req.id).one()
    assert follow.is_followup and follow.status == "Draft" and follow.gmail_thread_id == "t1"
    # only one follow-up
    tracker.check_request(db, req)
    assert db.query(RemovalRequest).filter_by(parent_id=req.id).count() == 1


def test_reply_marks_acknowledged_and_no_followup(db, monkeypatch):
    mock({"https://site.example/post/1": (200, "still here")})
    monkeypatch.setattr(gmail, "thread_has_reply", lambda *a: True)
    req = sent_request(db, sent_days_ago=20)
    req.gmail_thread_id = "t1"
    db.commit()
    assert tracker.check_request(db, req) == "Acknowledged"
    assert db.query(RemovalRequest).filter_by(parent_id=req.id).count() == 0


def test_due_requests_respects_recheck_interval(db):
    req = sent_request(db)
    assert req in tracker.due_requests(db)
    req.last_checked_at = utcnow()
    db.commit()
    assert req not in tracker.due_requests(db)
