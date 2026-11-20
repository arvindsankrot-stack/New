import os
import sys
import tempfile
from pathlib import Path

import pytest

_TMP = tempfile.mkdtemp(prefix="cleanup-test-")
os.environ.update({
    "DATA_DIR": _TMP,
    "DB_KEY": "test-db-key-not-secret",
    "FILE_KEY": "dGVzdC1rZXktdGVzdC1rZXktdGVzdC1rZXktMTIzNDU=",
    "SESSION_SECRET": "test-session-secret",
    "SCHEDULER_ENABLED": "false",
    "ANTHROPIC_API_KEY": "",
    "BASE_URL": "http://testserver",
})
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pyotp  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import db as dbmod  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.services import http as httpmod  # noqa: E402

PASSWORD = "Correct-Horse-Battery-9"


@pytest.fixture(autouse=True)
def fresh_db():
    dbmod.dispose_engine()
    s = get_settings()
    if s.db_path.exists():
        s.db_path.unlink()
    httpmod._robots_cache.clear()
    httpmod.transport = None
    dbmod.get_engine()
    yield
    httpmod.transport = None
    dbmod.dispose_engine()


@pytest.fixture
def db():
    session = dbmod.SessionLocal()
    yield session
    session.close()


@pytest.fixture
def client():
    from app.main import app

    with TestClient(app, headers={"origin": "http://testserver"}) as c:
        yield c


@pytest.fixture
def logged_in(client):
    r = client.get("/setup")
    assert r.status_code == 200
    import re
    secret = re.search(r"<code>([A-Z2-7]+)</code>", r.text).group(1)
    r = client.post("/setup", data={"password": PASSWORD, "password2": PASSWORD,
                                    "code": pyotp.TOTP(secret).now(), "full_name": "Test Owner"},
                    follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/login"
    r = client.post("/login", data={"password": PASSWORD, "code": pyotp.TOTP(secret).now()}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/"
    client.totp_secret = secret
    return client
