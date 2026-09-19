"""スクレイパーが取得した posts レコードをDBへ保存する(source_urlで重複排除)。"""

import sqlite3
from pathlib import Path

from init_db import DB_PATH, init_db


def insert_posts(boat_name: str, records: list[dict], db_path: Path = DB_PATH) -> int:
    """新規に挿入された件数を返す。既存の(boat_id, source_url)は無視する。"""
    if not db_path.exists():
        init_db(db_path)

    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        boat_row = cur.execute("SELECT id FROM boats WHERE name = ?", (boat_name,)).fetchone()
        if boat_row is None:
            raise RuntimeError(
                f"boats に '{boat_name}' が見つかりません。先に seed_sample_data.py を実行してください。"
            )
        boat_id = boat_row[0]

        inserted = 0
        for r in records:
            cur.execute(
                "INSERT OR IGNORE INTO posts "
                "(boat_id, date, title, body_raw, image_url, source, source_url) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (boat_id, r["date"], r.get("title"), r.get("body_raw"), r.get("image_url"),
                 r.get("source", "site"), r.get("source_url")),
            )
            inserted += cur.rowcount
        conn.commit()
        return inserted
    finally:
        conn.close()


if __name__ == "__main__":
    import sys

    from scraper_yutakamaru import fetch_posts

    max_pages = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    records = fetch_posts(max_pages=max_pages)
    inserted = insert_posts("ゆたか丸", records)
    print(f"Fetched {len(records)} posts, inserted {inserted} new row(s).")
