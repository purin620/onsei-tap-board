// 録音して曲として追加する（先生の歌・演奏、学校で作った音楽など）
// iPad / iPhone の Safari（iOS 14.5 以降）の MediaRecorder を使う。https でのみ動作。

const TYPES = ['audio/mp4', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

export function canRecord() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
}

export class Recorder {
  constructor() {
    this.stream = null;
    this.rec = null;
    this.chunks = [];
    this.startedAt = 0;
  }

  async start() {
    // 音楽の録音なので、声向けの自動処理（雑音除去・自動音量）は切る
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const type = TYPES.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
    this.rec = type ? new MediaRecorder(this.stream, { mimeType: type }) : new MediaRecorder(this.stream);
    this.chunks = [];
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.rec.start();
    this.startedAt = Date.now();
  }

  get seconds() { return this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0; }

  // 止めて、録音したデータ（Blob）を返す
  stop() {
    return new Promise((resolve) => {
      const r = this.rec;
      if (!r || r.state === 'inactive') { this.release(); resolve(null); return; }
      const sec = this.seconds;
      r.onstop = () => {
        const type = r.mimeType || (this.chunks[0] && this.chunks[0].type) || 'audio/mp4';
        const blob = new Blob(this.chunks, { type });
        this.release();
        resolve({ blob, seconds: sec, type });
      };
      r.stop();
    });
  }

  release() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.startedAt = 0;
  }
}

export function extOf(type) {
  if (/mp4|aac/.test(type)) return 'm4a';
  if (/webm/.test(type)) return 'webm';
  if (/ogg/.test(type)) return 'ogg';
  return 'audio';
}
