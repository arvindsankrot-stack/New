from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field


class SubscriptionCategory(str, Enum):
    streaming = "streaming"
    utilities = "utilities"
    saas = "saas"
    personal_services = "personal_services"
    other = "other"


class BillingCycle(str, Enum):
    weekly = "weekly"
    monthly = "monthly"
    quarterly = "quarterly"
    yearly = "yearly"
    one_time = "one_time"


class SubscriptionStatus(str, Enum):
    active = "active"
    trial = "trial"
    cancelled = "cancelled"
    unknown = "unknown"


class SubscriptionBase(BaseModel):
    vendor_name: str
    category: SubscriptionCategory = SubscriptionCategory.other
    billing_cycle: BillingCycle = BillingCycle.monthly
    amount: float = Field(gt=0)
    currency: str = "USD"
    status: SubscriptionStatus = SubscriptionStatus.active
    last_charge_date: date | None = None
    next_expected_charge_date: date | None = None
    usage_frequency_per_month: float | None = None
    notes: str | None = None


class SubscriptionCreate(SubscriptionBase):
    pass


class SubscriptionUpdate(BaseModel):
    vendor_name: str | None = None
    category: SubscriptionCategory | None = None
    billing_cycle: BillingCycle | None = None
    amount: float | None = Field(default=None, gt=0)
    status: SubscriptionStatus | None = None
    usage_frequency_per_month: float | None = None
    notes: str | None = None


class Subscription(SubscriptionBase):
    id: str
    user_id: str
    normalized_vendor: str
    confidence: float
    source_statement_id: str | None = None
    created_at: datetime
    updated_at: datetime
