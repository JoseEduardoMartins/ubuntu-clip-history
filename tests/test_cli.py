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
