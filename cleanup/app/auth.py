"""Single-user authentication: strong password (argon2) + TOTP 2FA."""
from __future__ import annotations

import time
from collections import defaultdict, deque

import pyotp
import segno
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .crypto import decrypt_str
from .db import Owner

_ph = PasswordHasher()
MIN_PASSWORD_LENGTH = 12

# naive in-memory rate limit: 5 failed attempts per 15 minutes per client
_failures: dict[str, deque] = defaultdict(deque)
_WINDOW = 15 * 60
_MAX_FAILURES = 5


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(hash_: str, password: str) -> bool:
    try:
        return _ph.verify(hash_, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def password_problems(password: str) -> list[str]:
    problems = []
    if len(password) < MIN_PASSWORD_LENGTH:
        problems.append(f"at least {MIN_PASSWORD_LENGTH} characters")
    classes = sum([any(c.islower() for c in password), any(c.isupper() for c in password),
                   any(c.isdigit() for c in password), any(not c.isalnum() for c in password)])
    if classes < 3:
        problems.append("at least 3 of: lowercase, uppercase, digit, symbol")
    return problems


def new_totp_secret() -> str:
    return pyotp.random_base32()


def totp_uri(secret: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name="owner", issuer_name="Cleanup")


def totp_qr_svg(secret: str) -> str:
    return segno.make(totp_uri(secret)).svg_inline(scale=5)


def verify_totp(secret: str, code: str) -> bool:
    code = (code or "").strip().replace(" ", "")
    return bool(code) and pyotp.TOTP(secret).verify(code, valid_window=1)


def get_owner(db: Session) -> Owner | None:
    return db.scalars(select(Owner)).first()


def rate_limited(client: str) -> bool:
    q = _failures[client]
    now = time.time()
    while q and now - q[0] > _WINDOW:
        q.popleft()
    return len(q) >= _MAX_FAILURES


def record_failure(client: str) -> None:
    _failures[client].append(time.time())


def clear_failures(client: str) -> None:
    _failures.pop(client, None)


def check_login(owner: Owner, password: str, code: str) -> bool:
    return verify_password(owner.password_hash, password) and verify_totp(decrypt_str(owner.totp_secret_enc), code)


def is_logged_in(request: Request) -> bool:
    sess = request.session
    if not sess.get("auth"):
        return False
    max_age = get_settings().session_max_age_hours * 3600
    return time.time() - float(sess.get("login_at", 0)) < max_age


def require_login(request: Request) -> None:
    """Dependency for all protected routes."""
    if not is_logged_in(request):
        raise HTTPException(status_code=303, headers={"Location": "/login"})

