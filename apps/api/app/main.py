from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import actions, alerts, dashboard, ingestion, subscriptions

settings = get_settings()

app = FastAPI(
    title="Subs-Guard API",
    description="Statement ingestion, subscription tracking, alerts, and cancellation action center.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_app_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingestion.router)
app.include_router(subscriptions.router)
app.include_router(dashboard.router)
app.include_router(alerts.router)
app.include_router(actions.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
