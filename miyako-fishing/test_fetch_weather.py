"""fetch_weather.parse_daily_response のオフライン検証。

このサンドボックスは open-meteo.com への外部通信がネットワークポリシーで
ブロックされているため、実際のHTTPレスポンスでは検証できていない。
ここでは公式ドキュメント記載のレスポンス形式を模したダミーJSONで
パース処理のみを検証する。
"""

from fetch_weather import degrees_to_compass_ja, parse_daily_response

SAMPLE_RESPONSE = {
    "latitude": 39.64,
    "longitude": 141.96,
    "daily": {
        "time": ["2026-05-10", "2026-05-11"],
        "temperature_2m_max": [20.0, 19.5],
        "temperature_2m_min": [12.0, 13.0],
        "wind_speed_10m_max": [3.0, 2.5],
        "wind_direction_10m_dominant": [45, 0],
    },
}


def test_parse_daily_response():
    records = parse_daily_response(SAMPLE_RESPONSE)
    assert records == [
        {"date": "2026-05-10", "air_temp_max": 20.0, "air_temp_min": 12.0,
         "wind_dir": "北東", "wind_speed": 3.0},
        {"date": "2026-05-11", "air_temp_max": 19.5, "air_temp_min": 13.0,
         "wind_dir": "北", "wind_speed": 2.5},
    ]


def test_degrees_to_compass_ja():
    assert degrees_to_compass_ja(0) == "北"
    assert degrees_to_compass_ja(90) == "東"
    assert degrees_to_compass_ja(180) == "南"
    assert degrees_to_compass_ja(359) == "北"


if __name__ == "__main__":
    test_parse_daily_response()
    test_degrees_to_compass_ja()
    print("OK")
