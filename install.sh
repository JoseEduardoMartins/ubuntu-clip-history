#!/usr/bin/env bash
# Instala a extensão clip-history (GNOME Shell).
set -euo pipefail

UUID="clip-history@joseeduardomartins.com"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/extension" && pwd)"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

echo "==> Instalando extensão em $DEST"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -r "$SRC/." "$DEST/"
# Os testes não fazem parte da extensão instalada (só do repo/CI).
rm -rf "$DEST/test"

echo "==> Compilando schema"
glib-compile-schemas "$DEST/schemas"

echo "==> Verificando GPaste"
if ! command -v gpaste-client >/dev/null 2>&1; then
    echo "    !! GPaste não encontrado. Instale: sudo apt install gpaste-2 gnome-shell-extension-gpaste"
else
    systemctl --user enable --now org.gnome.GPaste.service 2>/dev/null || true
    gpaste-client 2>/dev/null | head -1 >/dev/null || true
fi

echo "==> Liberando Super+V do toggle-message-tray (idempotente)"
CUR="$(gsettings get org.gnome.shell.keybindings toggle-message-tray)"
if echo "$CUR" | grep -q "<Super>v"; then
    NEW="$(echo "$CUR" | sed "s/'<Super>v', //; s/, '<Super>v'//; s/'<Super>v'//")"
    gsettings set org.gnome.shell.keybindings toggle-message-tray "$NEW"
fi

echo "==> Habilitando a extensão"
gnome-extensions enable "$UUID" 2>/dev/null || \
    echo "    (habilite após o logout: gnome-extensions enable $UUID)"

echo
echo "Pronto. FAÇA LOGOUT/LOGIN (Wayland só carrega a extensão nova e o Super+V no início da sessão)."
echo "Depois: aperte Super+V. Se não abrir, veja logs com:  journalctl --user -b 0 -o cat /usr/bin/gnome-shell | grep -i clip"
