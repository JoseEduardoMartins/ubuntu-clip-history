// Clip History — extensão do GNOME Shell.
//
// Backend: GPaste (via D-Bus). UI: popup St. Pinos: JSON local durável.
// Atalho Super+V abre o picker; escolher um item põe no clipboard (GPaste.Add)
// e injeta Ctrl+V no app anterior via dispositivo virtual do Clutter.

import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { GPaste } from './gpaste.js';
import { Picker, POPUP_WIDTH } from './picker.js';
import { computePosition } from './position.js';
import {
    pinsPath, loadPins, savePins, addPin, removePin, isPinned, mergeEntries,
} from './pins.js';

const PASTE_DELAY_MS = 90; // espera o foco voltar ao app antes do Ctrl+V

export default class ClipHistoryExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._pinsPath = pinsPath();
        this._pins = loadPins(this._pinsPath);
        this._picker = null;
        this._grab = null;
        this._pasteTimeout = 0;

        // GPaste isolado num try/catch: se o daemon não subir, o enable() ainda
        // termina (o atalho registra) em vez de deixar a extensão em ERROR — que
        // no Wayland só se recupera com logout.
        this._connectGPaste();

        Main.wm.addKeybinding(
            'toggle-clip-history', this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._toggle());
    }

    disable() {
        Main.wm.removeKeybinding('toggle-clip-history');
        this._close();
        if (this._pasteTimeout) {
            GLib.source_remove(this._pasteTimeout);
            this._pasteTimeout = 0;
        }
        if (this._vdevice) {
            this._vdevice = null;
        }
        if (this._gpaste) {
            this._gpaste.destroy();
            this._gpaste = null;
        }
        this._settings = null;
    }

    // Cria o wrapper do GPaste sem derrubar o enable() se o daemon falhar.
    // Retorna true se conectou. Idempotente: pode ser chamado de novo ao abrir.
    _connectGPaste() {
        if (this._gpaste)
            return true;
        try {
            this._gpaste = new GPaste();
            this._gpaste.connectUpdate(() => this._refresh());
            return true;
        } catch (e) {
            logError(e, 'clip-history: GPaste indisponível no enable()');
            this._gpaste = null;
            return false;
        }
    }

    _toggle() {
        if (this._picker)
            this._close();
        else
            this._open();
    }

    _open() {
        const picker = new Picker();
        picker.connect('chosen', (_p, content) => this._onChosen(content));
        picker.connect('pin-toggled', (_p, content) => this._onPinToggled(content));
        picker.connect('deleted', (_p, uuid, content) => this._onDeleted(uuid, content));
        picker.connect('clear-all', () => this._onClearAll());
        picker.connect('dismissed', () => this._close());

        Main.layoutManager.uiGroup.add_child(picker);
        this._picker = picker;

        // O popup abre e recebe foco na hora; a leitura do histórico é
        // assíncrona (não bloqueia o compositor) e posiciona quando chega.
        this._grab = Main.pushModal(picker, { actionMode: Shell.ActionMode.NORMAL });
        picker.grabFocus();
        this._loadEntries(true);
    }

    _close() {
        if (!this._picker)
            return;
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }
        this._picker.destroy();
        this._picker = null;
    }

    // `position` só no primeiro load (ao abrir): aí a altura já reflete os
    // itens. Nos refreshes ao vivo não reposiciona, pra não pular o popup.
    async _loadEntries(position = false) {
        if (!this._picker)
            return;
        // Tenta (re)conectar caso o GPaste não estivesse pronto no enable().
        this._connectGPaste();
        let history = [];
        try {
            history = this._gpaste ? await this._gpaste.getHistory() : [];
        } catch (e) {
            logError(e, 'clip-history: falha ao ler o histórico do GPaste');
        }
        if (!this._picker) // fechou enquanto carregava
            return;
        this._picker.setEntries(mergeEntries(this._pins, history));
        if (position)
            this._position();
    }

    _refresh() {
        if (this._picker)
            this._loadEntries();
    }

    _position() {
        const monitor = Main.layoutManager.currentMonitor;
        const workArea = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
        const [, natH] = this._picker.get_preferred_height(POPUP_WIDTH);
        const maxH = Math.floor(workArea.height * 0.7);
        const popup = { width: POPUP_WIDTH, height: Math.min(natH, maxH) };
        this._picker.height = popup.height;

        // TODO(spike caret): quando o caret via IBus estiver pronto, passar o
        // retângulo aqui. Por ora, sempre canto inferior direito.
        const { x, y } = computePosition({ caret: null, workArea, popup });
        this._picker.set_position(x, y);
    }

    async _onChosen(content) {
        // Espera o Add concluir (clipboard já dono) antes de fechar e injetar
        // o Ctrl+V — senão a colagem correria contra o set do clipboard.
        try {
            if (this._gpaste)
                await this._gpaste.add(content);   // vira o clipboard + sobe ao topo
        } catch (e) {
            logError(e, 'clip-history: falha no Add do GPaste');
        }
        this._close();
        this._schedulePaste();
    }

    _onPinToggled(content) {
        this._pins = isPinned(this._pins, content)
            ? removePin(this._pins, content)
            : addPin(this._pins, content);
        savePins(this._pinsPath, this._pins);
        this._refresh();
    }

    async _onDeleted(uuid, content) {
        // Remove o pino já (local, imediato); o GPaste some via Delete async.
        if (isPinned(this._pins, content)) {
            this._pins = removePin(this._pins, content);
            savePins(this._pinsPath, this._pins);
        }
        try {
            if (uuid && this._gpaste)
                await this._gpaste.delete(uuid);
        } catch (e) {
            logError(e, 'clip-history: falha no Delete do GPaste');
        }
        this._refresh();
    }

    async _onClearAll() {
        this._pins = [];
        savePins(this._pinsPath, this._pins);
        try {
            if (this._gpaste)
                await this._gpaste.empty();
        } catch (e) {
            logError(e, 'clip-history: falha ao limpar o GPaste');
        }
        this._refresh();
    }

    // --- Auto-colar via dispositivo virtual do Clutter ---------------------

    _schedulePaste() {
        this._pasteTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, PASTE_DELAY_MS, () => {
            this._sendCtrlV();
            this._pasteTimeout = 0;
            return GLib.SOURCE_REMOVE;
        });
    }

    _sendCtrlV() {
        if (!this._vdevice) {
            const seat = Clutter.get_default_backend().get_default_seat();
            this._vdevice = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        }
        const t = () => global.get_current_time() * 1000;
        const P = Clutter.KeyState.PRESSED;
        const R = Clutter.KeyState.RELEASED;
        this._vdevice.notify_keyval(t(), Clutter.KEY_Control_L, P);
        this._vdevice.notify_keyval(t(), Clutter.KEY_v, P);
        this._vdevice.notify_keyval(t(), Clutter.KEY_v, R);
        this._vdevice.notify_keyval(t(), Clutter.KEY_Control_L, R);
    }
}
