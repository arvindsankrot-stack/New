from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel


class ExtractedLineItem(BaseModel):
    """One vendor/amount/date extraction produced by the LLM parser."""

    vendor_name: str
    amount: float
    currency: str = "USD"
    charged_at: date
    billing_cycle_guess: str = "monthly"
    category_guess: str = "other"
    is_recurring_guess: bool = True
    raw_text: str


class StatementStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    parsed = "parsed"
    failed = "failed"


class StatementIngestResponse(BaseModel):
    statement_id: str
    status: StatementStatus
    transactions_found: int
    subscriptions_detected: int
    subscriptions: list[str] = []  # subscription ids created/updated


class PasteTextRequest(BaseModel):
    text: str


class Statement(BaseModel):
    id: str
    user_id: str
    source_type: str
    original_filename: str | None = None
    status: StatementStatus
    error_message: str | None = None
    transactions_found: int
    subscriptions_detected: int
    created_at: datetime
    processed_at: datetime | None = None
