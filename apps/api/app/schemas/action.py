from datetime import datetime

from pydantic import BaseModel


class CancellationGuide(BaseModel):
    id: str
    normalized_vendor: str
    display_name: str
    cancel_url: str | None = None
    difficulty: str | None = None
    steps: list[str] = []
    requires_phone_call: bool = False
    phone_number: str | None = None


class GenerateCancellationRequest(BaseModel):
    subscription_id: str
    method: str = "email"  # email | link | phone | manual


class GenerateCancellationResponse(BaseModel):
    subscription_id: str
    guide: CancellationGuide | None
    method: str
    email_subject: str | None = None
    email_body: str | None = None
    cancel_url: str | None = None
    steps: list[str] = []


class CancellationRequestRecord(BaseModel):
    id: str
    user_id: str
    subscription_id: str
    guide_id: str | None
    method: str
    status: str
    created_at: datetime
