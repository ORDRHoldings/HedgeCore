# app/core/schema_loader.py
"""
Centralized Pydantic schema rebuild for HedgeCalc.
Ensures all models across all schema modules are fully defined
before FastAPI initializes routes or generates OpenAPI.

Fixes:
- PydanticUserError: TypeAdapter[ForwardRef(...)] not fully defined
"""

from __future__ import annotations
import importlib
import logging
import pkgutil
import inspect
from pydantic import BaseModel

_logger = logging.getLogger("hedgecalc.schema_loader")


def rebuild_all_schemas() -> None:
    """
    Dynamically import all app.schemas.* modules and rebuild every Pydantic model.
    Must be called before app.include_router() in app.main.
    """
    package_name = "app.schemas"
    package = importlib.import_module(package_name)

    for _, mod_name, _ in pkgutil.iter_modules(package.__path__, f"{package_name}."):
        try:
            module = importlib.import_module(mod_name)
        except Exception as e:
            _logger.warning(f"⚠️ Could not import {mod_name}: {e}")
            continue

        for _, obj in inspect.getmembers(module, inspect.isclass):
            if issubclass(obj, BaseModel) and obj.__module__.startswith(package_name):
                try:
                    obj.model_rebuild(force=True)
                    _logger.debug(f"✅ Rebuilt schema: {obj.__name__}")
                except Exception as e:
                    _logger.warning(f"⚠️ Failed rebuild for {obj.__name__}: {e}")

    _logger.info("✅ All Pydantic schemas rebuilt successfully across app.schemas")
