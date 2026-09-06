#!/usr/bin/env bash
# Instala a extensão clip-history (GNOME Shell).
set -euo pipefail

UUID="clip-history@joseeduardomartins.com"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$ROOT/extension"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

# Versões do GNOME Shell suportadas. Fonte da verdade: extension/metadata.json
# ("shell-version") — mantenha em sincronia ao alterar lá.
SUPPORTED="46 47 48"

echo "==> Verificando ambiente"

# --- Dependências obrigatórias (build/enable). Faltando => oferece apt / aborta.
missing_cmds=()
missing_pkgs=()
require() {  # require <cmd> <pkg-apt>
    command -v "$1" >/dev/null 2>&1 || { missing_cmds+=("$1"); missing_pkgs+=("$2"); }
}
require glib-compile-schemas libglib2.0-bin
require gsettings            libglib2.0-bin
require gnome-extensions     gnome-shell
require gnome-shell          gnome-shell

if [ "${#missing_cmds[@]}" -gt 0 ]; then
    echo "    !! Dependências obrigatórias faltando: ${missing_cmds[*]}"
    # Deduplica os pacotes (libglib2.0-bin aparece mais de uma vez).
    pkgs="$(printf '%s\n' "${missing_pkgs[@]}" | sort -u | tr '\n' ' ')"
    pkgs="${pkgs% }"
    apt_cmd="sudo apt install -y $pkgs"
    if [ -t 0 ]; then
        printf "    Instalar agora via apt (%s)? [s/N] " "$pkgs"
        read -r reply
        case "$reply" in
            s|S|y|Y)
                eval "$apt_cmd"
                # Re-checa: se ainda faltar algo, aborta.
                still=()
                for c in "${missing_cmds[@]}"; do
                    command -v "$c" >/dev/null 2>&1 || still+=("$c")
                done
                if [ "${#still[@]}" -gt 0 ]; then
                    echo "    !! Ainda faltando após o apt: ${still[*]}. Abortando." >&2
                    exit 1
                fi
                ;;
            *)
                echo "    Instale e rode de novo:  $apt_cmd" >&2
                exit 1
                ;;
        esac
    else
        echo "    Sessão não-interativa. Instale e rode de novo:  $apt_cmd" >&2
        exit 1
    fi
fi

# --- Avisos de runtime/ambiente (não bloqueiam a instalação).
if [ "${XDG_SESSION_TYPE:-}" != "wayland" ]; then
    echo "    !! Sessão atual: ${XDG_SESSION_TYPE:-desconhecida} (a extensão é feita para Wayland)."
fi

shell_ver="$(gnome-shell --version 2>/dev/null | grep -oE '[0-9]+' | head -1 || true)"
if [ -n "$shell_ver" ] && ! echo " $SUPPORTED " | grep -q " $shell_ver "; then
    echo "    !! GNOME Shell $shell_ver fora da faixa suportada ($SUPPORTED)."
fi

echo "==> Compilando traduções (po/*.po -> locale/…/$UUID.mo)"
if command -v msgfmt >/dev/null 2>&1; then
    for po in "$ROOT"/po/*.po; do
        [ -e "$po" ] || continue
        lang="$(basename "$po" .po)"
        mo_dir="$SRC/locale/$lang/LC_MESSAGES"
        mkdir -p "$mo_dir"
        msgfmt "$po" -o "$mo_dir/$UUID.mo"
    done
else
    echo "    !! msgfmt não encontrado (sudo apt install gettext); a UI ficará em inglês."
fi

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
    if ! gnome-extensions list --enabled 2>/dev/null | grep -q GPaste; then
        echo "    !! Extensão do GPaste não habilitada. Habilite: gnome-extensions enable GPaste@gnome-shell-extensions.gnome.org"
    fi
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
