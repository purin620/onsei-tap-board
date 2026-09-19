# 宮古湾 遊漁船 釣果集約アプリ (個人利用)

岩手県宮古市・宮古湾の遊漁船4隻（ゆたか丸・平進丸・こうしん丸・隆勝丸）の釣果情報を
自然条件（潮・水温・気温・風）と突き合わせて分析するための個人用アプリ。

このディレクトリは `onsei-tap-board`（音声タップボード）リポジトリとは無関係の
別プロジェクトで、同リポジトリ内にサブディレクトリとして配置している。

## 現在のフェーズ

- [x] Phase 1: DBスキーマ構築＋手動データ数件でプロトタイプ
- [ ] Phase 2: 気象庁/Open-Meteo等、外部API連携
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

## スキーマ (`schema.sql`)

- `boats`: 船マスタ（船名・Instagram・公式サイトURL）
- `posts`: 各船の釣果記事（日付・タイトル・本文・画像URL・取得元）
- `extracted`: `posts` からAI抽出した釣果情報（魚種・匹数or段階評価・サイズ・タックル情報・信頼度メモ）
- `conditions`: 日付ごとの自然条件（潮回り・満潮干潮時刻・水温・気温・風）

`seed_sample_data.py` のサンプル釣果・自然条件データは動作確認用のダミー値であり、
実データではない。実データ投入はPhase3以降のスクレイパー実装後に行う。

## 次にやること

Phase 2として、気象庁またはOpen-Meteo APIから宮古観測点の気温・風データを取得する
スクリプトを作成し、`conditions` テーブルに投入する処理を実装する。
