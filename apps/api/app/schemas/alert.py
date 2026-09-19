from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel


class AlertType(str, Enum):
    price_increase = "price_increase"
    low_usage = "low_usage"
    trial_ending = "trial_ending"
    duplicate_service = "duplicate_service"
    new_subscription = "new_subscription"


class AlertSeverity(str, Enum):
    info = "info"
    warning = "warning"
    critical = "critical"


class AlertStatus(str, Enum):
    open = "open"
    acknowledged = "acknowledged"
    dismissed = "dismissed"
    resolved = "resolved"


class Alert(BaseModel):
    id: str
    user_id: str
    subscription_id: str
    alert_type: AlertType
    severity: AlertSeverity
    status: AlertStatus
    title: str
    detail: str
    metadata: dict[str, Any] = {}
    created_at: datetime
    resolved_at: datetime | None = None


class AlertStatusUpdate(BaseModel):
    status: AlertStatus
