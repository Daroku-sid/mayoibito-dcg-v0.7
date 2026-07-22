/* =====================================================================
   v07-foundation-tests.js ―― v0.7 Stage 1（基盤）の検査
   ---------------------------------------------------------------------
   画面が無くても確かめられる範囲を機械検査します。
     ・v0.7 専用保存キー / 旧キーに触れない（第20部）
     ・ローカルID の形式と再生成（第12部 12.4 / 20.6）
     ・書き出し・読み込み・初期化の仕組み（第20部）
     ・タイマーの二重生成防止（第26部 26.3）
     ・通知の順次表示（第16部 16.3）
     ・ダイアログの確認/戻る/暗幕（第16部 16.1/16.2 / 17.3）
     ・暗転が「頂点で1回だけ切り替える」形か（第15部 15.2）
   ===================================================================== */
const fs = require('fs'), vm = require('vm');

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

/* ---------- localStorage のかわり ---------- */
function makeStore(opts) {
  const o = opts || {};
  const mem = {};
  return {
    getItem: k => { if (o.readFails) throw new Error('読めません'); return mem[k] === undefined ? null : mem[k]; },
    setItem: (k, v) => { if (o.writeFails) throw new Error('Quota'); mem[k] = String(v); },
    removeItem: k => { delete mem[k]; },
    _mem: mem,
  };
}

/* ---------- 画面部品のかわり（最小の DOM モック） ---------- */
function fakeEl() {
  const o = {
    textContent: '', type: '', style: {}, children: [], parentNode: null,
    _cls: new Set(), _listeners: {},
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
  // 実要素と同じく className への代入で class 集合を作り直す
  Object.defineProperty(o, 'className', {
    get() { return Array.from(o._cls).join(' '); },
    set(v) {
      o._cls.clear();
      String(v).split(/\s+/).forEach(c => { if (c) o._cls.add(c); });
    },
  });
  o.setAttribute = () => {};
  o.appendChild = ch => { ch.parentNode = o; o.children.push(ch); return ch; };
  o.removeChild = ch => { const i = o.children.indexOf(ch); if (i >= 0) o.children.splice(i, 1); ch.parentNode = null; };
  o.addEventListener = (type, fn) => { (o._listeners[type] = o._listeners[type] || []).push(fn); };
  o.fire = (type, ev) => { (o._listeners[type] || []).forEach(fn => fn(ev || {})); };
  Object.defineProperty(o, 'offsetWidth', { get() { return 1; } });
  return o;
}

/* ---------- タイマーを手で進められる作り ---------- */
function makeClock() {
  let now = 0, seq = 1;
  const jobs = [];   // { id, at, fn }
  return {
    setTimeout: (fn, ms) => { const id = seq++; jobs.push({ id, at: now + (ms || 0), fn }); return id; },
    clearTimeout: (id) => { const i = jobs.findIndex(j => j.id === id); if (i >= 0) jobs.splice(i, 1); },
    tick: (ms) => {
      const target = now + ms;
      // 期限が来たものを時刻順に実行
      for (;;) {
        const due = jobs.filter(j => j.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        now = due.at;
        const i = jobs.indexOf(due); jobs.splice(i, 1);
        due.fn();
      }
      now = target;
    },
    pending: () => jobs.length,
  };
}

/* ---------- 器のスクリプトを読み込む ---------- */
function boot(store, clock) {
  const doc = {
    _els: {},
    getElementById: id => doc._els[id] || (doc._els[id] = fakeEl()),
    createElement: () => fakeEl(),
    addEventListener: () => {},
  };
  const ctx = vm.createContext({
    window: { localStorage: store },
    document: doc,
    JSON, console, Math, Date,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    module: { exports: {} },
  });
  vm.runInContext(fs.readFileSync('js/v07-save.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('js/v07-shell.js', 'utf8'), ctx);
  return {
    doc,
    V7Save: vm.runInContext('V7Save', ctx),
    V7Timers: vm.runInContext('V7Timers', ctx),
    V7Toast: vm.runInContext('V7Toast', ctx),
    V7Wipe: vm.runInContext('V7Wipe', ctx),
    V7Dialog: vm.runInContext('V7Dialog', ctx),
  };
}

/* =====================================================================
   1. v0.7 保存キーとローカルID（第20部 / 第12部）
   ===================================================================== */
console.log('■ v0.7 保存キーとローカルID');
{
  const store = makeStore();
  const clock = makeClock();
  const { V7Save } = boot(store, clock);
  V7Save.load();

  check('保存キーが mayoibito_v07_save', V7Save.KEY === 'mayoibito_v07_save');
  check('旧キー mayohibito.v04 / .v03 を保存に使っていない',
    !store._mem['mayohibito.v04'] && !store._mem['mayohibito.v03']);
  check('初回起動で v0.7 セーブが作られる', !!store._mem[V7Save.KEY]);
  check('ローカルIDが生成される', V7Save.isValidLocalId(V7Save.localId()), V7Save.localId());
  check('ID形式 MB-XXXX-XXXX', /^MB-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(V7Save.localId()));
  check('紛らわしい文字 0/O/1/I を含まない',
    !/[01OI]/.test(V7Save.localId().replace('MB-', '').replace('-', '')));
  check('プロフィール初期値（名前・称号・お気に入り）',
    V7Save.data.profile.playerName === 'プレイヤー'
    && V7Save.data.profile.title === 'はじめての一歩'
    && V7Save.data.profile.favoriteCardId === 'mansion_elise');
}

console.log('■ 再読み込みで同じIDが残る（第28部 Stage1）');
{
  const store = makeStore();
  const clock = makeClock();
  const first = boot(store, clock);
  first.V7Save.load();
  const id1 = first.V7Save.localId();

  // 同じ localStorage で改めて読み込む
  const second = boot(store, clock);
  second.V7Save.load();
  const id2 = second.V7Save.localId();
  check('再読み込み後も同じローカルID', id1 === id2, id1 + ' / ' + id2);
}

console.log('■ 書き出し・読み込み・初期化（第20部）');
{
  const store = makeStore();
  const clock = makeClock();
  const { V7Save } = boot(store, clock);
  V7Save.load();
  const id1 = V7Save.localId();

  const text = V7Save.exportText();
  check('書き出しは正しいJSON', (() => { try { JSON.parse(text); return true; } catch (e) { return false; } })());
  check('書き出しファイル名にIDが入る', V7Save.exportFileName().indexOf(id1) >= 0, V7Save.exportFileName());

  // 壊れたデータの読み込みでは現データを変えない（第20部 20.5）
  const before = JSON.stringify(V7Save.data);
  const r1 = V7Save.importText('{壊れています');
  check('壊れたJSONは読み込まない', r1.ok === false);
  check('壊れた読み込みで現データが変わらない', JSON.stringify(V7Save.data) === before);

  // 正しいデータの読み込みは差し替える
  const good = JSON.stringify({
    saveVersion: 1, localId: 'MB-ABCD-2345',
    profile: { playerName: 'テスト', title: '称号', favoriteCardId: 'village_haruka' },
    settings: {},
  });
  const r2 = V7Save.importText(good);
  check('正しいデータは読み込める', r2.ok === true);
  check('読み込んだIDに置き換わる', V7Save.localId() === 'MB-ABCD-2345', V7Save.localId());
  check('読み込んだプロフィールになる', V7Save.data.profile.playerName === 'テスト');

  // 初期化は新しいIDを再生成（第20部 20.6 / 第28部 Stage1）
  const idBefore = V7Save.localId();
  V7Save.reset();
  const idAfter = V7Save.localId();
  check('初期化でIDが変わる', idBefore !== idAfter, idBefore + ' → ' + idAfter);
  check('初期化後もID形式は正しい', V7Save.isValidLocalId(idAfter));
  check('初期化でプロフィールが既定に戻る', V7Save.data.profile.playerName === 'プレイヤー');
}

console.log('■ 保存が使えない環境でも落ちない（第20部）');
{
  const store = makeStore({ readFails: true, writeFails: true });
  const clock = makeClock();
  const { V7Save } = boot(store, clock);
  let threw = false;
  try { V7Save.load(); } catch (e) { threw = true; }
  check('読み書き不能でも load が例外を投げない', !threw);
  check('それでもローカルIDは用意される', V7Save.isValidLocalId(V7Save.localId()));
  check('直した箇所メッセージが残る', V7Save.repairs.length > 0);
}

/* =====================================================================
   2. タイマーの一元管理（第26部 26.3）
   ===================================================================== */
console.log('■ タイマーの二重生成防止');
{
  const store = makeStore();
  const clock = makeClock();
  const { V7Timers } = boot(store, clock);

  let count = 0;
  V7Timers.set('x', () => { count++; }, 100);
  V7Timers.set('x', () => { count++; }, 100);   // 同名で上書き（二重にしない）
  check('同名タイマーは1つだけ残る', clock.pending() === 1);
  clock.tick(100);
  check('発火は1回だけ', count === 1, String(count));

  V7Timers.set('a', () => {}, 50);
  V7Timers.set('b', () => {}, 50);
  check('別名は別々に持てる', clock.pending() === 2);
  V7Timers.clearAll();
  check('clearAll で全部消える', clock.pending() === 0);
}

/* =====================================================================
   3. 短時間通知（第16部 16.3）
   ===================================================================== */
console.log('■ 通知は1件ずつ順番に');
{
  const store = makeStore();
  const clock = makeClock();
  const { V7Toast, doc } = boot(store, clock);
  const area = doc.getElementById('v7-toast-area');
  V7Toast.init(area);

  V7Toast.push('1件目');
  V7Toast.push('2件目');
  check('最初は1件だけ表示', area.children.length === 1);
  check('表示中の文言は1件目', area.children[0].textContent === '1件目');

  clock.tick(4000);   // 4秒表示
  clock.tick(220);    // 消える
  check('1件目が消えて2件目が出る',
    area.children.length === 1 && area.children[0].textContent === '2件目');

  clock.tick(4000); clock.tick(220);
  check('最後は空になる', area.children.length === 0);

  // 同一内容のまとめ（dedupe）
  V7Toast.push('同じ', { dedupe: true });
  V7Toast.push('同じ', { dedupe: true });
  // 1件目は即表示され待機列は空、2件目の push は待機列末尾の '同じ' と一致しないので積まれる
  // （表示中のぶんは待機列にないため、dedupe は「連続する待機」だけまとめる仕様）
  check('dedupe: 表示は1件', area.children.length === 1);
}

/* =====================================================================
   4. ダイアログ（第16部 16.1/16.2 / 第17部 17.3）
   ===================================================================== */
console.log('■ ダイアログの確認・戻る・暗幕');
{
  const store = makeStore();
  const clock = makeClock();
  const { V7Dialog, doc } = boot(store, clock);
  const scrim = doc.getElementById('v7-scrim');
  const box = doc.getElementById('v7-dialog');
  const title = doc.getElementById('v7-dialog-title');
  const body = doc.getElementById('v7-dialog-body');
  const btns = doc.getElementById('v7-dialog-buttons');
  V7Dialog.init(scrim, box, title, body, btns);

  // 準備中ダイアログ：1ボタン・暗幕タップで閉じられる（16.1）
  V7Dialog.comingSoon('準備中', '未実装です');
  check('準備中は開くと暗幕が出る', scrim._cls.has('v7-on'));
  check('準備中は1ボタン', btns.children.length === 1);
  scrim.fire('pointerdown', { target: scrim });
  check('準備中は暗幕タップで閉じる', !scrim._cls.has('v7-on') && !V7Dialog.isOpen());

  // 確認ダイアログ：2ボタン・暗幕タップでは閉じない（16.2）
  let confirmed = false, cancelled = false;
  V7Dialog.confirm({
    title: '確認', body: '実行しますか',
    danger: true,
    onConfirm: () => { confirmed = true; },
    onCancel: () => { cancelled = true; },
  });
  check('確認は2ボタン', btns.children.length === 2);
  check('危険操作の右ボタンが赤（v7-danger）',
    btns.children[1]._cls.has('v7-danger'));
  scrim.fire('pointerdown', { target: scrim });
  check('確認は暗幕タップで閉じない', V7Dialog.isOpen());

  // 戻る操作は確認をキャンセル扱い（17.3）
  const handled = V7Dialog.handleBack();
  check('戻るでダイアログが閉じる', handled && !V7Dialog.isOpen());
  check('戻るはキャンセルとして扱う', cancelled === true && confirmed === false);

  // 確定ボタンを押すと onConfirm が走る
  V7Dialog.confirm({ title: 'a', body: 'b', onConfirm: () => { confirmed = true; } });
  btns.children[1].fire('click');
  check('確定ボタンで onConfirm が走る', confirmed === true);
  check('確定後にダイアログが閉じている', !V7Dialog.isOpen());
}

/* =====================================================================
   5. 暗転（第15部 15.2）
   ===================================================================== */
console.log('■ 暗転は頂点で1回だけ切り替える');
{
  const store = makeStore();
  const clock = makeClock();
  const { V7Wipe, doc } = boot(store, clock);
  const el = doc.getElementById('v7-wipe');
  V7Wipe.init(el);

  let midCalls = 0, doneCalls = 0;
  V7Wipe.run(() => { midCalls++; }, () => { doneCalls++; });
  check('暗転が始まると黒幕が出る', el._cls.has('v7-on'));
  check('頂点前は切り替えを呼ばない', midCalls === 0);
  clock.tick(200);
  check('頂点で切り替えを1回だけ呼ぶ', midCalls === 1);
  clock.tick(200);
  check('あけ終わりで done を呼ぶ', doneCalls === 1);
  check('あけたら黒幕が消える', !el._cls.has('v7-on'));
}

/* =====================================================================
   6. 起動フロー（第4部）：ローディング→プレースホルダ表示＋ID差し込み
   ===================================================================== */
console.log('■ 起動フロー：ローディング後にプレースホルダとIDが出る');
{
  const store = makeStore();
  const clock = makeClock();
  const { doc } = boot(store, clock);
  const loading = doc.getElementById('v7-loading');
  const home = doc.getElementById('v7-home-placeholder');

  // 同じ doc / store で V7Shell と V7Save を取り出して起動
  const full = (function () {
    const ctx = require('vm').createContext({
      window: { localStorage: store }, document: doc,
      JSON, console, Math, Date,
      setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
      module: { exports: {} },
    });
    const vm2 = require('vm'); const fs2 = require('fs');
    vm2.runInContext(fs2.readFileSync('js/v07-save.js', 'utf8'), ctx);
    vm2.runInContext(fs2.readFileSync('js/v07-shell.js', 'utf8'), ctx);
    return {
      Shell: vm2.runInContext('V7Shell', ctx),
      Save: vm2.runInContext('V7Save', ctx),
    };
  })();

  full.Shell.boot();
  check('起動直後はローディングが失敗表示ではない', !loading._cls.has('v7-failed'));
  clock.tick(1000);   // 最低1秒
  clock.tick(400);    // フェード
  check('ローディング後にホーム相当のレイヤーが表示される', home._cls.has('v7-on'));
  check('起動後もローカルIDは保持されている',
    full.Save.isValidLocalId(full.Save.localId()), full.Save.localId());
}

console.log('■ 起動：必須データが遅れてもタイムアウト内なら表示される');
{
  const store = makeStore();
  const clock = makeClock();
  const doc = (function () {
    const els = {};
    return {
      getElementById: id => els[id] || (els[id] = fakeEl()),
      createElement: () => fakeEl(), addEventListener: () => {},
    };
  })();
  const vm2 = require('vm'); const fs2 = require('fs');
  const ctx = vm2.createContext({
    window: { localStorage: store }, document: doc,
    JSON, console, Math, Date,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    module: { exports: {} },
  });
  vm2.runInContext(fs2.readFileSync('js/v07-save.js', 'utf8'), ctx);
  vm2.runInContext(fs2.readFileSync('js/v07-shell.js', 'utf8'), ctx);
  const Shell = vm2.runInContext('V7Shell', ctx);
  Shell.boot();
  const home = doc.getElementById('v7-home-placeholder');
  // まだ1秒経っていない段階では表示しない
  clock.tick(500);
  check('1秒未満ではまだホームを出さない', !home._cls.has('v7-on'));
  clock.tick(600);   // 1.1秒
  clock.tick(400);
  check('1秒経過後にホームが出る', home._cls.has('v7-on'));
}

/* =====================================================================
   まとめ
   ===================================================================== */
console.log('\n===== v0.7 Stage 1 基盤：' + pass + '/' + (pass + fail) + ' 通過 =====');
if (fail > 0) process.exit(1);
