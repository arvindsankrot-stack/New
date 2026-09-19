from fastapi import APIRouter, Depends, HTTPException, status

from app.db import get_service_client
from app.dependencies import CurrentUser, get_current_user
from app.schemas.alert import Alert, AlertStatusUpdate
from app.services.alerts_engine import run_alert_scan_for_user

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("", response_model=list[Alert])
def list_alerts(
    status_filter: str = "open",
    current_user: CurrentUser = Depends(get_current_user),
) -> list[Alert]:
    client = get_service_client()
    query = client.table("alerts").select("*").eq("user_id", current_user.id)
    if status_filter != "all":
        query = query.eq("status", status_filter)
    result = query.order("created_at", desc=True).execute()
    return result.data


@router.post("/scan", status_code=status.HTTP_202_ACCEPTED)
def trigger_scan(current_user: CurrentUser = Depends(get_current_user)) -> dict:
    client = get_service_client()
    scanned = run_alert_scan_for_user(client, current_user.id)
    return {"subscriptions_scanned": scanned}


@router.patch("/{alert_id}", response_model=Alert)
def update_alert_status(
    alert_id: str,
    payload: AlertStatusUpdate,
    current_user: CurrentUser = Depends(get_current_user),
) -> Alert:
    client = get_service_client()
    result = (
        client.table("alerts")
        .update({"status": payload.status.value})
        .eq("id", alert_id)
        .eq("user_id", current_user.id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")
    return result.data[0]
