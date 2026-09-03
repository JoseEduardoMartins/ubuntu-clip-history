// Helpers puros de texto para a UI.

const MAX_PREVIEW = 500;

// Colapsa espaços em branco (incl. quebras de linha) numa única linha e apara,
// limitando o comprimento para render barato. Espelha o _preview do picker antigo.
export function preview(text) {
    const collapsed = String(text).replace(/\s+/g, ' ').trim();
    return collapsed.length > MAX_PREVIEW ? collapsed.slice(0, MAX_PREVIEW) : collapsed;
}
