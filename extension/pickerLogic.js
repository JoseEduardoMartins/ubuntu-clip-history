// Lógica pura do picker — sem St/Clutter/GObject, testável com gjs.
//
// O picker.js cuida dos atores (busca, lista, botões); aqui ficam só as
// decisões: como filtrar, como a seleção se move, e o que cada tecla faz.

// Filtra as entradas por substring case-insensitive do content.
// Query vazia (ou só espaços) devolve uma cópia de todas as entradas.
export function filterEntries(all, query) {
    const q = (query ?? '').trim().toLowerCase();
    if (!q)
        return all.slice();
    return all.filter(e => e.content.toLowerCase().includes(q));
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

// Traduz uma tecla (símbolo + máscara de modificadores) numa ação abstrata,
// sem tocar em atores. KEYS injeta as constantes do Clutter para o teste
// poder fornecer valores próprios.
//
// Retorna um dos:
//   { type: 'dismiss' }
//   { type: 'choose-selected' }
//   { type: 'choose-index', index }   // Alt+1..9 (0-based)
//   { type: 'move', delta }           // -1 / +1
//   { type: 'delete-selected' }
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
    case KEYS.Delete:
        return { type: 'delete-selected' };
    }

    if (ctrl && (symbol === KEYS.p || symbol === KEYS.P))
        return { type: 'pin-selected' };

    if (alt && symbol >= KEYS.KEY_1 && symbol <= KEYS.KEY_9)
        return { type: 'choose-index', index: symbol - KEYS.KEY_1 };

    return { type: 'passthrough' };
}
