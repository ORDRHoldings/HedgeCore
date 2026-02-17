"""
app/core/celery_app.py
HedgeCalc – Celery Application (Canonical, Docker-Safe)
------------------------------------------------------
- Explicit Redis broker/backend
- Docker DNS–safe service name
- Deterministic queue declaration
- Startup-resilient (no silent defaults)
"""

import os
from celery import Celery
from kombu import Queue

# ---------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------
REDIS_URL = os.getenv("REDIS_URL", "redis://hedgecalc_redis:6379/0")

# ---------------------------------------------------------------------
# Celery App
# ---------------------------------------------------------------------
celery = Celery(
    "hedgecalc",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=[
        "app.tasks",  # ensure task auto-discovery is explicit
    ],
)

# ---------------------------------------------------------------------
# Queues (explicit, deterministic)
# ---------------------------------------------------------------------
celery.conf.task_queues = (
    Queue("high_priority", routing_key="high_priority"),
    Queue("calc_queue", routing_key="calc_queue"),
)

celery.conf.task_default_queue = "calc_queue"
celery.conf.task_default_routing_key = "calc_queue"

# ---------------------------------------------------------------------
# Hardening / Docker stability
# ---------------------------------------------------------------------
celery.conf.broker_connection_retry_on_startup = True
celery.conf.task_acks_late = True
celery.conf.worker_prefetch_multiplier = 1
celery.conf.accept_content = ["json"]
celery.conf.task_serializer = "json"
celery.conf.result_serializer = "json"
