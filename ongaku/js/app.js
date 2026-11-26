// おんがくスイッチ：本体（児童用画面・学習モード・学習記録の自動記録）
import * as DB from './db.js';
import { Player } from './player.js';
import { InputManager } from './input.js';
import { sampleFiles } from './samples.js';

export const VERSION = '1.2.0';

// ---- 学習モード・機能の名前 -------------------------------------------
export const MODES = {
  toggle: { short: 'A', name: '再生・停止', desc: '1回押すと音楽が流れ、もう1回押すと止まる' },
  timed: { short: 'B', name: '一定時間再生', desc: '1回押すと決めた秒数だけ流れて、自動で止まる' },
  next: { short: 'C', name: '曲送り', desc: '1回押すとつぎの曲に変わって流れる（最後の曲のつぎは最初の曲）' },
  two: { short: 'D', name: '2スイッチ', desc: 'スイッチ1とスイッチ2に、それぞれ機能を割り当てる' },
  hold: { short: 'E', name: '押している間だけ再生', desc: '押している間だけ流れ、離すと止まる' },
};
export const FUNCS = {
  toggle: 'きく・とめる（再生・停止）',
  timed: 'すこしきく（一定時間再生）',
  next: 'つぎのきょく',
  prev: 'まえのきょく',
  hold: '押している間だけ再生',
  stop: 'とめる',
  none: 'つかわない',
};
export const OBS = [
  ['spont', '自発的に押した'],
  ['prompt', '言葉掛けで押した'],
  ['physical', '身体的な支援で押した'],
  ['accidental', '偶然触れた'],
  ['reach', '手を伸ばそうとした'],
  ['smile', '笑顔が見られた'],
  ['stopReact', '停止時に反応'],
  ['other', 'その他の気付き'],
];

export const DEFAULTS = {
  mode: 'toggle',
  resume: 'resume', // resume: 止めたところから / restart: 開始位置から
  onEnd: 'stop', // 曲の最後まで流れたら：stop / repeat / next
  order: 'order', // order / random
  timedSec: 5,
  timedDuringPlay: 'ignore', // ignore / stop / extend
  timedNextPress: 'resume', // resume / restart / next
  nextUseTimer: false,
  sw1Func: 'toggle',
  sw2Func: 'next',
  keys: [
    { id: 'Space', sw: 1 },
    { id: 'Enter', sw: 2 },
    { id: 'NumpadEnter', sw: 2 },
    { id: 'ArrowLeft', sw: 1 },
    { id: 'ArrowRight', sw: 2 },
    { id: 'Digit1', sw: 1 },
    { id: 'Digit2', sw: 2 },
  ],
  anyKeyOneSwitch: true,
  keyEnabled: true,
  touchEnabled: true,
  mediaKeys: true,
  cooldownMs: 500,
  stopFade: 0.05,
  masterVolume: 1,
  colors: { bg: '#FFF6E9', idle: '#2E9E5B', active: '#EE7D1E', next: '#3A78C9', text: '#3B2F26' },
  buttonSize: 'L',
  showTitle: true,
  showLabel: true,
  showObsBar: false,
  playlistId: null,
  studentId: null,
  recordOn: true,
};

// ---- 状態 ---------------------------------------------------------------
export const S = {
  settings: structuredCloneSafe(DEFAULTS),
  songs: new Map(),
  playlists: [],
  students: [],
  idx: 0,
  nextIdx: null,
  playing: false,
  pos: 0,
  hasPlayed: false,
  timer: null,
  started: false,
  panelOpen: false,
  session: null,
  lastAccepted: 0,
  hold: { 1: false, 2: false },
  rawListeners: new Set(),
};

function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }

export const player = new Player(async (id) => {
  const row = await DB.get('audio', id);
  return row ? row.data : null;
});

const $ = (sel) => document.querySelector(sel);

// ---- 設定の保存 ---------------------------------------------------------
export async function saveSettings() {
  await DB.kvSet('settings', S.settings);
  applyTheme();
  player.setMasterVolume(S.settings.masterVolume);
  renderStage();
}

function mergeDefaults(saved) {
  const s = structuredCloneSafe(DEFAULTS);
  if (!saved) return s;
  for (const k of Object.keys(saved)) {
    if (k === 'colors') s.colors = { ...s.colors, ...saved.colors };
    else s[k] = saved[k];
  }
  return s;
}

// ---- プレイリスト・曲 ---------------------------------------------------
export function currentPlaylist() {
  return S.playlists.find((p) => p.id === S.settings.playlistId) || S.playlists[0] || null;
}
export function listSongs(pl = currentPlaylist()) {
  if (!pl) return [];
  return pl.songIds.map((id) => S.songs.get(id)).filter(Boolean);
}
export function currentSong() {
  const list = listSongs();
  if (!list.length) return null;
  if (S.idx >= list.length || S.idx < 0) S.idx = 0;
  return list[S.idx];
}

function pickNextIdx(dir = 1) {
  const n = listSongs().length;
  if (n <= 1) return 0;
  if (S.settings.order === 'random') {
    let r;
    do { r = Math.floor(Math.random() * n); } while (r === S.idx);
    return r;
  }
  return (S.idx + dir + n) % n;
}

// いまの曲とつぎの曲を前もって準備（押した瞬間に鳴らすため）
export function prepareAround() {
  const list = listSongs();
  if (!list.length) return;
  const cur = currentSong();
  player.prepare(cur).catch(() => {});
  if (list.length > 1) {
    S.nextIdx = pickNextIdx(1);
    player.prepare(list[S.nextIdx]).catch(() => {});
  }
}

export async function savePlaylist(pl) {
  await DB.put('playlists', pl);
  const i = S.playlists.findIndex((p) => p.id === pl.id);
  if (i >= 0) S.playlists[i] = pl; else S.playlists.push(pl);
}

export function resetPlaybackPosition() {
  if (S.playing) stopPlayback('stop', { silentLog: true });
  S.idx = 0; S.pos = 0; S.hasPlayed = false; S.nextIdx = null;
  renderStage();
}

// 音のファイルを追加（複数可）
export async function importFiles(files, playlistId, onProgress) {
  const pl = S.playlists.find((p) => p.id === playlistId) || currentPlaylist();
  const added = []; const failed = [];
  let i = 0;
  for (const f of files) {
    i++;
    if (onProgress) onProgress(i, files.length, f.name);
    try {
      const data = await f.arrayBuffer();
      const duration = await probeDuration(f);
      const song = {
        id: DB.uid('s'),
        name: f.name.replace(/\.[^.]+$/, ''),
        fileName: f.name,
        type: f.type || '',
        size: f.size,
        duration,
        start: 0,
        end: 0,
        volume: 1,
        rev: 0,
        addedAt: Date.now(),
      };
      await DB.putSongWithAudio(song, data);
      S.songs.set(song.id, song);
      if (pl) pl.songIds.push(song.id);
      added.push(song);
    } catch (e) {
      failed.push({ name: f.name, error: String(e && e.message || e) });
    }
  }
  if (pl) await savePlaylist(pl);
  prepareAround();
  renderStage();
  return { added, failed };
}

export async function addSamples() {
  const res = await importFiles(sampleFiles(), S.settings.playlistId);
  await DB.kvSet('samplesAdded', true);
  return res;
}

export function probeDuration(blob) {
  return new Promise((resolve) => {
    let url;
    try { url = URL.createObjectURL(blob); } catch { resolve(null); return; }
    const a = new Audio();
    const done = (v) => { clearTimeout(t); try { URL.revokeObjectURL(url); } catch { /* 無視 */ } resolve(v); };
    const t = setTimeout(() => done(null), 6000);
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(isFinite(a.duration) ? a.duration : null);
    a.onerror = () => done(null);
    a.src = url;
  });
}

export async function updateSong(song) {
  song.rev = (song.rev || 0) + 1;
  await DB.put('songs', song);
  S.songs.set(song.id, song);
  player.forget(song.id);
  if (currentSong() && currentSong().id === song.id) S.pos = 0;
  prepareAround();
  renderStage();
}

export async function deleteSong(id) {
  if (currentSong() && currentSong().id === id && S.playing) stopPlayback('stop', { silentLog: true });
  await DB.deleteSongWithAudio(id);
  S.songs.delete(id);
  player.forget(id);
  for (const pl of S.playlists) {
    if (pl.songIds.includes(id)) {
      pl.songIds = pl.songIds.filter((x) => x !== id);
      await DB.put('playlists', pl);
    }
  }
  S.idx = 0; S.pos = 0;
  prepareAround();
  renderStage();
}

// ---- スイッチ入力 → 機能 ------------------------------------------------
export function isSingleSwitch() { return S.settings.mode !== 'two'; }

export function funcFor(sw) {
  const s = S.settings;
  if (s.mode === 'two') return s['sw' + sw + 'Func'] || 'none';
  return s.mode; // 1スイッチのモードでは、どのスイッチも同じ働き
}

function handleInput(phase, sw, meta) {
  if (!S.started || S.panelOpen) return;
  player.unlock();
  const func = funcFor(sw);
  const now = performance.now();

  if (phase === 'up') {
    if (S.hold[sw]) {
      S.hold[sw] = false;
      if (S.playing) stopPlayback('stop', { reason: 'release', sw });
      renderStage();
    }
    return;
  }

  const ev = { type: 'input', sw, src: meta.source, key: meta.id || '', func, valid: false };
  if (!func || func === 'none') { ev.reason = '割り当てなし'; log(ev); return; }
  if (!listSongs().length) { ev.reason = '曲がない'; log(ev); toast('曲が登録されていません（先生の設定から追加）'); return; }
  if (now - S.lastAccepted < S.settings.cooldownMs) { ev.reason = '連続入力の防止'; log(ev); return; }

  let ok = false;
  const tap = phase === 'tap';
  switch (func) {
    case 'toggle': ok = doToggle(sw); break;
    case 'timed': ok = doTimed(sw); break;
    case 'next': ok = doStep(1, sw); break;
    case 'prev': ok = doStep(-1, sw); break;
    case 'stop': ok = S.playing ? (stopPlayback('stop', { sw }), true) : false; break;
    case 'hold':
      if (tap) ok = doToggle(sw); // 押す/離すが分からない入力（スイッチコントロール等）は再生・停止
      else { ok = doHoldDown(sw); }
      break;
    default: ok = false;
  }
  ev.valid = !!ok;
  if (!ok) ev.reason = func === 'timed' && S.playing ? '再生中のため無効' : '変化なし';
  if (ok) S.lastAccepted = now;
  log(ev);
  renderStage();
}

function doToggle(sw) {
  if (S.playing) { stopPlayback('stop', { sw }); return true; }
  startPlayback(S.settings.resume === 'resume' ? S.pos : 0, { sw });
  return true;
}

function doTimed(sw) {
  const s = S.settings;
  if (S.playing) {
    if (s.timedDuringPlay === 'stop') { stopPlayback('stop', { sw }); return true; }
    if (s.timedDuringPlay === 'extend') { setTimer(s.timedSec); log({ type: 'extend', sw }); return true; }
    return false;
  }
  let offset = S.pos;
  if (s.timedNextPress === 'restart') offset = 0;
  if (s.timedNextPress === 'next' && S.hasPlayed) { moveTo(S.nextIdx ?? pickNextIdx(1)); offset = 0; log({ type: 'next', sw }); }
  startPlayback(offset, { sw });
  setTimer(s.timedSec);
  return true;
}

function doStep(dir, sw) {
  const s = S.settings;
  // 曲送りモードで最初の1回は、いまの曲（1曲目）を流す
  if (!S.hasPlayed && dir === 1 && s.mode === 'next') {
    startPlayback(0, { sw });
  } else {
    if (S.playing) player.stopNow();
    moveTo(dir === 1 ? (S.nextIdx ?? pickNextIdx(1)) : pickNextIdx(-1));
    log({ type: dir === 1 ? 'next' : 'prev', sw });
    startPlayback(0, { sw });
  }
  if (s.nextUseTimer && (s.mode === 'next' || s.mode === 'two')) setTimer(s.timedSec);
  else clearTimer();
  return true;
}

function doHoldDown(sw) {
  S.hold[sw] = true;
  if (S.playing) return false;
  startPlayback(S.settings.resume === 'resume' ? S.pos : 0, { sw });
  return true;
}

function moveTo(i) {
  S.idx = i; S.pos = 0; S.nextIdx = null;
  prepareAround();
}

function startPlayback(offset, info = {}) {
  const song = currentSong();
  if (!song) return;
  S.playing = true; S.hasPlayed = true;
  log({ type: 'play', sw: info.sw, songId: song.id, song: song.name, from: Math.round(offset * 10) / 10 });
  renderStage();
  player.play(song, offset).catch((e) => {
    S.playing = false; clearTimer(); renderStage();
    toast('「' + song.name + '」を再生できませんでした。ファイルの形式を確認してください。');
    log({ type: 'error', song: song.name, message: String(e && e.message || e) });
  });
}

export function stopPlayback(kind = 'stop', info = {}) {
  clearTimer();
  const pos = player.stop(S.settings.stopFade);
  S.pos = pos;
  S.playing = false;
  if (!info.silentLog) {
    const song = currentSong();
    log({ type: kind, sw: info.sw, reason: info.reason, songId: song && song.id, song: song && song.name, at: Math.round(pos * 10) / 10 });
  }
  renderStage();
}

function setTimer(sec) {
  clearTimer();
  S.timer = setTimeout(() => {
    S.timer = null;
    if (S.playing) stopPlayback('auto-stop');
  }, Math.max(0.5, Number(sec) || 5) * 1000);
}
function clearTimer() { if (S.timer) { clearTimeout(S.timer); S.timer = null; } }

player.onEnded = (song) => {
  // 曲が最後まで流れた
  S.playing = false; S.pos = 0;
  log({ type: 'song-end', songId: song.id, song: song.name });
  const s = S.settings;
  if (s.mode === 'hold') { renderStage(); return; }
  if (s.onEnd === 'repeat') { startPlayback(0); return; }
  if (s.onEnd === 'next' && listSongs().length) {
    moveTo(S.nextIdx ?? pickNextIdx(1));
    log({ type: 'next', auto: true });
    startPlayback(0);
    return;
  }
  clearTimer();
  renderStage();
};

// ---- 学習記録（自動記録） ------------------------------------------------
export function newSession() {
  const st = S.students.find((x) => x.id === S.settings.studentId);
  const pl = currentPlaylist();
  return {
    id: DB.uid('r'),
    studentId: st ? st.id : null,
    studentName: st ? st.name : '',
    startAt: Date.now(),
    endAt: null,
    lastAt: Date.now(),
    mode: S.settings.mode,
    settingsSnapshot: {
      timedSec: S.settings.timedSec, sw1Func: S.settings.sw1Func, sw2Func: S.settings.sw2Func,
      cooldownMs: S.settings.cooldownMs, timedDuringPlay: S.settings.timedDuringPlay,
    },
    playlistName: pl ? pl.name : '',
    events: [],
    obs: Object.fromEntries(OBS.map(([k]) => [k, 0])),
    obsEvents: [],
    memo: '',
  };
}

let saveTimer = null;
export function log(ev) {
  const ses = S.session;
  if (!ses) return;
  ev.t = Date.now();
  ses.events.push(ev);
  ses.lastAt = ev.t;
  scheduleSave();
}
export function scheduleSave() {
  if (!S.session) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSessionNow(), 1200);
}
export async function saveSessionNow() {
  clearTimeout(saveTimer);
  if (S.session) await DB.put('sessions', S.session).catch(() => {});
}

export function addObservation(key) {
  if (!S.session) return;
  S.session.obs[key] = (S.session.obs[key] || 0) + 1;
  S.session.obsEvents.push({ t: Date.now(), key });
  scheduleSave();
  renderObsBar();
}

// ---- 学習の開始・終了 ----------------------------------------------------
let wakeLock = null;
export async function startLearning() {
  player.unlock();
  S.started = true;
  S.pos = 0; S.hasPlayed = false; S.idx = 0; S.lastAccepted = 0;
  S.session = S.settings.recordOn ? newSession() : null;
  if (S.session) await saveSessionNow();
  prepareAround();
  $('#start').hidden = true;
  renderStage();
  try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch { /* 未対応 */ }
}

export async function endLearning() {
  if (S.playing) stopPlayback('stop', { reason: '学習終了' });
  S.started = false;
  const ses = S.session;
  if (ses) { ses.endAt = Date.now(); await saveSessionNow(); }
  S.session = null;
  try { if (wakeLock) await wakeLock.release(); } catch { /* 無視 */ }
  wakeLock = null;
  return ses;
}

// アプリを閉じたまま終わった記録に終了時刻をつける
async function closeUnfinishedSessions() {
  const all = await DB.getAll('sessions').catch(() => []);
  for (const s of all) {
    if (!s.endAt) { s.endAt = s.lastAt || s.startAt; s.unfinished = true; await DB.put('sessions', s); }
  }
}

// ---- 画面 --------------------------------------------------------------
const ICONS = {
  play: '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M36 24 L78 50 L36 76 Z" fill="currentColor" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/></svg>',
  stop: '<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="28" y="28" width="44" height="44" rx="8" fill="currentColor"/></svg>',
  next: '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M22 26 L54 50 L22 74 Z M48 26 L80 50 L48 74 Z" fill="currentColor" stroke="currentColor" stroke-width="6" stroke-linejoin="round"/></svg>',
  prev: '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M78 26 L46 50 L78 74 Z M52 26 L20 50 L52 74 Z" fill="currentColor" stroke="currentColor" stroke-width="6" stroke-linejoin="round"/></svg>',
  note: '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M40 70 V26 L76 18 V62" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/><ellipse cx="31" cy="71" rx="12" ry="9" fill="currentColor"/><ellipse cx="67" cy="63" rx="12" ry="9" fill="currentColor"/></svg>',
};

export function look(func, sw) {
  const c = S.settings.colors;
  const p = S.playing;
  const two = S.settings.mode === 'two';
  switch (func) {
    case 'toggle': return p ? { color: c.active, icon: 'stop', label: 'とめる' } : { color: c.idle, icon: 'play', label: 'きく' };
    case 'timed':
      if (!p) return { color: c.idle, icon: 'play', label: 'きく' };
      return S.settings.timedDuringPlay === 'stop' ? { color: c.active, icon: 'stop', label: 'とめる' } : { color: c.active, icon: 'note', label: 'きいてるよ' };
    case 'next': return { color: two ? c.next : (p ? c.active : c.idle), icon: 'next', label: 'つぎのきょく' };
    case 'prev': return { color: two ? c.next : (p ? c.active : c.idle), icon: 'prev', label: 'まえのきょく' };
    case 'hold': return S.hold[sw] || p ? { color: c.active, icon: 'note', label: 'きいてるよ' } : { color: c.idle, icon: 'play', label: 'おしてね' };
    case 'stop': return { color: p ? c.active : '#9A9A9A', icon: 'stop', label: 'とめる' };
    default: return { color: '#BDBDBD', icon: 'note', label: '' };
  }
}

function paintButton(el, func, sw) {
  const lk = look(func, sw);
  el.style.setProperty('--btn', lk.color);
  el.dataset.state = S.playing ? 'playing' : 'stopped';
  el.dataset.func = func;
  const iconEl = el.querySelector('.icon');
  if (iconEl.dataset.icon !== lk.icon) { iconEl.innerHTML = ICONS[lk.icon]; iconEl.dataset.icon = lk.icon; }
  const lab = el.querySelector('.label');
  lab.textContent = lk.label;
  lab.hidden = !S.settings.showLabel;
  el.setAttribute('aria-label', lk.label || 'スイッチ');
}

export function renderStage() {
  const s = S.settings;
  const two = s.mode === 'two';
  document.body.dataset.layout = two ? 'two' : 'one';
  document.body.dataset.size = s.buttonSize;
  $('#one').hidden = two;
  $('#two').hidden = !two;
  if (two) {
    paintButton($('#btnL'), s.sw1Func, 1);
    paintButton($('#btnR'), s.sw2Func, 2);
  } else {
    paintButton($('#btn1'), s.mode, 1);
  }
  const song = currentSong();
  const title = $('#title');
  title.hidden = !s.showTitle || !song;
  title.textContent = song ? song.name : '';
  renderObsBar();
  for (const fn of S.rawListeners) if (fn.onState) fn.onState();
}

export function renderObsBar() {
  const bar = $('#obsbar');
  const show = S.settings.showObsBar && S.started && !!S.session;
  bar.hidden = !show;
  if (!show) return;
  if (!bar.dataset.built) {
    bar.innerHTML = OBS.filter(([k]) => k !== 'other').map(([k, l]) => `<button type="button" data-obs="${k}">${l} <b>0</b></button>`).join('');
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-obs]');
      if (b) addObservation(b.dataset.obs);
    });
    bar.dataset.built = '1';
  }
  for (const b of bar.querySelectorAll('[data-obs]')) b.querySelector('b').textContent = S.session.obs[b.dataset.obs] || 0;
}

export function applyTheme() {
  const c = S.settings.colors;
  const r = document.documentElement.style;
  r.setProperty('--bg', c.bg);
  r.setProperty('--ink', c.text);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', c.bg);
}

let toastTimer = null;
export function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

// ---- 開始画面 ----------------------------------------------------------
export function renderStart() {
  const s = S.settings;
  const list = listSongs();
  const pl = currentPlaylist();
  const m = MODES[s.mode];
  let detail = '';
  if (s.mode === 'timed') detail = `（${s.timedSec}秒）`;
  if (s.mode === 'two') detail = `（スイッチ1：${FUNCS[s.sw1Func]}／スイッチ2：${FUNCS[s.sw2Func]}）`;
  $('#startInfo').innerHTML = `
    <div><span class="k">モード</span><span class="v">${m.short}　${m.name}${esc(detail)}</span></div>
    <div><span class="k">プレイリスト</span><span class="v">${esc(pl ? pl.name : '-')}（${list.length}曲）</span></div>
    <div><span class="k">記録</span><span class="v">${s.recordOn ? 'する' : 'しない'}</span></div>`;
  const sel = $('#startStudent');
  sel.innerHTML = S.students.map((x) => `<option value="${x.id}" ${x.id === s.studentId ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  $('#startGo').disabled = !list.length;
  $('#startNoSongs').hidden = !!list.length;
}

export function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- 先生用ボタン（長押しで開く） -----------------------------------------
function bindGear(openPanel) {
  const g = $('#gear');
  let timer = null;
  const HOLD = 1500;
  const cancel = () => { clearTimeout(timer); timer = null; g.classList.remove('holding'); };
  g.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    g.classList.add('holding');
    timer = setTimeout(() => { cancel(); openPanel(); }, HOLD);
  });
  g.addEventListener('pointerup', cancel);
  g.addEventListener('pointercancel', cancel);
  g.addEventListener('pointerleave', cancel);
  g.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ---- 起動 ----------------------------------------------------------------
export const input = new InputManager({
  getSettings: () => S.settings,
  isSingleSwitch,
  onInput: handleInput,
  onRaw: (info) => { for (const fn of S.rawListeners) if (fn.onRaw) fn.onRaw(info); },
});

export async function boot({ openPanel }) {
  try { await DB.openDB(); } catch (e) {
    toast('データを保存する場所が使えません。プライベートブラウズを解除してください。', 10000);
  }
  S.settings = mergeDefaults(await DB.kvGet('settings', null));
  const songs = await DB.getAll('songs').catch(() => []);
  for (const s of songs) S.songs.set(s.id, s);
  S.playlists = (await DB.getAll('playlists').catch(() => [])).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  S.students = (await DB.getAll('students').catch(() => [])).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  if (!S.playlists.length) {
    const pl = { id: DB.uid('p'), name: 'プレイリスト1', songIds: [...S.songs.keys()], createdAt: Date.now() };
    await DB.put('playlists', pl).catch(() => {});
    S.playlists.push(pl);
  }
  if (!S.students.length) {
    const st = { id: DB.uid('c'), name: 'Aさん', createdAt: Date.now() };
    await DB.put('students', st).catch(() => {});
    S.students.push(st);
  }
  if (!S.playlists.find((p) => p.id === S.settings.playlistId)) S.settings.playlistId = S.playlists[0].id;
  if (!S.students.find((p) => p.id === S.settings.studentId)) S.settings.studentId = S.students[0].id;
  await DB.kvSet('settings', S.settings).catch(() => {});
  await closeUnfinishedSessions();
  DB.requestPersist();
  // はじめて開いたときは、お試し用の曲を入れておく（いらなければ削除できる）
  if (!S.songs.size && !(await DB.kvGet('samplesAdded', false)) && !/nosamples/.test(location.search)) {
    await addSamples().catch(() => {});
  }

  applyTheme();
  player.setMasterVolume(S.settings.masterVolume);
  input.bindButton($('#btn1'), 1);
  input.bindButton($('#btnL'), 1);
  input.bindButton($('#btnR'), 2);
  input.attach();
  bindGear(openPanel);

  $('#startGo').addEventListener('click', () => startLearning());
  $('#startSettings').addEventListener('click', () => openPanel());
  $('#startStudent').addEventListener('change', async (e) => {
    S.settings.studentId = e.target.value; await saveSettings(); renderStart();
  });
  const fsBtn = $('#startFull');
  const fsEl = document.documentElement;
  if (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen) {
    fsBtn.hidden = false;
    fsBtn.addEventListener('click', () => {
      try { (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl); } catch { /* 未対応 */ }
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveSessionNow();
    else if (S.started && navigator.wakeLock) navigator.wakeLock.request('screen').then((w) => { wakeLock = w; }).catch(() => {});
  });
  window.addEventListener('pagehide', () => saveSessionNow());

  renderStage();
  renderStart();
}
