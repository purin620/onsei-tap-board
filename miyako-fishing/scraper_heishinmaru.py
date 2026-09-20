"""平進丸 (zekkouchou.com/heishinmaru) の釣果情報スクレイパー。

【重要・確認済み】このページはHTMLを読み込んだ直後には釣果の中身が空で、
その後JavaScriptが内容を差し込む作りになっている(view-sourceで実際に確認済み:
「中潮」という文字が最初のHTMLには存在しなかった)。そのため通常の
requests.get()では中身を取得できず、Playwright(ブラウザを実際に動かして
描画させるツール)でページを開き、表示が終わるのを待ってからHTMLを取得する。

【確認済み】ブラウザの「検証」機能で2026-09-20に実際の表示を確認し、
以下の構造を確認した。
- 1回分の更新は <div class="catch-block"> で区切られる
  (間に <ul class="catch-ad"> という広告ブロックが挟まる。catch-blockだけを見ればよい)
- 日付: <p class="catch-date"> の直接のテキスト。例: "2026年09月15日（火）"
- 潮回り: 同じ<p>内の <span class="catch-tide">。例: "【中潮】"
- 釣果の文章: <div class="catch-info-comment"><p>...</p></div>
  改行(<br>)入りの自由文で、絵文字も含まれる。1つのブロックに複数日分の釣行
  (例: 9/15と9/14の両方)がまとめて書かれていることがある。日付ごとの分割は
  Phase 5のClaude API抽出に任せる方針。
- 写真: <div class="catch-photo"> 内の<img src="...">。画像は
  https://www.chowari.jp/choka_img/... という別ドメインでホストされている。

【要確認・未実装】<div class="catch-tidegraph"> に気温・水温・風などの
詳細情報があることは画面上で確認できているが、内部のタグ構造はまだ未確認。
今回は日付・潮回り・釣果文・写真の取得を優先し、気温等の構造化取得は次のステップとする。

【要確認】このページには記事ごとの個別URLが無いため、重複排除のキー
(source_url)は "SITE_URL#<日付の生テキスト>" を代用している。同じ日付の
内容が書き換わった場合は再取得されない点に注意。
"""

from bs4 import BeautifulSoup, NavigableString
from playwright.sync_api import sync_playwright

from jp_date import parse_japanese_date

SITE_URL = "https://zekkouchou.com/heishinmaru/catch.php"


def fetch_rendered_html(url: str = SITE_URL, wait_selector: str = "div.catch-block",
                         timeout_ms: int = 30000) -> str:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            page = browser.new_page()
            page.goto(url, timeout=timeout_ms)
            page.wait_for_selector(wait_selector, timeout=timeout_ms)
            html = page.content()
        finally:
            browser.close()
    return html


def parse_catch_blocks(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    records = []

    for block in soup.select("div.catch-block"):
        date_p = block.select_one("p.catch-date")
        if date_p is None:
            continue

        date_text = next(
            (c.strip() for c in date_p.contents if isinstance(c, NavigableString) and c.strip()),
            None,
        )
        tide_span = date_p.select_one("span.catch-tide")
        tide_type = tide_span.get_text(strip=True).strip("【】") if tide_span else None

        comment_p = block.select_one("div.catch-info-comment p")
        body_raw = comment_p.get_text("\n", strip=True) if comment_p else None

        image_urls = [img["src"] for img in block.select("div.catch-photo img") if img.get("src")]

        records.append({
            "posted_date_text": date_text,
            "date": parse_japanese_date(date_text),
            "tide_type": tide_type,
            "title": date_text,
            "body_raw": body_raw,
            "image_url": image_urls[0] if image_urls else None,
            "image_urls": image_urls,
            "source": "site",
            "source_url": f"{SITE_URL}#{date_text}" if date_text else None,
        })

    return [r for r in records if r["date"] is not None]


if __name__ == "__main__":
    html = fetch_rendered_html()
    for record in parse_catch_blocks(html):
        print(record)
