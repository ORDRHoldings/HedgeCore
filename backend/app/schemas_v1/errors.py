from enum import Enum

from pydantic import BaseModel


class Severity(str, Enum):
    CRITICAL = "CRITICAL"
    WARNING = "WARNING"


class ValidationErrorDetail(BaseModel):
    code: str
    field: str
    message: str
    severity: Severity
