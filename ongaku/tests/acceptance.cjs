// おんがくスイッチ 受け入れテスト（Chromiumで自動確認）
// 使い方：リポジトリの一番上のフォルダで  python3 -m http.server 8123  を起動してから
//         node ongaku/tests/acceptance.cjs
// ※ iPad実機での確認の代わりにはなりません（実機の確認は docs/CHECKLIST.md）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BASE = process.env.BASE || 'http://localhost:8123/ongaku/';
const SHOTS = process.env.SHOTS || '';

function wav(sec, freq) {
  const sr = 22050; const n = Math.floor(sec * sr);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * freq * i / sr) * 8000), 44 + i * 2);
  return buf;
}

const results = [];
function check(name, ok, info = '') { results.push([ok, name, info]); console.log(`${ok ? '✔' : '✘'} ${name}${info ? '  (' + info + ')' : ''}`); }

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ongaku-'));
  const files = [['きらきらぼし', 20, 440], ['どんぐり', 20, 523], ['かえるのうた', 20, 659]].map(([n, s, f]) => {
    // ファイルの中身を直接わたす（パス指定はブラウザの権限で読めない環境があるため）
    return { name: n + '.wav', mimeType: 'audio/wav', buffer: wav(s, f) };
  });
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async (n) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, n + '.png') }); };
  const st = () => page.evaluate(() => ({ playing: window.__ongaku.S.playing, audio: window.__ongaku.player.playing, idx: window.__ongaku.S.idx, pos: window.__ongaku.S.pos, btn: document.querySelector('#btn1').dataset.state }));
  const wait = (ms) => page.waitForTimeout(ms);
  const press = async (k = 'Space') => { await page.keyboard.down(k); await wait(60); await page.keyboard.up(k); await wait(650); };

  // はじめて開いたとき、お試し用の曲が入っている
  {
    const p0 = await ctx.newPage();
    await p0.goto(BASE);
    await p0.waitForFunction(() => window.__ongaku && window.__ongaku.S.songs.size === 3, null, { timeout: 15000 });
    await p0.waitForSelector('#startGo:not([disabled])');
    await p0.click('#startGo');
    await p0.waitForTimeout(800);
    await p0.keyboard.press('Space'); await p0.waitForTimeout(500);
    const ok = await p0.evaluate(() => window.__ongaku.S.playing && window.__ongaku.player.playing);
    const names = await p0.evaluate(() => [...window.__ongaku.S.songs.values()].map((x) => x.name).join('・'));
    check('はじめて開くとお試し用の曲が3曲入っていて、すぐ再生できる', ok, names);
    await p0.keyboard.press('Space');
    await p0.close();
    // 以降のテストのために消す
    const pc = await ctx.newPage(); await pc.goto(BASE + '?nosamples');
    await pc.evaluate(() => new Promise((res) => { indexedDB.deleteDatabase('ongaku-switch').onsuccess = res; }));
    await pc.close();
  }
  await page.goto(BASE + '?nosamples');
  await page.waitForSelector('#startGo');
  await shot('01-start-empty');
  check('曲がないときは「学習スタート」が押せない', await page.isDisabled('#startGo'));

  // 曲の追加
  await page.click('#startSettings');
  await page.click('[data-tab="music"]');
  await page.setInputFiles('#fileIn', files);
  await page.waitForFunction(() => document.querySelectorAll('#panelBody .list li').length >= 3, null, { timeout: 40000 });
  check('音楽ファイルを3曲まとめて追加できる', true);
  await shot('02-settings-music');

  // モードA
  await page.click('#panelClose');
  await page.click('#startGo');
  await wait(800);
  await shot('03-stage-stopped');
  await press();
  let s = await st();
  check('A: 停止中に1回押すと音楽が流れる', s.playing && s.audio && s.btn === 'playing');
  await shot('04-stage-playing');
  await wait(1200);
  await press();
  s = await st();
  check('A: 再生中に1回押すと止まる', !s.playing && !s.audio && s.btn === 'stopped');
  check('A: 止めた位置を覚えている', s.pos > 1, 'pos=' + s.pos.toFixed(2));
  // 長押し
  await page.keyboard.down('Space');
  for (let i = 0; i < 15; i++) { await page.keyboard.down('Space'); await wait(40); }
  await page.keyboard.up('Space');
  await wait(600);
  s = await st();
  check('A: 長押ししても1回だけ反応（再生になる）', s.playing);
  await press();
  // 連続入力の防止
  await page.keyboard.press('Space'); await wait(80); await page.keyboard.press('Space'); await wait(700);
  s = await st();
  check('誤入力防止: 0.5秒以内の2回目は無視（再生のまま）', s.playing);
  await press();
  // 画面タッチ（pointerdown と click の二重反応がない）
  await page.click('#btn1'); await wait(700);
  s = await st();
  check('画面タッチ1回で1回だけ反応', s.playing);
  await page.click('#btn1'); await wait(700);
  s = await st();
  check('画面タッチでもう1回押すと止まる', !s.playing);

  // 設定を長押しで開く・スイッチ入力では開かない
  await press('Enter'); await press('Enter');
  check('スイッチ入力で設定画面が開かない', await page.isHidden('#panel'));
  const g = await page.locator('#gear').boundingBox();
  await page.mouse.move(g.x + 20, g.y + 20); await page.mouse.down(); await wait(400); await page.mouse.up(); await wait(300);
  check('歯車の短いタッチでは設定が開かない', await page.isHidden('#panel'));
  const openPanel = async () => { await page.mouse.move(g.x + 20, g.y + 20); await page.mouse.down(); await wait(1700); await page.mouse.up(); await page.waitForSelector('#panel:not([hidden])'); };
  await openPanel();
  check('歯車の長押しで設定が開く', true);
  await shot('05-settings-records-live');
  await page.click('[data-tab="switch"]');
  await page.keyboard.down('Space'); await wait(50); await page.keyboard.up('Space');
  const logTxt = await page.textContent('#tlog');
  check('スイッチ入力テストに押したキーが表示される', logTxt.includes('スペース') && logTxt.includes('スイッチ1'));
  s = await st();
  check('設定画面を開いている間は音楽が反応しない', !s.playing);
  await shot('06-settings-switch');

  // モードB（3秒）
  await page.click('[data-tab="mode"]');
  await page.click('label.choice:has(input[value="timed"])');
  await page.click('label.choice:has(input[name="r-timedSec"][value="3"])');
  await shot('07-settings-mode');
  await page.click('#panelClose');
  await press();
  s = await st();
  check('B: 1回押すと流れる', s.playing);
  await press();
  s = await st();
  check('B: 再生中の入力は無効（流れたまま）', s.playing);
  await wait(2600);
  s = await st();
  check('B: 設定時間（3秒）で自動で止まる', !s.playing && !s.audio);
  await press();
  s = await st();
  check('B: 自動停止後にもう1回押すと流れる', s.playing);
  await wait(3200);

  // モードC
  await openPanel();
  await page.click('[data-tab="mode"]');
  await page.click('label.choice:has(input[value="next"])');
  await page.click('#panelClose');
  const idxs = [];
  for (let i = 0; i < 4; i++) { await press(); idxs.push((await st()).idx); }
  s = await st();
  check('C: 押すたびにつぎの曲へ、最後のつぎは最初の曲', JSON.stringify(idxs) === '[0,1,2,0]' && s.playing, JSON.stringify(idxs));

  // モードD
  await openPanel();
  await page.click('[data-tab="mode"]');
  await page.click('label.choice:has(input[value="two"])');
  await page.click('#panelClose');
  await wait(300);
  const boxL1 = await page.locator('#btnL').boundingBox();
  await shot('08-stage-two');
  await press('Space');
  const p1 = (await st()).playing;
  const i1 = (await st()).idx;
  await press('Enter');
  s = await st();
  check('D: スイッチ2（Enter）でつぎの曲が流れる', s.idx === (i1 + 1) % 3 && s.playing, `idx ${i1}->${s.idx}`);
  await press('Space');
  s = await st();
  check('D: スイッチ1（Space）で再生・停止', s.playing !== p1 || !s.playing);
  const boxL2 = await page.locator('#btnL').boundingBox();
  check('D: 再生状態が変わってもボタンの位置が変わらない', JSON.stringify(boxL1) === JSON.stringify(boxL2));
  await shot('09-stage-two-b');

  // モードE
  await openPanel();
  await page.click('[data-tab="mode"]');
  await page.click('label.choice:has(input[value="hold"])');
  await page.click('#panelClose');
  if ((await st()).playing) await press();
  await page.keyboard.down('Space'); await wait(700);
  const holdPlaying = (await st()).playing;
  await page.keyboard.up('Space'); await wait(200);
  s = await st();
  check('E: 押している間だけ流れ、離すと止まる', holdPlaying && !s.playing);

  // 学習をおわる → 記録
  await wait(600);
  await openPanel();
  await page.click('#panelEnd');
  await page.waitForSelector('#dialog:not([hidden])');
  await page.click('#dialog [data-p="spont"]');
  await page.click('#dialog [data-p="spont"]');
  await page.fill('#dialog #memo', 'テストのメモ');
  await shot('10-end-dialog');
  await page.click('#dialog #okBtn');
  await wait(500);
  const sessions = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('ongaku-switch'); r.onsuccess = () => { const q = r.result.transaction('sessions').objectStore('sessions').getAll(); q.onsuccess = () => res(q.result); }; }));
  const ses = sessions[0];
  const inputs = ses.events.filter((e) => e.type === 'input').length;
  check('学習記録が保存される（入力・観察・メモ）', sessions.length === 1 && inputs > 10 && ses.obs.spont === 2 && ses.memo === 'テストのメモ' && ses.endAt, `入力${inputs}回`);

  // 再読み込みしても曲が残る
  await page.reload();
  await page.waitForSelector('#startGo:not([disabled])');
  const n = await page.evaluate(() => window.__ongaku.S.songs.size);
  check('アプリを開き直しても曲が残っている', n === 3);
  const mode = await page.evaluate(() => window.__ongaku.S.settings.mode);
  check('設定（モード）が保存されている', mode === 'hold');

  // 記録画面
  await page.click('#startSettings');
  await page.click('[data-tab="records"]');
  await page.waitForSelector('svg.chart');
  await page.click('[data-day]');
  await shot('11-records');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="csv"]')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  check('CSV出力（BOM付き・見出しあり）', csv.charCodeAt(0) === 0xFEFF && csv.includes('スイッチ入力回数') && csv.includes('テストのメモ'));

  // バックアップと復元
  await page.click('[data-tab="data"]');
  const [bk] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="bkAll"]')]);
  const bkPath = path.join(dir, 'backup.ongaku');
  await bk.saveAs(bkPath);
  await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('ongaku-switch'); r.onsuccess = () => { const tx = r.result.transaction(['songs', 'audio'], 'readwrite'); tx.objectStore('songs').clear(); tx.objectStore('audio').clear(); tx.oncomplete = res; }; }));
  page.once('dialog', (d) => d.accept());
  await page.setInputFiles('#rsIn', { name: 'backup.ongaku', mimeType: 'application/octet-stream', buffer: fs.readFileSync(bkPath) });
  await page.click('#dialog [data-close="ok"]');
  await page.waitForSelector('#dialog h3:has-text("復元しました")', { timeout: 20000 });
  await Promise.all([page.waitForNavigation(), page.click('#dialog [data-close]')]);
  await page.waitForSelector('#startGo');
  await wait(500);
  const n2 = await page.evaluate(() => window.__ongaku.S.songs.size);
  check('バックアップから曲を復元できる', n2 === 3);

  // オフライン
  await page.evaluate(() => navigator.serviceWorker.ready);
  await wait(500);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('#startGo:not([disabled])', { timeout: 10000 });
  await page.click('#startGo');
  await wait(600);
  // 保存されているモードはE（押している間だけ）なので、押したままで確認
  await page.keyboard.down('Space'); await wait(600);
  s = await st();
  await page.keyboard.up('Space');
  check('通信がない状態でも開いて再生できる（Service Worker）', s.playing && s.audio);
  await ctx.setOffline(false);

  // 縦向き
  await page.setViewportSize({ width: 820, height: 1180 });
  await wait(300);
  await shot('12-portrait');
  const bb = await page.locator('#btn1').boundingBox();
  check('縦向きでもボタンが画面内に収まる', bb && bb.x >= 0 && bb.x + bb.width <= 820 && bb.y + bb.height <= 1180);

  // 録音して追加（Chromiumの仮のマイクを使用）
  await page.setViewportSize({ width: 1180, height: 820 });
  const before = await page.evaluate(() => window.__ongaku.S.songs.size);
  await openPanel();
  await page.click('[data-tab="music"]');
  await page.click('[data-act="rec"]');
  await page.click('#rStart');
  await wait(2200);
  await page.click('#rStop');
  await page.waitForSelector('#rSave:not([disabled])');
  await page.fill('#rName', 'せんせいのうた');
  await shot('13-record');
  await page.click('#rSave');
  await page.waitForFunction((b) => window.__ongaku.S.songs.size === b + 1, before, { timeout: 10000 });
  const recSong = await page.evaluate(() => [...window.__ongaku.S.songs.values()].find((x) => x.name === 'せんせいのうた'));
  const decoded = await page.evaluate(async (id) => { const P = window.__ongaku.player; const song = window.__ongaku.S.songs.get(id); const b = await P.prepare(song); return b.duration; }, recSong.id);
  check('録音して曲として追加でき、再生用に読み込める', !!recSong && decoded > 1, `長さ ${decoded.toFixed(1)}秒`);

  check('エラーが出ていない', errors.length === 0, errors.join(' | ').slice(0, 300));
  await browser.close();
  const ng = results.filter((r) => !r[0]).length;
  console.log(`\n${results.length - ng} / ${results.length} 成功`);
  process.exit(ng ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
