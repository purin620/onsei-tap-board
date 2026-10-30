// resin_tshirt.html を1コマずつ描画して MP4 にする
//   node render.js                → resin_tshirt.mp4（30fps, 1920x1080, 音声なし）
//   node render.js --still 5,14   → 指定秒の静止画 PNG（確認用）
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

(async () => {
  const args = process.argv.slice(2);
  const stillIdx = args.indexOf('--still');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => { console.error('page error:', e.message); process.exit(1); });
  await page.goto('file://' + path.resolve(__dirname, 'resin_tshirt.html') + '?render=1');
  await page.waitForFunction(() => window.READY === true);
  const grab = (t, type) => page.evaluate(([t, type]) => {
    window.renderFrame(t);
    return document.getElementById('c').toDataURL(type, 0.95).split(',')[1];
  }, [t, type]);

  if (stillIdx >= 0) {
    const outDir = args[stillIdx + 2] || path.resolve(__dirname, 'stills');
    fs.mkdirSync(outDir, { recursive: true });
    for (const s of args[stillIdx + 1].split(',')) {
      const f = path.join(outDir, `t${String(s).padStart(5, '0')}.png`);
      fs.writeFileSync(f, Buffer.from(await grab(+s, 'image/png'), 'base64'));
      console.log(f);
    }
    await browser.close();
    return;
  }

  const fps = 30;
  const dur = await page.evaluate(() => window.DURATION);
  const n = Math.round(dur * fps);
  const out = path.resolve(__dirname, 'resin_tshirt.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', '-an', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const buf = Buffer.from(await grab(i / fps, 'image/jpeg'), 'base64');
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`frame ${i}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
  console.log('done:', out);
})();
