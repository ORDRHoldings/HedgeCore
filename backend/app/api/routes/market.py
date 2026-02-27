"""
Market Data Routes - Yahoo Finance Integration
Provides real-time market data for ETFs and indices
"""
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
import yfinance as yf
from datetime import datetime

router = APIRouter(prefix="/v1/market", tags=["market"])


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
