// Testes de pins.js. Rodar: gjs -m extension/test/testPins.js
import System from 'system';
import GLib from 'gi://GLib';
import { mergeEntries, addPin, removePin, isPinned, loadPins, savePins } from '../pins.js';

let failures = 0;
function check(name, cond) {
    print(cond ? `ok   - ${name}` : `FAIL - ${name}`);
    if (!cond) failures++;
}
function eq(name, got, want) {
    check(`${name} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`, got === want);
}

// mergeEntries: pinos no topo (na ordem dos pinos), histórico deduplicado contra os pinos.
{
    const pins = [{ content: 'p1' }, { content: 'p2' }];
    const history = [
        { uuid: 'u1', content: 'h1' },
        { uuid: 'u2', content: 'p1' },
        { uuid: 'u3', content: 'h2' },
    ];
    const m = mergeEntries(pins, history);
    eq('merge len', m.length, 4);
    eq('merge[0] content', m[0].content, 'p1');
    check('merge[0] pinned', m[0].pinned === true);
    eq('merge[0] uuid do histórico', m[0].uuid, 'u2'); // pino casado com item do histórico
    eq('merge[1] content', m[1].content, 'p2');
    eq('merge[1] uuid null', m[1].uuid, null);          // pino sem item no histórico
    eq('merge[2] content', m[2].content, 'h1');
    check('merge[2] não fixado', m[2].pinned === false);
    eq('merge[3] content', m[3].content, 'h2');
    // p1 aparece uma vez só (não duplica na seção do histórico)
    eq('p1 aparece 1x', m.filter(e => e.content === 'p1').length, 1);
}

// addPin: prepend + dedup.
{
    const pins = [{ content: 'a' }];
    const p2 = addPin(pins, 'b');
    eq('addPin novo prepend', p2[0].content, 'b');
    eq('addPin len', p2.length, 2);
    const p3 = addPin(p2, 'a'); // já existe -> sem duplicar
    eq('addPin dedup len', p3.length, 2);
    check('addPin não muta original', pins.length === 1);
}

// removePin.
{
    const pins = [{ content: 'a' }, { content: 'b' }];
    const p = removePin(pins, 'a');
    eq('removePin len', p.length, 1);
    eq('removePin resto', p[0].content, 'b');
}

// isPinned.
{
    const pins = [{ content: 'x' }];
    check('isPinned true', isPinned(pins, 'x') === true);
    check('isPinned false', isPinned(pins, 'y') === false);
}

// Round-trip Gio: salvar e carregar.
{
    const path = GLib.build_filenamev([GLib.get_tmp_dir(), `cliphist-pins-${Date.now()}.json`]);
    const pins = [{ content: 'linha 1', created_at: '2026-09-01' }, { content: 'çãé', created_at: '2026-09-01' }];
    savePins(path, pins);
    const loaded = loadPins(path);
    eq('round-trip len', loaded.length, 2);
    eq('round-trip content', loaded[0].content, 'linha 1');
    eq('round-trip utf8', loaded[1].content, 'çãé');
    GLib.unlink(path);
}

// loadPins de arquivo inexistente -> lista vazia (sem erro).
{
    const loaded = loadPins('/nao/existe/pins.json');
    eq('load inexistente vazio', loaded.length, 0);
}

if (failures > 0) {
    print(`\n${failures} teste(s) falharam`);
    System.exit(1);
} else {
    print('\ntodos os testes passaram');
}
