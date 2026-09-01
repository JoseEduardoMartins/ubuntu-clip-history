import sys

from clip_history import storage

# Interface D-Bus do daemon do GPaste (pacote gpaste-2).
GPASTE_NAME = "org.gnome.GPaste"
GPASTE_PATH = "/org/gnome/GPaste"
GPASTE_IFACE = "org.gnome.GPaste2"


def record(stream=None) -> None:
    """Lê texto do stdin e grava no histórico (útil para pipes manuais)."""
    if stream is None:
        stream = sys.stdin
    content = stream.read()
    storage.add(content)


class Tracker:
    """Recebe o conteúdo do item mais recente (vindo do sinal do GPaste) e o
    grava no histórico, ignorando None e repetições consecutivas. O `storage`
    já deduplica e sobe o item ao topo, então re-copiar algo existente apenas
    o reordena."""

    def __init__(self, add=storage.add):
        self._add = add
        self._last = None

    def handle(self, text) -> None:
        if text is None or text == self._last:
            return
        self._last = text
        self._add(text)


def watch() -> None:
    """Escuta o daemon do GPaste via D-Bus e grava cada novo item no histórico.

    Por que NÃO usamos mais o polling com `wl-paste`: no GNOME/Mutter não existe
    o protocolo `wlr-data-control`, então o `wl-paste` era obrigado a criar uma
    surface e ROUBAR o foco do teclado a cada leitura pra receber a seleção.
    Rodando isso 1x/segundo, o foco piscava sem parar — o Chrome piscava, menus
    de botão-direito e modais de autofill se fechavam no `focus-out` e uma
    janelinha aparecia/sumia na barra.

    O daemon do GPaste roda DENTRO do gnome-shell, com acesso privilegiado à
    seleção, e apenas nos NOTIFICA via o sinal `Update`. A cada notificação
    lemos o item de índice 0 com `GetElementAtIndex` (puro D-Bus, sem tocar no
    clipboard nem no foco) e gravamos no nosso histórico.
    """
    from gi.repository import Gio, GLib

    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    # DBusProxyFlags.NONE ativa o serviço via D-Bus se ainda não estiver rodando.
    proxy = Gio.DBusProxy.new_sync(
        bus, Gio.DBusProxyFlags.NONE, None,
        GPASTE_NAME, GPASTE_PATH, GPASTE_IFACE, None,
    )
    tracker = Tracker()

    def current_text():
        """Texto do item mais recente do GPaste, ou None se vazio/erro."""
        try:
            res = proxy.call_sync(
                "GetElementAtIndex",
                GLib.Variant("(t)", (0,)),
                Gio.DBusCallFlags.NONE, -1, None,
            )
        except GLib.Error:
            return None
        _uuid, value = res.unpack()
        return value or None

    # Captura o que já estava no clipboard quando o serviço subiu.
    tracker.handle(current_text())

    def on_signal(_proxy, _sender, signal_name, _params):
        if signal_name == "Update":
            tracker.handle(current_text())

    proxy.connect("g-signal", on_signal)
    GLib.MainLoop().run()
