from datetime import datetime, timezone

from fastapi import APIRouter

from app.config import settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check():
    return {
        "status": "ok",
        "engine_version": settings.engine_version,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
