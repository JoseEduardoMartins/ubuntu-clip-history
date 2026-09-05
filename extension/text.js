// Helpers puros de texto para a UI.

const MAX_PREVIEW = 500;

// Colapsa espaços em branco (incl. quebras de linha) numa única linha e apara,
// limitando o comprimento para render barato. Espelha o _preview do picker antigo.
//
// O corte é por *code point* (via Array.from), não por unidade UTF-16: fatiar
// com slice() partia um par surrogate no limite (ex.: um emoji), deixando um
// surrogate solitário que renderiza como '�'. Aqui um caractere multi-byte no
// limite é descartado inteiro, nunca partido.
export function preview(text) {
    const collapsed = String(text).replace(/\s+/g, ' ').trim();
    const points = Array.from(collapsed);
    return points.length > MAX_PREVIEW
        ? points.slice(0, MAX_PREVIEW).join('')
        : collapsed;
}
