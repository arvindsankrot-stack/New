from __future__ import annotations

import time

from fastapi import APIRouter, Depends, Form, Request
from sqlalchemy.orm import Session

from .. import auth
from ..crypto import decrypt_str, encrypt_str
from ..db import Owner, get_db
from ..web import redirect, render

router = APIRouter()


@router.get("/setup")
def setup_page(request: Request, db: Session = Depends(get_db)):
    owner = auth.get_owner(db)
    if owner and owner.totp_confirmed:
        return redirect("/login")
    secret = request.session.get("setup_totp") or auth.new_totp_secret()
    request.session["setup_totp"] = secret
    return render(request, "setup.html", qr=auth.totp_qr_svg(secret), secret=secret, errors=[])


@router.post("/setup")
def setup_submit(request: Request, password: str = Form(...), password2: str = Form(...),
                 code: str = Form(...), full_name: str = Form(""), db: Session = Depends(get_db)):
    owner = auth.get_owner(db)
    if owner and owner.totp_confirmed:
        return redirect("/login")
    secret = request.session.get("setup_totp")
    errors = []
    if not secret:
        return redirect("/setup")
    if password != password2:
        errors.append("Passwords do not match.")
    problems = auth.password_problems(password)
    if problems:
        errors.append("Password needs " + ", ".join(problems) + ".")
    if not auth.verify_totp(secret, code):
        errors.append("The 6-digit code from your authenticator app is not correct.")
    if errors:
        return render(request, "setup.html", qr=auth.totp_qr_svg(secret), secret=secret, errors=errors)
    if owner is None:
        owner = Owner(password_hash="", totp_secret_enc="")
        db.add(owner)
    owner.password_hash = auth.hash_password(password)
    owner.totp_secret_enc = encrypt_str(secret)
    owner.totp_confirmed = True
    owner.full_name = full_name.strip()
    db.commit()
    request.session.clear()
    return redirect("/login", "Setup complete. Sign in with your password and a fresh code.", request)


@router.get("/login")
def login_page(request: Request, db: Session = Depends(get_db)):
    owner = auth.get_owner(db)
    if not owner or not owner.totp_confirmed:
        return redirect("/setup")
    return render(request, "login.html", error=None)


@router.post("/login")
def login_submit(request: Request, password: str = Form(...), code: str = Form(...), db: Session = Depends(get_db)):
    owner = auth.get_owner(db)
    if not owner or not owner.totp_confirmed:
        return redirect("/setup")
    client = request.client.host if request.client else "unknown"
    if auth.rate_limited(client):
        return render(request, "login.html", error="Too many failed attempts. Wait 15 minutes.")
    if not auth.check_login(owner, password, code):
        auth.record_failure(client)
        return render(request, "login.html", error="Wrong password or code.")
    auth.clear_failures(client)
    request.session.clear()
    request.session["auth"] = True
    request.session["login_at"] = time.time()
    return redirect("/")


@router.post("/logout")
def logout(request: Request):
    request.session.clear()
    return redirect("/login")


def reauth_ok(db: Session, password: str, code: str) -> bool:
    owner = auth.get_owner(db)
    return bool(owner) and auth.verify_password(owner.password_hash, password) and auth.verify_totp(
        decrypt_str(owner.totp_secret_enc), code)
