// 学習記録：一覧・グラフ・CSV出力
import * as DB from './db.js';
import { S, MODES, OBS, FUNCS, esc, toast, scheduleSave } from './app.js';
import { saveFile, confirmDlg, fmtDate, fmtClock, dayKey, showTextForCopy } from './ui.js';

const EV_LABEL = {
  input: 'スイッチ入力', play: '再生', stop: '停止', 'auto-stop': '自動停止', next: '曲送り', prev: '前の曲',
  'song-end': '曲の終わり', extend: '時間延長', error: 'エラー',
};
const SRC_LABEL = { key: 'キー（外部スイッチ）', touch: '画面タッチ', click: '選択（スイッチコントロール等）', media: 'メディアキー' };

export function summarize(ses) {
  const ev = ses.events || [];
  const n = (f) => ev.filter(f).length;
  const songs = {};
  for (const e of ev) if (e.type === 'play' && e.song) songs[e.song] = (songs[e.song] || 0) + 1;
  const end = ses.endAt || ses.lastAt || ses.startAt;
  return {
    inputs: n((e) => e.type === 'input'),
    valid: n((e) => e.type === 'input' && e.valid),
    plays: n((e) => e.type === 'play'),
    stops: n((e) => e.type === 'stop'),
    autoStops: n((e) => e.type === 'auto-stop'),
    nexts: n((e) => (e.type === 'next' || e.type === 'prev') && !e.auto),
    songs,
    sec: Math.max(0, Math.round((end - ses.startAt) / 1000)),
  };
}

function modeName(ses) {
  const m = MODES[ses.mode];
  if (!m) return ses.mode || '';
  let t = `${m.short} ${m.name}`;
  const ss = ses.settingsSnapshot || {};
  if (ses.mode === 'timed' && ss.timedSec) t += `（${ss.timedSec}秒）`;
  if (ses.mode === 'two') t += `（1:${FUNCS[ss.sw1Func] || ''}／2:${FUNCS[ss.sw2Func] || ''}）`;
  return t;
}
function fmtDur(sec) { const m = Math.floor(sec / 60); const s = sec % 60; return m ? `${m}分${s ? s + '秒' : ''}` : `${s}秒`; }

let filterStudent = null; // null = 選択中の児童
let openDay = null;

export async function renderRecords(body, { rerender }) {
  if (filterStudent === null) filterStudent = S.settings.studentId;
  const all = (await DB.getAll('sessions').catch(() => [])).sort((a, b) => b.startAt - a.startAt);
  const list = all.filter((x) => filterStudent === 'all' || x.studentId === filterStudent);

  // 日ごとにまとめる
  const days = new Map();
  for (const ses of list) {
    const k = dayKey(ses.startAt);
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(ses);
  }
  const dayRows = [...days.entries()].map(([k, arr]) => {
    const t = { k, date: arr[0].startAt, count: arr.length, sec: 0, inputs: 0, valid: 0, plays: 0, spont: 0, arr };
    for (const s of arr) { const m = summarize(s); t.sec += m.sec; t.inputs += m.inputs; t.valid += m.valid; t.plays += m.plays; t.spont += (s.obs && s.obs.spont) || 0; }
    return t;
  });

  const live = S.session;
  body.innerHTML = `
  ${live ? liveHtml(live) : ''}
  <div class="sec"><h3>学習記録</h3>
    <div class="field"><span class="lab">児童</span><select id="rStu">
      <option value="all" ${filterStudent === 'all' ? 'selected' : ''}>全員</option>
      ${S.students.map((x) => `<option value="${x.id}" ${x.id === filterStudent ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
    </select></div>
    <div class="field">
      <button class="btn" data-act="csv">記録一覧をCSVで保存</button>
      <button class="btn" data-act="csvlog">操作ログをCSVで保存</button>
      <button class="btn small" data-act="csvtext">記録一覧を画面に表示（コピー用）</button>
    </div>
    <p class="note">CSVはExcelで開けます（文字化けしない形式）。共有の画面が出たら「"ファイル"に保存」などを選びます。ロイロノートの中で開いていて保存できないときは「画面に表示（コピー用）」を使ってください。</p>
  </div>
  <div class="sec"><h3>回数の推移（記録のある日、新しい14日分）</h3>
    ${dayRows.length ? chartHtml(dayRows.slice(0, 14).reverse()) : '<p class="empty">まだ記録がありません。</p>'}
  </div>
  <div class="sec"><h3>日ごとの記録</h3>
    ${dayRows.length ? `<div class="scroll-x"><table class="tbl"><thead><tr><th>日付</th><th>回数</th><th>学習時間</th><th>スイッチ入力</th><th>有効な操作</th><th>再生</th><th>自発的に押した</th><th></th></tr></thead><tbody>
    ${dayRows.map((d) => `<tr><td>${fmtDate(d.date)}</td><td class="n">${d.count}</td><td class="n">${fmtDur(d.sec)}</td><td class="n">${d.inputs}</td><td class="n">${d.valid}</td><td class="n">${d.plays}</td><td class="n">${d.spont}</td>
      <td><button class="btn small" data-day="${d.k}">${openDay === d.k ? 'とじる' : 'くわしく'}</button></td></tr>
      ${openDay === d.k ? `<tr><td colspan="8">${d.arr.map(detailHtml).join('')}</td></tr>` : ''}`).join('')}
    </tbody></table></div>` : '<p class="empty">まだ記録がありません。</p>'}
  </div>`;

  body.querySelector('#rStu').addEventListener('change', (e) => { filterStudent = e.target.value; rerender(); });
  bindChartTips(body);

  body.addEventListener('click', async (e) => {
    const day = e.target.closest('[data-day]');
    if (day) { openDay = openDay === day.dataset.day ? null : day.dataset.day; rerender(); return; }
    const a = e.target.closest('[data-act]');
    if (a) {
      if (a.dataset.act === 'csv') await exportCsv(list);
      if (a.dataset.act === 'csvlog') await exportLogCsv(list);
      if (a.dataset.act === 'csvtext') {
        if (!list.length) { toast('記録がありません'); return; }
        await showTextForCopy('記録一覧（CSV）', csvText(summaryRows(list)));
      }
      return;
    }
    // 観察記録の ＋／−
    const pm = e.target.closest('[data-obs]');
    if (pm) {
      const id = pm.dataset.ses;
      const ses = id === 'live' ? S.session : all.find((x) => x.id === id);
      if (!ses) return;
      const k = pm.dataset.obs;
      const d = Number(pm.dataset.d);
      ses.obs[k] = Math.max(0, (ses.obs[k] || 0) + d);
      if (d > 0) ses.obsEvents.push({ t: Date.now(), key: k });
      pm.parentElement.querySelector('b').textContent = ses.obs[k];
      if (id === 'live') scheduleSave(); else await DB.put('sessions', ses);
      return;
    }
    const del = e.target.closest('[data-delses]');
    if (del) {
      if (!(await confirmDlg('この記録を削除しますか？', '削除する', true))) return;
      await DB.del('sessions', del.dataset.delses);
      rerender();
    }
  });
  body.addEventListener('input', async (e) => {
    const t = e.target.closest('[data-memo]');
    if (!t) return;
    const id = t.dataset.memo;
    const ses = id === 'live' ? S.session : all.find((x) => x.id === id);
    if (!ses) return;
    ses.memo = t.value;
    if (id === 'live') scheduleSave();
    else { clearTimeout(t._tm); t._tm = setTimeout(() => DB.put('sessions', ses), 600); }
  });
}

function counterHtml(ses, id) {
  return `<div class="counter">${OBS.map(([k, l]) => `<div><span>${l}</span><span style="display:flex;align-items:center;gap:4px">
    <button data-obs="${k}" data-ses="${id}" data-d="-1" aria-label="${l}をへらす">−</button><b>${(ses.obs && ses.obs[k]) || 0}</b><button data-obs="${k}" data-ses="${id}" data-d="1" aria-label="${l}をふやす">＋</button></span></div>`).join('')}</div>`;
}

function liveHtml(ses) {
  const m = summarize(ses);
  return `<div class="sec" style="border-color:#2E9E5B"><h3>いまの学習（${fmtClock(ses.startAt)}〜）</h3>
    <p class="note">スイッチ入力 ${m.inputs}回　有効な操作 ${m.valid}回　再生 ${m.plays}回　停止 ${m.stops}回　自動停止 ${m.autoStops}回　曲送り ${m.nexts}回</p>
    <h4>観察記録（先生が数える）</h4>
    ${counterHtml(ses, 'live')}
    <h4>メモ</h4><textarea data-memo="live" placeholder="気付いたこと">${esc(ses.memo || '')}</textarea>
    <p class="note">学習をおわるときは、右上の「学習をおわる」を押します。</p></div>`;
}

function detailHtml(ses) {
  const m = summarize(ses);
  const songs = Object.entries(m.songs).map(([n, c]) => `${esc(n)}（${c}）`).join('、') || 'なし';
  return `<div class="sec" style="margin:8px 0">
    <h4 style="margin-top:0">${fmtClock(ses.startAt)}〜${fmtClock(ses.endAt || ses.lastAt)}（${fmtDur(m.sec)}）　${esc(ses.studentName)}　${esc(modeName(ses))}${ses.unfinished ? '　<span class="meta">※終了操作なし</span>' : ''}</h4>
    <p class="note">スイッチ入力 ${m.inputs}回／有効な操作 ${m.valid}回／再生 ${m.plays}回／停止 ${m.stops}回／自動停止 ${m.autoStops}回／曲送り ${m.nexts}回<br>再生した曲：${songs}</p>
    ${counterHtml(ses, ses.id)}
    <h4>メモ</h4><textarea data-memo="${ses.id}">${esc(ses.memo || '')}</textarea>
    <details><summary class="note">操作の時刻（${(ses.events || []).length}件）</summary>
      <div class="scroll-x"><table class="tbl"><tr><th>時刻</th><th>できごと</th><th>くわしく</th></tr>
      ${(ses.events || []).map((e) => `<tr><td>${fmtClock(e.t, true)}</td><td>${EV_LABEL[e.type] || e.type}${e.type === 'input' ? (e.valid ? '（有効）' : '（無効）') : ''}</td><td>${esc(evDetail(e))}</td></tr>`).join('')}
      </table></div></details>
    <div class="foot" style="display:flex;justify-content:flex-end"><button class="btn small danger" data-delses="${ses.id}">この記録を削除</button></div>
  </div>`;
}

function evDetail(e) {
  const p = [];
  if (e.sw) p.push('スイッチ' + e.sw);
  if (e.src) p.push(SRC_LABEL[e.src] || e.src);
  if (e.reason) p.push(e.reason);
  if (e.song) p.push(e.song);
  if (e.auto) p.push('自動');
  return p.join('　');
}

// ---- グラフ（棒グラフ2つ：1つのグラフに1つの数値） ----
function chartHtml(rows) {
  return barChart(rows, 'inputs', 'スイッチ入力回数（1日の合計）', '#2E9E5B')
    + barChart(rows, 'spont', '「自発的に押した」回数（先生の記録・1日の合計）', '#3A78C9');
}
function barChart(rows, key, title, color) {
  const W = 640; const H = 200; const L = 34; const R = 8; const T = 16; const B = 30;
  const max = Math.max(1, ...rows.map((r) => r[key]));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const bw = (W - L - R) / rows.length;
  const y = (v) => T + (H - T - B) * (1 - v / top);
  let g = '';
  for (let v = 0; v <= top; v += step) g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  const bars = rows.map((r, i) => {
    const w = Math.max(4, Math.min(48, bw * 0.6)); const x = L + i * bw + (bw - w) / 2;
    const v = r[key]; const yy = y(v); const h = Math.max(0, y(0) - yy);
    const d = new Date(r.date);
    const lab = `${d.getMonth() + 1}/${d.getDate()}`;
    const path = h > 0 ? roundedTop(x, yy, w, h, Math.min(4, w / 2, h)) : '';
    return `<g><rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent" data-tip="${lab}：${v}回"/>
      ${path ? `<path class="bar" d="${path}" fill="${color}" pointer-events="none"/>` : ''}
      ${rows.length <= 14 ? `<text class="val" x="${x + w / 2}" y="${yy - 4}" text-anchor="middle">${v}</text>` : ''}
      <text class="axis" x="${x + w / 2}" y="${H - 10}" text-anchor="middle">${lab}</text></g>`;
  }).join('');
  return `<h4>${title}</h4><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">${g}${bars}</svg>`;
}
function roundedTop(x, y, w, h, r) {
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}
function niceStep(max) {
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  for (const m of [1, 2, 5, 10]) if (raw <= m * p) return Math.max(1, m * p);
  return Math.max(1, 10 * p);
}
function bindChartTips(body) {
  let tip = null;
  const hide = () => { if (tip) { tip.remove(); tip = null; } };
  body.addEventListener('pointerover', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t) { hide(); return; }
    if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; document.body.appendChild(tip); }
    tip.textContent = t.dataset.tip;
    const r = t.getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - 120, r.left + r.width / 2 - 30) + 'px';
    tip.style.top = (r.top + 4) + 'px';
  });
  body.addEventListener('pointerleave', hide);
  body.addEventListener('scroll', hide, true);
}

// ---- CSV ----
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvText(rows) { return rows.map((r) => r.map(csvCell).join(',')).join('\r\n'); }
function csvBlob(rows) {
  return new Blob(['﻿' + csvText(rows)], { type: 'text/csv;charset=utf-8' }); // BOM付き＝Excelで文字化けしない
}
function stamp() { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; }

async function exportCsv(list) {
  if (!list.length) { toast('記録がありません'); return; }
  await saveFile(csvBlob(summaryRows(list)), `おんがくスイッチ_記録一覧_${stamp()}.csv`);
}

function summaryRows(list) {
  const head = ['児童', '実施日', '開始時刻', '終了時刻', '学習時間（分）', '学習モード', 'プレイリスト', 'スイッチ入力回数', '有効な操作回数', '再生回数', '停止回数', '自動停止回数', '曲送り回数', '再生した曲', ...OBS.map(([, l]) => l), 'メモ'];
  const rows = [head];
  for (const ses of [...list].sort((a, b) => a.startAt - b.startAt)) {
    const m = summarize(ses);
    rows.push([ses.studentName, fmtDate(ses.startAt), fmtClock(ses.startAt, true), fmtClock(ses.endAt || ses.lastAt, true), (m.sec / 60).toFixed(1), modeName(ses), ses.playlistName,
      m.inputs, m.valid, m.plays, m.stops, m.autoStops, m.nexts, Object.entries(m.songs).map(([n, c]) => `${n}(${c})`).join(' / '),
      ...OBS.map(([k]) => (ses.obs && ses.obs[k]) || 0), ses.memo || '']);
  }
  return rows;
}

async function exportLogCsv(list) {
  if (!list.length) { toast('記録がありません'); return; }
  const rows = [['児童', '日付', '時刻', 'できごと', '有効/無効', 'スイッチ', '入力方法', 'キー', '理由', '曲']];
  for (const ses of [...list].sort((a, b) => a.startAt - b.startAt)) {
    for (const e of ses.events || []) {
      rows.push([ses.studentName, fmtDate(e.t), fmtClock(e.t, true), EV_LABEL[e.type] || e.type, e.type === 'input' ? (e.valid ? '有効' : '無効') : '',
        e.sw || '', SRC_LABEL[e.src] || e.src || '', e.key || '', e.reason || '', e.song || '']);
    }
    for (const o of ses.obsEvents || []) {
      const l = (OBS.find(([k]) => k === o.key) || [, o.key])[1];
      rows.push([ses.studentName, fmtDate(o.t), fmtClock(o.t, true), '観察：' + l, '', '', '先生の記録', '', '', '']);
    }
  }
  await saveFile(csvBlob(rows), `おんがくスイッチ_操作ログ_${stamp()}.csv`);
}
