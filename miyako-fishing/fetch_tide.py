"""tide736.net API から宮古の潮汐データ(潮回り・満潮/干潮時刻)を取得する。

【要確認】config.TIDE_HC (宮古の港コード) が未設定。
本セッションでは tide736.net への外部アクセスがサンドボックスのegressポリシーで
ブロックされており、(1)宮古のhc値、(2)実際のレスポンスJSONの正確なキー構造の
どちらも実機で確認できていない。以下は公開されている説明(pc/hc/yr/mn/dy/rgパラメータ、
満潮・干潮・潮回りを含むJSONを返す)に基づく実装であり、ネットワークアクセス可能な
環境で実レスポンスを確認したうえで parse_tide_response() を調整すること。
"""

import requests

from config import TIDE_HC, TIDE_PC

TIDE_URL = "https://api.tide736.net/get_tide.php"


def parse_tide_response(data: dict) -> list[dict]:
    """tide736.net のレスポンス(dict)を conditions 用のレコードに変換する。

    【要確認】実際のキー名は公開情報からの推定。tide一覧の各要素に
    date, moon_age, tide(潮回り名), tide_times(満潮/干潮の時刻リスト)が
    含まれる想定だが、実レスポンスで確認・修正が必要。
    """
    records = []
    for day in data.get("tide", []):
        highs = [t["time"] for t in day.get("tide_times", []) if t.get("tide") == "満潮"]
        lows = [t["time"] for t in day.get("tide_times", []) if t.get("tide") == "干潮"]
        records.append({
            "date": day["date"],
            "tide_type": day.get("tide"),
            "high_tide_time": highs[0] if highs else None,
            "low_tide_time": lows[0] if lows else None,
        })
    return records


def fetch_tide(year: int, month: int, day: int, days: int = 1) -> list[dict]:
    if TIDE_HC is None:
        raise RuntimeError(
            "config.TIDE_HC が未設定です。tide736.net の港一覧で宮古のhcを確認して"
            "config.py に設定してください。"
        )
    params = {"pc": TIDE_PC, "hc": TIDE_HC, "yr": year, "mn": month, "dy": day, "rg": days}
    resp = requests.get(TIDE_URL, params=params, timeout=30)
    resp.raise_for_status()
    return parse_tide_response(resp.json())


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 4:
        print("usage: python fetch_tide.py <year> <month> <day>")
        sys.exit(1)
    for record in fetch_tide(int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])):
        print(record)
