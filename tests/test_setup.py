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
