"""Dashboard, seeds, Gmail accounts, jobs, documents, sites, settings."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import require_login
from ..crypto import delete_encrypted_file, read_encrypted_file, store_encrypted_file
from ..db import (SEED_KINDS, Document, Finding, GmailAccount, JobLog, Owner, RemovalRequest, Seed, SiteAccount,
                  SiteContact, get_db)
from ..services import classifier, face, gmail, search, tracker
from ..services.jobs import run_in_background
from ..services.wipe import wipe_everything
from ..web import redirect, render
from .auth_routes import reauth_ok

router = APIRouter(dependencies=[Depends(require_login)])

IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
DOC_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "application/pdf": ".pdf"}
MAX_UPLOAD = 8 * 1024 * 1024


@router.get("/")
def dashboard(request: Request, db: Session = Depends(get_db)):
    def count(model, *where):
        return db.scalar(select(func.count()).select_from(model).where(*where)) or 0

    stats = {
        "seeds": count(Seed),
        "gmail": count(GmailAccount),
        "site_accounts": count(SiteAccount),
        "findings": count(Finding),
        "pending_review": count(Finding, Finding.decision == "pending"),
        "high_risk_pending": count(Finding, Finding.decision == "pending", Finding.risk == "high"),
        "to_remove": count(Finding, Finding.decision == "remove"),
    }
    by_status = dict(db.execute(select(RemovalRequest.status, func.count()).group_by(RemovalRequest.status)).all())
    logs = db.scalars(select(JobLog).order_by(JobLog.id.desc()).limit(8)).all()
    return render(request, "dashboard.html", stats=stats, by_status=by_status, logs=logs,
                  face_available=face.FACE_AVAILABLE)


# --------------------------------------------------------------------- seeds

@router.get("/seeds")
def seeds_page(request: Request, db: Session = Depends(get_db)):
    seeds = db.scalars(select(Seed).order_by(Seed.kind, Seed.id)).all()
    owner = db.scalars(select(Owner)).first()
    return render(request, "seeds.html", seeds=seeds, kinds=[k for k in SEED_KINDS if k != "photo"], owner=owner,
                  face_available=face.FACE_AVAILABLE)


@router.post("/seeds")
def add_seed(request: Request, kind: str = Form(...), value: str = Form(...), db: Session = Depends(get_db)):
    if kind not in SEED_KINDS or kind == "photo":
        return redirect("/seeds", "Unknown seed type.", request)
    added = 0
    for line in value.splitlines():
        v = line.strip()
        if v and not db.scalars(select(Seed).where(Seed.kind == kind, Seed.value == v)).first():
            db.add(Seed(kind=kind, value=v[:512]))
            added += 1
    db.commit()
    return redirect("/seeds", f"Added {added} {kind} seed(s).", request)


@router.post("/seeds/photo")
async def add_photo(request: Request, photo: UploadFile = File(...), self_attested: str = Form(""),
                    label: str = Form(""), db: Session = Depends(get_db)):
    if self_attested != "yes":
        return redirect("/seeds", "Tick the box confirming the photo shows only your own face.", request)
    if photo.content_type not in IMAGE_TYPES:
        return redirect("/seeds", "Upload a JPEG, PNG or WebP image.", request)
    data = await photo.read()
    if len(data) > MAX_UPLOAD:
        return redirect("/seeds", "Image too large (max 8 MB).", request)
    seed = Seed(kind="photo", value=store_encrypted_file(data, IMAGE_TYPES[photo.content_type]), label=label[:255],
                self_attested=True)
    db.add(seed)
    db.commit()
    msg = "Reference photo stored (encrypted)."
    if face.FACE_AVAILABLE:
        try:
            face.enroll_reference(db, seed)
            msg += " Face enrolled for local matching."
        except face.FaceError as e:
            msg += f" Not enrolled: {e}"
    return redirect("/seeds", msg, request)


@router.get("/seeds/{seed_id}/photo")
def seed_photo(seed_id: int, db: Session = Depends(get_db)):
    seed = db.get(Seed, seed_id)
    if not seed or seed.kind != "photo":
        return Response(status_code=404)
    ext = seed.value.split(".")[-2] if seed.value.count(".") >= 2 else "jpg"
    mime = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}.get(ext, "image/jpeg")
    return Response(read_encrypted_file(seed.value), media_type=mime)


@router.post("/seeds/{seed_id}/delete")
def delete_seed(request: Request, seed_id: int, db: Session = Depends(get_db)):
    seed = db.get(Seed, seed_id)
    if seed:
        if seed.kind == "photo":
            delete_encrypted_file(seed.value)
        db.delete(seed)
        db.commit()
    return redirect("/seeds", "Seed deleted.", request)


@router.post("/settings/profile")
def save_profile(request: Request, full_name: str = Form(""), postal_address: str = Form(""),
                 country: str = Form(""), db: Session = Depends(get_db)):
    owner = db.scalars(select(Owner)).first()
    owner.full_name = full_name.strip()[:255]
    owner.postal_address = postal_address.strip()[:2000]
    owner.country = country.strip()[:64]
    db.commit()
    return redirect("/seeds", "Your details are saved. They are used only to sign removal requests.", request)


# --------------------------------------------------------------- gmail / accounts

@router.get("/accounts")
def accounts_page(request: Request, db: Session = Depends(get_db)):
    gmails = db.scalars(select(GmailAccount)).all()
    sites = db.scalars(select(SiteAccount).order_by(SiteAccount.site_domain)).all()
    return render(request, "accounts.html", gmails=gmails, sites=sites, oauth_ok=gmail.oauth_configured())


@router.get("/accounts/gmail/connect")
def gmail_connect(request: Request):
    if not gmail.oauth_configured():
        return redirect("/accounts", "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.", request)
    flow = gmail.make_flow()
    url, state = flow.authorization_url(access_type="offline", prompt="consent select_account",
                                        include_granted_scopes="true")
    request.session["oauth_state"] = state
    request.session["oauth_verifier"] = getattr(flow, "code_verifier", None)
    return redirect(url)


@router.get("/accounts/gmail/callback")
def gmail_callback(request: Request, db: Session = Depends(get_db)):
    state = request.session.pop("oauth_state", None)
    verifier = request.session.pop("oauth_verifier", None)
    if not state or request.query_params.get("state") != state:
        return redirect("/accounts", "OAuth state mismatch - try again.", request)
    if request.query_params.get("error"):
        return redirect("/accounts", f"Google returned: {request.query_params['error']}", request)
    flow = gmail.make_flow(state=state)
    if verifier:
        flow.code_verifier = verifier
    flow.fetch_token(code=request.query_params.get("code"))
    granted = set(flow.credentials.scopes or [])
    if not set(gmail.SCOPES) <= granted:
        return redirect("/accounts", "Both read-only and send permissions are needed.", request)
    acct = gmail.save_account_from_flow(db, flow)
    return redirect("/accounts", f"Connected {acct.email}.", request)


@router.post("/accounts/gmail/{acct_id}/scan")
def gmail_scan(request: Request, acct_id: int, db: Session = Depends(get_db)):
    acct = db.get(GmailAccount, acct_id)
    if not acct:
        return redirect("/accounts")
    started = run_in_background(f"gmail_scan_{acct_id}", lambda d: gmail.scan_account(d, d.get(GmailAccount, acct_id)))
    return redirect("/accounts", "Scan started in the background." if started else "A scan is already running.",
                    request)


@router.post("/accounts/gmail/{acct_id}/disconnect")
def gmail_disconnect(request: Request, acct_id: int, db: Session = Depends(get_db)):
    acct = db.get(GmailAccount, acct_id)
    if acct:
        ok = gmail.revoke(acct)
        db.delete(acct)
        db.commit()
        return redirect("/accounts", "Disconnected" + (" and token revoked." if ok else " (revoke call failed - "
                        "also remove access at myaccount.google.com/permissions)."), request)
    return redirect("/accounts")


@router.post("/accounts/site/{site_id}")
def update_site_account(request: Request, site_id: int, still_exists: str = Form(""), username: str = Form(None),
                        db: Session = Depends(get_db)):
    sa = db.get(SiteAccount, site_id)
    if sa:
        sa.still_exists = {"yes": True, "no": False}.get(still_exists)
        if username is not None:
            sa.username = username.strip()[:255]
        db.commit()
    return redirect("/accounts", None, request)


@router.post("/accounts/site/{site_id}/delete")
def delete_site_account(request: Request, site_id: int, db: Session = Depends(get_db)):
    sa = db.get(SiteAccount, site_id)
    if sa:
        db.delete(sa)
        db.commit()
    return redirect("/accounts", "Removed from list.", request)


# --------------------------------------------------------------------- jobs

@router.post("/jobs/search")
def job_search(request: Request):
    started = run_in_background("search", search.run_search_job)
    return redirect("/", "Search started - findings appear as they come in." if started else
                    "Search is already running.", request)


@router.post("/jobs/classify")
def job_classify(request: Request):
    started = run_in_background("classify", classifier.classify_pending)
    return redirect("/", "Classification started." if started else "Already running.", request)


@router.post("/jobs/face-score")
def job_face(request: Request):
    if not face.FACE_AVAILABLE:
        return redirect("/", "Local face matching is not installed.", request)
    started = run_in_background("face_score", face.score_all_images)
    return redirect("/", "Face matching started." if started else "Already running.", request)


@router.post("/jobs/tracker")
def job_tracker(request: Request):
    started = run_in_background("tracker", tracker.run_tracker)
    return redirect("/requests", "Re-check started." if started else "Already running.", request)


@router.post("/face/facecheck/{seed_id}")
def facecheck(request: Request, seed_id: int, db: Session = Depends(get_db)):
    seed = db.get(Seed, seed_id)
    if not seed:
        return redirect("/seeds")
    started = run_in_background(f"facecheck_{seed_id}", lambda d: face.facecheck_search(d, d.get(Seed, seed_id)))
    return redirect("/seeds", "FaceCheck search started." if started else "Already running.", request)


@router.post("/face/import")
def face_import(request: Request, service: str = Form(...), lines: str = Form(...), db: Session = Depends(get_db)):
    n = face.import_manual_results(db, lines, service.strip()[:64] or "manual")
    return redirect("/seeds", f"Imported {n} new result(s). Run face matching to score them.", request)


# ----------------------------------------------------------------- documents

@router.get("/documents")
def documents_page(request: Request, db: Session = Depends(get_db)):
    return render(request, "documents.html", docs=db.scalars(select(Document)).all())


@router.post("/documents")
async def upload_document(request: Request, label: str = Form(...), masked_confirmed: str = Form(""),
                          file: UploadFile = File(...), db: Session = Depends(get_db)):
    if masked_confirmed != "yes":
        return redirect("/documents", "Only masked Aadhaar (first 8 digits hidden) may be stored. Confirm the box.",
                        request)
    if file.content_type not in DOC_TYPES:
        return redirect("/documents", "Upload a PDF, JPEG or PNG.", request)
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        return redirect("/documents", "File too large (max 8 MB).", request)
    db.add(Document(label=label[:255], stored_name=store_encrypted_file(data, DOC_TYPES[file.content_type]),
                    original_filename=(file.filename or "document")[:255], mime=file.content_type,
                    masked_confirmed=True))
    db.commit()
    return redirect("/documents", "Document stored encrypted. It is attached only when you choose to.", request)


@router.post("/documents/{doc_id}/delete")
def delete_document(request: Request, doc_id: int, db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if doc:
        delete_encrypted_file(doc.stored_name)
        db.delete(doc)
        db.commit()
    return redirect("/documents", "Document deleted.", request)


# --------------------------------------------------------------------- sites

@router.get("/sites")
def sites_page(request: Request, db: Session = Depends(get_db)):
    return render(request, "sites.html", sites=db.scalars(select(SiteContact).order_by(SiteContact.domain)).all())


@router.post("/sites")
def save_site(request: Request, domain: str = Form(...), name: str = Form(""), privacy_email: str = Form(""),
              grievance_email: str = Form(""), privacy_form_url: str = Form(""), self_delete_url: str = Form(""),
              jurisdiction: str = Form("other"), notes: str = Form(""), db: Session = Depends(get_db)):
    domain = domain.strip().lower().removeprefix("www.")
    if not domain:
        return redirect("/sites")
    site = db.scalars(select(SiteContact).where(SiteContact.domain == domain)).first() or SiteContact(domain=domain)
    site.name, site.privacy_email, site.grievance_email = name.strip(), privacy_email.strip(), grievance_email.strip()
    site.privacy_form_url, site.self_delete_url = privacy_form_url.strip(), self_delete_url.strip()
    site.jurisdiction = jurisdiction if jurisdiction in ("in", "eu", "other") else "other"
    site.notes = notes.strip()
    db.add(site)
    db.commit()
    return redirect("/sites", f"Saved {domain}.", request)


# ------------------------------------------------------------------ settings

@router.get("/settings")
def settings_page(request: Request, db: Session = Depends(get_db)):
    logs = db.scalars(select(JobLog).order_by(JobLog.id.desc()).limit(50)).all()
    return render(request, "settings.html", logs=logs)


@router.post("/settings/wipe")
def wipe(request: Request, confirm_text: str = Form(...), password: str = Form(...), code: str = Form(...),
         db: Session = Depends(get_db)):
    if confirm_text.strip() != "WIPE EVERYTHING":
        return redirect("/settings", "Type WIPE EVERYTHING exactly to confirm.", request)
    if not reauth_ok(db, password, code):
        return redirect("/settings", "Password or code incorrect - nothing was deleted.", request)
    db.close()
    result = wipe_everything()
    from ..config import get_settings
    from ..db import get_engine
    from ..services.jobs import start_scheduler

    get_engine()  # fresh, empty encrypted database
    if get_settings().scheduler_enabled:
        start_scheduler()
    request.session.clear()
    msg = "Everything was deleted."
    if result["revoke_failed"]:
        msg += " Token revocation failed for: " + ", ".join(result["revoke_failed"]) + \
               " - remove access manually at myaccount.google.com/permissions."
    request.session["flash"] = msg
    return redirect("/setup")
