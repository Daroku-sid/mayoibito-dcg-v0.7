/* =====================================================================
   preview-smoke-tests.js
   ―― 画面まわりの処理を、実際に呼んで確かめる（v0.4.2 で追加）
   ---------------------------------------------------------------------
   これまでの点検は「ソースにこう書いてあるか」を見るものでした。
   それだと、書いてはあるが動かすと落ちる、という不具合を見逃します。

   実際に起きた例：
     syncFromGame の中で、存在しない変数 side を参照していた。
     文法は正しいので node --check は通り、
     ブラウザでは file:// のため「Script error.」としか出ず、
     対戦を始めた瞬間に落ちていた。

   ここでは最小限の偽DOMを用意して、画面の処理を実際に呼びます。
   ===================================================================== */
const fs = require('fs'), vm = require('vm');

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

/* --- 最小限の偽DOM --------------------------------------------------- */
function stubEl(tag) {
  const el = {
    tagName: tag || 'div',
    style: { setProperty: () => {}, removeProperty: () => {}, getPropertyValue: () => '' },
    dataset: {}, children: [],
    textContent: '', value: '', checked: false, disabled: false,
    offsetLeft: 0, offsetTop: 0, offsetWidth: 100, offsetHeight: 100, offsetParent: null,
    _cls: new Set(),
    classList: {
      add: c => el._cls.add(c), remove: c => el._cls.delete(c),
      toggle: (c, on) => { if (on === undefined) { el._cls.has(c) ? el._cls.delete(c) : el._cls.add(c); } else if (on) el._cls.add(c); else el._cls.delete(c); },
      contains: c => el._cls.has(c),
    },
    appendChild: c => { el.children.push(c); return c; },
    removeChild: () => {}, remove: () => {}, insertBefore: c => c,
    querySelector: () => stubEl(), querySelectorAll: () => [],
    addEventListener: () => {}, removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }),
    animate: () => ({ onfinish: null, cancel: () => {} }),
    closest: () => null, setAttribute: () => {}, getAttribute: () => null,
    focus: () => {}, isConnected: true, cloneNode: () => stubEl(tag),
  };
  /* ★innerHTML に空文字を入れたら、子要素も消えるようにします（v0.6.7）。
     本物のブラウザはそう動きます。
     消えないままだと、描き直しの検査が意味を持ちません
     （実際、グッズの下敷きの検査で古い要素が残りました）。 */
  let _html = '';
  Object.defineProperty(el, 'innerHTML', {
    get: () => _html,
    set: v => { _html = String(v); if (_html === '') el.children = []; },
  });

  Object.defineProperty(el, 'className', {
    get: () => Array.from(el._cls).join(' '),
    set: v => { el._cls = new Set(String(v).split(/\s+/).filter(Boolean)); },
  });
  return el;
}

function makeContext() {
  // 同じ id には同じ要素を返します。
  // 呼ぶたび別物を返すと、付けた印が次に読めません
  const byId = {};
  const doc = {
    getElementById: id => (byId[id] || (byId[id] = stubEl())),
    createElement: t => stubEl(t),
    createElementNS: (ns, t) => stubEl(t),
    createDocumentFragment: () => stubEl('fragment'),
    querySelector: () => stubEl(), querySelectorAll: () => [],
    addEventListener: () => {}, body: stubEl('body'), documentElement: stubEl('html'),
    elementFromPoint: () => null,
  };
  const ctx = vm.createContext({
    document: doc,
    window: { addEventListener: () => {}, localStorage: { getItem: () => null, setItem: () => {} },
              matchMedia: () => ({ matches: false }), innerWidth: 390, innerHeight: 844 },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    JSON, Date, Math, isFinite, String, Number, Array, Object, Set, Map,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    performance: { now: () => 0 }, requestAnimationFrame: () => 0,
    getComputedStyle: () => ({ getPropertyValue: () => '0' }),
    navigator: { userAgent: 'test' }, Image: function () {},
    AudioContext: function () {}, location: { href: 'file:///test' },
  });
  ctx.globalThis = ctx;

  const files = ['version.js', 'events.js', 'errors.js', 'save-manager.js', 'collection.js',
    'card-filter.js', 'cards.js', 'card-images.js', 'decks.js', 'random.js', 'effects.js',
    'game.js', 'ai-core.js', 'ai-heuristic.js', 'ai-deckstack.js', 'ai-player.js', 'ai-uiops.js',
    'cpu-driver.js', 'se.js', 'assets.js', 'howto.js', 'result.js', 'storage.js',
    'deck-validator.js', 'deck-manager.js', 'deck-list-ui.js', 'deck-editor-ui.js',
    'deck-picker-ui.js', 'card-list-ui.js', 'screens.js', 'preview.js'];

  files.forEach(function (f) {
    vm.runInContext(fs.readFileSync('js/' + f, 'utf8'), ctx, { filename: f });
  });
  return ctx;
}

function run(ctx, code) {
  return vm.runInContext(code, ctx);
}

console.log('■ 画面の処理がそろって読み込める');
let ctx = null;
{
  let err = null;
  try { ctx = makeContext(); } catch (e) { err = e; }
  check('31個のファイルが読み込める', !err, err ? err.message : '');
  if (!ctx) { console.log('読み込めないため以降を中止'); process.exit(1); }

  ['syncFromGame', 'renderFan', 'renderAll', 'setHandExpanded', 'handPointFor',
   'handRightPointFor', 'layoutRectOf', 'isHandFanVisible', 'isHandMoving',
   'isChoosingSomething', 'reaimFlyingCards', 'flyCardSequence'].forEach(function (name) {
    check('「' + name + '」がある', run(ctx, 'typeof ' + name) === 'function');
  });
}

console.log('\n■ 対戦を始めて、画面の処理を実際に呼ぶ');
{
  /* ★これが今回の不具合を捕まえるところ。
     syncFromGame の中で存在しない変数を参照していると、
     ここで ReferenceError になります。 */
  let err = null;
  try {
    run(ctx, `
      Game.start('village', 'SMOKE-1', { decks: { village: 'village', mansion: 'mansion' } });
      play.active = true;
      play.mode = 'start';
      play.handSnapshot = null;
      play.handSnapshotSide = null;
      // 配り演出を終えた状態にします（v0.6.7でこの印が要るようになりました）
      play.dealt = { village: true, mansion: true };
      syncFromGame();
    `);
  } catch (e) { err = e; }
  check('対戦開始 → syncFromGame が落ちない', !err, err ? err.message : '');
  check('自分の手札が読める', run(ctx, 'view.hand.length') === 5, run(ctx, 'view.hand.length') + '枚');
}

console.log('\n■ マリガン中の手札（v0.4.2 で直した不具合）');
{
  let err = null;
  try {
    // 自分の席の控え（配っている最中）
    run(ctx, `
      play.mode = 'mulligan';
      play.handSnapshot = [];
      play.handSnapshotSide = bottomSide();
      syncFromGame();
    `);
  } catch (e) { err = e; }
  check('自分のマリガン中も落ちない', !err, err ? err.message : '');
  check('配る前は0枚に見える', run(ctx, 'view.hand.length') === 0);

  /* ここからは「配り終えたあと」の話です。
     v0.4.1 と v0.6.7 で、正反対に見える2つの不具合を直しました。

       v0.4.1 … 相手のマリガン中に、自分の手札が消えてしまった
       v0.6.7 … 相手のマリガン中に、まだ配っていない自分の手札が見えていた

     見分けるのは「自分がもう配り終えたかどうか」です。
       配り終えている  → 相手のマリガン中でも見えたまま（v0.4.1）
       まだ配っていない → 見えない（v0.6.7） */
  err = null;
  try {
    run(ctx, `
      play.dealt = { village: true, mansion: true };   // 自分は配り終えた
      play.handSnapshot = [];
      play.handSnapshotSide = topSide();
      syncFromGame();
    `);
  } catch (e) { err = e; }
  check('相手のマリガン中も落ちない', !err, err ? err.message : '');
  check('★配り終えていれば、相手のマリガン中でも自分の手札は消えない',
    run(ctx, 'view.hand.length') === 5, run(ctx, 'view.hand.length') + '枚');

  /* ★v0.6.7：まだ配っていないなら、相手のマリガン中は見えない */
  run(ctx, `
    play.dealt = { mansion: true };      // 相手だけ済み。自分はまだ
    play.handSnapshot = [];
    play.handSnapshotSide = topSide();
    syncFromGame();
  `);
  check('★まだ配っていなければ、相手のマリガン中に手札は見えない',
    run(ctx, 'view.hand.length') === 0,
    run(ctx, 'view.hand.length') + '枚（後手のときに丸見えだった不具合）');

  // 後片づけ
  run(ctx, 'play.dealt = { village: true, mansion: true };');

  // 席の情報が無い古い形でも動く
  run(ctx, 'play.handSnapshot = []; play.handSnapshotSide = null; syncFromGame();');
  check('席の情報が無ければ今までどおり', run(ctx, 'view.hand.length') === 0);
}

console.log('\n■ 手札の開閉を実際に呼ぶ');
{
  run(ctx, 'play.mode = "main"; play.handSnapshot = null; play.handSnapshotSide = null; syncFromGame();');
  let err = null;
  try { run(ctx, 'setHandExpanded(true); setHandExpanded(false); setHandExpanded(true);'); }
  catch (e) { err = e; }
  check('開閉しても落ちない', !err, err ? err.message : '');
  check('状態が変わる', run(ctx, 'view.handExpanded') === true);

  err = null;
  try { run(ctx, 'handPointFor(bottomSide()); handRightPointFor(bottomSide()); layoutRectOf(document.getElementById("hand-fan"));'); }
  catch (e) { err = e; }
  check('着地点の計算が落ちない', !err, err ? err.message : '');

  const p = run(ctx, 'JSON.stringify(handPointFor(bottomSide()))');
  check('着地点が数値で返る', /"x":\s*-?\d/.test(p) && /"y":\s*-?\d/.test(p), p);

  err = null;
  try { run(ctx, 'reaimFlyingCards(); isChoosingSomething(); isHandMoving(); isHandFanVisible();'); }
  catch (e) { err = e; }
  check('向け直しと判定が落ちない', !err, err ? err.message : '');
}

console.log('\n■ 画面の切り替え（v0.4.5 の幕を通す）');
{
  /* 幕は setTimeout で中身を入れ替えます。
     このテストの setTimeout は何もしない代役なので、
     幕が使える状態だと画面が進みません。
     実際のブラウザでは進むことを、時計を進める代役で確かめます。 */
  const timers = [];
  run(ctx, 'Screens.stack = ["start"];');
  vm.runInContext('setTimeout = function (fn, ms) { __timers.push([fn, ms]); return 0; };', ctx);
  ctx.__timers = timers;

  run(ctx, 'Screens.go("mode");');
  check('幕が出ているあいだは、まだ画面が変わらない',
    run(ctx, 'Screens.current()') === 'start', run(ctx, 'Screens.current()'));
  check('幕に印が付く',
    run(ctx, 'document.getElementById("screen-wipe").classList.contains("is-forward")') === true);

  // 1段目：横切って覆う
  let t = timers.shift();
  check('横切る時間が速い', t[1] === 110, t[1] + 'ミリ秒');
  t[0]();
  check('覆ったところで画面が変わる',
    run(ctx, 'Screens.current()') === 'mode', run(ctx, 'Screens.current()'));
  check('この時点ではまだ抜け始めていない',
    run(ctx, 'document.getElementById("screen-wipe").classList.contains("is-out")') === false);

  // 2段目：真っ黒のまま保つ
  t = timers.shift();
  check('真っ黒を保つ時間がある', t[1] === 240, t[1] + 'ミリ秒');
  t[0]();
  check('保ったあとに抜け始める',
    run(ctx, 'document.getElementById("screen-wipe").classList.contains("is-out")') === true);

  // 3段目：抜けきる
  while (timers.length) { const x = timers.shift(); x[0](); }
  check('幕が片づく',
    run(ctx, 'document.getElementById("screen-wipe").classList.contains("is-on")') === false);

  run(ctx, 'Screens.back();');
  check('戻るときは逆向きの印が付く',
    run(ctx, 'document.getElementById("screen-wipe").classList.contains("is-back")') === true);
  while (timers.length) { const t = timers.shift(); t[0](); }
  check('戻れる', run(ctx, 'Screens.current()') === 'start', run(ctx, 'Screens.current()'));

  // 演出なしの道
  run(ctx, 'Screens.goNow("mode"); Screens.goNow("battle-mode");');
  check('演出なしなら すぐ進む', run(ctx, 'Screens.current()') === 'battle-mode');

  // 対戦へ入るときは幕を片づける
  run(ctx, 'Screens.close();');
  check('対戦へ入るとき幕が残らない',
    run(ctx, 'document.getElementById("screen-wipe").classList.contains("is-on")') === false);

  // どの行き来で幕を出すか（v0.4.7）
  const wipeCase = function (stack, to) {
    run(ctx, 'Screens.stack = ' + JSON.stringify(stack) + ';');
    return run(ctx, 'Screens.needsWipe(' + JSON.stringify(to) + ')');
  };
  check('モード選択 → 対戦モード は幕あり',
    wipeCase(['mode'], 'battle-mode') === true);
  check('カードのモード → デッキ一覧 は幕あり',
    wipeCase(['mode', 'card-mode'], 'deck-list') === true);
  check('★デッキ一覧 → デッキ確認 は幕なし',
    wipeCase(['mode', 'card-mode', 'deck-list'], 'deck-view') === false);
  check('★デッキ確認 → デッキ編成 は幕なし',
    wipeCase(['mode', 'card-mode', 'deck-list', 'deck-view'], 'deck-edit') === false);
  check('★デッキ編成 → フィールド選択 は幕なし',
    wipeCase(['mode', 'card-mode', 'deck-list', 'deck-view', 'deck-edit'], 'field-select') === false);
  check('★デッキ確認 → デッキ一覧（戻る）も幕なし',
    wipeCase(['mode', 'card-mode', 'deck-list', 'deck-view'], 'deck-list') === false);
  check('★対戦前のデッキ選択は幕なし',
    wipeCase(['mode', 'battle-mode', 'cpu-setup'], 'deck-pick') === false);
  check('★デッキ選択から戻るときも幕なし',
    wipeCase(['mode', 'battle-mode', 'cpu-setup', 'deck-pick'], 'cpu-setup') === false);
  check('カード一覧は幕あり（場所が変わるため）',
    wipeCase(['mode', 'card-mode'], 'card-list') === true);

  // 実際に go / back を呼んで、幕なしなら即座に変わることを確かめる
  run(ctx, 'Screens.stack = ["mode", "card-mode", "deck-list"];');
  run(ctx, 'Screens.go("deck-view");');
  check('幕なしの行き来は、その場で画面が変わる',
    run(ctx, 'Screens.current()') === 'deck-view', run(ctx, 'Screens.current()'));
  run(ctx, 'Screens.back();');
  check('戻るのも その場で変わる',
    run(ctx, 'Screens.current()') === 'deck-list', run(ctx, 'Screens.current()'));

  vm.runInContext('setTimeout = function () { return 0; };', ctx);
  run(ctx, 'Screens.stack = ["mode"];');
}

console.log('\n■ 対戦をやめたあとの後始末（v0.4.4）');
{
  // 対戦中の状態にしてから、やめる
  run(ctx, `
    play.active = true;
    play.mode = 'main';
    var sessionBefore = play.session;
  `);
  const before = run(ctx, 'play.session');

  // 予約された演出のかわりに、見張り付きの関数を作っておく
  run(ctx, 'var called = 0; var guarded = sessionGuard(function () { called += 1; });');
  run(ctx, 'guarded();');
  check('対戦中なら予約した処理は動く', run(ctx, 'called') === 1);

  let err = null;
  try { run(ctx, 'backToSetupScreen(null);'); } catch (e) { err = e; }
  check('やめる処理が落ちない', !err, err ? err.message : '');
  check('対戦中でなくなる', run(ctx, 'play.active') === false);
  check('通し番号が進む', run(ctx, 'play.session') === before + 1, before + ' → ' + run(ctx, 'play.session'));

  run(ctx, 'guarded();');
  check('★やめたあとは予約した処理が動かない', run(ctx, 'called') === 1,
    run(ctx, 'called') + '回');

  check('盤面を隠す印が付く',
    run(ctx, 'document.body.classList.contains("no-match")') === true);
  check('飛んでいるカードが片づく', run(ctx, 'flyingCards.length') === 0);

  // もう一度始めれば、また動く
  run(ctx, `
    Game.start('village', 'SMOKE-2', { decks: { village: 'village', mansion: 'mansion' } });
    play.session += 1; play.active = true; applyBoardVisibility();
    var guarded2 = sessionGuard(function () { called += 1; });
    guarded2();
  `);
  check('始め直せば また動く', run(ctx, 'called') === 2);
  check('盤面の印が外れる',
    run(ctx, 'document.body.classList.contains("no-match")') === false);
}

console.log('\n■ 盤面の描画を実際に呼ぶ');
{
  let err = null;
  try { run(ctx, 'renderAll();'); } catch (e) { err = e; }
  check('renderAll が落ちない', !err, err ? err.message : '');

  err = null;
  try { run(ctx, 'view.handExpanded = false; renderFan(); view.handExpanded = true; renderFan();'); }
  catch (e) { err = e; }
  check('renderFan が両方の状態で落ちない', !err, err ? err.message : '');
}

console.log('\n■ ★配り演出の前に手札が見えていないか（v0.6.7・全モード）');
{
  /* プレイヤーが後手のCPU対戦で、
     相手のマリガン中に自分の手札が丸見えでした。
     ほかのモードや条件でも起きていないか、実際に動かして確かめます。 */
  const cases = [
    ['CPU対戦・あなた先攻', "match.mode='cpu'; match.humanSide='village';", 'village', 'village'],
    ['CPU対戦・あなた後手', "match.mode='cpu'; match.humanSide='village';", 'mansion', 'village'],
    ['CPU対戦・席が逆で後手', "match.mode='cpu'; match.humanSide='mansion';", 'village', 'mansion'],
    ['ひとり回し・席1から', "match.mode='solo'; match.humanSide=null;", 'village', null],
    ['ひとり回し・席2から', "match.mode='solo'; match.humanSide=null;", 'mansion', null],
  ];

  cases.forEach(function (c) {
    const label = c[0], setup = c[1], firstSide = c[2];
    const ctx = makeContext();

    /* 対戦を始めて、先攻の席のマリガンに入った直後の状態を作ります。
       このとき、まだ誰にも配り演出をしていません。 */
    run(ctx, `
      Game.start('${firstSide}', 'DEAL-${firstSide}', { decks: { village: 'village', mansion: 'mansion' } });
      ${setup}
      play.active = true;
      play.dealt = {};
      play.mode = 'mulligan';
      play.mulliganSide = '${firstSide}';
      play.handSnapshot = [];
      play.handSnapshotSide = '${firstSide}';
      syncFromGame();
    `);

    const n = run(ctx, 'view.hand.length');
    check('★' + label + '：配る前に手札が見えていない', n === 0, n + '枚');
  });

  /* 配り終えたあとは、ちゃんと見えること（隠しすぎていないか） */
  cases.forEach(function (c) {
    const label = c[0], setup = c[1], firstSide = c[2];
    const ctx = makeContext();
    run(ctx, `
      Game.start('${firstSide}', 'DEAL2-${firstSide}', { decks: { village: 'village', mansion: 'mansion' } });
      ${setup}
      play.active = true;
      play.dealt = { village: true, mansion: true };
      play.mode = 'main';
      play.handSnapshot = null;
      play.handSnapshotSide = null;
      syncFromGame();
    `);
    const n = run(ctx, 'view.hand.length');
    check(label + '：配り終えたら見える', n === 5, n + '枚');
  });
}

console.log('\n■ ★グッズを下敷きにして見せる（v0.6.7）');
{
  /* 装備したグッズを、本体のカードの下に敷いて少しはみ出させます。
     どのカードにグッズが付いているか、一目で分かるようにするためです。 */
  const ctx = makeContext();
  run(ctx, `
    Game.start('village', 'GOODS-1', { decks: { village: 'village', mansion: 'mansion' } });
    play.active = true;
    play.dealt = { village: true, mansion: true };
    play.mode = 'main';
    play.handSnapshot = null;
    play.handSnapshotSide = null;
    syncFromGame();
  `);

  /* 場の人間にグッズを付けた状態を作ります */
  const madeOk = run(ctx, `
    (function () {
      const p = Game.state.players.village;
      const human = p.humans[0];
      if (!human) return 'no-human';
      const i = p.deck.findIndex(function (c) { return c.cardId === 'village_flashlight'; });
      if (i === -1) return 'no-goods';
      const goods = p.deck.splice(i, 1)[0];
      human.equippedGoods = goods;
      goods.equippedTo = human;
      syncFromGame();
      return 'ok';
    })()
  `);
  check('グッズを付けた状態を作れた', madeOk === 'ok', String(madeOk));

  const spec = run(ctx, 'JSON.stringify(!!(view.selfHuman[0] && view.selfHuman[0].goods))');
  check('★表示用の情報にグッズが載る', spec === 'true', spec);

  const gid = run(ctx, "view.selfHuman[0] && view.selfHuman[0].goods && view.selfHuman[0].goods.cardId");
  check('載っているのは付けたグッズ', gid === 'village_flashlight', String(gid));

  /* 実際に描いてみて、二枚重ねの入れものができるか */
  run(ctx, 'renderBoard();');
  const zone = run(ctx, "document.getElementById('self-normal-human')");
  const html = run(ctx, "(document.getElementById('self-normal-human').children || []).length");
  check('人間のエリアに何か描かれた', html >= 1, String(html));

  const cls = run(ctx, `
    (function () {
      const z = document.getElementById('self-normal-human');
      const kids = z.children || [];
      for (let i = 0; i < kids.length; i++) {
        if ((kids[i].className || '').indexOf('card-stack') !== -1) return 'stack';
      }
      return (kids[0] && kids[0].className) || 'none';
    })()
  `);
  check('★二枚重ねの入れものが作られる', cls === 'stack', String(cls));

  /* グッズが付いていないカードは、今までどおり1枚で描かれること */
  run(ctx, `
    (function () {
      const p = Game.state.players.village;
      p.humans.forEach(function (h) { h.equippedGoods = null; });
      syncFromGame();
      renderBoard();
    })()
  `);
  const cls2 = run(ctx, `
    (function () {
      const z = document.getElementById('self-normal-human');
      const kids = z.children || [];
      return (kids[0] && kids[0].className) || 'none';
    })()
  `);
  check('グッズが無ければ今までどおり1枚',
    String(cls2).indexOf('card-stack') === -1, String(cls2));
}

console.log('\n' + (fail === 0
  ? '===== 画面まわりの実動作：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
