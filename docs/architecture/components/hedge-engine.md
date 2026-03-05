# Hedge engine

## Purpose
Compute deterministic hedge recommendations, risk classification, and
cost estimates for FX policies and positions.

## Responsibilities
- Strategy selection and instrument mapping
- Exposure analysis and risk classification
- Scenario evaluation and worst-case selection
- Output bundles for audit and reporting

## Key files
- `backend/app/engine`
- `backend/app/engine_v1`
- `backend/app/contracts`

## Interfaces
- Called by API routes under `/hedge` and `/v1/calculate*`
- Emits structured bundles for audit and export

## Failure modes
- Input schema drift causes invalid calculations
- Non-deterministic logic breaks audit reproducibility
