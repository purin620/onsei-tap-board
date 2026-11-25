// 端末内の保存（IndexedDB）
// ・songs     … 曲の情報（曲名・開始/終了位置・音量など）
// ・audio     … 音のデータ本体（ArrayBuffer）。iPadで安定させるため Blob ではなく ArrayBuffer で保存
// ・playlists … プレイリスト（曲IDの並び）
// ・kv        … 設定など
// ・sessions  … 学習記録（1回の学習ごと）
// ・students  … 児童の登録名（イニシャルなど）
// 外部サーバーへは一切送信しない。

const DB_NAME = 'ongaku-switch';
const DB_VER = 1;
export const STORES = ['songs', 'audio', 'playlists', 'kv', 'sessions', 'students'];

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) {
          db.createObjectStore(s, { keyPath: s === 'kv' ? 'key' : 'id' });
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export async function get(name, key) { return wrap((await store(name)).get(key)); }
export async function getAll(name) { return wrap((await store(name)).getAll()); }
export async function put(name, value) { return wrap((await store(name, 'readwrite')).put(value)); }
export async function del(name, key) { return wrap((await store(name, 'readwrite')).delete(key)); }
export async function clear(name) { return wrap((await store(name, 'readwrite')).clear()); }

// 曲の情報と音データを同時に保存（片方だけ残らないように1つのトランザクションで）
export async function putSongWithAudio(song, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['songs', 'audio'], 'readwrite');
    tx.objectStore('songs').put(song);
    tx.objectStore('audio').put({ id: song.id, data });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('保存できませんでした（容量不足の可能性）'));
  });
}

export async function deleteSongWithAudio(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['songs', 'audio'], 'readwrite');
    tx.objectStore('songs').delete(id);
    tx.objectStore('audio').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function kvGet(key, fallback) {
  try {
    const row = await get('kv', key);
    return row ? row.value : fallback;
  } catch { return fallback; }
}
export async function kvSet(key, value) { return put('kv', { key, value }); }

export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// iPadOS が空き容量不足のときにデータを消さないようお願いする
export async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch { /* 対応していない環境 */ }
  return false;
}

export async function storageInfo() {
  const info = { usage: null, quota: null, persisted: null };
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      info.usage = e.usage; info.quota = e.quota;
    }
    if (navigator.storage && navigator.storage.persisted) info.persisted = await navigator.storage.persisted();
  } catch { /* 対応していない環境 */ }
  return info;
}
