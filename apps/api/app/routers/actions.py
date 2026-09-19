from fastapi import APIRouter, Depends, HTTPException, status

from app.db import get_service_client
from app.dependencies import CurrentUser, get_current_user
from app.schemas.action import (
    CancellationGuide,
    GenerateCancellationRequest,
    GenerateCancellationResponse,
)
from app.services.cancellation import default_steps, find_guide, generate_cancellation_email

router = APIRouter(prefix="/api/actions", tags=["actions"])


@router.post("/cancel", response_model=GenerateCancellationResponse)
def generate_cancellation(
    payload: GenerateCancellationRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> GenerateCancellationResponse:
    client = get_service_client()

    subscription_result = (
        client.table("subscriptions")
        .select("*")
        .eq("id", payload.subscription_id)
        .eq("user_id", current_user.id)
        .limit(1)
        .execute()
    )
    if not subscription_result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subscription not found")
    subscription = subscription_result.data[0]

    guide = find_guide(client, subscription["normalized_vendor"])
    user_name = current_user.email or "the account holder"

    email_subject = email_body = None
    if payload.method == "email":
        email_subject, email_body = generate_cancellation_email(guide, subscription["vendor_name"], user_name)

    steps = guide["steps"] if guide and guide.get("steps") else default_steps(subscription["vendor_name"])

    client.table("cancellation_requests").insert(
        {
            "user_id": current_user.id,
            "subscription_id": subscription["id"],
            "guide_id": guide["id"] if guide else None,
            "method": payload.method,
            "generated_email_subject": email_subject,
            "generated_email_body": email_body,
            "status": "drafted",
        }
    ).execute()

    return GenerateCancellationResponse(
        subscription_id=subscription["id"],
        guide=CancellationGuide(**guide) if guide else None,
        method=payload.method,
        email_subject=email_subject,
        email_body=email_body,
        cancel_url=guide["cancel_url"] if guide else None,
        steps=steps,
    )


@router.get("/guides/{normalized_vendor}", response_model=CancellationGuide | None)
def get_guide(normalized_vendor: str) -> CancellationGuide | None:
    client = get_service_client()
    guide = find_guide(client, normalized_vendor)
    return CancellationGuide(**guide) if guide else None
