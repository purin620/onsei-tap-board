// ロイロノートなど、アプリの中のブラウザに近い状態（Service Worker なし）での確認。
// 使い方：python3 -m http.server 8123 を起動してから node ongaku/tests/inapp.cjs
// ロイロノートの中のブラウザに近い状態（Service Worker・共有なし）での確認
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1024, height: 700 } });
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8123/ongaku/');
  await p.waitForFunction(() => window.__ongaku.S.songs.size === 3); await p.waitForTimeout(300);
  console.log('sw in nav:', await p.evaluate(() => 'serviceWorker' in navigator), 'started-before:', await p.evaluate(()=>window.__ongaku.S.started)); console.log('notice shown:', await p.isVisible('#startInApp'));
  await p.click('#startGo'); await p.waitForTimeout(800);
  await p.keyboard.press('Space'); await p.waitForTimeout(500);
  console.log('errs', errs, 'started', await p.evaluate(()=>window.__ongaku.S.started), 'startHidden', await p.isHidden('#start')); console.log('playing:', await p.evaluate(() => window.__ongaku.S.playing && window.__ongaku.player.playing));
  await p.keyboard.press('Space'); await p.waitForTimeout(300);
  const g = await p.locator('#gear').boundingBox();
  await p.mouse.move(g.x + 20, g.y + 20); await p.mouse.down(); await p.waitForTimeout(1700); await p.mouse.up();
  await p.click('#panelEnd'); await p.click('#dialog #okBtn'); await p.waitForTimeout(300);
  await p.click('#startSettings'); await p.click('[data-tab="records"]'); await p.waitForSelector('[data-act="csvtext"]');
  await p.click('[data-act="csvtext"]');
  await p.waitForTimeout(500); console.log('toast', await p.textContent('#toast'), 'dialogHidden', await p.isHidden('#dialog'), await p.evaluate(()=>document.querySelector('#dialog .box').innerHTML.slice(0,200)));
  const txt = await p.inputValue('#dialog textarea');
  console.log('csv text ok:', txt.startsWith('児童,実施日'));
  await p.screenshot({ path: require('os').tmpdir() + '/inapp-csv.png' });
  console.log('errors', errs);
  await b.close();
})();
