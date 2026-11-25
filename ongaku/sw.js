// オフライン用：アプリの部品を端末に保存しておき、通信がなくても開けるようにする。
// アプリを更新したときは VERSION の数字を変える。
const VERSION = 'ongaku-v1.1.0';
const FILES = [
  './',
  './index.html',
  './css/app.css',
  './js/main.js',
  './js/app.js',
  './js/db.js',
  './js/player.js',
  './js/input.js',
  './js/panel.js',
  './js/records.js',
  './js/backup.js',
  './js/ui.js',
  './js/recorder.js',
  './manifest.webmanifest',
  './icon.svg',
  './apple-touch-icon.png',
  './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('ongaku-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 保存したものをすぐに使い（学校のWi-Fiが遅くても待たない）、裏で新しいものに更新しておく
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      const res = await net;
      return res || (await cache.match('./index.html')) || Response.error();
    }),
  );
});
