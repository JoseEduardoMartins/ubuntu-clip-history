// Testes da lógica pura do picker. Rodar: gjs -m extension/test/testPickerLogic.js
import { check, eq, deepEq, section, report } from './assert.js';
import { filterEntries, clampSelected, nextSelected, keyAction } from '../pickerLogic.js';

// --- filterEntries -------------------------------------------------------
section('filterEntries');
{
    const all = [
        { content: 'Hello World', uuid: 'a' },
        { content: 'foo BAR', uuid: 'b' },
        { content: 'açaí com Ç', uuid: 'c' },
    ];

    // Query vazia -> cópia de tudo (mesmos itens, array diferente).
    const empty = filterEntries(all, '');
    eq('vazio devolve tudo', empty.length, 3);
    check('vazio não é o mesmo array', empty !== all);

    // null/undefined como query -> tudo (defensivo: `query ?? ''`).
    eq('null devolve tudo', filterEntries(all, null).length, 3);
    eq('undefined devolve tudo', filterEntries(all, undefined).length, 3);

    // Só espaços conta como vazio.
    eq('só espaços devolve tudo', filterEntries(all, '   ').length, 3);

    // Case-insensitive.
    deepEq('match case-insensitive', filterEntries(all, 'hello').map(e => e.uuid), ['a']);
    deepEq('match maiúsculo na query', filterEntries(all, 'BAR').map(e => e.uuid), ['b']);
    deepEq('match minúsculo na query', filterEntries(all, 'bar').map(e => e.uuid), ['b']);

    // Substring no meio.
    deepEq('substring interna', filterEntries(all, 'oo').map(e => e.uuid), ['b']);

    // Acento é literal (não normaliza).
    deepEq('acento literal', filterEntries(all, 'açaí').map(e => e.uuid), ['c']);

    // Preserva a ordem original entre os que casam ('r' está em a e b, não em c).
    deepEq('preserva ordem', filterEntries(all, 'r').map(e => e.uuid), ['a', 'b']);

    // Sem match -> vazio.
    eq('sem match', filterEntries(all, 'xyz').length, 0);

    // Query com espaços nas pontas é aparada.
    deepEq('trim da query', filterEntries(all, '  hello  ').map(e => e.uuid), ['a']);
}

// --- clampSelected -------------------------------------------------------
section('clampSelected');
eq('clamp dentro do range', clampSelected(2, 5), 2);
eq('clamp além do fim gruda no último', clampSelected(7, 3), 2);
eq('clamp exatamente no length', clampSelected(3, 3), 2);
eq('clamp lista vazia -> 0', clampSelected(4, 0), 0);
eq('clamp negativo -> 0', clampSelected(-1, 3), 0);
eq('clamp zero com itens', clampSelected(0, 3), 0);

// --- nextSelected --------------------------------------------------------
section('nextSelected');
eq('next desce', nextSelected(0, +1, 5), 1);
eq('next sobe', nextSelected(2, -1, 5), 1);
eq('next wrap do fim pro topo', nextSelected(4, +1, 5), 0);
eq('next wrap do topo pro fim', nextSelected(0, -1, 5), 4);
eq('next lista vazia não mexe', nextSelected(0, +1, 0), 0);
eq('next lista de 1 fica', nextSelected(0, +1, 1), 0);
// Delta maior que o tamanho envolve corretamente (módulo).
eq('next delta grande +', nextSelected(0, +7, 5), 2);
eq('next delta grande -', nextSelected(0, -7, 5), 3);
eq('next delta exato = volta', nextSelected(3, +5, 5), 3);

// --- keyAction -----------------------------------------------------------
section('keyAction');
// Constantes fictícias, mas com o mesmo formato do Clutter: teclas 1..9
// consecutivas e máscaras como bits distintos.
const KEYS = {
    Escape: 0xff1b,
    Return: 0xff0d,
    KP_Enter: 0xff8d,
    Up: 0xff52,
    Down: 0xff54,
    Delete: 0xffff,
    p: 0x070,
    P: 0x050,
    KEY_1: 0x031,
    KEY_9: 0x039,
    CONTROL_MASK: 1 << 2,
    MOD1_MASK: 1 << 3,
};
const NONE = 0;

deepEq('Escape -> dismiss', keyAction(KEYS.Escape, NONE, KEYS), { type: 'dismiss' });
deepEq('Return -> choose-selected', keyAction(KEYS.Return, NONE, KEYS), { type: 'choose-selected' });
deepEq('KP_Enter -> choose-selected', keyAction(KEYS.KP_Enter, NONE, KEYS), { type: 'choose-selected' });
deepEq('Up -> move -1', keyAction(KEYS.Up, NONE, KEYS), { type: 'move', delta: -1 });
deepEq('Down -> move +1', keyAction(KEYS.Down, NONE, KEYS), { type: 'move', delta: +1 });
// Modificadores nas setas são ignorados (o switch casa antes das checagens).
deepEq('Ctrl+Up ainda é move', keyAction(KEYS.Up, KEYS.CONTROL_MASK, KEYS), { type: 'move', delta: -1 });

// Ctrl+Delete apaga o item; Delete sozinho é passthrough (edita a busca).
deepEq('Ctrl+Delete -> delete-selected', keyAction(KEYS.Delete, KEYS.CONTROL_MASK, KEYS), { type: 'delete-selected' });
deepEq('Delete sem ctrl -> passthrough', keyAction(KEYS.Delete, NONE, KEYS), { type: 'passthrough' });
deepEq('Alt+Delete -> passthrough', keyAction(KEYS.Delete, KEYS.MOD1_MASK, KEYS), { type: 'passthrough' });
// Ctrl vence mesmo com Alt junto.
deepEq('Ctrl+Alt+Delete -> delete-selected',
    keyAction(KEYS.Delete, KEYS.CONTROL_MASK | KEYS.MOD1_MASK, KEYS), { type: 'delete-selected' });

// Ctrl+P (minúsculo e maiúsculo) -> pin.
deepEq('Ctrl+p -> pin', keyAction(KEYS.p, KEYS.CONTROL_MASK, KEYS), { type: 'pin-selected' });
deepEq('Ctrl+P -> pin', keyAction(KEYS.P, KEYS.CONTROL_MASK, KEYS), { type: 'pin-selected' });
// p sem Ctrl -> passthrough (digita na busca).
deepEq('p sem ctrl -> passthrough', keyAction(KEYS.p, NONE, KEYS), { type: 'passthrough' });

// Alt+1..9 -> choose-index (0-based).
deepEq('Alt+1 -> index 0', keyAction(KEYS.KEY_1, KEYS.MOD1_MASK, KEYS), { type: 'choose-index', index: 0 });
deepEq('Alt+9 -> index 8', keyAction(KEYS.KEY_9, KEYS.MOD1_MASK, KEYS), { type: 'choose-index', index: 8 });
// Fora da faixa 1..9 -> passthrough (não há Alt+0 nem Alt+outros).
deepEq('Alt+abaixo de 1 -> passthrough', keyAction(KEYS.KEY_1 - 1, KEYS.MOD1_MASK, KEYS), { type: 'passthrough' });
deepEq('Alt+acima de 9 -> passthrough', keyAction(KEYS.KEY_9 + 1, KEYS.MOD1_MASK, KEYS), { type: 'passthrough' });
// Número sem Alt -> passthrough.
deepEq('1 sem alt -> passthrough', keyAction(KEYS.KEY_1, NONE, KEYS), { type: 'passthrough' });

// Tecla comum sem modificador -> passthrough.
deepEq('tecla qualquer -> passthrough', keyAction(0x061 /* a */, NONE, KEYS), { type: 'passthrough' });

report();
