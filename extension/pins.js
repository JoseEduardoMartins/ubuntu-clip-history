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

// Expurga do store qualquer pino cujo conteúdo o GPaste passou a marcar como
// senha. `passwordContents` é um Set de strings. Um item pode ser fixado como
// texto e só depois virar Password (ex.: o gerenciador de senhas o reconhece);
// quando isso é descoberto, ele não pode continuar persistido em texto puro em
// pins.json. Sempre devolve uma cópia nova (imutável), como os outros helpers.
export function dropKnownPasswords(pins, passwordContents) {
    if (!passwordContents || passwordContents.size === 0)
        return pins.slice();
    return pins.filter(p => !passwordContents.has(p.content));
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
        if (!Array.isArray(data))
            return [];
        // Descarta entradas com shape inválido: um pins.json corrompido/mexido à
        // mão não pode injetar `undefined` nas comparações de content (isPinned,
        // mergeEntries) nem persistir lixo de volta no próximo savePins.
        return data.filter(p => p && typeof p.content === 'string');
    } catch (_e) {
        // arquivo inexistente ou JSON inválido -> começa vazio
        return [];
    }
}

// Escrita ASSÍNCRONA (não bloqueia o compositor): o processo do gnome-shell não
// deve fazer I/O de disco no seu loop principal. Devolve uma Promise que SEMPRE
// resolve — erros são logados, nunca rejeitados — para que os chamadores possam
// disparar sem `await` (fire-and-forget) sem gerar unhandled rejection. Os testes
// aguardam a Promise antes de reler. O mkdir do diretório-pai segue síncrono
// (barato, e garante o destino antes do write). Cada save grava o estado
// completo e o REPLACE_DESTINATION é atômico (temp + rename): dois writes
// sobrepostos terminam em last-write-wins com o arquivo sempre íntegro.
export function savePins(path, pins) {
    const file = Gio.File.new_for_path(path);
    const parent = file.get_parent();
    if (parent)
        GLib.mkdir_with_parents(parent.get_path(), 0o755);
    const text = JSON.stringify(pins, null, 2);
    const bytes = GLib.Bytes.new(_encoder.encode(text));
    return new Promise(resolve => {
        file.replace_contents_bytes_async(
            bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null,
            (f, res) => {
                try {
                    f.replace_contents_finish(res);
                } catch (e) {
                    // logError existe no gnome-shell; nos testes (gjs) cai no console.
                    (globalThis.logError ?? console.error)(
                        e, 'clip-history: falha ao salvar pins.json');
                }
                resolve();
            });
    });
}
