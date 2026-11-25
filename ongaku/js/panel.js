// 先生用の設定画面
import * as DB from './db.js';
import {
  S, MODES, FUNCS, OBS, VERSION, player, input, saveSettings, currentPlaylist, listSongs, importFiles,
  updateSong, deleteSong, savePlaylist, resetPlaybackPosition, renderStage, renderStart, endLearning,
  esc, toast, stopPlayback, prepareAround, DEFAULTS,
} from './app.js';
import { keyLabel } from './input.js';
import { dialog, confirmDlg, promptDlg, fmtTime, fmtBytes } from './ui.js';
import { renderRecords } from './records.js';
import { makeBackup, restoreBackup } from './backup.js';
import { Recorder, canRecord, extOf } from './recorder.js';

const $ = (s) => document.querySelector(s);
let tab = 'mode';
let preview = null; // 試聴中の曲ID
let rawHandler = null;

export function openPanel() {
  S.panelOpen = true;
  input.releaseAll();
  $('#panel').hidden = false;
  $('#panelEnd').hidden = !S.started;
  if (S.started && S.session && tab === 'mode') tab = 'records';
  renderTab();
}

export function closePanel() {
  stopPreview();
  S.panelOpen = false;
  input.capture = null;
  setRaw(null);
  $('#panel').hidden = true;
  if (!S.started) { $('#start').hidden = false; renderStart(); }
  renderStage();
}

function setRaw(h) {
  if (rawHandler) S.rawListeners.delete(rawHandler);
  rawHandler = h;
  if (h) S.rawListeners.add(h);
}

export function initPanel() {
  $('#panelClose').addEventListener('click', closePanel);
  $('#panelEnd').addEventListener('click', async () => {
    const ses = await endLearning();
    $('#panelEnd').hidden = true;
    if (ses) await endDialog(ses);
    closePanel();
  });
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    renderTab();
  });
  // data-set="キー" の入力は自動で設定に保存
  $('#panelBody').addEventListener('change', async (e) => {
    const el = e.target;
    const key = el.dataset.set;
    if (!key) return;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.dataset.num != null) v = Number(el.value);
    else v = el.value;
    if (key.startsWith('colors.')) S.settings.colors[key.slice(7)] = v;
    else S.settings[key] = v;
    if (key === 'mode' || key === 'playlistId' || key === 'order') resetPlaybackPosition();
    await saveSettings();
    if (!el.dataset.norender) renderTab();
  });
}

function renderTab() {
  stopPreview();
  input.capture = null;
  setRaw(null);
  for (const b of document.querySelectorAll('#tabs [data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  const body = $('#panelBody');
  const fn = { mode: tabMode, music: tabMusic, switch: tabSwitch, look: tabLook, records: tabRecords, data: tabData }[tab];
  // タブごとに新しい入れ物を作る（イベントの登録が重ならないように）
  body.innerHTML = '';
  const inner = document.createElement('div');
  body.appendChild(inner);
  fn(inner);
  body.scrollTop = 0;
}

// ---- 共通の部品 ------------------------------------------------------------
function radios(key, options, cur, { num = false, norender = false } = {}) {
  return `<div class="choices">${options.map(([v, l]) => `
    <label class="choice"><input type="radio" name="r-${key}" data-set="${key}" ${num ? 'data-num' : ''} ${norender ? 'data-norender' : ''} value="${esc(v)}" ${String(v) === String(cur) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
}
function check(key, label, cur) {
  return `<label class="switchrow"><input type="checkbox" data-set="${key}" ${cur ? 'checked' : ''}> <span>${label}</span></label>`;
}
function funcSelect(key, cur) {
  return `<select data-set="${key}">${Object.entries(FUNCS).map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
}

// ---- 学習モード --------------------------------------------------------------
function tabMode(body) {
  const s = S.settings;
  const secs = [3, 5, 10, 15, 30, 60];
  let detail = '';
  if (s.mode === 'toggle' || s.mode === 'hold') {
    detail += `<h4>もう一度押したときの再生位置</h4>${radios('resume', [['resume', '止めたところから'], ['restart', '開始位置（はじめ）から']], s.resume)}`;
  }
  if (s.mode === 'timed' || (s.mode === 'next' && s.nextUseTimer) || (s.mode === 'two' && s.nextUseTimer)) {
    detail += `<h4>再生する時間</h4>${radios('timedSec', [...secs.map((x) => [x, x + '秒']), ...(secs.includes(Number(s.timedSec)) ? [] : [[s.timedSec, s.timedSec + '秒']])], s.timedSec, { num: true })}
      <div class="field"><label>任意の秒数</label><input type="number" min="1" max="600" step="1" value="${s.timedSec}" data-set="timedSec" data-num style="width:7em"> 秒</div>`;
  }
  if (s.mode === 'timed') {
    detail += `<h4>再生中にスイッチを押したとき</h4>${radios('timedDuringPlay', [['ignore', '反応しない（入力を無効）'], ['stop', '止める'], ['extend', '時間をはじめから数え直す']], s.timedDuringPlay)}
      <h4>止まったあと、もう一度押したとき</h4>${radios('timedNextPress', [['resume', 'つづきから'], ['restart', '開始位置から'], ['next', 'つぎの曲']], s.timedNextPress)}`;
  }
  if (s.mode === 'next' || s.mode === 'two') {
    detail += check('nextUseTimer', '曲を変えたあと、決めた時間で自動的に止める', s.nextUseTimer);
  }
  if (s.mode === 'two') {
    detail += `<div class="field"><span class="lab">スイッチ1（左）</span>${funcSelect('sw1Func', s.sw1Func)}</div>
      <div class="field"><span class="lab">スイッチ2（右）</span>${funcSelect('sw2Func', s.sw2Func)}</div>
      <p class="note">どのキーがスイッチ1・2になるかは「スイッチ」タブで変更できます。画面の左のボタン＝スイッチ1、右のボタン＝スイッチ2 です。</p>`;
    if (s.sw1Func === 'toggle' || s.sw2Func === 'toggle' || s.sw1Func === 'hold' || s.sw2Func === 'hold') {
      detail += `<h4>もう一度押したときの再生位置</h4>${radios('resume', [['resume', '止めたところから'], ['restart', '開始位置から']], s.resume)}`;
    }
  }
  if (s.mode === 'hold') {
    detail += `<p class="note">押している間だけ流れるのは、「押した」と「離した」が分かる入力（キーボードとして認識されるスイッチ、画面タッチ）です。スイッチコントロールの「項目を選択」など、1回の選択しか届かない入力では、押すたびに再生・停止になります。</p>`;
  }

  const pls = S.playlists;
  body.innerHTML = `
  <div class="sec"><h3>学習モード</h3>
    <div class="modecards">${Object.entries(MODES).map(([k, m]) => `
      <label class="choice"><input type="radio" name="r-mode" data-set="mode" value="${k}" ${k === s.mode ? 'checked' : ''}><span>${m.short}　${m.name}<small>${m.desc}</small></span></label>`).join('')}</div>
  </div>
  <div class="sec"><h3>${MODES[s.mode].short}　${MODES[s.mode].name} の設定</h3>${detail || '<p class="note">このモードの追加設定はありません。</p>'}</div>
  <div class="sec"><h3>曲の流し方</h3>
    <div class="field"><span class="lab">使うプレイリスト</span><select data-set="playlistId">${pls.map((p) => `<option value="${p.id}" ${p.id === s.playlistId ? 'selected' : ''}>${esc(p.name)}（${listSongs(p).length}曲）</option>`).join('')}</select></div>
    <h4>曲の順番</h4>${radios('order', [['order', '順番どおり'], ['random', 'ランダム']], s.order)}
    <h4>曲が最後まで流れたら</h4>${radios('onEnd', [['stop', '止まる'], ['repeat', '同じ曲をくり返す'], ['next', 'つぎの曲へ進む']], s.onEnd)}
    <h4>全体の音量</h4>
    <div class="field"><input type="range" min="0" max="1.5" step="0.05" value="${s.masterVolume}" data-set="masterVolume" data-num data-norender> <span id="mv">${Math.round(s.masterVolume * 100)}%</span></div>
    <p class="note">iPad本体の音量ボタンでも調整してください。曲ごとの音量は「音楽」タブで設定できます。</p>
  </div>`;
  const r = body.querySelector('[data-set="masterVolume"]');
  r.addEventListener('input', () => { body.querySelector('#mv').textContent = Math.round(r.value * 100) + '%'; player.setMasterVolume(Number(r.value)); });
}

// ---- 音楽 ---------------------------------------------------------------
async function tabMusic(body) {
  const pl = currentPlaylist();
  const songs = listSongs(pl);
  const others = [...S.songs.values()].filter((x) => !pl || !pl.songIds.includes(x.id)).sort((a, b) => a.addedAt - b.addedAt);
  body.innerHTML = `
  <div class="sec"><h3>プレイリスト</h3>
    <div class="field">
      <select id="plSel">${S.playlists.map((p) => `<option value="${p.id}" ${p.id === S.settings.playlistId ? 'selected' : ''}>${esc(p.name)}（${listSongs(p).length}曲）</option>`).join('')}</select>
      <button class="btn small" data-act="plNew">新しく作る</button>
      <button class="btn small" data-act="plRename">名前を変える</button>
      <button class="btn small danger" data-act="plDel" ${S.playlists.length <= 1 ? 'disabled' : ''}>削除</button>
    </div>
    <p class="note">ここで選んだプレイリストが学習で使われます。</p>
  </div>
  <div class="sec"><h3>曲を追加する</h3>
    <div class="field" style="margin:0">
      <button class="btn primary" data-act="add">＋ 音楽ファイルを選ぶ（複数可）</button>
      <button class="btn" data-act="rec" ${canRecord() ? '' : 'disabled'}>● 録音して追加</button>
    </div>
    <input type="file" id="fileIn" multiple accept="audio/*,.mp3,.m4a,.aac,.wav,.mp4,.caf,.aif,.aiff" hidden>
    <p class="note" id="addMsg">MP3・M4A（DRMのないAAC）・WAV などに対応しています。iPadでは「ファイル」アプリの中の音楽ファイルを選べます。追加した曲は「${esc(pl ? pl.name : '')}」に入ります。</p>
  </div>
  <div class="sec"><h3>「${esc(pl ? pl.name : '')}」の曲（${songs.length}曲）</h3>
    ${songs.length ? `<ul class="list">${songs.map((x, i) => `
      <li data-id="${x.id}">
        <span class="meta">${i + 1}</span>
        <span class="name">${esc(x.name)}<br><span class="meta">${songMeta(x)}</span></span>
        <button class="btn small" data-act="pv">${preview === x.id ? '■ とめる' : '▶ 試聴'}</button>
        <button class="btn small" data-act="edit">編集</button>
        <button class="btn small" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="上へ">↑</button>
        <button class="btn small" data-act="down" ${i === songs.length - 1 ? 'disabled' : ''} aria-label="下へ">↓</button>
        <button class="btn small" data-act="out">はずす</button>
      </li>`).join('')}</ul>` : '<p class="empty">まだ曲がありません。上の「音楽ファイルを選ぶ」から追加してください。</p>'}
  </div>
  <div class="sec"><h3>ほかの曲（このプレイリストに入っていない曲）</h3>
    ${others.length ? `<ul class="list">${others.map((x) => `
      <li data-id="${x.id}"><span class="name">${esc(x.name)}<br><span class="meta">${songMeta(x)}</span></span>
      <button class="btn small" data-act="pv">${preview === x.id ? '■ とめる' : '▶ 試聴'}</button>
      <button class="btn small" data-act="in">＋ 入れる</button>
      <button class="btn small" data-act="edit">編集・削除</button></li>`).join('')}</ul>` : '<p class="empty">ありません。</p>'}
  </div>
  <div class="sec"><h3>保存場所</h3><p class="note" id="stInfo">確認中…</p></div>`;

  DB.storageInfo().then((i) => {
    const el = body.querySelector('#stInfo');
    if (!el) return;
    const total = [...S.songs.values()].reduce((a, b) => a + (b.size || 0), 0);
    el.innerHTML = `登録曲：${S.songs.size}曲（約${fmtBytes(total)}）<br>この端末で使用中：${fmtBytes(i.usage)} ／ 使用できる上限の目安：${fmtBytes(i.quota)}<br>
      データ保護：${i.persisted ? '有効（自動では消されにくい状態）' : '未確定（iPadの空き容量が少ないと消えることがあります。「データ・児童」タブからバックアップをとってください）'}`;
  });

  body.querySelector('#plSel').addEventListener('change', async (e) => {
    S.settings.playlistId = e.target.value; resetPlaybackPosition(); await saveSettings(); renderTab();
  });
  const fileIn = body.querySelector('#fileIn');
  fileIn.addEventListener('change', async () => {
    const files = [...fileIn.files];
    if (!files.length) return;
    const msg = body.querySelector('#addMsg');
    const res = await importFiles(files, pl.id, (i, n, name) => { msg.textContent = `追加中… ${i} / ${n}　${name}`; });
    toast(`${res.added.length}曲を追加しました` + (res.failed.length ? `（${res.failed.length}曲は追加できませんでした）` : ''));
    if (res.failed.length) await dialog(`<h3>追加できなかったファイル</h3><ul>${res.failed.map((f) => `<li>${esc(f.name)}：${esc(f.error)}</li>`).join('')}</ul><p class="note">空き容量が足りない場合や、ファイルが壊れている場合に起こります。</p><div class="foot"><button class="btn primary" data-close>OK</button></div>`);
    renderTab();
  });
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const li = b.closest('li');
    const id = li && li.dataset.id;
    if (act === 'add') { fileIn.value = ''; fileIn.click(); return; }
    if (act === 'rec') { await recordDialog(pl); renderTab(); return; }
    if (act === 'plNew') {
      const name = await promptDlg('新しいプレイリストの名前', `プレイリスト${S.playlists.length + 1}`);
      if (!name) return;
      const np = { id: DB.uid('p'), name, songIds: [], createdAt: Date.now() };
      await savePlaylist(np);
      S.settings.playlistId = np.id; resetPlaybackPosition(); await saveSettings(); renderTab(); return;
    }
    if (act === 'plRename') {
      const name = await promptDlg('プレイリストの名前', pl.name);
      if (!name) return;
      pl.name = name; await savePlaylist(pl); renderTab(); return;
    }
    if (act === 'plDel') {
      if (!(await confirmDlg(`プレイリスト「${pl.name}」を削除しますか？\n（曲そのものは消えません）`, '削除する', true))) return;
      await DB.del('playlists', pl.id);
      S.playlists = S.playlists.filter((p) => p.id !== pl.id);
      S.settings.playlistId = S.playlists[0].id; resetPlaybackPosition(); await saveSettings(); renderTab(); return;
    }
    if (act === 'pv') { if (preview === id) stopPreview(); else startPreview(S.songs.get(id)); renderTab(); return; }
    if (act === 'edit') { await editSong(S.songs.get(id)); renderTab(); return; }
    if (act === 'up' || act === 'down') {
      const i = pl.songIds.indexOf(id);
      const j = act === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= pl.songIds.length) return;
      [pl.songIds[i], pl.songIds[j]] = [pl.songIds[j], pl.songIds[i]];
      await savePlaylist(pl); resetPlaybackPosition(); prepareAround(); renderTab(); return;
    }
    if (act === 'out') { pl.songIds = pl.songIds.filter((x) => x !== id); await savePlaylist(pl); resetPlaybackPosition(); renderTab(); return; }
    if (act === 'in') { pl.songIds.push(id); await savePlaylist(pl); prepareAround(); renderTab(); }
  });
}

// 録音して追加
async function recordDialog(pl) {
  stopPreview();
  if (S.playing) stopPlayback('stop', { reason: '録音のため' });
  const rec = new Recorder();
  let result = null; let url = ''; let tick = null;
  const res = await dialog(`
    <h3>録音して追加</h3>
    <p class="note">先生の歌や演奏、学校で作った音楽などを録音して、曲として登録できます。<br>
    ※ 音楽配信サービス（YouTube Music など）で流した曲を録音することは、各サービスの利用規約で禁止されています。</p>
    <div class="field">
      <button class="btn primary" id="rStart">● 録音をはじめる</button>
      <button class="btn danger" id="rStop" disabled>■ 録音をとめる</button>
      <span class="lamp" id="rTime">0:00</span>
    </div>
    <p class="note" id="rMsg">はじめて使うときは、マイクの使用を「許可」してください。</p>
    <div id="rAfter" hidden>
      <audio id="rAudio" controls style="width:100%"></audio>
      <div class="field"><label>曲名</label><input type="text" id="rName" style="flex:1" value="録音 ${new Date().toLocaleDateString('ja-JP')}"></div>
      <p class="note">使う部分（はじめ・おわりの無音を切るなど）は、保存したあとに「編集」で設定できます。</p>
    </div>
    <div class="foot">
      <button class="btn" data-close="">やめる</button>
      <button class="btn primary" id="rSave" disabled>保存して追加</button>
    </div>`, (box, close) => {
    const g = (id) => box.querySelector(id);
    g('#rStart').onclick = async () => {
      try {
        if (url) { URL.revokeObjectURL(url); url = ''; }
        result = null; g('#rAfter').hidden = true; g('#rSave').disabled = true;
        await rec.start();
        g('#rStart').disabled = true; g('#rStop').disabled = false;
        g('#rMsg').textContent = '録音中です…';
        tick = setInterval(() => { g('#rTime').textContent = fmtTime(Math.floor(rec.seconds)); }, 250);
      } catch (e) {
        g('#rMsg').textContent = 'マイクが使えませんでした。iPadの「設定」→「Safari」（またはこのアプリ）→「マイク」を「許可」にしてください。';
      }
    };
    g('#rStop').onclick = async () => {
      clearInterval(tick);
      result = await rec.stop();
      g('#rStart').disabled = false; g('#rStop').disabled = true;
      g('#rStart').textContent = '● 録りなおす';
      if (!result || !result.blob.size) { g('#rMsg').textContent = '録音できませんでした。もう一度ためしてください。'; return; }
      url = URL.createObjectURL(result.blob);
      g('#rAudio').src = url;
      g('#rAfter').hidden = false; g('#rSave').disabled = false;
      g('#rMsg').textContent = `${Math.round(result.seconds)}秒録音しました。きいて確かめてから保存してください。`;
    };
    g('#rSave').onclick = () => { result.name = g('#rName').value.trim() || '録音'; close('save'); };
  });
  clearInterval(tick);
  if (rec.startedAt) await rec.stop();
  if (url) URL.revokeObjectURL(url);
  if (res !== 'save' || !result) return;
  const file = new File([result.blob], `${result.name}.${extOf(result.type)}`, { type: result.type });
  const r = await importFiles([file], pl.id);
  const song = r.added[0];
  if (!song) { toast('保存できませんでした'); return; }
  if (!song.duration) { song.duration = result.seconds; await DB.put('songs', song); }
  toast(`「${song.name}」を追加しました`);
}

function songMeta(x) {
  const parts = [];
  parts.push('長さ ' + fmtTime(x.duration));
  if (x.start || x.end) parts.push(`使う部分 ${fmtTime(x.start || 0)}〜${x.end ? fmtTime(x.end) : '最後'}`);
  if (x.volume != null && x.volume !== 1) parts.push('音量 ' + Math.round(x.volume * 100) + '%');
  return parts.join('　');
}

function startPreview(song) {
  if (!song) return;
  if (S.playing) stopPlayback('stop', { reason: '試聴のため' });
  player.unlock();
  preview = song.id;
  player.play(song, 0).catch(() => toast('この曲は再生できませんでした'));
  const prev = player.onEnded;
  player.onEnded = (s) => { player.onEnded = prev; preview = null; if (tab === 'music' && S.panelOpen) renderTab(); };
  previewRestore = prev;
}
let previewRestore = null;
function stopPreview() {
  if (!preview) return;
  preview = null;
  player.stop(0.05);
  if (previewRestore) { player.onEnded = previewRestore; previewRestore = null; }
}

// 曲の編集（曲名・使う部分・音量・削除）
async function editSong(song) {
  if (!song) return;
  stopPreview();
  const row = await DB.get('audio', song.id);
  const url = row ? URL.createObjectURL(new Blob([row.data], { type: song.type || 'audio/mpeg' })) : '';
  const draft = { ...song };
  const res = await dialog(`
    <h3>曲の編集</h3>
    <div class="field"><label>曲名</label><input type="text" id="eName" value="${esc(song.name)}" style="flex:1"></div>
    <p class="note">ファイル名：${esc(song.fileName || '')}　長さ：${fmtTime(song.duration)}</p>
    <h4>位置をさがす</h4>
    <audio id="eAudio" src="${url}" controls preload="metadata" style="width:100%"></audio>
    <p class="note">再生して、使いたいところで「いまの位置を〜にする」を押します（サビだけ使う、など）。</p>
    <div class="field"><label>開始位置（秒）</label><input type="number" id="eStart" min="0" step="0.1" value="${song.start || 0}" style="width:7em"><button class="btn small" id="eStartNow">いまの位置を開始にする</button><button class="btn small" id="eStart0">はじめから</button></div>
    <div class="field"><label>終了位置（秒）</label><input type="number" id="eEnd" min="0" step="0.1" value="${song.end || 0}" style="width:7em"><button class="btn small" id="eEndNow">いまの位置を終了にする</button><button class="btn small" id="eEnd0">最後まで</button></div>
    <p class="note">終了位置が 0 のときは最後まで流れます。</p>
    <div class="field"><label>この曲の音量</label><input type="range" id="eVol" min="0" max="2" step="0.05" value="${song.volume ?? 1}"><span id="eVolT">${Math.round((song.volume ?? 1) * 100)}%</span></div>
    <div class="field"><span class="lab">ためしにきく</span><button class="btn small primary" id="eTry">▶ この設定できく</button><button class="btn small" id="eTryStop">■ とめる</button></div>
    <p class="note">「この設定できく」は、学習のときと同じ方法（使う部分・音量）で鳴らします。上のプレーヤーでは音量の設定は反映されません。</p>
    <div class="foot">
      <button class="btn danger" id="eDel" style="margin-right:auto">この曲を削除</button>
      <button class="btn" data-close="">やめる</button>
      <button class="btn primary" id="eSave">保存</button>
    </div>`, (box, close) => {
    const au = box.querySelector('#eAudio');
    const g = (id) => box.querySelector(id);
    const read = () => {
      draft.name = g('#eName').value.trim() || song.name;
      draft.start = Math.max(0, Number(g('#eStart').value) || 0);
      draft.end = Math.max(0, Number(g('#eEnd').value) || 0);
      if (draft.end && draft.end <= draft.start + 0.3) draft.end = 0;
      draft.volume = Number(g('#eVol').value);
    };
    g('#eStartNow').onclick = () => { g('#eStart').value = au.currentTime.toFixed(1); };
    g('#eEndNow').onclick = () => { g('#eEnd').value = au.currentTime.toFixed(1); };
    g('#eStart0').onclick = () => { g('#eStart').value = 0; };
    g('#eEnd0').onclick = () => { g('#eEnd').value = 0; };
    g('#eVol').oninput = () => { g('#eVolT').textContent = Math.round(g('#eVol').value * 100) + '%'; };
    g('#eTry').onclick = () => {
      read(); au.pause(); player.unlock();
      if (S.playing) stopPlayback('stop', { reason: '試聴のため' });
      player.play({ ...draft, rev: 'try' + Date.now() }, 0).catch(() => toast('再生できませんでした'));
    };
    g('#eTryStop').onclick = () => player.stop(0.05);
    g('#eSave').onclick = () => { read(); close('save'); };
    g('#eDel').onclick = () => close('delete');
  });
  player.stop(0.05);
  if (url) URL.revokeObjectURL(url);
  if (res === 'save') {
    Object.assign(song, { name: draft.name, start: draft.start, end: draft.end, volume: draft.volume });
    await updateSong(song);
    toast('保存しました');
  } else if (res === 'delete') {
    if (await confirmDlg(`「${song.name}」を端末から完全に削除しますか？\n（すべてのプレイリストからも消えます）`, '削除する', true)) {
      await deleteSong(song.id);
      toast('削除しました');
    }
  }
}

// ---- スイッチ -------------------------------------------------------------
function tabSwitch(body) {
  const s = S.settings;
  body.innerHTML = `
  <div class="sec"><h3>スイッチ入力テスト</h3>
    <p class="note">外部スイッチを押してみてください。どのキーとして届いているか、スイッチ1・2のどちらになるかが表示されます（このテスト中は音楽は鳴りません）。</p>
    <div class="field"><span class="lamp" id="lamp1">スイッチ1</span><span class="lamp" id="lamp2">スイッチ2</span></div>
    <div class="testlog" id="tlog"><div>ここに入力が表示されます</div></div>
    <div class="testpad" id="tpad">ここをタッチしてもテストできます</div>
  </div>
  <div class="sec"><h3>キーの割り当て</h3>
    <p class="note">キーボードとして認識される外部スイッチ（Bluetoothスイッチインターフェースなど）は、押すとキーの入力が届きます。どのキーをスイッチ1・2にするかを決めます。</p>
    <ul class="list">${(s.keys || []).map((k, i) => `
      <li data-i="${i}"><span class="name">${esc(keyLabel(k.id))} <span class="meta">${esc(k.id)}</span></span>
        <select data-k="${i}"><option value="1" ${k.sw === 1 ? 'selected' : ''}>スイッチ1</option><option value="2" ${k.sw === 2 ? 'selected' : ''}>スイッチ2</option></select>
        <button class="btn small" data-delkey="${i}">削除</button></li>`).join('')}</ul>
    <div class="field" style="margin-top:12px">
      <button class="btn primary" data-capture="1">スイッチ1にキーを登録</button>
      <button class="btn primary" data-capture="2">スイッチ2にキーを登録</button>
      <button class="btn small" data-act="resetKeys">はじめの設定にもどす</button>
    </div>
    <p class="note" id="capMsg"></p>
    ${check('anyKeyOneSwitch', '1スイッチのモードでは、登録していないキーでも反応する（どのキーでも「スイッチ1」）', s.anyKeyOneSwitch)}
  </div>
  <div class="sec"><h3>使う入力</h3>
    ${check('keyEnabled', 'キーボード入力（外部スイッチ）を使う', s.keyEnabled)}
    ${check('touchEnabled', '画面のボタンのタッチ・スイッチコントロールの選択を使う', s.touchEnabled)}
    ${check('mediaKeys', '再生／停止・次へのキー（メディアキー）を使う（届く機器のみ）', s.mediaKeys)}
  </div>
  <div class="sec"><h3>誤入力の防止</h3>
    <h4>1回反応したあと、つぎの入力を受け付けるまでの時間</h4>
    ${radios('cooldownMs', [[0, 'なし'], [300, '0.3秒'], [500, '0.5秒'], [1000, '1秒'], [2000, '2秒'], [3000, '3秒']], s.cooldownMs, { num: true })}
    <p class="note">手がスイッチの上で弾んで2回押しになる場合は長めにします。長押ししても、離すまでは1回として扱います（くり返し入力はしません）。</p>
    <h4>止めるときの音の消え方</h4>
    ${radios('stopFade', [[0.05, 'すぐ止める'], [0.5, '0.5秒でやさしく'], [1, '1秒でやさしく']], s.stopFade, { num: true })}
  </div>
  <div class="sec"><h3>接続方法のめやす</h3>
    <p class="note">
      ① <b>キーボードとして認識されるスイッチインターフェース</b>：いちばん反応が速く、「押す・離す」も分かります。キーを上で登録してください。<br>
      ② <b>iPadの「スイッチコントロール」</b>：スイッチコントロールが入力を使うため、このアプリにはキーが届きません。「項目を選択」で画面の大きなボタンを選ぶか、レシピで「画面の中央をタップ」を割り当てます（くわしくは操作マニュアル）。<br>
      ③ <b>画面タッチ</b>：大きなボタンを直接タッチしても動きます。
    </p>
  </div>`;

  const tlog = body.querySelector('#tlog');
  const lamp = (sw, on) => { const l = body.querySelector('#lamp' + sw); if (l) l.classList.toggle('on', on); };
  let first = true;
  setRaw({
    onRaw: (info) => {
      if (first) { tlog.innerHTML = ''; first = false; }
      const d = document.createElement('div');
      const ph = { down: '押した', up: '離した', tap: '選択' }[info.phase];
      const swT = info.sw ? `スイッチ${info.sw}` : '割り当てなし';
      d.className = info.repeat ? 'ng' : (info.sw ? 'ok' : '');
      const t = new Date();
      d.textContent = `${t.toLocaleTimeString('ja-JP')} ${ph}  ${keyLabel(info.id)} (key="${info.key ?? ''}" code="${info.code ?? ''}" keyCode=${info.keyCode ?? '-'})  → ${swT}${info.repeat ? '（押し続け・無視）' : ''}`;
      tlog.prepend(d);
      while (tlog.children.length > 40) tlog.lastChild.remove();
      if (info.sw && !info.repeat) {
        if (info.phase === 'down') lamp(info.sw, true);
        else if (info.phase === 'up') lamp(info.sw, false);
        else { lamp(info.sw, true); setTimeout(() => lamp(info.sw, false), 250); }
      }
    },
  });
  const pad = body.querySelector('#tpad');
  pad.addEventListener('pointerdown', (e) => { e.preventDefault(); pad.classList.add('on'); S.rawListeners.forEach((f) => f.onRaw && f.onRaw({ phase: 'down', id: 'touch', key: '画面タッチ', sw: 1 })); });
  const up = () => { if (!pad.classList.contains('on')) return; pad.classList.remove('on'); S.rawListeners.forEach((f) => f.onRaw && f.onRaw({ phase: 'up', id: 'touch', key: '画面タッチ', sw: 1 })); };
  pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up); pad.addEventListener('pointerleave', up);

  body.addEventListener('change', async (e) => {
    const i = e.target.dataset.k;
    if (i == null) return;
    s.keys[i].sw = Number(e.target.value);
    await saveSettings();
  });
  body.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-delkey]');
    if (del) { s.keys.splice(Number(del.dataset.delkey), 1); await saveSettings(); renderTab(); return; }
    const cap = e.target.closest('[data-capture]');
    if (cap) {
      const sw = Number(cap.dataset.capture);
      const msg = body.querySelector('#capMsg');
      msg.textContent = `スイッチ${sw}にしたい外部スイッチ（またはキー）を押してください…`;
      cap.blur();
      input.capture = async (id) => {
        const ex = s.keys.find((k) => k.id === id);
        if (ex) ex.sw = sw; else s.keys.push({ id, sw });
        await saveSettings();
        renderTab();
        toast(`「${keyLabel(id)}」をスイッチ${sw}にしました`);
      };
      return;
    }
    if (e.target.closest('[data-act="resetKeys"]')) {
      s.keys = JSON.parse(JSON.stringify(DEFAULTS.keys)); await saveSettings(); renderTab();
    }
  });
}

// ---- 画面 -------------------------------------------------------------------
const PRESETS = [
  ['あたたか（はじめの色）', { bg: '#FFF6E9', idle: '#2E9E5B', active: '#EE7D1E', next: '#3A78C9', text: '#3B2F26' }],
  ['くっきり（コントラスト強め）', { bg: '#FFFFFF', idle: '#0B8A3E', active: '#E35A00', next: '#1F5FBF', text: '#111111' }],
  ['くらい背景', { bg: '#1E2430', idle: '#35B86B', active: '#FF9A3C', next: '#5C9BEA', text: '#F4F1EA' }],
  ['やさしい', { bg: '#F3F7F2', idle: '#4FA67A', active: '#E79A53', next: '#6C93C7', text: '#33413A' }],
];
function tabLook(body) {
  const s = S.settings;
  const c = s.colors;
  body.innerHTML = `
  <div class="sec"><h3>色のセット</h3>
    <div class="swatches">${PRESETS.map(([n, p], i) => `<button class="swatch" data-preset="${i}" style="background:${p.bg};color:${p.text}"><i style="background:${p.idle}"></i><i style="background:${p.active}"></i><i style="background:${p.next}"></i> ${n}</button>`).join('')}</div>
  </div>
  <div class="sec"><h3>色をえらぶ</h3>
    <div class="field"><label>背景</label><input type="color" data-set="colors.bg" value="${c.bg}"></div>
    <div class="field"><label>止まっているとき（きく）</label><input type="color" data-set="colors.idle" value="${c.idle}"></div>
    <div class="field"><label>流れているとき（とめる）</label><input type="color" data-set="colors.active" value="${c.active}"></div>
    <div class="field"><label>つぎのきょく（2スイッチ）</label><input type="color" data-set="colors.next" value="${c.next}"></div>
    <div class="field"><label>文字</label><input type="color" data-set="colors.text" value="${c.text}"></div>
  </div>
  <div class="sec"><h3>ボタンの大きさ</h3>
    ${radios('buttonSize', [['S', '小'], ['M', '中'], ['L', '大'], ['XL', '特大']], s.buttonSize)}
  </div>
  <div class="sec"><h3>表示</h3>
    ${check('showLabel', 'ボタンに文字（きく・とめる など）を表示する', s.showLabel)}
    ${check('showTitle', '曲名を表示する', s.showTitle)}
    ${check('showObsBar', '学習中、画面の上に「観察記録ボタン」を表示する（先生が押して記録）', s.showObsBar)}
    <p class="note">観察記録ボタンは、先生が「自発的に押した」などをその場で数えるためのものです。児童がさわりやすい場合は表示しないでください（設定画面の「学習記録」タブでも記録できます）。</p>
  </div>
  <div class="sec"><h3>全画面にする</h3>
    <p class="note">いちばん確実なのは、Safariの共有ボタン→「ホーム画面に追加」でアプリとして開く方法です（くわしくは導入手順）。iPadの「アクセスガイド」を使うと、ホームボタンや画面の一部を無効にできます。</p>
  </div>`;
  body.addEventListener('click', async (e) => {
    const p = e.target.closest('[data-preset]');
    if (!p) return;
    S.settings.colors = { ...PRESETS[Number(p.dataset.preset)][1] };
    await saveSettings(); renderTab();
  });
}

// ---- 学習記録 ----------------------------------------------------------------
function tabRecords(body) {
  renderRecords(body, { rerender: renderTab });
}

// ---- データ・児童 ---------------------------------------------------------------
function tabData(body) {
  const s = S.settings;
  body.innerHTML = `
  <div class="sec"><h3>児童の登録名</h3>
    <p class="note">実名ではなく、イニシャルや「Aさん」などの呼び名で登録してください。学習記録は児童ごとに分かれます。</p>
    <ul class="list">${S.students.map((x) => `<li data-id="${x.id}" class="${x.id === s.studentId ? 'current' : ''}">
      <span class="name">${esc(x.name)}${x.id === s.studentId ? '　<span class="meta">（選択中）</span>' : ''}</span>
      <button class="btn small" data-act="use">選ぶ</button>
      <button class="btn small" data-act="ren">名前を変える</button>
      <button class="btn small danger" data-act="del" ${S.students.length <= 1 ? 'disabled' : ''}>削除</button></li>`).join('')}</ul>
    <div class="field"><button class="btn primary" data-act="addSt">＋ 児童を追加</button></div>
    ${check('recordOn', '学習記録をとる', s.recordOn)}
  </div>
  <div class="sec"><h3>バックアップ（保存）</h3>
    <p class="note">iPadの空き容量が少ないときや、Safariのデータを消したときに、登録した曲や記録が消えることがあります。ときどきバックアップをとり、「ファイル」アプリなどに保管してください。<br>
    ※ バックアップファイルには学習記録（児童の登録名を含む）が入ります。校内の決まりにしたがって保管し、外部に送らないでください。</p>
    <div class="field">
      <button class="btn primary" data-act="bkAll">音楽もふくめて保存</button>
      <button class="btn" data-act="bkLite">設定と記録だけ保存（軽い）</button>
    </div>
    <p class="note" id="bkMsg"></p>
  </div>
  <div class="sec"><h3>復元（バックアップからもどす）</h3>
    <p class="note">バックアップファイル（.ongaku）を選ぶと、いまのデータを消して、バックアップの内容にもどします。</p>
    <button class="btn danger" data-act="restore">バックアップファイルを選ぶ</button>
    <input type="file" id="rsIn" hidden>
  </div>
  <div class="sec"><h3>このアプリについて</h3>
    <p class="note">おんがくスイッチ　バージョン ${VERSION}<br>データはすべてこのiPadの中だけに保存され、インターネットへは送信しません。</p>
  </div>`;

  const rsIn = body.querySelector('#rsIn');
  rsIn.addEventListener('change', async () => {
    const f = rsIn.files[0];
    if (!f) return;
    if (!(await confirmDlg('いまの曲・設定・学習記録をすべて消して、バックアップの内容にもどします。よろしいですか？', 'もどす', true))) return;
    const msg = body.querySelector('#bkMsg');
    try {
      await restoreBackup(f, (t) => { msg.textContent = t; });
      await dialog('<h3>復元しました</h3><p>アプリを読み込み直します。</p><div class="foot"><button class="btn primary" data-close>OK</button></div>');
      location.reload();
    } catch (err) {
      toast('復元できませんでした：' + (err.message || err), 6000);
    }
  });
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const id = b.closest('li') && b.closest('li').dataset.id;
    const st = S.students.find((x) => x.id === id);
    if (act === 'use') { s.studentId = id; await saveSettings(); renderTab(); }
    if (act === 'ren') {
      const n = await promptDlg('登録名（イニシャルなど）', st.name);
      if (!n) return;
      st.name = n; await DB.put('students', st); renderTab();
    }
    if (act === 'del') {
      if (!(await confirmDlg(`「${st.name}」を削除しますか？\n（学習記録は残ります）`, '削除する', true))) return;
      await DB.del('students', id);
      S.students = S.students.filter((x) => x.id !== id);
      if (s.studentId === id) s.studentId = S.students[0].id;
      await saveSettings(); renderTab();
    }
    if (act === 'addSt') {
      const n = await promptDlg('登録名（イニシャルなど）', '', '例：Bさん、K.T');
      if (!n) return;
      const ns = { id: DB.uid('c'), name: n, createdAt: Date.now() };
      await DB.put('students', ns); S.students.push(ns); renderTab();
    }
    if (act === 'bkAll' || act === 'bkLite') {
      const msg = body.querySelector('#bkMsg');
      try {
        const name = await makeBackup(act === 'bkAll', (t) => { msg.textContent = t; });
        msg.textContent = `「${name}」を保存しました。iPadでは「ファイル」アプリの「ダウンロード」フォルダに入ります。`;
      } catch (err) {
        msg.textContent = 'バックアップできませんでした：' + (err.message || err);
      }
    }
    if (act === 'restore') { rsIn.value = ''; rsIn.click(); }
  });
}

// ---- 学習のおわり：観察記録とメモ ----------------------------------------------
export async function endDialog(ses) {
  const counts = { ...ses.obs };
  await dialog(`
    <h3>学習のふりかえり</h3>
    <p class="note">数はあとから「学習記録」タブでも直せます。</p>
    <div class="counter">${OBS.map(([k, l]) => `<div><span>${l}</span><span style="display:flex;align-items:center;gap:4px"><button data-m="${k}" aria-label="へらす">−</button><b id="c-${k}">${counts[k] || 0}</b><button data-p="${k}" aria-label="ふやす">＋</button></span></div>`).join('')}</div>
    <h4>メモ（気付いたこと）</h4>
    <textarea id="memo" placeholder="例：曲が止まると、スイッチの方を見た。">${esc(ses.memo || '')}</textarea>
    <div class="foot"><button class="btn primary" id="okBtn">記録を保存</button></div>`, (box, close) => {
    box.addEventListener('click', (e) => {
      const p = e.target.closest('[data-p]'); const m = e.target.closest('[data-m]');
      const k = (p || m) && (p ? p.dataset.p : m.dataset.m);
      if (!k) return;
      counts[k] = Math.max(0, (counts[k] || 0) + (p ? 1 : -1));
      box.querySelector('#c-' + k).textContent = counts[k];
    });
    box.querySelector('#okBtn').addEventListener('click', () => { ses.memo = box.querySelector('#memo').value; close('ok'); });
  });
  ses.obs = counts;
  await DB.put('sessions', ses);
}
