import os
from pathlib import Path

LIMIT = 100
MAX_SIZE = 100 * 1024  # bytes


def data_dir() -> Path:
    base = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
    return Path(base) / "clip-history"


def db_path() -> Path:
    override = os.environ.get("CLIP_HISTORY_DB")
    if override:
        return Path(override)
    return data_dir() / "history.db"
