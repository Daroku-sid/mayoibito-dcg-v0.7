/* =====================================================================
   v07-screen-tests.js ―― v0.7 Stage 3（新規個別画面）の検査
   ---------------------------------------------------------------------
   画面が無くても確かめられる範囲を機械検査します。
     ・各個別画面の描画（プロフィール／お知らせ一覧・詳細／各選択画面／
       設定ハブ／ヘルプ／用語集／FAQ／クレジット／データ管理）
     ・遷移スタックと戻り階層（15.3 / 17.2）
     ・端末戻る（popstate）が画面内戻ると一致（17.1）
     ・データ書き出し／読み込み／初期化の二段階確認（20.4〜20.6）
   ===================================================================== */
const fs = require('fs'), vm = require('vm');

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

/* ---------- DOM モック（v07-hub-tests と同じ作り＋拡張） ---------- */
function fakeEl(tag) {
  const o = {
    tagName: tag || 'div', textContent: '', type: '', value: '',
    style: {}, dataset: {}, children: [], parentNode: null,
    _cls: new Set(), _listeners: {}, scrollTop: 0, scrollHeight: 100,
    offsetWidth: 300, files: null,
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
  o.getAttribute = (k) => o.dataset['attr_' + k];
  Object.defineProperty(o, 'id', {
    get() { return o._id || ''; },
    set(v) { o._id = v; o.dataset._domid = v; },
  });
  o.appendChild = ch => { ch.parentNode = o; o.children.push(ch); return ch; };
  o.removeChild = ch => { const i = o.children.indexOf(ch); if (i >= 0) o.children.splice(i, 1); ch.parentNode = null; };
  o.addEventListener = (type, fn) => { (o._listeners[type] = o._listeners[type] || []).push(fn); };
  o.fire = (type, ev) => {
    (o._listeners[type] || []).forEach(fn => fn(ev || {}));
    const prop = 'on' + type;
    if (typeof o[prop] === 'function') o[prop](ev || {});
  };
  o.click = () => o.fire('click', {});
  o.select = () => {};
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
  };
}

/* ---------- history モック ---------- */
function makeHistory(win) {
  const stack = [{ state: null }];
  const listeners = [];
  win.addEventListener = (type, fn) => { if (type === 'popstate') listeners.push(fn); };
  const firePop = () => { listeners.forEach(fn => fn({ state: stack[stack.length - 1].state })); };
  return {
    history: {
      pushState: (s) => { stack.push({ state: s }); },
      replaceState: (s) => { stack[stack.length - 1] = { state: s }; },
      back: () => { if (stack.length > 1) { stack.pop(); } firePop(); },
    },
    _stackLen: () => stack.length,
  };
}

/* ---------- ハブ＋個別画面一式を読み込む ---------- */
function boot(opts) {
  opts = opts || {};
  const clock = makeClock();
  const els = {};
  const need = [
    'v7-art-a', 'v7-art-b', 'v7-art-tap',
    'v7-profile', 'v7-profile-name', 'v7-profile-title', 'v7-profile-level',
    'v7-cur-soft', 'v7-cur-premium',
    'v7-panels', 'v7-panel-slider', 'v7-nav', 'v7-wipe',
    'v7-toast-area', 'v7-scrim', 'v7-dialog',
    'v7-dialog-title', 'v7-dialog-body', 'v7-dialog-buttons',
    'v7-shell',
  ];
  need.forEach(id => { els[id] = fakeEl(); els[id]._id = id; els[id].dataset._domid = id; });

  const doc = {
    body: fakeEl('body'),
    getElementById: id => {
      if (els[id]) return els[id];
      let found = null;
      Object.values(els).forEach(e => {
        collect(e).forEach(c => { if (c.dataset && c.dataset._domid === id) found = c; });
      });
      return found || null;
    },
    createElement: t => fakeEl(t),
    createRange: () => ({ selectNodeContents: () => {} }),
    querySelectorAll: sel => {
      let all = [];
      Object.values(els).forEach(e => { all = all.concat(collect(e)); });
      return all.filter(el => matchSel(el, sel));
    },
    execCommand: () => true,
    addEventListener: () => {},
  };

  const store = (function () {
    let mem = opts.saved || null;
    return { getItem: () => mem, setItem: (k, v) => { mem = v; }, removeItem: () => { mem = null; } };
  })();

  const win = { localStorage: store, getSelection: () => ({ removeAllRanges: () => {}, addRange: () => {} }) };
  const hist = makeHistory(win);
  win.history = hist.history;

  const clip = opts.clipFail
    ? { writeText: () => Promise.reject(new Error('no')) }
    : { writeText: () => Promise.resolve() };

  const ctx = vm.createContext({
    window: win, document: doc,
    navigator: { clipboard: clip },
    JSON, console, Math, Date,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    Image: class { set src(v) { if (this.onload) this.onload(); } },
    Blob: class { constructor(a) { this.parts = a; } },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
    FileReader: class { readAsText(f) { const s = this; clock.setTimeout(function () { s.result = f._text || ''; if (s.onload) s.onload(); }, 0); } },
    module: { exports: {} },
  });

  const load = f => vm.runInContext(fs.readFileSync('js/' + f, 'utf8'), ctx);
  load('v07-save.js');
  load('v07-shell.js');
  load('v07-hub-data.js');
  load('v07-art.js');
  load('v07-home.js');
  load('v07-panels.js');
  load('v07-screen.js');
  load('v07-bridge.js');
  load('v07-hub.js');
  const get = n => vm.runInContext(n, ctx);
  return {
    clock, doc, els, hist, win,
    V7Save: get('V7Save'), V7Timers: get('V7Timers'), V7Toast: get('V7Toast'),
    V7Wipe: get('V7Wipe'), V7Dialog: get('V7Dialog'), V7Hub: get('V7Hub'),
    V7Screen: get('V7Screen'), V7Screens: get('V7Screens'), V7Panels: get('V7Panels'),
  };
}

function initAll(H) {
  H.V7Toast.init(H.els['v7-toast-area']);
  H.V7Wipe.init(H.els['v7-wipe']);
  H.V7Dialog.init(
    H.els['v7-scrim'], H.els['v7-dialog'],
    H.els['v7-dialog-title'], H.els['v7-dialog-body'], H.els['v7-dialog-buttons']);
  H.V7Save.load();
  H.V7Screen.init(H.els['v7-shell']);
  H.V7Hub.init();
}

function flushWipe(H) { H.clock.tick(200); H.clock.tick(200); }
function body(H) { return H.V7Screen._bodyEl; }
function title(H) { return H.V7Screen._titleEl.textContent; }

/* 個別画面を開くヘルパー */
function openScreen(H, key, data) { H.V7Screen.open(key, data ? { data: data } : undefined); flushWipe(H); }

/* =====================================================================
   1. レイヤー土台
   ===================================================================== */
console.log('■ 個別画面レイヤーとヘッダー');
{
  const H = boot();
  initAll(H);
  const layer = H.els['v7-shell'].querySelector('.v7-screen');
  check('shell に個別画面レイヤーが1枚できる', !!layer);
  check('起動直後は個別画面が閉じている', H.V7Screen.isOpen() === false);
  check('個別画面は最初は非表示', layer.style.display === 'none');
  check('ヘッダーに戻るボタンがある', !!layer.querySelector('.v7-screen__back'));
}

/* =====================================================================
   2. プロフィール（第12部）
   ===================================================================== */
console.log('■ プロフィール：名前・称号・ローカルID・お気に入り');
{
  const H = boot();
  initAll(H);
  H.els['v7-profile'].fire('click', {});   // 12.1 パネル全体タップ
  flushWipe(H);
  check('プロフィールが開く', H.V7Screen.isOpen() && H.V7Screen.depth() === 1);
  check('ヘッダーが「プロフィール」', title(H) === 'プロフィール');
  const b = body(H);
  check('プレイヤー名が表示', (b.querySelector('.v7-prof__name') || {}).textContent === 'プレイヤー');
  check('称号が表示', (b.querySelector('.v7-prof__title') || {}).textContent === 'はじめての一歩');
  const idval = b.querySelector('.v7-prof__idval');
  check('ローカルIDが MB- 形式', idval && /^MB-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(idval.textContent), idval && idval.textContent);
  check('お気に入りカードがエリーゼ',
    (b.querySelector('.v7-prof__favname') || {}).textContent === '《屋敷の令嬢 エリーゼ》');
  check('コピーボタンがある', !!b.querySelector('.v7-prof__copy'));
  // コピー押下で例外にならない（成功時の通知は非同期なのでここでは呼べるかだけ）
  let threw = false;
  try { b.querySelector('.v7-prof__copy').fire('click', {}); } catch (e) { threw = true; }
  check('コピー押下で例外が出ない', threw === false);

  // お気に入りカードのタップで詳細（12.6）。外側タップ相当では閉じない設計
  b.querySelector('.v7-prof__fav').fire('click', {});
  check('お気に入りカードでダイアログが開く', H.V7Dialog.isOpen());
  H.V7Dialog.close();
}

console.log('■ プロフィールから元タブへ戻れる（15.3）');
{
  const H = boot();
  initAll(H);
  // その他タブへ移動してからプロフィールを開く→戻ると「その他」へ
  H.V7Hub.jumpTab('other');
  H.els['v7-profile'].fire('click', {});
  flushWipe(H);
  H.V7Screen.back();
  flushWipe(H);
  check('プロフィールを閉じると個別画面が閉じる', H.V7Screen.isOpen() === false);
  check('開く前のタブ（その他）へ戻る', H.V7Hub.current() === 'other');
}

/* =====================================================================
   3. お知らせ（第13部）
   ===================================================================== */
console.log('■ お知らせ：一覧・4カテゴリー・詳細・戻り');
{
  const H = boot();
  initAll(H);
  openScreen(H, 'news');
  const rows = body(H).querySelectorAll('.v7-news__row');
  check('お知らせ一覧が4件', rows.length === 4, String(rows.length));
  const cats = body(H).querySelectorAll('.v7-news__cat');
  const catText = cats.map(c => c.textContent);
  ['アップデート', '遊び方', '重要', '開発情報'].forEach(function (c) {
    check('カテゴリー「' + c + '」がある', catText.indexOf(c) >= 0);
  });
  // 記事詳細へ
  rows[0].fire('click', {});
  flushWipe(H);
  check('記事詳細へ進める', H.V7Screen.depth() === 2 && !!body(H).querySelector('.v7-newsdet__title'));
  // 詳細→一覧
  H.V7Screen.back();
  flushWipe(H);
  check('詳細から一覧へ戻る', H.V7Screen.depth() === 1 && !!body(H).querySelector('.v7-news__row'));
  // 一覧→ホーム
  H.V7Screen.back();
  flushWipe(H);
  check('一覧からホーム（ハブ）へ戻る', H.V7Screen.isOpen() === false);
}

/* =====================================================================
   4. 対戦系の選択画面（第9部）
   ===================================================================== */
console.log('■ ソロプレイ選択（9.2：2:1・両方準備中）');
{
  const H = boot();
  initAll(H);
  openScreen(H, 'solo');
  check('ヘッダーがソロプレイ', title(H) === 'ソロプレイ');
  const tiles = body(H).querySelectorAll('.v7-tile');
  check('タイルが2つ（ストーリー／ソロ周回）', tiles.length === 2, String(tiles.length));
  const soon = body(H).querySelectorAll('.v7-tile--soon');
  check('両方が準備中（暗め）', soon.length === 2);
  check('準備中バッジがある', body(H).querySelectorAll('.v7-tile__badge').length === 2);
  // タップ可能：紹介ダイアログ
  tiles[0].fire('click', {});
  check('準備中タイルはタップで紹介ダイアログ', H.V7Dialog.isOpen());
  H.V7Dialog.close();
}

console.log('■ オンライン選択（9.3：上段コンテンツ／下段対人）');
{
  const H = boot();
  initAll(H);
  openScreen(H, 'online');
  const sections = body(H).querySelectorAll('.v7-screen__section');
  check('見出しが2つ（オンラインコンテンツ／対人戦）', sections.length === 2, String(sections.length));
  check('1つ目がオンラインコンテンツ', sections[0].textContent === 'オンラインコンテンツ');
  check('2つ目が対人戦', sections[1].textContent === '対人戦');
  check('タイルが4つ・すべて準備中', body(H).querySelectorAll('.v7-tile--soon').length === 4);
}

console.log('■ その他対戦（9.4）＆トレーニング（9.5：1:1）');
{
  const H = boot();
  initAll(H);
  openScreen(H, 'otherBattle');
  check('その他対戦の左大はトレーニングモード',
    !!body(H).querySelector('.v7-lr__main'));
  const tiles = body(H).querySelectorAll('.v7-tile');
  check('タイルが3つ（トレーニング／チュートリアル／開発者用）', tiles.length === 3, String(tiles.length));
  // トレーニングモードへ進む
  body(H).querySelector('.v7-lr__main').fire('click', {});
  flushWipe(H);
  check('トレーニングモード選択へ進める', title(H) === 'トレーニングモード');
  check('トレーニングは1:1グリッド2枚（CPU対戦／ひとりまわし）',
    body(H).querySelectorAll('.v7-tile').length === 2 && !!body(H).querySelector('.v7-grid--2'));
}

/* =====================================================================
   5. 設定ハブ・ヘルプ・用語集・FAQ・クレジット（第14部）
   ===================================================================== */
console.log('■ 設定ハブ（14.1：3グループ・準備中ラベル）');
{
  const H = boot();
  initAll(H);
  openScreen(H, 'settings');
  const sections = body(H).querySelectorAll('.v7-screen__section');
  check('3グループに分類（ゲーム設定／データ／サポート・情報）', sections.length === 3, String(sections.length));
  check('見出しの並びが仕様どおり',
    sections.map(s => s.textContent).join(',') === 'ゲーム設定,データ,サポート・情報');
  check('未実装設定に準備中ラベル（3件）', body(H).querySelectorAll('.v7-listrow--soon').length === 3);
}

console.log('■ ヘルプ（14.2：4項目）');
{
  const H = boot();
  initAll(H);
  openScreen(H, 'help');
  const rows = body(H).querySelectorAll('.v7-listrow');
  check('ヘルプが4項目', rows.length === 4, String(rows.length));
}

console.log('■ 用語集（14.3：アコーディオン・複数同時展開）');
{
  const H = boot();
  initAll(H);
  openScreen(H, 'glossary');
  const items = body(H).querySelectorAll('.v7-acc__item');
  check('用語が14件', items.length === 14, String(items.length));
  const terms = body(H).querySelectorAll('.v7-acc__term').map(t => t.textContent);
  check('「攻撃力」の項が無い', terms.indexOf('攻撃力') === -1);
  check('「スピード」の項がある', terms.indexOf('スピード') >= 0);
  // スピードの説明が「襲撃で相手に与えるダメージ量」を述べている
  const spIdx = terms.indexOf('スピード');
  const spDesc = (body(H).querySelectorAll('.v7-acc__desc')[spIdx] || {}).textContent || '';
  check('スピードの説明が襲撃ダメージ量に触れている',
    spDesc.indexOf('襲撃') >= 0 && spDesc.indexOf('ダメージ') >= 0);
  const heads = body(H).querySelectorAll('.v7-acc__head');
  heads[0].fire('click', {});
  heads[1].fire('click', {});
  check('複数用語を同時に開ける',
    items[0]._cls.has('is-open') && items[1]._cls.has('is-open'));
  heads[0].fire('click', {});
  check('再タップで閉じる', !items[0]._cls.has('is-open') && items[1]._cls.has('is-open'));
}

console.log('■ FAQ（14.4：アコーディオン・初期6件）');
{
  const H = boot();
  initAll(H);
  openScreen(H, 'faq');
  check('FAQが6件', body(H).querySelectorAll('.v7-acc__item').length === 6);
}

console.log('■ クレジット（14.5：ダロク表記）');
{
  const H = boot();
  initAll(H);
  openScreen(H, 'credits');
  const names = body(H).querySelectorAll('.v7-credits__name').map(n => n.textContent).join(' ');
  check('クレジットにダロク表記がある', names.indexOf('ダロク') >= 0);
  check('バージョン v0.7 の記載', names.indexOf('v0.7') >= 0);
}

/* =====================================================================
   6. 戻り階層（FAQ→ヘルプ→設定→その他タブ：15.3 / 17.2）
   ===================================================================== */
console.log('■ 戻り階層：FAQ → ヘルプ → 設定 → その他タブ');
{
  const H = boot();
  initAll(H);
  H.V7Hub.jumpTab('other');
  // その他タブの設定パネルから設定ハブへ
  const slider = H.els['v7-panel-slider'];
  const otherPanel = slider.querySelector('.v7-tabpanel[data-tab="other"]');
  otherPanel.querySelector('.v7-card-panel').fire('click', {});   // 設定（左大）
  flushWipe(H);
  check('設定ハブが開く', title(H) === '設定');
  // 設定→ヘルプ
  body(H).querySelectorAll('.v7-listrow').filter(r => (r.querySelector('.v7-listrow__name')||{}).textContent === 'ヘルプ')[0].fire('click', {});
  flushWipe(H);
  check('ヘルプへ進む', title(H) === 'ヘルプ');
  // ヘルプ→FAQ
  body(H).querySelectorAll('.v7-listrow').filter(r => (r.querySelector('.v7-listrow__name')||{}).textContent === 'よくある質問')[0].fire('click', {});
  flushWipe(H);
  check('FAQへ進む（深さ3）', title(H) === 'よくある質問' && H.V7Screen.depth() === 3);
  // 戻る：FAQ→ヘルプ
  H.V7Screen.back(); flushWipe(H);
  check('FAQ→ヘルプへ戻る', title(H) === 'ヘルプ');
  // 戻る：ヘルプ→設定
  H.V7Screen.back(); flushWipe(H);
  check('ヘルプ→設定へ戻る', title(H) === '設定');
  // 戻る：設定→その他タブ
  H.V7Screen.back(); flushWipe(H);
  check('設定→その他タブへ戻る', H.V7Screen.isOpen() === false && H.V7Hub.current() === 'other');
}

/* =====================================================================
   7. 端末戻る（popstate）が画面内戻ると一致（17.1）
   ===================================================================== */
console.log('■ 端末戻る（popstate）が画面内戻ると一致');
{
  const H = boot();
  initAll(H);
  openScreen(H, 'settings');
  openScreen(H, 'help');
  check('設定→ヘルプで深さ2', H.V7Screen.depth() === 2);
  // 端末の戻る（history.back → popstate）
  H.win.history.back();
  flushWipe(H);
  check('端末戻るで1段戻る（設定へ）', title(H) === '設定' && H.V7Screen.depth() === 1);
  H.win.history.back();
  flushWipe(H);
  check('もう一度でハブへ', H.V7Screen.isOpen() === false);
}

console.log('■ ダイアログ中の戻るはダイアログを閉じる（17.3）');
{
  const H = boot();
  initAll(H);
  openScreen(H, 'solo');
  body(H).querySelector('.v7-tile').fire('click', {});   // 準備中ダイアログ
  check('準備中ダイアログが開く', H.V7Dialog.isOpen());
  H.win.history.back();   // 端末戻る
  check('戻るでダイアログが閉じる', H.V7Dialog.isOpen() === false);
  check('ダイアログを閉じても画面はソロのまま', H.V7Screen.isOpen() && title(H) === 'ソロプレイ');
}

/* =====================================================================
   8. データ管理（第20部）
   ===================================================================== */
console.log('■ データ書き出し（20.4）');
{
  const H = boot();
  initAll(H);
  openScreen(H, 'settings');
  // データ管理へ
  body(H).querySelectorAll('.v7-listrow').filter(r => (r.querySelector('.v7-listrow__name')||{}).textContent === 'データ管理')[0].fire('click', {});
  flushWipe(H);
  check('データ管理画面が開く', title(H) === 'データ管理');
  const rows = body(H).querySelectorAll('.v7-listrow');
  check('3項目（書き出す／読み込む／初期化）', rows.length === 3, String(rows.length));
  // 書き出し：例外なくトーストが出る
  let threw = false;
  try { rows[0].fire('click', {}); } catch (e) { threw = true; }
  check('書き出しが例外なく動く', threw === false);
}

console.log('■ データ読み込み：壊れたデータで現データが変わらない（20.5）');
{
  const H = boot();
  initAll(H);
  const idBefore = H.V7Save.localId();
  // 壊れたJSONを importText に直接渡して検証（画面経由と同じ関数）
  const res = H.V7Save.importText('{ this is not json');
  check('壊れたデータは読み込み失敗を返す', res.ok === false);
  check('失敗時にローカルIDが変わらない', H.V7Save.localId() === idBefore);
}

console.log('■ データ初期化：二段階確認＆IDが変わる＆ホームへ（20.6）');
{
  const H = boot();
  initAll(H);
  H.V7Hub.jumpTab('other');
  openScreen(H, 'settings');
  body(H).querySelectorAll('.v7-listrow').filter(r => (r.querySelector('.v7-listrow__name')||{}).textContent === 'データ管理')[0].fire('click', {});
  flushWipe(H);
  const idBefore = H.V7Save.localId();
  // 初期化ボタン
  body(H).querySelectorAll('.v7-listrow')[2].fire('click', {});
  check('1回目の確認が出る', H.V7Dialog.isOpen());
  // 1回目の確定（右ボタン）
  const btns1 = H.els['v7-dialog-buttons'].children;
  btns1[btns1.length - 1].fire('click', {});
  check('2回目の確認が出る', H.V7Dialog.isOpen());
  const btns2 = H.els['v7-dialog-buttons'].children;
  btns2[btns2.length - 1].fire('click', {});
  flushWipe(H);
  check('初期化でローカルIDが変わる', H.V7Save.localId() !== idBefore);
  check('初期化後はホームタブへ戻る', H.V7Hub.current() === 'home' && H.V7Screen.isOpen() === false);
}

/* =====================================================================
   9. 回帰：データ操作の後にデータ管理画面から戻れる
      （書き出し・読み込み・初期化で戻れなくなる不具合の再発防止）
   ===================================================================== */
console.log('■ 回帰：書き出しの後にデータ管理→設定→その他タブへ戻れる');
{
  const H = boot();
  initAll(H);
  H.V7Hub.jumpTab('other');
  openScreen(H, 'settings');
  openScreen(H, 'dataManage');
  body(H).querySelectorAll('.v7-listrow')[0].fire('click', {});   // 書き出し
  flushWipe(H);
  H.V7Screen.back(); flushWipe(H);
  check('書き出し後：データ管理→設定へ戻れる', title(H) === '設定');
  H.V7Screen.back(); flushWipe(H);
  check('設定→その他タブへ戻れる', H.V7Screen.isOpen() === false && H.V7Hub.current() === 'other');
}

console.log('■ 回帰：読み込み上書き確定の後にデータ管理から戻れる');
{
  const H = boot();
  initAll(H);
  H.V7Hub.jumpTab('other');
  openScreen(H, 'settings');
  openScreen(H, 'dataManage');
  const fileInput = H.doc.getElementById('v7-import-file');
  fileInput.files = [{ _text: JSON.stringify({
    saveVersion: 1, localId: 'MB-AAAA-BBBB',
    profile: { playerName: 'プレイヤー', title: 'はじめての一歩', favoriteCardId: 'mansion_elise' },
    settings: {},
  }) }];
  fileInput.fire('change', {});
  H.clock.tick(1);   // FileReader.onload（setTimeout 0）を発火させる
  const btns = H.els['v7-dialog-buttons'].children;
  check('読み込み確認ダイアログが開く', H.V7Dialog.isOpen() && btns.length >= 1);
  btns[btns.length - 1].fire('click', {});   // 上書き確定
  flushWipe(H);
  check('確定後もデータ管理のまま', title(H) === 'データ管理' && H.V7Dialog.isOpen() === false);
  H.V7Screen.back(); flushWipe(H);
  check('読み込み後：データ管理→設定へ戻れる', title(H) === '設定');
  H.V7Screen.back(); flushWipe(H);
  check('設定→その他タブへ戻れる', H.V7Screen.isOpen() === false && H.V7Hub.current() === 'other');
}

console.log('■ 回帰：端末戻るでダイアログを閉じた後もハブまで戻り切れる');
{
  const H = boot();
  initAll(H);
  H.V7Hub.jumpTab('other');
  openScreen(H, 'settings');
  openScreen(H, 'dataManage');
  body(H).querySelectorAll('.v7-listrow')[2].fire('click', {});   // 初期化1回目の確認
  check('確認ダイアログが開く', H.V7Dialog.isOpen());
  H.win.history.back();   // 端末戻るでダイアログを閉じる
  check('端末戻るでダイアログが閉じ、画面はデータ管理のまま',
    H.V7Dialog.isOpen() === false && title(H) === 'データ管理');
  H.V7Screen.back(); flushWipe(H);
  check('データ管理→設定へ戻れる', title(H) === '設定');
  H.V7Screen.back(); flushWipe(H);
  check('設定→その他タブへ戻り切れる', H.V7Screen.isOpen() === false && H.V7Hub.current() === 'other');
}

/* =====================================================================
   まとめ
   ===================================================================== */
console.log('\n===== v0.7 Stage 3 個別画面：' + pass + '/' + (pass + fail) + ' 通過 =====');
if (fail > 0) process.exit(1);
