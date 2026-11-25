// 起動
import { boot, S, player } from './app.js';
import { openPanel, initPanel } from './panel.js';

initPanel();
// 動作確認（自動テスト）用の入り口
window.__ongaku = { S, player };
boot({ openPanel });

// オフラインで使えるようにする（https または localhost のときだけ動く）
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* オフライン機能なしで動作 */ });
  });
}
