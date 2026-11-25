// スイッチ入力（キーボードとして認識される外部スイッチ・画面タッチ・スイッチコントロール）
// ・長押しで出る「くり返し入力」(keydown の repeat) は無視する
// ・押している間の2回目以降の keydown も無視する（押した→離したで1回）
// ・タッチ（pointerdown）とその後に来る click の二重反応を防ぐ
// ・スイッチコントロールの「項目を選択」などは click だけが届くので、click 単体は1回の入力として扱う

const IGNORE_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape', 'Fn', 'Unidentified']);

export function keyIdOf(e) {
  if (e.code && e.code !== 'Unidentified') return e.code;
  return 'key:' + (e.key || e.keyCode);
}

export function keyLabel(id) {
  const names = {
    Space: 'スペース', Enter: 'エンター', NumpadEnter: 'エンター(テンキー)',
    ArrowRight: '→（右矢印）', ArrowLeft: '←（左矢印）', ArrowUp: '↑（上矢印）', ArrowDown: '↓（下矢印）',
    Backspace: 'バックスペース', Tab: 'タブ',
  };
  if (names[id]) return names[id];
  if (/^Digit\d$/.test(id)) return '数字 ' + id.slice(5);
  if (/^Key[A-Z]$/.test(id)) return 'キー ' + id.slice(3);
  if (/^Numpad\d$/.test(id)) return 'テンキー ' + id.slice(6);
  if (id.startsWith('key:')) return id.slice(4) === ' ' ? 'スペース' : id.slice(4);
  return id;
}

export class InputManager {
  /**
   * @param {object} o
   * @param {() => object} o.getSettings
   * @param {(phase:'down'|'up'|'tap', sw:number|null, meta:object) => void} o.onInput
   * @param {(info:object) => void} o.onRaw  入力テスト用（すべての入力をそのまま知らせる）
   * @param {() => boolean} o.isSingleSwitch
   */
  constructor(o) {
    Object.assign(this, o);
    this.pressed = new Map(); // keyId -> sw
    this.pointers = new Map(); // pointerId -> sw
    this.lastPointerAt = 0;
    this.lastKeyAt = 0;
    this.capture = null; // キー登録待ちのとき (id)=>void
  }

  attach() {
    window.addEventListener('keydown', (e) => this.keydown(e), true);
    window.addEventListener('keyup', (e) => this.keyup(e), true);
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
    this.attachMediaKeys();
  }

  switchForKey(id) {
    const s = this.getSettings();
    const b = (s.keys || []).find((k) => k.id === id);
    if (b) return b.sw || null;
    if (s.anyKeyOneSwitch && this.isSingleSwitch()) return 1;
    return null;
  }

  isFormTarget(e) {
    const t = e.target;
    return t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]');
  }

  keydown(e) {
    if (IGNORE_KEYS.has(e.key)) return;
    const id = keyIdOf(e);
    if (this.capture) {
      e.preventDefault();
      const cb = this.capture; this.capture = null; cb(id);
      return;
    }
    if (this.isFormTarget(e)) return;
    const s = this.getSettings();
    const sw = s.keyEnabled ? this.switchForKey(id) : null;
    const repeat = e.repeat || this.pressed.has(id);
    this.onRaw({ phase: 'down', id, key: e.key, code: e.code, keyCode: e.keyCode, sw, repeat });
    if (sw == null) return; // 割り当てのないキーは通常どおり
    e.preventDefault(); // スクロールやボタンの誤作動を防ぐ
    e.stopPropagation();
    if (repeat) return; // 長押しのくり返しは無視
    this.pressed.set(id, sw);
    this.lastKeyAt = performance.now();
    this.onInput('down', sw, { source: 'key', id });
  }

  keyup(e) {
    if (IGNORE_KEYS.has(e.key)) return;
    const id = keyIdOf(e);
    if (this.isFormTarget(e) && !this.pressed.has(id)) return;
    const had = this.pressed.has(id);
    const sw = this.pressed.get(id);
    this.pressed.delete(id);
    this.onRaw({ phase: 'up', id, key: e.key, code: e.code, keyCode: e.keyCode, sw: had ? sw : this.switchForKey(id), repeat: false });
    if (had) {
      e.preventDefault();
      if (sw != null) this.onInput('up', sw, { source: 'key', id });
    }
  }

  releaseAll() {
    for (const [id, sw] of this.pressed) if (sw != null) this.onInput('up', sw, { source: 'key', id, lost: true });
    this.pressed.clear();
    for (const [pid, sw] of this.pointers) this.onInput('up', sw, { source: 'touch', pointerId: pid, lost: true });
    this.pointers.clear();
  }

  // 画面のボタン（sw = 1 or 2）
  bindButton(el, sw) {
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      this.lastPointerAt = performance.now();
      const s = this.getSettings();
      this.onRaw({ phase: 'down', id: 'touch', key: '画面タッチ', sw, repeat: this.pointers.size > 0 });
      if (!s.touchEnabled) return;
      if ([...this.pointers.values()].includes(sw)) return; // 2本目の指などは無視
      this.pointers.set(e.pointerId, sw);
      try { el.setPointerCapture(e.pointerId); } catch { /* 無視 */ }
      this.onInput('down', sw, { source: 'touch' });
    });
    const up = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const psw = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      this.lastPointerAt = performance.now();
      this.onRaw({ phase: 'up', id: 'touch', key: '画面タッチ', sw: psw, repeat: false });
      this.onInput('up', psw, { source: 'touch' });
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const now = performance.now();
      // 直前のタッチやキー入力から来た click は二重になるので無視
      if (now - this.lastPointerAt < 1000 || now - this.lastKeyAt < 600) return;
      if (!this.getSettings().touchEnabled) return;
      this.onRaw({ phase: 'tap', id: 'click', key: 'スイッチコントロール等の選択', sw, repeat: false });
      this.onInput('tap', sw, { source: 'click' });
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ヘッドホンやキーボードの「再生/停止」「次へ」キー（届く環境のみ）
  attachMediaKeys() {
    if (!('mediaSession' in navigator)) return;
    const h = (sw, label) => () => {
      this.onRaw({ phase: 'tap', id: 'media:' + label, key: 'メディアキー ' + label, sw, repeat: false });
      if (this.getSettings().mediaKeys) this.onInput('tap', sw, { source: 'media' });
    };
    try {
      navigator.mediaSession.setActionHandler('play', h(1, '再生'));
      navigator.mediaSession.setActionHandler('pause', h(1, '停止'));
      navigator.mediaSession.setActionHandler('nexttrack', h(2, '次へ'));
    } catch { /* 未対応 */ }
  }
}
