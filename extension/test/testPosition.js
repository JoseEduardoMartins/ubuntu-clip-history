// Testes da função pura de posicionamento. Rodar: gjs -m extension/test/testPosition.js
import { check, eq, section, report } from './assert.js';
import { computePosition, validCaret, pickMonitor } from '../position.js';

const workArea = { x: 0, y: 32, width: 1920, height: 1048 }; // painel de 32px no topo
const popup = { width: 420, height: 500 };
const gap = 8;
const margin = 12;

// --- computePosition ---------------------------------------------------------
section('computePosition');

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

// 6. Caret à esquerda do work area (x negativo, multi-monitor) -> clamp no x mínimo.
{
    const caret = { x: -50, y: 200, width: 2, height: 18 };
    const p = computePosition({ caret, workArea, popup, gap, margin });
    eq('clamp x esquerda', p.x, workArea.x); // 0
}

// 7. Usa defaults de gap/margin quando omitidos.
{
    const p = computePosition({ caret: null, workArea, popup });
    eq('default margin no x', p.x, 0 + 1920 - 420 - 12);
}

// --- validCaret --------------------------------------------------------------
section('validCaret');

// Retângulo de caret plausível passa e é normalizado.
{
    const c = validCaret({ x: 300, y: 200, width: 2, height: 18 });
    check('validCaret aceita rect válido', c !== null);
    eq('validCaret x', c.x, 300);
    eq('validCaret height', c.height, 18);
}
// Coord negativa (monitor à esquerda) é válida — só height/finito importam.
{
    const c = validCaret({ x: -100, y: 5, width: 2, height: 18 });
    check('validCaret aceita x negativo', c !== null);
    eq('validCaret x negativo preservado', c.x, -100);
}
// null/undefined -> null.
check('validCaret null', validCaret(null) === null);
check('validCaret undefined', validCaret(undefined) === null);
// Altura zero ou negativa -> null (sem linha de texto).
check('validCaret height 0', validCaret({ x: 5, y: 5, width: 2, height: 0 }) === null);
check('validCaret height negativa', validCaret({ x: 5, y: 5, width: 2, height: -3 }) === null);
// Tudo zerado -> null ("sem localização").
check('validCaret tudo zero', validCaret({ x: 0, y: 0, width: 0, height: 0 }) === null);
// Campo faltando / NaN / Infinity -> null.
check('validCaret sem height', validCaret({ x: 1, y: 2, width: 3 }) === null);
check('validCaret NaN', validCaret({ x: NaN, y: 2, width: 3, height: 18 }) === null);
check('validCaret Infinity', validCaret({ x: Infinity, y: 2, width: 3, height: 18 }) === null);
// Tipo errado -> null.
check('validCaret string', validCaret('nope') === null);

// --- pickMonitor -------------------------------------------------------------
section('pickMonitor');

const monitors = [
    { x: 0, y: 0, width: 1920, height: 1080 },      // 0: primário
    { x: 1920, y: 0, width: 2560, height: 1440 },   // 1: à direita
];
// Ponto no monitor 0.
eq('pickMonitor no 0', pickMonitor({ x: 500, y: 300 }, monitors), 0);
// Ponto no monitor 1.
eq('pickMonitor no 1', pickMonitor({ x: 2000, y: 100 }, monitors), 1);
// Borda: x exatamente no início do monitor 1 pertence ao 1 (limite esquerdo inclusivo).
eq('pickMonitor borda esquerda do 1', pickMonitor({ x: 1920, y: 0 }, monitors), 1);
// Borda direita é exclusiva: x no fim do monitor 0 já não é do 0 -> cai no 1.
eq('pickMonitor borda direita exclusiva', pickMonitor({ x: 1920 - 0, y: 500 }, monitors), 1);
// Borda inferior exclusiva: y == altura não pertence ao monitor.
eq('pickMonitor borda inferior exclusiva', pickMonitor({ x: 100, y: 1080 }, monitors), -1);
// Fora de todos -> -1.
eq('pickMonitor fora', pickMonitor({ x: 9999, y: 9999 }, monitors), -1);
// Entradas inválidas -> -1.
eq('pickMonitor caret null', pickMonitor(null, monitors), -1);
eq('pickMonitor monitors inválido', pickMonitor({ x: 1, y: 1 }, null), -1);
eq('pickMonitor lista vazia', pickMonitor({ x: 1, y: 1 }, []), -1);

report();
