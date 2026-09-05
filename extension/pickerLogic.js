// Lógica pura do picker — sem St/Clutter/GObject, testável com gjs.
//
// O picker.js cuida dos atores (busca, lista, botões); aqui ficam só as
// decisões: como filtrar, como a seleção se move, e o que cada tecla faz.

// Filtra as entradas por substring case-insensitive do content.
// Query vazia (ou só espaços) devolve uma cópia de todas as entradas.
//
// Itens de senha (kind==='password') são EXCLUÍDOS de qualquer busca não-vazia:
// o `content` de uma senha é o valor real em texto plano, então casá-lo por
// substring revelaria se um segredo contém o que foi digitado (a linha
// apareceria/sumiria). Com a busca vazia eles aparecem normalmente (mascarados
// na UI). Entradas sem `kind` são tratadas como texto (casam) — default defensivo.
export function filterEntries(all, query) {
    const q = (query ?? '').trim().toLowerCase();
    if (!q)
        return all.slice();
    return all.filter(e => (e.kind ?? 'text') !== 'password'
        && e.content.toLowerCase().includes(q));
}

// Corrige a seleção depois que a lista encolheu (ex.: filtro).
// Se o índice caiu fora do fim, gruda no último; lista vazia -> 0.
export function clampSelected(selected, length) {
    if (length <= 0)
        return 0;
    if (selected >= length)
        return length - 1;
    if (selected < 0)
        return 0;
    return selected;
}

// Move a seleção com wraparound (topo <-> fim). Lista vazia não mexe.
export function nextSelected(selected, delta, length) {
    if (length <= 0)
        return selected;
    return ((selected + delta) % length + length) % length;
}

// Chave de identidade de uma entrada: uuid, ou content quando não há uuid
// (pino de texto que já saiu do histórico do GPaste).
export function entryKey(entry) {
    return entry ? (entry.uuid || entry.content) : null;
}

// Reencontra o índice do item previamente selecionado depois que a lista mudou
// (refresh ao vivo). `key` identifica esse item (ver entryKey). Se ele ainda
// existe, devolve a nova posição — assim um item novo no topo não faz a seleção
// "escorregar" pro item errado. Se sumiu (deletado/filtrado) ou `key` é nula,
// cai no clamp da posição anterior (`fallback`), sem pular pro topo.
export function reselectIndex(entries, key, fallback) {
    if (key != null) {
        const i = entries.findIndex(e => (e.uuid || e.content) === key);
        if (i >= 0)
            return i;
    }
    return clampSelected(fallback, entries.length);
}

// Traduz uma tecla (símbolo + máscara de modificadores) numa ação abstrata,
// sem tocar em atores. KEYS injeta as constantes do Clutter para o teste
// poder fornecer valores próprios.
//
// Retorna um dos:
//   { type: 'dismiss' }
//   { type: 'choose-selected' }
//   { type: 'choose-index', index }   // Alt+1..9 (0-based)
//   { type: 'move', delta }           // -1 / +1 (com wrap)
//   { type: 'page', delta }           // -1 / +1 página (PageUp/PageDown, sem wrap)
//   { type: 'jump', to }              // 'first' / 'last' (Ctrl+Home/Ctrl+End)
//   { type: 'delete-selected' }       // Ctrl+Delete
//   { type: 'pin-selected' }
//   { type: 'passthrough' }           // deixa digitar na busca
export function keyAction(symbol, state, KEYS) {
    const ctrl = (state & KEYS.CONTROL_MASK) !== 0;
    const alt = (state & KEYS.MOD1_MASK) !== 0;

    switch (symbol) {
    case KEYS.Escape:
        return { type: 'dismiss' };
    case KEYS.Return:
    case KEYS.KP_Enter:
        return { type: 'choose-selected' };
    case KEYS.Up:
        return { type: 'move', delta: -1 };
    case KEYS.Down:
        return { type: 'move', delta: +1 };
    // PageUp/PageDown não têm uso numa busca de uma linha -> navegam a lista.
    case KEYS.Page_Up:
        return { type: 'page', delta: -1 };
    case KEYS.Page_Down:
        return { type: 'page', delta: +1 };
    }

    // Ctrl+Delete apaga o item selecionado. Delete sozinho cai em passthrough:
    // como o foco fica no St.Entry da busca, o Delete "puro" edita o texto —
    // exigir Ctrl evita a ambiguidade de apagar item vs. apagar caractere.
    if (ctrl && symbol === KEYS.Delete)
        return { type: 'delete-selected' };

    // Home/End sem modificador editam a busca; com Ctrl saltam na lista (mesma
    // lógica do Ctrl+Delete: exigir Ctrl evita clobrar a edição do texto).
    if (ctrl && symbol === KEYS.Home)
        return { type: 'jump', to: 'first' };
    if (ctrl && symbol === KEYS.End)
        return { type: 'jump', to: 'last' };

    if (ctrl && (symbol === KEYS.p || symbol === KEYS.P))
        return { type: 'pin-selected' };

    if (alt && symbol >= KEYS.KEY_1 && symbol <= KEYS.KEY_9)
        return { type: 'choose-index', index: symbol - KEYS.KEY_1 };

    return { type: 'passthrough' };
}
