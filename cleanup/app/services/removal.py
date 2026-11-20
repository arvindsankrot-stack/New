"""Removal engine: picks routes for a finding and drafts requests from templates.
Drafts are never sent from here - sending happens only in the route handler for
an explicit Send click."""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlencode

from jinja2 import Environment, FileSystemLoader, StrictUndefined
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import Finding, Owner, RemovalRequest, Seed, SiteAccount, SiteContact, utcnow
from ..site_directory import GOOGLE_REFRESH_OUTDATED_URL

TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "removal"
_env = Environment(loader=FileSystemLoader(TEMPLATE_DIR), undefined=StrictUndefined,
                   keep_trailing_newline=False, autoescape=False)

ROUTES = {
    "self_delete": "Delete it yourself (account still exists)",
    "subreddit_mod": "Message the subreddit moderators",
    "platform_privacy": "Platform privacy / support request",
    "dpdp": "DPDP Act 2023 erasure request (Grievance Officer)",
    "gdpr": "GDPR Art. 17 erasure request",
    "google_refresh": "Google 'Refresh Outdated Content' request",
}

# Wording that must never appear in a request: we write as an individual,
# not a lawyer, and make no threats.
FORBIDDEN_PHRASES = ["lawyer", "attorney", "advocate", "legal action", "sue ", "lawsuit", "on behalf of my client",
                     "police", "court"]


@dataclass
class RouteOption:
    route: str
    label: str
    channel: str  # email | link | form
    recommended: bool = False
    why: str = ""


def site_contact(db: Session, domain: str) -> SiteContact | None:
    return db.scalars(select(SiteContact).where(SiteContact.domain == domain)).first()


def owner_usernames(db: Session) -> set[str]:
    names = {s.value.lower() for s in db.scalars(select(Seed).where(Seed.kind == "username")).all()}
    names |= {a.username.lower() for a in db.scalars(select(SiteAccount)).all() if a.username}
    return names


def account_on_site(db: Session, domain: str) -> SiteAccount | None:
    return db.scalars(select(SiteAccount).where(SiteAccount.site_domain == domain)).first()


def suggest_routes(db: Session, f: Finding) -> list[RouteOption]:
    site = site_contact(db, f.site_domain)
    acct = account_on_site(db, f.site_domain)
    meta = f.meta or {}
    author = (meta.get("author") or "").lower()
    own_post = bool(author and author in owner_usernames(db))
    opts: list[RouteOption] = []

    if own_post or (acct and acct.still_exists is not False):
        opts.append(RouteOption("self_delete", ROUTES["self_delete"], "link", why=(
            "Posted from one of your usernames" if own_post else f"You had an account on {f.site_domain}")))
    if meta.get("subreddit") and not own_post:
        opts.append(RouteOption("subreddit_mod", ROUTES["subreddit_mod"], "link",
                                why=f"Posted in r/{meta['subreddit']} by someone else"))
    jurisdiction = site.jurisdiction if site else "other"
    if jurisdiction == "in" or (site and site.grievance_email):
        opts.append(RouteOption("dpdp", ROUTES["dpdp"], "email" if site and site.grievance_email else "form",
                                why="Site has an Indian Grievance Officer"))
    if jurisdiction == "eu":
        opts.append(RouteOption("gdpr", ROUTES["gdpr"], "email" if site and site.privacy_email else "form",
                                why="Site is based in the EU"))
    opts.append(RouteOption("platform_privacy", ROUTES["platform_privacy"],
                            "email" if site and site.privacy_email else "form", why="General fallback"))
    if jurisdiction not in ("in",) and not any(o.route == "dpdp" for o in opts):
        opts.append(RouteOption("dpdp", ROUTES["dpdp"], "email" if site and site.grievance_email else "form",
                                why="Use if the site offers its service in India"))
    if jurisdiction != "eu":
        opts.append(RouteOption("gdpr", ROUTES["gdpr"], "email" if site and site.privacy_email else "form",
                                why="Use if the site is EU-based or targets EU users"))
    opts.append(RouteOption("google_refresh", ROUTES["google_refresh"], "link",
                            why="After the page is gone, so Google drops it from results"))
    if opts:
        opts[0].recommended = True
    return opts


def _context(db: Session, f: Finding, extra: dict | None = None) -> dict:
    owner = db.scalars(select(Owner)).first()
    site = site_contact(db, f.site_domain)
    acct = account_on_site(db, f.site_domain)
    ctx = {
        "owner_name": (owner.full_name if owner else "") or "[your full name]",
        "owner_address": (owner.postal_address if owner else "") or "",
        "owner_country": (owner.country if owner else "") or "",
        "url": f.url,
        "title": f.title,
        "content_type": f.content_type,
        "site_name": (site.name if site and site.name else f.site_domain),
        "site_domain": f.site_domain,
        "subreddit": (f.meta or {}).get("subreddit") or "",
        "account_username": acct.username if acct else "",
        "today": dt.date.today().strftime("%d %B %Y"),
        "describe": _describe(f),
    }
    if extra:
        ctx.update(extra)
    return ctx


def _describe(f: Finding) -> str:
    return {
        "photo": "a photograph of me",
        "comment": "a comment I wrote",
        "post": "a post I wrote",
        "profile": "a profile containing my personal details",
        "address": "my home address",
        "contact": "my personal contact details",
    }.get(f.content_type, "personal information about me")


def render(template: str, ctx: dict) -> tuple[str, str]:
    """Return (subject, body). Template's first line is 'Subject: ...'."""
    text = _env.get_template(template).render(**ctx).strip() + "\n"
    first, _, body = text.partition("\n")
    subject = first.removeprefix("Subject:").strip()
    return subject, body.lstrip("\n")


def draft_request(db: Session, f: Finding, route: str) -> RemovalRequest:
    if route not in ROUTES:
        raise ValueError(f"unknown route {route}")
    site = site_contact(db, f.site_domain)
    ctx = _context(db, f)
    subject, body = render(f"{route}.txt", ctx)
    channel, to, action_url = "email", "", ""
    if route == "self_delete":
        channel = "link"
        action_url = (site.self_delete_url if site and site.self_delete_url else f.url)
    elif route == "subreddit_mod":
        channel = "link"
        action_url = "https://www.reddit.com/message/compose?" + urlencode(
            {"to": f"/r/{ctx['subreddit']}", "subject": subject, "message": body})
    elif route == "google_refresh":
        channel = "link"
        action_url = GOOGLE_REFRESH_OUTDATED_URL
    elif route == "dpdp":
        to = site.grievance_email if site else ""
        if not to:
            channel, action_url = "form", (site.privacy_form_url if site else "")
    else:  # platform_privacy, gdpr
        to = site.privacy_email if site else ""
        if not to:
            channel, action_url = "form", (site.privacy_form_url if site else "")
    req = RemovalRequest(finding_id=f.id, route=route, channel=channel, to_address=to, action_url=action_url,
                         subject=subject, body=body, status="Draft")
    db.add(req)
    db.commit()
    return req


def draft_followup(db: Session, original: RemovalRequest) -> RemovalRequest:
    f = original.finding
    ctx = _context(db, f, {
        "original_date": original.sent_at.strftime("%d %B %Y") if original.sent_at else "",
        "original_subject": original.subject,
        "days": (utcnow() - original.sent_at).days if original.sent_at else 0,
    })
    subject, body = render("followup.txt", ctx)
    req = RemovalRequest(finding_id=f.id, parent_id=original.id, route=original.route, channel=original.channel,
                         to_address=original.to_address, action_url=original.action_url, subject=subject, body=body,
                         gmail_account_id=original.gmail_account_id, status="Draft", is_followup=True,
                         gmail_thread_id=original.gmail_thread_id)
    db.add(req)
    db.commit()
    return req


def check_wording(body: str) -> list[str]:
    low = body.lower()
    return [p.strip() for p in FORBIDDEN_PHRASES if p in low]
