"""analyze_trends のオフライン検証。一時DBに手作りのデータを入れて確認する。"""

import sqlite3
import tempfile
from pathlib import Path

from analyze_trends import (
    MIN_SAMPLES_FOR_TENDENCY,
    recommend_next_days,
    score_from_count_or_level,
    tendency_by_tide,
    tendency_by_water_temp,
)
from init_db import init_db


def _build_db(rows):
    """rows: [(species, count_or_level, date, tide_type, water_temp, air_temp_max), ...]"""
    db_path = Path(tempfile.mkdtemp()) / "test.db"
    init_db(db_path)
    conn = sqlite3.connect(db_path)
    conn.execute("INSERT INTO boats (name) VALUES ('テスト丸')")
    boat_id = conn.execute("SELECT id FROM boats WHERE name = 'テスト丸'").fetchone()[0]

    for species, count_or_level, date, tide_type, water_temp, air_temp_max in rows:
        conn.execute(
            "INSERT INTO posts (boat_id, date, body_raw, source) VALUES (?, ?, '', 'site')",
            (boat_id, date),
        )
        post_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.execute(
            "INSERT INTO extracted (post_id, species, count_or_level) VALUES (?, ?, ?)",
            (post_id, species, count_or_level),
        )
        conn.execute(
            "INSERT OR REPLACE INTO conditions (date, tide_type, water_temp, air_temp_max) "
            "VALUES (?, ?, ?, ?)",
            (date, tide_type, water_temp, air_temp_max),
        )
    conn.commit()
    conn.close()
    return db_path


def test_score_from_count_or_level():
    assert score_from_count_or_level("3") == 3.0
    assert score_from_count_or_level("豊漁") == 3.0
    assert score_from_count_or_level("不漁") == 1.0
    assert score_from_count_or_level(None) is None
    assert score_from_count_or_level("よく分からない") is None


def test_tendency_reports_insufficient_data_when_few_rows():
    db_path = _build_db([
        ("ヒラメ", "3", "2026-05-01", "大潮", 14.0, 19.0),
        ("ヒラメ", "1", "2026-05-02", "中潮", 13.5, 18.0),
    ])
    result = tendency_by_tide("ヒラメ", db_path=db_path)
    assert result["total_days"] == 2
    assert result["enough_data"] is False  # MIN_SAMPLES_FOR_TENDENCY未満


def test_tendency_by_tide_with_enough_data():
    rows = [("ヒラメ", str(n), f"2026-05-{i:02d}", tide, 14.0, 19.0)
            for i, (n, tide) in enumerate(
                [(5, "大潮"), (4, "大潮"), (1, "小潮"), (1, "小潮"), (3, "中潮")], start=1)]
    db_path = _build_db(rows)
    result = tendency_by_tide("ヒラメ", db_path=db_path)
    assert result["enough_data"] is True
    assert result["by_tide"]["大潮"]["avg_score"] == 4.5
    assert result["by_tide"]["小潮"]["avg_score"] == 1.0


def test_tendency_by_water_temp_bins():
    rows = [
        ("イカ", "豊漁", "2026-06-01", "大潮", 18.2, 22.0),
        ("イカ", "豊漁", "2026-06-02", "大潮", 17.8, 22.0),
        ("イカ", "不漁", "2026-06-03", "小潮", 12.1, 18.0),
        ("イカ", "不漁", "2026-06-04", "小潮", 12.4, 18.0),
        ("イカ", "普通", "2026-06-05", "中潮", 15.0, 20.0),
    ]
    db_path = _build_db(rows)
    result = tendency_by_water_temp("イカ", db_path=db_path)
    assert result["enough_data"] is True
    assert result["by_water_temp"][18.0]["avg_score"] == 3.0
    assert result["by_water_temp"][12.0]["avg_score"] == 1.0


def test_recommend_next_days_insufficient_data():
    db_path = _build_db([("イカ", "豊漁", "2026-06-01", "大潮", 18.0, 22.0)])
    result = recommend_next_days("イカ", db_path=db_path)
    assert result["enough_data"] is False
    assert "足りません" in result["message"]


def test_recommend_next_days_ranks_by_closeness_to_good_pattern():
    rows = [
        ("イカ", "豊漁", "2026-06-01", "大潮", 18.0, 22.0),
        ("イカ", "豊漁", "2026-06-02", "大潮", 17.5, 21.5),
        ("イカ", "普通", "2026-06-03", "中潮", 15.0, 19.0),
        ("イカ", "不漁", "2026-06-04", "小潮", 12.0, 17.0),
        ("イカ", "普通", "2026-06-05", "中潮", 14.5, 18.5),
    ]
    db_path = _build_db(rows)

    def fake_forecast(days):
        return [
            {"date": "2026-06-10", "air_temp_max": 21.8, "air_temp_min": 15.0,
             "wind_dir": "北", "wind_speed": 2.0},
            {"date": "2026-06-11", "air_temp_max": 17.0, "air_temp_min": 12.0,
             "wind_dir": "南", "wind_speed": 4.0},
        ]

    result = recommend_next_days("イカ", forecast_fn=fake_forecast, db_path=db_path)
    assert result["enough_data"] is True
    assert result["candidates"][0]["date"] == "2026-06-10"  # 好釣果日の平均気温(21.75)に近い方


if __name__ == "__main__":
    test_score_from_count_or_level()
    test_tendency_reports_insufficient_data_when_few_rows()
    test_tendency_by_tide_with_enough_data()
    test_tendency_by_water_temp_bins()
    test_recommend_next_days_insufficient_data()
    test_recommend_next_days_ranks_by_closeness_to_good_pattern()
    print("OK")
