from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_service_role_key: str
    supabase_jwt_secret: str

    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-sonnet-5"

    web_app_origin: str = "http://localhost:3000"


@lru_cache
def get_settings() -> Settings:
    return Settings()
