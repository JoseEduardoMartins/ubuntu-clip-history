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


def test_delete_removes_only_target():
    storage.add("a")
    storage.add("b")
    storage.add("c")
    target = [e for e in storage.list() if e.content == "b"][0]
    storage.delete(target.id)
    assert [e.content for e in storage.list()] == ["c", "a"]


def test_delete_nonexistent_is_noop():
    storage.add("only")
    storage.delete(999999)
    assert [e.content for e in storage.list()] == ["only"]


def test_new_entries_are_unpinned():
    storage.add("x")
    assert storage.list()[0].pinned is False


def test_set_pinned_puts_item_on_top():
    storage.add("a")
    storage.add("b")
    storage.add("c")  # ordem por recência: c, b, a
    a = [e for e in storage.list() if e.content == "a"][0]
    storage.set_pinned(a.id, True)
    listed = storage.list()
    assert listed[0].content == "a"
    assert listed[0].pinned is True
    # os não-fixados seguem por recência
    assert [e.content for e in listed] == ["a", "c", "b"]


def test_unpin_returns_to_recency_order():
    storage.add("a")
    storage.add("b")
    a = [e for e in storage.list() if e.content == "a"][0]
    storage.set_pinned(a.id, True)
    storage.set_pinned(a.id, False)
    assert [e.content for e in storage.list()] == ["b", "a"]


def test_pinned_items_immune_to_cap():
    storage.add("keep-me")
    kept = storage.list()[0]
    storage.set_pinned(kept.id, True)
    for i in range(config.LIMIT + 5):
        storage.add(f"noise-{i}")
    contents = [e.content for e in storage.list()]
    assert "keep-me" in contents
    unpinned = [c for c in contents if c != "keep-me"]
    assert len(unpinned) == config.LIMIT  # cap conta só os não-fixados


def test_dedup_preserves_pin():
    storage.add("dup")
    d = storage.list()[0]
    storage.set_pinned(d.id, True)
    storage.add("dup")  # re-copiado
    listed = [e for e in storage.list() if e.content == "dup"]
    assert len(listed) == 1
    assert listed[0].pinned is True
