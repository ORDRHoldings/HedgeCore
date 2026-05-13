"""Root conftest — ensures backend/app is resolved before any editable installs."""
import pathlib
import sys

_backend_path = pathlib.Path(__file__).parent.resolve()
_repo_root = str(_backend_path.parent)
_backend = str(_backend_path)

for path in [_backend, _repo_root]:
    if path in sys.path:
        sys.path.remove(path)
for path in [_backend, _repo_root]:
    sys.path.insert(0, path)

# Remove any other project's 'app' package from the path so it cannot shadow ours.
sys.path = [p for p in sys.path if "StopMug" not in p]
