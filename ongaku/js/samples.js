// お試し用の曲（著作権の保護期間が終わった童謡のメロディーを、アプリの中でオルゴール風の音にする）
// 音声ファイルを配らなくてよいように、その場で WAV を作って登録する。

const SR = 22050; // サンプリング周波数（容量を小さくするため）
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function freq(n) {
  const m = /^([A-G])(#?)(\d)$/.exec(n);
  const midi = 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

// "C4 D4:2 R:1" … 音名:拍数（省略時1拍）、R は休み
function parse(s) {
  return s.trim().split(/\s+/).filter((x) => x !== '|').map((t) => {
    const [n, d] = t.split(':');
    return { n, d: d ? Number(d) : 1 };
  });
}

export const SAMPLES = [
  {
    name: 'きらきらぼし',
    bpm: 96,
    melody: 'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2',
    bass: 'C3 C3 F2 C3 F2 C3 G2 C3 C3 F2 C3 G2 C3 F2 C3 G2 C3 C3 F2 C3 F2 C3 G2 C3', // 2拍ごと
  },
  {
    name: 'メリーさんのひつじ',
    bpm: 104,
    melody: 'E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:4',
    bass: 'C3 C3 C3 C3 G2 G2 C3 C3 C3 C3 C3 C3 G2 G2 C3 C3',
  },
  {
    name: 'かえるのうた',
    bpm: 100,
    melody: 'C4 D4 E4 F4 E4 D4 C4:2 E4 F4 G4 A4 G4 F4 E4:2 C4:2 C4:2 C4:2 C4:2 C4:0.5 C4:0.5 D4:0.5 D4:0.5 E4:0.5 E4:0.5 F4:0.5 F4:0.5 E4 D4 C4:2',
    bass: 'C3 C3 C3 C3 C3 F2 C3 C3 C3 C3 C3 C3 C3 F2 G2 C3',
  },
];

// オルゴール風の1音を足しこむ
function addNote(buf, start, f, len, amp) {
  const s0 = Math.floor(start * SR);
  const n = Math.min(buf.length - s0, Math.floor((len + 1.2) * SR));
  const w = 2 * Math.PI * f / SR;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.004) * Math.exp(-t * 3.2);
    buf[s0 + i] += amp * env * (Math.sin(w * i) + 0.25 * Math.sin(2 * w * i) + 0.08 * Math.sin(3 * w * i));
  }
}

export function renderSample(def, repeats = 2) {
  const beat = 60 / def.bpm;
  const mel = parse(def.melody);
  const bass = parse(def.bass);
  const total = mel.reduce((a, x) => a + x.d, 0);
  const lead = 0.15; // 押してすぐ音が出るように、はじめの無音はほとんどなし
  const gap = 1; // くり返しの間（拍）
  const seconds = lead + (total + gap) * beat * repeats + 1.5;
  const buf = new Float32Array(Math.ceil(seconds * SR));
  for (let r = 0; r < repeats; r++) {
    let t = lead + r * (total + gap) * beat;
    for (const x of mel) {
      if (x.n !== 'R') addNote(buf, t, freq(x.n), x.d * beat, 0.32);
      t += x.d * beat;
    }
    t = lead + r * (total + gap) * beat;
    for (const x of bass) {
      if (x.n !== 'R') addNote(buf, t, freq(x.n), 2 * beat, 0.16);
      t += 2 * beat;
    }
  }
  // 最後は自然に消えるように
  const fade = Math.floor(1.0 * SR);
  for (let i = 0; i < fade; i++) buf[buf.length - 1 - i] *= i / fade;
  return encodeWav(buf);
}

function encodeWav(f32) {
  let peak = 0;
  for (let i = 0; i < f32.length; i++) peak = Math.max(peak, Math.abs(f32[i]));
  const g = peak > 0 ? 0.85 / peak : 1;
  const n = f32.length;
  const ab = new ArrayBuffer(44 + n * 2);
  const v = new DataView(ab);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, f32[i] * g)) * 32767, true);
  return ab;
}

// お試し用の曲を File として作る
export function sampleFiles() {
  return SAMPLES.map((d) => new File([renderSample(d)], d.name + '.wav', { type: 'audio/wav' }));
}
