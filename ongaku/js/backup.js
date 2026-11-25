// バックアップと復元
// ファイルの形：  "ONGAKUBK1\n" + JSONの長さ(12桁) + "\n" + JSON + 音データを順番につなげたもの
import * as DB from './db.js';
import { VERSION } from './app.js';
import { saveFile } from './ui.js';

const MAGIC = 'ONGAKUBK1\n';

export async function makeBackup(withAudio, progress = () => {}) {
  progress('準備中…');
  const meta = {
    app: 'ongaku-switch', version: VERSION, createdAt: Date.now(), withAudio,
    songs: await DB.getAll('songs'),
    playlists: await DB.getAll('playlists'),
    kv: await DB.getAll('kv'),
    sessions: await DB.getAll('sessions'),
    students: await DB.getAll('students'),
    audio: [],
  };
  const parts = [];
  let offset = 0;
  if (withAudio) {
    let i = 0;
    for (const s of meta.songs) {
      i++;
      progress(`音楽を読み込み中… ${i} / ${meta.songs.length}`);
      const row = await DB.get('audio', s.id);
      if (!row) continue;
      const len = row.data.byteLength;
      meta.audio.push({ id: s.id, offset, length: len });
      parts.push(new Blob([row.data]));
      offset += len;
    }
  }
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const head = MAGIC + String(json.byteLength).padStart(12, '0') + '\n';
  const blob = new Blob([head, json, ...parts], { type: 'application/octet-stream' });
  const d = new Date();
  const name = `おんがくスイッチ_${withAudio ? '全部' : '設定と記録'}_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.ongaku`;
  progress('保存しています…');
  await saveFile(blob, name);
  return name;
}

export async function restoreBackup(file, progress = () => {}) {
  progress('読み込み中…');
  const headLen = MAGIC.length + 13;
  const head = await file.slice(0, headLen).text();
  if (!head.startsWith(MAGIC)) throw new Error('おんがくスイッチのバックアップファイルではありません');
  const jsonLen = Number(head.slice(MAGIC.length, MAGIC.length + 12));
  const meta = JSON.parse(await file.slice(headLen, headLen + jsonLen).text());
  if (meta.app !== 'ongaku-switch') throw new Error('ファイルの形式がちがいます');
  const base = headLen + jsonLen;

  // 音データ入りのバックアップのときだけ曲を入れ替える（「設定と記録だけ」のときは今の曲を残す）
  const replaceSongs = !!meta.withAudio;
  for (const st of ['playlists', 'kv', 'sessions', 'students', ...(replaceSongs ? ['songs', 'audio'] : [])]) await DB.clear(st);
  if (replaceSongs) {
    const byId = new Map(meta.audio.map((a) => [a.id, a]));
    let i = 0;
    for (const s of meta.songs) {
      i++;
      progress(`音楽をもどしています… ${i} / ${meta.songs.length}`);
      const a = byId.get(s.id);
      if (!a) continue;
      const data = await file.slice(base + a.offset, base + a.offset + a.length).arrayBuffer();
      await DB.putSongWithAudio(s, data);
    }
  }
  const existing = new Set((await DB.getAll('songs')).map((s) => s.id));
  for (const p of meta.playlists) { p.songIds = p.songIds.filter((id) => existing.has(id)); await DB.put('playlists', p); }
  for (const r of meta.kv) await DB.put('kv', r);
  for (const r of meta.sessions) await DB.put('sessions', r);
  for (const r of meta.students) await DB.put('students', r);
  progress('完了しました');
}
