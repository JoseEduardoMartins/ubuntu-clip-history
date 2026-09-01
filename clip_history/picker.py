import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Adw", "1")
from gi.repository import Adw, Gdk, Gtk, Pango  # noqa: E402

from clip_history import paste, storage  # noqa: E402

# Cap só de segurança: evita medir/renderizar labels gigantes (o histórico
# aceita até 100 KB). O corte VISUAL com "…" fica por conta do Pango, por pixel,
# de acordo com a largura disponível — ver Gtk.Label.set_ellipsize no _populate.
_MAX_PREVIEW_CHARS = 500

# Tamanho da janela do picker.
_WINDOW_WIDTH = 600
_WINDOW_HEIGHT = 500


def _preview(text: str) -> str:
    return " ".join(text.split())[:_MAX_PREVIEW_CHARS]


class PickerWindow(Adw.ApplicationWindow):
    def __init__(self, app, entries):
        super().__init__(application=app, title="clip-history")
        self.entries = entries
        self.visible_entries = []
        self.index = 0
        # Tamanho fixo da janela; a largura é o que faz o texto longo ganhar "…".
        self.set_default_size(_WINDOW_WIDTH, _WINDOW_HEIGHT)
        # Fecha ao clicar fora (perder o foco). Só depois de ter ganhado foco ao
        # menos uma vez, e nunca enquanto o diálogo de confirmação está aberto.
        self._was_active = False
        self._suppress_close = False
        self.connect("notify::is-active", self._on_active_changed)

        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        self.set_content(box)

        header = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        header.set_margin_top(8)
        header.set_margin_bottom(8)
        header.set_margin_start(8)
        header.set_margin_end(8)

        self.search = Gtk.SearchEntry(hexpand=True)
        self.search.set_placeholder_text("Buscar…")
        self.search.connect("search-changed", self._on_search)
        header.append(self.search)

        clear_btn = Gtk.Button(label="Limpar tudo")
        clear_btn.set_tooltip_text("Remove todos os itens do histórico")
        clear_btn.set_valign(Gtk.Align.CENTER)
        clear_btn.connect("clicked", self._on_clear_clicked)
        header.append(clear_btn)
        box.append(header)

        self.listbox = Gtk.ListBox()
        self.listbox.set_selection_mode(Gtk.SelectionMode.SINGLE)
        self.listbox.connect("row-activated", self._on_row_activated)
        scroller = Gtk.ScrolledWindow()
        scroller.set_vexpand(True)
        # Sem rolagem horizontal: a linha é limitada à largura da janela, o que
        # faz o ellipsize do label cortar o texto com "…".
        scroller.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        scroller.set_child(self.listbox)
        box.append(scroller)

        controller = Gtk.EventControllerKey()
        controller.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
        controller.connect("key-pressed", self._on_key)
        self.add_controller(controller)

        self._populate("")

    def _populate(self, query):
        child = self.listbox.get_first_child()
        while child is not None:
            nxt = child.get_next_sibling()
            self.listbox.remove(child)
            child = nxt

        q = query.lower()
        self.visible_entries = [e for e in self.entries if q in e.content.lower()]
        for i, entry in enumerate(self.visible_entries):
            row = Gtk.ListBoxRow()
            hbox = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL)
            label = Gtk.Label(xalign=0, hexpand=True)
            prefix = f"{i + 1}. " if i < 9 else ""
            label.set_text(prefix + _preview(entry.content))
            # "…" por pixel quando o texto não cabe na largura da janela.
            label.set_ellipsize(Pango.EllipsizeMode.END)
            label.set_single_line_mode(True)
            label.set_margin_top(6)
            label.set_margin_bottom(6)
            label.set_margin_start(10)
            label.set_margin_end(6)
            hbox.append(label)

            pin_btn = Gtk.Button(
                icon_name="starred-symbolic" if entry.pinned
                else "non-starred-symbolic"
            )
            pin_btn.set_tooltip_text("Desafixar" if entry.pinned else "Fixar")
            pin_btn.add_css_class("flat")
            pin_btn.set_valign(Gtk.Align.CENTER)
            pin_btn.connect("clicked", self._on_pin_clicked, entry)
            hbox.append(pin_btn)

            del_btn = Gtk.Button(icon_name="window-close-symbolic")
            del_btn.set_tooltip_text("Excluir este item")
            del_btn.add_css_class("flat")
            del_btn.set_valign(Gtk.Align.CENTER)
            del_btn.set_margin_end(6)
            del_btn.connect("clicked", self._on_delete_clicked, entry)
            hbox.append(del_btn)

            row.set_child(hbox)
            self.listbox.append(row)
        self._select(0)

    def _refresh(self):
        self.entries = storage.list()
        self._populate(self.search.get_text())

    def _select(self, i):
        if not self.visible_entries:
            self.index = 0
            return
        self.index = max(0, min(len(self.visible_entries) - 1, i))
        row = self.listbox.get_row_at_index(self.index)
        if row is not None:
            self.listbox.select_row(row)
            row.grab_focus()
            self.search.grab_focus()  # devolve o foco pra continuar digitando

    def _choose(self, i):
        if 0 <= i < len(self.visible_entries):
            content = self.visible_entries[i].content
            self.close()
            paste.paste(content)

    def _delete_entry(self, entry):
        storage.delete(entry.id)
        self._refresh()

    def _toggle_pin(self, entry):
        storage.set_pinned(entry.id, not entry.pinned)
        self._refresh()

    def _on_search(self, _entry):
        self._populate(self.search.get_text())

    def _on_row_activated(self, _listbox, row):
        self._choose(row.get_index())

    def _on_delete_clicked(self, _button, entry):
        self._delete_entry(entry)

    def _on_pin_clicked(self, _button, entry):
        self._toggle_pin(entry)

    def _on_active_changed(self, *_args):
        # Fecha ao perder o foco (clicar fora), mas só depois de ter recebido
        # foco ao menos uma vez e nunca com o diálogo de confirmação aberto
        # (o diálogo tira o foco da janela e não pode fechá-la por baixo).
        if self.is_active():
            self._was_active = True
        elif self._was_active and not self._suppress_close:
            self.close()

    def _on_clear_clicked(self, _button):
        self._suppress_close = True
        dialog = Adw.MessageDialog.new(
            self,
            "Limpar todo o histórico?",
            "Isso remove todos os itens salvos. Não dá para desfazer.",
        )
        dialog.add_response("cancel", "Cancelar")
        dialog.add_response("clear", "Limpar")
        dialog.set_response_appearance(
            "clear", Adw.ResponseAppearance.DESTRUCTIVE
        )
        dialog.set_default_response("cancel")
        dialog.set_close_response("cancel")
        dialog.connect("response", self._on_clear_response)
        dialog.present()

    def _on_clear_response(self, _dialog, response):
        # Reativa o fechar-ao-perder-foco. O foco volta pra janela do picker,
        # então is-active volta a True e o _was_active continua válido.
        self._suppress_close = False
        if response == "clear":
            storage.clear()
            self._refresh()

    def _on_key(self, _controller, keyval, _keycode, state):
        if keyval == Gdk.KEY_Escape:
            self.close()
            return True
        if keyval in (Gdk.KEY_Return, Gdk.KEY_KP_Enter):
            self._choose(self.index)
            return True
        if keyval in (Gdk.KEY_Delete, Gdk.KEY_KP_Delete):
            if 0 <= self.index < len(self.visible_entries):
                self._delete_entry(self.visible_entries[self.index])
            return True
        if state & Gdk.ModifierType.CONTROL_MASK and keyval in (
            Gdk.KEY_p, Gdk.KEY_P
        ):
            if 0 <= self.index < len(self.visible_entries):
                self._toggle_pin(self.visible_entries[self.index])
            return True
        if keyval == Gdk.KEY_Down:
            self._select(self.index + 1)
            return True
        if keyval == Gdk.KEY_Up:
            self._select(self.index - 1)
            return True
        if state & Gdk.ModifierType.ALT_MASK:
            for n in range(1, 10):
                if keyval == getattr(Gdk, f"KEY_{n}"):
                    self._choose(n - 1)
                    return True
        return False


class PickerApp(Adw.Application):
    def __init__(self):
        super().__init__(application_id="com.joseeduardomartins.cliphistory")
        self.connect("activate", self._on_activate)

    def _on_activate(self, app):
        entries = storage.list()
        window = PickerWindow(app, entries)
        window.present()


def show() -> None:
    Adw.init()
    app = PickerApp()
    app.run([])
