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


def test_tracker_records_new_content():
    tracker = watcher.Tracker()
    tracker.handle("hello")
    assert [e.content for e in storage.list()] == ["hello"]


def test_tracker_dedupes_consecutive_duplicates():
    tracker = watcher.Tracker()
    tracker.handle("a")
    tracker.handle("a")
    assert [e.content for e in storage.list()] == ["a"]


def test_tracker_skips_none():
    tracker = watcher.Tracker()
    tracker.handle(None)
    tracker.handle("x")
    tracker.handle(None)
    assert [e.content for e in storage.list()] == ["x"]


def test_tracker_readd_moves_to_top():
    tracker = watcher.Tracker()
    for text in ["a", "a", "b", "a"]:
        tracker.handle(text)
    # "a" repetido não duplica; "b" e o "a" re-copiado sobem ao topo → ["a","b"]
    assert [e.content for e in storage.list()] == ["a", "b"]
