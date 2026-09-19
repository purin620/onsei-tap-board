"""insert_posts の重複排除(source_url)を一時DBで検証する。"""

import sqlite3
import tempfile
from pathlib import Path

from init_db import init_db
from persist_posts import insert_posts

RECORDS = [
    {"date": "2026-05-10", "title": "t1", "body_raw": "b1", "image_url": None,
     "source": "site", "source_url": "https://example.com/1"},
    {"date": "2026-05-11", "title": "t2", "body_raw": "b2", "image_url": None,
     "source": "site", "source_url": "https://example.com/2"},
]


def test_insert_posts_dedup():
    db_path = Path(tempfile.mkdtemp()) / "test.db"
    init_db(db_path)

    conn = sqlite3.connect(db_path)
    conn.execute("INSERT INTO boats (name) VALUES ('ゆたか丸')")
    conn.commit()
    conn.close()

    inserted_first = insert_posts("ゆたか丸", RECORDS, db_path=db_path)
    inserted_second = insert_posts("ゆたか丸", RECORDS, db_path=db_path)  # 再実行(冪等性の確認)

    assert inserted_first == 2
    assert inserted_second == 0

    conn = sqlite3.connect(db_path)
    count = conn.execute("SELECT COUNT(*) FROM posts").fetchone()[0]
    conn.close()
    assert count == 2


if __name__ == "__main__":
    test_insert_posts_dedup()
    print("OK")
