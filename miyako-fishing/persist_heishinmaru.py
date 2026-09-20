"""平進丸のスクレイパー結果をDBへ保存する。

posts への保存に加えて、平進丸のページ自体が公開している潮回り(tide_type)を
conditions テーブルにも反映する。tide736.net の港コード(TIDE_HC)が
まだ未確認のPhase 2の代わりに、実際に潮回りが取れる貴重なデータ源になる。
"""

from persist_posts import insert_posts
from scraper_heishinmaru import fetch_rendered_html, parse_catch_blocks
from update_conditions import upsert_conditions

BOAT_NAME = "平進丸"


def run() -> None:
    html = fetch_rendered_html()
    records = parse_catch_blocks(html)

    inserted = insert_posts(BOAT_NAME, records)
    print(f"Fetched {len(records)} entries, inserted {inserted} new post(s).")

    tide_records = [
        {"date": r["date"], "tide_type": r["tide_type"]}
        for r in records if r.get("tide_type")
    ]
    if tide_records:
        upsert_conditions(tide_records)
        print(f"Updated tide_type for {len(tide_records)} day(s) from heishinmaru's page.")


if __name__ == "__main__":
    run()
