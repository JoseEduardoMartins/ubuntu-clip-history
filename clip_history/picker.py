import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Adw", "1")
from gi.repository import Adw, Gdk, Gtk  # noqa: E402

from clip_history import paste, storage  # noqa: E402


def _preview(text: str) -> str:
    flat = " ".join(text.split())
    return (flat[:80] + "…") if len(flat) > 80 else flat


class PickerWindow(Adw.ApplicationWindow):
    def __init__(self, app, entries):
        super().__init__(application=app, title="clip-history")
        self.entries = entries
        self.visible_entries = []
        self.index = 0
        self.set_default_size(560, 480)

        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        self.set_content(box)

        self.search = Gtk.SearchEntry()
        self.search.set_placeholder_text("Buscar…")
        self.search.set_margin_top(8)
        self.search.set_margin_bottom(8)
        self.search.set_margin_start(8)
        self.search.set_margin_end(8)
        self.search.connect("search-changed", self._on_search)
        box.append(self.search)

        self.listbox = Gtk.ListBox()
        self.listbox.set_selection_mode(Gtk.SelectionMode.SINGLE)
        self.listbox.connect("row-activated", self._on_row_activated)
        scroller = Gtk.ScrolledWindow()
        scroller.set_vexpand(True)
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
            label = Gtk.Label(xalign=0)
            prefix = f"{i + 1}. " if i < 9 else ""
            label.set_text(prefix + _preview(entry.content))
            label.set_margin_top(6)
            label.set_margin_bottom(6)
            label.set_margin_start(10)
            label.set_margin_end(10)
            row.set_child(label)
            self.listbox.append(row)
        self._select(0)

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

    def _on_search(self, _entry):
        self._populate(self.search.get_text())

    def _on_row_activated(self, _listbox, row):
        self._choose(row.get_index())

    def _on_key(self, _controller, keyval, _keycode, state):
        if keyval == Gdk.KEY_Escape:
            self.close()
            return True
        if keyval in (Gdk.KEY_Return, Gdk.KEY_KP_Enter):
            self._choose(self.index)
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
