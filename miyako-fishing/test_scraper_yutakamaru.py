"""scraper_yutakamaru.parse_posts_response のオフライン検証。

このサンドボックスは yutakamaru1.com への外部通信がブロックされているため、
実際のHTTPレスポンスでは検証できていない。WordPress REST APIの標準仕様に基づく
ダミーJSONでパース処理のみを検証する。
"""

from scraper_yutakamaru import parse_posts_response

# 実際のレスポンス(2026-09-12取得分)を参考にした形。本文冒頭に広告<aside>が入り、
# 複数枚の写真がwp-block-galleryで並ぶ点を再現している。
SAMPLE_RESPONSE = [
    {
        "date": "2026-05-10T09:00:00",
        "title": {"rendered": "本日の釣果"},
        "content": {"rendered": (
            '<aside class="row veu insertAds before"><div class="col-md-12">'
            '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js">'
            "</script></div></aside>\n\n"
            '<p class="wp-block-paragraph">本日は<strong>ヒラメ</strong>3枚上がりました。<br>'
            "サイズは50cm前後。</p>\n\n"
            '<figure class="wp-block-gallery"><figure class="wp-block-image">'
            '<img loading="lazy" width="768" height="1024" '
            'src="https://yutakamaru1.com/wp-content/uploads/2026/05/IMG_1-768x1024.jpeg" alt=""/>'
            "</figure><figure class=\"wp-block-image\">"
            '<img loading="lazy" width="768" height="1024" '
            'src="https://yutakamaru1.com/wp-content/uploads/2026/05/IMG_2-768x1024.jpeg" alt=""/>'
            "</figure></figure>"
        )},
        "link": "https://yutakamaru1.com/4735/",
        "_embedded": {
            "wp:featuredmedia": [
                {"source_url": "https://yutakamaru1.com/wp-content/uploads/2026/05/IMG_1-scaled.jpeg"}
            ]
        },
    },
    {
        "date": "2026-05-11T08:30:00",
        "title": {"rendered": "本日は欠航"},
        "content": {"rendered": "<p>本日は海況不良のため欠航しました。</p>"},
        "link": "https://yutakamaru1.com/4736/",
        "_embedded": {},
    },
]


def test_parse_posts_response():
    records = parse_posts_response(SAMPLE_RESPONSE)

    assert records[0]["date"] == "2026-05-10"
    assert records[0]["title"] == "本日の釣果"
    assert "ヒラメ" in records[0]["body_raw"]
    assert "adsbygoogle" not in records[0]["body_raw"]  # 広告scriptの中身が紛れ込まない
    assert records[0]["image_url"] == "https://yutakamaru1.com/wp-content/uploads/2026/05/IMG_1-scaled.jpeg"
    assert records[0]["image_urls"] == [
        "https://yutakamaru1.com/wp-content/uploads/2026/05/IMG_1-768x1024.jpeg",
        "https://yutakamaru1.com/wp-content/uploads/2026/05/IMG_2-768x1024.jpeg",
    ]
    assert records[0]["source_url"] == "https://yutakamaru1.com/4735/"
    assert records[0]["source"] == "site"

    assert records[1]["date"] == "2026-05-11"
    assert records[1]["image_url"] is None
    assert records[1]["image_urls"] == []


if __name__ == "__main__":
    test_parse_posts_response()
    print("OK")
