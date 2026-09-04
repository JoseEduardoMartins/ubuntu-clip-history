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
( cd extension && zip -r -q "../$ZIP" . -x '*/.*' -x 'test/*' )

echo "Empacotado: $ZIP"
unzip -l "$ZIP"
