# ふくろで つくりおき：公開と iPhone 確認の準備メモ

アプリ本体（Codex で改修した `index.html`、`tests/acceptance.cjs`、各引き継ぎ資料）は、
2026-11-15 時点でこのリポジトリのどのブランチにもありません。届いたら下の手順で進めます。

## 1. ファイルの置き場所（予定）

```
onsei-tap-board/
└─ fukuro/
   ├─ index.html          … Codex 改修版（作り直さない）
   ├─ （イラスト等の同梱ファイル）
   ├─ tests/acceptance.cjs
   └─ CLAUDE_HANDOFF.md / AGENTS.md / CODEX_HANDOFF.md / TEST_RESULTS.md / CODEX_PROMPT.md
```

- 送り先ブランチ：`claude/fukuro-iphone-safari-rh5vyt`
- iPhone だけで送る場合：Codex（Web 版）の作業画面で「PR を作成」または「ブランチへ push」を選び、
  リポジトリ `purin620/onsei-tap-board` を指定する。

## 2. 公開方法（案・未承認）

| 項目 | 内容 |
|---|---|
| 方法 | GitHub Pages（`kotoba/` と同じ仕組み。`main` ブランチ `/` から配信） |
| URL（予定） | `https://purin620.github.io/onsei-tap-board/fukuro/` |
| 公開範囲 | **URL を知っている人は誰でも閲覧可**。リポジトリも公開のため、ソースも誰でも閲覧可 |
| 保存データ | チェック状態は各端末の localStorage（`fukuro-v1`）だけ。サーバーへは送らない |
| 公開の操作 | `fukuro/` を `main` へマージした時点で公開される → **マージ前に必ず本人の承認を得る** |

本人限定にしたい場合は GitHub Pages では不可。別の方法（認証付きホスティング）を比較して提案する。

## 3. 公開前に行うこと

1. 資料を読み、`cd fukuro && python3 -m http.server 8000` で起動
2. 別ターミナルで `CHROMIUM_ONLY=1 node tests/acceptance.cjs`
   （この作業環境では WebKit のダウンロードがネットワーク制限で失敗するため Chromium のみ）
3. テスト結果を `TEST_RESULTS.md` に追記
4. 公開内容・公開範囲を示して承認を得てから `main` へマージ

## 4. iPhone Safari での確認手順（公開後）

1. iPhone の **Safari** で公開 URL を開く（LINE やメールのアプリ内ブラウザではなく Safari で）
2. 白菜の画面で、チェックを入れる → 画面が飛ばず、その場でチェックが付くこと
3. 「つぎ」で **しめじ** へ進む → ①80g／④80g／⑥80g／⑦60g と表示されること
4. 「もどる」で白菜に戻る → チェックが残っていること
5. 画面上部のアドレスバー横の ↻ で **再読み込み** → チェックが残っていること
6. （任意）共有ボタン → 「ホーム画面に追加」でアイコンから開けること

結果（OK／NG と、NG のときの画面の様子）を伝えてもらう。

## 5. 未確認事項

- iPhone Safari 実機：未確認
- WebKit 自動テスト：未実施（Codex 環境はライブラリ不足、この環境はダウンロード制限）
- Chromium の結果を Safari 確認済みとは扱わない
