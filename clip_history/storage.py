import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone

from clip_history import config


@dataclass
class Entry:
    id: int
    content: str
    created_at: str


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
            created_at TEXT NOT NULL
        )
        """
    )
    return conn


def add(content: str) -> None:
    if not content or not content.strip():
        return
    if len(content.encode("utf-8")) > config.MAX_SIZE:
        return
    try:
        conn = _connect()
        try:
            # dedup: remove idêntico para que o re-copiado suba ao topo
            conn.execute("DELETE FROM entries WHERE content = ?", (content,))
            conn.execute(
                "INSERT INTO entries (content, created_at) VALUES (?, ?)",
                (content, datetime.now(timezone.utc).isoformat()),
            )
            # count cap: mantém os LIMIT mais recentes (por id)
            conn.execute(
                "DELETE FROM entries WHERE id NOT IN ("
                "SELECT id FROM entries ORDER BY id DESC LIMIT ?)",
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
        sql = "SELECT id, content, created_at FROM entries ORDER BY id DESC"
        params: tuple = ()
        if limit is not None:
            sql += " LIMIT ?"
            params = (limit,)
        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()
    return [Entry(id=r[0], content=r[1], created_at=r[2]) for r in rows]


def get(entry_id: int) -> "Entry | None":
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT id, content, created_at FROM entries WHERE id = ?",
            (entry_id,),
        ).fetchone()
    finally:
        conn.close()
    return Entry(id=row[0], content=row[1], created_at=row[2]) if row else None


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
