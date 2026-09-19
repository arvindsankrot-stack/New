from app.services.alerts_engine import (
    detect_low_usage,
    detect_price_increase,
    detect_trial_ending,
    run_alert_scan_for_user,
)
from tests.fake_supabase import FakeSupabaseClient

USER_ID = "user-1"


def _make_subscription(client: FakeSupabaseClient, **overrides) -> dict:
    row = {
        "user_id": USER_ID,
        "vendor_name": "Netflix",
        "normalized_vendor": "netflix",
        "category": "streaming",
        "billing_cycle": "monthly",
        "amount": 15.49,
        "status": "active",
        "usage_frequency_per_month": None,
        "next_expected_charge_date": None,
        **overrides,
    }
    return client.table("subscriptions").insert(row).execute().data[0]


def test_price_increase_above_threshold_creates_alert():
    client = FakeSupabaseClient()
    subscription = _make_subscription(client)
    client.table("price_history").insert(
        [
            {"subscription_id": subscription["id"], "amount": 9.99, "observed_at": "2025-01-01"},
            {"subscription_id": subscription["id"], "amount": 15.49, "observed_at": "2025-02-01"},
        ]
    ).execute()

    detect_price_increase(client, USER_ID, subscription)

    alerts = client.table("alerts").select("*").execute().data
    assert len(alerts) == 1
    assert alerts[0]["alert_type"] == "price_increase"
    assert alerts[0]["metadata"]["delta_pct"] > 50


def test_price_increase_below_threshold_no_alert():
    client = FakeSupabaseClient()
    subscription = _make_subscription(client)
    client.table("price_history").insert(
        [
            {"subscription_id": subscription["id"], "amount": 15.49, "observed_at": "2025-01-01"},
            {"subscription_id": subscription["id"], "amount": 15.60, "observed_at": "2025-02-01"},
        ]
    ).execute()

    detect_price_increase(client, USER_ID, subscription)

    assert client.table("alerts").select("*").execute().data == []


def test_low_usage_creates_info_alert():
    client = FakeSupabaseClient()
    subscription = _make_subscription(client, usage_frequency_per_month=0.5)

    detect_low_usage(client, USER_ID, subscription)

    alerts = client.table("alerts").select("*").execute().data
    assert len(alerts) == 1
    assert alerts[0]["severity"] == "info"


def test_low_usage_skips_utilities_category():
    client = FakeSupabaseClient()
    subscription = _make_subscription(client, category="utilities", usage_frequency_per_month=0.1)

    detect_low_usage(client, USER_ID, subscription)

    assert client.table("alerts").select("*").execute().data == []


def test_trial_ending_within_window_creates_critical_alert():
    client = FakeSupabaseClient()
    from datetime import date, timedelta

    subscription = _make_subscription(
        client, status="trial", next_expected_charge_date=(date.today() + timedelta(days=2)).isoformat()
    )

    detect_trial_ending(client, USER_ID, subscription)

    alerts = client.table("alerts").select("*").execute().data
    assert len(alerts) == 1
    assert alerts[0]["severity"] == "critical"


def test_run_alert_scan_only_scans_active_and_trial():
    client = FakeSupabaseClient()
    _make_subscription(client, status="active")
    _make_subscription(client, vendor_name="Hulu", normalized_vendor="hulu", status="cancelled")

    scanned = run_alert_scan_for_user(client, USER_ID)

    assert scanned == 1
