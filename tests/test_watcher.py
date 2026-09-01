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


def test_watch_records_clipboard_changes(monkeypatch):
    # sequência de leituras do clipboard ao longo dos ciclos de poll
    reads = iter(["a", "a", "b", "a"])
    monkeypatch.setattr(watcher, "read_clipboard", lambda: next(reads))
    monkeypatch.setattr(watcher.time, "sleep", lambda s: None)

    watcher.watch(poll_interval=0, iterations=4)

    # "a" repetido não duplica; "b" e o "a" re-copiado sobem ao topo → ["a","b"]
    assert [e.content for e in storage.list()] == ["a", "b"]


def test_watch_skips_none_reads(monkeypatch):
    reads = iter([None, "x", None])
    monkeypatch.setattr(watcher, "read_clipboard", lambda: next(reads))
    monkeypatch.setattr(watcher.time, "sleep", lambda s: None)

    watcher.watch(poll_interval=0, iterations=3)

    assert [e.content for e in storage.list()] == ["x"]
