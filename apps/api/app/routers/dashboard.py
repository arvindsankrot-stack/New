from fastapi import APIRouter, Depends

from app.db import get_service_client
from app.dependencies import CurrentUser, get_current_user
from app.schemas.dashboard import CategoryBreakdown, DashboardSummary

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def get_summary(current_user: CurrentUser = Depends(get_current_user)) -> DashboardSummary:
    client = get_service_client()

    breakdown_rows = (
        client.table("dashboard_category_burn")
        .select("*")
        .eq("user_id", current_user.id)
        .execute()
        .data
    )

    active_rows = [r for r in breakdown_rows if r["status"] == "active"]
    trial_rows = [r for r in breakdown_rows if r["status"] == "trial"]

    by_category: dict[str, CategoryBreakdown] = {}
    for row in active_rows:
        existing = by_category.get(row["category"])
        if existing:
            existing.subscription_count += row["subscription_count"]
            existing.monthly_total += row["monthly_total"]
            existing.yearly_total += row["yearly_total"]
        else:
            by_category[row["category"]] = CategoryBreakdown(
                category=row["category"],
                subscription_count=row["subscription_count"],
                monthly_total=row["monthly_total"],
                yearly_total=row["yearly_total"],
            )

    open_alert_count = (
        client.table("alerts")
        .select("id", count="exact")
        .eq("user_id", current_user.id)
        .eq("status", "open")
        .execute()
        .count
        or 0
    )

    return DashboardSummary(
        total_monthly_burn=sum(c.monthly_total for c in by_category.values()),
        total_yearly_burn=sum(c.yearly_total for c in by_category.values()),
        active_subscription_count=sum(c.subscription_count for c in by_category.values()),
        trial_subscription_count=sum(r["subscription_count"] for r in trial_rows),
        open_alert_count=open_alert_count,
        by_category=sorted(by_category.values(), key=lambda c: c.monthly_total, reverse=True),
    )
