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
    // `opts.call(method, params) -> Promise<variant>` permite injetar a camada
    // D-Bus nos testes (sem sessão/daemon reais); `opts.proxy` é um duble
    // opcional para connectUpdate/destroy. Sem opts, sobe o proxy real —
    // caminho de produção, comportamento inalterado.
    constructor({ call, proxy } = {}) {
        this._updateId = 0;
        // Cache uuid -> { kind, imagePath }: o kind de um item nunca muda, então
        // só consultamos uuids novos a cada refresh (evita N chamadas repetidas).
        this._meta = new Map();

        if (call) {
            this._call = call;      // instância sobrepõe o método de prototype
            this._proxy = proxy ?? null;
            return;
        }

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
    // Leitura barata: NÃO enriquece kind/imagePath aqui (antes disparava uma
    // chamada por uuid — até ~200 em paralelo com muitas imagens, antes da
    // primeira pintura). O kind/imagePath é resolvido sob demanda, por linha,
    // via getMeta(uuid). Aqui só podamos o cache do que saiu do histórico.
    async getHistory() {
        const res = await this._call('GetHistory', null);
        const [items] = res.deepUnpack(); // a(ss): [uuid, content]

        // Poda o cache: mantém só os uuids ainda presentes no histórico.
        const live = new Set(items.map(([uuid]) => uuid));
        for (const uuid of this._meta.keys())
            if (!live.has(uuid))
                this._meta.delete(uuid);

        // Enriquece com o meta JÁ cacheado (custo zero: só lookup no Map). No
        // refresh ao vivo a linha nasce direto como imagem/senha, sem piscar
        // texto e re-upgradar. Uuids ainda não resolvidos saem só uuid+content
        // e a UI resolve sob demanda (getMeta) como antes.
        return items.map(([uuid, content]) => {
            const meta = this._meta.get(uuid);
            return meta
                ? { uuid, content, kind: meta.kind, imagePath: meta.imagePath }
                : { uuid, content };
        });
    }

    // Descobre kind (e, se imagem, o caminho do arquivo) de um uuid e cacheia.
    // Chamado sob demanda pela UI (lazy, uma linha por vez); o kind de um item
    // nunca muda, então o resultado é memorizado em `this._meta`. Qualquer falha
    // cai em 'text' — num GPaste que não exponha GetElementKind, degrada pro
    // texto. -> { kind, imagePath }.
    async getMeta(uuid) {
        if (this._meta.has(uuid))
            return this._meta.get(uuid);
        let kind = 'text';
        let imagePath = null;
        try {
            const res = await this._call(
                'GetElementKind', new GLib.Variant('(s)', [uuid]));
            const [raw] = res.deepUnpack();
            kind = String(raw || 'Text').toLowerCase();
            if (kind === 'image')
                imagePath = await this._getRawElement(uuid);
        } catch {
            kind = 'text';   // GPaste sem GetElementKind: trata como texto
            imagePath = null;
        }
        const meta = { kind, imagePath };
        this._meta.set(uuid, meta);
        return meta;
    }

    // Set dos `content` do histórico dado cujo uuid JÁ está cacheado como
    // senha (kind==='password'). Só consulta o cache local — nunca dispara
    // D-Bus. Serve para expurgar pinos que o GPaste passou a marcar como senha
    // (um segredo não pode persistir como pino em texto puro). Itens ainda não
    // resolvidos simplesmente não entram — a limpeza imediata da UI cobre esses.
    passwordContents(history) {
        const set = new Set();
        for (const { uuid, content } of history) {
            const meta = this._meta.get(uuid);
            if (meta && meta.kind === 'password')
                set.add(content);
        }
        return set;
    }

    async _getRawElement(uuid) {
        const res = await this._call('GetRawElement', new GLib.Variant('(s)', [uuid]));
        const [value] = res.deepUnpack();
        return value || null;
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

    // Recopia um elemento existente (texto OU imagem) pro clipboard, por uuid.
    async select(uuid) {
        await this._call('Select', new GLib.Variant('(s)', [uuid]));
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
