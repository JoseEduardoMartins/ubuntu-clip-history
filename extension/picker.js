// UI do picker (St). Um popup modal com título, busca, lista rolável de itens
// (com pino e excluir) e "Limpar tudo". Navegação por teclado.
//
// Não faz D-Bus nem posicionamento: emite sinais e o extension.js orquestra.

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';

import { preview } from './text.js';
import { filterEntries, clampSelected, nextSelected, keyAction } from './pickerLogic.js';

export const POPUP_WIDTH = 420;
const THUMB_SIZE = 48; // lado da miniatura de imagem, em px lógicos

export const Picker = GObject.registerClass({
    Signals: {
        'chosen': { param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING] },   // uuid(''=nenhum), content
        'pin-toggled': { param_types: [GObject.TYPE_STRING] },                   // content
        'deleted': { param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING] },  // uuid(''=nenhum), content
        'clear-all': {},
        'dismissed': {},
    },
}, class Picker extends St.BoxLayout {
    _init() {
        super._init({
            style_class: 'clip-history',
            vertical: true,
            width: POPUP_WIDTH,
            reactive: true,
            can_focus: true,
        });

        this._entries = [];   // entradas visíveis (após filtro)
        this._selected = 0;

        this._buildHeader();
        this._buildSearch();
        this._buildList();
        this._buildFooter();

        this.connect('key-press-event', (_a, event) => this._onKeyPress(event));
        this.connect('button-press-event', (_a, event) => this._onButtonPress(event));
    }

    // Como o picker é modal (pushModal), cliques fora dos seus limites também
    // chegam aqui. Se o clique cair fora do popup, fecha; dentro, deixa passar
    // para o filho (busca, linha, botões).
    _onButtonPress(event) {
        const [x, y] = event.get_coords();
        const [ax, ay] = this.get_transformed_position();
        const [aw, ah] = this.get_transformed_size();
        const inside = x >= ax && x <= ax + aw && y >= ay && y <= ay + ah;
        if (!inside) {
            this.emit('dismissed');
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _buildHeader() {
        const header = new St.BoxLayout({ style_class: 'clip-history-header' });
        header.add_child(new St.Label({
            style_class: 'clip-history-title',
            text: 'Área de Transferência',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        const close = new St.Button({
            style_class: 'clip-history-icon-button',
            child: new St.Icon({ icon_name: 'window-close-symbolic', icon_size: 16 }),
        });
        close.connect('clicked', () => this.emit('dismissed'));
        header.add_child(close);
        this.add_child(header);
    }

    _buildSearch() {
        this._search = new St.Entry({
            style_class: 'clip-history-search',
            hint_text: 'Buscar…',
            can_focus: true,
            x_expand: true,
        });
        this._search.clutter_text.connect('text-changed', () => this._applyFilter());
        // O St.Entry consome o Return (emite 'activate' e para a propagação),
        // então o Enter nunca chega ao _onKeyPress. Tratamos aqui.
        this._search.clutter_text.connect('activate', () => this._choose(this._selected));
        this.add_child(this._search);
    }

    _buildList() {
        this._scroll = new St.ScrollView({
            style_class: 'clip-history-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            y_expand: true,
        });
        this._list = new St.BoxLayout({ vertical: true, style_class: 'clip-history-list' });
        this._scroll.add_child(this._list);
        this.add_child(this._scroll);
    }

    _buildFooter() {
        const footer = new St.BoxLayout({ style_class: 'clip-history-footer' });
        const clear = new St.Button({
            style_class: 'clip-history-clear',
            label: 'Limpar tudo',
            x_expand: true,
        });
        clear.connect('clicked', () => this.emit('clear-all'));
        footer.add_child(clear);
        this.add_child(footer);
    }

    // Chamado pelo extension com [{ content, uuid, pinned }].
    setEntries(all) {
        this._all = all;
        this._applyFilter();
        this.grabFocus();
    }

    grabFocus() {
        this._search.grab_key_focus();
    }

    _applyFilter() {
        this._entries = filterEntries(this._all, this._search.get_text());
        this._selected = clampSelected(this._selected, this._entries.length);
        this._render();
    }

    _render() {
        this._list.destroy_all_children();
        this._rows = [];

        if (this._entries.length === 0) {
            this._list.add_child(new St.Label({
                style_class: 'clip-history-empty',
                text: 'Nada aqui ainda.',
            }));
            return;
        }

        this._entries.forEach((entry, i) => {
            const row = new St.BoxLayout({
                style_class: 'clip-history-row',
                reactive: true,
                track_hover: true,
            });
            if (i === this._selected)
                row.add_style_class_name('selected');

            const prefix = i < 9 ? `${i + 1}. ` : '';
            if (entry.kind === 'image' && entry.imagePath)
                row.add_child(this._imageContent(prefix, entry.imagePath, entry.content));
            else
                row.add_child(this._textContent(prefix, entry.content));

            // Imagens não são fixáveis (seguem o cap do GPaste); ★ só em texto.
            if (entry.kind !== 'image') {
                const pin = new St.Button({
                    style_class: 'clip-history-icon-button',
                    child: new St.Icon({ icon_name: 'view-pin-symbolic', icon_size: 14 }),
                    opacity: entry.pinned ? 255 : 90,
                });
                pin.connect('clicked', () => this.emit('pin-toggled', entry.content));
                row.add_child(pin);
            }

            const del = new St.Button({
                style_class: 'clip-history-icon-button',
                child: new St.Icon({ icon_name: 'window-close-symbolic', icon_size: 14 }),
            });
            del.connect('clicked', () => this.emit('deleted', entry.uuid ?? '', entry.content));
            row.add_child(del);

            const click = new Clutter.ClickAction();
            click.connect('clicked', () => this._choose(i));
            row.add_action(click);

            this._list.add_child(row);
            this._rows.push(row);
        });
    }

    _textContent(prefix, content) {
        const label = new St.Label({
            style_class: 'clip-history-row-label',
            text: prefix + preview(content),
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        label.clutter_text.single_line_mode = true;
        label.clutter_text.ellipsize = 3; // Pango.EllipsizeMode.END
        return label;
    }

    // Linha de imagem: miniatura (via TextureCache, async/cacheado) + legenda
    // (o display string do GPaste, ex.: "[Image, 1920 x 1080 (…)]").
    _imageContent(prefix, imagePath, content) {
        const box = new St.BoxLayout({
            style_class: 'clip-history-row-label',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const thumb = St.TextureCache.get_default().load_file_async(
            Gio.File.new_for_path(imagePath), THUMB_SIZE, THUMB_SIZE, scale, 1);
        // load_file_async pode devolver um Clutter.Actor puro (sem style_class);
        // envolve num St.Bin pra garantir o estilo (borda/margem) da miniatura.
        const thumbBin = new St.Bin({
            style_class: 'clip-history-thumb',
            child: thumb,
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(thumbBin);

        const caption = new St.Label({
            text: prefix + preview(content),
            y_align: Clutter.ActorAlign.CENTER,
        });
        caption.clutter_text.single_line_mode = true;
        caption.clutter_text.ellipsize = 3; // Pango.EllipsizeMode.END
        box.add_child(caption);
        return box;
    }

    _choose(i) {
        if (i >= 0 && i < this._entries.length) {
            const e = this._entries[i];
            this.emit('chosen', e.uuid ?? '', e.content);
        }
    }

    _move(delta) {
        if (this._entries.length === 0)
            return;
        this._selected = nextSelected(this._selected, delta, this._entries.length);
        this._render();
    }

    _onKeyPress(event) {
        const action = keyAction(event.get_key_symbol(), event.get_state(), KEY_MAP);

        switch (action.type) {
        case 'dismiss':
            this.emit('dismissed');
            return Clutter.EVENT_STOP;
        case 'choose-selected':
            this._choose(this._selected);
            return Clutter.EVENT_STOP;
        case 'choose-index':
            this._choose(action.index);
            return Clutter.EVENT_STOP;
        case 'move':
            this._move(action.delta);
            return Clutter.EVENT_STOP;
        case 'delete-selected':
            if (this._entries[this._selected]) {
                const e = this._entries[this._selected];
                this.emit('deleted', e.uuid ?? '', e.content);
            }
            return Clutter.EVENT_STOP;
        case 'pin-selected': {
            const e = this._entries[this._selected];
            if (e && e.kind !== 'image')   // imagens não são fixáveis
                this.emit('pin-toggled', e.content);
            return Clutter.EVENT_STOP;
        }
        default:
            return Clutter.EVENT_PROPAGATE; // deixa digitar na busca
        }
    }
});

// As constantes do Clutter que a lógica pura (keyAction) precisa. Mantê-las
// juntas aqui deixa claro o contrato entre picker.js e pickerLogic.js.
const KEY_MAP = {
    Escape: Clutter.KEY_Escape,
    Return: Clutter.KEY_Return,
    KP_Enter: Clutter.KEY_KP_Enter,
    Up: Clutter.KEY_Up,
    Down: Clutter.KEY_Down,
    Delete: Clutter.KEY_Delete,
    p: Clutter.KEY_p,
    P: Clutter.KEY_P,
    KEY_1: Clutter.KEY_1,
    KEY_9: Clutter.KEY_9,
    CONTROL_MASK: Clutter.ModifierType.CONTROL_MASK,
    MOD1_MASK: Clutter.ModifierType.MOD1_MASK,
};
