// Store de favoritos (pinos) — durável, independente do cap do GPaste.
//
// A lógica de merge/dedup é pura (testável). A persistência é um JSON simples
// em ~/.local/share/clip-history/pins.json, lido/escrito via Gio.
//
// Formato do pino: { content: string, created_at: string }

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const _decoder = new TextDecoder('utf-8');
const _encoder = new TextEncoder();

// --- Lógica pura -----------------------------------------------------------

export function isPinned(pins, content) {
    return pins.some(p => p.content === content);
}

// Só texto é fixável. Imagens seguem o cap do GPaste (miniatura vive só no
// histórico); senhas nunca devem virar um pino durável em disco. Entradas sem
// `kind` são tratadas como texto (default defensivo).
export function isPinnable(entry) {
    return (entry?.kind ?? 'text') === 'text';
}

export function addPin(pins, content) {
    if (isPinned(pins, content))
        return pins.slice();
    return [{ content, created_at: new Date().toISOString() }, ...pins];
}

export function removePin(pins, content) {
    return pins.filter(p => p.content !== content);
}

// Junta pinos (no topo, na ordem do store) com o histórico do GPaste,
// deduplicando o histórico contra os pinos. Cada pino herda o uuid do item
// correspondente no histórico (se existir) para permitir Delete/Select.
// Propaga `kind`/`imagePath` das entradas do histórico; pinos são só texto.
export function mergeEntries(pins, history) {
    const pinnedContents = new Set(pins.map(p => p.content));

    const pinnedEntries = pins.map(p => {
        const match = history.find(h => h.content === p.content);
        return {
            content: p.content,
            uuid: match ? match.uuid : null,
            pinned: true,
            kind: 'text',
            imagePath: null,
        };
    });

    const historyEntries = history
        .filter(h => !pinnedContents.has(h.content))
        .map(h => ({
            content: h.content,
            uuid: h.uuid,
            pinned: false,
            kind: h.kind ?? 'text',
            imagePath: h.imagePath ?? null,
        }));

    return [...pinnedEntries, ...historyEntries];
}

// --- Persistência ----------------------------------------------------------

export function pinsPath() {
    return GLib.build_filenamev([GLib.get_user_data_dir(), 'clip-history', 'pins.json']);
}

export function loadPins(path) {
    const file = Gio.File.new_for_path(path);
    try {
        const [ok, bytes] = file.load_contents(null);
        if (!ok)
            return [];
        const data = JSON.parse(_decoder.decode(bytes));
        return Array.isArray(data) ? data : [];
    } catch (_e) {
        // arquivo inexistente ou JSON inválido -> começa vazio
        return [];
    }
}

export function savePins(path, pins) {
    const file = Gio.File.new_for_path(path);
    const parent = file.get_parent();
    if (parent)
        GLib.mkdir_with_parents(parent.get_path(), 0o755);
    const text = JSON.stringify(pins, null, 2);
    file.replace_contents(
        _encoder.encode(text), null, false,
        Gio.FileCreateFlags.REPLACE_DESTINATION, null);
}
