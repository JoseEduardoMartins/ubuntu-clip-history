// Testes da função pura de posicionamento. Rodar: gjs -m extension/test/testPosition.js
import System from 'system';
import { computePosition } from '../position.js';

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

if (failures > 0) {
    print(`\n${failures} teste(s) falharam`);
    System.exit(1);
} else {
    print('\ntodos os testes passaram');
}
