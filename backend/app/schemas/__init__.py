"""
app.schemas package initializer
Ensures all schema modules are discoverable at import time.
"""

# Explicit imports to guarantee module registration
from app.schemas.api_key import *  # noqa
from app.schemas.api_key_audit import *  # noqa
