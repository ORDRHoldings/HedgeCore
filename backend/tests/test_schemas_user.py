"""
tests/test_schemas_user.py
Verifies HedgeCalc User ORM ↔ Pydantic schema consistency and UUID validation.
"""

import uuid
from datetime import datetime
import pytest
from app.models.user import User
from app.schemas.user import UserPublic


def test_user_model_and_schema_consistency():
    """Ensure ORM fields map cleanly to Pydantic schema."""
    sample_uuid = uuid.uuid4()
    orm_user = User(
        id=sample_uuid,
        email="test@example.com",
        hashed_password="fakehashed",
        is_active=True,
        is_superuser=False,
        created_at=datetime.utcnow(),
    )

    schema_user = UserPublic.model_validate(orm_user)
    assert schema_user.id == orm_user.id
    assert schema_user.email == orm_user.email
    assert schema_user.is_active is True
    assert schema_user.is_superuser is False
    assert isinstance(schema_user.created_at, datetime)
    assert schema_user.id == sample_uuid


def test_user_schema_serialization():
    """Check that Pydantic serialization returns correct types."""
    user_dict = {
        "id": str(uuid.uuid4()),
        "email": "user@example.com",
        "is_active": True,
        "is_superuser": False,
        "created_at": datetime.utcnow(),
    }

    schema = UserPublic(**user_dict)
    assert isinstance(schema.id, uuid.UUID)

    # Standard dump (keeps UUID as object)
    serialized_default = schema.model_dump()
    assert isinstance(serialized_default["id"], uuid.UUID)

    # JSON dump should stringify UUIDs for transport
    serialized_json = schema.model_dump(mode="json")
    assert isinstance(serialized_json["id"], str)
    assert serialized_json["email"] == "user@example.com"
    assert serialized_json["is_active"] is True
    assert serialized_json["is_superuser"] is False
