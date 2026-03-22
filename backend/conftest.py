"""Root conftest — ensures backend/app is resolved before any editable installs."""
import sys
import pathlib

_backend = str(pathlib.Path(__file__).parent.resolve())
if _backend not in sys.path:
    sys.path.insert(0, _backend)
# Remove any other project's 'app' package from the path so it cannot shadow ours.
sys.path = [p for p in sys.path if "StopMug" not in p]
