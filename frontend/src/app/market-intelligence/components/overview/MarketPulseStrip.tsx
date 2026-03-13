"use client";

import TradingViewWidget from "../TradingViewWidget";

const TICKER_SYMBOLS = [
  { proName: "FOREXCOM:SPXUSD", title: "S&P 500" },
  { proName: "FOREXCOM:NSXUSD", title: "US 100" },
  { proName: "BLACKBULL:US30", title: "Dow 30" },
  { proName: "INDEX:RUT", title: "Russell 2000" },
  { proName: "CBOE:VIX", title: "VIX" },
  { proName: "TVC:US02Y", title: "US 2Y" },
  { proName: "TVC:US10Y", title: "US 10Y" },
  { proName: "TVC:DXY", title: "DXY" },
  { proName: "TVC:GOLD", title: "Gold" },
  { proName: "TVC:USOIL", title: "WTI" },
  { proName: "BITSTAMP:BTCUSD", title: "BTC" },
  { proName: "BITSTAMP:ETHUSD", title: "ETH" },
  { proName: "FX_IDC:EURUSD", title: "EUR/USD" },
  { proName: "FX_IDC:USDJPY", title: "USD/JPY" },
  { proName: "FX_IDC:USDMXN", title: "USD/MXN" },
];

export default function MarketPulseStrip() {
  return (
    <TradingViewWidget
      scriptSrc="embed-widget-ticker-tape.js"
      config={{
        symbols: TICKER_SYMBOLS,
        showSymbolLogo: true,
        displayMode: "adaptive",
        locale: "en",
      }}
      height={46}
    />
  );
}
