"""posts + extracted + conditions を日付でJOINして確認する (Phase 1 動作確認用)。"""

import sqlite3

import pandas as pd

from init_db import DB_PATH

JOIN_SQL = """
SELECT
    b.name AS boat_name,
    p.date,
    e.species,
    e.count_or_level,
    e.size_cm,
    c.tide_type,
    c.water_temp,
    c.air_temp_max,
    c.air_temp_min,
    c.wind_dir,
    c.wind_speed
FROM posts p
JOIN boats b ON b.id = p.boat_id
JOIN extracted e ON e.post_id = p.id
LEFT JOIN conditions c ON c.date = p.date
ORDER BY p.date;
"""


def load_joined() -> pd.DataFrame:
    conn = sqlite3.connect(DB_PATH)
    try:
        return pd.read_sql_query(JOIN_SQL, conn)
    finally:
        conn.close()


if __name__ == "__main__":
    df = load_joined()
    print(df.to_string(index=False))
