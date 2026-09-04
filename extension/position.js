// Posicionamento do popup — função pura (sem gi), testável com gjs.
//
// computePosition({ caret, workArea, popup, gap, margin }) -> { x, y }
//   caret:    null | { x, y, width, height }  (retângulo do cursor de texto)
//   workArea: { x, y, width, height }         (área útil do monitor)
//   popup:    { width, height }
//   gap:      espaço entre o caret e o popup
//   margin:   margem das bordas no modo canto-inferior-direito

function clamp(value, min, max) {
    if (max < min)
        return min;
    return Math.min(Math.max(value, min), max);
}

// Normaliza/valida o retângulo cru do caret (vindo de Main.inputMethod).
// Devolve { x, y, width, height } só se for um retângulo plausível de cursor
// de texto; caso contrário null (e o popup cai no canto inferior direito).
export function validCaret(rect) {
    if (!rect || typeof rect !== 'object')
        return null;
    const { x, y, width, height } = rect;
    if (![x, y, width, height].every(Number.isFinite))
        return null;
    if (height <= 0)          // sem altura de linha: não é um caret de texto
        return null;
    if (x === 0 && y === 0 && width === 0 && height === 0)
        return null;          // retângulo zerado = "sem localização"
    return { x, y, width, height };
}

// Índice do monitor cujo retângulo contém o ponto (caret.x, caret.y).
// `monitors` espelha Main.layoutManager.monitors: [{ x, y, width, height }].
// Devolve -1 se nenhum contém o ponto (ou entrada inválida).
export function pickMonitor(caret, monitors) {
    if (!caret || !Array.isArray(monitors))
        return -1;
    return monitors.findIndex(m =>
        caret.x >= m.x && caret.x < m.x + m.width &&
        caret.y >= m.y && caret.y < m.y + m.height);
}

export function computePosition({ caret, workArea, popup, gap = 8, margin = 12 }) {
    const maxX = workArea.x + workArea.width - popup.width;
    const maxY = workArea.y + workArea.height - popup.height;

    if (!caret) {
        return {
            x: workArea.x + workArea.width - popup.width - margin,
            y: workArea.y + workArea.height - popup.height - margin,
        };
    }

    const x = clamp(caret.x, workArea.x, maxX);

    const yBelow = caret.y + caret.height + gap;
    const yAbove = caret.y - popup.height - gap;

    let y;
    if (yBelow + popup.height <= workArea.y + workArea.height)
        y = yBelow;            // cabe abaixo do caret
    else if (yAbove >= workArea.y)
        y = yAbove;            // não cabe abaixo, cabe acima
    else
        y = clamp(yBelow, workArea.y, maxY); // não cabe em lugar nenhum: clamp

    return { x, y };
}
