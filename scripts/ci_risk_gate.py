#!/usr/bin/env python3
"""CI Risk Gate: fails the build if critical risks exist in memory.db.

Usage: python scripts/ci_risk_gate.py
Exit 0 = pass, Exit 1 = critical risks found.

For CI: runs only if memory.db exists (skips gracefully in clean CI environments).
"""
import sqlite3
import os
import sys

DB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".claude", "state", "memory.db")


def main():
    if not os.path.exists(DB):
        print("RISK GATE: memory.db not found — skipping (clean CI environment)")
        sys.exit(0)

    conn = sqlite3.connect(DB)

    critical = conn.execute(
        "SELECT risk, mitigation FROM open_risks WHERE severity='critical' AND status='open'"
    ).fetchall()

    high = conn.execute(
        "SELECT risk FROM open_risks WHERE severity='high' AND status='open'"
    ).fetchall()

    medium_count = conn.execute(
        "SELECT COUNT(*) FROM open_risks WHERE severity='medium' AND status='open'"
    ).fetchone()[0]

    conn.close()

    total = len(critical) + len(high) + medium_count

    print("=" * 60)
    print("RISK GATE REPORT")
    print("=" * 60)

    if critical:
        print(f"\nCRITICAL RISKS ({len(critical)}):")
        for risk, mitigation in critical:
            print(f"  [CRITICAL] {risk}")
            if mitigation:
                print(f"             Mitigation: {mitigation}")

    if high:
        print(f"\nHIGH RISKS ({len(high)}):")
        for (risk,) in high:
            print(f"  [HIGH] {risk}")

    print(f"\nTotal open risks: {total} ({len(critical)} critical, {len(high)} high, {medium_count} medium)")
    print("=" * 60)

    if critical:
        print("\nFAIL: Critical risks must be resolved before merge.")
        sys.exit(1)
    else:
        print("\nPASS: No critical risks.")
        sys.exit(0)


if __name__ == "__main__":
    main()
