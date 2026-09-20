"""scraper_heishinmaru.parse_catch_blocks のオフライン検証。

Playwrightでの実際のブラウザ描画は、この検証には含まれない(ネットワークが
必要なため)。ブラウザの「検証」機能で2026-09-20に確認した実際のDOM構造を
再現したHTML文字列でパース処理のみを検証する。
"""

from scraper_heishinmaru import parse_catch_blocks

SAMPLE_HTML = """
<section class="catch-wrap">
  <div id="catch_list">
    <div class="catch-block">
      <haeader class="catch-head">
        <div class="inner">
          <div class="catch-head-data">
            <p class="catch-date">2026年09月15日（火）<span class="catch-tide">【中潮】</span></p>
          </div>
        </div>
      </haeader>
      <div class="catch-photo">
        <img src="https://www.chowari.jp/choka_img/5317272_1.jpeg">
        <img src="https://www.chowari.jp/choka_img/5317272_2.jpeg">
      </div>
      <div class="catch-info">
        <div class="catch-info-comment">
          <p>○9月15日夜イカ釣り<br>竿頭100杯以上<br>出だしから調子よく<br><br>○9月14日夜イカ釣り<br>竿頭75杯</p>
        </div>
      </div>
      <div class="catch-tidegraph">(未解析)</div>
    </div>
    <ul class="catch-ad"><li>広告</li></ul>
    <div class="catch-block">
      <haeader class="catch-head">
        <div class="inner">
          <div class="catch-head-data">
            <p class="catch-date">2026年09月10日（木）<span class="catch-tide">【大潮】</span></p>
          </div>
        </div>
      </haeader>
      <div class="catch-photo"></div>
      <div class="catch-info">
        <div class="catch-info-comment"><p>本日は欠航しました。</p></div>
      </div>
      <div class="catch-tidegraph"></div>
    </div>
  </div>
</section>
"""


def test_parse_catch_blocks():
    records = parse_catch_blocks(SAMPLE_HTML)
    assert len(records) == 2

    first = records[0]
    assert first["date"] == "2026-09-15"
    assert first["tide_type"] == "中潮"
    assert "9月15日夜イカ釣り" in first["body_raw"]
    assert "9月14日夜イカ釣り" in first["body_raw"]
    assert first["image_urls"] == [
        "https://www.chowari.jp/choka_img/5317272_1.jpeg",
        "https://www.chowari.jp/choka_img/5317272_2.jpeg",
    ]
    assert first["source_url"] == "https://zekkouchou.com/heishinmaru/catch.php#2026年09月15日（火）"

    second = records[1]
    assert second["date"] == "2026-09-10"
    assert second["tide_type"] == "大潮"
    assert second["image_urls"] == []


if __name__ == "__main__":
    test_parse_catch_blocks()
    print("OK")
