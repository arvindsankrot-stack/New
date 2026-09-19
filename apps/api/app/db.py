from functools import lru_cache

from supabase import Client, create_client

from app.config import get_settings


@lru_cache
def get_service_client() -> Client:
    """
    Supabase client authenticated as the service role.

    The service role bypasses Row Level Security, so every query built on top
    of it MUST be manually scoped with `.eq("user_id", user_id)` — the
    dependency in app/dependencies.py hands routers an already-verified
    user_id for exactly this reason.
    """
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
