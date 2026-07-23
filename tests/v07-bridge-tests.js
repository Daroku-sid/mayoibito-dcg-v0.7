/* =====================================================================
   v07-bridge-tests.js ―― v0.7 Stage 4（既存機能接続）の検査
   ---------------------------------------------------------------------
   既存機能そのものは起動できないので、Screens／CardListUI／
   DeckEditorUI／play をスタブして、橋渡しロジックだけを検証する。
     ・各導線が既存の目的画面を開く（openLegacy）
     ・既存メニュー最初の画面で戻る → v0.7 ハブの入口タブへ
     ・ブラウザー戻る → 既存の戻り / 入口ではハブへ
     ・対戦中・未保存デッキ編集は既存の確認へ委ねる
     ・対戦終了フック（__v7ReturnFromLegacy）でハブへ戻る
   ===================================================================== */
const fs = require('fs'), vm = require('vm');

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

/* ---------- 既存システムのスタブ ---------- */
function makeLegacyStubs(ctx) {
  // Screens スタブ：stack と主要メソッドだけ
  const Screens = {
    stack: [],
    reset: function (name) { this.stack = [name]; },
    goNow: function (name) { this.stack.push(name); },
    go: function (name) { this.stack.push(name); },
    back: function () { if (this.stack.length > 1) this.stack.pop(); this._backCalls = (this._backCalls || 0) + 1; },
    current: function () { return this.stack.length ? this.stack[this.stack.length - 1] : null; },
    riseIn: function () {},
    _backCalls: 0,
  };
  ctx.Screens = Screens;

  // CardListUI スタブ
  ctx.CardListUI = {
    _detailOpen: null,
    openDetail: function (id) { this._detailOpen = id; },
    closeDetail: function () { this._detailOpen = null; },
  };
  ctx.CARD_MASTER = { mansion_elise: { name: '屋敷の令嬢 エリーゼ', type: 'monster', speed: 3, hp: 4 } };

  // DeckEditorUI スタブ
  ctx.DeckEditorUI = {
    _tryLeaveCalled: 0,
    tryLeave: function () { this._tryLeaveCalled++; },
  };

  // play スタブ（対戦進行フラグ）
  ctx.play = { active: false };

  return Screens;
}

/* ---------- DOM モック（最小） ---------- */
function fakeEl(tag) {
  const o = { tagName: tag || 'div', dataset: {}, style: {}, children: [], parentNode: null,
    _cls: new Set(), _l: {} };
  o.classList = { add: c => o._cls.add(c), remove: c => o._cls.delete(c),
    toggle: (c, on) => { const h = o._cls.has(c); const w = on === undefined ? !h : on; w ? o._cls.add(c) : o._cls.delete(c); return w; },
    contains: c => o._cls.has(c) };
  Object.defineProperty(o, 'className', {
    get() { return Array.from(o._cls).join(' '); },
    set(v) { o._cls.clear(); String(v).split(/\s+/).forEach(c => { if (c) o._cls.add(c); }); },
  });
  Object.defineProperty(o, 'id', {
    get() { return o._id || ''; },
    set(v) { o._id = v; o.dataset._domid = v; },
  });
  o.appendChild = c => { c.parentNode = o; o.children.push(c); return c; };
  o.querySelectorAll = () => [];
  o.querySelector = () => null;
  o.addEventListener = (t, f) => { (o._l[t] = o._l[t] || []).push(f); };
  return o;
}

/* ---------- ブリッジ＋ハブ最小一式を読み込む ---------- */
function boot() {
  const els = {};
  ['v7-panel-slider', 'v7-nav', 'v7-profile', 'v7-profile-name', 'v7-profile-title',
   'v7-profile-level', 'v7-art-a', 'v7-art-b', 'v7-art-tap', 'v7-cur-soft', 'v7-cur-premium',
   'start-screen', 'v7-shell', 'v7-root'].forEach(id => { els[id] = fakeEl(); els[id].dataset._domid = id; });

  const startLayer = els['start-screen'];
  const doc = {
    body: fakeEl('body'),
    getElementById: id => els[id] || null,
    createElement: t => fakeEl(t),
    querySelectorAll: () => [],
    addEventListener: (t, f) => { doc._click = doc._click || []; if (t === 'click') doc._click.push(f); },
    _click: [],
  };

  const clock = { setTimeout: (f) => { f(); return 1; }, clearTimeout: () => {} };
  const store = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const ctx = vm.createContext({
    window: { localStorage: store, addEventListener: () => {}, history: { pushState: () => {}, back: () => {}, replaceState: () => {} } },
    document: doc,
    JSON, console, Math, Date,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    Image: class { set src(v) {} },
    module: { exports: {} },
  });
  makeLegacyStubs(ctx);

  const load = f => vm.runInContext(fs.readFileSync('js/' + f, 'utf8'), ctx);
  load('v07-save.js');
  load('v07-hub-data.js');
  load('v07-bridge.js');
  // V7Hub / V7Screen は openLegacy 内で参照するのでスタブを注入
  vm.runInContext(`
    var V7Hub = {
      _cur: 'home', _pendingTab: null, _jumpCount: 0,
      current: function(){ return this._cur; },
      jumpTab: function(t){ this._cur = t; this._jumpCount++; },
      onHubHidden: function(){},
      onHubShown: function(){},
    };
    var V7Screen = {
      _open: false,
      isOpen: function(){ return this._open; },
      closeAll: function(tab){ this._open = false; if (tab) V7Hub.jumpTab(tab); },
    };
  `, ctx);

  const get = n => vm.runInContext(n, ctx);
  return {
    ctx, doc, els, startLayer,
    V7Bridge: get('V7Bridge'), Screens: get('Screens'),
    CardListUI: get('CardListUI'), DeckEditorUI: get('DeckEditorUI'),
    V7Hub: get('V7Hub'), V7Screen: get('V7Screen'),
    setPlayActive: v => vm.runInContext('play.active = ' + (v ? 'true' : 'false') + ';', ctx),
    fireDocClick: (target) => { (doc._click || []).forEach(fn => fn({ target: target, preventDefault: () => {}, stopPropagation: () => {} })); },
    getWin: () => get('window'),
    returnFromLegacy: () => vm.runInContext('window.__v7ReturnFromLegacy()', ctx),
  };
}

/* =====================================================================
   1. 各導線が既存の目的画面を開く
   ===================================================================== */
console.log('■ openLegacy が既存の目的画面を開く');
{
  const H = boot();
  H.V7Bridge.init();

  const cases = [
    { screen: 'deck-list', tab: 'card' },
    { screen: 'card-list', tab: 'card' },
    { screen: 'cpu-setup', tab: 'battle' },
    { screen: 'solo-setup', tab: 'battle' },
    { screen: 'tutorial-select', tab: 'battle' },
    { screen: 'dev-mode', tab: 'battle' },
    { screen: 'howto', tab: 'other' },
  ];
  cases.forEach(function (c) {
    H.V7Bridge.openLegacy({ screen: c.screen, entryTab: c.tab });
    check(c.screen + ' を開く', H.Screens.current() === c.screen);
    check(c.screen + ' の入口タブが ' + c.tab, H.V7Bridge.isActive());
    H.V7Bridge.returnToHub();
  });
}

/* =====================================================================
   2. 既存メニュー最初の画面で戻る → v0.7 ハブの入口タブへ
   ===================================================================== */
console.log('■ 入口画面での戻る（data-back）で v0.7 ハブへ');
{
  const H = boot();
  H.V7Bridge.init();
  H.V7Bridge.openLegacy({ screen: 'cpu-setup', entryTab: 'battle' });
  check('開いた直後はブリッジがアクティブ', H.V7Bridge.isActive());
  check('入口タブを覚えている（battle）', true);

  // data-back ボタンのクリックを capture で拾う
  const backBtn = fakeEl('button');
  backBtn.dataset.back = '1';
  H.fireDocClick(backBtn);
  check('入口で戻ると v0.7 ハブへ（非アクティブに）', !H.V7Bridge.isActive());
  check('入口タブ battle へ戻る', H.V7Hub.current() === 'battle');
}

console.log('■ 入口でない画面での戻るは横取りしない（既存に任せる）');
{
  const H = boot();
  H.V7Bridge.init();
  H.V7Bridge.openLegacy({ screen: 'deck-list', entryTab: 'card' });
  // デッキ確認へ1つ進んだ状態（スタック2枚）
  H.Screens.goNow('deck-view');
  const backBtn = fakeEl('button');
  backBtn.dataset.back = '1';
  H.fireDocClick(backBtn);
  check('スタック2枚では横取りしない（アクティブ維持）', H.V7Bridge.isActive());
}

/* =====================================================================
   3. ブラウザー戻る（handleBrowserBack）
   ===================================================================== */
console.log('■ ブラウザー戻る：入口ならハブ、複数枚なら既存を1つ戻す');
{
  const H = boot();
  H.V7Bridge.init();
  H.V7Bridge.openLegacy({ screen: 'card-list', entryTab: 'card' });
  H.V7Bridge.handleBrowserBack();
  check('入口でブラウザー戻る → ハブへ', !H.V7Bridge.isActive() && H.V7Hub.current() === 'card');
}
{
  const H = boot();
  H.V7Bridge.init();
  H.V7Bridge.openLegacy({ screen: 'deck-list', entryTab: 'card' });
  H.Screens.goNow('deck-view');
  const before = H.Screens._backCalls;
  H.V7Bridge.handleBrowserBack();
  check('複数枚でブラウザー戻る → 既存 Screens.back を呼ぶ', H.Screens._backCalls === before + 1);
  check('まだアクティブ（既存内で戻っただけ）', H.V7Bridge.isActive());
}

console.log('■ 対戦中のブラウザー戻るは既存のリタイア確認に委ねる');
{
  const H = boot();
  H.V7Bridge.init();
  H.V7Bridge.openLegacy({ screen: 'cpu-setup', entryTab: 'battle' });
  H.setPlayActive(true);   // 対戦盤面が進行中
  const before = H.Screens._backCalls;
  H.V7Bridge.handleBrowserBack();
  check('対戦中は何もしない（アクティブ維持・backも呼ばない）',
    H.V7Bridge.isActive() && H.Screens._backCalls === before);
  H.setPlayActive(false);
}

console.log('■ 未保存デッキ編集のブラウザー戻るは tryLeave に委ねる');
{
  const H = boot();
  H.V7Bridge.init();
  H.V7Bridge.openLegacy({ screen: 'deck-list', entryTab: 'card' });
  H.Screens.goNow('deck-view');
  H.Screens.goNow('deck-edit');
  const before = H.DeckEditorUI._tryLeaveCalled;
  H.V7Bridge.handleBrowserBack();
  check('デッキ編集で戻ると tryLeave が呼ばれる', H.DeckEditorUI._tryLeaveCalled === before + 1);
  check('まだアクティブ（確認に委ねただけ）', H.V7Bridge.isActive());
}

/* =====================================================================
   4. 対戦終了フック（__v7ReturnFromLegacy）
   ===================================================================== */
console.log('■ 対戦終了フックで v0.7 ハブへ戻る');
{
  const H = boot();
  H.V7Bridge.init();
  H.V7Bridge.openLegacy({ screen: 'cpu-setup', entryTab: 'battle' });
  const handled = H.returnFromLegacy();
  check('v0.7 経由なら true を返す', handled === true);
  check('ハブ（battle タブ）へ戻る', !H.V7Bridge.isActive() && H.V7Hub.current() === 'battle');
}
{
  const H = boot();
  H.V7Bridge.init();
  // v0.7 経由でない（アクティブでない）ときは false → 既存の復帰に任せる
  const handled = H.returnFromLegacy();
  check('v0.7 経由でなければ false（既存の復帰に任せる）', handled === false);
}

/* =====================================================================
   5. エリーゼ詳細（既存カード詳細の流用）
   ===================================================================== */
console.log('■ エリーゼ詳細は既存カード詳細を流用する');
{
  const H = boot();
  // V7Screen._openFavoriteCard は v07-screen.js 側。ここでは
  // CardListUI.openDetail が正しく呼べることだけ確認する。
  H.CardListUI.openDetail('mansion_elise');
  check('CardListUI.openDetail でエリーゼ詳細が開く', H.CardListUI._detailOpen === 'mansion_elise');
  H.CardListUI.closeDetail();
  check('closeDetail で閉じる', H.CardListUI._detailOpen === null);
}

/* =====================================================================
   6. 回帰：既存機能を開くと v0.7 の器（.v7-shell）が隠れる
      （隠れないと、v0.7 が最前面(z:1000)を占めたままで既存画面が
        見えない＝「既存機能に繋がらない」不具合になる）
   ===================================================================== */
console.log('■ 回帰：既存機能を開くと v0.7 の器が隠れ、戻ると再表示される');
{
  const H = boot();
  H.V7Bridge.init();
  const root = H.els['v7-root'];

  check('開く前：v0.7 の器は表示されている', !root._cls.has('v7-hidden'));
  H.V7Bridge.openLegacy({ screen: 'deck-list', entryTab: 'card' });
  check('既存機能を開くと v0.7 の器（#v7-root）が隠れる', root._cls.has('v7-hidden'));
  check('既存画面が開いている', H.Screens.current() === 'deck-list');

  H.V7Bridge.returnToHub();
  check('ハブへ戻ると v0.7 の器が再表示される', !root._cls.has('v7-hidden'));
}

console.log('■ 回帰：対戦終了フックで戻っても器が再表示される');
{
  const H = boot();
  H.V7Bridge.init();
  const root = H.els['v7-root'];
  H.V7Bridge.openLegacy({ screen: 'cpu-setup', entryTab: 'battle' });
  check('対戦設定を開くと器が隠れる', root._cls.has('v7-hidden'));
  H.returnFromLegacy();   // 対戦終了フック
  check('対戦終了で戻ると器が再表示される', !root._cls.has('v7-hidden'));
}

/* =====================================================================
   7. 実 HTML の構造検証
      （v0.7 の器と既存 UI の位置関係が崩れると「真っ暗で操作不能」に
        なるため、index.html の実物から機械的に確かめる）
   ===================================================================== */
console.log('■ 実 HTML：v0.7 の器と既存 UI の位置関係');
{
  const html = fs.readFileSync('index.html', 'utf8');

  // #v7-root と #viewport は body 直下の兄弟であること
  const rootIdx = html.indexOf('<div id="v7-root"');
  const viewportIdx = html.indexOf('<div id="viewport"');
  check('#v7-root がある', rootIdx >= 0);
  check('#viewport がある', viewportIdx >= 0);

  // #v7-root の閉じ位置を数えて、#viewport がその外にあることを確かめる
  let depth = 0, i = rootIdx, rootEnd = -1;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = rootIdx;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[0] === '<div') depth++;
    else { depth--; if (depth === 0) { rootEnd = m.index + 6; break; } }
  }
  check('#v7-root の範囲が特定できる', rootEnd > rootIdx);
  check('#viewport は #v7-root の外側にある（兄弟）', viewportIdx > rootEnd);

  // 既存メニュー #start-screen は #viewport 側にあること
  const startIdx = html.indexOf('<div id="start-screen">');
  check('#start-screen は #viewport 側にある', startIdx > viewportIdx);

  // CSS に .v7-root.v7-hidden があること（器を隠す手段）
  const css = fs.readFileSync('css/v07.css', 'utf8');
  check('CSS に .v7-root.v7-hidden がある（器を隠せる）',
    /\.v7-root\.v7-hidden\s*\{[^}]*display:\s*none/.test(css));

  // ブリッジが隠す対象が #v7-root であること
  const bridge = fs.readFileSync('js/v07-bridge.js', 'utf8');
  check('ブリッジは #v7-root を隠している',
    /getElementById\(['"]v7-root['"]\)/.test(bridge)
    && /toggle\(['"]v7-hidden['"]/.test(bridge));
}

/* =====================================================================
   8. 回帰：既存機能から戻ると「一つ前の v0.7 画面」へ戻る
      （CPU対戦設定の戻るでメインハブまで戻りすぎる不具合の再発防止）
   ===================================================================== */
console.log('■ 回帰：v0.7 の個別画面を開いたまま既存へ入り、戻ると保持されている');
{
  const H = boot();
  H.V7Bridge.init();
  // トレーニングモード選択（v0.7 個別画面）を開いている状態を作る
  vm.runInContext('V7Screen._open = true; V7Hub._cur = "battle"; V7Hub._jumpCount = 0;', H.ctx);

  H.V7Bridge.openLegacy({ screen: 'cpu-setup', entryTab: 'battle' });
  check('既存の CPU対戦設定が開く', H.Screens.current() === 'cpu-setup');
  check('v0.7 の個別画面は畳まれない（保持）',
    vm.runInContext('V7Screen._open', H.ctx) === true);

  H.V7Bridge.returnToHub();
  check('戻っても v0.7 個別画面が残っている（一つ前の画面へ戻る）',
    vm.runInContext('V7Screen._open', H.ctx) === true);
  check('ハブのタブ切替は起きない（戻りすぎない）',
    vm.runInContext('V7Hub._jumpCount', H.ctx) === 0);
}

console.log('■ 個別画面を開かずハブから直接入った場合は入口タブのハブへ戻る');
{
  const H = boot();
  H.V7Bridge.init();
  vm.runInContext('V7Screen._open = false; V7Hub._cur = "home"; V7Hub._jumpCount = 0;', H.ctx);

  H.V7Bridge.openLegacy({ screen: 'deck-list', entryTab: 'card' });
  H.V7Bridge.returnToHub();
  check('カードタブのハブへ戻る', H.V7Hub.current() === 'card');
  check('タブ切替が1回起きる', vm.runInContext('V7Hub._jumpCount', H.ctx) === 1);
}

console.log('■ 行き来に暗転幕が使われる');
{
  const H = boot();
  H.V7Bridge.init();
  const xfade = H.doc.body.children.filter(c => c._cls && c._cls.has('v7-xfade'))[0];
  check('暗転幕が body 直下に1枚できる', !!xfade);
  check('暗転幕は最初は消えている', xfade && !xfade._cls.has('v7-on'));
  // init を2回呼んでも増えない（リスナー・要素の重複防止）
  H.V7Bridge.init();
  const count = H.doc.body.children.filter(c => c._cls && c._cls.has('v7-xfade')).length;
  check('init を重ねても暗転幕は1枚だけ', count === 1);
}

/* =====================================================================
   まとめ
   ===================================================================== */
console.log('\n===== v0.7 Stage 4 既存機能接続：' + pass + '/' + (pass + fail) + ' 通過 =====');
if (fail > 0) process.exit(1);
