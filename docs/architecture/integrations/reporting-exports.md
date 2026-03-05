# Reporting and exports

## Actors
- UI client
- Reporting services
- External storage or user download

## Steps
1. Client requests export for a calculation or report.
2. API assembles report data and audit context.
3. Export builders generate PDF, Excel, or ZIP bundles.
4. Client downloads or schedules report delivery.

## Key endpoints
- `/v1/export/*`
- `/v1/reports/*`

## Notes
- Export logic lives under `backend/app/exports_v1`.
