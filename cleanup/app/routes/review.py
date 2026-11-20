"""Review dashboard, removal drafts, sending (explicit click only) and tracker."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Form, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import require_login
from ..crypto import read_encrypted_file
from ..db import REQUEST_STATUSES, Document, Finding, GmailAccount, RemovalRequest, get_db, utcnow
from ..services import gmail, removal, tracker
from ..web import redirect, render

router = APIRouter(dependencies=[Depends(require_login)])

RISK_ORDER = {"high": 0, "medium": 1, "low": 2}


@router.get("/findings")
def findings_page(request: Request, site: str = "", risk: str = "", decision: str = "pending", ownership: str = "",
                  content_type: str = "", db: Session = Depends(get_db)):
    q = select(Finding)
    if site:
        q = q.where(Finding.site_domain == site)
    if risk:
        q = q.where(Finding.risk == risk)
    if decision:
        q = q.where(Finding.decision == decision)
    if ownership:
        q = q.where(Finding.ownership == ownership)
    if content_type:
        q = q.where(Finding.content_type == content_type)
    findings = sorted(db.scalars(q.limit(500)).all(),
                      key=lambda f: (RISK_ORDER.get(f.risk, 3), f.ownership != "mine", -(f.face_score or 0), f.id))
    sites = [r[0] for r in db.execute(select(Finding.site_domain, func.count()).group_by(Finding.site_domain)
                                      .order_by(func.count().desc())).all()]
    filters = {"site": site, "risk": risk, "decision": decision, "ownership": ownership, "content_type": content_type}
    return render(request, "findings.html", findings=findings, sites=sites, filters=filters)


@router.post("/findings/{fid}/decision")
def set_decision(request: Request, fid: int, decision: str = Form(...), db: Session = Depends(get_db)):
    f = db.get(Finding, fid)
    if f and decision in ("remove", "keep", "pending"):
        f.decision = decision
        db.commit()
    if request.headers.get("hx-request"):
        return render(request, "partials/finding_row.html", f=f)
    return redirect(request.headers.get("referer") or "/findings")


@router.post("/findings/{fid}/ownership")
def set_ownership(request: Request, fid: int, ownership: str = Form(...), db: Session = Depends(get_db)):
    f = db.get(Finding, fid)
    if f and ownership in ("mine", "not_mine", "unsure"):
        f.ownership = ownership
        f.classified_by = "you"
        db.commit()
    return redirect(f"/findings/{fid}")


@router.get("/findings/{fid}")
def finding_detail(request: Request, fid: int, db: Session = Depends(get_db)):
    f = db.get(Finding, fid)
    if not f:
        return redirect("/findings")
    return render(request, "finding.html", f=f, routes=removal.suggest_routes(db, f),
                  site=removal.site_contact(db, f.site_domain))


@router.post("/findings/{fid}/draft")
def create_draft(request: Request, fid: int, route: str = Form(...), db: Session = Depends(get_db)):
    f = db.get(Finding, fid)
    if not f:
        return redirect("/findings")
    if f.decision != "remove":
        return redirect(f"/findings/{fid}", "Mark this finding as Remove before drafting a request.", request)
    req = removal.draft_request(db, f, route)
    return redirect(f"/requests/{req.id}")


# ------------------------------------------------------------------ requests

@router.get("/requests")
def requests_page(request: Request, status: str = "", db: Session = Depends(get_db)):
    q = select(RemovalRequest).order_by(RemovalRequest.updated_at.desc())
    if status:
        q = q.where(RemovalRequest.status == status)
    reqs = db.scalars(q.limit(500)).all()
    return render(request, "requests.html", reqs=reqs, status=status, statuses=REQUEST_STATUSES,
                  routes=removal.ROUTES)


@router.get("/requests/{rid}")
def request_detail(request: Request, rid: int, db: Session = Depends(get_db)):
    req = db.get(RemovalRequest, rid)
    if not req:
        return redirect("/requests")
    return render(request, "request.html", req=req, gmails=db.scalars(select(GmailAccount)).all(),
                  docs=db.scalars(select(Document)).all(), routes=removal.ROUTES,
                  wording=removal.check_wording(req.body), children=db.scalars(
                      select(RemovalRequest).where(RemovalRequest.parent_id == rid)).all())


@router.post("/requests/{rid}/save")
def save_request(request: Request, rid: int, to_address: str = Form(""), subject: str = Form(""),
                 body: str = Form(""), gmail_account_id: str = Form(""), db: Session = Depends(get_db)):
    req = db.get(RemovalRequest, rid)
    if not req or req.status != "Draft":
        return redirect(f"/requests/{rid}", "Only drafts can be edited.", request)
    req.to_address = to_address.strip()
    req.subject = subject.strip()
    req.body = body.replace("\r\n", "\n")
    req.gmail_account_id = int(gmail_account_id) if gmail_account_id.isdigit() else None
    if req.to_address and req.channel == "form":
        req.channel = "email"
    db.commit()
    return redirect(f"/requests/{rid}", "Draft saved.", request)


@router.post("/requests/{rid}/send")
def send_request(request: Request, rid: int, reviewed: str = Form(""), attach_document_id: str = Form(""),
                 site_asked_for_id: str = Form(""), confirm_attachment: str = Form(""),
                 db: Session = Depends(get_db)):
    """The only code path that sends email. Requires an explicit click + review checkbox."""
    req = db.get(RemovalRequest, rid)
    if not req or req.status != "Draft" or req.channel != "email":
        return redirect(f"/requests/{rid}", "This request cannot be sent by email.", request)
    if reviewed != "yes":
        return redirect(f"/requests/{rid}", "Tick 'I have reviewed this message' to send.", request)
    if not req.to_address or "@" not in req.to_address:
        return redirect(f"/requests/{rid}", "Add a recipient email address first.", request)
    if not req.gmail_account:
        return redirect(f"/requests/{rid}", "Choose which Gmail account to send from (and save).", request)
    problems = removal.check_wording(req.body + " " + req.subject)
    if problems:
        return redirect(f"/requests/{rid}", "Remove wording that could read as a legal threat or a claim to be "
                        "a lawyer: " + ", ".join(problems), request)
    attachment = None
    if attach_document_id:
        if site_asked_for_id != "yes" or confirm_attachment != "yes":
            return redirect(f"/requests/{rid}", "ID documents are attached only when the site asked for one and "
                            "you confirm both boxes.", request)
        doc = db.get(Document, int(attach_document_id)) if attach_document_id.isdigit() else None
        if not doc or not doc.masked_confirmed:
            return redirect(f"/requests/{rid}", "Document not found.", request)
        attachment = (doc.original_filename, doc.mime, read_encrypted_file(doc.stored_name))
        req.attachment_document_id = doc.id
    in_reply_to = ""
    if req.is_followup and req.parent_id:
        parent = db.get(RemovalRequest, req.parent_id)
        in_reply_to = parent.gmail_message_id if parent else ""
    mime = gmail.build_mime(req.gmail_account.email, req.to_address, req.subject, req.body, attachment, in_reply_to)
    try:
        sent = gmail.send_message(db, req.gmail_account, mime, req.gmail_thread_id)
    except Exception as e:  # noqa: BLE001
        return redirect(f"/requests/{rid}", f"Sending failed: {e}", request)
    req.status = "Sent"
    req.sent_at = utcnow()
    req.gmail_thread_id = sent.get("threadId", "")
    req.gmail_message_id = sent.get("message_id_header", "")
    if req.is_followup and req.parent_id:
        parent = db.get(RemovalRequest, req.parent_id)
        if parent:
            # the follow-up resets the 15-day clock on the original
            parent.sent_at = req.sent_at
            parent.notes = (parent.notes + f"\nFollow-up #{req.id} sent {req.sent_at:%Y-%m-%d}").strip()
    db.commit()
    return redirect(f"/requests/{rid}", f"Sent from {req.gmail_account.email}.", request)


@router.post("/requests/{rid}/mark-sent")
def mark_sent(request: Request, rid: int, reviewed: str = Form(""), db: Session = Depends(get_db)):
    """For link / form routes the owner does the action themselves, then confirms here."""
    req = db.get(RemovalRequest, rid)
    if not req or req.status != "Draft" or req.channel == "email":
        return redirect(f"/requests/{rid}")
    if reviewed != "yes":
        return redirect(f"/requests/{rid}", "Tick the box to confirm you completed this step.", request)
    req.status = "Sent"
    req.sent_at = utcnow()
    db.commit()
    return redirect(f"/requests/{rid}", "Marked as sent. The tracker will re-check the URL.", request)


@router.post("/requests/{rid}/status")
def set_status(request: Request, rid: int, status: str = Form(...), db: Session = Depends(get_db)):
    """Manual status changes. 'Removed' is deliberately not allowed here: only a
    re-check that finds the page/image gone can mark an item Removed."""
    req = db.get(RemovalRequest, rid)
    if req and status in ("Acknowledged", "Rejected") and req.status in ("Sent", "Acknowledged", "Rejected"):
        req.status = status
        db.commit()
    elif req and status == "Sent" and req.status == "Rejected":
        req.status = "Sent"
        db.commit()
    return redirect(f"/requests/{rid}")


@router.post("/requests/{rid}/check")
def check_now(request: Request, rid: int, db: Session = Depends(get_db)):
    req = db.get(RemovalRequest, rid)
    if not req:
        return redirect("/requests")
    if req.status not in ("Sent", "Acknowledged"):
        return redirect(f"/requests/{rid}", "Only sent requests are re-checked.", request)
    status = tracker.check_request(db, req)
    return redirect(f"/requests/{rid}", f"Checked: {req.last_check_result}. Status: {status}.", request)


@router.post("/requests/{rid}/delete")
def delete_request(request: Request, rid: int, db: Session = Depends(get_db)):
    req = db.get(RemovalRequest, rid)
    if req and req.status == "Draft":
        fid = req.finding_id
        db.delete(req)
        db.commit()
        return redirect(f"/findings/{fid}", "Draft deleted.", request)
    return redirect(f"/requests/{rid}", "Only drafts can be deleted.", request)
