"""schema.sql から miyako_fishing.db (SQLite) を作成する。"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "miyako_fishing.db"
SCHEMA_PATH = Path(__file__).parent / "schema.sql"

# 既存DBに後から追加した列。CREATE TABLE IF NOT EXISTS では既存テーブルに列が
# 増えないため、init_db() のたびに足りない列を ALTER TABLE で追加する。
ADDED_COLUMNS = [
    ("posts", "extracted_at", "TEXT"),       # Phase 5
    ("extracted", "catch_date", "TEXT"),     # Phase 5
    ("extracted", "count_basis", "TEXT"),    # Phase 5
]


def migrate(conn: sqlite3.Connection) -> None:
    for table, column, col_type in ADDED_COLUMNS:
        existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
        if column not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")


def init_db(db_path: Path = DB_PATH) -> None:
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        migrate(conn)
        conn.commit()
    finally:
        conn.close()
    print(f"DB initialized: {db_path}")


if __name__ == "__main__":
    init_db()
