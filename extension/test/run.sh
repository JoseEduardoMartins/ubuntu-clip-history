#!/usr/bin/env bash
# Roda os testes de lógica pura da extensão (os que não precisam de sessão
# GNOME nem do daemon GPaste). Usado pelo CI e localmente.
#
# Fora daqui, de propósito: smokeGpasteRead.js — precisa do daemon vivo e do
# session bus, então só roda numa sessão real (não no CI).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TESTS=(
    testPins.js
    testPosition.js
    testText.js
    testPickerLogic.js
)

fail=0
for t in "${TESTS[@]}"; do
    echo "==> $t"
    if gjs -m "$DIR/$t"; then
        echo
    else
        echo "!! $t falhou"
        fail=1
    fi
done

if [ "$fail" -ne 0 ]; then
    echo "ALGUM TESTE FALHOU"
    exit 1
fi
echo "TODOS OS TESTES DE LÓGICA PASSARAM"
