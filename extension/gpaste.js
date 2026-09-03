// Wrapper fino do D-Bus do GPaste (org.gnome.GPaste2).
//
// A extensão usa o GPaste como backend do histórico: ele já captura e guarda
// o clipboard. Aqui só lemos/mutamos via D-Bus e ouvimos o sinal `Update`.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const NAME = 'org.gnome.GPaste';
const PATH = '/org/gnome/GPaste';
const IFACE = 'org.gnome.GPaste2';

export class GPaste {
    constructor() {
        const bus = Gio.bus_get_sync(Gio.BusType.SESSION, null);
        // NÃO iniciar o GPaste na construção: no login o daemon pode ainda não
        // estar pronto, e o StartServiceByName síncrono dava timeout — isso
        // estourava enable() e deixava a extensão em estado ERROR pela sessão
        // toda. Sem auto-start-at-construction, o proxy sobe o GPaste (serviço
        // systemd habilitado) só na primeira chamada real (getHistory).
        this._proxy = Gio.DBusProxy.new_sync(
            bus, Gio.DBusProxyFlags.DO_NOT_AUTO_START_AT_CONSTRUCTION, null,
            NAME, PATH, IFACE, null);
        this._updateId = 0;
    }

    // -> [{ uuid, content }], mesma ordem do GPaste (mais recente primeiro).
    getHistory() {
        const res = this._proxy.call_sync(
            'GetHistory', null, Gio.DBusCallFlags.NONE, -1, null);
        const [items] = res.deepUnpack(); // a(ss)
        return items.map(([uuid, content]) => ({ uuid, content }));
    }

    getHistoryName() {
        const res = this._proxy.call_sync(
            'GetHistoryName', null, Gio.DBusCallFlags.NONE, -1, null);
        const [name] = res.deepUnpack();
        return name;
    }

    // Põe o texto no clipboard (e no topo do histórico, com dedup do GPaste).
    add(text) {
        this._proxy.call_sync(
            'Add', new GLib.Variant('(s)', [text]),
            Gio.DBusCallFlags.NONE, -1, null);
    }

    delete(uuid) {
        this._proxy.call_sync(
            'Delete', new GLib.Variant('(s)', [uuid]),
            Gio.DBusCallFlags.NONE, -1, null);
    }

    empty() {
        const name = this.getHistoryName();
        this._proxy.call_sync(
            'EmptyHistory', new GLib.Variant('(s)', [name]),
            Gio.DBusCallFlags.NONE, -1, null);
    }

    // Chama `cb` a cada mutação do histórico (ingest, delete, empty, select).
    connectUpdate(cb) {
        this._updateId = this._proxy.connectSignal('Update', () => cb());
    }

    destroy() {
        if (this._updateId) {
            this._proxy.disconnectSignal(this._updateId);
            this._updateId = 0;
        }
        this._proxy = null;
    }
}
