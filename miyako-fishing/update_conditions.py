"""指定期間の気象(+潮汐)データを取得し、conditions テーブルに反映する。

水温(water_temp)は取得元が未確定(設計メモの通り要調査)のため、
このスクリプトでは更新しない。既存のwater_temp値はそのまま保持される。
"""

import sqlite3
import sys
from datetime import date as date_cls

from fetch_tide import fetch_tide
from fetch_weather import fetch_weather
from init_db import DB_PATH, init_db


def upsert_conditions(records: list[dict]) -> None:
    if not DB_PATH.exists():
        init_db()

    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.cursor()
        for record in records:
            date = record["date"]
            fields = {k: v for k, v in record.items() if k != "date" and v is not None}
            cur.execute("INSERT OR IGNORE INTO conditions (date) VALUES (?)", (date,))
            if fields:
                set_clause = ", ".join(f"{k} = ?" for k in fields)
                cur.execute(
                    f"UPDATE conditions SET {set_clause} WHERE date = ?",
                    (*fields.values(), date),
                )
        conn.commit()
    finally:
        conn.close()


def update_conditions(start_date: str, end_date: str) -> None:
    weather_by_date = {r["date"]: r for r in fetch_weather(start_date, end_date)}

    tide_by_date: dict[str, dict] = {}
    try:
        year, month, day = (int(x) for x in start_date.split("-"))
        days = (date_cls.fromisoformat(end_date) - date_cls.fromisoformat(start_date)).days + 1
        tide_by_date = {r["date"]: r for r in fetch_tide(year, month, day, days)}
    except RuntimeError as exc:
        print(f"[warn] 潮汐データは取得できませんでした: {exc}")

    merged = {}
    for date, weather in weather_by_date.items():
        merged[date] = {**weather, **tide_by_date.get(date, {})}

    upsert_conditions(list(merged.values()))
    print(f"Updated conditions for {len(merged)} day(s) from {start_date} to {end_date}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: python update_conditions.py <start_date YYYY-MM-DD> <end_date YYYY-MM-DD>")
        sys.exit(1)
    update_conditions(sys.argv[1], sys.argv[2])
