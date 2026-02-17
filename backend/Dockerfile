FROM python:3.12-slim-bullseye

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# ---- system deps ----
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# ---- create non-root user ----
RUN groupadd -g 1000 hedgecalc \
 && useradd -m -u 1000 -g 1000 hedgecalc

WORKDIR /app

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY backend/app /app/app

RUN chown -R hedgecalc:hedgecalc /app

USER hedgecalc

EXPOSE 8000
