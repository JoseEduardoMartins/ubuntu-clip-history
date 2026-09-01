import os

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


def test_install_launcher_writes_executable(monkeypatch, tmp_path):
    monkeypatch.setattr(setup.Path, "home", classmethod(lambda cls: tmp_path))
    launcher = setup.install_launcher()
    assert launcher == tmp_path / ".local" / "bin" / "clip-history"
    assert launcher.exists()
    assert os.access(launcher, os.X_OK)
    body = launcher.read_text()
    assert body.startswith("#!/bin/sh")
    assert "from clip_history.cli import main" in body
    # aponta para a raiz real do repositório (dois níveis acima de setup.py)
    assert str(setup._repo_root()) in body


class _FakeResult:
    def __init__(self, stdout=""):
        self.stdout = stdout


def test_free_super_v_strips_v(monkeypatch):
    calls = []

    def fake_run(args, **kwargs):
        calls.append(args)
        if args[:2] == ["gsettings", "get"]:
            return _FakeResult("['<Super>v', '<Super>m']\n")
        return _FakeResult()

    monkeypatch.setattr(setup.subprocess, "run", fake_run)
    setup.free_super_v()
    set_calls = [c for c in calls if c[:2] == ["gsettings", "set"]]
    assert len(set_calls) == 1
    assert set_calls[0][-1] == "['<Super>m']"


def test_free_super_v_noop_when_absent(monkeypatch):
    calls = []

    def fake_run(args, **kwargs):
        calls.append(args)
        if args[:2] == ["gsettings", "get"]:
            return _FakeResult("['<Super>m']\n")
        return _FakeResult()

    monkeypatch.setattr(setup.subprocess, "run", fake_run)
    setup.free_super_v()
    assert [c for c in calls if c[:2] == ["gsettings", "set"]] == []
