from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, EmailStr

class UserPublic(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str | None = None
    is_active: bool
    is_superuser: bool
    created_at: datetime

    class Config:
        from_attributes = True
