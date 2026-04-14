# ADR-0009: Outbound GL Journal Entry Posting

**Status:** accepted  
**Date:** 2026-04-13  
**Deciders:** ORDR Edge

## Context

engine_v1/hedge_accounting.py generates IFRS 9 / ASC 815 journal entries
internally but there is no mechanism to expose them as postable records or
push them to connected accounting systems. This creates an operational gap:
treasurers must manually re-enter journal data into their ERP.

## Decision

Introduce a WORM `journal_entries` table. Entries are generated from hedge
effectiveness runs, settlement confirmations, and fair value changes.
The table deviates from strict append-only WORM in one way: the `status`
column may transition (DRAFT → PENDING_APPROVAL → APPROVED → POSTED | REJECTED).
Every status transition is also recorded as an `audit_event` to preserve an
immutable log of all state changes. No other column may ever be updated.

The table uses a per-tenant SHA-256 hash chain (chain_seq + entry_hash +
prev_entry_hash) to detect tampering. chain_seq is computed via
`SELECT MAX(chain_seq)+1 FOR UPDATE` to prevent concurrent chain forks.

ERP posting is handled by pluggable adapters (QuickBooks, Xero, NetSuite, CSV).
GL account mappings are configured per-tenant in `gl_account_mappings` before
any entry can be generated. Missing mappings raise GLMappingNotConfiguredError.

4-eyes SoD (checker ≠ creator) is enforced on both approve and reject routes.

## Consequences

- Enables automated GL posting, eliminating manual ERP re-entry
- WORM status deviation is documented here and guarded by PostgreSQL trigger
  that blocks updates to all non-status columns
- Requires tenants to configure chart-of-accounts before first use (Sprint 56 Step 0)
- ERP credentials stored in connector_settings JSONB on connectors table

## References

- Spec: docs/superpowers/specs/2026-04-13-treasury-suite-design.md §3.1
- Parent WORM pattern: app/models/ledger.py
