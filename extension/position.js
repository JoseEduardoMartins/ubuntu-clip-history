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
