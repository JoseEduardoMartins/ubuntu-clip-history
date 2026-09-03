// Testes da lógica pura do picker. Rodar: gjs -m extension/test/testPickerLogic.js
import System from 'system';
import { filterEntries, clampSelected, nextSelected, keyAction } from '../pickerLogic.js';

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
    check(`${name} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`, got === want);
}
function deepEq(name, got, want) {
    check(`${name} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`,
        JSON.stringify(got) === JSON.stringify(want));
}

// --- filterEntries -------------------------------------------------------
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

    // Sem match -> vazio.
    eq('sem match', filterEntries(all, 'xyz').length, 0);

    // Query com espaços nas pontas é aparada.
    deepEq('trim da query', filterEntries(all, '  hello  ').map(e => e.uuid), ['a']);
}

// --- clampSelected -------------------------------------------------------
eq('clamp dentro do range', clampSelected(2, 5), 2);
eq('clamp além do fim gruda no último', clampSelected(7, 3), 2);
eq('clamp exatamente no length', clampSelected(3, 3), 2);
eq('clamp lista vazia -> 0', clampSelected(4, 0), 0);
eq('clamp negativo -> 0', clampSelected(-1, 3), 0);
eq('clamp zero com itens', clampSelected(0, 3), 0);

// --- nextSelected --------------------------------------------------------
eq('next desce', nextSelected(0, +1, 5), 1);
eq('next sobe', nextSelected(2, -1, 5), 1);
eq('next wrap do fim pro topo', nextSelected(4, +1, 5), 0);
eq('next wrap do topo pro fim', nextSelected(0, -1, 5), 4);
eq('next lista vazia não mexe', nextSelected(0, +1, 0), 0);
eq('next lista de 1 fica', nextSelected(0, +1, 1), 0);

// --- keyAction -----------------------------------------------------------
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
deepEq('Delete -> delete-selected', keyAction(KEYS.Delete, NONE, KEYS), { type: 'delete-selected' });

// Ctrl+P (minúsculo e maiúsculo) -> pin.
deepEq('Ctrl+p -> pin', keyAction(KEYS.p, KEYS.CONTROL_MASK, KEYS), { type: 'pin-selected' });
deepEq('Ctrl+P -> pin', keyAction(KEYS.P, KEYS.CONTROL_MASK, KEYS), { type: 'pin-selected' });
// p sem Ctrl -> passthrough (digita na busca).
deepEq('p sem ctrl -> passthrough', keyAction(KEYS.p, NONE, KEYS), { type: 'passthrough' });

// Alt+1..9 -> choose-index (0-based).
deepEq('Alt+1 -> index 0', keyAction(KEYS.KEY_1, KEYS.MOD1_MASK, KEYS), { type: 'choose-index', index: 0 });
deepEq('Alt+9 -> index 8', keyAction(KEYS.KEY_9, KEYS.MOD1_MASK, KEYS), { type: 'choose-index', index: 8 });
// Número sem Alt -> passthrough.
deepEq('1 sem alt -> passthrough', keyAction(KEYS.KEY_1, NONE, KEYS), { type: 'passthrough' });

// Tecla comum sem modificador -> passthrough.
deepEq('tecla qualquer -> passthrough', keyAction(0x061 /* a */, NONE, KEYS), { type: 'passthrough' });

if (failures > 0) {
    print(`\n${failures} teste(s) falharam`);
    System.exit(1);
} else {
    print('\ntodos os testes passaram');
}
