#!/usr/bin/env python3
"""
Standalone IBKR connector — runs alongside IB Gateway.
Fetches market data and POSTs to ORDR Terminal backend API.

Usage:
  python scripts/ibkr_connector.py \
    --api-url https://hedgecore.onrender.com/api \
    --api-token <JWT> \
    --ibkr-port 4002 \
    --interval 300
"""
import argparse
import asyncio
import logging
import sys

import httpx

sys.path.insert(0, ".")
from app.services.market_data.ibkr_provider import IBKRProvider

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
_log = logging.getLogger("ibkr_connector")


async def run_connector(args):
    provider = IBKRProvider(host=args.ibkr_host, port=args.ibkr_port, client_id=args.client_id)
    headers = {"Authorization": f"Bearer {args.api_token}", "Content-Type": "application/json"}
    pairs = [p.strip() for p in args.pairs.split(",")]

    _log.info("IBKR connector starting: %s:%s -> %s", args.ibkr_host, args.ibkr_port, args.api_url)
    _log.info("Pairs: %s | Interval: %ds", pairs, args.interval)

    while True:
        try:
            # ── FX Spots ─────────────────────────────────
            spots = await provider.fetch_fx_spot(pairs)
            for spot in spots:
                payload = {
                    "payload": {
                        "spot_rate": spot.mid,
                        "as_of": spot.as_of.isoformat(),
                        "forward_points_by_month": {},
                        "provider_metadata": {
                            "source": "ibkr", "data_class": "LIVE",
                            "primary_currency": spot.pair[3:], "pair": spot.pair,
                            "bid": spot.bid, "ask": spot.ask,
                        },
                    }
                }
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(f"{args.api_url}/v1/market-snapshots", json=payload, headers=headers)
                    _log.info("Spot %s: %.4f (status %d)", spot.pair, spot.mid, resp.status_code)

            # ── Forward Curves ────────────────────────────
            curves = await provider.fetch_forward_curves(pairs)
            for curve in curves:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(
                        f"{args.api_url}/v1/forward-curves",
                        json={
                            "pair": curve.pair,
                            "as_of": curve.as_of.isoformat(),
                            "source": "IBKR",
                            "data_class": "LIVE",
                            "forward_points": curve.forward_points,
                            "spot_mid": curve.spot_mid,
                        },
                        headers=headers,
                    )
                    _log.info("Forward %s: %d tenors (status %d)", curve.pair, len(curve.forward_points), resp.status_code)

            _log.info("Cycle complete: %d spots, %d curves", len(spots), len(curves))

        except Exception as exc:
            _log.error("Connector cycle failed: %s", exc)

        _log.info("Sleeping %ds...", args.interval)
        await asyncio.sleep(args.interval)


def main():
    parser = argparse.ArgumentParser(description="IBKR -> ORDR Terminal connector")
    parser.add_argument("--api-url", required=True, help="Backend API base URL (e.g. https://hedgecore.onrender.com/api)")
    parser.add_argument("--api-token", required=True, help="JWT access token")
    parser.add_argument("--ibkr-host", default="127.0.0.1")
    parser.add_argument("--ibkr-port", type=int, default=4002)
    parser.add_argument("--client-id", type=int, default=1)
    parser.add_argument("--pairs", default="USDMXN,EURUSD,GBPUSD,USDJPY,USDCAD,USDCHF")
    parser.add_argument("--interval", type=int, default=300, help="Poll interval in seconds")
    args = parser.parse_args()
    asyncio.run(run_connector(args))


if __name__ == "__main__":
    main()
