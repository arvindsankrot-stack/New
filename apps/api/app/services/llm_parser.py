"""
AI statement parser: turns raw statement text (from a PDF, CSV, or pasted
block) into structured recurring-charge line items.

Primary path: Claude (Anthropic API) with a forced tool call, which gives us
a validated JSON array back instead of parsing free-form prose.

Fallback path: a regex heuristic parser, used automatically when
ANTHROPIC_API_KEY is unset (local dev without a key) or if the API call
fails. It's far less accurate but keeps the ingestion endpoint usable.
"""

import json
import logging
import re
from datetime import date, datetime

from anthropic import Anthropic
from dateutil import parser as date_parser

from app.config import get_settings
from app.schemas.statement import ExtractedLineItem
from app.services.categorizer import categorize_vendor

logger = logging.getLogger(__name__)

_EXTRACTION_TOOL = {
    "name": "record_line_items",
    "description": "Records recurring-charge line items extracted from a bank/credit-card statement.",
    "input_schema": {
        "type": "object",
        "properties": {
            "line_items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "vendor_name": {
                            "type": "string",
                            "description": "Cleaned-up merchant/vendor name, e.g. 'Netflix' not 'NETFLIX.COM 866-579-7172'.",
                        },
                        "amount": {"type": "number", "description": "Absolute charge amount, positive."},
                        "currency": {"type": "string", "default": "USD"},
                        "charged_at": {"type": "string", "description": "ISO date YYYY-MM-DD of the charge."},
                        "billing_cycle_guess": {
                            "type": "string",
                            "enum": ["weekly", "monthly", "quarterly", "yearly", "one_time"],
                        },
                        "category_guess": {
                            "type": "string",
                            "enum": ["streaming", "utilities", "saas", "personal_services", "other"],
                        },
                        "is_recurring_guess": {
                            "type": "boolean",
                            "description": "False for one-off purchases (retail, restaurants, etc.) that are not subscriptions.",
                        },
                        "raw_text": {"type": "string", "description": "The original statement line this was extracted from."},
                    },
                    "required": ["vendor_name", "amount", "charged_at", "raw_text"],
                },
            }
        },
        "required": ["line_items"],
    },
}

_SYSTEM_PROMPT = """You are a financial statement analyst embedded in Subs-Guard, a subscription \
tracking app. You will be given raw text extracted from a bank or credit card statement (or \
pasted directly by the user). Identify every line item that represents a recurring subscription \
or membership charge (streaming, SaaS, utilities, gyms, meal kits, news, cloud services, etc).

Rules:
- Skip one-off purchases (groceries, restaurants, retail, gas, ATM withdrawals, transfers).
- Clean up noisy merchant strings into a recognizable vendor name.
- If the same vendor appears multiple times, include each occurrence as a separate line item \
  (the caller will deduplicate/group them) so billing-cycle and price-history detection work.
- Guess billing_cycle from context (amount size, frequency of repeats in the text) if not explicit; \
  default to "monthly" when unsure.
- Always call record_line_items exactly once with every recurring item found, even if the list is empty.
"""


def _parse_date_safe(value: str) -> date:
    try:
        return date_parser.parse(value).date()
    except (ValueError, OverflowError):
        return datetime.utcnow().date()


def parse_statement_text(raw_text: str) -> list[ExtractedLineItem]:
    settings = get_settings()
    if not settings.anthropic_api_key:
        logger.info("ANTHROPIC_API_KEY not set; using heuristic fallback parser")
        return _fallback_parse(raw_text)

    try:
        return _parse_with_claude(raw_text, settings.anthropic_api_key, settings.anthropic_model)
    except Exception:
        logger.exception("Claude statement parsing failed; falling back to heuristic parser")
        return _fallback_parse(raw_text)


def _parse_with_claude(raw_text: str, api_key: str, model: str) -> list[ExtractedLineItem]:
    client = Anthropic(api_key=api_key)

    # Statements can be long; cap input to keep latency/cost bounded. A
    # production system would chunk + merge instead of truncating.
    truncated_text = raw_text[:40_000]

    response = client.messages.create(
        model=model,
        max_tokens=4096,
        system=_SYSTEM_PROMPT,
        tools=[_EXTRACTION_TOOL],
        tool_choice={"type": "tool", "name": "record_line_items"},
        messages=[{"role": "user", "content": f"Statement text:\n\n{truncated_text}"}],
    )

    for block in response.content:
        if block.type == "tool_use" and block.name == "record_line_items":
            raw_items = block.input.get("line_items", [])
            return [
                ExtractedLineItem(
                    vendor_name=item["vendor_name"],
                    amount=abs(float(item["amount"])),
                    currency=item.get("currency", "USD"),
                    charged_at=_parse_date_safe(item["charged_at"]),
                    billing_cycle_guess=item.get("billing_cycle_guess", "monthly"),
                    category_guess=item.get("category_guess") or categorize_vendor(item["vendor_name"]),
                    is_recurring_guess=item.get("is_recurring_guess", True),
                    raw_text=item.get("raw_text", item["vendor_name"]),
                )
                for item in raw_items
                if item.get("is_recurring_guess", True)
            ]

    return []


# ---------------------------------------------------------------------------
# Heuristic fallback parser (no LLM required)
# ---------------------------------------------------------------------------

_LINE_PATTERN = re.compile(
    r"(?P<date>\d{1,2}[/\-]\d{1,2}(?:[/\-]\d{2,4})?)\s+"
    r"(?P<desc>[A-Za-z][A-Za-z0-9 .,'*&/#-]{2,60}?)\s+"
    r"\$?(?P<amount>-?\d{1,6}\.\d{2})\s*$"
)


def _fallback_parse(raw_text: str) -> list[ExtractedLineItem]:
    items: list[ExtractedLineItem] = []
    for line in raw_text.splitlines():
        match = _LINE_PATTERN.search(line.strip())
        if not match:
            continue
        amount = abs(float(match.group("amount")))
        if amount <= 0 or amount > 2000:
            continue  # guard against parsing totals/balances as line items
        vendor = match.group("desc").strip()
        items.append(
            ExtractedLineItem(
                vendor_name=vendor,
                amount=amount,
                currency="USD",
                charged_at=_parse_date_safe(match.group("date")),
                billing_cycle_guess="monthly",
                category_guess=categorize_vendor(vendor),
                is_recurring_guess=True,
                raw_text=line.strip(),
            )
        )
    return items
