"""Quick test of yfinance to fetch market data"""
import yfinance as yf
import json

# Test fetching SPY data
ticker = yf.Ticker("SPY")
info = ticker.info

print(f"SPY Data:")
print(f"  Current Price: ${info.get('currentPrice') or info.get('regularMarketPrice')}")
print(f"  Previous Close: ${info.get('previousClose')}")
print(f"  Volume: {info.get('volume'):,}")
print(f"  Market Cap: ${info.get('marketCap'):,}")

# Test multiple tickers
print("\nFetching multiple tickers...")
tickers = yf.Tickers("SPY QQQ DIA IWM")
for symbol in ["SPY", "QQQ", "DIA", "IWM"]:
    ticker_info = tickers.tickers[symbol].info
    price = ticker_info.get('currentPrice') or ticker_info.get('regularMarketPrice')
    prev_close = ticker_info.get('previousClose')
    change = price - prev_close if price and prev_close else 0
    change_pct = (change / prev_close * 100) if prev_close else 0

    print(f"{symbol}: ${price:.2f} ({change_pct:+.2f}%)")

print("\nyfinance is working correctly!")
