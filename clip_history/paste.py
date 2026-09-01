import shutil
import subprocess
import time

# keycodes do Linux input (evdev): Ctrl esquerdo = 29, V = 47
_CTRL = "29"
_V = "47"


def copy(content: str) -> None:
    subprocess.run(["wl-copy"], input=content.encode("utf-8"), check=True)


def _ydotool_available() -> bool:
    return shutil.which("ydotool") is not None


def _notify(message: str) -> None:
    if shutil.which("notify-send"):
        subprocess.run(["notify-send", "clip-history", message], check=False)


def paste(content: str, delay: float = 0.12) -> None:
    """Coloca `content` no clipboard e cola no app focado.

    Cai em copy-only (com notificação) se o ydotool não existir ou falhar.
    """
    copy(content)
    if not _ydotool_available():
        _notify("Copiado — aperte Ctrl+V para colar")
        return
    time.sleep(delay)  # deixa o foco voltar ao app anterior
    try:
        subprocess.run(
            ["ydotool", "key", f"{_CTRL}:1", f"{_V}:1", f"{_V}:0", f"{_CTRL}:0"],
            check=True,
        )
    except (subprocess.CalledProcessError, OSError):
        _notify("Copiado — aperte Ctrl+V para colar")
