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
