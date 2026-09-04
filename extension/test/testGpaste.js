// Testes de gpaste.js com a camada D-Bus injetada (sem sessão/daemon reais).
// Rodar: gjs -m extension/test/testGpaste.js
//
// O GPaste aceita `{ call }` no construtor: uma função que simula
// _proxy.call(...). Ela devolve uma Promise que resolve num objeto com
// deepUnpack() — o mesmo contrato de GLib.Variant que o código consome.
import { check, eq, deepEq, section, report } from './assert.js';
import { GPaste } from '../gpaste.js';

// Embrulha um valor no contrato { deepUnpack } dos retornos D-Bus.
const variant = value => ({ deepUnpack: () => value });

// Constrói um GPaste falso: `handlers[method](params) -> valorDesempacotado`.
// Registra cada chamada em `calls` para asserts de cache/roteamento.
function fakeGPaste(handlers) {
    const calls = [];
    const call = (method, params) => {
        calls.push({ method, params });
        const h = handlers[method];
        if (!h)
            return Promise.reject(new Error(`método não simulado: ${method}`));
        try {
            return Promise.resolve(variant(h(params)));
        } catch (e) {
            return Promise.reject(e);
        }
    };
    return { gp: new GPaste({ call }), calls };
}

// Primeiro argumento (s) de uma chamada, ou null se params for null.
const argOf = c => (c.params ? c.params.deepUnpack()[0] : null);
const countMethod = (calls, m) => calls.filter(c => c.method === m).length;

// --- getHistory ----------------------------------------------------------
section('getHistory');
{
    const { gp } = fakeGPaste({
        GetHistory: () => [[['u1', 'c1'], ['u2', 'c2']]], // a(ss) -> [items]
    });
    const h = await gp.getHistory();
    deepEq('mapeia [uuid, content]', h,
        [{ uuid: 'u1', content: 'c1' }, { uuid: 'u2', content: 'c2' }]);
}
{
    const { gp } = fakeGPaste({ GetHistory: () => [[]] });
    eq('histórico vazio -> []', (await gp.getHistory()).length, 0);
}

// getHistory poda o cache de meta dos uuids que sumiram do histórico.
{
    let history = [['u1', 'c1'], ['u2', 'c2']];
    const { gp, calls } = fakeGPaste({
        GetHistory: () => [history],
        GetElementKind: () => ['Text'],
    });
    await gp.getMeta('u1');
    await gp.getMeta('u2');
    eq('2 kinds consultados', countMethod(calls, 'GetElementKind'), 2);

    // u2 sai do histórico -> cache podado.
    history = [['u1', 'c1']];
    await gp.getHistory();

    await gp.getMeta('u1'); // ainda no histórico -> cacheado, sem nova consulta
    eq('u1 permanece cacheado', countMethod(calls, 'GetElementKind'), 2);
    await gp.getMeta('u2'); // foi podado -> consulta de novo
    eq('u2 foi podado e reconsultado', countMethod(calls, 'GetElementKind'), 3);
}

// --- getMeta -------------------------------------------------------------
section('getMeta');

// Texto: cacheia o resultado (kind nunca é reconsultado).
{
    const { gp, calls } = fakeGPaste({ GetElementKind: () => ['Text'] });
    const m1 = await gp.getMeta('x');
    deepEq('texto -> {text, null}', m1, { kind: 'text', imagePath: null });
    await gp.getMeta('x');
    eq('segunda chamada usa cache', countMethod(calls, 'GetElementKind'), 1);
}

// Imagem: resolve imagePath via GetRawElement.
{
    const { gp, calls } = fakeGPaste({
        GetElementKind: () => ['Image'],
        GetRawElement: () => ['/tmp/a.png'],
    });
    const m = await gp.getMeta('img');
    deepEq('imagem -> {image, path}', m, { kind: 'image', imagePath: '/tmp/a.png' });
    eq('GetRawElement chamado 1x', countMethod(calls, 'GetRawElement'), 1);
}

// Normalização: kind vem em qualquer caixa; '' cai em text.
{
    const { gp } = fakeGPaste({
        GetElementKind: () => ['IMAGE'],
        GetRawElement: () => ['/p.png'],
    });
    eq('kind IMAGE -> image', (await gp.getMeta('a')).kind, 'image');
}
{
    const { gp } = fakeGPaste({ GetElementKind: () => [''] });
    eq('kind vazio -> text', (await gp.getMeta('a')).kind, 'text');
}

// Imagem sem raw element -> imagePath null (value || null).
{
    const { gp } = fakeGPaste({
        GetElementKind: () => ['Image'],
        GetRawElement: () => [''],
    });
    eq('imagem sem path -> null', (await gp.getMeta('a')).imagePath, null);
}

// Degradação: GetElementKind ausente/erro -> text, e o resultado é cacheado.
{
    const { gp, calls } = fakeGPaste({
        GetElementKind: () => { throw new Error('sem GetElementKind'); },
    });
    const m = await gp.getMeta('a');
    deepEq('erro -> {text, null}', m, { kind: 'text', imagePath: null });
    await gp.getMeta('a');
    eq('degradação também é cacheada', countMethod(calls, 'GetElementKind'), 1);
}

// --- roteamento de mutações ---------------------------------------------
section('add / select / delete / empty');
{
    const { gp, calls } = fakeGPaste({ Add: () => [] });
    await gp.add('olá');
    eq('add usa método Add', calls[0].method, 'Add');
    eq('add passa o texto', argOf(calls[0]), 'olá');
}
{
    const { gp, calls } = fakeGPaste({ Select: () => [] });
    await gp.select('uuid-9');
    eq('select usa método Select', calls[0].method, 'Select');
    eq('select passa o uuid', argOf(calls[0]), 'uuid-9');
}
{
    const { gp, calls } = fakeGPaste({ Delete: () => [] });
    await gp.delete('uuid-3');
    eq('delete usa método Delete', calls[0].method, 'Delete');
    eq('delete passa o uuid', argOf(calls[0]), 'uuid-3');
}
// empty(): busca o nome do histórico e chama EmptyHistory com ele.
{
    const { gp, calls } = fakeGPaste({
        GetHistoryName: () => ['history'],
        EmptyHistory: () => [],
    });
    await gp.empty();
    check('empty consulta GetHistoryName', calls.some(c => c.method === 'GetHistoryName'));
    const emptyCall = calls.find(c => c.method === 'EmptyHistory');
    check('empty chama EmptyHistory', emptyCall !== undefined);
    eq('empty passa o nome do histórico', argOf(emptyCall), 'history');
}

report();
