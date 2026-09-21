"""Open-Meteo Historical Weather API から気温・風データを取得する。

宮古のアメダス実測ではなく、緯度経度ベースの再解析データ(ERA5)である点に注意。
API仕様: https://open-meteo.com/en/docs/historical-weather-api
"""

import requests

from config import MIYAKO_LAT, MIYAKO_LON

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# 度(0-360)を16方位の日本語表記に変換
_DIRECTIONS_JA = [
    "北", "北北東", "北東", "東北東",
    "東", "東南東", "南東", "南南東",
    "南", "南南西", "南西", "西南西",
    "西", "西北西", "北西", "北北西",
]


def degrees_to_compass_ja(degrees: float) -> str:
    index = round(degrees / 22.5) % 16
    return _DIRECTIONS_JA[index]


def parse_daily_response(data: dict) -> list[dict]:
    """Open-Meteo の daily レスポンス(dict)を conditions 用のレコードに変換する。"""
    daily = data["daily"]
    records = []
    for i, date in enumerate(daily["time"]):
        wind_dir_deg = daily["wind_direction_10m_dominant"][i]
        records.append({
            "date": date,
            "air_temp_max": daily["temperature_2m_max"][i],
            "air_temp_min": daily["temperature_2m_min"][i],
            "wind_dir": degrees_to_compass_ja(wind_dir_deg) if wind_dir_deg is not None else None,
            "wind_speed": daily["wind_speed_10m_max"][i],
        })
    return records


def fetch_weather(start_date: str, end_date: str) -> list[dict]:
    """start_date, end_date は 'YYYY-MM-DD'。宮古地点の日別気温・風速を返す。"""
    params = {
        "latitude": MIYAKO_LAT,
        "longitude": MIYAKO_LON,
        "start_date": start_date,
        "end_date": end_date,
        "daily": "temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_direction_10m_dominant",
        "wind_speed_unit": "ms",
        "timezone": "Asia/Tokyo",
    }
    resp = requests.get(ARCHIVE_URL, params=params, timeout=30)
    resp.raise_for_status()
    return parse_daily_response(resp.json())


def fetch_weather_forecast(days: int = 7) -> list[dict]:
    """今日から先days日分の気温・風の予報を返す(Open-Meteo Forecast API、最大16日)。"""
    params = {
        "latitude": MIYAKO_LAT,
        "longitude": MIYAKO_LON,
        "forecast_days": days,
        "daily": "temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_direction_10m_dominant",
        "wind_speed_unit": "ms",
        "timezone": "Asia/Tokyo",
    }
    resp = requests.get(FORECAST_URL, params=params, timeout=30)
    resp.raise_for_status()
    return parse_daily_response(resp.json())


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 3:
        print("usage: python fetch_weather.py <start_date> <end_date>")
        sys.exit(1)
    for record in fetch_weather(sys.argv[1], sys.argv[2]):
        print(record)
