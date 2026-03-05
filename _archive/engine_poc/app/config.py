from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "HedgeCalc FX POC"
    engine_version: str = "0.1.0"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000", "http://localhost:3002"]
    max_runs_in_memory: int = 50

    model_config = {"env_prefix": "HEDGECALC_"}


settings = Settings()
