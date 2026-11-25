// 先生用画面で使う小さな部品（ダイアログ・確認・ファイル保存）
import { esc } from './app.js';

const $ = (s) => document.querySelector(s);

export function dialog(html, onMount) {
  const wrap = $('#dialog');
  const box = wrap.querySelector('.box');
  box.innerHTML = html;
  wrap.hidden = false;
  return new Promise((resolve) => {
    const close = (v) => { wrap.hidden = true; box.innerHTML = ''; resolve(v); };
    box.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => close(b.dataset.close)));
    if (onMount) onMount(box, close);
  });
}

export function confirmDlg(msg, okLabel = 'はい', danger = false) {
  return dialog(`<h3>確認</h3><p style="line-height:1.7">${esc(msg).replace(/\n/g, '<br>')}</p>
    <div class="foot"><button class="btn" data-close="">やめる</button><button class="btn ${danger ? 'danger' : 'primary'}" data-close="ok">${esc(okLabel)}</button></div>`)
    .then((v) => v === 'ok');
}

export function promptDlg(title, value = '', placeholder = '') {
  return dialog(`<h3>${esc(title)}</h3><input type="text" style="width:100%" value="${esc(value)}" placeholder="${esc(placeholder)}">
    <div class="foot"><button class="btn" data-close="">やめる</button><button class="btn primary" data-ok>決定</button></div>`,
  (box, close) => {
    const inp = box.querySelector('input');
    setTimeout(() => inp.focus(), 50);
    box.querySelector('[data-ok]').addEventListener('click', () => close(inp.value.trim()));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') close(inp.value.trim()); });
  }).then((v) => (v ? v : null));
}

// ファイルとして保存（iPadでは「ファイル」アプリの「ダウンロード」に入る。共有シートが使えればそちらも可）
export async function saveFile(blob, filename) {
  const file = typeof File === 'function' ? new File([blob], filename, { type: blob.type }) : null;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return file;
}

export function fmtTime(sec) {
  if (sec == null || !isFinite(sec)) return '--:--';
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const d = Math.floor((sec * 10) % 10);
  return `${m}:${String(s).padStart(2, '0')}${d ? '.' + d : ''}`;
}

export function fmtBytes(n) {
  if (n == null) return '不明';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

export function pad2(n) { return String(n).padStart(2, '0'); }
export function fmtDate(ms) { const d = new Date(ms); return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`; }
export function fmtClock(ms, sec = false) { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}${sec ? ':' + pad2(d.getSeconds()) : ''}`; }
export function dayKey(ms) { const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
