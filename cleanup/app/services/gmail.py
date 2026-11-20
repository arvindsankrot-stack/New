"""Gmail OAuth (gmail.readonly + gmail.send), account discovery scan, and sending."""
from __future__ import annotations

import base64
import json
import re
from email.message import EmailMessage
from email.utils import parseaddr
from typing import Optional

import httpx
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..crypto import decrypt_str, encrypt_str
from ..db import GmailAccount, SiteAccount, log_job, utcnow
from .http import domain_of

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
]

SIGNUP_QUERY = (
    'subject:(welcome OR verify OR verification OR confirm OR confirmation OR activate OR activation '
    'OR "sign up" OR signup OR registration OR registered OR "your account" OR "new account" OR "account created")'
)

# Domains that send mail on behalf of many sites, or are mailbox providers.
IGNORED_DOMAINS = {
    "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com",
    "sendgrid.net", "mailchimp.com", "mailgun.org", "amazonses.com", "mandrillapp.com", "mcsv.net",
    "rsgsv.net", "sparkpostmail.com", "postmarkapp.com", "customer.io", "intercom-mail.com",
}

_USERNAME_PATTERNS = [
    re.compile(r"user\s*name\s*(?:is|:)\s*[\"'“]?([A-Za-z0-9_.\-]{3,40})", re.I),
    re.compile(r"user\s*id\s*(?:is|:)\s*[\"'“]?([A-Za-z0-9_.\-]{3,40})", re.I),
    re.compile(r"(?:^|\s)u/([A-Za-z0-9_\-]{3,20})\b"),
    re.compile(r"\bwelcome(?: to [^,!]{1,40})?,\s*@?([A-Za-z0-9_.\-]{3,40})\s*[!.,]", re.I),
    re.compile(r"^(?:hi|hello|hey|dear)\s+@?([A-Za-z0-9_.\-]{3,40})\s*[,!]", re.I),
]
_GENERIC_WORDS = {"there", "user", "member", "customer", "friend", "everyone", "again", "back", "team", "you"}


def oauth_configured() -> bool:
    s = get_settings()
    return bool(s.google_client_id and s.google_client_secret)


def make_flow(state: Optional[str] = None) -> Flow:
    s = get_settings()
    config = {
        "web": {
            "client_id": s.google_client_id,
            "client_secret": s.google_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [s.oauth_redirect_uri],
        }
    }
    flow = Flow.from_client_config(config, scopes=SCOPES, state=state)
    flow.redirect_uri = s.oauth_redirect_uri
    return flow


def credentials_for(account: GmailAccount, db: Session | None = None) -> Credentials:
    info = json.loads(decrypt_str(account.token_enc))
    creds = Credentials.from_authorized_user_info(info, SCOPES)
    if not creds.valid and creds.refresh_token:
        creds.refresh(GoogleRequest())
        if db is not None:
            account.token_enc = encrypt_str(creds.to_json())
            db.commit()
    return creds


def service_for(account: GmailAccount, db: Session | None = None):
    return build("gmail", "v1", credentials=credentials_for(account, db), cache_discovery=False)


def save_account_from_flow(db: Session, flow: Flow) -> GmailAccount:
    creds = flow.credentials
    svc = build("gmail", "v1", credentials=creds, cache_discovery=False)
    email = svc.users().getProfile(userId="me").execute()["emailAddress"]
    acct = db.scalars(select(GmailAccount).where(GmailAccount.email == email)).first()
    if acct is None:
        acct = GmailAccount(email=email, token_enc=encrypt_str(creds.to_json()))
        db.add(acct)
    else:
        acct.token_enc = encrypt_str(creds.to_json())
    db.commit()
    return acct


def revoke(account: GmailAccount) -> bool:
    try:
        info = json.loads(decrypt_str(account.token_enc))
    except Exception:
        return False
    token = info.get("refresh_token") or info.get("token")
    if not token:
        return False
    try:
        r = httpx.post("https://oauth2.googleapis.com/revoke", params={"token": token},
                       headers={"content-type": "application/x-www-form-urlencoded"}, timeout=15)
        return r.status_code == 200
    except httpx.HTTPError:
        return False


# ---------------------------------------------------------------------------
# Account discovery
# ---------------------------------------------------------------------------

def extract_username(subject: str, snippet: str) -> str:
    for text in (snippet, subject):
        for pat in _USERNAME_PATTERNS:
            m = pat.search(text or "")
            if m:
                cand = m.group(1).strip(".-")
                if cand.lower() not in _GENERIC_WORDS and "@" not in cand:
                    return cand
    return ""


def sender_domain(from_header: str) -> str:
    addr = parseaddr(from_header)[1]
    if "@" not in addr:
        return ""
    return domain_of("http://" + addr.split("@", 1)[1])


def parse_headers(msg: dict) -> dict[str, str]:
    return {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}


def scan_account(db: Session, account: GmailAccount) -> int:
    """Read-only scan for sign-up / verification mail. Returns number of new site accounts."""
    s = get_settings()
    svc = service_for(account, db)
    added = 0
    seen: set[tuple[str, str]] = set()
    page_token = None
    fetched = 0
    while fetched < s.gmail_scan_max_messages:
        resp = svc.users().messages().list(userId="me", q=SIGNUP_QUERY, maxResults=100, pageToken=page_token).execute()
        for ref in resp.get("messages", []):
            fetched += 1
            msg = svc.users().messages().get(userId="me", id=ref["id"], format="metadata",
                                             metadataHeaders=["From", "Subject", "Date"]).execute()
            added += record_signup(db, account, parse_headers(msg), msg.get("snippet", ""), seen)
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    account.last_scan_at = utcnow()
    db.commit()
    log_job(db, "gmail_scan", f"{account.email}: scanned {fetched} messages, {added} new site accounts")
    return added


def record_signup(db: Session, account: GmailAccount, headers: dict[str, str], snippet: str,
                  seen: set[tuple[str, str]]) -> int:
    domain = sender_domain(headers.get("from", ""))
    if not domain or domain in IGNORED_DOMAINS:
        return 0
    subject = headers.get("subject", "")
    username = extract_username(subject, snippet)
    key = (domain, username)
    if key in seen:
        return 0
    seen.add(key)
    exists = db.scalars(select(SiteAccount).where(
        SiteAccount.gmail_account_id == account.id, SiteAccount.site_domain == domain,
        SiteAccount.username == username)).first()
    if exists:
        return 0
    db.add(SiteAccount(gmail_account_id=account.id, site_domain=domain, username=username,
                       evidence_subject=subject[:500], evidence_date=headers.get("date", "")[:64]))
    db.commit()
    return 1


# ---------------------------------------------------------------------------
# Sending (only ever called from an explicit user click)
# ---------------------------------------------------------------------------

def build_mime(sender: str, to: str, subject: str, body: str,
               attachment: tuple[str, str, bytes] | None = None,
               in_reply_to: str = "") -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = to
    msg["Subject"] = subject
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
        msg["References"] = in_reply_to
    msg.set_content(body)
    if attachment:
        filename, mime, data = attachment
        maintype, _, subtype = mime.partition("/")
        msg.add_attachment(data, maintype=maintype or "application", subtype=subtype or "octet-stream", filename=filename)
    return msg


def send_message(db: Session, account: GmailAccount, mime: EmailMessage, thread_id: str = "") -> dict:
    svc = service_for(account, db)
    raw = base64.urlsafe_b64encode(mime.as_bytes()).decode()
    body: dict = {"raw": raw}
    if thread_id:
        body["threadId"] = thread_id
    sent = svc.users().messages().send(userId="me", body=body).execute()
    # fetch our own Message-ID header so follow-ups can thread properly
    meta = svc.users().messages().get(userId="me", id=sent["id"], format="metadata",
                                      metadataHeaders=["Message-ID"]).execute()
    sent["message_id_header"] = parse_headers(meta).get("message-id", "")
    return sent


def thread_has_reply(db: Session, account: GmailAccount, thread_id: str) -> bool:
    """True if anyone other than the owner has written in the thread."""
    svc = service_for(account, db)
    thread = svc.users().threads().get(userId="me", id=thread_id, format="metadata",
                                       metadataHeaders=["From"]).execute()
    for msg in thread.get("messages", []):
        frm = parseaddr(parse_headers(msg).get("from", ""))[1].lower()
        if frm and frm != account.email.lower():
            return True
    return False
