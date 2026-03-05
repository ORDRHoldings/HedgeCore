"""Export endpoints: PDF, Excel, ZIP."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.exports.excel_builder import render_bank_pack_xlsx
from app.exports.pdf_builder import render_bank_pack_pdf
from app.exports.zip_builder import build_audit_zip
from app.routers.calculate import get_run

router = APIRouter(tags=["export"])


@router.get("/export/pdf/{run_id}")
def export_pdf(run_id: str):
    result = get_run(run_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found.")
    pdf_bytes = render_bank_pack_pdf(result)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="BankPack_{run_id[:8]}.pdf"'},
    )


@router.get("/export/excel/{run_id}")
def export_excel(run_id: str):
    result = get_run(run_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found.")
    xlsx_bytes = render_bank_pack_xlsx(result)
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="BankPack_{run_id[:8]}.xlsx"'},
    )


@router.get("/export/zip/{run_id}")
def export_zip(run_id: str):
    result = get_run(run_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found.")
    zip_bytes = build_audit_zip(result)
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="AuditPack_{run_id[:8]}.zip"'},
    )
