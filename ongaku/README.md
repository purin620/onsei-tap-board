# おんがくスイッチ

特別支援学校小学部の児童が、**外部スイッチを1回押すだけ**で音楽を流したり止めたりできる、iPad向けの教材です。
YouTubeのように操作ボタンが隠れたり、2回押しが必要になったりすることはありません。

- iPadのSafariで動くWebアプリです（アプリストアからのインストールは不要）。
- 「ホーム画面に追加」すると、アプリのように全画面で使えます。
- 一度開いたあとは、**インターネットがなくても使えます**。
- 音楽・設定・学習記録は**そのiPadの中だけ**に保存されます。外部へは送信しません。
- Googleアカウントなどへのログインや、有料サービスの契約は必要ありません。

## 資料

| 資料 | 内容 |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | iPadへの導入手順・音楽ファイルの追加方法・外部スイッチの設定方法 |
| [docs/MANUAL.md](docs/MANUAL.md) | 先生用の操作マニュアル（学習モード・記録・バックアップ）と、学習指導要領との関連 |
| [docs/CHECKLIST.md](docs/CHECKLIST.md) | 動作確認チェックリスト（自動確認の結果と、iPad実機で確認する項目） |
| [docs/DEVLOG.md](docs/DEVLOG.md) | 開発記録・仮に決めた仕様・今後の機能追加の候補 |

## 公開URL（予定）

`https://purin620.github.io/onsei-tap-board/ongaku/`

※ このURLで使えるようになるのは、作業ブランチを `main` に取り込んだ（マージした）あとです。

## できること（バージョン 1.0.0）

| 段階 | 機能 | 状態 |
|---|---|---|
| 第1段階 | 音楽ファイルの追加・保存、再生・停止、一定時間再生、曲送り、大きな操作ボタン、外部スイッチ入力、スイッチ入力テスト | 作成済み |
| 第2段階 | 2スイッチ操作、プレイリスト管理、サビなどの部分再生、曲ごとの音量、色・大きさの設定、オフライン利用、押している間だけ再生 | 作成済み |
| 第3段階 | 学習記録（自動）、先生の観察記録、グラフ、CSV出力、バックアップ・復元、複数児童 | 作成済み |

すべて **iPad実機では未検証** です。実機での確認は [docs/CHECKLIST.md](docs/CHECKLIST.md) を使ってください。

## ファイル構成

```
ongaku/
├─ index.html            … 画面
├─ css/app.css           … デザイン
├─ js/
│  ├─ main.js            … 起動
│  ├─ app.js             … 児童用画面・学習モード・自動記録
│  ├─ player.js          … 音を鳴らす部分（Web Audio API）
│  ├─ input.js           … スイッチ入力（キー・タッチ・二重入力の防止）
│  ├─ panel.js           … 先生用の設定画面
│  ├─ records.js         … 学習記録・グラフ・CSV
│  ├─ backup.js          … バックアップ・復元
│  ├─ db.js              … 端末内の保存（IndexedDB）
│  └─ ui.js              … ダイアログなどの部品
├─ sw.js                 … オフライン用（Service Worker）
├─ manifest.webmanifest, icon.svg, apple-touch-icon.png, icon-512.png
├─ tests/acceptance.cjs  … 自動テスト（Chromium）
└─ docs/                 … 資料
```

## 自動テストの実行（開発者向け）

```
cd onsei-tap-board
python3 -m http.server 8123
node ongaku/tests/acceptance.cjs      # 別のターミナルで
```

ビルドは不要です。ファイルを書き換えたら、`sw.js` の `VERSION` の数字も変えてください（iPadに新しい版が届くようになります）。
