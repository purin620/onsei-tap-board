# 宮古湾 遊漁船 釣果集約アプリ (個人利用)

岩手県宮古市・宮古湾の遊漁船4隻（ゆたか丸・平進丸・こうしん丸・隆勝丸）の釣果情報を
自然条件（潮・水温・気温・風）と突き合わせて分析するための個人用アプリ。

このディレクトリは `onsei-tap-board`（音声タップボード）リポジトリとは無関係の
別プロジェクトで、同リポジトリ内にサブディレクトリとして配置している。

## 現在のフェーズ

- [x] Phase 1: DBスキーマ構築＋手動データ数件でプロトタイプ
- [x] Phase 2: 気象庁/Open-Meteo等、外部API連携（下記「Phase 2について」の要確認事項あり）
- [ ] Phase 3: 4隻のサイト構造調査→1隻分のスクレイパー試作
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

## スキーマ (`schema.sql`)

- `boats`: 船マスタ（船名・Instagram・公式サイトURL）
- `posts`: 各船の釣果記事（日付・タイトル・本文・画像URL・取得元）
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

## 次にやること

Phase 3として、4隻（ゆたか丸・平進丸・こうしん丸・隆勝丸）の公式サイトに実際にアクセスして
釣果情報の掲載構造を調査し、まず1隻分のスクレイパーを試作する。
