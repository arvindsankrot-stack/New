"""Cleanup - private single-user personal data removal assistant."""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import PlainTextResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware

from .config import get_settings
from .db import get_engine
from .routes import auth_routes, core, review
from .services.jobs import start_scheduler, stop_scheduler

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class SecurityMiddleware(BaseHTTPMiddleware):
    """Same-origin check on state-changing requests (CSRF) + security headers."""

    async def dispatch(self, request: Request, call_next):
        if request.method in UNSAFE_METHODS:
            allowed = {f"{request.url.scheme}://{request.url.netloc}"}
            base = urlsplit(get_settings().base_url)
            allowed.add(f"{base.scheme}://{base.netloc}")
            origin = request.headers.get("origin")
            if not origin:
                ref = urlsplit(request.headers.get("referer", ""))
                origin = f"{ref.scheme}://{ref.netloc}" if ref.netloc else ""
            if origin not in allowed:
                return PlainTextResponse("Cross-origin request blocked", status_code=403)
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; "
            "frame-ancestors 'none'; form-action 'self' https://accounts.google.com")
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Cache-Control"] = "no-store"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_engine()
    if get_settings().scheduler_enabled:
        start_scheduler()
    yield
    stop_scheduler()


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title="Cleanup", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(SecurityMiddleware)
    app.add_middleware(SessionMiddleware, secret_key=s.session_secret, session_cookie="cleanup_session",
                       max_age=s.session_max_age_hours * 3600, same_site="lax", https_only=s.secure_cookies)
    app.mount("/static", StaticFiles(directory=str(Path(__file__).resolve().parent / "static")), name="static")
    app.include_router(auth_routes.router)
    app.include_router(core.router)
    app.include_router(review.router)

    @app.exception_handler(HTTPException)
    async def _redirects(request: Request, exc: HTTPException):
        if exc.status_code == 303 and exc.headers and "Location" in exc.headers:
            return RedirectResponse(exc.headers["Location"], status_code=303)
        return PlainTextResponse(str(exc.detail), status_code=exc.status_code)

    return app


app = create_app()
