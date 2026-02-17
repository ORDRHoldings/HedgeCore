from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import health, calculate, upload, export

app = FastAPI(
    title=settings.app_name,
    version=settings.engine_version,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1")
app.include_router(calculate.router, prefix="/api/v1")
app.include_router(upload.router, prefix="/api/v1")
app.include_router(export.router, prefix="/api/v1")
