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
        // DO_NOT_LOAD_PROPERTIES: não usamos nenhuma property do GPaste, e sem
        // isso o new_sync faria um GetAll síncrono (round-trip que poderia
        // bloquear o compositor na construção).
        this._proxy = Gio.DBusProxy.new_sync(
            bus,
            Gio.DBusProxyFlags.DO_NOT_AUTO_START_AT_CONSTRUCTION |
            Gio.DBusProxyFlags.DO_NOT_LOAD_PROPERTIES,
            null, NAME, PATH, IFACE, null);
        this._updateId = 0;
    }

    // Chamada D-Bus assíncrona embrulhada numa Promise. Usa `call`/`call_finish`
    // (não `call_sync`): uma chamada síncrona no processo do Shell congelaria o
    // compositor inteiro se o daemon do GPaste travasse. Não usamos
    // `Gio._promisify` de propósito — ele altera o prototype global do
    // DBusProxy no gnome-shell; este wrapper fica contido na extensão.
    _call(method, params) {
        return new Promise((resolve, reject) => {
            if (!this._proxy) {
                reject(new Error('GPaste proxy já destruído'));
                return;
            }
            this._proxy.call(
                method, params, Gio.DBusCallFlags.NONE, -1, null,
                (proxy, res) => {
                    try {
                        resolve(proxy.call_finish(res));
                    } catch (e) {
                        reject(e);
                    }
                });
        });
    }

    // -> [{ uuid, content }], mesma ordem do GPaste (mais recente primeiro).
    async getHistory() {
        const res = await this._call('GetHistory', null);
        const [items] = res.deepUnpack(); // a(ss)
        return items.map(([uuid, content]) => ({ uuid, content }));
    }

    async getHistoryName() {
        const res = await this._call('GetHistoryName', null);
        const [name] = res.deepUnpack();
        return name;
    }

    // Põe o texto no clipboard (e no topo do histórico, com dedup do GPaste).
    async add(text) {
        await this._call('Add', new GLib.Variant('(s)', [text]));
    }

    async delete(uuid) {
        await this._call('Delete', new GLib.Variant('(s)', [uuid]));
    }

    async empty() {
        const name = await this.getHistoryName();
        await this._call('EmptyHistory', new GLib.Variant('(s)', [name]));
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
