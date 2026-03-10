"""
Market Data Routes — Institutional FX + Equity via TwelveData / yfinance failover.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)
UTC = timezone.utc

router = APIRouter(prefix="/v1/market", tags=["market"])

# ── FX pairs supported by the platform ───────────────────────────────────────

_FX_PAIRS = [
    "USDMXN", "USDBRL", "USDCOP", "USDCLP", "USDPEN",   # LatAm
    "EURUSD", "GBPUSD", "USDJPY", "USDCAD", "USDCHF",   # G10
    "USDCNY", "USDINR", "USDSGD", "USDKRW", "USDHKD",   # Asia
    "USDAUD", "USDNZD",                                    # Oceania
]

# Indicative fallback rates (last-resort when all providers are down)
_FALLBACK_RATES: dict[str, float] = {
    "USDMXN": 17.24, "USDBRL": 4.97, "USDCOP": 4150.0, "USDCLP": 950.0, "USDPEN": 3.73,
    "EURUSD": 1.085, "GBPUSD": 1.270, "USDJPY": 149.5, "USDCAD": 1.36, "USDCHF": 0.895,
    "USDCNY": 7.24, "USDINR": 83.1, "USDSGD": 1.34, "USDKRW": 1325.0, "USDHKD": 7.82,
    "USDAUD": 1.53, "USDNZD": 1.62,
}


def _build_fallback_rate(pair: str, timestamp: str) -> dict:
    fb = _FALLBACK_RATES.get(pair, 1.0)
    spread = fb * 0.0002
    return {
        "symbol": pair,
        "mid": fb,
        "bid": round(fb - spread, 6),
        "ask": round(fb + spread, 6),
        "change_pct": 0.0,
        "source": "indicative_fallback",
        "timestamp": timestamp,
    }


async def _fetch_via_twelvedata(requested: list[str]) -> list[dict] | None:
    """Try TwelveData provider. Returns list of rate dicts or None on failure."""
    from app.services.market_data import get_orchestrator

    orch = get_orchestrator()
    if not orch or not orch._providers:
        return None

    # Find TwelveData provider
    td = next((p for p in orch._providers if p.provider_name == "twelvedata"), None)
    if not td:
        return None

    try:
        spots = await td.fetch_fx_spot(requested)
        if not spots:
            return None

        rates = []
        for s in spots:
            prev_close = s.mid  # TwelveData doesn't give prev_close in /quote
            rates.append({
                "symbol": s.pair,
                "mid": round(s.mid, 6),
                "bid": round(s.bid, 6),
                "ask": round(s.ask, 6),
                "change_pct": 0.0,
                "source": "twelvedata",
                "timestamp": s.as_of.isoformat() + "Z" if s.as_of else datetime.now(UTC).isoformat() + "Z",
            })
        return rates
    except Exception as exc:
        logger.warning("TwelveData FX fetch failed: %s — falling back", exc)
        return None


async def _fetch_via_yfinance(requested: list[str], timestamp: str) -> list[dict] | None:
    """Try yfinance as fallback. Returns list of rate dicts or None on failure."""
    try:
        import yfinance as yf
    except ImportError:
        logger.warning("yfinance not installed — skipping fallback")
        return None

    try:
        yf_symbols = [f"{p}=X" for p in requested]
        tickers = yf.Tickers(" ".join(yf_symbols))

        rates = []
        for pair, yf_sym in zip(requested, yf_symbols):
            try:
                info = tickers.tickers[yf_sym].info
                mid = (
                    info.get("regularMarketPrice")
                    or info.get("currentPrice")
                    or info.get("previousClose")
                )
                if mid is None:
                    raise ValueError("no price")
                prev = info.get("regularMarketPreviousClose") or info.get("previousClose") or mid
                spread = mid * 0.0002
                change_pct = ((mid - prev) / prev * 100) if prev else 0.0

                rates.append({
                    "symbol": pair,
                    "mid": round(mid, 6),
                    "bid": round(mid - spread, 6),
                    "ask": round(mid + spread, 6),
                    "change_pct": round(change_pct, 4),
                    "source": "yahoo_finance",
                    "timestamp": timestamp,
                })
            except Exception as exc:
                logger.warning("yfinance FX %s failed: %s", pair, exc)
                rates.append(_build_fallback_rate(pair, timestamp))

        return rates if rates else None
    except Exception as exc:
        logger.warning("yfinance bulk FX fetch failed: %s", exc)
        return None


@router.get("/fx/rates")
async def get_fx_rates(pairs: str | None = None):
    """
    Live FX spot rates. Failover: TwelveData → yfinance → hardcoded fallbacks.

    Query params:
      pairs: comma-separated list, e.g. "USDMXN,EURUSD". Defaults to all.
    """
    requested = (
        [p.strip().upper() for p in pairs.split(",") if p.strip()]
        if pairs
        else _FX_PAIRS
    )
    unknown = [p for p in requested if p not in _FX_PAIRS and p not in _FALLBACK_RATES]
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unsupported pair(s): {unknown}")

    timestamp = datetime.now(UTC).isoformat() + "Z"

    # 1. Try TwelveData (primary)
    rates = await _fetch_via_twelvedata(requested)
    if rates and len(rates) == len(requested):
        return {"rates": rates, "source": "live", "timestamp": timestamp, "count": len(rates)}

    # Partial TwelveData — fill gaps
    if rates:
        covered = {r["symbol"] for r in rates}
        missing = [p for p in requested if p not in covered]
        if missing:
            yf_rates = await _fetch_via_yfinance(missing, timestamp)
            if yf_rates:
                rates.extend(yf_rates)
            else:
                rates.extend(_build_fallback_rate(p, timestamp) for p in missing)
        return {"rates": rates, "source": "partial", "timestamp": timestamp, "count": len(rates)}

    # 2. Try yfinance (fallback)
    rates = await _fetch_via_yfinance(requested, timestamp)
    if rates:
        return {"rates": rates, "source": "live", "timestamp": timestamp, "count": len(rates)}

    # 3. Hardcoded fallbacks (last resort)
    rates = [_build_fallback_rate(p, timestamp) for p in requested]
    return {"rates": rates, "source": "indicative_fallback", "timestamp": timestamp, "count": len(rates)}


@router.get("/sectors")
async def get_market_sectors():
    """
    Sector ETFs + indices. Failover: TwelveData → yfinance.
    """
    market_etfs = ["SPY", "QQQ", "DIA", "IWM"]
    sector_etfs = ["XLK", "XLV", "XLF", "XLE", "XLY", "XLP", "XLI", "XLU", "XLB", "XLRE", "XLC"]
    all_symbols = market_etfs + sector_etfs

    etf_names = {
        "SPY": "S&P 500", "QQQ": "Nasdaq 100", "DIA": "Dow Jones", "IWM": "Russell 2000",
        "XLK": "Technology", "XLV": "Healthcare", "XLF": "Financials", "XLE": "Energy",
        "XLY": "Consumer Discr.", "XLP": "Consumer Staples", "XLI": "Industrials",
        "XLU": "Utilities", "XLB": "Materials", "XLRE": "Real Estate", "XLC": "Communications",
    }

    timestamp = datetime.now(UTC).isoformat() + "Z"

    # 1. Try TwelveData
    quotes = await _fetch_equity_twelvedata(all_symbols, market_etfs, etf_names, timestamp)
    if quotes:
        return {
            "quotes": quotes, "dataSource": "live", "timestamp": timestamp,
            "source": "TwelveData", "note": "Live market data from TwelveData",
        }

    # 2. Fallback to yfinance
    quotes = await _fetch_equity_yfinance(all_symbols, market_etfs, etf_names, timestamp)
    if quotes:
        return {
            "quotes": quotes, "dataSource": "live", "timestamp": timestamp,
            "source": "Yahoo Finance", "note": "Live market data from Yahoo Finance",
        }

    raise HTTPException(status_code=503, detail="Unable to fetch market data from any provider")


async def _fetch_equity_twelvedata(
    symbols: list[str], market_etfs: list[str], names: dict, timestamp: str,
) -> list[dict] | None:
    from app.services.market_data import get_orchestrator

    orch = get_orchestrator()
    if not orch:
        return None
    td = next((p for p in orch._providers if p.provider_name == "twelvedata"), None)
    if not td:
        return None

    try:
        equities = await td.fetch_equity_quotes(symbols)
        if not equities:
            return None
        return [
            {
                "symbol": e.symbol,
                "name": names.get(e.symbol, e.symbol),
                "price": round(e.price, 2),
                "change": round(e.price - e.close, 2) if e.close else 0.0,
                "changePercent": round(e.change_pct, 2),
                "volume": e.volume,
                "category": "market" if e.symbol in market_etfs else "sector",
            }
            for e in equities
        ]
    except Exception as exc:
        logger.warning("TwelveData equity fetch failed: %s", exc)
        return None


async def _fetch_equity_yfinance(
    symbols: list[str], market_etfs: list[str], names: dict, timestamp: str,
) -> list[dict] | None:
    try:
        import yfinance as yf
    except ImportError:
        return None

    try:
        tickers = yf.Tickers(" ".join(symbols))
        quotes = []
        for sym in symbols:
            try:
                info = tickers.tickers[sym].info
                price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose", 0)
                prev_close = info.get("regularMarketPreviousClose") or info.get("previousClose", 0)
                change = price - prev_close if prev_close else 0
                change_pct = (change / prev_close * 100) if prev_close else 0
                volume = info.get("regularMarketVolume") or info.get("volume", 0)
                quotes.append({
                    "symbol": sym,
                    "name": names.get(sym, sym),
                    "price": round(price, 2),
                    "change": round(change, 2),
                    "changePercent": round(change_pct, 2),
                    "volume": volume,
                    "category": "market" if sym in market_etfs else "sector",
                })
            except Exception:
                continue
        return quotes if quotes else None
    except Exception as exc:
        logger.warning("yfinance equity fetch failed: %s", exc)
        return None
