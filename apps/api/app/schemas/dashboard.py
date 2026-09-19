from pydantic import BaseModel


class CategoryBreakdown(BaseModel):
    category: str
    subscription_count: int
    monthly_total: float
    yearly_total: float


class DashboardSummary(BaseModel):
    total_monthly_burn: float
    total_yearly_burn: float
    active_subscription_count: int
    trial_subscription_count: int
    open_alert_count: int
    by_category: list[CategoryBreakdown]
