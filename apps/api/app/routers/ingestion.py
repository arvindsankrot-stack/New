from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.db import get_service_client
from app.dependencies import CurrentUser, get_current_user
from app.schemas.statement import PasteTextRequest, StatementIngestResponse
from app.services import ingestion, llm_parser, text_extraction

router = APIRouter(prefix="/api/ingestion", tags=["ingestion"])

MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB


@router.post("/upload", response_model=StatementIngestResponse)
async def upload_statement(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
) -> StatementIngestResponse:
    file_bytes = await file.read()
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File exceeds 15MB limit")

    client = get_service_client()
    statement = (
        client.table("statements")
        .insert(
            {
                "user_id": current_user.id,
                "source_type": "pdf" if (file.content_type == "application/pdf") else "csv",
                "original_filename": file.filename,
                "status": "processing",
            }
        )
        .execute()
        .data[0]
    )

    try:
        raw_text = text_extraction.extract_text(file_bytes, file.content_type or "", file.filename or "")
        return _run_pipeline(client, current_user.id, statement["id"], raw_text)
    except Exception as exc:  # noqa: BLE001 - surfaced to the caller and persisted
        client.table("statements").update(
            {"status": "failed", "error_message": str(exc)}
        ).eq("id", statement["id"]).execute()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Failed to parse statement: {exc}") from exc


@router.post("/paste-text", response_model=StatementIngestResponse)
async def paste_text(
    payload: PasteTextRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> StatementIngestResponse:
    if not payload.text.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Text is empty")

    client = get_service_client()
    statement = (
        client.table("statements")
        .insert(
            {
                "user_id": current_user.id,
                "source_type": "pasted_text",
                "raw_text": payload.text[:100_000],
                "status": "processing",
            }
        )
        .execute()
        .data[0]
    )

    try:
        return _run_pipeline(client, current_user.id, statement["id"], payload.text)
    except Exception as exc:  # noqa: BLE001
        client.table("statements").update(
            {"status": "failed", "error_message": str(exc)}
        ).eq("id", statement["id"]).execute()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Failed to parse text: {exc}") from exc


def _run_pipeline(client, user_id: str, statement_id: str, raw_text: str) -> StatementIngestResponse:
    line_items = llm_parser.parse_statement_text(raw_text)
    subscriptions_detected, subscription_ids = ingestion.ingest_line_items(
        client, user_id, statement_id, line_items
    )

    client.table("statements").update(
        {
            "status": "parsed",
            "transactions_found": len(line_items),
            "subscriptions_detected": subscriptions_detected,
            "processed_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", statement_id).execute()

    return StatementIngestResponse(
        statement_id=statement_id,
        status="parsed",
        transactions_found=len(line_items),
        subscriptions_detected=subscriptions_detected,
        subscriptions=subscription_ids,
    )
