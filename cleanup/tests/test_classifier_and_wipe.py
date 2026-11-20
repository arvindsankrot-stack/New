from app.config import get_settings
from app.crypto import encrypt_str, store_encrypted_file
from app.db import Finding, GmailAccount, Seed
from app.services import classifier, gmail


def test_heuristic_flags_phone_as_high_risk_mine(db):
    db.add(Seed(kind="phone", value="+91 98765 43210"))
    db.add(Seed(kind="name", value="Test Owner"))
    f = Finding(url="https://dir.example/p", title="Test Owner - contact", snippet="Call 98765-43210", source="brave")
    db.add(f)
    db.commit()
    assert classifier.classify_pending(db) == 1
    assert f.ownership == "mine" and f.risk == "high" and f.content_type == "contact" and f.classified_by == "rules"


def test_signals_do_not_leak_email_or_phone(db):
    db.add(Seed(kind="email", value="secret@example.com"))
    db.commit()
    ctx = classifier._seed_context(db)
    f = Finding(url="https://x.example", snippet="contact secret@example.com", source="brave", meta={})
    sig = classifier._signals(f, ctx)
    assert sig["owner_email_in_text"] is True
    assert "secret@example.com" not in str(sig)


def test_wipe_deletes_everything_and_revokes(logged_in, db, monkeypatch):
    revoked = []
    monkeypatch.setattr(gmail, "revoke", lambda acct: revoked.append(acct.email) or True)
    db.add(GmailAccount(email="me@example.com", token_enc=encrypt_str("{}")))
    db.commit()
    name = store_encrypted_file(b"photo", ".jpg")
    s = get_settings()
    assert (s.files_dir / name).exists()
    r = logged_in.post("/settings/wipe", data={"confirm_text": "nope", "password": "x", "code": "1"})
    assert "Type WIPE EVERYTHING" in r.text and revoked == []
    import pyotp
    from conftest import PASSWORD
    r = logged_in.post("/settings/wipe", data={"confirm_text": "WIPE EVERYTHING", "password": PASSWORD,
                                                "code": pyotp.TOTP(logged_in.totp_secret).now()},
                       follow_redirects=False)
    assert r.headers["location"] == "/setup"
    assert revoked == ["me@example.com"]
    assert not (s.files_dir / name).exists()
    # fresh database: back to setup
    assert logged_in.get("/", follow_redirects=False).headers["location"] == "/login"
    assert logged_in.get("/login", follow_redirects=False).headers["location"] == "/setup"
