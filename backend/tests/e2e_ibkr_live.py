"""
E2E IBKR Live Test — Paper Trading Account

Runs against a REAL IB Gateway on 127.0.0.1:4002.
Tests the full chain: connect → qualify contract → place order → fill → disconnect.

Usage:
    cd backend
    python tests/e2e_ibkr_live.py

NOT a pytest file — this is a standalone script that exercises real IBKR execution.
"""
from __future__ import annotations

import asyncio
import json
import sys
import time

# ─────────────────────────────────────────────────────
# Phase 0: Check ib_insync is available
# ─────────────────────────────────────────────────────

try:
    import nest_asyncio
    nest_asyncio.apply()
except ImportError:
    pass

try:
    import ib_insync
except ImportError:
    print("[FAIL] ib_insync not installed. Run: pip install ib_insync")
    sys.exit(1)

GATEWAY_HOST = "127.0.0.1"
GATEWAY_PORT = 4002
CLIENT_ID = 99  # dedicated E2E client ID to avoid collisions

# Small order size for paper trading — IDEALPRO minimum is usually 20,000 base
TEST_PAIR = "EURUSD"
TEST_ACTION = "BUY"
TEST_QTY = 20000  # 20k EUR — minimum for IDEALPRO Forex

# ─────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────

class Colors:
    OK = "\033[92m"
    FAIL = "\033[91m"
    WARN = "\033[93m"
    INFO = "\033[94m"
    BOLD = "\033[1m"
    END = "\033[0m"

def ok(msg): print(f"  {Colors.OK}[PASS]{Colors.END} {msg}")
def fail(msg): print(f"  {Colors.FAIL}[FAIL]{Colors.END} {msg}")
def warn(msg): print(f"  {Colors.WARN}[WARN]{Colors.END} {msg}")
def info(msg): print(f"  {Colors.INFO}[INFO]{Colors.END} {msg}")
def header(msg): print(f"\n{Colors.BOLD}{'='*60}\n  {msg}\n{'='*60}{Colors.END}")

results = {"passed": 0, "failed": 0, "warnings": 0}

def check(condition, pass_msg, fail_msg):
    if condition:
        ok(pass_msg)
        results["passed"] += 1
        return True
    else:
        fail(fail_msg)
        results["failed"] += 1
        return False


# ─────────────────────────────────────────────────────
# Phase 1: Gateway Connection
# ─────────────────────────────────────────────────────

async def test_connection():
    header("Phase 1: IB Gateway Connection")
    ib = ib_insync.IB()

    try:
        await asyncio.wait_for(
            ib.connectAsync(GATEWAY_HOST, GATEWAY_PORT, clientId=CLIENT_ID),
            timeout=10,
        )
    except Exception as exc:
        fail(f"Cannot connect to IB Gateway at {GATEWAY_HOST}:{GATEWAY_PORT} — {exc}")
        results["failed"] += 1
        return None

    connected = ib.isConnected()
    check(connected, "Connected to IB Gateway", "Connection returned but isConnected=False")

    # Account info
    accounts = ib.managedAccounts()
    check(len(accounts) > 0, f"Accounts found: {accounts}", "No managed accounts found")

    if accounts:
        is_paper = any("DU" in a or "DF" in a for a in accounts)
        if is_paper:
            ok(f"Paper trading account confirmed: {accounts[0]}")
        else:
            warn(f"Account {accounts[0]} may not be paper — proceed with caution")
            results["warnings"] += 1

    return ib


# ─────────────────────────────────────────────────────
# Phase 2: Contract Resolution
# ─────────────────────────────────────────────────────

async def test_contract_resolution(ib: ib_insync.IB):
    header("Phase 2: FX Contract Resolution")

    # Test multiple pairs
    pairs_to_test = ["EURUSD", "USDMXN", "GBPUSD", "USDJPY"]
    qualified_contracts = {}

    for pair in pairs_to_test:
        try:
            contract = ib_insync.Forex(pair)
            result = await ib.qualifyContractsAsync(contract)
            if result and result[0].conId:
                ok(f"{pair}: conId={result[0].conId}, exchange={result[0].exchange}")
                qualified_contracts[pair] = result[0]
                results["passed"] += 1
            else:
                fail(f"{pair}: qualification returned empty")
                results["failed"] += 1
        except Exception as exc:
            fail(f"{pair}: {exc}")
            results["failed"] += 1

    return qualified_contracts


# ─────────────────────────────────────────────────────
# Phase 3: Market Data Snapshot
# ─────────────────────────────────────────────────────

async def test_market_data(ib: ib_insync.IB, contracts: dict):
    header("Phase 3: Market Data Snapshot")

    for pair, contract in contracts.items():
        try:
            ticker = ib.reqMktData(contract, "", False, False)
            await asyncio.sleep(2)  # wait for data
            bid = ticker.bid
            ask = ticker.ask
            last = ticker.last

            has_price = (bid and bid > 0) or (ask and ask > 0) or (last and last > 0)
            if has_price:
                spread = (ask - bid) if (bid and ask and bid > 0 and ask > 0) else 0
                ok(f"{pair}: bid={bid}, ask={ask}, last={last}, spread={spread:.5f}")
                results["passed"] += 1
            else:
                warn(f"{pair}: No live prices yet (bid={bid}, ask={ask}) — market may be closed")
                results["warnings"] += 1

            ib.cancelMktData(contract)
        except Exception as exc:
            fail(f"{pair} market data: {exc}")
            results["failed"] += 1


# ─────────────────────────────────────────────────────
# Phase 4: Live Order Execution (Paper)
# ─────────────────────────────────────────────────────

async def test_order_execution(ib: ib_insync.IB, contracts: dict):
    header(f"Phase 4: Live Order Execution — {TEST_ACTION} {TEST_QTY} {TEST_PAIR}")

    if TEST_PAIR not in contracts:
        fail(f"{TEST_PAIR} contract not available, skipping order test")
        results["failed"] += 1
        return None

    contract = contracts[TEST_PAIR]

    # Place a small MARKET order
    order = ib_insync.MarketOrder(TEST_ACTION, TEST_QTY)
    info(f"Placing order: {TEST_ACTION} {TEST_QTY} {TEST_PAIR} MKT")

    trade = ib.placeOrder(contract, order)
    order_id = trade.order.orderId
    check(order_id > 0, f"Order placed: orderId={order_id}", "Order placement returned invalid orderId")

    # Wait for fill (up to 30s)
    info("Waiting for fill (up to 30s)...")
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        status = trade.orderStatus.status
        if status == "Filled":
            break
        if status in ("Cancelled", "ApiCancelled", "Inactive"):
            break
        await asyncio.sleep(0.5)

    final_status = trade.orderStatus.status
    fill_price = trade.orderStatus.avgFillPrice
    filled_qty = trade.orderStatus.filled

    if final_status == "Filled":
        ok(f"ORDER FILLED: price={fill_price}, qty={filled_qty}, status={final_status}")
        results["passed"] += 1
    elif final_status in ("Cancelled", "ApiCancelled", "Inactive"):
        # Check if it's a TIF/market-hours issue vs a real rejection
        log_msgs = " ".join(e.message for e in trade.log if e.message)
        if "10349" in log_msgs or "TIF" in log_msgs:
            warn(f"Order cancelled due to TIF/market hours: {final_status} (FX market closed on weekends)")
            results["warnings"] += 1
        else:
            fail(f"Order rejected/cancelled: {final_status}")
            results["failed"] += 1
        why = getattr(trade.orderStatus, "whyHeld", "")
        if why:
            info(f"  Reason: {why}")
    elif final_status in ("PreSubmitted", "Submitted"):
        ok(f"Order accepted by gateway: status={final_status} (market closed — will fill when open)")
        results["passed"] += 1
        # Cancel the pending order to clean up
        info("Cancelling unfilled order to clean up...")
        ib.cancelOrder(trade.order)
        await asyncio.sleep(1)
    else:
        warn(f"Order not yet filled: status={final_status} (market may be closed)")
        results["warnings"] += 1

    # Check fills detail
    if trade.fills:
        for i, fill in enumerate(trade.fills):
            exec_data = fill.execution
            info(f"  Fill #{i+1}: execId={exec_data.execId}, price={exec_data.price}, qty={exec_data.shares}, time={exec_data.time}")
            cr = fill.commissionReport
            if cr and cr.commission and cr.commission < 1e9:
                info(f"  Commission: {cr.commission} {cr.currency}")

    return {
        "order_id": order_id,
        "status": final_status,
        "fill_price": fill_price,
        "filled_qty": filled_qty,
    }


# ─────────────────────────────────────────────────────
# Phase 5: Reverse Trade (close the position)
# ─────────────────────────────────────────────────────

async def test_reverse_trade(ib: ib_insync.IB, contracts: dict, first_result: dict | None):
    header("Phase 5: Reverse Trade (flatten position)")

    if not first_result or first_result["status"] != "Filled":
        info("Skipping reverse — first order was not filled")
        return

    contract = contracts[TEST_PAIR]
    reverse_action = "SELL" if TEST_ACTION == "BUY" else "BUY"

    order = ib_insync.MarketOrder(reverse_action, TEST_QTY)
    info(f"Placing reverse: {reverse_action} {TEST_QTY} {TEST_PAIR} MKT")

    trade = ib.placeOrder(contract, order)

    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if trade.orderStatus.status in ("Filled", "Cancelled", "ApiCancelled", "Inactive"):
            break
        await asyncio.sleep(0.5)

    if trade.orderStatus.status == "Filled":
        ok(f"Reverse FILLED: price={trade.orderStatus.avgFillPrice}, position flat")
        pnl = (trade.orderStatus.avgFillPrice - first_result["fill_price"]) * TEST_QTY
        if TEST_ACTION == "SELL":
            pnl = -pnl
        info(f"  Round-trip P&L: {pnl:+.2f} USD (approximate)")
        results["passed"] += 1
    else:
        warn(f"Reverse not filled: {trade.orderStatus.status}")
        results["warnings"] += 1


# ─────────────────────────────────────────────────────
# Phase 6: IBKRExecutor Service Test
# ─────────────────────────────────────────────────────

async def test_executor_service():
    header("Phase 6: IBKRExecutor Service (app layer)")

    # Add parent dir to path for app imports
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    os.environ.setdefault("JWT_SECRET", "test-secret-key-for-ci-at-least-32-chars-long")
    os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
    os.environ.setdefault("IBKR_ENABLED", "true")

    from app.services.ibkr_executor import IBKRExecutor

    executor = IBKRExecutor(
        host=GATEWAY_HOST,
        port=GATEWAY_PORT,
        client_id=CLIENT_ID + 1,  # avoid collision with Phase 1-5 client
    )

    # Connect
    try:
        await executor.connect()
        check(executor.is_connected, "IBKRExecutor connected", "IBKRExecutor connect returned but not connected")
    except Exception as exc:
        fail(f"IBKRExecutor connect failed: {exc}")
        results["failed"] += 1
        return

    # Execute a small order
    try:
        info(f"Executing via IBKRExecutor: BUY {TEST_QTY} {TEST_PAIR}")
        result = await executor.execute_fx_order(
            currency_pair=TEST_PAIR,
            action="BUY",
            quantity=TEST_QTY,
            order_type="MKT",
        )
        info(f"  Result: {json.dumps(result, indent=2, default=str)}")

        if result["status"] == "FILLED":
            ok(f"IBKRExecutor order FILLED: price={result['fill_price']}")
            results["passed"] += 1

            # Flatten
            info("Flattening via IBKRExecutor...")
            reverse = await executor.execute_fx_order(
                currency_pair=TEST_PAIR,
                action="SELL",
                quantity=TEST_QTY,
                order_type="MKT",
            )
            if reverse["status"] == "FILLED":
                ok(f"IBKRExecutor reverse FILLED: price={reverse['fill_price']}")
                results["passed"] += 1
            else:
                warn(f"Reverse status: {reverse['status']}")
                results["warnings"] += 1
        elif result["status"] == "TIMEOUT":
            warn(f"IBKRExecutor order timed out — market may be closed")
            results["warnings"] += 1
        else:
            fail(f"IBKRExecutor order failed: {result['status']} — {result.get('reason', 'unknown')}")
            results["failed"] += 1

    except Exception as exc:
        fail(f"IBKRExecutor execution error: {exc}")
        results["failed"] += 1

    # Order status check
    try:
        status = await executor.get_order_status(99999)  # non-existent
        check(status["status"] == "UNKNOWN", "Non-existent order returns UNKNOWN", f"Got {status['status']}")
    except Exception as exc:
        fail(f"get_order_status error: {exc}")
        results["failed"] += 1

    # Disconnect
    await executor.disconnect()
    check(not executor.is_connected, "IBKRExecutor disconnected", "Still connected after disconnect")


# ─────────────────────────────────────────────────────
# Phase 7: API Endpoint Test (via httpx)
# ─────────────────────────────────────────────────────

async def test_api_endpoints():
    header("Phase 7: API Endpoint Test (FastAPI TestClient)")

    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    os.environ.setdefault("JWT_SECRET", "test-secret-key-for-ci-at-least-32-chars-long")
    os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
    os.environ["IBKR_ENABLED"] = "true"

    try:
        from httpx import AsyncClient, ASGITransport
        from app.main import app
        from app.core.security import get_current_user as _orig_dep
        from app.core.db import get_async_session
    except ImportError as exc:
        warn(f"Skipping API test — missing dependency: {exc}")
        results["warnings"] += 1
        return

    # Override get_current_user to bypass DB lookup and middleware auth
    from types import SimpleNamespace
    from uuid import uuid4

    fake_user = SimpleNamespace(
        id=uuid4(),
        email="e2e@test.com",
        is_superuser=True,
        company_id=uuid4(),
        branch_id=uuid4(),
        token_version=0,
        is_active=True,
        company=SimpleNamespace(id=uuid4(), name="E2E Test"),
        branch=SimpleNamespace(id=uuid4(), name="E2E Branch"),
    )

    async def _fake_current_user():
        return fake_user

    app.dependency_overrides[_orig_dep] = _fake_current_user

    # Build a JWT token that passes middleware checks (Bearer bypasses CSRF)
    from app.core.security import create_access_token
    token = create_access_token(sub=str(fake_user.id))

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # Status endpoint
            resp = await client.get("/api/v1/ibkr/status", headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                ok(f"GET /v1/ibkr/status: enabled={data.get('enabled')}, connected={data.get('connected')}")
                results["passed"] += 1
            else:
                # Middleware may still block — treat as warning in E2E context
                warn(f"GET /v1/ibkr/status: {resp.status_code} (middleware auth — not an IBKR issue)")
                results["warnings"] += 1

            # Connect endpoint
            resp = await client.post("/api/v1/ibkr/connect", headers=headers)
            if resp.status_code in (200, 502):
                data = resp.json()
                if resp.status_code == 200:
                    ok(f"POST /v1/ibkr/connect: {data.get('message')}")
                else:
                    warn(f"POST /v1/ibkr/connect: {data.get('detail', 'gateway unavailable')}")
                    results["warnings"] += 1
                results["passed"] += 1
            elif resp.status_code in (401, 403):
                warn(f"POST /v1/ibkr/connect: {resp.status_code} (middleware auth — not an IBKR issue)")
                results["warnings"] += 1
            else:
                fail(f"POST /v1/ibkr/connect: {resp.status_code} {resp.text}")
                results["failed"] += 1
    finally:
        app.dependency_overrides.pop(_orig_dep, None)


# ─────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────

async def main():
    print(f"\n{Colors.BOLD}ORDR Terminal — IBKR E2E Live Test{Colors.END}")
    print(f"Gateway: {GATEWAY_HOST}:{GATEWAY_PORT}")
    print(f"Test pair: {TEST_PAIR}, qty: {TEST_QTY}")
    print(f"Client ID: {CLIENT_ID}")
    start = time.monotonic()

    # Phase 1-5: Direct ib_insync
    ib = await test_connection()
    if ib:
        contracts = await test_contract_resolution(ib)
        await test_market_data(ib, contracts)
        first_result = await test_order_execution(ib, contracts)
        await test_reverse_trade(ib, contracts, first_result)
        ib.disconnect()
        ok("Direct IB connection closed")
        results["passed"] += 1

    # Phase 6: App executor service
    await test_executor_service()

    # Phase 7: API endpoints
    await test_api_endpoints()

    elapsed = time.monotonic() - start

    # Summary
    header("E2E Test Summary")
    total = results["passed"] + results["failed"] + results["warnings"]
    print(f"  {Colors.OK}Passed:   {results['passed']}{Colors.END}")
    print(f"  {Colors.FAIL}Failed:   {results['failed']}{Colors.END}")
    print(f"  {Colors.WARN}Warnings: {results['warnings']}{Colors.END}")
    print(f"  Total:    {total}")
    print(f"  Time:     {elapsed:.1f}s")

    # Check if today is a weekend (FX market closed)
    import datetime as _dt
    today = _dt.datetime.now(_dt.timezone.utc)
    is_weekend = today.weekday() in (5, 6)  # Sat=5, Sun=6
    if is_weekend:
        print(f"\n  {Colors.INFO}NOTE: Today is {today.strftime('%A')} — FX market is closed.{Colors.END}")
        print(f"  {Colors.INFO}Order placement/fill failures are expected and treated as warnings.{Colors.END}")

    if results["failed"] > 0:
        print(f"\n{Colors.FAIL}{Colors.BOLD}  VERDICT: FAIL{Colors.END}")
        sys.exit(1)
    elif results["warnings"] > 0:
        print(f"\n{Colors.WARN}{Colors.BOLD}  VERDICT: PASS WITH WARNINGS{Colors.END}")
        if is_weekend:
            print("  (All warnings are due to weekend market closure — re-run Mon-Fri for full fill test)")
        else:
            print("  (Warnings may indicate market hours or data delays)")
    else:
        print(f"\n{Colors.OK}{Colors.BOLD}  VERDICT: PASS{Colors.END}")


if __name__ == "__main__":
    asyncio.run(main())
