// 音を鳴らす部分（Web Audio API）
// ・曲は前もって「デコード（音に戻す）」しておき、スイッチを押した瞬間に鳴らせるようにする。
// ・開始位置・終了位置が設定されている曲は、その部分だけを切り出して持っておく。
// ・iPad Safari では <audio> の音量変更が効かないため、音量は GainNode で調整する。

const CACHE_LIMIT = 3; // メモリに置いておく曲の数（いまの曲・つぎの曲＋予備）

export class Player {
  constructor(loadAudio) {
    this.loadAudio = loadAudio; // (songId) => Promise<ArrayBuffer>
    this.ctx = null;
    this.master = null;
    this.cache = new Map(); // key -> Promise<AudioBuffer>
    this.cur = null; // { src, gain, song, key, startCtx, offset, duration }
    this.gen = 0; // 再生/停止の世代番号（押す・離すが速いときの取り違え防止）
    this.onEnded = null;
    this.masterVolume = 1;
  }

  ensureContext() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch { this.ctx = new AC(); }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.masterVolume;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  // 「学習スタート」やスイッチ入力のたびに呼ぶ（iPadの自動再生制限の解除）
  unlock() {
    const ctx = this.ensureContext();
    try {
      // iPadのサイレント（消音）設定でも鳴るように（Safari 16.4 以降）
      if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback';
    } catch { /* 未対応 */ }
    if (ctx.state !== 'running') {
      try { ctx.resume(); } catch { /* 無視 */ }
    }
    // 無音を一瞬鳴らして音声出力を起こしておく
    try {
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
    } catch { /* 無視 */ }
  }

  get running() { return !!(this.ctx && this.ctx.state === 'running'); }

  setMasterVolume(v) {
    this.masterVolume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  keyOf(song) { return `${song.id}:${song.start || 0}:${song.end || 0}:${song.rev || 0}`; }

  // 曲を音のデータに戻して（必要なら部分を切り出して）キャッシュする
  prepare(song) {
    if (!song) return Promise.resolve(null);
    const key = this.keyOf(song);
    if (this.cache.has(key)) {
      const p = this.cache.get(key);
      this.cache.delete(key); this.cache.set(key, p); // 最近使った順に
      return p;
    }
    const ctx = this.ensureContext();
    const p = (async () => {
      const data = await this.loadAudio(song.id);
      if (!data) throw new Error('音のデータが見つかりません');
      const full = await decode(ctx, data.slice(0));
      return trim(ctx, full, song.start || 0, song.end || 0);
    })();
    p.catch(() => this.cache.delete(key));
    this.cache.set(key, p);
    // 古いものから捨てる（いま鳴っている曲・いま準備した曲は残す）
    for (const k of [...this.cache.keys()]) {
      if (this.cache.size <= CACHE_LIMIT) break;
      if (k === key || (this.cur && this.cur.key === k)) continue;
      this.cache.delete(k);
    }
    return p;
  }

  forget(songId) {
    for (const k of [...this.cache.keys()]) if (k.startsWith(songId + ':')) this.cache.delete(k);
  }

  // offset 秒から再生。戻り値：実際に鳴り始めたら true
  async play(song, offset = 0, fadeIn = 0.012) {
    const my = ++this.gen;
    this.stopNow();
    const ctx = this.ensureContext();
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch { /* 無視 */ } }
    const buffer = await this.prepare(song);
    if (my !== this.gen || !buffer) return false; // 待っている間に「止める」が来た
    if (offset >= buffer.duration - 0.05) offset = 0;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    const vol = song.volume == null ? 1 : song.volume;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + fadeIn);
    src.connect(gain); gain.connect(this.master);
    const cur = { src, gain, song, key: this.keyOf(song), startCtx: t, offset, duration: buffer.duration, vol };
    src.onended = () => {
      if (this.cur === cur) {
        this.cur = null;
        if (this.onEnded) this.onEnded(song);
      }
    };
    src.start(t, offset);
    this.cur = cur;
    return true;
  }

  get playing() { return !!this.cur; }

  get position() {
    const c = this.cur;
    if (!c) return 0;
    return Math.min(c.duration, c.offset + (this.ctx.currentTime - c.startCtx));
  }

  // 止める。戻り値：止めた位置（秒）
  stop(fade = 0.05) {
    this.gen++;
    const c = this.cur;
    if (!c) return 0;
    const pos = this.position;
    this.cur = null;
    const t = this.ctx.currentTime;
    try {
      c.gain.gain.cancelScheduledValues(t);
      c.gain.gain.setValueAtTime(c.gain.gain.value, t);
      c.gain.gain.linearRampToValueAtTime(0, t + Math.max(0.01, fade));
      c.src.stop(t + Math.max(0.01, fade) + 0.02);
    } catch { /* すでに止まっている */ }
    return pos >= c.duration - 0.05 ? 0 : pos;
  }

  stopNow() {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    try { c.src.stop(); } catch { /* 無視 */ }
  }
}

function decode(ctx, data) {
  return new Promise((resolve, reject) => {
    // 古いSafari向けにコールバック形式にも対応
    const p = ctx.decodeAudioData(data, resolve, (e) => reject(e || new Error('この音声ファイルは再生できません')));
    if (p && p.then) p.then(resolve, reject);
  });
}

function trim(ctx, buf, start, end) {
  const sr = buf.sampleRate;
  const s = Math.max(0, Math.floor(start * sr));
  const e = end > 0 ? Math.min(buf.length, Math.floor(end * sr)) : buf.length;
  if (s === 0 && e === buf.length) return buf;
  if (e - s < sr * 0.2) return buf; // 範囲が短すぎる設定は無視
  const out = ctx.createBuffer(buf.numberOfChannels, e - s, sr);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    out.getChannelData(ch).set(buf.getChannelData(ch).subarray(s, e));
  }
  return out;
}
