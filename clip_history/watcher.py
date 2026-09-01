import os
import sys

from clip_history import storage


def record(stream=None) -> None:
    """Lê o texto do clipboard (stdin) e grava no histórico."""
    if stream is None:
        stream = sys.stdin
    content = stream.read()
    storage.add(content)


def watch() -> None:
    """Substitui o processo por `wl-paste --watch`, que chama `record`
    a cada mudança do clipboard."""
    os.execvp(
        "wl-paste",
        ["wl-paste", "--type", "text", "--watch", "clip-history", "record"],
    )
