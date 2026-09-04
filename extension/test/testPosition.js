// Testes da função pura de posicionamento. Rodar: gjs -m extension/test/testPosition.js
import System from 'system';
import { computePosition, validCaret, pickMonitor } from '../position.js';

let failures = 0;
function check(name, cond) {
    if (cond) {
        print(`ok   - ${name}`);
    } else {
        print(`FAIL - ${name}`);
        failures++;
    }
}
function eq(name, got, want) {
    check(`${name} (got ${got}, want ${want})`, got === want);
}

const workArea = { x: 0, y: 32, width: 1920, height: 1048 }; // painel de 32px no topo
const popup = { width: 420, height: 500 };
const gap = 8;
const margin = 12;

// 1. Sem caret -> canto inferior direito, respeitando a work area.
{
    const p = computePosition({ caret: null, workArea, popup, gap, margin });
    eq('sem caret x', p.x, 0 + 1920 - 420 - 12);
    eq('sem caret y', p.y, 32 + 1048 - 500 - 12);
}

// 2. Caret com espaço abaixo -> logo abaixo do caret, x alinhado ao caret.
{
    const caret = { x: 300, y: 200, width: 2, height: 18 };
    const p = computePosition({ caret, workArea, popup, gap, margin });
    eq('abaixo x', p.x, 300);
    eq('abaixo y', p.y, 200 + 18 + 8);
}

// 3. Caret perto da base (não cabe abaixo) mas cabe acima -> acima do caret.
{
    const caret = { x: 300, y: 900, width: 2, height: 18 };
    const p = computePosition({ caret, workArea, popup, gap, margin });
    // abaixo seria 926, + 500 = 1426 > 1080 -> não cabe; acima = 900 - 500 - 8 = 392
    eq('acima y', p.y, 900 - 500 - 8);
}

// 4. Caret perto da borda direita -> x com clamp pra caber na work area.
{
    const caret = { x: 1800, y: 200, width: 2, height: 18 };
    const p = computePosition({ caret, workArea, popup, gap, margin });
    eq('clamp x direita', p.x, 1920 - 420); // 1500
}

// 5. Caret onde não cabe nem abaixo nem acima -> clamp vertical dentro da work area.
{
    const tall = { width: 420, height: 1040 };
    const caret = { x: 300, y: 500, width: 2, height: 18 };
    const p = computePosition({ caret, workArea, popup: tall, gap, margin });
    // acima = 500-1040-8 < 32; abaixo estoura -> clamp em (32 + 1048 - 1040) = 40
    eq('clamp y', p.y, 32 + 1048 - 1040);
}

// --- validCaret --------------------------------------------------------------

// 6. Retângulo de caret plausível passa e é normalizado.
{
    const c = validCaret({ x: 300, y: 200, width: 2, height: 18 });
    check('validCaret aceita rect válido', c !== null);
    eq('validCaret x', c.x, 300);
    eq('validCaret height', c.height, 18);
}
// 7. null/undefined -> null.
check('validCaret null', validCaret(null) === null);
check('validCaret undefined', validCaret(undefined) === null);
// 8. Altura zero -> null (sem linha de texto).
check('validCaret height 0', validCaret({ x: 5, y: 5, width: 2, height: 0 }) === null);
// 9. Tudo zerado -> null ("sem localização").
check('validCaret tudo zero', validCaret({ x: 0, y: 0, width: 0, height: 0 }) === null);
// 10. Campo faltando / NaN -> null.
check('validCaret sem height', validCaret({ x: 1, y: 2, width: 3 }) === null);
check('validCaret NaN', validCaret({ x: NaN, y: 2, width: 3, height: 18 }) === null);

// --- pickMonitor -------------------------------------------------------------

const monitors = [
    { x: 0, y: 0, width: 1920, height: 1080 },      // 0: primário
    { x: 1920, y: 0, width: 2560, height: 1440 },   // 1: à direita
];
// 11. Ponto no monitor 0.
eq('pickMonitor no 0', pickMonitor({ x: 500, y: 300 }, monitors), 0);
// 12. Ponto no monitor 1.
eq('pickMonitor no 1', pickMonitor({ x: 2000, y: 100 }, monitors), 1);
// 13. Borda: x exatamente no início do monitor 1 pertence ao 1.
eq('pickMonitor borda esquerda do 1', pickMonitor({ x: 1920, y: 0 }, monitors), 1);
// 14. Fora de todos -> -1.
eq('pickMonitor fora', pickMonitor({ x: 9999, y: 9999 }, monitors), -1);
// 15. Entradas inválidas -> -1.
eq('pickMonitor caret null', pickMonitor(null, monitors), -1);
eq('pickMonitor monitors inválido', pickMonitor({ x: 1, y: 1 }, null), -1);

if (failures > 0) {
    print(`\n${failures} teste(s) falharam`);
    System.exit(1);
} else {
    print('\ntodos os testes passaram');
}
