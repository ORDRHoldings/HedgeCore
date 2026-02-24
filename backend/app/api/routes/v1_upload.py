"""CSV upload endpoints for trades and hedges -- v1 API."""

import io

import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile

router = APIRouter(prefix="/v1", tags=["v1-upload"])

TRADE_REQUIRED_COLUMNS = {
    "record_id", "entity", "type", "currency", "amount",
    "value_date", "status",
}

HEDGE_REQUIRED_COLUMNS = {
    "hedge_id", "instrument", "direction", "notional_mxn",
    "value_date", "status",
}


@router.post("/upload/trades")
async def upload_trades(file: UploadFile):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv")

    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSV parse error: {e}")

    # Normalize column names
    df.columns = [c.strip().lower() for c in df.columns]
    missing = TRADE_REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"Missing required columns: {sorted(missing)}",
        )

    warnings: list[str] = []
    for col in ["record_id", "entity", "type", "currency", "status", "description"]:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip()

    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
    nan_rows = df[df["amount"].isna()]
    if not nan_rows.empty:
        warnings.append(f"Non-numeric amount in rows: {nan_rows.index.tolist()}")

    if "description" not in df.columns:
        df["description"] = ""

    trades = df.to_dict(orient="records")
    return {"trades": trades, "parse_warnings": warnings}


@router.post("/upload/hedges")
async def upload_hedges(file: UploadFile):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv")

    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSV parse error: {e}")

    df.columns = [c.strip().lower() for c in df.columns]
    missing = HEDGE_REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"Missing required columns: {sorted(missing)}",
        )

    warnings: list[str] = []
    for col in ["hedge_id", "instrument", "direction", "status"]:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip()

    df["notional_mxn"] = pd.to_numeric(df["notional_mxn"], errors="coerce")
    nan_rows = df[df["notional_mxn"].isna()]
    if not nan_rows.empty:
        warnings.append(f"Non-numeric notional_mxn in rows: {nan_rows.index.tolist()}")

    hedges = df.to_dict(orient="records")
    return {"hedges": hedges, "parse_warnings": warnings}
