/* =====================================================================
   v07-a11y-tests.js ―― v0.7 Stage 5：読みやすさ・押しやすさの検査
   ---------------------------------------------------------------------
   仕様書 第3部 3.3（文字サイズ下限）・3.4（タップ領域）・
   第28.5（文字が下限未満にならない／タップ領域44〜48pxを維持）。

   画面を出さずに、CSS の値から実機での見え方を計算して確かめる。
     ・v0.7 側（--u 基準・clamp 指定）
     ・既存メニュー側（#stage を scale して表示）
   ===================================================================== */
const fs = require('fs');

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

const v07 = fs.readFileSync('css/v07.css', 'utf8');
const layout = fs.readFileSync('css/layout.css', 'utf8');

/* 仕様 3.3 の下限 */
const MIN = { caption: 12, body: 14, button: 15, panel: 16, title: 18 };
const TAP_MIN = 44;

/* =====================================================================
   1. v0.7 側：文字が --u 比例のままになっていないか
   ===================================================================== */
console.log('■ v0.7：文字サイズが実寸（clamp）で指定されている');
{
  // --u 比例の font-size が残っていると、実機で 7〜13px に潰れる
  const uFont = v07.match(/font-size:\s*calc\(\s*\d+\s*\*\s*var\(--u\)\s*\)/g) || [];
  check('--u 比例の font-size が残っていない', uFont.length === 0,
    uFont.length ? uFont.length + '件残っている' : '0件');

  // 用途別の変数が定義されている
  ['caption', 'body', 'button', 'panel', 'title'].forEach(function (k) {
    check('--v7-fs-' + k + ' が定義されている',
      new RegExp('--v7-fs-' + k + ':\\s*clamp\\(').test(v07));
  });
}

console.log('■ v0.7：clamp の下限が仕様の下限を満たす');
{
  // --v7-fs-xxx: clamp(下限px, ..., 上限px) の下限を読む
  const kinds = { caption: MIN.caption, body: MIN.body, button: MIN.button,
                  panel: MIN.panel, title: MIN.title };
  Object.keys(kinds).forEach(function (k) {
    const m = v07.match(new RegExp('--v7-fs-' + k + ':\\s*clamp\\(\\s*(\\d+(?:\\.\\d+)?)px'));
    const lo = m ? parseFloat(m[1]) : 0;
    check(k + ' の下限が ' + kinds[k] + 'px 以上', lo >= kinds[k], lo + 'px');
  });
}

console.log('■ v0.7：タップ領域の下限が敷かれている');
{
  check('--v7-tap-min が 44px 以上',
    /--v7-tap-min:\s*(\d+)px/.test(v07) && parseInt(RegExp.$1, 10) >= TAP_MIN,
    RegExp.$1 + 'px');
  check('メインナビの高さに下限が効いている',
    /\.v7-nav\s*\{[^}]*max\([^}]*var\(--v7-tap-min\)/.test(v07));
  check('個別画面の戻るボタンに下限が効いている',
    /\.v7-screen__back\s*\{[^}]*max\([^}]*var\(--v7-tap-min\)/.test(v07));
  check('パネル領域の下端がナビの実高さに追従している',
    /\.v7-panels\s*\{[^}]*var\(--v7-tap-min\)/.test(v07));
}

/* =====================================================================
   2. 既存メニュー側：#stage の縮小を踏まえた実寸
   ===================================================================== */
console.log('■ 既存メニュー：縮小後も文字が下限を満たす');
{
  /* #stage は 1080×1920 を scale(--fit) で表示する。
     --fit = min(幅/1080, 高さ/1920)。最小構成 320×568 が最も厳しい。 */
  const FIT_MIN = Math.min(320 / 1080, 568 / 1920);   // ≒ 0.2963

  // #start-screen 配下の上書き宣言を読み取る
  const rules = {};
  const re = /#start-screen\s+\.([\w-]+)\s*\{\s*font-size:\s*(\d+)px/g;
  let m;
  while ((m = re.exec(layout)) !== null) rules[m[1]] = parseInt(m[2], 10);

  check('#start-screen 配下の文字上書きがある', Object.keys(rules).length >= 40,
    Object.keys(rules).length + '件');

  // 代表的な要素が、320px 端末で下限を満たすか
  const cases = [
    ['menu__title',    MIN.title,  '画面タイトル'],
    ['listbar__title', MIN.title,  '一覧のタイトル'],
    ['menu__go',       MIN.button, '主要ボタン'],
    ['menu__back',     MIN.button, '戻るボタン'],
    ['menu__choice',   MIN.button, '選択肢ボタン'],
    ['menu__label',    MIN.body,   '設定ラベル'],
    ['menu__desc',     MIN.body,   '説明文'],
    ['menu__hint',     MIN.caption, '補足'],
    ['listbar__count', MIN.caption, '件数表示'],
  ];
  cases.forEach(function (c) {
    const raw = rules[c[0]];
    const real = raw ? raw * FIT_MIN : 0;
    check(c[2] + '（.' + c[0] + '）が ' + c[1] + 'px 以上',
      real >= c[1] - 0.05, raw ? (raw + 'px → 実機 ' + real.toFixed(1) + 'px') : '指定なし');
  });
}

console.log('■ 既存メニュー：タップ領域が44px以上');
{
  const FIT_MIN = Math.min(320 / 1080, 568 / 1920);
  const m = layout.match(/#start-screen\s*\{[^}]*--tap:\s*(\d+)px/);
  const tap = m ? parseInt(m[1], 10) : 0;
  check('#start-screen の --tap が定義されている', tap > 0, tap + 'px');
  check('--tap が 320px 端末で 44px 以上',
    tap * FIT_MIN >= TAP_MIN - 0.05,
    tap ? (tap + 'px → 実機 ' + (tap * FIT_MIN).toFixed(1) + 'px') : '未定義');
}

console.log('■ 既存メニュー：文字拡大による溢れ対策が入っている');
{
  check('選択肢が折り返せる（難易度5択の溢れ対策）',
    /#start-screen\s+\.menu__choices\s*\{[^}]*flex-wrap:\s*wrap/.test(layout));
  check('長い選択肢が改行できる（white-space を戻している）',
    /#start-screen\s+\.menu__choice--small\s*\{[^}]*white-space:\s*normal/.test(layout));
  check('一覧タイトルが省略表示になる',
    /#start-screen\s+\.listbar__title\s*\{[^}]*text-overflow:\s*ellipsis/.test(layout));
}

/* =====================================================================
   3. 盤面に手を出していないこと（第21部 21.3 の保護）
   ===================================================================== */
console.log('■ 保護：対戦盤面の指定に触れていない');
{
  // 追加した上書きはすべて #start-screen 配下に限定されているか
  const added = layout.split('v0.7 Stage 5：既存メニューの文字を読める大きさへ')[1] || '';
  const selectors = (added.match(/^[^@\s/][^{]*\{/gm) || [])
    .map(s => s.trim())
    .filter(s => s.length > 1);
  const outside = selectors.filter(s => s.indexOf('#start-screen') === -1);
  check('Stage 5 で足した指定はすべて #start-screen 配下',
    outside.length === 0,
    outside.length ? '配下でないもの: ' + outside.slice(0, 3).join(' / ') : '全件が配下');

  // 盤面のカード・ゾーンのクラスを触っていないこと
  ['.card ', '.zone', '.hand', '#stage {'].forEach(function (sel) {
    check('追加分に ' + sel.trim() + ' への指定がない', added.indexOf(sel) === -1);
  });
}

/* =====================================================================
   4. 第28.5 の残りの点検（画面を出さずに確かめられるもの）
   ===================================================================== */
console.log('■ ダイアログ：背後を操作できない／背景演出は続く（第16部 16.1）');
{
  // 暗幕が全面を覆い、既定の pointer-events で背後のタップを受け止める
  const scrim = v07.match(/\.v7-scrim\s*\{([^}]*)\}/);
  const body = scrim ? scrim[1] : '';
  check('暗幕が全面を覆う（inset:0）', /inset:\s*0/.test(body));
  check('暗幕がダイアログ層にある（z-index:70）', /z-index:\s*70/.test(body));
  check('暗幕は pointer-events:none になっていない',
    !/pointer-events:\s*none/.test(body));

  // ダイアログ側が背景演出（V7Art）を止めていないこと
  const shell = fs.readFileSync('js/v07-shell.js', 'utf8');
  const dialogPart = shell.split('const V7Dialog')[1] || '';
  check('ダイアログが背景一枚絵を止めていない（16.1）',
    dialogPart.indexOf('V7Art.pause') === -1);
}

console.log('■ 通知：1件ずつ順に出る（第16部 16.3）');
{
  const shell = fs.readFileSync('js/v07-shell.js', 'utf8');
  const toastPart = shell.split('const V7Toast')[1] || '';
  check('通知がキューで管理されている', /_queue/.test(toastPart));
  check('表示中フラグで重ならないようにしている',
    /_showing|_busy|_active/.test(toastPart));
}

console.log('■ 二重スクロールが起きない（第28.5）');
{
  // 個別画面は本文だけがスクロールする（ヘッダー固定・15.1）
  const screenBody = v07.match(/\.v7-screen__body\s*\{([^}]*)\}/);
  const sb = screenBody ? screenBody[1] : '';
  check('個別画面の本文がスクロール領域', /overflow-y:\s*auto/.test(sb));
  check('スクロールの連鎖を止めている（overscroll-behavior）',
    /overscroll-behavior:\s*contain/.test(sb));

  // 器そのものはスクロールしない
  const shellCss = v07.match(/\.v7-shell\s*\{([^}]*)\}/);
  check('9:16の器自体はスクロールしない',
    shellCss && /overflow:\s*hidden/.test(shellCss[1]));
}

console.log('■ 動きを減らす設定に対応（prefers-reduced-motion）');
{
  // コメント中の記述ではなく、実際のメディアクエリ本体を取り出す
  const m = v07.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/);
  const rm = m ? m[1] : '';
  check('reduced-motion のブロックがある', rm.length > 0);
  check('暗転が短縮される', /\.v7-wipe\s*\{[^}]*transition-duration/.test(rm));
  check('行き来の暗転も短縮される', /\.v7-xfade\s*\{[^}]*transition-duration/.test(rm));
  check('起動時のフェードも短縮される',
    /\.v7-loading--fade\s*\{[^}]*transition-duration/.test(rm));
}

console.log('■ 横向き・PC表示の切り分け（第18部 18.4）');
{
  check('スマホ横向きの案内がある（pointer:coarse で判定）',
    /@media\s*\(orientation:\s*landscape\)[^{]*pointer:\s*coarse/.test(v07));
  check('PC は最大480pxで中央に置く',
    /--v7-shell-max-w:\s*480px/.test(v07));
}

console.log('■ 高さ700px未満のコンパクト表示（第18部 18.2）');
{
  check('高さのメディアクエリがある', /@media\s*\(max-height:\s*699px\)/.test(v07));

  // メディアクエリの中身を取り出す（最後の1つ＝実装本体）
  const blocks = v07.match(/@media\s*\(max-height:\s*699px\)\s*\{([\s\S]*?)\n\}/g) || [];
  const body = blocks.map(b => b).join('\n');

  // 縮めるもの（18.2）
  check('上部プレイヤー情報を詰めている', /\.v7-profile\s*\{[^}]*height/.test(body));
  check('パネルとナビの間隔を詰めている', /\.v7-panels\s*\{[^}]*bottom/.test(body));
  check('ナビの内側余白を詰めている', /\.v7-nav__item\s*\{[^}]*gap/.test(body));

  // 維持するもの（18.2）：タップ下限と文字下限を崩していない
  check('コンパクトでもナビのタップ下限を保っている',
    /\.v7-panels\s*\{[^}]*var\(--v7-tap-min\)/.test(body));
  check('コンパクトで文字サイズを下げていない',
    !/--v7-fs-(caption|body|button|panel|title):/.test(body));
  check('コンパクトでタップ下限を下げていない',
    !/--v7-tap-min:\s*(\d+)px/.test(body) ||
    parseInt((body.match(/--v7-tap-min:\s*(\d+)px/) || [0, '44'])[1], 10) >= 44);
}

/* =====================================================================
   まとめ
   ===================================================================== */
console.log('\n===== v0.7 Stage 5 読みやすさ・押しやすさ：' + pass + '/' + (pass + fail) + ' 通過 =====');
if (fail > 0) process.exit(1);
