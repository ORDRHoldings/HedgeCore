# Open Risks

| ID | Risk | Severity | Identified | Status | Mitigation |
|----|------|----------|------------|--------|------------|
| R-001 | Secrets in git history (dev JWT, local DB password) | HIGH | 2026-03-06 | REDUCED | Current tracked files sanitized. History contains dev credentials that become dead after R-004 rotation. After rotation: RESOLVED (dead creds = no practical risk). Git history scrub optional maintenance, not security requirement. |
| R-002 | No institutional market data feed | HIGH | 2026-03-06 | OPEN | Finnhub proxy works but not trade-grade. Bloomberg/Refinitiv adapter needed. |
| R-003 | Test coverage at 59% | MEDIUM | 2026-03-06 | OPEN | 2158 tests passing. Service layer and route handler tests needed for 75%+ |
| R-004 | Secret rotation not done | HIGH | 2026-03-06 | OPEN | Requires external human action. Operator-grade checklist at `docs/ops/secret-rotation-checklist.md` with verification commands and completion protocol. Items: OpenAI key (REQUIRED), JWT_SECRET (REQUIRED — may already differ in production), local DB password (LOW priority). After completion, both R-001 and R-004 become RESOLVED. |
| R-005 | No WebSocket real-time updates | MEDIUM | 2026-03-06 | ACCEPTED | Dashboard requires manual refresh. /ws/dashboard planned for future. |
| R-006 | No regulatory reporting exports | HIGH | 2026-03-06 | OPEN | EMIR, MiFID, Dodd-Frank format exports not implemented. |
