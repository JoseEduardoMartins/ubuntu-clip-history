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
