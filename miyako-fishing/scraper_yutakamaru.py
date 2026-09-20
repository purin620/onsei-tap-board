"""ゆたか丸 (yutakamaru1.com) の釣果情報スクレイパー。

サイトが WordPress で、記事カテゴリページが https://yutakamaru1.com/category/tyouka/ 、
個別記事が https://yutakamaru1.com/<数字>/ という永続リンク形式であることから、
WordPress REST API (wp-json、デフォルトで有効なことが多い) を利用する。
HTMLを直接スクレイピングするより構造化されたデータ(JSON)が得られ、
サイトのデザイン変更にも影響されにくい。

【要確認】本セッションでは yutakamaru1.com への外部アクセスがサンドボックスの
egressポリシーでブロックされており、実際のAPIレスポンスで動作確認できていない。
- CATEGORY_SLUG = "tyouka" は https://yutakamaru1.com/category/tyouka/ というURLから
  推定したスラッグであり、確認が必要。
- サイトがREST APIを無効化(セキュリティプラグイン等)している場合はこのスクレイパーは
  動作せず、HTMLスクレイピングへの切り替えが必要になる。
ネットワークアクセス可能な環境で `python scraper_yutakamaru.py` を実行し、
実データで検証・調整すること。
"""

import requests

from html_text import extract_image_urls, html_to_text

SITE_URL = "https://yutakamaru1.com"
CATEGORY_SLUG = "tyouka"  # 「釣果情報」カテゴリ


def _get_category_id(slug: str) -> int:
    resp = requests.get(f"{SITE_URL}/wp-json/wp/v2/categories", params={"slug": slug}, timeout=30)
    resp.raise_for_status()
    results = resp.json()
    if not results:
        raise RuntimeError(f"category slug '{slug}' が見つかりません")
    return results[0]["id"]


def parse_posts_response(items: list[dict]) -> list[dict]:
    """WP REST API の posts レスポンス(`_embed=1`込み)を posts テーブル用レコードに変換する。

    実データ確認により、本文(content.rendered)にはギャラリー形式で複数枚の写真が
    含まれることが分かった(1記事に4枚など)。アイキャッチ画像(featuredmedia)は
    そのうちの1枚に過ぎないため、本文中の全<img>を "image_urls" として別途返し、
    "image_url" は後方互換のためアイキャッチ(無ければ本文1枚目)を入れておく。
    """
    records = []
    for item in items:
        content_html = item["content"]["rendered"]
        content_image_urls = extract_image_urls(content_html)

        featured_image_url = None
        embedded_media = item.get("_embedded", {}).get("wp:featuredmedia")
        if embedded_media:
            featured_image_url = embedded_media[0].get("source_url")

        image_url = featured_image_url or (content_image_urls[0] if content_image_urls else None)

        records.append({
            "date": item["date"][:10],  # 'YYYY-MM-DDTHH:MM:SS' -> 'YYYY-MM-DD'
            "title": html_to_text(item["title"]["rendered"]),
            "body_raw": html_to_text(content_html),
            "image_url": image_url,
            "image_urls": content_image_urls,
            "source": "site",
            "source_url": item["link"],
        })
    return records


def fetch_posts(max_pages: int = 5, per_page: int = 20) -> list[dict]:
    category_id = _get_category_id(CATEGORY_SLUG)
    all_records = []
    for page in range(1, max_pages + 1):
        resp = requests.get(
            f"{SITE_URL}/wp-json/wp/v2/posts",
            params={"categories": category_id, "per_page": per_page, "page": page, "_embed": 1},
            timeout=30,
        )
        if resp.status_code == 400:
            break  # WP REST APIはページ範囲外だと400を返す
        resp.raise_for_status()
        items = resp.json()
        if not items:
            break
        all_records.extend(parse_posts_response(items))
    return all_records


if __name__ == "__main__":
    for record in fetch_posts(max_pages=1):
        print(record)
