"""schema.sql から miyako_fishing.db (SQLite) を作成する。"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "miyako_fishing.db"
SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def init_db(db_path: Path = DB_PATH) -> None:
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        conn.commit()
    finally:
        conn.close()
    print(f"DB initialized: {db_path}")


if __name__ == "__main__":
    init_db()
