"""4隻のマスタ登録＋手動サンプルデータ数件の投入 (Phase 1 プロトタイプ用)。"""

import sqlite3
from pathlib import Path

from init_db import DB_PATH, init_db

BOATS = [
    ("ゆたか丸", "yutakamaru000", "https://yutakamaru1.com"),
    ("平進丸", "heishinmaru385", "https://zekkouchou.com"),
    ("こうしん丸", "miyako.koushinmaru0217", "https://koushinmaru-miyako.com"),
    ("隆勝丸", "tsuri_ryushomaru", "https://www.ryushomaru.co.jp/page1.html"),
]

# 手動サンプル(仮のダミーデータ。実データはPhase3以降のスクレイパーで投入する)
SAMPLE_POSTS = [
    # (boat_name, date, title, body_raw, source)
    ("ゆたか丸", "2026-05-10", "本日の釣果",
     "本日は大潮でヒラメ好調！3枚上がりました。サイズは50cm前後。", "site"),
    ("平進丸", "2026-05-10", "本日の釣果",
     "本日はイカ釣果、バケツ1杯分の豊漁でした。", "site"),
    ("こうしん丸", "2026-05-11", "釣果報告",
     "ヒラメ1枚、45cmサイズ。エギ販売もしています。", "site"),
]

# サンプル抽出結果 (post_index は SAMPLE_POSTS のインデックス)
SAMPLE_EXTRACTED = [
    (0, "ヒラメ", "3", 50.0, None, "manual"),
    (1, "イカ", "豊漁", None, None, "manual"),
    (2, "ヒラメ", "1", 45.0, None, "manual"),
]

SAMPLE_CONDITIONS = [
    ("2026-05-10", "大潮", "05:30", "11:45", 14.5, 20.0, 12.0, "北東", 3.0),
    ("2026-05-11", "大潮", "06:10", "12:20", 14.8, 19.5, 13.0, "北", 2.5),
]


def seed() -> None:
    if not DB_PATH.exists():
        init_db()

    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.cursor()

        for name, handle, url in BOATS:
            cur.execute(
                "INSERT OR IGNORE INTO boats (name, instagram_handle, website_url) "
                "VALUES (?, ?, ?)",
                (name, handle, url),
            )

        boat_ids = {
            name: cur.execute(
                "SELECT id FROM boats WHERE name = ?", (name,)
            ).fetchone()[0]
            for name, _, _ in BOATS
        }

        post_ids = []
        for boat_name, date, title, body_raw, source in SAMPLE_POSTS:
            cur.execute(
                "INSERT INTO posts (boat_id, date, title, body_raw, source) "
                "VALUES (?, ?, ?, ?, ?)",
                (boat_ids[boat_name], date, title, body_raw, source),
            )
            post_ids.append(cur.lastrowid)

        for post_index, species, count_or_level, size_cm, tackle_note, confidence in SAMPLE_EXTRACTED:
            cur.execute(
                "INSERT INTO extracted "
                "(post_id, species, count_or_level, size_cm, tackle_note, ai_confidence) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (post_ids[post_index], species, count_or_level, size_cm, tackle_note, confidence),
            )

        for date, tide_type, high, low, water_temp, air_max, air_min, wind_dir, wind_speed in SAMPLE_CONDITIONS:
            cur.execute(
                "INSERT OR REPLACE INTO conditions "
                "(date, tide_type, high_tide_time, low_tide_time, water_temp, "
                " air_temp_max, air_temp_min, wind_dir, wind_speed) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (date, tide_type, high, low, water_temp, air_max, air_min, wind_dir, wind_speed),
            )

        conn.commit()
    finally:
        conn.close()

    print(f"Seeded sample data into {DB_PATH}")


if __name__ == "__main__":
    seed()
