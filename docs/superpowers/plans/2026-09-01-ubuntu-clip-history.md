# ubuntu-clip-history Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir um histórico de clipboard estilo Win+V para Ubuntu/Wayland/GNOME: grava todo texto copiado e, no `Super+V`, abre um picker para escolher e colar qualquer item anterior.

**Architecture:** Pacote Python único (`clip_history`) exposto como CLI com subcomandos. O `wl-paste --watch` (systemd user service) alimenta um `record` que grava em SQLite; o `show` abre um picker GTK4 que, ao selecionar, copia com `wl-copy` e cola via `ydotool` (fallback copy-only + notificação).

**Tech Stack:** Python 3.10+, SQLite (stdlib), GTK4/Libadwaita (PyGObject), `wl-clipboard`, `ydotool`, systemd user service, GNOME gsettings.

**Spec:** `docs/superpowers/specs/2026-09-01-ubuntu-clip-history-design.md`

## Global Constraints

- **Plataforma:** Wayland + GNOME (Mutter). Só o clipboard (`Ctrl+C`) é observado — nunca o primary selection.
- **Só texto** no v1. Sem imagens, sem favoritos, sem filtro de senha.
- **Retenção:** `LIMIT = 100` itens; `MAX_SIZE = 100 * 1024` bytes (texto maior é ignorado); dedup (re-copiar sobe ao topo, sem duplicar).
- **Ordenação canônica:** sempre por `id DESC` (mais recente primeiro). `id` é monotônico e o dedup apaga+reinsere, então o re-copiado ganha `id` maior e vai ao topo.
- **Nomes fixos:** pacote `clip_history`; comando `clip-history`; DB em `~/.local/share/clip-history/history.db`, sobreponível por env `CLIP_HISTORY_DB` (usado nos testes).
- **Imports preguiçosos:** `cli.py` só importa `picker`/GTK dentro do branch `show`, para os testes de `storage`/`record`/`paste` rodarem sem GTK/Wayland.
- **Auto-paste com fallback:** se `ydotool` não existe ou falha, cai em copy-only + `notify-send`; nunca levanta exceção que quebre o fluxo.

---

### Task 1: Scaffold do projeto + config

**Files:**
- Create: `pyproject.toml`
- Create: `clip_history/__init__.py`
- Create: `clip_history/config.py`
- Create: `tests/__init__.py`
- Create: `tests/test_config.py`
- Create: `.gitignore`

**Interfaces:**
- Consumes: nada (primeira task).
- Produces:
  - `config.LIMIT: int = 100`
  - `config.MAX_SIZE: int = 102400`
  - `config.data_dir() -> pathlib.Path`
  - `config.db_path() -> pathlib.Path` (respeita env `CLIP_HISTORY_DB`)

- [ ] **Step 1: Escrever o teste que falha**

`tests/test_config.py`:
```python
from clip_history import config


def test_limits():
    assert config.LIMIT == 100
    assert config.MAX_SIZE == 100 * 1024


def test_db_path_env_override(monkeypatch, tmp_path):
    target = tmp_path / "custom.db"
    monkeypatch.setenv("CLIP_HISTORY_DB", str(target))
    assert config.db_path() == target


def test_db_path_default(monkeypatch):
    monkeypatch.delenv("CLIP_HISTORY_DB", raising=False)
    monkeypatch.setenv("XDG_DATA_HOME", "/home/x/.local/share")
    assert str(config.db_path()) == "/home/x/.local/share/clip-history/history.db"
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `python -m pytest tests/test_config.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'clip_history'`

- [ ] **Step 3: Criar o scaffold e o config**

`clip_history/__init__.py`:
```python
__version__ = "0.1.0"
```

`clip_history/config.py`:
```python
import os
from pathlib import Path

LIMIT = 100
MAX_SIZE = 100 * 1024  # bytes


def data_dir() -> Path:
    base = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
    return Path(base) / "clip-history"


def db_path() -> Path:
    override = os.environ.get("CLIP_HISTORY_DB")
    if override:
        return Path(override)
    return data_dir() / "history.db"
```

`tests/__init__.py`: (arquivo vazio)

`pyproject.toml`:
```toml
[project]
name = "ubuntu-clip-history"
version = "0.1.0"
description = "Histórico de clipboard estilo Win+V para Ubuntu/Wayland/GNOME"
requires-python = ">=3.10"

[project.scripts]
clip-history = "clip_history.cli:main"

[project.optional-dependencies]
dev = ["pytest"]

[build-system]
requires = ["setuptools>=61"]
build-backend = "setuptools.build_meta"

[tool.setuptools]
packages = ["clip_history"]
```

`.gitignore`:
```
__pycache__/
*.pyc
*.egg-info/
.pytest_cache/
build/
dist/
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `python -m pytest tests/test_config.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml clip_history tests .gitignore
git commit -m "feat: scaffold do projeto e config (paths + limites)"
```

---

### Task 2: Storage (SQLite) — o core

**Files:**
- Create: `clip_history/storage.py`
- Create: `tests/test_storage.py`

**Interfaces:**
- Consumes: `config.LIMIT`, `config.MAX_SIZE`, `config.db_path()`.
- Produces:
  - `storage.Entry` — dataclass `{ id: int, content: str, created_at: str }`
  - `storage.add(content: str) -> None` — aplica empty/size/dedup/count-cap
  - `storage.list(limit: int | None = None) -> list[Entry]` — `id DESC`
  - `storage.get(entry_id: int) -> Entry | None`
  - `storage.clear() -> None`

- [ ] **Step 1: Escrever os testes que falham**

`tests/test_storage.py`:
```python
import pytest

from clip_history import config, storage


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setenv("CLIP_HISTORY_DB", str(tmp_path / "history.db"))
    yield


def test_add_and_list():
    storage.add("hello")
    assert [e.content for e in storage.list()] == ["hello"]


def test_ignores_empty_and_whitespace():
    storage.add("")
    storage.add("   \n\t ")
    assert storage.list() == []


def test_ignores_oversized():
    storage.add("x" * (config.MAX_SIZE + 1))
    assert storage.list() == []


def test_dedup_moves_to_top_without_duplicating():
    storage.add("a")
    storage.add("b")
    storage.add("a")
    assert [e.content for e in storage.list()] == ["a", "b"]


def test_count_cap_keeps_newest():
    for i in range(config.LIMIT + 10):
        storage.add(f"item-{i}")
    entries = storage.list()
    assert len(entries) == config.LIMIT
    assert entries[0].content == f"item-{config.LIMIT + 9}"
    assert all(e.content != "item-0" for e in entries)


def test_list_limit():
    for i in range(5):
        storage.add(f"n{i}")
    assert [e.content for e in storage.list(limit=2)] == ["n4", "n3"]


def test_get():
    storage.add("findme")
    top = storage.list()[0]
    assert storage.get(top.id).content == "findme"
    assert storage.get(999999) is None


def test_clear():
    storage.add("x")
    storage.clear()
    assert storage.list() == []
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `python -m pytest tests/test_storage.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'clip_history.storage'`

- [ ] **Step 3: Implementar o storage**

`clip_history/storage.py`:
```python
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone

from clip_history import config


@dataclass
class Entry:
    id: int
    content: str
    created_at: str


def _connect() -> sqlite3.Connection:
    path = config.db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS entries (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            content    TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_entries_created_at "
        "ON entries(created_at DESC)"
    )
    return conn


def add(content: str) -> None:
    if not content or not content.strip():
        return
    if len(content.encode("utf-8")) > config.MAX_SIZE:
        return
    conn = _connect()
    try:
        # dedup: remove idêntico para que o re-copiado suba ao topo
        conn.execute("DELETE FROM entries WHERE content = ?", (content,))
        conn.execute(
            "INSERT INTO entries (content, created_at) VALUES (?, ?)",
            (content, datetime.now(timezone.utc).isoformat()),
        )
        # count cap: mantém os LIMIT mais recentes (por id)
        conn.execute(
            "DELETE FROM entries WHERE id NOT IN ("
            "SELECT id FROM entries ORDER BY id DESC LIMIT ?)",
            (config.LIMIT,),
        )
        conn.commit()
    finally:
        conn.close()


def list(limit: int | None = None) -> list[Entry]:
    conn = _connect()
    try:
        sql = "SELECT id, content, created_at FROM entries ORDER BY id DESC"
        params: tuple = ()
        if limit is not None:
            sql += " LIMIT ?"
            params = (limit,)
        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()
    return [Entry(id=r[0], content=r[1], created_at=r[2]) for r in rows]


def get(entry_id: int) -> "Entry | None":
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT id, content, created_at FROM entries WHERE id = ?",
            (entry_id,),
        ).fetchone()
    finally:
        conn.close()
    return Entry(id=row[0], content=row[1], created_at=row[2]) if row else None


def clear() -> None:
    conn = _connect()
    try:
        conn.execute("DELETE FROM entries")
        conn.commit()
    finally:
        conn.close()
```

- [ ] **Step 4: Rodar e ver passar**

Run: `python -m pytest tests/test_storage.py -v`
Expected: PASS (8 passed)

- [ ] **Step 5: Commit**

```bash
git add clip_history/storage.py tests/test_storage.py
git commit -m "feat: storage SQLite com dedup, cap de 100 e cap de tamanho"
```

---

### Task 3: Watcher (`record` + `watch`)

**Files:**
- Create: `clip_history/watcher.py`
- Create: `tests/test_watcher.py`

**Interfaces:**
- Consumes: `storage.add`.
- Produces:
  - `watcher.record(stream=None) -> None` — lê texto de `stream` (default `sys.stdin`) e chama `storage.add`.
  - `watcher.watch() -> None` — `execvp` do `wl-paste --type text --watch clip-history record` (não retorna; substitui o processo).

- [ ] **Step 1: Escrever os testes que falham**

`tests/test_watcher.py`:
```python
import io

import pytest

from clip_history import storage, watcher


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setenv("CLIP_HISTORY_DB", str(tmp_path / "history.db"))
    yield


def test_record_reads_stdin():
    watcher.record(io.StringIO("copied text"))
    assert [e.content for e in storage.list()] == ["copied text"]


def test_record_ignores_empty_stream():
    watcher.record(io.StringIO("   "))
    assert storage.list() == []


def test_watch_execs_wl_paste(monkeypatch):
    captured = {}

    def fake_execvp(file, args):
        captured["file"] = file
        captured["args"] = args

    monkeypatch.setattr(watcher.os, "execvp", fake_execvp)
    watcher.watch()
    assert captured["file"] == "wl-paste"
    assert captured["args"] == [
        "wl-paste", "--type", "text", "--watch", "clip-history", "record",
    ]
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `python -m pytest tests/test_watcher.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'clip_history.watcher'`

- [ ] **Step 3: Implementar o watcher**

`clip_history/watcher.py`:
```python
import os
import sys

from clip_history import storage


def record(stream=None) -> None:
    """Lê o texto do clipboard (stdin) e grava no histórico."""
    if stream is None:
        stream = sys.stdin
    content = stream.read()
    storage.add(content)


def watch() -> None:
    """Substitui o processo por `wl-paste --watch`, que chama `record`
    a cada mudança do clipboard."""
    os.execvp(
        "wl-paste",
        ["wl-paste", "--type", "text", "--watch", "clip-history", "record"],
    )
```

- [ ] **Step 4: Rodar e ver passar**

Run: `python -m pytest tests/test_watcher.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add clip_history/watcher.py tests/test_watcher.py
git commit -m "feat: watcher (record via stdin + watch via wl-paste)"
```

---

### Task 4: Paste (wl-copy + ydotool + fallback)

**Files:**
- Create: `clip_history/paste.py`
- Create: `tests/test_paste.py`

**Interfaces:**
- Consumes: nada interno (só `subprocess`, `shutil`, `time`).
- Produces:
  - `paste.copy(content: str) -> None` — escreve no clipboard via `wl-copy`.
  - `paste.paste(content: str, delay: float = 0.12) -> None` — copia, aguarda o foco voltar, envia Ctrl+V via `ydotool`; fallback copy-only + `notify-send`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/test_paste.py`:
```python
from clip_history import paste


def test_fallback_copy_only_when_ydotool_missing(monkeypatch):
    calls = {"copy": None, "notify": None, "run": []}
    monkeypatch.setattr(paste, "copy", lambda c: calls.__setitem__("copy", c))
    monkeypatch.setattr(
        paste.shutil, "which",
        lambda name: None if name == "ydotool" else "/usr/bin/" + name,
    )
    monkeypatch.setattr(paste, "_notify", lambda m: calls.__setitem__("notify", m))
    monkeypatch.setattr(paste.subprocess, "run",
                        lambda *a, **k: calls["run"].append(a))
    paste.paste("hi", delay=0)
    assert calls["copy"] == "hi"
    assert calls["notify"] is not None
    assert calls["run"] == []  # ydotool nunca chamado


def test_invokes_ydotool_when_available(monkeypatch):
    recorded = {}
    monkeypatch.setattr(paste, "copy", lambda c: recorded.__setitem__("copy", c))
    monkeypatch.setattr(paste.shutil, "which", lambda name: "/usr/bin/" + name)
    monkeypatch.setattr(paste.time, "sleep", lambda s: None)

    def fake_run(args, **k):
        recorded["run_args"] = args

    monkeypatch.setattr(paste.subprocess, "run", fake_run)
    paste.paste("hi", delay=0)
    assert recorded["copy"] == "hi"
    assert recorded["run_args"][0] == "ydotool"
    assert recorded["run_args"][1] == "key"


def test_ydotool_failure_falls_back(monkeypatch):
    import subprocess
    notified = {}
    monkeypatch.setattr(paste, "copy", lambda c: None)
    monkeypatch.setattr(paste.shutil, "which", lambda name: "/usr/bin/" + name)
    monkeypatch.setattr(paste.time, "sleep", lambda s: None)
    monkeypatch.setattr(paste, "_notify", lambda m: notified.__setitem__("m", m))

    def boom(args, **k):
        raise subprocess.CalledProcessError(1, args)

    monkeypatch.setattr(paste.subprocess, "run", boom)
    paste.paste("hi", delay=0)
    assert notified.get("m") is not None
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `python -m pytest tests/test_paste.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'clip_history.paste'`

- [ ] **Step 3: Implementar o paste**

`clip_history/paste.py`:
```python
import shutil
import subprocess
import time

# keycodes do Linux input (evdev): Ctrl esquerdo = 29, V = 47
_CTRL = "29"
_V = "47"


def copy(content: str) -> None:
    subprocess.run(["wl-copy"], input=content.encode("utf-8"), check=True)


def _ydotool_available() -> bool:
    return shutil.which("ydotool") is not None


def _notify(message: str) -> None:
    if shutil.which("notify-send"):
        subprocess.run(["notify-send", "clip-history", message], check=False)


def paste(content: str, delay: float = 0.12) -> None:
    """Coloca `content` no clipboard e cola no app focado.

    Cai em copy-only (com notificação) se o ydotool não existir ou falhar.
    """
    copy(content)
    if not _ydotool_available():
        _notify("Copiado — aperte Ctrl+V para colar")
        return
    time.sleep(delay)  # deixa o foco voltar ao app anterior
    try:
        subprocess.run(
            ["ydotool", "key", f"{_CTRL}:1", f"{_V}:1", f"{_V}:0", f"{_CTRL}:0"],
            check=True,
        )
    except (subprocess.CalledProcessError, OSError):
        _notify("Copiado — aperte Ctrl+V para colar")
```

- [ ] **Step 4: Rodar e ver passar**

Run: `python -m pytest tests/test_paste.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add clip_history/paste.py tests/test_paste.py
git commit -m "feat: paste com wl-copy + ydotool e fallback copy-only"
```

---

### Task 5: CLI (dispatch dos subcomandos)

**Files:**
- Create: `clip_history/cli.py`
- Create: `tests/test_cli.py`

**Interfaces:**
- Consumes: `watcher.watch`, `watcher.record`, `picker.show` (lazy), `setup.run` (lazy).
- Produces:
  - `cli.main(argv: list[str] | None = None) -> int` — despacha `watch|record|show|setup`; default `show`; desconhecido → 2.

- [ ] **Step 1: Escrever os testes que falham**

`tests/test_cli.py`:
```python
from clip_history import cli


def test_unknown_command_returns_2(capsys):
    assert cli.main(["bogus"]) == 2
    assert "desconhecido" in capsys.readouterr().err


def test_record_dispatch(monkeypatch):
    import clip_history.watcher as w
    called = {}
    monkeypatch.setattr(w, "record", lambda: called.__setitem__("r", True))
    assert cli.main(["record"]) == 0
    assert called.get("r") is True


def test_watch_dispatch(monkeypatch):
    import clip_history.watcher as w
    called = {}
    monkeypatch.setattr(w, "watch", lambda: called.__setitem__("w", True))
    assert cli.main(["watch"]) == 0
    assert called.get("w") is True
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `python -m pytest tests/test_cli.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'clip_history.cli'`

- [ ] **Step 3: Implementar a CLI**

`clip_history/cli.py`:
```python
import sys


def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    cmd = argv[0] if argv else "show"

    if cmd == "watch":
        from clip_history import watcher
        watcher.watch()
        return 0
    if cmd == "record":
        from clip_history import watcher
        watcher.record()
        return 0
    if cmd == "show":
        from clip_history import picker
        picker.show()
        return 0
    if cmd == "setup":
        from clip_history import setup
        return setup.run()

    sys.stderr.write(f"comando desconhecido: {cmd}\n")
    sys.stderr.write("uso: clip-history [watch|record|show|setup]\n")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Rodar e ver passar**

Run: `python -m pytest tests/test_cli.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Rodar a suíte inteira e commitar**

Run: `python -m pytest -v`
Expected: PASS (todos os testes até aqui)

```bash
git add clip_history/cli.py tests/test_cli.py
git commit -m "feat: CLI com dispatch watch/record/show/setup"
```

---

### Task 6: Picker GTK4

**Files:**
- Create: `clip_history/picker.py`

**Interfaces:**
- Consumes: `storage.list()`, `paste.paste(content)`.
- Produces: `picker.show() -> None` — abre a janela e roda o loop GTK.

**Nota de teste:** GTK/Wayland não é testado por unidade — validação é manual/E2E (Task 8). O código abaixo deve **importar e compilar** com GTK4/Adw presentes. Interação fina (scroll, foco) pode ser ajustada ao rodar de verdade.

**Desvio consciente do spec:** o quick-select por número usa **Alt+1..9** (não `1..9` puro), porque o campo de busca fica focado por padrão e dígitos puros vão para a busca. Alt+dígito é capturado pela janela antes da busca e não conflita.

- [ ] **Step 1: Implementar o picker**

`clip_history/picker.py`:
```python
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
```

- [ ] **Step 2: Verificar que importa/compila**

Run: `python -c "import ast; ast.parse(open('clip_history/picker.py').read()); print('ok')"`
Expected: `ok`

Se GTK4/Adw estiverem instalados, valide o import real:
Run: `python -c "from clip_history import picker; print('import ok')"`
Expected: `import ok` (se faltar dep, instale `python3-gi gir1.2-gtk-4.0 gir1.2-adw-1`)

- [ ] **Step 3: Commit**

```bash
git add clip_history/picker.py
git commit -m "feat: picker GTK4 (busca, setas, Enter, Esc, Alt+1..9)"
```

---

### Task 7: Setup (systemd service + gsettings + checagem de deps)

**Files:**
- Create: `clip_history/setup.py`
- Create: `systemd/clip-history-watch.service`
- Create: `tests/test_setup.py`

**Interfaces:**
- Consumes: nada interno (subprocess/shutil/pathlib).
- Produces:
  - `setup.check_deps() -> list[str]` — lista legível de deps faltando.
  - `setup.install_service() -> None`
  - `setup.install_keybinding() -> None`
  - `setup.run() -> int`

- [ ] **Step 1: Escrever o teste que falha**

`tests/test_setup.py`:
```python
from clip_history import setup


def test_check_deps_reports_missing(monkeypatch):
    monkeypatch.setattr(setup.shutil, "which", lambda name: None)
    missing = setup.check_deps()
    joined = " ".join(missing)
    assert "wl-clipboard" in joined
    assert "ydotool" in joined


def test_check_deps_all_present(monkeypatch):
    monkeypatch.setattr(setup.shutil, "which", lambda name: "/usr/bin/" + name)

    # Simula GTK/Adw disponíveis sem exigir a lib de verdade
    monkeypatch.setattr(setup, "_gtk_available", lambda: True)
    missing = setup.check_deps()
    assert missing == []
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `python -m pytest tests/test_setup.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'clip_history.setup'`

- [ ] **Step 3: Implementar o setup e o service**

`systemd/clip-history-watch.service`:
```ini
[Unit]
Description=clip-history clipboard watcher
After=graphical-session.target
PartOf=graphical-session.target

[Service]
Type=simple
ExecStart=clip-history watch
Restart=on-failure
RestartSec=2

[Install]
WantedBy=graphical-session.target
```

`clip_history/setup.py`:
```python
import ast
import shutil
import subprocess
from pathlib import Path

SERVICE_NAME = "clip-history-watch.service"
KEYBINDING_PATH = (
    "/org/gnome/settings-daemon/plugins/media-keys/"
    "custom-keybindings/clip-history/"
)
_MEDIA_KEYS = "org.gnome.settings-daemon.plugins.media-keys"


def _gtk_available() -> bool:
    try:
        import gi

        gi.require_version("Gtk", "4.0")
        gi.require_version("Adw", "1")
        return True
    except Exception:
        return False


def check_deps() -> list:
    missing = []
    if shutil.which("wl-paste") is None or shutil.which("wl-copy") is None:
        missing.append("wl-clipboard (wl-paste/wl-copy)")
    if shutil.which("ydotool") is None:
        missing.append("ydotool (auto-paste; sem ele o app usa copy-only)")
    if not _gtk_available():
        missing.append("python3-gi + gir1.2-gtk-4.0 + gir1.2-adw-1 (GTK4/Adw)")
    return missing


def install_service() -> None:
    src = Path(__file__).resolve().parent.parent / "systemd" / SERVICE_NAME
    dst = Path.home() / ".config" / "systemd" / "user" / SERVICE_NAME
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(src.read_text())
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=False)
    subprocess.run(
        ["systemctl", "--user", "enable", "--now", SERVICE_NAME], check=False
    )


def _current_keybindings() -> list:
    out = subprocess.run(
        ["gsettings", "get", _MEDIA_KEYS, "custom-keybindings"],
        capture_output=True, text=True,
    ).stdout.strip()
    if out.startswith("@as"):
        out = out[len("@as"):].strip()
    if not out or out == "[]":
        return []
    try:
        return list(ast.literal_eval(out))
    except (ValueError, SyntaxError):
        return []


def install_keybinding() -> None:
    bindings = _current_keybindings()
    if KEYBINDING_PATH not in bindings:
        bindings.append(KEYBINDING_PATH)
    subprocess.run(
        ["gsettings", "set", _MEDIA_KEYS, "custom-keybindings", str(bindings)],
        check=False,
    )
    child = f"{_MEDIA_KEYS}.custom-keybinding:{KEYBINDING_PATH}"
    subprocess.run(["gsettings", "set", child, "name", "clip-history"], check=False)
    subprocess.run(
        ["gsettings", "set", child, "command", "clip-history show"], check=False
    )
    subprocess.run(["gsettings", "set", child, "binding", "<Super>v"], check=False)


def run() -> int:
    missing = check_deps()
    install_service()
    install_keybinding()

    print("clip-history configurado:")
    print(f"  • serviço: {SERVICE_NAME} "
          f"(status: systemctl --user status {SERVICE_NAME})")
    print("  • atalho: Super+V → clip-history show")

    if missing:
        print("\nDependências faltando:")
        for item in missing:
            print(f"  • {item}")
        print("\nInstale com:")
        print("  sudo apt install wl-clipboard python3-gi "
              "gir1.2-gtk-4.0 gir1.2-adw-1 ydotool")
        print("\nPara o auto-paste (ydotool):")
        print("  1. habilite o daemon: sudo systemctl enable --now ydotool "
              "(ou rode 'ydotoold')")
        print("  2. garanta acesso a /dev/uinput "
              "(adicione seu usuário ao grupo 'input' ou crie uma regra udev)")
    return 0
```

- [ ] **Step 4: Rodar e ver passar**

Run: `python -m pytest tests/test_setup.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add clip_history/setup.py systemd/clip-history-watch.service tests/test_setup.py
git commit -m "feat: setup (systemd user service + atalho Super+V + checagem de deps)"
```

---

### Task 8: README + verificação E2E manual

**Files:**
- Create: `README.md`

**Interfaces:** nenhuma (documentação + validação de sistema).

- [ ] **Step 1: Escrever o README**

`README.md`:
```markdown
# ubuntu-clip-history

Histórico de área de transferência estilo `Win+V`, para **Ubuntu / Wayland / GNOME**.

Grava todo texto copiado (`Ctrl+C`) e, ao apertar `Super+V`, abre um picker
onde você escolhe qualquer item anterior para colar.

## Requisitos

- Ubuntu com Wayland + GNOME
- `wl-clipboard`, `python3-gi`, `gir1.2-gtk-4.0`, `gir1.2-adw-1`
- `ydotool` (opcional — auto-paste; sem ele, cai em copy-only)

## Instalação

```bash
sudo apt install wl-clipboard python3-gi gir1.2-gtk-4.0 gir1.2-adw-1 ydotool
pip install --user -e .
clip-history setup
```

O `setup` instala o serviço de gravação (systemd --user), registra o atalho
`Super+V` e avisa o que faltar.

### Auto-paste (ydotool)

```bash
sudo systemctl enable --now ydotool     # sobe o ydotoold
sudo usermod -aG input "$USER"          # acesso a /dev/uinput (relogar depois)
```

Sem o ydotool funcionando, ao escolher um item ele vai para o clipboard e uma
notificação lembra de apertar `Ctrl+V`.

## Uso

- Copie textos normalmente (`Ctrl+C`).
- `Super+V` abre o histórico. Digite para filtrar, `↑`/`↓` para navegar,
  `Enter` para colar, `Esc` para fechar, `Alt+1..9` para escolha rápida.

## Comandos

| Comando | Função |
|---------|--------|
| `clip-history watch`  | Serviço de gravação (usado pelo systemd) |
| `clip-history record` | Grava um texto vindo do stdin (usado pelo watch) |
| `clip-history show`   | Abre o picker (ligado ao Super+V) |
| `clip-history setup`  | Instala serviço + atalho + checa deps |

## Limites (v1)

Só texto; últimos 100 itens; dedup; ignora textos > 100 KB. Imagens,
favoritos e filtro de senha ficam para versões futuras.
```

- [ ] **Step 2: Rodar a suíte completa**

Run: `python -m pytest -v`
Expected: PASS (todos)

- [ ] **Step 3: Instalar em modo dev e configurar**

```bash
pip install --user -e .
sudo apt install wl-clipboard python3-gi gir1.2-gtk-4.0 gir1.2-adw-1 ydotool
clip-history setup
```
Expected: mensagem de "configurado"; deps faltando listadas (se houver).

- [ ] **Step 4: Verificação E2E manual (o coração do produto)**

1. Confirme o watcher rodando: `systemctl --user status clip-history-watch.service` → `active (running)`.
2. Copie 3–4 textos diferentes (`Ctrl+C` em vários lugares).
3. Cheque a gravação: `sqlite3 ~/.local/share/clip-history/history.db "select content from entries order by id desc;"` → deve listar os textos, mais recente no topo, sem duplicados.
4. Abra um editor de texto, aperte **Super+V**: o picker deve aparecer.
5. Filtre digitando, navegue com setas, aperte **Enter** num item antigo.
   - Com ydotool ok: o texto é **colado** no editor.
   - Sem ydotool: aparece a notificação e o texto está no clipboard (`Ctrl+V` cola).
6. Re-copie um texto que já está no histórico → confirme que ele **sobe ao topo** sem duplicar.

- [ ] **Step 5: Commit e push**

```bash
git add README.md
git commit -m "docs: README com instalação, uso e verificação E2E"
git push -u origin main
```

---

## Self-Review (feita na escrita do plano)

- **Cobertura do spec:** watcher (T3), storage/dedup/caps (T2), picker/busca/teclado (T6), paste auto+fallback (T4), Super+V/gsettings + systemd + deps (T7), estrutura/pyproject (T1), testes (T2–T7 unit; T8 E2E), README/deps (T7–T8). Fora de escopo (imagens, favoritos, senha) permanece fora. ✔
- **Desvio registrado:** quick-select por número virou `Alt+1..9` (justificado na Task 6) em vez de `1..9` puro do spec, por conflito com o campo de busca focado.
- **Placeholders:** nenhum — todo passo tem código real.
- **Consistência de tipos/nomes:** `storage.Entry{id,content,created_at}`, `storage.add/list/get/clear`, `watcher.record/watch`, `paste.copy/paste`, `cli.main`, `setup.check_deps/install_service/install_keybinding/run/_gtk_available` — usados de forma idêntica entre tasks e testes. ✔
```
