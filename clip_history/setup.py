import ast
import os
import shutil
import subprocess
from pathlib import Path

SERVICE_NAME = "clip-history-watch.service"
YDOTOOLD_SERVICE = "ydotoold.service"
_MEDIA_KEYS = "org.gnome.settings-daemon.plugins.media-keys"
_SHELL_KEYS = "org.gnome.shell.keybindings"
# O gsd-media-keys só registra caminhos no padrão customN (custom0, custom1…);
# nomes fora desse padrão são ignorados.
_CUSTOM_BASE = (
    "/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/"
)
_CUSTOM_NAME = "clip-history"


def _next_custom_path(existing) -> str:
    i = 0
    while f"{_CUSTOM_BASE}custom{i}/" in existing:
        i += 1
    return f"{_CUSTOM_BASE}custom{i}/"


def _keybinding_path(existing) -> str:
    """Reusa um slot já nosso (name == clip-history) para ser idempotente;
    senão aloca o próximo customN livre."""
    for path in existing:
        child = f"{_MEDIA_KEYS}.custom-keybinding:{path}"
        name = subprocess.run(
            ["gsettings", "get", child, "name"],
            capture_output=True, text=True,
        ).stdout.strip().strip("'")
        if name == _CUSTOM_NAME:
            return path
    return _next_custom_path(existing)


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


def _install_user_service(name: str) -> None:
    src = _repo_root() / "systemd" / name
    dst = Path.home() / ".config" / "systemd" / "user" / name
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(src.read_text())
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=False)
    subprocess.run(
        ["systemctl", "--user", "enable", "--now", name], check=False
    )


def install_service() -> None:
    _install_user_service(SERVICE_NAME)


def install_ydotoold_service() -> bool:
    """Instala/habilita o serviço de usuário do ydotoold (daemon do auto-paste),
    se o binário existir. Retorna True se instalou."""
    if shutil.which("ydotoold") is None:
        return False
    _install_user_service(YDOTOOLD_SERVICE)
    return True


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


def free_super_v() -> None:
    """Libera o Super+V: por padrão o GNOME o vincula a `toggle-message-tray`
    (abre a central de notificações), e esse atalho embutido ganha do nosso
    custom. Remove só o `<Super>v`, mantendo os demais (ex.: `<Super>m`)."""
    out = subprocess.run(
        ["gsettings", "get", _SHELL_KEYS, "toggle-message-tray"],
        capture_output=True, text=True,
    ).stdout.strip()
    try:
        bindings = list(ast.literal_eval(out)) if out else []
    except (ValueError, SyntaxError):
        return
    keep = [b for b in bindings if b.lower() != "<super>v"]
    if keep != bindings:
        subprocess.run(
            ["gsettings", "set", _SHELL_KEYS, "toggle-message-tray", str(keep)],
            check=False,
        )


def install_keybinding() -> str:
    bindings = _current_keybindings()
    path = _keybinding_path(bindings)
    if path not in bindings:
        bindings.append(path)
    subprocess.run(
        ["gsettings", "set", _MEDIA_KEYS, "custom-keybindings", str(bindings)],
        check=False,
    )
    child = f"{_MEDIA_KEYS}.custom-keybinding:{path}"
    subprocess.run(
        ["gsettings", "set", child, "name", _CUSTOM_NAME], check=False
    )
    # caminho absoluto do launcher — não depende do PATH da sessão do GNOME
    command = f"{launcher_path()} show"
    subprocess.run(["gsettings", "set", child, "command", command], check=False)
    subprocess.run(["gsettings", "set", child, "binding", "<Super>v"], check=False)
    return path


def run() -> int:
    missing = check_deps()
    launcher = install_launcher()
    install_service()
    free_super_v()
    install_keybinding()
    ydotoold_ok = install_ydotoold_service()

    print("clip-history configurado:")
    print(f"  • launcher: {launcher}")
    print(f"  • serviço: {SERVICE_NAME} "
          f"(status: systemctl --user status {SERVICE_NAME})")
    print("  • atalho: Super+V → clip-history show "
          "(liberado do toggle-message-tray; Super+M ainda abre as notificações)")
    if ydotoold_ok:
        print(f"  • auto-paste: {YDOTOOLD_SERVICE} habilitado")
    print("\n>>> Faça LOGOUT e login de novo para o GNOME registrar o Super+V "
          "<<<\n    (o gsd-media-keys só captura atalhos custom no início da "
          "sessão)")

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

    print("\nAuto-paste (opcional — sem ele o app usa copy-only + Ctrl+V):")
    if not shutil.which("ydotoold"):
        print("  • instale o daemon: sudo apt install ydotoold")
    print("  • libere o /dev/uinput e entre no grupo 'input' (uma vez, com sudo):")
    print("      echo 'KERNEL==\"uinput\", GROUP=\"input\", MODE=\"0660\", "
          "OPTIONS+=\"static_node=uinput\"' | \\")
    print("        sudo tee /etc/udev/rules.d/99-uinput.rules")
    print("      sudo udevadm control --reload-rules && sudo udevadm trigger")
    print("      sudo usermod -aG input \"$USER\"   # e faça logout/login")
    print("  Depois de relogar, rode 'clip-history setup' de novo (ou "
          "'systemctl --user restart ydotoold').")
    return 0
