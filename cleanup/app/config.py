"""Application settings, loaded from environment variables / .env file."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- storage & secrets (required) ---
    data_dir: Path = Path("./data")
    db_key: str  # SQLCipher passphrase for the database
    file_key: str  # Fernet key for files and OAuth tokens (python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())")
    session_secret: str

    # --- web ---
    base_url: str = "http://localhost:8000"
    secure_cookies: bool = False  # set true when served over HTTPS
    session_max_age_hours: int = 12

    # --- Google OAuth (Gmail) ---
    google_client_id: str = ""
    google_client_secret: str = ""

    # --- search providers ---
    google_cse_key: str = ""
    google_cse_cx: str = ""
    brave_api_key: str = ""
    reddit_client_id: str = ""
    reddit_client_secret: str = ""
    facecheck_api_token: str = ""
    facecheck_testing_mode: bool = True  # FaceCheck demo mode: no credits spent, fake results

    # --- classifier ---
    anthropic_api_key: str = ""
    classifier_model: str = "claude-opus-5-5"

    # --- tracker ---
    recheck_days: int = 3
    followup_days: int = 15
    scheduler_enabled: bool = True

    # --- outbound HTTP ---
    http_user_agent: str = "CleanupPersonalDataTool/1.0 (single-user privacy tool; respects robots.txt)"
    gmail_scan_max_messages: int = 1500

    @property
    def db_path(self) -> Path:
        return self.data_dir / "cleanup.db"

    @property
    def files_dir(self) -> Path:
        return self.data_dir / "files"

    @property
    def oauth_redirect_uri(self) -> str:
        return self.base_url.rstrip("/") + "/accounts/gmail/callback"


@lru_cache
def get_settings() -> Settings:
    s = Settings()  # type: ignore[call-arg]
    s.data_dir.mkdir(parents=True, exist_ok=True)
    s.files_dir.mkdir(parents=True, exist_ok=True)
    return s
