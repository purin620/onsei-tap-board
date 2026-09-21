"""釣果の傾向を分析し、次に釣りに行くのに良さそうな日を提案する(Phase 6 先行実装)。

設計メモの分析方針:
- ヒラメ: 潮回り(大潮/中潮/小潮)との相関を中心に見る
- イカ: 水温との相関を中心に見る

【重要な制約・注意点】
- Phase 5(釣果の文章からAIで魚種・匹数を読み取る仕組み)がまだ実装されておらず、
  `extracted`テーブルの中身はPhase 1で手入力したごく少数のダミーデータしかない。
  統計的に意味のある傾向はまだ出せないため、この段階では実データ件数が少ないときに
  「まだ十分なデータがありません」と明示し、断定的な提案をしないようにしてある。
- 潮回りの将来予測(tide736.net)はPhase 2で港コード(TIDE_HC)が未確認のまま。
  水温の将来予測は情報源自体が未確定(設計メモの「要調査」項目)。
  そのため`recommend_next_days()`は今のところ「気温予報」だけを手がかりにした
  参考程度の提案にとどまる。本来はヒラメなら潮回り予報、イカなら水温予報と
  比べるべきで、それらが使えるようになったら精度を上げる。
"""

import sqlite3
from collections import defaultdict

from fetch_weather import fetch_weather_forecast
from init_db import DB_PATH

MIN_SAMPLES_FOR_TENDENCY = 5
GOOD_CATCH_SCORE_THRESHOLD = 2.5  # 豊漁(3.0)相当以上、またはそれに近い匹数を「好釣果」とみなす

_LEVEL_SCORES = {"豊漁": 3.0, "普通": 2.0, "不漁": 1.0}


def score_from_count_or_level(value: str | None) -> float | None:
    """匹数の文字列、または 豊漁/普通/不漁 を比較可能な数値スコアに変換する。"""
    if value is None:
        return None
    if value in _LEVEL_SCORES:
        return _LEVEL_SCORES[value]
    try:
        return float(value)
    except ValueError:
        return None


def load_catch_conditions(species: str, db_path=DB_PATH) -> list[dict]:
    conn = sqlite3.connect(db_path)
    try:
        rows = conn.execute(
            """
            SELECT posts.date, extracted.count_or_level,
                   conditions.tide_type, conditions.water_temp, conditions.air_temp_max
            FROM extracted
            JOIN posts ON posts.id = extracted.post_id
            LEFT JOIN conditions ON conditions.date = posts.date
            WHERE extracted.species = ?
            """,
            (species,),
        ).fetchall()
    finally:
        conn.close()

    results = []
    for date, count_or_level, tide_type, water_temp, air_temp_max in rows:
        score = score_from_count_or_level(count_or_level)
        if score is None:
            continue
        results.append({
            "date": date, "score": score, "tide_type": tide_type,
            "water_temp": water_temp, "air_temp_max": air_temp_max,
        })
    return results


def tendency_by_tide(species: str, db_path=DB_PATH) -> dict:
    data = load_catch_conditions(species, db_path)
    by_tide = defaultdict(list)
    for r in data:
        if r["tide_type"]:
            by_tide[r["tide_type"]].append(r["score"])

    by_tide_summary = {
        tide: {"avg_score": round(sum(scores) / len(scores), 2), "days": len(scores)}
        for tide, scores in by_tide.items()
    }
    return {
        "species": species,
        "total_days": len(data),
        "enough_data": len(data) >= MIN_SAMPLES_FOR_TENDENCY,
        "by_tide": by_tide_summary,
    }


def tendency_by_water_temp(species: str, bin_width: float = 1.0, db_path=DB_PATH) -> dict:
    data = load_catch_conditions(species, db_path)
    by_bin = defaultdict(list)
    for r in data:
        if r["water_temp"] is not None:
            bin_key = round(r["water_temp"] / bin_width) * bin_width
            by_bin[bin_key].append(r["score"])

    by_water_temp_summary = {
        temp: {"avg_score": round(sum(scores) / len(scores), 2), "days": len(scores)}
        for temp, scores in sorted(by_bin.items())
    }
    return {
        "species": species,
        "total_days": len(data),
        "enough_data": len(data) >= MIN_SAMPLES_FOR_TENDENCY,
        "by_water_temp": by_water_temp_summary,
    }


def recommend_next_days(species: str, days: int = 7, db_path=DB_PATH,
                         forecast_fn=fetch_weather_forecast) -> dict:
    """今後days日分の気温予報の中から、過去の好釣果日に近い日を提案する。

    forecast_fnは差し替え可能(オフラインテスト用にダミー予報を注入するため)。
    """
    history = load_catch_conditions(species, db_path)
    good_days = [r for r in history if r["score"] >= GOOD_CATCH_SCORE_THRESHOLD
                 and r["air_temp_max"] is not None]

    if len(history) < MIN_SAMPLES_FOR_TENDENCY or not good_days:
        return {
            "species": species,
            "enough_data": False,
            "message": (
                f"{species}の釣果記録が現時点で{len(history)}件しかなく、"
                "傾向を出すにはまだ足りません。実データの収集とPhase 5のAI抽出が"
                "進んでから使える機能です。"
            ),
            "candidates": [],
        }

    reference_air_temp = sum(r["air_temp_max"] for r in good_days) / len(good_days)

    forecast = forecast_fn(days)
    candidates = []
    for day in forecast:
        diff = abs(day["air_temp_max"] - reference_air_temp) if day["air_temp_max"] is not None else None
        candidates.append({**day, "diff_from_good_pattern": diff})

    candidates = [c for c in candidates if c["diff_from_good_pattern"] is not None]
    candidates.sort(key=lambda c: c["diff_from_good_pattern"])

    return {
        "species": species,
        "enough_data": True,
        "reference_air_temp": round(reference_air_temp, 1),
        "note": (
            "本来は潮回り(ヒラメ)や水温(イカ)の予報と比べるべきですが、"
            "それらの将来予測がまだ整備されていないため、気温予報のみを参考にした暫定的な提案です。"
        ),
        "candidates": candidates,
    }


if __name__ == "__main__":
    import json

    print(json.dumps(tendency_by_tide("ヒラメ"), ensure_ascii=False, indent=2))
    print(json.dumps(tendency_by_water_temp("イカ"), ensure_ascii=False, indent=2))
    print(json.dumps(recommend_next_days("イカ"), ensure_ascii=False, indent=2))
