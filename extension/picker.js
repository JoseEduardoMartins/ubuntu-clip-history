// UI do picker (St). Um popup modal com título, busca, lista rolável de itens
// (com pino e excluir) e "Limpar tudo". Navegação por teclado.
//
// Não faz D-Bus nem posicionamento: emite sinais e o extension.js orquestra.

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';

import { preview } from './text.js';
import { filterEntries, clampSelected, nextSelected, keyAction } from './pickerLogic.js';

export const POPUP_WIDTH = 420;
const THUMB_SIZE = 48; // lado da miniatura de imagem, em px lógicos
const PAGE_JUMP = 10;  // linhas puladas por PageUp/PageDown

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

    // Chamado pelo extension com [{ content, uuid, pinned }] e um resolver
    // opcional `resolveMeta(uuid) -> Promise<{kind, imagePath}>`. O resolver
    // é injetado (o picker não conhece o gpaste): as linhas nascem como texto
    // e cada uma vira imagem quando seus metadados chegam (lazy por linha).
    setEntries(all, { resolveMeta } = {}) {
        this._all = all;
        if (resolveMeta)
            this._resolveMeta = resolveMeta;
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
        // Token de render: invalida continuações de resolveMeta pendentes quando
        // a lista é reconstruída (filtro/refresh), pra não fazer upgrade numa
        // linha que já foi destruída.
        this._renderToken = (this._renderToken ?? 0) + 1;
        const token = this._renderToken;

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
            const known = entry.kind === 'image' && entry.imagePath;

            // Conteúdo: imagem se já conhecida; senão texto (que pode virar
            // imagem depois via resolveMeta). Guarda o ator pra poder trocar.
            const content = known
                ? this._imageContent(prefix, entry.imagePath, entry.content)
                : this._textContent(prefix, entry.content);
            row.add_child(content);
            row._contentActor = content;

            // Imagens não são fixáveis (seguem o cap do GPaste); ★ só em texto.
            if (!known) {
                const pin = new St.Button({
                    style_class: 'clip-history-icon-button',
                    child: new St.Icon({ icon_name: 'view-pin-symbolic', icon_size: 14 }),
                    opacity: entry.pinned ? 255 : 90,
                });
                pin.connect('clicked', () => this.emit('pin-toggled', entry.content));
                row.add_child(pin);
                row._pinButton = pin;
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

            // Lazy: descobre kind/imagePath só agora, por linha. Se for imagem,
            // faz upgrade da linha de texto (sem bloquear a pintura inicial).
            if (!known && entry.uuid && this._resolveMeta) {
                this._resolveMeta(entry.uuid).then(meta => {
                    if (token !== this._renderToken)   // lista já foi reconstruída
                        return;
                    if (!meta || meta.kind !== 'image' || !meta.imagePath)
                        return;
                    this._upgradeToImage(row, entry, prefix, meta.imagePath);
                }).catch(() => {});
            }
        });
    }

    // Troca uma linha de texto pela variante imagem (miniatura + legenda) e
    // remove o botão de pino. Muta a `entry` (kind/imagePath) para que ações de
    // teclado (Ctrl+P) e futuros re-renders já a tratem como imagem, e para
    // cachear a descoberta em `this._all`.
    _upgradeToImage(row, entry, prefix, imagePath) {
        entry.kind = 'image';
        entry.imagePath = imagePath;

        if (row._contentActor) {
            row.remove_child(row._contentActor);
            row._contentActor.destroy();
        }
        const img = this._imageContent(prefix, imagePath, entry.content);
        row.insert_child_at_index(img, 0);
        row._contentActor = img;

        if (row._pinButton) {
            row.remove_child(row._pinButton);
            row._pinButton.destroy();
            row._pinButton = null;
        }
    }

    _textContent(prefix, content) {
        const label = new St.Label({
            style_class: 'clip-history-row-label',
            text: prefix + preview(content),
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        label.clutter_text.single_line_mode = true;
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
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

        // Se o PNG do GPaste sumiu (cache limpo, arquivo movido), mostra um
        // ícone de "imagem ausente" em vez de uma miniatura vazia.
        const file = Gio.File.new_for_path(imagePath);
        let thumb;
        if (file.query_exists(null)) {
            const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
            // load_file_async pode devolver um Clutter.Actor puro (sem
            // style_class); envolvemos num St.Bin pro estilo da miniatura.
            thumb = St.TextureCache.get_default().load_file_async(
                file, THUMB_SIZE, THUMB_SIZE, scale, 1);
        } else {
            thumb = new St.Icon({
                icon_name: 'image-missing-symbolic',
                icon_size: THUMB_SIZE,
            });
        }
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
        caption.clutter_text.ellipsize = Pango.EllipsizeMode.END;
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
        this._setSelected(nextSelected(this._selected, delta, this._entries.length));
    }

    // Página pra cima/baixo sem dar a volta (ao contrário do _move): gruda no
    // topo/fim. `dir` é -1 (PageUp) ou +1 (PageDown).
    _page(dir) {
        if (this._entries.length === 0)
            return;
        this._setSelected(
            clampSelected(this._selected + dir * PAGE_JUMP, this._entries.length));
    }

    // Salta pro primeiro/último item (Ctrl+Home / Ctrl+End).
    _jump(to) {
        if (this._entries.length === 0)
            return;
        this._setSelected(to === 'first' ? 0 : this._entries.length - 1);
    }

    // Move a seleção sem reconstruir a lista: só alterna a classe `selected`
    // nas linhas afetadas (antes recriava tudo, re-disparando o load de cada
    // miniatura a cada tecla). Rola a linha nova para a vista.
    _setSelected(index) {
        if (!this._rows || this._rows.length === 0)
            return;
        const prev = this._rows[this._selected];
        if (prev)
            prev.remove_style_class_name('selected');
        this._selected = index;
        const next = this._rows[index];
        if (next) {
            next.add_style_class_name('selected');
            this._scrollToSelected();
        }
    }

    // Garante que a linha selecionada esteja visível dentro do ScrollView.
    _scrollToSelected() {
        const row = this._rows[this._selected];
        if (!row)
            return;
        const adj = this._scroll.vadjustment ??
            this._scroll.get_vscroll_bar?.().adjustment;
        if (!adj)
            return;
        const box = row.get_allocation_box();
        const top = box.y1;
        const bottom = box.y2;
        if (top < adj.value)
            adj.value = top;
        else if (bottom > adj.value + adj.page_size)
            adj.value = bottom - adj.page_size;
    }

    _onKeyPress(event) {
        const action = keyAction(event.get_key_symbol(), event.get_state(), KEY_MAP);

        switch (action.type) {
        case 'dismiss':
            // Esc limpa a busca primeiro (se houver texto); só fecha se vazia.
            if (this._search.get_text()) {
                this._search.set_text('');   // dispara text-changed -> filtro
                return Clutter.EVENT_STOP;
            }
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
        case 'page':
            this._page(action.delta);
            return Clutter.EVENT_STOP;
        case 'jump':
            this._jump(action.to);
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
    Page_Up: Clutter.KEY_Page_Up,
    Page_Down: Clutter.KEY_Page_Down,
    Home: Clutter.KEY_Home,
    End: Clutter.KEY_End,
    Delete: Clutter.KEY_Delete,
    p: Clutter.KEY_p,
    P: Clutter.KEY_P,
    KEY_1: Clutter.KEY_1,
    KEY_9: Clutter.KEY_9,
    CONTROL_MASK: Clutter.ModifierType.CONTROL_MASK,
    MOD1_MASK: Clutter.ModifierType.MOD1_MASK,
};
