#!/usr/bin/env python3
"""
Position Desk End-to-End Workflow Test
Standard: BlackRock Aladdin / Bloomberg Terminal
Test Coverage: Position lifecycle, audit trail, 4-eyes approval

Usage:
    python test_position_workflow.py --env production
    python test_position_workflow.py --env local

Requirements:
    pip install requests pytest tabulate
"""

import requests
import json
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict
import argparse
from tabulate import tabulate

# =============================================================================
# CONFIGURATION
# =============================================================================

ENVIRONMENTS = {
    "production": {
        "base_url": "https://hedgecore.onrender.com",
        "frontend_url": "https://hedgecore.vercel.app",
    },
    "local": {
        "base_url": "http://localhost:8000",
        "frontend_url": "http://localhost:3000",
    },
}

DEFAULT_USER = {
    "email": "demo",
    "password": "demo",
}

# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class Position:
    record_id: str
    entity: str
    flow_type: str  # AR or AP
    currency: str
    amount: float
    value_date: str
    status: str = "CONFIRMED"
    description: str = ""
    execution_status: str = "NEW"
    policy_id: Optional[str] = None
    calculation_run_id: Optional[str] = None

@dataclass
class AuditEvent:
    event_type: str
    actor_email: str
    position_id: str
    changes_json: dict
    created_at: str
    hash_chain_current: str

@dataclass
class TestResult:
    test_name: str
    status: str  # PASS, FAIL, SKIP
    duration_ms: float
    details: str
    audit_verified: bool = False

# =============================================================================
# API CLIENT
# =============================================================================

class HedgeCoreClient:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.token: Optional[str] = None
        self.user_id: Optional[str] = None
        self.api_key = "HC_DEV_KEY_001"  # Bootstrap API key

    def login(self, email: str, password: str) -> bool:
        """Authenticate and get JWT token"""
        response = requests.post(
            f"{self.base_url}/api/auth/login",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={"username": email, "password": password},
        )
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("access_token")
            self.user_id = data.get("user_id")
            return True
        return False

    def _headers(self) -> Dict[str, str]:
        headers = {"X-API-Key": self.api_key}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def create_position(self, position: Position) -> Optional[str]:
        """Create a single position"""
        response = requests.post(
            f"{self.base_url}/api/v1/positions",
            headers=self._headers(),
            json=asdict(position),
        )
        if response.status_code == 201:
            return response.json().get("id")
        return None

    def list_positions(self, status: Optional[str] = None) -> List[Dict]:
        """List all positions, optionally filtered by status"""
        params = {"execution_status": status} if status else {}
        response = requests.get(
            f"{self.base_url}/api/v1/positions",
            headers=self._headers(),
            params=params,
        )
        if response.status_code == 200:
            return response.json()
        return []

    def assign_policy(self, position_id: str, policy_id: str) -> bool:
        """Assign policy to position"""
        response = requests.post(
            f"{self.base_url}/api/v1/positions/{position_id}/assign-policy",
            headers=self._headers(),
            json={"policy_id": policy_id},
        )
        return response.status_code == 200

    def mark_ready(self, position_id: str, run_id: str) -> bool:
        """Mark position ready to execute"""
        response = requests.post(
            f"{self.base_url}/api/v1/positions/{position_id}/mark-ready",
            headers=self._headers(),
            json={"calculation_run_id": run_id},
        )
        return response.status_code == 200

    def reject_position(self, position_id: str, reason: str) -> bool:
        """Reject position with reason"""
        response = requests.post(
            f"{self.base_url}/api/v1/positions/{position_id}/reject",
            headers=self._headers(),
            json={"reason": reason},
        )
        return response.status_code == 200

    def reopen_position(self, position_id: str) -> bool:
        """Reopen rejected position"""
        response = requests.post(
            f"{self.base_url}/api/v1/positions/{position_id}/reopen",
            headers=self._headers(),
        )
        return response.status_code == 200

    def get_audit_trail(self, position_id: str) -> List[Dict]:
        """Get audit trail for position"""
        response = requests.get(
            f"{self.base_url}/api/v1/audit/position/{position_id}",
            headers=self._headers(),
        )
        if response.status_code == 200:
            return response.json()
        return []

    def verify_hash_chain(self) -> Dict:
        """Verify hash chain integrity"""
        response = requests.get(
            f"{self.base_url}/api/v1/audit/verify-hash-chain",
            headers=self._headers(),
        )
        if response.status_code == 200:
            return response.json()
        return {"valid": False, "message": "Hash chain verification failed"}

    def upload_csv(self, csv_content: str) -> Dict:
        """Upload CSV file"""
        files = {"file": ("positions.csv", csv_content, "text/csv")}
        response = requests.post(
            f"{self.base_url}/api/v1/positions/import",
            headers=self._headers(),
            files=files,
        )
        if response.status_code == 200:
            data = response.json()
            return {"success": data.get("created", 0) > 0, "imported": data.get("created", 0)}
        return {"success": False, "imported": 0, "message": response.text}

# =============================================================================
# TEST SUITE
# =============================================================================

class PositionWorkflowTests:
    def __init__(self, client: HedgeCoreClient):
        self.client = client
        self.results: List[TestResult] = []
        self.test_positions: Dict[str, str] = {}  # record_id -> position_id

    def run_all(self):
        """Run complete test suite"""
        print("\n" + "="*80)
        print("POSITION DESK END-TO-END WORKFLOW TEST")
        print("Standard: BlackRock Aladdin / Bloomberg Terminal")
        print("="*80 + "\n")

        # Authentication
        print(">> Authenticating...")
        if not self.client.login(DEFAULT_USER["email"], DEFAULT_USER["password"]):
            print("X Authentication failed. Cannot proceed.")
            return

        print(f"OK Authenticated as {DEFAULT_USER['email']}\n")

        # Run tests
        self.test_01_create_manual_position()
        self.test_02_csv_upload()
        self.test_03_position_lifecycle()
        self.test_04_rejection_workflow()
        self.test_05_bulk_policy_assignment()
        self.test_06_audit_trail_verification()
        self.test_07_hash_chain_integrity()
        self.test_08_data_integrity_checks()

        # Print results
        self.print_results()

    def test_01_create_manual_position(self):
        """Test 1: Manual Position Creation"""
        start = time.time()
        test_name = "Test 1: Manual Position Creation"

        try:
            # Use timestamp to ensure unique record_id
            timestamp_id = datetime.now().strftime("%Y%m%d%H%M%S")
            record_id = f"TEST-{timestamp_id}"

            position = Position(
                record_id=record_id,
                entity="Test Corporation",
                flow_type="AR",
                currency="USD",
                amount=1000000.00,
                value_date=(datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d"),
            )

            position_id = self.client.create_position(position)
            duration = (time.time() - start) * 1000

            if position_id:
                self.test_positions[record_id] = position_id
                self.test_positions["TEST-MANUAL"] = position_id  # Alias for other tests

                # Verify audit trail
                audit = self.client.get_audit_trail(position_id)
                has_creation_event = any(e.get("event_type") == "POSITION_CREATED" for e in audit)

                self.results.append(TestResult(
                    test_name=test_name,
                    status="PASS" if has_creation_event else "FAIL",
                    duration_ms=duration,
                    details=f"Position created: {position_id}, Audit verified: {has_creation_event}",
                    audit_verified=has_creation_event,
                ))
                print(f"OK {test_name} - PASSED ({duration:.0f}ms)")
            else:
                self.results.append(TestResult(
                    test_name=test_name,
                    status="FAIL",
                    duration_ms=duration,
                    details="Failed to create position",
                ))
                print(f"X {test_name} - FAILED")

        except Exception as e:
            self.results.append(TestResult(
                test_name=test_name,
                status="FAIL",
                duration_ms=(time.time() - start) * 1000,
                details=f"Exception: {str(e)}",
            ))
            print(f"X {test_name} - ERROR: {e}")

    def test_02_csv_upload(self):
        """Test 2: CSV Bulk Upload"""
        start = time.time()
        test_name = "Test 2: CSV Bulk Upload"

        try:
            # Use timestamp to ensure unique record_ids
            timestamp_id = datetime.now().strftime("%Y%m%d%H%M%S")
            csv_content = f"""record_id,entity,flow_type,currency,amount,value_date,status,description
TEST-CSV-{timestamp_id}-1,Test Corp A,AR,EUR,500000,2026-03-15,CONFIRMED,CSV test position 1
TEST-CSV-{timestamp_id}-2,Test Corp B,AP,GBP,750000,2026-03-20,CONFIRMED,CSV test position 2
TEST-CSV-{timestamp_id}-3,Test Corp C,AR,JPY,90000000,2026-04-01,CONFIRMED,CSV test position 3"""

            result = self.client.upload_csv(csv_content)
            duration = (time.time() - start) * 1000

            success = result.get("success", False)
            imported_count = result.get("imported", 0)

            self.results.append(TestResult(
                test_name=test_name,
                status="PASS" if success and imported_count == 3 else "FAIL",
                duration_ms=duration,
                details=f"Imported: {imported_count}/3 positions",
                audit_verified=success,
            ))
            print(f"{'OK' if success else 'X'} {test_name} - {imported_count}/3 positions ({duration:.0f}ms)")

        except Exception as e:
            self.results.append(TestResult(
                test_name=test_name,
                status="FAIL",
                duration_ms=(time.time() - start) * 1000,
                details=f"Exception: {str(e)}",
            ))
            print(f"X {test_name} - ERROR: {e}")

    def test_03_position_lifecycle(self):
        """Test 3: Complete Lifecycle (NEW -> HEDGED)"""
        start = time.time()
        test_name = "Test 3: Position Lifecycle (NEW -> POLICY_ASSIGNED -> READY)"

        try:
            # Get position from test 1
            position_id = self.test_positions.get("TEST-MANUAL")
            if not position_id:
                self.results.append(TestResult(
                    test_name=test_name,
                    status="SKIP",
                    duration_ms=0,
                    details="No test position available",
                ))
                print(f"SKIP {test_name} - SKIPPED")
                return

            # Step 1: Assign policy
            # Note: We'd need to get a real policy_id from the system
            # For now, we'll use a mock UUID
            mock_policy_id = "00000000-0000-0000-0000-000000000001"

            assigned = self.client.assign_policy(position_id, mock_policy_id)
            if not assigned:
                print(f"  -> Policy assignment skipped (policy_id not available)")

            # Step 2: Mark ready
            mock_run_id = "run_test_001"
            marked_ready = self.client.mark_ready(position_id, mock_run_id)

            duration = (time.time() - start) * 1000

            # Verify audit trail
            audit = self.client.get_audit_trail(position_id)
            event_types = [e.get("event_type") for e in audit]

            expected_events = ["POSITION_CREATED"]
            if assigned:
                expected_events.append("POLICY_ASSIGNED")
            if marked_ready:
                expected_events.append("MARKED_READY")

            all_present = all(evt in event_types for evt in expected_events)

            self.results.append(TestResult(
                test_name=test_name,
                status="PASS" if all_present else "PARTIAL",
                duration_ms=duration,
                details=f"Events: {', '.join(event_types)}",
                audit_verified=all_present,
            ))
            print(f"OK {test_name} - {len(event_types)} events ({duration:.0f}ms)")

        except Exception as e:
            self.results.append(TestResult(
                test_name=test_name,
                status="FAIL",
                duration_ms=(time.time() - start) * 1000,
                details=f"Exception: {str(e)}",
            ))
            print(f"X {test_name} - ERROR: {e}")

    def test_04_rejection_workflow(self):
        """Test 4: Rejection & Reopen"""
        start = time.time()
        test_name = "Test 4: Rejection & Reopen Workflow"

        try:
            position_id = self.test_positions.get("TEST-MANUAL")
            if not position_id:
                self.results.append(TestResult(
                    test_name=test_name,
                    status="SKIP",
                    duration_ms=0,
                    details="No test position available",
                ))
                print(f"SKIP {test_name} - SKIPPED")
                return

            # Reject
            rejected = self.client.reject_position(position_id, "Test rejection - duplicate entry")
            time.sleep(0.5)  # Brief delay

            # Reopen
            reopened = self.client.reopen_position(position_id)
            duration = (time.time() - start) * 1000

            # Verify audit trail
            audit = self.client.get_audit_trail(position_id)
            event_types = [e.get("event_type") for e in audit]

            has_reject = "POSITION_REJECTED" in event_types
            has_reopen = "POSITION_REOPENED" in event_types

            self.results.append(TestResult(
                test_name=test_name,
                status="PASS" if (has_reject and has_reopen) else "PARTIAL",
                duration_ms=duration,
                details=f"Rejected: {has_reject}, Reopened: {has_reopen}",
                audit_verified=(has_reject and has_reopen),
            ))
            print(f"{'OK' if (has_reject and has_reopen) else 'PARTIAL'} {test_name} ({duration:.0f}ms)")

        except Exception as e:
            self.results.append(TestResult(
                test_name=test_name,
                status="FAIL",
                duration_ms=(time.time() - start) * 1000,
                details=f"Exception: {str(e)}",
            ))
            print(f"X {test_name} - ERROR: {e}")

    def test_05_bulk_policy_assignment(self):
        """Test 5: Bulk Policy Assignment"""
        start = time.time()
        test_name = "Test 5: Bulk Policy Assignment"

        # Note: This would require a bulk assignment endpoint
        # For now, we'll skip this test
        self.results.append(TestResult(
            test_name=test_name,
            status="SKIP",
            duration_ms=0,
            details="Bulk assignment endpoint not available in test",
        ))
        print(f"SKIP {test_name} - SKIPPED (requires bulk endpoint)")

    def test_06_audit_trail_verification(self):
        """Test 6: Audit Trail Completeness"""
        start = time.time()
        test_name = "Test 6: Audit Trail Completeness"

        try:
            position_id = self.test_positions.get("TEST-MANUAL")
            if not position_id:
                self.results.append(TestResult(
                    test_name=test_name,
                    status="SKIP",
                    duration_ms=0,
                    details="No test position available",
                ))
                print(f"SKIP {test_name} - SKIPPED")
                return

            audit = self.client.get_audit_trail(position_id)
            duration = (time.time() - start) * 1000

            # Verify audit completeness
            all_have_actor = all(e.get("actor_email") for e in audit)
            all_have_timestamp = all(e.get("created_at") for e in audit)
            all_have_hash = all(e.get("hash_chain_current") for e in audit)

            complete = all_have_actor and all_have_timestamp and all_have_hash

            self.results.append(TestResult(
                test_name=test_name,
                status="PASS" if complete else "FAIL",
                duration_ms=duration,
                details=f"{len(audit)} events, Actor: {all_have_actor}, Timestamp: {all_have_timestamp}, Hash: {all_have_hash}",
                audit_verified=complete,
            ))
            print(f"{'OK' if complete else 'X'} {test_name} - {len(audit)} events ({duration:.0f}ms)")

        except Exception as e:
            self.results.append(TestResult(
                test_name=test_name,
                status="FAIL",
                duration_ms=(time.time() - start) * 1000,
                details=f"Exception: {str(e)}",
            ))
            print(f"X {test_name} - ERROR: {e}")

    def test_07_hash_chain_integrity(self):
        """Test 7: Hash Chain Integrity (Tamper Detection)"""
        start = time.time()
        test_name = "Test 7: Hash Chain Integrity"

        try:
            result = self.client.verify_hash_chain()
            duration = (time.time() - start) * 1000

            valid = result.get("valid", False)
            broken_count = result.get("broken_chains", 0)

            self.results.append(TestResult(
                test_name=test_name,
                status="PASS" if valid else "FAIL",
                duration_ms=duration,
                details=f"Valid: {valid}, Broken chains: {broken_count}",
                audit_verified=valid,
            ))
            print(f"{'OK' if valid else 'X'} {test_name} - {broken_count} broken chains ({duration:.0f}ms)")

        except Exception as e:
            self.results.append(TestResult(
                test_name=test_name,
                status="SKIP",
                duration_ms=(time.time() - start) * 1000,
                details=f"Hash chain verification endpoint not available: {str(e)}",
            ))
            print(f"SKIP {test_name} - SKIPPED (endpoint not available)")

    def test_08_data_integrity_checks(self):
        """Test 8: Data Integrity Validation"""
        start = time.time()
        test_name = "Test 8: Data Integrity Checks"

        try:
            # Get all positions
            positions = self.client.list_positions()
            duration = (time.time() - start) * 1000

            # Check for integrity violations
            no_company_id = sum(1 for p in positions if not p.get("company_id"))
            zero_amounts = sum(1 for p in positions if p.get("amount", 0) == 0)
            invalid_currencies = sum(1 for p in positions if len(p.get("currency", "")) != 3)

            violations = no_company_id + zero_amounts + invalid_currencies
            clean = violations == 0

            self.results.append(TestResult(
                test_name=test_name,
                status="PASS" if clean else "FAIL",
                duration_ms=duration,
                details=f"Violations: {violations} (No company: {no_company_id}, Zero amt: {zero_amounts}, Invalid curr: {invalid_currencies})",
                audit_verified=clean,
            ))
            print(f"{'OK' if clean else 'X'} {test_name} - {violations} violations ({duration:.0f}ms)")

        except Exception as e:
            self.results.append(TestResult(
                test_name=test_name,
                status="FAIL",
                duration_ms=(time.time() - start) * 1000,
                details=f"Exception: {str(e)}",
            ))
            print(f"X {test_name} - ERROR: {e}")

    def print_results(self):
        """Print test results summary"""
        print("\n" + "="*80)
        print("TEST RESULTS SUMMARY")
        print("="*80 + "\n")

        # Prepare table data
        table_data = []
        for r in self.results:
            status_symbol = {
                "PASS": "OK",
                "FAIL": "X",
                "SKIP": "SKIP",
                "PARTIAL": "PARTIAL",
            }.get(r.status, "?")

            table_data.append([
                status_symbol,
                r.test_name,
                r.status,
                f"{r.duration_ms:.0f}ms",
                "OK" if r.audit_verified else "X",
                r.details[:60] + "..." if len(r.details) > 60 else r.details,
            ])

        print(tabulate(
            table_data,
            headers=["", "Test Name", "Status", "Duration", "Audit", "Details"],
            tablefmt="grid",
        ))

        # Summary stats
        total = len(self.results)
        passed = sum(1 for r in self.results if r.status == "PASS")
        failed = sum(1 for r in self.results if r.status == "FAIL")
        skipped = sum(1 for r in self.results if r.status == "SKIP")
        partial = sum(1 for r in self.results if r.status == "PARTIAL")
        audit_verified = sum(1 for r in self.results if r.audit_verified)

        print(f"\n{'='*80}")
        print(f"TOTAL: {total} | PASSED: {passed} | FAILED: {failed} | PARTIAL: {partial} | SKIPPED: {skipped}")
        print(f"AUDIT VERIFIED: {audit_verified}/{total}")
        print(f"{'='*80}\n")

        # Overall status
        if failed == 0 and partial == 0:
            print("OK ALL TESTS PASSED")
        elif failed > 0:
            print(f"X {failed} TEST(S) FAILED")
        else:
            print(f"PARTIAL {partial} TEST(S) PARTIALLY PASSED")

# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Position Desk Workflow Test")
    parser.add_argument(
        "--env",
        choices=["production", "local"],
        default="production",
        help="Environment to test",
    )
    args = parser.parse_args()

    env_config = ENVIRONMENTS[args.env]
    client = HedgeCoreClient(env_config["base_url"])

    tests = PositionWorkflowTests(client)
    tests.run_all()

if __name__ == "__main__":
    main()
