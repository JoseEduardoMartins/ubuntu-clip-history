import shutil
import subprocess
import time

# Sintaxe do ydotool 0.1.x (empacotado no Ubuntu): nomes com "+".
# (A série 0.2+/1.x usa keycodes "29:1 47:1 47:0 29:0" — incompatível.)
_KEY_CTRL_V = ["ydotool", "key", "ctrl+v"]


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
    try:
        copy(content)
    except (subprocess.CalledProcessError, OSError, FileNotFoundError):
        _notify("Não foi possível copiar (wl-clipboard instalado?)")
        return
    if not _ydotool_available():
        _notify("Copiado — aperte Ctrl+V para colar")
        return
    time.sleep(delay)  # deixa o foco voltar ao app anterior
    try:
        subprocess.run(_KEY_CTRL_V, check=True)
    except (subprocess.CalledProcessError, OSError):
        _notify("Copiado — aperte Ctrl+V para colar")
