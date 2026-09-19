"""
Ingestion pipeline: takes LLM-extracted line items for one statement and
writes subscriptions / transactions / price_history, then runs the alerts
engine. This is the glue between llm_parser.py (pure extraction) and the
database.
"""

from collections import defaultdict
from datetime import date

from supabase import Client

from app.schemas.statement import ExtractedLineItem
from app.services.alerts_engine import run_alert_scan_for_user
from app.services.categorizer import categorize_vendor, normalize_vendor_name


def _group_by_vendor_and_cycle(items: list[ExtractedLineItem]) -> dict[tuple[str, str], list[ExtractedLineItem]]:
    groups: dict[tuple[str, str], list[ExtractedLineItem]] = defaultdict(list)
    for item in items:
        key = (normalize_vendor_name(item.vendor_name), item.billing_cycle_guess)
        groups[key].append(item)
    return groups


def ingest_line_items(
    client: Client,
    user_id: str,
    statement_id: str | None,
    items: list[ExtractedLineItem],
) -> tuple[int, list[str]]:
    """
    Returns (subscriptions_detected, subscription_ids).
    """
    groups = _group_by_vendor_and_cycle(items)
    subscription_ids: list[str] = []

    for (normalized_vendor, billing_cycle), group_items in groups.items():
        group_items.sort(key=lambda i: i.charged_at)
        latest = group_items[-1]
        display_vendor = latest.vendor_name.strip().title()
        category = latest.category_guess or categorize_vendor(display_vendor)

        subscription_row = {
            "user_id": user_id,
            "vendor_name": display_vendor,
            "normalized_vendor": normalized_vendor,
            "category": category,
            "billing_cycle": billing_cycle,
            "amount": latest.amount,
            "currency": latest.currency,
            "status": "active",
            "first_seen_date": group_items[0].charged_at.isoformat(),
            "last_charge_date": latest.charged_at.isoformat(),
            "next_expected_charge_date": _estimate_next_charge(latest.charged_at, billing_cycle).isoformat(),
            "source_statement_id": statement_id,
            "confidence": 0.9 if len(group_items) > 1 else 0.6,
        }

        result = (
            client.table("subscriptions")
            .upsert(subscription_row, on_conflict="user_id,normalized_vendor,billing_cycle")
            .execute()
        )
        subscription = result.data[0]
        subscription_id = subscription["id"]
        subscription_ids.append(subscription_id)

        transaction_rows = [
            {
                "user_id": user_id,
                "statement_id": statement_id,
                "subscription_id": subscription_id,
                "vendor_raw_text": item.raw_text,
                "amount": item.amount,
                "currency": item.currency,
                "charged_at": item.charged_at.isoformat(),
            }
            for item in group_items
        ]
        inserted_transactions = client.table("transactions").insert(transaction_rows).execute().data

        price_history_rows = [
            {
                "subscription_id": subscription_id,
                "amount": item.amount,
                "observed_at": item.charged_at.isoformat(),
                "source_transaction_id": txn["id"],
            }
            for item, txn in zip(group_items, inserted_transactions, strict=True)
        ]
        client.table("price_history").insert(price_history_rows).execute()

    run_alert_scan_for_user(client, user_id)
    return len(subscription_ids), subscription_ids


def _estimate_next_charge(last_charge: date, billing_cycle: str) -> date:
    from dateutil.relativedelta import relativedelta

    deltas = {
        "weekly": relativedelta(weeks=1),
        "monthly": relativedelta(months=1),
        "quarterly": relativedelta(months=3),
        "yearly": relativedelta(years=1),
        "one_time": relativedelta(days=0),
    }
    return last_charge + deltas.get(billing_cycle, relativedelta(months=1))
