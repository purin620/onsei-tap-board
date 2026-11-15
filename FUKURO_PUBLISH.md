# ふくろで つくりおき：公開と iPhone 確認のメモ

## 1. 取り込み状況（2026-11-15）

ユーザーから受け取った ZIP（`fukuro-claude-handoff.zip`）の「ふくろでつくりおき」フォルダの中身を、
作り直さずにそのまま `fukuro/` へ取り込んだ。既存の音声タップボード、`kotoba/`、`reji/` は変更していない。

```
onsei-tap-board/
└─ fukuro/
   ├─ index.html              … アプリ本体（Codex 改修版）
   ├─ manifest.webmanifest / app-icon.png
   ├─ illustrations/*.svg     … 11 種類のイラスト原本（index.html にも内蔵）
   ├─ tests/acceptance.cjs    … 受け入れテスト
   └─ CLAUDE_HANDOFF.md / AGENTS.md / CODEX_HANDOFF.md / README.md / TEST_RESULTS.md / CODEX_PROMPT.md
```

- 作業ブランチ：`claude/fukuro-iphone-safari-rh5vyt`
- テスト結果：`fukuro/TEST_RESULTS.md` に追記

## 2. 公開方法（案・**未承認**）

| 項目 | 内容 |
|---|---|
| 方法 | GitHub Pages（`kotoba/` と同じ仕組み。`main` ブランチ `/(root)` から配信） |
| URL（予定） | `https://purin620.github.io/onsei-tap-board/fukuro/` |
| 公開範囲 | **URL を知っている人は誰でも閲覧可**。検索結果に出る可能性もある。リポジトリも公開のため、ソース・資料（`fukuro/*.md`）も誰でも閲覧可 |
| 公開される内容 | 献立・分量・切り方・買い物リスト・イラスト・引き継ぎ資料。個人名や連絡先は含まない |
| 保存データ | チェック状態は各端末の localStorage（`fukuro-v1`）だけ。サーバーへは送らない。他人がURLを開いても、本人のチェックは見えない |
| 公開の操作 | 作業ブランチを `main` へマージした時点で公開される → **マージ前に必ず本人の承認を得る** |

本人限定公開（認証付き）は GitHub Pages ではできない。希望があれば別方法を比較して提案する（未承認）。

## 3. 公開前に行うこと

1. [x] `fukuro/` を作業ブランチへ取り込み
2. [x] `cd fukuro && python3 -m http.server 8000` で起動し、`CHROMIUM_ONLY=1 node tests/acceptance.cjs` が成功
3. [x] GitHub Pages と同じサブパス（`/onsei-tap-board/fukuro/`）配信で、画像・マニフェスト読み込みと保存が動くことを Chromium で確認
4. [ ] 公開内容・公開範囲について本人の承認
5. [ ] 承認後に `main` へマージ → 数分後に公開 URL を確認

この作業環境からは `github.io` へ接続できないため、公開後の URL の表示確認は本人の iPhone で行う。

## 4. iPhone Safari での確認手順（公開後）

1. iPhone の **Safari** で公開 URL を開く（LINE やメールのアプリ内ブラウザではなく Safari で）
2. 白菜の画面で ①〜④ に各 250g が出ていること。① だけチェック → その場でチェックが付き、画面が飛ばないこと
3. 「次の食材へ」で **しめじ** へ進む → ①80g／④80g／⑥80g／⑦60g と表示されること
4. 「前へ」で白菜に戻る → ① のチェックが残っていること
5. アドレスバーの ↻ で **再読み込み** → チェックが残っていること
6. （任意）4つのタブ、料理する画面の曜日、買い物のチェック、リセットの確認が動くこと
7. （任意）共有ボタン → 「ホーム画面に追加」でアイコンから開けること

結果（OK／NG と、NG のときの画面の様子）を伝えてもらい、`fukuro/TEST_RESULTS.md` に記録する。

## 5. 未確認事項

- iPhone Safari 実機：未確認
- WebKit 自動テスト：未実施（Codex 環境はライブラリ不足、この環境はダウンロードがネットワーク制限で失敗）
- 公開後の HTTPS 上での動作：未確認（未公開）
- Chromium の結果を Safari 確認済みとは扱わない
- オフライン動作・端末間同期：未実装
