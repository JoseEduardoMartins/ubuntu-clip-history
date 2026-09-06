#!/usr/bin/env bash
# Empacota extension/ no zip que o gnome-extensions espera (conteúdo na raiz do
# zip, schema compilado, sem os testes nem arquivos ocultos). Mesmo formato do
# antigo release.yml; agora chamado pelo semantic-release (prepareCmd).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

UUID="$(node scripts/uuid.mjs)"
ZIP="$UUID.zip"

rm -f "$ZIP"
# O zip precisa do gschemas.compiled (o repo só versiona o .xml).
glib-compile-schemas extension/schemas

# Compila as traduções (po/*.po -> extension/locale/<lang>/LC_MESSAGES/<uuid>.mo).
# No release isto é obrigatório: um pacote sem .mo deixaria a UI só em inglês.
if ! command -v msgfmt >/dev/null 2>&1; then
    echo "ERRO: msgfmt não encontrado (instale o pacote gettext)." >&2
    exit 1
fi
for po in po/*.po; do
    [ -e "$po" ] || continue
    lang="$(basename "$po" .po)"
    mo_dir="extension/locale/$lang/LC_MESSAGES"
    mkdir -p "$mo_dir"
    msgfmt "$po" -o "$mo_dir/$UUID.mo"
done

( cd extension && zip -r -q "../$ZIP" . -x '*/.*' -x 'test/*' )

echo "Empacotado: $ZIP"
unzip -l "$ZIP"
