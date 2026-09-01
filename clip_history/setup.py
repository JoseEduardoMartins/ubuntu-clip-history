import ast
import os
import shutil
import subprocess
from pathlib import Path

SERVICE_NAME = "clip-history-watch.service"
KEYBINDING_PATH = (
    "/org/gnome/settings-daemon/plugins/media-keys/"
    "custom-keybindings/clip-history/"
)
_MEDIA_KEYS = "org.gnome.settings-daemon.plugins.media-keys"


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def launcher_path() -> Path:
    return Path.home() / ".local" / "bin" / "clip-history"


def _gtk_available() -> bool:
    try:
        import gi

        gi.require_version("Gtk", "4.0")
        gi.require_version("Adw", "1")
        return True
    except Exception:
        return False


def check_deps() -> list:
    missing = []
    if shutil.which("wl-paste") is None or shutil.which("wl-copy") is None:
        missing.append("wl-clipboard (wl-paste/wl-copy)")
    if shutil.which("ydotool") is None:
        missing.append("ydotool (auto-paste; sem ele o app usa copy-only)")
    if not _gtk_available():
        missing.append("python3-gi + gir1.2-gtk-4.0 + gir1.2-adw-1 (GTK4/Adw)")
    return missing


def install_launcher() -> Path:
    """Escreve um launcher `clip-history` em ~/.local/bin apontando para este
    repositório (dispensa pip). Serviço e atalho usam o caminho absoluto dele."""
    root = _repo_root()
    dst = launcher_path()
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(
        "#!/bin/sh\n"
        f"exec python3 -c \"import sys; sys.path.insert(0, '{root}'); "
        "from clip_history.cli import main; sys.exit(main())\" \"$@\"\n"
    )
    dst.chmod(0o755)
    return dst


def install_service() -> None:
    src = _repo_root() / "systemd" / SERVICE_NAME
    dst = Path.home() / ".config" / "systemd" / "user" / SERVICE_NAME
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(src.read_text())
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=False)
    subprocess.run(
        ["systemctl", "--user", "enable", "--now", SERVICE_NAME], check=False
    )


def _current_keybindings() -> list:
    out = subprocess.run(
        ["gsettings", "get", _MEDIA_KEYS, "custom-keybindings"],
        capture_output=True, text=True,
    ).stdout.strip()
    if out.startswith("@as"):
        out = out[len("@as"):].strip()
    if not out or out == "[]":
        return []
    try:
        return list(ast.literal_eval(out))
    except (ValueError, SyntaxError):
        return []


def install_keybinding() -> None:
    bindings = _current_keybindings()
    if KEYBINDING_PATH not in bindings:
        bindings.append(KEYBINDING_PATH)
    subprocess.run(
        ["gsettings", "set", _MEDIA_KEYS, "custom-keybindings", str(bindings)],
        check=False,
    )
    child = f"{_MEDIA_KEYS}.custom-keybinding:{KEYBINDING_PATH}"
    subprocess.run(["gsettings", "set", child, "name", "clip-history"], check=False)
    # caminho absoluto do launcher — não depende do PATH da sessão do GNOME
    command = f"{launcher_path()} show"
    subprocess.run(["gsettings", "set", child, "command", command], check=False)
    subprocess.run(["gsettings", "set", child, "binding", "<Super>v"], check=False)


def run() -> int:
    missing = check_deps()
    launcher = install_launcher()
    install_service()
    install_keybinding()

    print("clip-history configurado:")
    print(f"  • launcher: {launcher}")
    print(f"  • serviço: {SERVICE_NAME} "
          f"(status: systemctl --user status {SERVICE_NAME})")
    print("  • atalho: Super+V → clip-history show")

    bindir = str(launcher.parent)
    if bindir not in os.environ.get("PATH", "").split(":"):
        print(f"\nDica: adicione {bindir} ao PATH para rodar 'clip-history' "
              "no terminal.")
        print("  (o serviço e o atalho Super+V já usam o caminho absoluto)")

    if missing:
        print("\nDependências faltando:")
        for item in missing:
            print(f"  • {item}")
        print("\nInstale com:")
        print("  sudo apt install wl-clipboard python3-gi "
              "gir1.2-gtk-4.0 gir1.2-adw-1 ydotool")
        print("\nPara o auto-paste (ydotool):")
        print("  1. habilite o daemon: sudo systemctl enable --now ydotool "
              "(ou rode 'ydotoold')")
        print("  2. garanta acesso a /dev/uinput "
              "(adicione seu usuário ao grupo 'input' ou crie uma regra udev)")
    return 0
