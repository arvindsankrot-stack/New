from fastapi import APIRouter, Depends, HTTPException, status

from app.db import get_service_client
from app.dependencies import CurrentUser, get_current_user
from app.schemas.subscription import Subscription, SubscriptionCreate, SubscriptionUpdate
from app.services.categorizer import normalize_vendor_name

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])


@router.get("", response_model=list[Subscription])
def list_subscriptions(
    status_filter: str | None = None,
    category: str | None = None,
    current_user: CurrentUser = Depends(get_current_user),
) -> list[Subscription]:
    client = get_service_client()
    query = client.table("subscriptions").select("*").eq("user_id", current_user.id)
    if status_filter:
        query = query.eq("status", status_filter)
    if category:
        query = query.eq("category", category)
    result = query.order("amount", desc=True).execute()
    return result.data


@router.post("", response_model=Subscription, status_code=status.HTTP_201_CREATED)
def create_subscription(
    payload: SubscriptionCreate,
    current_user: CurrentUser = Depends(get_current_user),
) -> Subscription:
    client = get_service_client()
    row = {
        **payload.model_dump(mode="json"),
        "user_id": current_user.id,
        "normalized_vendor": normalize_vendor_name(payload.vendor_name),
        "confidence": 1.0,  # manually entered by the user
    }
    result = client.table("subscriptions").insert(row).execute()
    return result.data[0]


@router.patch("/{subscription_id}", response_model=Subscription)
def update_subscription(
    subscription_id: str,
    payload: SubscriptionUpdate,
    current_user: CurrentUser = Depends(get_current_user),
) -> Subscription:
    client = get_service_client()
    updates = payload.model_dump(mode="json", exclude_unset=True)
    if not updates:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No fields to update")

    result = (
        client.table("subscriptions")
        .update(updates)
        .eq("id", subscription_id)
        .eq("user_id", current_user.id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subscription not found")
    return result.data[0]


@router.delete("/{subscription_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subscription(
    subscription_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> None:
    client = get_service_client()
    client.table("subscriptions").delete().eq("id", subscription_id).eq(
        "user_id", current_user.id
    ).execute()
