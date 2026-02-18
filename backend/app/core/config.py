"""
app/core/config.py
HedgeCalc API · Phase VII
Centralized environment configuration using pydantic-settings.

✅ Features
- Full .env alignment with JWT, DB, and API Key parameters
- Compatibility aliases for legacy JWT_* and *_EXPIRE_MINUTES fields
- Test-stable configuration (auto-disables rate-limit in testing)
- Secure validators for cryptographic and temporal settings
"""

import os
from typing import List, Optional
from pydantic import AnyHttpUrl, validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# ----------------------------------------------------------------------
# Environment Resolution
# ----------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
ENV_PATH = os.path.join(BASE_DIR, ".env")


class Settings(BaseSettings):
    # ------------------------------------------------------------------
    # Core Application
    # ------------------------------------------------------------------
    APP_NAME: str = "HedgeCalc API"
    ENV: str = os.getenv("ENV", "dev").strip().lower()
    LOG_LEVEL: str = "INFO"
    LOG_FILE: str = "LOG/backend.log"

    # ------------------------------------------------------------------
    # JWT / Auth Configuration
    # ------------------------------------------------------------------
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_EXPIRE_MIN: int = 30
    REFRESH_EXPIRE_MIN: int = 10080
    TOKEN_ISSUER: str = "hedgecalc"
    TOKEN_AUDIENCE: str = "users"

    # ------------------------------------------------------------------
    # Database (Docker-aligned)
    # ------------------------------------------------------------------
    DB_HOST: str = os.getenv("DB_HOST", "hedgecalc_db")
    DB_PORT: int = 5432
    DB_USER: str = os.getenv("POSTGRES_USER", "hedgecalc")
    DB_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "hedgecalc")
    DB_NAME: str = os.getenv("POSTGRES_DB", "hedgecalc")
    TEST_DB_NAME: str = "hedgecalc_test"

    DATABASE_URL: Optional[str] = None
    ASYNC_DATABASE_URL: Optional[str] = None
    TEST_DATABASE_URL: Optional[str] = None
    TEST_ASYNC_DATABASE_URL: Optional[str] = None

    # ------------------------------------------------------------------
    # CORS Configuration
    # ------------------------------------------------------------------
    CORS_ALLOW_ORIGINS: List[AnyHttpUrl] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://hedgecore.vercel.app",
    ]
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: List[str] = ["*"]
    CORS_ALLOW_HEADERS: List[str] = ["*"]

    # ------------------------------------------------------------------
    # Security Tunables
    # ------------------------------------------------------------------
    PASSWORD_MIN_LENGTH: int = 12
    RATE_LIMIT_LOGIN_PER_MIN: int = 10
    RATE_LIMIT_ENABLED: bool = True

    # ------------------------------------------------------------------
    # 🔐 API Key / Service Token Settings
    # ------------------------------------------------------------------
    API_KEY_ID_LEN: int = 24
    API_KEY_SECRET_LEN: int = 40
    API_KEY_PEPPER: str = os.getenv(
        "API_KEY_PEPPER", "super-secret-pepper-change-me"
    )

    # ------------------------------------------------------------------
    # Pydantic Settings Configuration
    # ------------------------------------------------------------------
    model_config = SettingsConfigDict(
        env_file=ENV_PATH,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ------------------------------------------------------------------
    # Derived Properties
    # ------------------------------------------------------------------
    @property
    def db_url(self) -> str:
        return self.ASYNC_DATABASE_URL or (
            f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    @property
    def sync_db_url(self) -> str:
        return self.DATABASE_URL or (
            f"postgresql+psycopg2://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    @property
    def test_db_url(self) -> str:
        return self.TEST_ASYNC_DATABASE_URL or (
            f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.TEST_DB_NAME}"
        )

    # ------------------------------------------------------------------
    # Validators
    # ------------------------------------------------------------------
    @validator("JWT_SECRET")
    def validate_secret(cls, v: str) -> str:
        if len(v) < 16:
            raise ValueError("JWT_SECRET must be at least 16 characters long.")
        return v

    @validator("ACCESS_EXPIRE_MIN", "REFRESH_EXPIRE_MIN")
    def positive_duration(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Token expiration must be positive.")
        return v

    # ------------------------------------------------------------------
    # ✅ Compatibility Aliases (CRITICAL)
    # ------------------------------------------------------------------
    @property
    def JWT_SECRET_KEY(self) -> str:
        return self.JWT_SECRET

    @property
    def JWT_AUDIENCE(self) -> str:
        return self.TOKEN_AUDIENCE

    @property
    def JWT_ISSUER(self) -> str:
        return self.TOKEN_ISSUER

    @property
    def JWT_ALG(self) -> str:
        return self.JWT_ALGORITHM

    @property
    def ACCESS_TOKEN_EXPIRE_MINUTES(self) -> int:
        return self.ACCESS_EXPIRE_MIN

    @property
    def REFRESH_TOKEN_EXPIRE_MINUTES(self) -> int:
        return self.REFRESH_EXPIRE_MIN

    # ------------------------------------------------------------------
    # Environment-Specific Logic
    # ------------------------------------------------------------------
    @property
    def is_testing(self) -> bool:
        return self.ENV in {"test", "testing", "ci"}

    def apply_environment_overrides(self):
        if self.is_testing:
            self.RATE_LIMIT_ENABLED = False
            self.RATE_LIMIT_LOGIN_PER_MIN = 100_000
            os.environ["PYTEST_RUNNING"] = "1"


# ----------------------------------------------------------------------
# Global Settings Instance
# ----------------------------------------------------------------------
settings = Settings()
settings.apply_environment_overrides()
