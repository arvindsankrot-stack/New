import pyotp

from app.config import get_settings
from conftest import PASSWORD


def test_redirects_to_setup_then_login(client):
    r = client.get("/", follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/login"
    r = client.get("/login", follow_redirects=False)
    assert r.headers["location"] == "/setup"


def test_weak_password_rejected(client):
    import re
    r = client.get("/setup")
    secret = re.search(r"<code>([A-Z2-7]+)</code>", r.text).group(1)
    r = client.post("/setup", data={"password": "short", "password2": "short", "code": pyotp.TOTP(secret).now()})
    assert "Password needs" in r.text


def test_login_requires_totp(logged_in):
    c = logged_in
    c.post("/logout")
    r = c.post("/login", data={"password": PASSWORD, "code": "000000"}, follow_redirects=False)
    assert "Wrong password or code" in r.text
    r = c.get("/", follow_redirects=False)
    assert r.status_code == 303
    r = c.post("/login", data={"password": PASSWORD, "code": pyotp.TOTP(c.totp_secret).now()}, follow_redirects=False)
    assert r.headers["location"] == "/"
    assert c.get("/").status_code == 200


def test_cross_origin_post_blocked(logged_in):
    r = logged_in.post("/seeds", data={"kind": "username", "value": "x"}, headers={"origin": "https://evil.example"})
    assert r.status_code == 403


def test_database_is_encrypted(logged_in):
    header = get_settings().db_path.read_bytes()[:16]
    assert header != b"SQLite format 3\x00"


def test_security_headers(logged_in):
    r = logged_in.get("/")
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"]
    assert r.headers["referrer-policy"] == "same-origin"
