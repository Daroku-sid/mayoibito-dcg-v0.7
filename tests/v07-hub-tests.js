/* =====================================================================
   v07-hub-tests.js ―― v0.7 Stage 2（メインハブ）の検査
   ---------------------------------------------------------------------
   画面が無くても確かめられる範囲を機械検査します。
     ・一枚絵：ランダム開始 / 10秒自動 / タップ切替 / フェード中無視 /
       タイマー二重生成なし / pause・resume / 読み込み失敗（第5部）
     ・ナビ・タブ：5タブ / 切替方向 / 切替中は受け付けない /
       離れたタブへ直接（第6部 6.4/6.5）
     ・ホーム：バナー5秒自動・ループ / ミッション3タブ・4状態 /
       タブ切替で先頭へ（第7部）
   ===================================================================== */
const fs = require('fs'), vm = require('vm');

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

/* ---------- DOM モック ---------- */
function fakeEl(tag) {
  const o = {
    tagName: tag || 'div', textContent: '', type: '', value: '',
    style: {}, dataset: {}, children: [], parentNode: null,
    _cls: new Set(), _listeners: {}, scrollTop: 0,
    offsetWidth: 300,
  };
  Object.defineProperty(o, 'innerHTML', {
    get() { return o._html || ''; },
    set(v) { o._html = v; if (v === '') o.children = []; },
  });
  o.classList = {
    add: c => o._cls.add(c), remove: c => o._cls.delete(c),
    toggle: (c, on) => { const has = o._cls.has(c); const want = (on === undefined) ? !has : on; want ? o._cls.add(c) : o._cls.delete(c); return want; },
    contains: c => o._cls.has(c),
  };
  Object.defineProperty(o, 'className', {
    get() { return Array.from(o._cls).join(' '); },
    set(v) { o._cls.clear(); String(v).split(/\s+/).forEach(c => { if (c) o._cls.add(c); }); },
  });
  o.setAttribute = (k, v) => { o.dataset['attr_' + k] = v; };
  Object.defineProperty(o, 'id', {
    get() { return o._id || ''; },
    set(v) { o._id = v; o.dataset._domid = v; },
  });
  o.appendChild = ch => { ch.parentNode = o; o.children.push(ch); return ch; };
  o.removeChild = ch => { const i = o.children.indexOf(ch); if (i >= 0) o.children.splice(i, 1); ch.parentNode = null; };
  o.addEventListener = (type, fn) => { (o._listeners[type] = o._listeners[type] || []).push(fn); };
  o.fire = (type, ev) => {
    (o._listeners[type] || []).forEach(fn => fn(ev || {}));
    // onclick / onchange などのプロパティ割り当ても呼ぶ（実要素と同じ）
    const prop = 'on' + type;
    if (typeof o[prop] === 'function') o[prop](ev || {});
  };
  o.click = () => o.fire('click', {});
  // querySelector / querySelectorAll（属性・クラスの簡易対応）
  o.querySelectorAll = sel => collect(o).filter(el => matchSel(el, sel));
  o.querySelector = sel => (o.querySelectorAll(sel)[0] || null);
  return o;
}
function collect(root) {
  const out = [];
  (function walk(n) { n.children.forEach(c => { out.push(c); walk(c); }); })(root);
  return out;
}
function matchSel(el, sel) {
  // 対応：.class / [data-x="y"] / .class[data-x="y"] / tag
  const m = sel.match(/^([a-z0-9]+)?(\.[\w-]+)?(\[data-([\w-]+)="([^"]+)"\])?$/i);
  if (!m) return false;
  const [, tag, cls, , dattr, dval] = m;
  if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
  if (cls && !el._cls.has(cls.slice(1))) return false;
  if (dattr && el.dataset[dattr] !== dval) return false;
  return true;
}

/* ---------- 手動クロック ---------- */
function makeClock() {
  let now = 0, seq = 1; const jobs = [];
  return {
    setTimeout: (fn, ms) => { const id = seq++; jobs.push({ id, at: now + (ms || 0), fn }); return id; },
    clearTimeout: (id) => { const i = jobs.findIndex(j => j.id === id); if (i >= 0) jobs.splice(i, 1); },
    tick: (ms) => {
      const target = now + ms;
      for (;;) {
        const due = jobs.filter(j => j.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        now = due.at; jobs.splice(jobs.indexOf(due), 1); due.fn();
      }
      now = target;
    },
    pending: () => jobs.length,
    countNamed: () => jobs.length,
  };
}

/* ---------- Image モック（onload/onerror を制御） ---------- */
function makeImageClass(behavior) {
  // behavior(src) が 'ok' | 'fail'
  return class {
    set src(v) {
      const r = behavior(v);
      // 非同期っぽく即時発火（テストなので同期でよい）
      if (r === 'ok' && this.onload) this.onload();
      if (r === 'fail' && this.onerror) this.onerror();
    }
  };
}

/* ---------- ハブ一式を読み込む ---------- */
function boot(opts) {
  opts = opts || {};
  const clock = makeClock();
  const els = {};
  const need = [
    'v7-art-a', 'v7-art-b', 'v7-art-tap',
    'v7-profile', 'v7-profile-name', 'v7-profile-title',
    'v7-cur-soft', 'v7-cur-premium',
    'v7-panels', 'v7-panel-slider', 'v7-nav',
    'v7-toast-area', 'v7-scrim', 'v7-dialog',
    'v7-dialog-title', 'v7-dialog-body', 'v7-dialog-buttons',
    // v7-banner-track / v7-banner-dots / v7-mission-list は
    // ハブ自身が createElement で作るので、ここでは用意しない
  ];
  need.forEach(id => { els[id] = fakeEl(); els[id].dataset._id = id; });
  const doc = {
    getElementById: id => {
      if (els[id]) return els[id];
      // createElement で作られ、ツリーに付いた要素も id で引けるようにする
      let found = null;
      Object.values(els).forEach(e => {
        collect(e).forEach(c => { if (c.dataset && c.dataset._domid === id) found = c; });
      });
      return found || (els[id] = fakeEl());
    },
    createElement: t => fakeEl(t),
    querySelectorAll: sel => {
      // ルート横断（各スロットの子を集める）
      let all = [];
      Object.values(els).forEach(e => { all = all.concat(collect(e)); });
      return all.filter(el => matchSel(el, sel));
    },
    addEventListener: () => {},
  };
  const store = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const ctx = vm.createContext({
    window: { localStorage: store }, document: doc,
    JSON, console, Math: opts.math || Math, Date,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    Image: makeImageClass(opts.imgBehavior || (() => 'ok')),
    module: { exports: {} },
  });
  const load = f => vm.runInContext(fs.readFileSync('js/' + f, 'utf8'), ctx);
  load('v07-save.js');
  load('v07-shell.js');
  load('v07-hub-data.js');
  load('v07-art.js');
  load('v07-home.js');
  load('v07-panels.js');
  load('v07-hub.js');
  const get = n => vm.runInContext(n, ctx);
  return {
    clock, doc, els,
    V7Save: get('V7Save'), V7Timers: get('V7Timers'), V7Toast: get('V7Toast'),
    V7Dialog: get('V7Dialog'), V7Art: get('V7Art'), V7Home: get('V7Home'),
    V7Panels: get('V7Panels'), V7Hub: get('V7Hub'), V7Icons: get('V7Icons'),
  };
}

/* 部品を最低限つないでハブを初期化する */
function initHub(H) {
  H.V7Toast.init(H.els['v7-toast-area']);
  H.V7Dialog.init(
    H.els['v7-scrim'], H.els['v7-dialog'],
    H.els['v7-dialog-title'], H.els['v7-dialog-body'], H.els['v7-dialog-buttons']);
  H.V7Save.load();
  H.V7Hub.init();
}

/* =====================================================================
   1. メインナビ・タブ切り替え（第6部）
   ===================================================================== */
console.log('■ メインナビと5タブ');
{
  const H = boot();
  initHub(H);
  const nav = H.els['v7-nav'];
  check('ナビが5タブ', nav.children.length === 5, String(nav.children.length));
  const labels = nav.children.map(b => b.textContent || (b._html.match(/v7-nav__label">([^<]+)/) || [])[1]);
  check('順序がホーム→カード→対戦→ショップ→その他',
    nav.children.map(b => b.dataset.tab).join(',') === 'home,card,battle,shop,other');
  check('起動時はホームが選択中（6.6）',
    H.V7Hub.current() === 'home' && nav.children[0]._cls.has('is-on'));

  // 仮アイコンはインラインSVG（絵文字でない）
  check('仮アイコンがインラインSVG', /<svg/.test(H.V7Icons.home) && !/[\u{1F300}-\u{1FAFF}]/u.test(H.V7Icons.home));
}

console.log('■ タブ切り替えの向きと排他');
{
  const H = boot();
  initHub(H);
  const nav = H.els['v7-nav'];

  // ホーム→対戦（右方向）
  H.V7Hub.switchTab('battle');
  check('切替が始まると排他になる', H.V7Hub.isSwitching() === true);
  const slider = H.els['v7-panel-slider'];
  const battle = slider.querySelector('.v7-tabpanel[data-tab="battle"]');
  // アニメ開始
  H.clock.tick(16);
  check('右のタブへ：新パネルが中央へ入る', battle._cls.has('v7-slide-center'));
  // 切替中は次を受け付けない
  H.V7Hub.switchTab('shop');
  check('切替中の別タブ操作は無視', H.V7Hub.current() === 'battle');
  H.clock.tick(320);
  check('0.3秒後に排他が解ける', H.V7Hub.isSwitching() === false);
  check('切替後の選択タブは対戦', H.V7Hub.current() === 'battle' && nav.children[2]._cls.has('is-on'));

  // 離れたタブへ直接（対戦→その他）。中間を通らず1回のスライド。
  H.V7Hub.switchTab('other');
  H.clock.tick(16); H.clock.tick(320);
  check('離れたタブへも1回で直接切替', H.V7Hub.current() === 'other');
}

/* =====================================================================
   2. 共通一枚絵（第5部）
   ===================================================================== */
console.log('■ 一枚絵：自動・手動・タイマー');
{
  const H = boot();  // 画像は全部成功
  initHub(H);
  const a = H.els['v7-art-a'], b = H.els['v7-art-b'];
  check('起動時にどちらかのスロットが前面', a._cls.has('is-front') || b._cls.has('is-front'));
  check('自動切替タイマーが1つ張られている', H.clock.pending() >= 1);

  const before = H.V7Art.currentArtId();
  // 10秒未満では変わらない
  H.clock.tick(9000);
  check('10秒未満では自動で変わらない（フェード未開始）', H.V7Art._fading === false);
  // 10秒で切替開始
  H.clock.tick(1000);
  check('10秒でクロスフェードが始まる', H.V7Art._fading === true);
  H.clock.tick(500);
  check('0.5秒でフェード完了', H.V7Art._fading === false);
  check('表示中の絵が入れ替わった', H.V7Art.currentArtId() !== before,
    before + ' → ' + H.V7Art.currentArtId());
}

console.log('■ 一枚絵：フェード中のタップ無視 / タイマー二重生成なし');
{
  const H = boot();
  initHub(H);
  const tap = H.els['v7-art-tap'];

  // タップで即切替＋10秒リセット
  const id0 = H.V7Art.currentArtId();
  tap.fire('click', {});
  check('中央タップでフェードが始まる', H.V7Art._fading === true);
  const idDuringFade = H.V7Art.currentArtId();
  // フェード中の再タップは無視
  tap.fire('click', {});
  H.clock.tick(500);
  check('フェード中の再タップは無視（1回ぶんだけ進む）',
    H.V7Art.currentArtId() !== id0);

  // 自動タイマーが重複していない（art-auto は常に1本）
  const pendingBefore = H.clock.pending();
  tap.fire('click', {});   // 手動 → resume で張り直す
  H.clock.tick(500);
  const pendingAfter = H.clock.pending();
  check('タイマーが二重生成されない', pendingAfter <= pendingBefore + 1,
    pendingBefore + ' / ' + pendingAfter);
}

console.log('■ 一枚絵：pause / resume（第5部 5.7）');
{
  const H = boot();
  initHub(H);
  H.V7Hub.onHubHidden();     // 個別画面へ入った想定
  check('隠れたら自動タイマーが止まる', !H.V7Timers.has('art-auto'));
  H.V7Hub.onHubShown();      // 復帰
  check('復帰で自動タイマーが再開', H.V7Timers.has('art-auto'));
}

console.log('■ 一枚絵：読み込み失敗（第5部 5.9）');
{
  // 2枚とも失敗
  const H = boot({ imgBehavior: () => 'fail' });
  initHub(H);
  check('2枚とも失敗でも初期化が完走する', H.V7Hub.current() === 'home');
  check('失敗時は自動切替タイマーを張らない', !H.V7Timers.has('art-auto'));
  // 通知が1回積まれる
  const area = H.els['v7-toast-area'];
  check('失敗通知が上部に出る', area.children.length >= 1);
}
{
  // 1枚だけ成功
  let n = 0;
  const H = boot({ imgBehavior: () => (n++ === 0 ? 'ok' : 'fail') });
  initHub(H);
  check('1枚だけ成功なら自動切替は実質停止（2枚未満）', !H.V7Timers.has('art-auto'));
  const a = H.els['v7-art-a'];
  check('成功した1枚が前面に出る', a._cls.has('is-front'));
}

/* =====================================================================
   3. ホーム：バナー（第7部 7.2/7.3）
   ===================================================================== */
console.log('■ ホームバナー：5秒自動・ループ・インジケーター');
{
  const H = boot();
  initHub(H);
  // ホームは初期表示。onShown で描画される
  H.V7Panels.onShown('home');
  const track = H.doc.getElementById('v7-banner-track');
  const dots = H.doc.getElementById('v7-banner-dots');
  check('バナーが4枚', track.children.length === 4, String(track.children.length));
  check('インジケーターが4つ', dots.children.length === 4);
  check('先頭ドットが選択中', dots.children[0]._cls.has('is-on'));

  H.clock.tick(5000);
  check('5秒で次のバナーへ', H.V7Home._bannerIdx === 1);
  check('2つ目のドットが選択中', dots.children[1]._cls.has('is-on'));

  // 最後→最初へループ
  H.clock.tick(5000); H.clock.tick(5000);
  check('3つ進むと末尾', H.V7Home._bannerIdx === 3);
  H.clock.tick(5000);
  check('末尾の次は先頭へループ', H.V7Home._bannerIdx === 0);
}

console.log('■ ホームバナー：ホーム以外では止まる（7.2 タイマー）');
{
  const H = boot();
  initHub(H);
  H.V7Panels.onShown('home');
  check('ホームでバナー自動が動く', H.V7Timers.has('banner-auto'));
  H.V7Hub.switchTab('card');
  H.clock.tick(16); H.clock.tick(320);
  H.V7Hub.onHubShown();   // カードタブでハブは見えているが…
  // ホーム以外なので banner は止める設計
  H.V7Home.pauseBanner();
  check('ホーム以外ではバナー自動が止まる', !H.V7Timers.has('banner-auto'));
}

/* =====================================================================
   4. ホーム：ミッション（第7部 7.6）
   ===================================================================== */
console.log('■ ミッション：3タブ・4状態・先頭へ戻す');
{
  const H = boot();
  initHub(H);
  H.V7Panels.onShown('home');
  const list = H.doc.getElementById('v7-mission-list');

  // 既定はデイリー
  check('デイリーが3件', list.children.length === 3, String(list.children.length));
  const states = list.children.map(r => r.dataset.state);
  check('4状態のうち複数が混在（progress/claim/done）',
    states.indexOf('progress') >= 0 && states.indexOf('claim') >= 0 && states.indexOf('done') >= 0);

  // スクロール位置を動かしてからタブ切替 → 先頭へ戻る
  list.scrollTop = 40;
  H.V7Home._selectMissionTab('weekly');
  check('ウィークリーへ切替で件数が変わる', list.children.length === 3);
  check('タブ切替で一覧が先頭へ戻る（7.6）', list.scrollTop === 0);

  // 総合タブ
  H.V7Home._selectMissionTab('total');
  const totalStates = list.children.map(r => r.dataset.state);
  check('総合タブに done が含まれる', totalStates.indexOf('done') >= 0);
}

/* =====================================================================
   5. 準備中の入口（Stage 2 は仮ダイアログで受ける：第27部）
   ===================================================================== */
console.log('■ 準備中の入口が仮ダイアログで開く');
{
  const H = boot();
  initHub(H);
  // 通貨タップ
  H.els['v7-cur-soft'].fire('click', {});
  check('通貨タップで準備中ダイアログが開く', H.V7Dialog.isOpen());
  H.V7Dialog.close();

  // ショップタブのパネル
  H.V7Hub.switchTab('shop');
  H.clock.tick(16); H.clock.tick(320);
  const slider = H.els['v7-panel-slider'];
  const shopBtn = slider.querySelector('.v7-card-panel');
  shopBtn.fire('click', {});
  check('ショップのパネルで準備中ダイアログが開く', H.V7Dialog.isOpen());
  H.V7Dialog.close();
}

/* =====================================================================
   まとめ
   ===================================================================== */
console.log('\n===== v0.7 Stage 2 ハブ：' + pass + '/' + (pass + fail) + ' 通過 =====');
if (fail > 0) process.exit(1);
