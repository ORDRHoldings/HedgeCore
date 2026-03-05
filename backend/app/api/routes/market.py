"""
Market Data Routes - Yahoo Finance Integration
Provides real-time market data for ETFs, indices, and FX spot rates.
"""
import logging
from datetime import datetime

import yfinance as yf
from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/market", tags=["market"])

# ── FX pairs supported by the platform ───────────────────────────────────────

_FX_PAIRS = [
    "USDMXN", "USDBRL", "USDCOP", "USDCLP", "USDPEN",   # LatAm
    "EURUSD", "GBPUSD", "USDJPY", "USDCAD", "USDCHF",   # G10
    "USDCNY", "USDINR", "USDSGD", "USDKRW", "USDHKD",   # Asia
    "USDAUD", "USDNZD",                                    # Oceania
]

# Indicative fallback rates (used only when yfinance is unavailable)
_FALLBACK_RATES: dict[str, float] = {
    "USDMXN": 17.24, "USDBRL": 4.97, "USDCOP": 4150.0, "USDCLP": 950.0, "USDPEN": 3.73,
    "EURUSD": 1.085, "GBPUSD": 1.270, "USDJPY": 149.5, "USDCAD": 1.36, "USDCHF": 0.895,
    "USDCNY": 7.24, "USDINR": 83.1, "USDSGD": 1.34, "USDKRW": 1325.0, "USDHKD": 7.82,
    "USDAUD": 1.53, "USDNZD": 1.62,
}


@router.get("/fx/rates")
async def get_fx_rates(pairs: str | None = None):
    """
    Live FX spot rates for major USD pairs via Yahoo Finance.

    Query params:
      pairs: comma-separated list of pairs, e.g. "USDMXN,EURUSD"
             Defaults to all supported pairs.

    Response:
      { rates: [{ symbol, mid, bid, ask, change_pct, source, timestamp }], ... }
    """
    requested = (
        [p.strip().upper() for p in pairs.split(",") if p.strip()]
        if pairs
        else _FX_PAIRS
    )
    # Validate — only serve pairs we know about
    unknown = [p for p in requested if p not in _FX_PAIRS and p not in _FALLBACK_RATES]
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unsupported pair(s): {unknown}")

    # Yahoo Finance ticker format: "USDMXN=X"
    yf_symbols = [f"{p}=X" for p in requested]
    timestamp = datetime.utcnow().isoformat() + "Z"

    rates = []
    source = "live"

    try:
        tickers = yf.Tickers(" ".join(yf_symbols))

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
                spread = mid * 0.0002  # ~2 pip institutional spread
                change_pct = ((mid - prev) / prev * 100) if prev else 0.0

                rates.append({
                    "symbol":     pair,
                    "mid":        round(mid, 6),
                    "bid":        round(mid - spread, 6),
                    "ask":        round(mid + spread, 6),
                    "change_pct": round(change_pct, 4),
                    "source":     "yahoo_finance",
                    "timestamp":  timestamp,
                })
            except Exception as exc:
                logger.warning("yfinance FX fetch failed for %s: %s — using fallback", pair, exc)
                fb = _FALLBACK_RATES.get(pair, 1.0)
                spread = fb * 0.0002
                rates.append({
                    "symbol":     pair,
                    "mid":        fb,
                    "bid":        round(fb - spread, 6),
                    "ask":        round(fb + spread, 6),
                    "change_pct": 0.0,
                    "source":     "indicative_fallback",
                    "timestamp":  timestamp,
                })
                source = "partial"

    except Exception as exc:
        logger.error("yfinance bulk FX fetch failed: %s — returning all fallbacks", exc)
        source = "indicative_fallback"
        rates = [
            {
                "symbol":     pair,
                "mid":        _FALLBACK_RATES.get(pair, 1.0),
                "bid":        round(_FALLBACK_RATES.get(pair, 1.0) * 0.9998, 6),
                "ask":        round(_FALLBACK_RATES.get(pair, 1.0) * 1.0002, 6),
                "change_pct": 0.0,
                "source":     "indicative_fallback",
                "timestamp":  timestamp,
            }
            for pair in requested
        ]

    return {
        "rates":     rates,
        "source":    source,
        "timestamp": timestamp,
        "count":     len(rates),
    }


@router.get("/sectors")
async def get_market_sectors():
    """
    Fetch real-time market data for major indices and sector ETFs from Yahoo Finance.

    Returns:
        Wall Street sector ETFs and major market indices with live prices
    """
    try:
        # Define ETF symbols
        market_etfs = ["SPY", "QQQ", "DIA", "IWM"]
        sector_etfs = ["XLK", "XLV", "XLF", "XLE", "XLY", "XLP", "XLI", "XLU", "XLB", "XLRE", "XLC"]
        all_symbols = market_etfs + sector_etfs

        # ETF metadata
        etf_names = {
            "SPY": "S&P 500",
            "QQQ": "Nasdaq 100",
            "DIA": "Dow Jones",
            "IWM": "Russell 2000",
            "XLK": "Technology",
            "XLV": "Healthcare",
            "XLF": "Financials",
            "XLE": "Energy",
            "XLY": "Consumer Discr.",
            "XLP": "Consumer Staples",
            "XLI": "Industrials",
            "XLU": "Utilities",
            "XLB": "Materials",
            "XLRE": "Real Estate",
            "XLC": "Communications",
        }

        # Fetch data from Yahoo Finance
        tickers = yf.Tickers(" ".join(all_symbols))

        quotes = []
        for symbol in all_symbols:
            try:
                ticker = tickers.tickers[symbol]
                info = ticker.info

                # Get current price and change
                price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose", 0)
                prev_close = info.get("regularMarketPreviousClose") or info.get("previousClose", 0)
                change = price - prev_close if prev_close else 0
                change_percent = (change / prev_close * 100) if prev_close else 0
                volume = info.get("regularMarketVolume") or info.get("volume", 0)

                category = "market" if symbol in market_etfs else "sector"

                quotes.append({
                    "symbol": symbol,
                    "name": etf_names.get(symbol, symbol),
                    "price": round(price, 2),
                    "change": round(change, 2),
                    "changePercent": round(change_percent, 2),
                    "volume": volume,
                    "category": category,
                })
            except Exception as e:
                # Skip symbols that fail to fetch
                print(f"Failed to fetch {symbol}: {str(e)}")
                continue

        if not quotes:
            raise HTTPException(status_code=503, detail="Unable to fetch market data from Yahoo Finance")

        return {
            "quotes": quotes,
            "dataSource": "live",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "source": "Yahoo Finance",
            "note": "Live market data from Yahoo Finance",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Market data fetch failed: {str(e)}")
