from app.db import Finding, GmailAccount, RemovalRequest, Seed, SiteContact
from app.crypto import encrypt_str
from app.services import gmail, removal


def make_finding(db, **kw):
    f = Finding(url=kw.pop("url", "https://www.reddit.com/r/test/comments/abc/x/def/"), title="Comment in r/test",
                snippet="my old comment", source="reddit", site_domain=kw.pop("site_domain", "reddit.com"),
                meta=kw.pop("meta", {"subreddit": "test", "author": "someoneelse"}), decision="remove",
                content_type="comment", **kw)
    db.add(f)
    db.commit()
    return f


def test_routes_for_other_persons_reddit_post(db):
    f = make_finding(db)
    routes = removal.suggest_routes(db, f)
    assert routes[0].route == "subreddit_mod" and routes[0].recommended


def test_routes_for_own_reddit_post(db):
    db.add(Seed(kind="username", value="MyOldName"))
    db.commit()
    f = make_finding(db, meta={"subreddit": "test", "author": "myoldname"})
    routes = removal.suggest_routes(db, f)
    assert routes[0].route == "self_delete"
    assert "subreddit_mod" not in [r.route for r in routes]


def test_indian_site_gets_dpdp_first(db):
    db.add(SiteContact(domain="example.in", name="Example", jurisdiction="in", grievance_email="go@example.in"))
    db.commit()
    f = make_finding(db, url="https://example.in/u/me", site_domain="example.in", meta={})
    routes = removal.suggest_routes(db, f)
    assert routes[0].route == "dpdp" and routes[0].channel == "email"


def test_all_templates_render_cleanly(db):
    db.add(SiteContact(domain="example.eu", name="Example EU", jurisdiction="eu", privacy_email="dpo@example.eu",
                       grievance_email="go@example.eu"))
    db.commit()
    f = make_finding(db, url="https://example.eu/p/1", site_domain="example.eu", meta={"subreddit": "pics"})
    for route in removal.ROUTES:
        req = removal.draft_request(db, f, route)
        assert req.status == "Draft"
        assert f.url in req.body or route == "subreddit_mod"
        assert removal.check_wording(req.subject + " " + req.body) == [], route
    dpdp = db.query(RemovalRequest).filter_by(route="dpdp").one()
    assert dpdp.to_address == "go@example.eu" and "Section 12" in dpdp.body
    gdpr = db.query(RemovalRequest).filter_by(route="gdpr").one()
    assert gdpr.to_address == "dpo@example.eu" and "Article 17" in gdpr.body
    sub = db.query(RemovalRequest).filter_by(route="subreddit_mod").one()
    assert sub.action_url.startswith("https://www.reddit.com/message/compose?") and "%2Fr%2Fpics" in sub.action_url


def test_forbidden_wording_detected():
    assert "lawyer" in removal.check_wording("My lawyer will contact you")


def _draft_with_gmail(db):
    acct = GmailAccount(email="me@example.com", token_enc=encrypt_str("{}"))
    db.add(acct)
    db.add(SiteContact(domain="example.org", privacy_email="privacy@example.org"))
    db.commit()
    f = make_finding(db, url="https://example.org/x", site_domain="example.org", meta={})
    req = removal.draft_request(db, f, "platform_privacy")
    req.gmail_account_id = acct.id
    db.commit()
    return req


def test_send_needs_explicit_review(logged_in, db, monkeypatch):
    calls = []
    monkeypatch.setattr(gmail, "send_message",
                        lambda db_, acct, mime, thread_id="": calls.append(mime) or
                        {"id": "m1", "threadId": "t1", "message_id_header": "<m1@x>"})
    req = _draft_with_gmail(db)
    r = logged_in.post(f"/requests/{req.id}/send", data={}, follow_redirects=True)
    assert "Tick" in r.text and calls == []
    # attaching a document without both confirmations is refused
    r = logged_in.post(f"/requests/{req.id}/send", data={"reviewed": "yes", "attach_document_id": "1"})
    assert "attached only when" in r.text and calls == []
    r = logged_in.post(f"/requests/{req.id}/send", data={"reviewed": "yes"})
    assert len(calls) == 1
    assert calls[0]["To"] == "privacy@example.org"
    db.expire_all()
    sent = db.get(RemovalRequest, req.id)
    assert sent.status == "Sent" and sent.gmail_thread_id == "t1"
    # can't send twice
    logged_in.post(f"/requests/{req.id}/send", data={"reviewed": "yes"})
    assert len(calls) == 1


def test_send_blocks_threatening_wording(logged_in, db, monkeypatch):
    calls = []
    monkeypatch.setattr(gmail, "send_message", lambda *a, **k: calls.append(1))
    req = _draft_with_gmail(db)
    req.body += "\nOtherwise I will take legal action."
    db.commit()
    r = logged_in.post(f"/requests/{req.id}/send", data={"reviewed": "yes"})
    assert "legal action" in r.text and calls == []


def test_removed_cannot_be_set_manually(logged_in, db):
    req = _draft_with_gmail(db)
    req.status = "Sent"
    db.commit()
    logged_in.post(f"/requests/{req.id}/status", data={"status": "Removed"})
    db.expire_all()
    assert db.get(RemovalRequest, req.id).status == "Sent"
