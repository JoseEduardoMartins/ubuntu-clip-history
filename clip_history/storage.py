import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone

from clip_history import config


@dataclass
class Entry:
    id: int
    content: str
    created_at: str
    pinned: bool = False


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
            created_at TEXT NOT NULL,
            pinned     INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    # Migração p/ bancos criados antes da coluna `pinned`.
    cols = [r[1] for r in conn.execute("PRAGMA table_info(entries)").fetchall()]
    if "pinned" not in cols:
        conn.execute(
            "ALTER TABLE entries ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0"
        )
    return conn


def _row_to_entry(r) -> "Entry":
    return Entry(id=r[0], content=r[1], created_at=r[2], pinned=bool(r[3]))


def add(content: str) -> None:
    if not content or not content.strip():
        return
    if len(content.encode("utf-8")) > config.MAX_SIZE:
        return
    try:
        conn = _connect()
        try:
            # dedup preservando o pin: se já existe, herda o `pinned` e sobe ao topo
            existing = conn.execute(
                "SELECT pinned FROM entries WHERE content = ?", (content,)
            ).fetchone()
            pinned = existing[0] if existing else 0
            conn.execute("DELETE FROM entries WHERE content = ?", (content,))
            conn.execute(
                "INSERT INTO entries (content, created_at, pinned) "
                "VALUES (?, ?, ?)",
                (content, datetime.now(timezone.utc).isoformat(), pinned),
            )
            # count cap: só os NÃO fixados contam; fixados nunca são removidos
            conn.execute(
                "DELETE FROM entries WHERE pinned = 0 AND id NOT IN ("
                "SELECT id FROM entries WHERE pinned = 0 "
                "ORDER BY id DESC LIMIT ?)",
                (config.LIMIT,),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error as e:
        import sys
        print(f"clip-history: erro ao gravar: {e}", file=sys.stderr)
        return


def list(limit: int | None = None) -> list[Entry]:
    conn = _connect()
    try:
        sql = (
            "SELECT id, content, created_at, pinned FROM entries "
            "ORDER BY pinned DESC, id DESC"
        )
        params: tuple = ()
        if limit is not None:
            sql += " LIMIT ?"
            params = (limit,)
        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()
    return [_row_to_entry(r) for r in rows]


def get(entry_id: int) -> "Entry | None":
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT id, content, created_at, pinned FROM entries WHERE id = ?",
            (entry_id,),
        ).fetchone()
    finally:
        conn.close()
    return _row_to_entry(row) if row else None


def set_pinned(entry_id: int, pinned: bool) -> None:
    conn = _connect()
    try:
        conn.execute(
            "UPDATE entries SET pinned = ? WHERE id = ?",
            (1 if pinned else 0, entry_id),
        )
        conn.commit()
    finally:
        conn.close()


def delete(entry_id: int) -> None:
    conn = _connect()
    try:
        conn.execute("DELETE FROM entries WHERE id = ?", (entry_id,))
        conn.commit()
    finally:
        conn.close()


def clear() -> None:
    conn = _connect()
    try:
        conn.execute("DELETE FROM entries")
        conn.commit()
    finally:
        conn.close()
