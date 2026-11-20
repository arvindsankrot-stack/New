"""SQLCipher-encrypted SQLite database and ORM models."""
from __future__ import annotations

import datetime as dt
from typing import Iterator, Optional
from urllib.parse import quote

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    event,
)
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

from .config import get_settings


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class Owner(Base):
    """The single user of the app."""

    __tablename__ = "owner"
    id: Mapped[int] = mapped_column(primary_key=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    totp_secret_enc: Mapped[str] = mapped_column(Text)
    totp_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    full_name: Mapped[str] = mapped_column(String(255), default="")
    postal_address: Mapped[str] = mapped_column(Text, default="")
    country: Mapped[str] = mapped_column(String(64), default="India")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)


SEED_KINDS = ("username", "email", "phone", "name", "photo")


class Seed(Base):
    __tablename__ = "seeds"
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))
    value: Mapped[str] = mapped_column(String(512))  # for photos: encrypted file name
    label: Mapped[str] = mapped_column(String(255), default="")
    self_attested: Mapped[bool] = mapped_column(Boolean, default=False)  # photos: "this is my own face"
    face_encoding_enc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)


class GmailAccount(Base):
    __tablename__ = "gmail_accounts"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    token_enc: Mapped[str] = mapped_column(Text)
    connected_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)
    last_scan_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime, nullable=True)


class SiteAccount(Base):
    """A site where the owner (probably) had an account, discovered from Gmail."""

    __tablename__ = "site_accounts"
    __table_args__ = (UniqueConstraint("gmail_account_id", "site_domain", "username"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    gmail_account_id: Mapped[int] = mapped_column(ForeignKey("gmail_accounts.id", ondelete="CASCADE"))
    site_domain: Mapped[str] = mapped_column(String(255), index=True)
    username: Mapped[str] = mapped_column(String(255), default="")
    evidence_subject: Mapped[str] = mapped_column(Text, default="")
    evidence_date: Mapped[str] = mapped_column(String(64), default="")
    still_exists: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)  # set by user
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)
    gmail_account: Mapped[GmailAccount] = relationship()


class Finding(Base):
    __tablename__ = "findings"
    id: Mapped[int] = mapped_column(primary_key=True)
    url: Mapped[str] = mapped_column(String(2048), unique=True)
    title: Mapped[str] = mapped_column(Text, default="")
    snippet: Mapped[str] = mapped_column(Text, default="")
    thumbnail_url: Mapped[str] = mapped_column(String(2048), default="")
    image_url: Mapped[str] = mapped_column(String(2048), default="")
    source: Mapped[str] = mapped_column(String(32))  # google_cse | brave | reddit | facecheck | manual
    site_domain: Mapped[str] = mapped_column(String(255), index=True, default="")
    seed_id: Mapped[Optional[int]] = mapped_column(ForeignKey("seeds.id", ondelete="SET NULL"), nullable=True)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    face_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # classification
    ownership: Mapped[str] = mapped_column(String(16), default="unknown")  # mine | not_mine | unsure | unknown
    content_type: Mapped[str] = mapped_column(String(16), default="other")
    risk: Mapped[str] = mapped_column(String(8), default="low")
    reason: Mapped[str] = mapped_column(Text, default="")
    classified_by: Mapped[str] = mapped_column(String(32), default="")
    # review
    decision: Mapped[str] = mapped_column(String(8), default="pending")  # pending | remove | keep
    # text used to decide "content is gone" on re-check
    fingerprint: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)
    requests: Mapped[list["RemovalRequest"]] = relationship(back_populates="finding", cascade="all, delete-orphan")


REQUEST_STATUSES = ("Draft", "Sent", "Acknowledged", "Removed", "Rejected")


class RemovalRequest(Base):
    __tablename__ = "removal_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    finding_id: Mapped[int] = mapped_column(ForeignKey("findings.id", ondelete="CASCADE"))
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("removal_requests.id", ondelete="SET NULL"), nullable=True)
    route: Mapped[str] = mapped_column(String(32))
    channel: Mapped[str] = mapped_column(String(16))  # email | link | form
    to_address: Mapped[str] = mapped_column(String(512), default="")
    action_url: Mapped[str] = mapped_column(String(2048), default="")
    subject: Mapped[str] = mapped_column(Text, default="")
    body: Mapped[str] = mapped_column(Text, default="")
    gmail_account_id: Mapped[Optional[int]] = mapped_column(ForeignKey("gmail_accounts.id", ondelete="SET NULL"), nullable=True)
    attachment_document_id: Mapped[Optional[int]] = mapped_column(ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="Draft")
    is_followup: Mapped[bool] = mapped_column(Boolean, default=False)
    gmail_thread_id: Mapped[str] = mapped_column(String(64), default="")
    gmail_message_id: Mapped[str] = mapped_column(String(255), default="")
    sent_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime, nullable=True)
    last_checked_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime, nullable=True)
    last_check_result: Mapped[str] = mapped_column(Text, default="")
    reply_seen_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    finding: Mapped[Finding] = relationship(back_populates="requests")
    gmail_account: Mapped[Optional[GmailAccount]] = relationship()


class Document(Base):
    """Identity documents (masked Aadhaar only). Attached only on explicit request."""

    __tablename__ = "documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(255))
    original_filename: Mapped[str] = mapped_column(String(255))
    mime: Mapped[str] = mapped_column(String(128))
    masked_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)


class SiteContact(Base):
    """Where to send removal requests for a site. Editable by the owner."""

    __tablename__ = "site_contacts"
    id: Mapped[int] = mapped_column(primary_key=True)
    domain: Mapped[str] = mapped_column(String(255), unique=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    privacy_email: Mapped[str] = mapped_column(String(320), default="")
    grievance_email: Mapped[str] = mapped_column(String(320), default="")
    privacy_form_url: Mapped[str] = mapped_column(String(2048), default="")
    self_delete_url: Mapped[str] = mapped_column(String(2048), default="")
    jurisdiction: Mapped[str] = mapped_column(String(8), default="other")  # in | eu | other
    notes: Mapped[str] = mapped_column(Text, default="")


class JobLog(Base):
    __tablename__ = "job_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    job: Mapped[str] = mapped_column(String(64))
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)


# ---------------------------------------------------------------------------
# Engine / session management
# ---------------------------------------------------------------------------

_engine: Optional[Engine] = None
_SessionLocal: Optional[sessionmaker] = None


def get_engine() -> Engine:
    global _engine, _SessionLocal
    if _engine is None:
        s = get_settings()
        url = f"sqlite+pysqlcipher://:{quote(s.db_key, safe='')}@/{s.db_path}"
        _engine = create_engine(url, connect_args={"check_same_thread": False})

        @event.listens_for(_engine, "connect")
        def _pragmas(dbapi_conn, _):  # noqa: ANN001
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

        Base.metadata.create_all(_engine)
        _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False)
        from .site_directory import seed_site_contacts

        with _SessionLocal() as db:
            seed_site_contacts(db)
    return _engine


def dispose_engine() -> None:
    global _engine, _SessionLocal
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None


def SessionLocal() -> Session:
    get_engine()
    assert _SessionLocal is not None
    return _SessionLocal()


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def log_job(db: Session, job: str, message: str) -> None:
    db.add(JobLog(job=job, message=message[:4000]))
    db.commit()
