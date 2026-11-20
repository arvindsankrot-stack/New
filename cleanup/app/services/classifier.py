"""Labels findings: mine / not mine, content type, risk, with a short reason.

Uses Claude when ANTHROPIC_API_KEY is set; otherwise a local rule-based fallback.
Only what is needed is sent to the API: the finding's URL/title/snippet, the
owner's usernames and name variants, and booleans saying whether the owner's
email / phone appear in the text (the email and phone themselves are not sent).
"""
from __future__ import annotations

import json
import re

import anthropic
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import Finding, Seed, log_job

CONTENT_TYPES = ["photo", "comment", "post", "profile", "address", "contact", "other"]
RISKS = ["high", "medium", "low"]
OWNERSHIP = ["mine", "not_mine", "unsure"]

SCHEMA = {
    "type": "object",
    "properties": {
        "ownership": {"type": "string", "enum": OWNERSHIP},
        "content_type": {"type": "string", "enum": CONTENT_TYPES},
        "risk": {"type": "string", "enum": RISKS},
        "reason": {"type": "string"},
    },
    "required": ["ownership", "content_type", "risk", "reason"],
    "additionalProperties": False,
}

SYSTEM = """You help one person find content about themselves that they posted online in the past, so they can decide whether to ask for its removal.

For each search result, decide:
- ownership: "mine" if the content was very likely posted by, or is about, this person (matching username on that site, their name together with other matching details, a high face-match score); "not_mine" if it is clearly a different person or unrelated; "unsure" otherwise. A common name alone is not enough for "mine".
- content_type: photo, comment, post, profile, address (a home/postal address), contact (email or phone number shown publicly), or other.
- risk: "high" for a home address, phone number, government ID, photos of the person or their family, or anything that enables locating or impersonating them; "medium" for profiles and personal opinions/details tied to their real name; "low" for innocuous pseudonymous comments.
- reason: one short sentence a non-expert can read."""


def _seed_context(db: Session) -> dict:
    seeds = db.scalars(select(Seed)).all()
    return {
        "usernames": [s.value for s in seeds if s.kind == "username"],
        "names": [s.value for s in seeds if s.kind == "name"],
        "emails": [s.value.lower() for s in seeds if s.kind == "email"],
        "phones": ["".join(c for c in s.value if c.isdigit())[-10:] for s in seeds if s.kind == "phone"],
    }


def _signals(f: Finding, ctx: dict) -> dict:
    text = f"{f.url} {f.title} {f.snippet}"
    low = text.lower()
    digits = re.sub(r"\D", "", text)
    return {
        "owner_email_in_text": any(e and e in low for e in ctx["emails"]),
        "owner_phone_in_text": any(p and len(p) >= 8 and p in digits for p in ctx["phones"]),
        "matching_usernames": [u for u in ctx["usernames"] if u.lower() in low],
        "matching_names": [n for n in ctx["names"] if n.lower() in low],
        "reddit_author_is_owner": (f.meta or {}).get("author", "").lower() in {u.lower() for u in ctx["usernames"]},
    }


ADDRESS_RE = re.compile(r"\b(\d{6}|pin\s*code|flat\s*no|house\s*no|street|road|nagar|colony|sector\s*\d+)\b", re.I)


def heuristic(f: Finding, ctx: dict) -> dict:
    sig = _signals(f, ctx)
    text = f"{f.title} {f.snippet}"
    ctype = f.content_type if f.content_type in CONTENT_TYPES and f.content_type != "other" else "other"
    if sig["owner_phone_in_text"] or sig["owner_email_in_text"]:
        ctype = "contact"
    if ADDRESS_RE.search(text) and (sig["matching_names"] or sig["owner_phone_in_text"]):
        ctype = "address"
    if sig["reddit_author_is_owner"] or (f.face_score or 0) >= 0.55 or sig["owner_email_in_text"] or sig["owner_phone_in_text"]:
        ownership = "mine"
    elif sig["matching_usernames"] or sig["matching_names"]:
        ownership = "unsure"
    else:
        ownership = "unsure"
    risk = "high" if ctype in ("address", "contact", "photo") else ("medium" if ctype == "profile" or sig["matching_names"] else "low")
    reasons = []
    if sig["reddit_author_is_owner"]:
        reasons.append("posted by one of your usernames")
    if f.face_score is not None:
        reasons.append(f"face match score {f.face_score:.2f}")
    if sig["owner_email_in_text"] or sig["owner_phone_in_text"]:
        reasons.append("your email/phone appears in the text")
    if sig["matching_names"]:
        reasons.append("your name appears in the text")
    return {"ownership": ownership, "content_type": ctype, "risk": risk,
            "reason": "; ".join(reasons) or "no strong signal; please check manually"}


def classify_with_claude(client: anthropic.Anthropic, f: Finding, ctx: dict) -> dict | None:
    s = get_settings()
    item = {
        "url": f.url, "site": f.site_domain, "source": f.source, "title": f.title, "snippet": f.snippet[:1500],
        "face_match_score": f.face_score, "subreddit": (f.meta or {}).get("subreddit"),
        "signals": _signals(f, ctx),
        "owner_usernames": ctx["usernames"], "owner_name_variants": ctx["names"],
    }
    resp = client.beta.messages.create(
        model=s.classifier_model,
        max_tokens=2000,
        system=SYSTEM,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
        messages=[{"role": "user", "content": "Classify this search result:\n" + json.dumps(item, ensure_ascii=False)}],
    )
    if resp.stop_reason == "refusal":
        return None
    text = next((b.text for b in resp.content if b.type == "text"), "")
    return json.loads(text) if text else None


def classify_pending(db: Session, only_unclassified: bool = True) -> int:
    s = get_settings()
    ctx = _seed_context(db)
    q = select(Finding)
    if only_unclassified:
        q = q.where(Finding.classified_by == "")
    findings = db.scalars(q).all()
    client = anthropic.Anthropic(api_key=s.anthropic_api_key) if s.anthropic_api_key else None
    n = 0
    for f in findings:
        result, by = None, "rules"
        if client is not None:
            try:
                result = classify_with_claude(client, f, ctx)
                by = "claude"
            except anthropic.APIStatusError as e:
                log_job(db, "classify", f"{f.url}: API error {e.status_code}")
            except anthropic.APIConnectionError as e:
                log_job(db, "classify", f"{f.url}: connection error {e}")
            except (json.JSONDecodeError, KeyError) as e:
                log_job(db, "classify", f"{f.url}: bad response {e}")
        if result is None:
            result, by = heuristic(f, ctx), "rules"
        f.ownership = result["ownership"]
        f.content_type = result["content_type"]
        f.risk = result["risk"]
        f.reason = result["reason"][:1000]
        f.classified_by = by
        db.commit()
        n += 1
    return n
