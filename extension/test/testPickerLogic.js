// Testes da lógica pura do picker. Rodar: gjs -m extension/test/testPickerLogic.js
import { check, eq, deepEq, section, report } from './assert.js';
import { filterEntries, clampSelected, nextSelected, reselectIndex, keyAction, scrollValueFor } from '../pickerLogic.js';

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

// filterEntries: itens de senha nunca casam a busca (privacidade). O content de
// uma senha é o valor real em texto plano — casá-lo por substring vazaria se um
// segredo contém o texto digitado. Com a busca vazia aparecem (mascarados na UI).
{
    const all = [
        { content: 'nota comum', uuid: 'a', kind: 'text' },
        { content: 'senha-secreta-123', uuid: 'b', kind: 'password' },
        { content: 'outra senha 123', uuid: 'c', kind: 'password' },
        { content: '[Image, 10 x 10]', uuid: 'd', kind: 'image' },
    ];

    // Busca vazia -> tudo aparece (senhas inclusas, mascaradas na UI).
    eq('busca vazia mostra senhas', filterEntries(all, '').length, 4);

    // Substring que casaria o valor real da senha -> a senha NÃO aparece.
    deepEq('senha não casa por substring do valor',
        filterEntries(all, '123').map(e => e.uuid), []);
    deepEq('senha não casa nem pelo prefixo',
        filterEntries(all, 'senha-secreta').map(e => e.uuid), []);

    // Texto e imagem seguem casando normalmente.
    deepEq('texto ainda casa', filterEntries(all, 'nota').map(e => e.uuid), ['a']);
    deepEq('imagem ainda casa', filterEntries(all, 'image').map(e => e.uuid), ['d']);

    // kind ausente é tratado como texto (casa) — defensivo.
    {
        const semKind = [{ content: 'abc', uuid: 'x' }];
        deepEq('sem kind casa como texto', filterEntries(semKind, 'abc').map(e => e.uuid), ['x']);
    }
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

// --- reselectIndex -------------------------------------------------------
// Mantém a seleção no MESMO item após a lista mudar (refresh ao vivo): sem
// isso, um item novo no topo empurrava tudo e a seleção por índice passava a
// apontar pro item errado.
section('reselectIndex');
{
    const before = [
        { uuid: 'a', content: 'A' },
        { uuid: 'b', content: 'B' },
        { uuid: 'c', content: 'C' },
    ];
    // Um item novo entra no topo: 'b' (antes idx 1) agora está no idx 2.
    const after = [
        { uuid: 'novo', content: 'N' },
        { uuid: 'a', content: 'A' },
        { uuid: 'b', content: 'B' },
        { uuid: 'c', content: 'C' },
    ];
    const key = before[1].uuid; // estava selecionado 'b'
    eq('segue o item pelo uuid', reselectIndex(after, key, 1), 2);
}
{
    const entries = [{ uuid: 'a', content: 'A' }, { uuid: 'b', content: 'B' }];
    // Item selecionado sumiu (deletado/filtrado) -> clamp do fallback.
    eq('sumiu -> clamp do fallback', reselectIndex(entries, 'zzz', 5), 1);
    eq('sumiu, fallback dentro', reselectIndex(entries, 'zzz', 0), 0);
    // Key nula (nada estava selecionado) -> clamp do fallback.
    eq('key nula -> clamp', reselectIndex(entries, null, 3), 1);
    // Lista vazia -> 0.
    eq('lista vazia -> 0', reselectIndex([], 'a', 2), 0);
}
{
    // Pino de texto sem uuid: casa por content.
    const entries = [{ uuid: '', content: 'pin-x' }, { uuid: 'b', content: 'B' }];
    eq('casa por content quando sem uuid', reselectIndex(entries, 'pin-x', 1), 0);
}

// --- scrollValueFor ------------------------------------------------------
// Novo valor do vadjustment pra deixar a linha [top, bottom] visível na
// viewport [value, value+pageSize]. Item já visível não mexe.
section('scrollValueFor');
{
    const PAGE = 100;
    // Item já visível (topo, meio, fim da vista) -> inalterado.
    eq('visível no topo da vista', scrollValueFor(0, 20, 0, PAGE), 0);
    eq('visível no meio', scrollValueFor(40, 60, 0, PAGE), 0);
    eq('visível colado no fim', scrollValueFor(80, 100, 0, PAGE), 0);

    // Item acima da vista -> rola pra cima, alinhando o topo do item.
    eq('acima da vista', scrollValueFor(30, 50, 80, PAGE), 30);

    // Item abaixo da vista -> rola pra baixo, alinhando o fim do item.
    eq('abaixo da vista', scrollValueFor(150, 170, 0, PAGE), 70); // 170 - 100

    // Bordas exatas contam como visível (sem rolar).
    eq('borda: top == value', scrollValueFor(50, 70, 50, PAGE), 50);
    eq('borda: bottom == value+page', scrollValueFor(30, 100, 0, PAGE), 0);

    // Item maior que a página, aproximado por baixo (value abaixo do item):
    // alinha o fim do item (mostra a porção de baixo). Preserva o comportamento
    // original do _scrollToSelected.
    eq('item alto por baixo alinha o fim', scrollValueFor(200, 400, 0, PAGE), 300); // 400 - 100
    // Item maior que a página, aproximado por cima (top < value): alinha o topo.
    eq('item alto por cima alinha o topo', scrollValueFor(200, 500, 250, PAGE), 200);
}

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
    Page_Up: 0xff55,
    Page_Down: 0xff56,
    Home: 0xff50,
    End: 0xff57,
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

// PageUp/PageDown navegam a lista (sem modificador — busca de 1 linha não usa).
deepEq('PageUp -> page -1', keyAction(KEYS.Page_Up, NONE, KEYS), { type: 'page', delta: -1 });
deepEq('PageDown -> page +1', keyAction(KEYS.Page_Down, NONE, KEYS), { type: 'page', delta: +1 });

// Home/End sem Ctrl editam a busca (passthrough); com Ctrl saltam na lista.
deepEq('Home sem ctrl -> passthrough', keyAction(KEYS.Home, NONE, KEYS), { type: 'passthrough' });
deepEq('End sem ctrl -> passthrough', keyAction(KEYS.End, NONE, KEYS), { type: 'passthrough' });
deepEq('Ctrl+Home -> jump first', keyAction(KEYS.Home, KEYS.CONTROL_MASK, KEYS), { type: 'jump', to: 'first' });
deepEq('Ctrl+End -> jump last', keyAction(KEYS.End, KEYS.CONTROL_MASK, KEYS), { type: 'jump', to: 'last' });

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
