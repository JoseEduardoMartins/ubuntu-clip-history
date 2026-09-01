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
