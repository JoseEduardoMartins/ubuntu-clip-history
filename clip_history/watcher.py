import subprocess
import sys
import time

from clip_history import storage


def record(stream=None) -> None:
    """Lê texto do stdin e grava no histórico (útil para pipes manuais)."""
    if stream is None:
        stream = sys.stdin
    content = stream.read()
    storage.add(content)


def read_clipboard() -> "str | None":
    """Lê o clipboard atual via wl-paste one-shot. Retorna None se não houver
    texto (ex.: imagem, clipboard vazio) ou se o wl-paste falhar."""
    try:
        result = subprocess.run(
            ["wl-paste", "-n", "-t", "text"], capture_output=True
        )
    except OSError:
        return None
    if result.returncode != 0:
        return None
    return result.stdout.decode("utf-8", errors="replace")


def watch(poll_interval: float = 1.0, iterations=None) -> None:
    """Monitora o clipboard por polling (GNOME/Mutter não suporta o protocolo
    wlr-data-control exigido por `wl-paste --watch`, mas o wl-paste one-shot
    funciona). A cada mudança de conteúdo, grava no histórico.

    `iterations` limita o número de ciclos (usado em testes); None = infinito.
    """
    last = None
    count = 0
    while iterations is None or count < iterations:
        text = read_clipboard()
        if text is not None and text != last:
            last = text
            storage.add(text)
        count += 1
        if iterations is not None and count >= iterations:
            break
        time.sleep(poll_interval)
