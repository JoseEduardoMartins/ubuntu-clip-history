#!/usr/bin/env bash
# Roda os testes de lógica pura da extensão (os que não precisam de sessão
# GNOME nem do daemon GPaste). Usado pelo CI e localmente.
#
# gpaste.js entra aqui porque aceita uma camada D-Bus injetada nos testes
# (testGpaste.js) — não toca no daemon real.
#
# Fora daqui, de propósito: smokeGpasteRead.js — precisa do daemon vivo e do
# session bus, então só roda numa sessão real (ver README).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TESTS=(
    testPins.js
    testPosition.js
    testText.js
    testPickerLogic.js
    testGpaste.js
)

pass=0
fail=0
failed=()
for t in "${TESTS[@]}"; do
    echo "==> $t"
    if gjs -m "$DIR/$t"; then
        pass=$((pass + 1))
    else
        fail=$((fail + 1))
        failed+=("$t")
    fi
    echo
done

echo "──────────────────────────────────────────"
echo "arquivos: $((pass + fail)) | ok: $pass | falhas: $fail"
if [ "$fail" -ne 0 ]; then
    echo "FALHARAM: ${failed[*]}"
    exit 1
fi
echo "TODOS OS TESTES DE LÓGICA PASSARAM"
