"""

app/core/config.py

HedgeCalc API . Phase VII

Centralized environment configuration using pydantic-settings.



? Features

- Full .env alignment with JWT, DB, and API Key parameters

- Compatibility aliases for legacy JWT_* and *_EXPIRE_MINUTES fields

- Test-stable configuration (auto-disables rate-limit in testing)

- Secure validators for cryptographic and temporal settings

"""



import logging
import os

from pydantic import validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# ──────────────────────────────────────────────────────────────────────────────
# SEC-01: Secret resolution with Vault / AWS SM / env fallback
# ──────────────────────────────────────────────────────────────────────────────

_sec_log = logging.getLogger(__name__)


def _resolve_secret(env_key: str, vault_path: str | None = None) -> str:
    """Resolve secret: Vault → AWS Secrets Manager → Environment → raise (prod).

    Priority:
    1. HashiCorp Vault (if VAULT_ADDR env var is set)
    2. AWS Secrets Manager (if AWS_SECRET_NAME env var is set)
    3. Environment variable (standard .env / process env)
    4. Empty string in dev; RuntimeError in production

    Backward compatible: existing code that reads env vars directly still works.
    """
    import os as _os

    # ── 1. HashiCorp Vault ──────────────────────────────────────────────────
    vault_addr = _os.getenv("VAULT_ADDR")
    if vault_addr and vault_path:
        try:
            import hvac  # type: ignore[import]
            client = hvac.Client(url=vault_addr, token=_os.getenv("VAULT_TOKEN"))
            secret = client.secrets.kv.v2.read_secret_version(path=vault_path)
            value = secret["data"]["data"].get(env_key, "")
            if value:
                return value
        except Exception as _exc:
            _sec_log.warning("Vault lookup failed for %s: %s", env_key, _exc)

    # ── 2. AWS Secrets Manager ──────────────────────────────────────────────
    aws_secret_name = _os.getenv("AWS_SECRET_NAME")
    if aws_secret_name and not vault_addr:
        try:
            import json as _json

            import boto3  # type: ignore[import]
            sm_client = boto3.client(
                "secretsmanager",
                region_name=_os.getenv("AWS_REGION", "us-east-1"),
            )
            response = sm_client.get_secret_value(SecretId=aws_secret_name)
            secrets = _json.loads(response["SecretString"])
            if env_key in secrets and secrets[env_key]:
                return str(secrets[env_key])
        except Exception as _exc:
            _sec_log.warning("AWS Secrets Manager lookup failed for %s: %s", env_key, _exc)

    # ── 3. Environment variable ─────────────────────────────────────────────
    val = _os.getenv(env_key, "")

    if val in ("***REDACTED_JWT_SECRET***", "***REDACTED_DB_PASSWORD***"):
        _sec_log.warning(
            "SECURITY: %s is using a dev default value — rotate before production deployment",
            env_key,
        )

    if not val and _os.getenv("ENV", "dev") == "production":
        raise RuntimeError(
            f"CRITICAL: {env_key} is not set in production environment. "
            "Set it via environment variable, Vault, or AWS Secrets Manager."
        )

    return val



# ----------------------------------------------------------------------

# Environment Resolution

# ----------------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))

ENV_PATH = os.path.join(BASE_DIR, ".env")





class Settings(BaseSettings):

    # ------------------------------------------------------------------

    # Core Application

    # ------------------------------------------------------------------

    APP_NAME: str = "ORDR Terminal API"

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



    DATABASE_URL: str | None = None

    ASYNC_DATABASE_URL: str | None = None

    TEST_DATABASE_URL: str | None = None

    TEST_ASYNC_DATABASE_URL: str | None = None

    # ------------------------------------------------------------------

    # Connection Pool Tuning

    # ------------------------------------------------------------------

    DB_POOL_SIZE: int = 20

    DB_MAX_OVERFLOW: int = 10

    DB_POOL_TIMEOUT: int = 30

    DB_POOL_PRE_PING: bool = True



    # ------------------------------------------------------------------

    # CORS Configuration

    # Override via CORS_ALLOW_ORIGINS env var (JSON array or comma-separated).

    # render.yaml sets this per-service so production and preview have

    # different allowed origins without code changes.

    # ------------------------------------------------------------------

    CORS_ALLOW_ORIGINS: list[str] = [

        "http://localhost:3000",

        "http://127.0.0.1:3000",

        "https://hedgecore.vercel.app",

        "https://ordr-terminal.vercel.app",

        "https://ordr-terminal-v2.vercel.app",

        "http://localhost:3001",

    ]

    CORS_ALLOW_CREDENTIALS: bool = True

    # Explicit methods/headers required when allow_credentials=True
    # (wildcard "*" is incompatible with credentials in some browsers)
    CORS_ALLOW_METHODS: list[str] = [
        "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS",
    ]

    CORS_ALLOW_HEADERS: list[str] = [
        "Authorization",
        "Content-Type",
        "X-API-Key",
        "X-CSRF-Token",
        "X-Request-ID",
    ]

    CORS_EXPOSE_HEADERS: list[str] = [
        "X-Request-ID",
        "X-RateLimit-Remaining",
    ]



    @validator("CORS_ALLOW_ORIGINS", pre=True, always=True)

    @classmethod

    def parse_cors_origins(cls, v: object) -> list[str]:

        """Accept JSON array string, comma-separated string, or list."""

        import json

        if isinstance(v, list):

            return [str(o).rstrip("/") for o in v]

        if isinstance(v, str):

            v = v.strip()

            if v.startswith("["):

                parsed = json.loads(v)

                return [str(o).rstrip("/") for o in parsed]

            return [o.strip().rstrip("/") for o in v.split(",") if o.strip()]

        return []



    # ------------------------------------------------------------------

    # Security Tunables

    # ------------------------------------------------------------------

    PASSWORD_MIN_LENGTH: int = 12

    RATE_LIMIT_LOGIN_PER_MIN: int = 10

    RATE_LIMIT_ENABLED: bool = True

    # Required in production for distributed rate limiting and market data cache.
    # Provisioned via Render Redis — value injected via fromService in render.yaml.
    # Failure behaviour: rate limiting is fail-CLOSED (deny), cache is fail-open (bypass).
    REDIS_URL: str | None = None

    # ------------------------------------------------------------------

    # IP Allowlist for Execution Actions

    # Set EXECUTION_IP_ALLOWLIST_ENABLED=true and populate

    # EXECUTION_IP_ALLOWLIST (comma-separated CIDRs or exact IPs) to

    # restrict POST /v1/proposals, PATCH /v1/proposals/{id}/approve,

    # and POST /v1/proposals/{id}/execute to specific IP ranges.

    # Empty list = disabled (allow all IPs).

    # Example: EXECUTION_IP_ALLOWLIST=10.0.0.0/8,192.168.1.100

    # ------------------------------------------------------------------

    EXECUTION_IP_ALLOWLIST_ENABLED: bool = False

    EXECUTION_IP_ALLOWLIST: list[str] = []

    @validator("EXECUTION_IP_ALLOWLIST", pre=True, always=True)

    @classmethod

    def parse_ip_allowlist(cls, v: object) -> list[str]:

        """Accept comma-separated string or list."""

        if isinstance(v, list):

            return [str(e).strip() for e in v if str(e).strip()]

        if isinstance(v, str):

            v = v.strip()

            if not v:

                return []

            return [e.strip() for e in v.split(",") if e.strip()]

        return []

    # Global IP Allowlist (middleware-level). Empty = open mode. See ADR-0007.
    # Example: ALLOWED_IPS=10.0.0.0/8,203.0.113.0/24
    ALLOWED_IPS: list[str] = []

    @validator("ALLOWED_IPS", pre=True, always=True)
    @classmethod
    def parse_allowed_ips(cls, v: object) -> list[str]:
        if isinstance(v, list):
            return [str(e).strip() for e in v if str(e).strip()]
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return []
            return [e.strip() for e in v.split(",") if e.strip()]
        return []

    # ------------------------------------------------------------------
    # Stripe Billing
    # ------------------------------------------------------------------
    STRIPE_SECRET_KEY_TEST: str = ""
    STRIPE_SECRET_KEY_LIVE: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_LIVE_MODE: bool = False

    @property
    def stripe_secret_key(self) -> str:
        """Return the live key when STRIPE_LIVE_MODE=true, else the test key."""
        return self.STRIPE_SECRET_KEY_LIVE if self.STRIPE_LIVE_MODE else self.STRIPE_SECRET_KEY_TEST

    # ------------------------------------------------------------------
    # WorkOS SSO
    # ------------------------------------------------------------------
    WORKOS_API_KEY: str = ""
    WORKOS_CLIENT_ID: str = ""

    # ------------------------------------------------------------------
    # AI / Voice Layer
    # ------------------------------------------------------------------
    # Set to enable POST /v1/voice/realtime (OpenAI Realtime API bridge).
    # Leave empty to disable voice gracefully (endpoint returns 503).
    OPENAI_API_KEY: str = ""

    # ------------------------------------------------------------------
    # Market Data Providers
    # ------------------------------------------------------------------
    TWELVEDATA_API_KEY: str = ""
    TWELVEDATA_BASE_URL: str = "https://api.twelvedata.com"
    TWELVEDATA_RATE_LIMIT: int = 8
    TWELVEDATA_DAILY_LIMIT: int = 800

    IBKR_HOST: str = "127.0.0.1"
    IBKR_PORT: int = 4002
    IBKR_CLIENT_ID: int = 1
    IBKR_ENABLED: bool = False

    MARKET_DATA_SPOT_INTERVAL_SEC: int = 300
    MARKET_DATA_FORWARD_INTERVAL_SEC: int = 3600
    MARKET_DATA_EQUITY_INTERVAL_SEC: int = 300
    MARKET_DATA_VOL_INTERVAL_SEC: int = 3600
    MARKET_DATA_OPTIONS_INTERVAL_SEC: int = 3600

    # ------------------------------------------------------------------
    # HedgeWiki Integration
    # ------------------------------------------------------------------
    HEDGEWIKI_BASE_URL: str = "https://hedgewiki.onrender.com"
    HEDGEWIKI_API_KEY: str = ""
    HEDGEWIKI_TIMEOUT: float = 15.0
    HEDGEWIKI_ENABLED: bool = True

    # ------------------------------------------------------------------

    # ? API Key / Service Token Settings

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

        if len(v) < 32:

            raise ValueError("JWT_SECRET must be at least 32 characters long.")

        env = os.getenv("ENV", "development").lower()

        if env == "production" and (v.startswith("dev_") or "hedgecalc" in v.lower()):

            raise ValueError(

                "Production JWT_SECRET must not be a development default. "

                "Generate with: python3 -c \"import secrets; print(secrets.token_urlsafe(64))\""

            )

        return v



    @validator("ACCESS_EXPIRE_MIN", "REFRESH_EXPIRE_MIN")

    def positive_duration(cls, v: int) -> int:

        if v <= 0:

            raise ValueError("Token expiration must be positive.")

        return v



    # ------------------------------------------------------------------

    # ? Compatibility Aliases (CRITICAL)

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


def get_settings() -> Settings:
    """Return the global Settings instance. Patchable in tests."""
    return settings

