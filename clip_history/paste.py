import shutil
import subprocess

# Sintaxe do ydotool 0.1.x (empacotado no Ubuntu): nomes com "+".
# (A série 0.2+/1.x usa keycodes "29:1 47:1 47:0 29:0" — incompatível.)


def copy(content: str) -> None:
    subprocess.run(["wl-copy"], input=content.encode("utf-8"), check=True)


def _ydotool_available() -> bool:
    return shutil.which("ydotool") is not None


def _notify(message: str) -> None:
    if shutil.which("notify-send"):
        subprocess.run(["notify-send", "clip-history", message], check=False)


def paste(content: str, delay: float = 0.25) -> None:
    """Copia `content` e cola no app anterior via Ctrl+V (ydotool).

    O Ctrl+V roda num processo DESTACADO que espera `delay`s antes de injetar.
    Isso é essencial: o picker precisa fechar e o foco voltar ao app anterior
    ANTES da injeção. Se usássemos time.sleep aqui, bloquearíamos o loop do
    GTK, o picker nem fecharia e o foco nunca voltaria — o Ctrl+V iria pro
    limbo. Como é destacado (start_new_session), sobrevive ao picker sair.

    Sem ydotool, cai em copy-only + notificação. Se o ydotool falhar em runtime,
    o próprio processo destacado notifica (via `|| notify-send`).
    """
    try:
        copy(content)
    except (subprocess.CalledProcessError, OSError, FileNotFoundError):
        _notify("Não foi possível copiar (wl-clipboard instalado?)")
        return
    if not _ydotool_available():
        _notify("Copiado — aperte Ctrl+V para colar")
        return
    subprocess.Popen(
        [
            "sh", "-c",
            f"sleep {delay}; ydotool key ctrl+v || "
            "notify-send clip-history 'Copiado — aperte Ctrl+V para colar'",
        ],
        start_new_session=True,
    )
