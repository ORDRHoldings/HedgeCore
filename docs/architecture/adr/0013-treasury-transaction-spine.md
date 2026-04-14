# ADR-0013: Treasury Data Platform — Unified Transaction Spine

**Status:** accepted  
**Date:** 2026-04-13  
**Deciders:** ORDR Edge

## Context

As Phase 1 (GL posting), Phase 2 (cash management), and future modules add
financial event tables, audit trail fragmentation becomes a risk. Each module
has its own records but no single queryable view of all financial events across
the platform.

## Decision

Introduce a strict WORM `treasury_transactions` table as the unified audit
spine. Every financial event (FX hedge execution, settlement, journal entry
posting, bank receipt, payment, intercompany sweep) appends one record.
The table is strictly append-only — no column ever mutated after insert.

Hash chain: tx_hash = SHA-256(company_id|tx_type|amount|currency|value_date|
source_ref_id|created_at|chain_seq). chain_seq computed via SELECT MAX+1 FOR
UPDATE. Independent chain from audit_events; the two chains are cross-referenced
via source_ref_id → originating audit_event id.

## Consequences

- Single queryable table for cross-module treasury analytics
- Each posting adapter and service layer is responsible for appending a
  TreasuryTransaction record after its primary operation succeeds
- Does not replace module-specific tables (JournalEntry, SettlementEvent) —
  those remain the authoritative records; TreasuryTransaction is the audit spine

## References

- Spec: docs/superpowers/specs/2026-04-13-treasury-suite-design.md §6.1
