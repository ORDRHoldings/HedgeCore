# IBKR Live Cutover Checklist

**Scope:** Promoting Interactive Brokers (IBKR) market data from **paper** to **live** for institutional FX forward-points.
**Owner:** Operator (you) — Claude cannot run this autonomously.
**Tracked by:** Work item #20, blocked.

## Why this is blocked

IBKR connectivity requires an interactive Trader Workstation (TWS) session on the operator's machine. There is no headless server mode for free-tier IBKR; the API connects to the running TWS on `127.0.0.1:7497` (paper) or `127.0.0.1:7496` (live). Claude has no way to open TWS.

## Pre-flight (you do this once)

- [ ] IBKR account is funded (live data requires market-data subscriptions; free FX forward points are part of the IB Pro free tier for active accounts).
- [ ] TWS is installed: <https://www.interactivebrokers.com/en/trading/tws.php>
- [ ] In TWS → Configure → API → Settings:
  - [ ] Enable ActiveX and Socket Clients: **checked**
  - [ ] Socket port: `7497` for paper, `7496` for live
  - [ ] Master API Client ID: `1`
  - [ ] Trusted IPs: `127.0.0.1`
  - [ ] Read-Only API: **unchecked** (we only request market data, but trade auth must be allowed for the gateway to attach)
- [ ] Backend `IBKR_HOST=127.0.0.1`, `IBKR_PORT=7497` (paper) or `7496` (live), `IBKR_CLIENT_ID=1` env vars set in local dev or wherever the operator runs the connector.

## Paper smoke test

With TWS running in paper mode and the backend running locally:

```sh
cd backend
python -m scripts.ibkr_smoke --pair EURUSD --tenor 3M
```

(Script may not exist — see "Smoke test script" below.)

Expected: a single forward-points quote printed in <3 seconds. If the script hangs, TWS is not accepting connections — check the API settings above.

## Live cutover

1. Close TWS paper. Open TWS live. Re-verify API settings (they reset per profile).
2. Update env: `IBKR_PORT=7496`.
3. Restart backend.
4. Re-run smoke: `python -m scripts.ibkr_smoke --pair EURUSD --tenor 3M`.
5. If green, set the `ibkr` provider to `enabled: true` in the market data provider registry (`backend/app/services/market_data/registry.py` or via admin UI).
6. Watch `audit_events` for `market_data.ibkr.quote` events.
7. Verify in the terminal UI: `/market` page shows IBKR as a live source.

## Smoke test script (TO AUTHOR)

`backend/scripts/ibkr_smoke.py` does not exist as of 2026-05-16. Minimal version:

```python
"""IBKR live smoke. Run with TWS on 7497 (paper) or 7496 (live)."""
import asyncio
import os

from ib_insync import IB


async def main() -> None:
    ib = IB()
    await ib.connectAsync(
        host=os.getenv("IBKR_HOST", "127.0.0.1"),
        port=int(os.getenv("IBKR_PORT", "7497")),
        clientId=int(os.getenv("IBKR_CLIENT_ID", "1")),
        timeout=5,
    )
    print(f"Connected. Server version: {ib.client.serverVersion()}")
    # Request EUR/USD spot tick
    from ib_insync import Forex
    contract = Forex("EURUSD")
    ticker = ib.reqMktData(contract, snapshot=True)
    await asyncio.sleep(2)
    print(f"EURUSD bid/ask: {ticker.bid} / {ticker.ask}")
    ib.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
```

Add this as `backend/scripts/ibkr_smoke.py` before cutover.

## Close-out

Once live IBKR data flows for >24h with no error spikes in Sentry:

- [ ] Close work item #20 (memory.db: `UPDATE work_items SET status='completed' WHERE id=20`).
- [ ] Close work item #24 (dependent).
- [ ] Close risk R-002 (no institutional market data feed) in `open_risks`.
- [ ] Update `CURRENT_STATE.md`.

## Cutover gate

**STOP — Resume requires your action:** all steps above require a running TWS session.
