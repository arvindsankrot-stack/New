"""
Smart Alerts Engine.

Runs a set of independent detectors over a user's subscriptions and price
history, and upserts the results into the `alerts` table. Each detector is a
pure function over data already in Postgres — no LLM calls — since price
comparisons and threshold checks don't need one and stay fast/cheap/auditable.

Detectors:
  - price_increase:   latest charge > previous charge by more than 3%
  - low_usage:        self-reported usage_frequency_per_month below threshold
                       for a paid, non-utility category
  - trial_ending:      status == 'trial' and the next charge is within 3 days
  - duplicate_service: 2+ active subscriptions in the same category (most
                       useful for 'streaming', where overlap is common)

`alerts_dedupe_idx` (unique on subscription_id, alert_type where status='open')
means a second insert for an already-open alert of the same type is a no-op
via upsert — detectors are safe to re-run on every ingestion.
"""

from datetime import date, timedelta
from typing import Any

from supabase import Client

PRICE_INCREASE_THRESHOLD_PCT = 3.0
LOW_USAGE_THRESHOLD_PER_MONTH = 1.0
TRIAL_ENDING_WINDOW_DAYS = 3
DUPLICATE_WATCH_CATEGORIES = {"streaming", "saas"}


def _upsert_alert(
    client: Client,
    user_id: str,
    subscription_id: str,
    alert_type: str,
    severity: str,
    title: str,
    detail: str,
    metadata: dict[str, Any],
) -> None:
    client.table("alerts").upsert(
        {
            "user_id": user_id,
            "subscription_id": subscription_id,
            "alert_type": alert_type,
            "severity": severity,
            "status": "open",
            "title": title,
            "detail": detail,
            "metadata": metadata,
        },
        on_conflict="subscription_id,alert_type",
        ignore_duplicates=True,
    ).execute()


def detect_price_increase(client: Client, user_id: str, subscription: dict) -> None:
    history = (
        client.table("price_history")
        .select("amount, observed_at")
        .eq("subscription_id", subscription["id"])
        .order("observed_at", desc=False)
        .execute()
        .data
    )
    distinct_amounts = []
    for row in history:
        if not distinct_amounts or distinct_amounts[-1]["amount"] != row["amount"]:
            distinct_amounts.append(row)

    if len(distinct_amounts) < 2:
        return

    previous, latest = distinct_amounts[-2], distinct_amounts[-1]
    if previous["amount"] <= 0:
        return

    delta_pct = ((latest["amount"] - previous["amount"]) / previous["amount"]) * 100
    if delta_pct <= PRICE_INCREASE_THRESHOLD_PCT:
        return

    _upsert_alert(
        client,
        user_id,
        subscription["id"],
        "price_increase",
        "warning" if delta_pct < 25 else "critical",
        f"{subscription['vendor_name']} price increased {delta_pct:.0f}%",
        f"{subscription['vendor_name']} went from ${previous['amount']:.2f} to "
        f"${latest['amount']:.2f} ({delta_pct:.0f}% increase).",
        {"old_amount": previous["amount"], "new_amount": latest["amount"], "delta_pct": round(delta_pct, 1)},
    )


def detect_low_usage(client: Client, user_id: str, subscription: dict) -> None:
    usage = subscription.get("usage_frequency_per_month")
    if usage is None or subscription.get("category") == "utilities":
        return
    if usage >= LOW_USAGE_THRESHOLD_PER_MONTH:
        return

    _upsert_alert(
        client,
        user_id,
        subscription["id"],
        "low_usage",
        "info",
        f"Low usage detected for {subscription['vendor_name']}",
        f"You're using {subscription['vendor_name']} about {usage:.1f}x/month but paying "
        f"${subscription['amount']:.2f}/{subscription['billing_cycle']}. Consider cancelling.",
        {"usage_frequency_per_month": usage},
    )


def detect_trial_ending(client: Client, user_id: str, subscription: dict) -> None:
    if subscription.get("status") != "trial":
        return
    next_charge = subscription.get("next_expected_charge_date")
    if not next_charge:
        return
    next_charge_date = date.fromisoformat(next_charge)
    days_left = (next_charge_date - date.today()).days
    if not (0 <= days_left <= TRIAL_ENDING_WINDOW_DAYS):
        return

    _upsert_alert(
        client,
        user_id,
        subscription["id"],
        "trial_ending",
        "critical",
        f"{subscription['vendor_name']} trial ends in {days_left} day(s)",
        f"Your free trial for {subscription['vendor_name']} converts to a paid "
        f"${subscription['amount']:.2f}/{subscription['billing_cycle']} plan on {next_charge}.",
        {"days_left": days_left, "next_charge_date": next_charge},
    )


def detect_duplicate_services(client: Client, user_id: str, active_subscriptions: list[dict]) -> None:
    by_category: dict[str, list[dict]] = {}
    for sub in active_subscriptions:
        if sub.get("category") in DUPLICATE_WATCH_CATEGORIES:
            by_category.setdefault(sub["category"], []).append(sub)

    for category, subs in by_category.items():
        if len(subs) < 2:
            continue
        vendor_names = ", ".join(s["vendor_name"] for s in subs)
        for sub in subs:
            _upsert_alert(
                client,
                user_id,
                sub["id"],
                "duplicate_service",
                "info",
                f"Multiple {category} subscriptions detected",
                f"You have {len(subs)} active {category} subscriptions: {vendor_names}.",
                {"category": category, "subscription_ids": [s["id"] for s in subs]},
            )


def run_alert_scan_for_user(client: Client, user_id: str) -> int:
    """Runs all detectors for a user and returns the number of subscriptions scanned."""
    active_subscriptions = (
        client.table("subscriptions")
        .select("*")
        .eq("user_id", user_id)
        .in_("status", ["active", "trial"])
        .execute()
        .data
    )

    for subscription in active_subscriptions:
        detect_price_increase(client, user_id, subscription)
        detect_low_usage(client, user_id, subscription)
        detect_trial_ending(client, user_id, subscription)

    detect_duplicate_services(client, user_id, active_subscriptions)
    return len(active_subscriptions)
