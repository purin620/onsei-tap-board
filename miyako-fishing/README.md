# 宮古湾 遊漁船 釣果集約アプリ (個人利用)

岩手県宮古市・宮古湾の遊漁船4隻（ゆたか丸・平進丸・こうしん丸・隆勝丸）の釣果情報を
自然条件（潮・水温・気温・風）と突き合わせて分析するための個人用アプリ。

このディレクトリは `onsei-tap-board`（音声タップボード）リポジトリとは無関係の
別プロジェクトで、同リポジトリ内にサブディレクトリとして配置している。

## 現在のフェーズ

- [x] Phase 1: DBスキーマ構築＋手動データ数件でプロトタイプ
- [x] Phase 2: 気象庁/Open-Meteo等、外部API連携（下記「Phase 2について」の要確認事項あり）
- [x] Phase 3: 4隻のサイト構造調査→1隻分のスクレイパー試作（下記「Phase 3について」の要確認事項あり）
- [ ] Phase 4: 残り3隻へ横展開
- [ ] Phase 5: Claude APIでの本文構造化抽出
- [ ] Phase 6: 分析・可視化ダッシュボード（Streamlitなど）

## セットアップ (Phase 1)

```bash
cd miyako-fishing
pip install -r requirements.txt
python init_db.py          # miyako_fishing.db を作成
python seed_sample_data.py # 4隻のマスタ登録＋手動サンプルデータ投入
python query.py            # posts+extracted+conditions のJOIN結果を確認
```

## 実行例 (Phase 2)

```bash
python test_fetch_weather.py                      # オフラインでのパース処理検証
python fetch_weather.py 2026-05-01 2026-05-07      # Open-Meteoから気温・風を取得して表示
python update_conditions.py 2026-05-01 2026-05-07  # conditionsテーブルへ反映
```

## 実行例 (Phase 3)

```bash
python test_scraper_yutakamaru.py  # オフラインでのパース処理検証
python test_persist_posts.py       # DB保存(重複排除)の検証
python persist_posts.py 1          # ゆたか丸のカテゴリ1ページ分を取得してDBへ保存
```

## スキーマ (`schema.sql`)

- `boats`: 船マスタ（船名・Instagram・公式サイトURL）
- `posts`: 各船の釣果記事（日付・タイトル・本文・アイキャッチ画像URL・取得元・元記事URL）
- `post_images`: 1記事に複数枚含まれる写真のURL一覧（ギャラリー投稿対応、Phase 3で追加）
- `extracted`: `posts` からAI抽出した釣果情報（魚種・匹数or段階評価・サイズ・タックル情報・信頼度メモ）
- `conditions`: 日付ごとの自然条件（潮回り・満潮干潮時刻・水温・気温・風）

`seed_sample_data.py` のサンプル釣果・自然条件データは動作確認用のダミー値であり、
実データではない。実データ投入はPhase3以降のスクレイパー実装後に行う。

## Phase 2について（外部API連携）

- `fetch_weather.py`: Open-Meteo Historical Weather API（緯度経度ベース、宮古の座標を使用）から
  日別の最高・最低気温、最大風速・風向を取得する。ERA5再解析データであり、アメダス実測値ではない点に注意。
- `fetch_tide.py`: tide736.net API から潮回り（大潮/中潮/小潮等）・満潮/干潮時刻を取得する骨組み。
- `update_conditions.py`: 上記2つを日付範囲でまとめて取得し、`conditions` テーブルに反映する
  （既存の`water_temp`は上書きしない）。

**要確認・未解決事項（このセッションではネットワーク制限により確認不可）：**

1. `config.py` の `TIDE_HC`（宮古の港コード）が未設定。tide736.net の港一覧ページで確認して設定が必要。
2. `fetch_tide.py` の `parse_tide_response()` は公開情報からの推定で実装しており、
   実際のレスポンスJSON構造で動作確認・修正が必要（`test_fetch_weather.py` のように
   実レスポンスを使ったテストを追加すること）。
3. 水温（`water_temp`）の取得元は設計メモの通りまだ未調査。宮古湾ピンポイントのデータソースを
   調べてPhase 2の追加、またはPhase 3以降で対応する。

`fetch_weather.py` のレスポンス解析ロジック(`parse_daily_response`)は
`test_fetch_weather.py` でオフライン検証済み（`python test_fetch_weather.py`）。
ただしAPIへの実際のHTTPリクエストは、ネットワークアクセス可能な環境で
`python fetch_weather.py 2026-05-01 2026-05-07` のように実行して確認すること。

## Phase 3について（サイト構造調査＋1隻分のスクレイパー試作）

**このセッションでは4隻のサイト（yutakamaru1.com / zekkouchou.com / koushinmaru-miyako.com /
ryushomaru.co.jp）への直接アクセスがサンドボックスのegressポリシーでブロックされており、
「実際にアクセスして構造を調査する」ことができなかった。** 代わりにWeb検索で得られる
断片的な情報から構造を推定している。ネットワークアクセス可能な環境で実際にサイトを開いて
確認・検証すること。

### 調査でわかったこと（Web検索ベース、未検証）

- **ゆたか丸**: WordPressサイト。釣果カテゴリページ `https://yutakamaru1.com/category/tyouka/`、
  個別記事は `https://yutakamaru1.com/<数字>/` という永続リンク形式。WordPressのREST API
  (`/wp-json/wp/v2/posts`) がデフォルトで有効なことが多いため、HTMLスクレイピングより
  こちらを優先する方針にした。→ `scraper_yutakamaru.py` として試作。
- **平進丸**: 公式サイト内に `zekkouchou.com/si/pmrun/sokuhou.cgi?...` という
  「釣果速報」用の別システム(CGI)が存在する可能性がある。この`pmrun/sokuhou.cgi`という
  URLパターンは他地域の釣船サイトでも見られ、複数の釣船が共通のベンダー提供システムを
  使っている可能性がある（要確認）。実際の出力形式・パラメータ意味は未調査。
- **こうしん丸**: 検索結果からは店舗情報・Instagram・LINE公式アカウントの存在は確認できたが、
  釣果情報専用ページの構造は特定できなかった。設計メモの通りLinktree型で営業情報と
  釣果報告が混在している可能性が高い。
- **隆勝丸**: `ryushomaru.co.jp/page1.html` がトップページ。単純なページ構成と見られるが
  詳細構造は未調査。ホタテ漁との兼業で出船が不定期なため、更新頻度自体が低いと想定される。

### 実装したもの（ゆたか丸のみ、Phase 3の範囲）

- `scraper_yutakamaru.py`: WordPress REST APIから釣果カテゴリの記事を取得し、
  日付・タイトル・本文（HTML除去済みのプレーンテキスト）・アイキャッチ画像URL・記事URLを抽出。
- `html_text.py`: HTML本文から改行を保ったプレーンテキストを抽出する小さいユーティリティ。
- `persist_posts.py`: 取得結果を`posts`テーブルへ保存。`source_url`をキーに重複を排除し、
  再実行しても同じ記事が重複登録されない（`test_persist_posts.py`で検証済み）。
- スキーマに `posts.source_url` 列と一意インデックスを追加（重複排除のため）。

### 実データ検証結果（2026-09-20、ユーザーがブラウザで確認）

`https://yutakamaru1.com/wp-json/wp/v2/categories?slug=tyouka` と
`https://yutakamaru1.com/wp-json/wp/v2/posts?categories=1&_embed=1&per_page=1` の
実レスポンスで以下が確認できた。

- カテゴリスラッグ`tyouka`は正しく、`name`は「釣果情報」、記事数425件、`id`は1。
- WordPress REST APIは有効。`date`/`title.rendered`/`content.rendered`/`link`/
  `_embedded.wp:featuredmedia[0].source_url`はすべて想定通りの構造。
- **新たな発見**: 本文(`content.rendered`)の先頭にGoogleアドセンスの広告`<script>`が
  `<aside>`で挿入されている（中身が空のため`html_to_text()`には影響なし、テストにも追加済み）。
- **新たな発見（重要・スキーマ修正済み）**: 1記事にギャラリー形式で複数枚(確認できた例では4枚)の
  写真が含まれる。アイキャッチ画像(`wp:featuredmedia`)はそのうちの1枚に過ぎず、
  取りこぼしていた。→ `post_images`テーブルを追加し、本文中の全`<img src>`を
  `extract_image_urls()`(`html_text.py`)で取得して保存するよう修正した
  （`posts.image_url`はアイキャッチ、無ければ本文1枚目を後方互換として保持）。

### 残っている要確認事項

1. サイトがWordPress REST APIを無効化する変更をした場合、`scraper_yutakamaru.py`は動作しない
   （その場合はHTMLスクレイピングへの切り替えが必要）。
2. 平進丸・こうしん丸・隆勝丸の実際のページ構造はまだ調査できていない（Phase 4で対応）。

`parse_posts_response()`は`test_scraper_yutakamaru.py`で実データの構造を反映した
サンプルで検証済み。実際の全ページ取得・DB保存は`python persist_posts.py`で確認すること。

## 次にやること

Phase 4として、平進丸・こうしん丸・隆勝丸の3隻について実際にサイトへアクセスして構造を確認し、
それぞれ専用のスクレイパーを実装する。
