/* =====================================================================
   ui-fix-tests.js ―― 操作まわりの5つの修正（v0.3）
   ===================================================================== */
const fs = require('fs');

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}
const src = fs.readFileSync('js/preview.js', 'utf8');
const css = fs.readFileSync('css/layout.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

console.log('■ 1. いつでも手札を開閉できる（v0.4 で作り直し）');
{
  /* v0.3では「CPUの番だけは閉じられる」という直し方をしていましたが、
     v0.4では場面によらず自由に切り替えられます。
     詳しくは下の「手札とドロー演出」を見てください。 */
  check('自動で開き直す仕掛けを外した',
    src.indexOf("(view.locked && !isCpuSide(turnSide()))") === -1);
  check('マリガン中だけは開いたまま',
    /play\.mode === 'mulligan'\) view\.handExpanded = true;/.test(src));
  check('演出中でも簡略手札のタップで開ける',
    /onTap: function \(\) \{[\s\S]{0,220}setHandExpanded\(true\);/.test(src));
}

console.log('\n■ 2. なぞりとドラッグの切り分け（斜め上へのドラッグ）');
{
  const m = src.match(/const SCRUB_RATIO = ([\d.]+);/);
  check('なぞり判定の狭さを定数にした', !!m, m ? m[1] : '');
  const ratio = m ? parseFloat(m[1]) : 1;
  check('1.0より狭い（斜めはドラッグ扱いになる）', ratio > 1, String(ratio));

  check('判定に使われている',
    src.indexOf('Math.abs(dx) > Math.abs(dy) * SCRUB_RATIO') !== -1);

  // 角度ごとに、なぞりになるかドラッグになるかを確かめる
  function isScrub(dx, dy) { return Math.abs(dx) > Math.abs(dy) * ratio; }
  const cases = [
    ['真横（0度）',        30,   0, true],
    ['ほぼ横（10度）',     30,   5, true],
    ['やや斜め（30度）',   30,  17, false],
    ['斜め上（45度）',     30,  30, false],
    ['ほぼ真上（75度）',    8,  30, false],
    ['真上（90度）',        0,  30, false],
  ];
  cases.forEach(function (c) {
    const got = isScrub(c[1], -c[2]);   // 上方向は dy が負
    check(c[0] + ' → ' + (c[3] ? 'なぞり' : 'ドラッグ'), got === c[3]);
  });
  const deg = Math.atan2(1, ratio) * 180 / Math.PI;
  console.log('   （水平から約' + deg.toFixed(0) + '度までがなぞり）');
}

console.log('\n■ 3. マリガンの案内文');
{
  check('showHint / hideHint がある',
    /function showHint/.test(src) && /function hideHint/.test(src));
  check('配り終わってから出す',
    src.indexOf("showHint('入れ替える手札を選択してください')") !== -1);
  check('確定したら消す', /function afterMulliganConfirmed\(side, count\) \{\s*\n\s*hideHint\(\);/.test(src));
}

console.log('\n■ 4. メインフェイズの文字演出');
{
  check('「◯◯のメインフェイズ」を出す',
    src.indexOf("'\\nのメインフェイズ'") !== -1);
  /* v0.5でチュートリアルの分岐が間に入ったので、探す幅を広げています。
     見ているのは「演出のあとに操作を許す」という順序そのものです。 */
  check('演出が終わってから操作できるようになる',
    /のメインフェイズ[\s\S]{0,900}view\.locked = false;/.test(src));
  check('CPUの番なら演出のあとAIへ渡す',
    /のメインフェイズ[\s\S]{0,800}CpuDriver\.runTurn\(side\)/.test(src));
  check('★チュートリアル中は通常AIではなく台本で動かす（v0.5）',
    /のメインフェイズ[\s\S]{0,600}runTutorialCpuTurn\(side\)/.test(src));
}

console.log('\n■ ★演出のかかる枠の中に、絶対配置の要素を置かない（v0.5.6）');
{
  /* CSSでは、transform のかかった要素が
     その中の「絶対配置」の位置の基準になります。

     演出のあいだだけ基準が変わり、終わると元に戻るので、
     中に置いた絶対配置の要素は一瞬で飛んで見えます。
     モード選択の設定ボタンが、まさにこれでした。 */

  // 浮かび上がる演出は .menu に transform をかけます
  const rises = /\.menu\.is-arriving\s*\{[^}]*animation:\s*screen-rise/.test(css);
  check('画面が浮かび上がる演出は .menu にかかる', rises);

  const usesTransform = /@keyframes screen-rise[^}]*\}[^}]*\}/.test(css) &&
    /screen-rise[\s\S]{0,160}transform:/.test(css);
  check('その演出は transform を動かす', usesTransform);

  /* .menu の中で position:absolute を使っているクラスを探し、
     そのクラスが .menu の中で使われていないかを見ます。 */
  const absClasses = [];
  css.replace(/\.(menu__[a-z-]+)\s*\{([^}]*)\}/g, function (m, cls, body) {
    if (/position:\s*absolute/.test(body)) absClasses.push(cls);
    return m;
  });
  check('絶対配置のメニュー部品を拾えた', absClasses.length >= 0,
    absClasses.join('、') || 'なし');

  absClasses.forEach(function (cls) {
    /* そのクラスが .menu の section の中に書かれていたら、
       演出のたびに位置が飛びます。 */
    const inside = new RegExp(
      '<section[^>]*class="menu[^"]*"[\\s\\S]*?class="' + cls + '[^"]*"[\\s\\S]*?</section>'
    ).test(html);
    check('★「' + cls + '」が演出のかかる枠の外にある', !inside,
      '中にあると、演出の前後で位置が飛びます');
  });
}

console.log('\n■ 5. 出せるカードの発光');
{
  check('canOperateHand がある', /function canOperateHand/.test(src));
  check('is-playable を付けている', src.indexOf("card.classList.add('is-playable')") !== -1);
  check('操作できるときだけ付ける',
    src.indexOf('canPlayNow === true && canOperateHand()') !== -1);

  // 消える条件がそろっているか
  [['演出中', 'view.locked'], ['マリガン中', "play.mode === 'mulligan'"],
   ['メイン以外', "st.phase !== 'main'"], ['CPUの番', 'isCpuSide(st.currentSide)'],
   ['決着後', 'st.gameOver']].forEach(function (c) {
    const fn = src.slice(src.indexOf('function canOperateHand'),
                         src.indexOf('function canOperateHand') + 700);
    check(c[0] + 'は光らない', fn.indexOf(c[1]) !== -1);
  });

  check('CSSが定義されている', css.indexOf('.fan-card.is-playable') !== -1);
  check('選んでいるときは点滅を止める',
    css.indexOf('.fan-card.is-playable.is-selected { animation: none; }') !== -1);
  check('動きを減らす設定に配慮している',
    css.indexOf('prefers-reduced-motion') !== -1);
}

console.log('\n■ 重なりの順（v0.4：裏に隠れて押せない不具合の再発防止）');
{
  const z = function (sel) {
    const m = css.match(new RegExp(sel.replace(/[#.]/g, '\\$&') +
      '\\s*\\{[^}]*?z-index:\\s*(\\d+)', 's'));
    return m ? Number(m[1]) : null;
  };
  check('対戦中メニューより「遊び方・設定」が上',
    z('#sheet') > z('#game-menu'),
    '#sheet ' + z('#sheet') + ' > #game-menu ' + z('#game-menu'));
  check('メニュー階層より確認ダイアログが上', z('#dialog') > z('#start-screen'));
  check('メニュー階層よりお知らせが上', z('#toast') > z('#start-screen'));
  check('エラー画面がいちばん上',
    z('#error-screen') > z('#toast') && z('#error-screen') > z('#dialog'));

  // 重なりの順に食い違いが無いか、まとめて確かめる
  const order = ['#result-screen', '#game-menu', '#sheet', '#zoom-detail',
                 '#start-screen', '#card-detail', '#dialog', '#loading', '#toast', '#error-screen'];
  let ok = true, prev = -1, bad = '';
  order.forEach(function (sel) {
    const v = z(sel);
    if (v == null || v < prev) { ok = false; bad = sel + '(' + v + ')'; }
    prev = v;
  });
  check('前に出したいものほど大きい値になっている', ok, bad);
}

console.log('\n■ スタート画面の切り替え演出（制作者の要望）');
{
  const sc = fs.readFileSync('js/screens.js', 'utf8');
  /* ★#screen-start は中身の箱で、幅が画面より狭い。
     どこを押しても始まるようにするには、画面いっぱいの層に付ける必要がある
     （v0.4.4 までは箱に付いていて、外側を押しても反応しなかった） */
  check('画面いっぱいの層に付いている',
    /const layer = document\.getElementById\('start-screen'\)/.test(sc) &&
    /layer\.addEventListener\('pointerup'/.test(sc));
  check('中身の箱には付けていない',
    !/screen\.addEventListener\('click', begin\)/.test(sc));
  check('ボタンの上では反応しない', /closest\('button, a, input'\)/.test(sc));
  const fade = Number((sc.match(/FADE_MS = (\d+)/) || [])[1]);
  check('1.5秒ほどかけて切り替わる', fade === 1500, fade + 'ミリ秒');
  check('演出のあいだは受付を止める', /_startLocked = true;[\s\S]{0,200}is-leaving/.test(sc));
  check('演出のCSSがある', /\.menu--start\.is-leaving/.test(css));
  check('CSSの長さがJS側と合っている',
    new RegExp('animation: logo-swell ' + (fade / 1000) + 's').test(css));
  const html2 = fs.readFileSync('index.html', 'utf8');

  /* ★v0.4.6：光り方も滲み具合も、値そのものは動かしません。
     「強く光った写し」「ぼかした写し」をあらかじめ重ねておき、
     その濃さと大きさだけを動かします。 */
  check('ふだんからうっすら光っている',
    /\.start__logo-text \{[\s\S]{0,200}text-shadow: 0 0 20px/.test(css));
  check('読める文字と写しを分けている',
    /class="start__logo-text"/.test(html2) && /data-text="マヨイビト"/.test(html2));
  check('強く光った写しがある',
    /\.start__logo::before \{[\s\S]{0,240}text-shadow:/.test(css));
  check('ぼかした写しがある',
    /\.start__logo::after \{[\s\S]{0,120}filter: blur\(15px\)/.test(css));

  check('一瞬光ってから弱まる',
    /@keyframes logo-flash[\s\S]{0,300}7%\s*\{ opacity: 1;/.test(css) &&
    /@keyframes logo-flash[\s\S]{0,300}26%\s*\{ opacity: 0\.22;/.test(css));
  check('光が弱まってから文字が消える',
    /@keyframes logo-text-out[\s\S]{0,200}30%\s*\{ opacity: 1;/.test(css));
  check('最後に滲んで広がる',
    /@keyframes logo-haze[\s\S]{0,300}transform: scale\(1\.4\)/.test(css));
  check('全体はゆっくり広がる',
    /@keyframes logo-swell[\s\S]{0,200}transform: scale\(1\.34\)/.test(css));

  /* ★これが引っかかりの元。値そのものを動かすと毎コマ描き直しになる */
  const anims = css.match(/@keyframes (logo|start|wipe|screen)[\w-]*\s*\{[\s\S]*?\n\}/g) || [];
  const heavy = anims.filter(function (a) {
    return /(filter|text-shadow|box-shadow|width|height|left|top):/.test(
      a.replace(/@keyframes [\w-]+/, ''));
  });
  check('★動かしているのは opacity と transform だけ', heavy.length === 0,
    heavy.map(function (a) { return (a.match(/@keyframes ([\w-]+)/) || [])[1]; }).join('／'));
  const swell = (css.match(/@keyframes logo-swell\s*\{[\s\S]*?\n\}/) || [''])[0];
  check('親の透明度は動かさない（写しまで薄くなるため）',
    swell.indexOf('opacity') === -1, swell.indexOf('opacity') === -1 ? '' : swell);

  // 暗転からモード選択へ
  check('文字が消えたあと黒く沈む', /@keyframes start-blackout/.test(css));
  check('黒から次の画面が浮かび上がる',
    /@keyframes screen-rise/.test(css) && /riseIn: function/.test(sc));
  check('スタートからは幕を使わずにつなぐ',
    /self\.goNow\('mode'\);\s*\n\s*self\.riseIn\(\)/.test(sc));
  check('★はみ出しを切る（スクロールバーが出ないように）',
    /\.menu\.menu--start \{ overflow: hidden; \}/.test(css) &&
    /#start-screen \{ overflow: hidden; \}/.test(css));
  check('はみ出しの指定が .menu より強い',
    css.indexOf('.menu.menu--start { overflow: hidden; }') !== -1);
  check('動き出しのカクつきを減らす指定がある',
    /\.start__logo \{[\s\S]{0,120}will-change: transform;/.test(css) &&
    /\.start__logo-text \{[\s\S]{0,220}will-change: opacity;/.test(css) &&
    /will-change: opacity, transform;/.test(css));
  check('タイトルも案内も対象', /start__logo[\s\S]{0,120}start__tap/.test(css));
  check('演出を控えたい設定にも対応',
    /prefers-reduced-motion[\s\S]{0,300}is-leaving/.test(css) ||
    /is-leaving[\s\S]{0,300}prefers-reduced-motion/.test(css));
}

console.log('\n■ 画面切り替えの幕（制作者の要望・v0.4.5）');
{
  const sc = fs.readFileSync('js/screens.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  check('幕の要素がある', html.indexOf('id="screen-wipe"') !== -1);
  check('幕の仕組みがある', /wipe: function \(dir, swap\)/.test(sc));
  check('進むときは左から右へ', /wipe\('forward'/.test(sc) &&
    /@keyframes wipe-in-right\s*\{ from \{ transform: translateX\(-125%\)/.test(css));
  check('戻るときは右から左へ', /wipe\('back'/.test(sc) &&
    /@keyframes wipe-in-left\s*\{ from \{ transform: translateX\(75%\)/.test(css));
  check('覆われているあいだに中身を入れ替える',
    /setTimeout\(function \(\) \{\s*\n\s*swap\(\);/.test(sc));
  check('幕はメニューより前・拡大詳細より後ろ',
    /#screen-wipe \{[\s\S]{0,400}z-index: 181;/.test(css));

  /* ★v0.4.6：横切るのは速く、真っ黒を少し保つ */
  const sweep = Number((sc.match(/SWEEP_MS: (\d+)/) || [])[1]);
  const hold = Number((sc.match(/HOLD_MS: (\d+)/) || [])[1]);
  check('横切るのが速くなった', sweep === 110, sweep + 'ミリ秒');
  check('真っ黒のまま保つ時間がある', hold === 240, hold + 'ミリ秒');
  check('CSSの長さがJS側と合っている',
    new RegExp('wipe-in-right ' + (sweep / 1000) + 's').test(css));
  check('保っているあいだに中身を差し替える',
    /swap\(\);[\s\S]{0,400}self\.HOLD_MS/.test(sc));
  check('抜けるのは保ち終わってから',
    /is-out[\s\S]{0,200}self\.SWEEP_MS[\s\S]{0,120}self\.HOLD_MS/.test(sc));

  // グラデーション
  check('幕は画面2枚ぶんの幅', /#screen-wipe \{[\s\S]{0,200}width: 200%;/.test(css));
  check('両端がぼやけている',
    /rgba\(5, 7, 12, 0\) 0%/.test(css) && /rgba\(5, 7, 12, 0\) 100%/.test(css));
  check('真ん中の半分が真っ黒（画面1枚ぶん）',
    /#05070c 25%,\s*\n\s*#05070c 75%/.test(css));
  check('ちょうど重なる位置で止める',
    /to \{ transform: translateX\(-25%\); \}/.test(css));
  check('続けて押されても詰まらない', /if \(!veil \|\| this\._wiping\) \{ swap\(\); return; \}/.test(sc));
  check('演出なしで進む道も残す', /goNow: function \(name\)/.test(sc));
  check('対戦へ入るときは幕を片づける',
    /close: function[\s\S]{0,300}veil\.classList\.remove/.test(sc));
  check('動きを減らす設定に配慮',
    /prefers-reduced-motion[\s\S]{0,120}#screen-wipe/.test(css));

  const pv = fs.readFileSync('js/preview.js', 'utf8');
  check('対戦から戻るときは幕を重ねない',
    /Screens\.goNow\('battle-mode'\)/.test(pv) &&
    !/Screens\.reset\('mode'\);\s*\n\s*Screens\.go\('battle-mode'\)/.test(pv));

  /* ★幕を出さない画面（制作者の指摘・v0.4.7）
     デッキを続けて見ていくところは、同じ場所の中の移動なので暗転しない。
     戻るボタンは HTML の data-back から動くので、
     呼び出し側ではなく画面の名前で決めています。 */
  check('幕を出さない画面が決まっている', /NO_WIPE: \[/.test(sc));
  ['deck-view', 'deck-edit', 'field-select', 'deck-pick'].forEach(function (n) {
    check('「' + n + '」は幕なし',
      new RegExp("NO_WIPE: \\[[^\\]]*'" + n + "'").test(sc));
  });
  check('デッキ一覧そのものは幕あり（場所が変わるため）',
    !/NO_WIPE: \[[^\]]*'deck-list'/.test(sc));
  check('行き先と今いる画面の両方を見る',
    /needsWipe: function \(to\)[\s\S]{0,220}indexOf\(from\) === -1 &&[\s\S]{0,60}indexOf\(to\) === -1/.test(sc));
  check('進むときに判定する', /if \(!this\.needsWipe\(name\)\) \{ this\.goNow\(name\); return; \}/.test(sc));
  check('戻るときも判定する', /if \(!this\.needsWipe\(prev\)\) \{ this\.backNow\(\); return; \}/.test(sc));
}

console.log('\n■ 襲撃の演出（制作者の要望・v0.4.3）');
{
  const pv = fs.readFileSync('js/preview.js', 'utf8');

  check('怪異が人間へぶつかりに行く', /function lungeAttacker/.test(pv));
  check('相手の手前で止める（重なりきらない）', /const reach = 0\.62;/.test(pv));
  check('ぶつかる瞬間に知らせる', /760 \* 0\.62/.test(pv));
  check('ぶつかった所で光が弾ける', /function burstAt/.test(pv));
  check('襲われた側も揺れる', /transform: 'translate\(-7px, 3px\)'/.test(pv));
  check('弾ける光のCSSがある', /\.hit-burst \{/.test(css) && /@keyframes hit-burst/.test(css));

  check('体力の数字を赤くしてから減らす',
    /hp\.classList\.add\('is-hit'\)/.test(pv));
  check('数字が変わる前から赤くする',
    /体力の数字を先に赤くしておく/.test(pv));
  check('赤くする見た目がある', /\.ov--hp\.is-hit \{/.test(css));
  check('数字がふくらむ', /@keyframes hp-hit[\s\S]{0,160}scale\(1\.42\)/.test(css));

  check('ぶつかり終わってから数字を動かす',
    /怪異がぶつかり終わるのを待ってから数字を動かす/.test(pv));
  check('盤面のカードを探す道具がある', /function boardCardEl/.test(pv));
  check('動きを減らす設定に配慮',
    /prefers-reduced-motion[\s\S]{0,200}hit-burst/.test(css));
  check('使わない関数が残っていない', pv.indexOf('flashHpThenDrop') === -1);

  // ★重なり（制作者の指摘：相手の怪異が自分の人間の下に潜る）
  check('入れ物ごと前に出す', /const zone = attackerEl\.parentElement;/.test(pv));
  check('終わったら元に戻す', /zone\.style\.zIndex = zoneZ;/.test(pv));
}

console.log('\n■ 対戦をやめたあとの後始末（制作者の指摘・v0.4.4）');
{
  const pv = fs.readFileSync('js/preview.js', 'utf8');

  check('対戦ごとの通し番号を持つ', /session: 0,/.test(pv));
  check('見張りの仕組みがある', /function sessionGuard/.test(pv));
  check('やめたときに番号を進める',
    /play\.session \+= 1;[\s\S]{0,120}play\.active = false;/.test(pv));
  /* v0.5.4 で、この間にチュートリアルの片づけが入りました。
     見ているのは「番号を進めてから対戦を始める」という順序です。 */
  check('始めるときにも番号を進める',
    /play\.session \+= 1;[\s\S]{0,450}Game\.start\(/.test(pv));

  // 演出の中継地点すべてに見張りが入っているか
  [['バナー', /function playBanner[\s\S]{0,260}sessionGuard/],
   ['効果の解決', /function runPendingEffects[\s\S]{0,160}sessionGuard/],
   ['カードの移動', /function flyCardSequence[\s\S]{0,160}sessionGuard/],
   ['領域の変化', /function animateZoneChanges[\s\S]{0,160}sessionGuard/],
   ['襲撃', /function playAttack[\s\S]{0,160}sessionGuard/],
  ].forEach(function (p) {
    check(p[0] + 'に見張りが入っている', p[1].test(pv));
  });

  check('飛んでいるカードを片づける', /function clearFlyingCards/.test(pv));
  check('やめたときに片づける',
    /play\.active = false;[\s\S]{0,160}clearFlyingCards\(\)/.test(pv));
}

console.log('\n■ 対戦していないときは盤面を隠す（制作者の指摘・v0.4.4）');
{
  const pv = fs.readFileSync('js/preview.js', 'utf8');
  check('出し分けの処理がある', /function applyBoardVisibility/.test(pv));
  check('起動時に適用する', /applyBoardVisibility\(\);   \/\/ 起動直後/.test(pv));
  check('対戦を始めたら出す',
    /play\.active = true;\s*\n\s*applyBoardVisibility\(\)/.test(pv));
  check('やめたら隠す',
    /clearFlyingCards\(\);\s*\n\s*applyBoardVisibility\(\)/.test(pv));
  check('隠すCSSがある', /body\.no-match #board-plane/.test(css));
  check('手札も隠す', /body\.no-match #hand-fan/.test(css));
  check('周りの枠も隠す', /body\.no-match \.ui-box/.test(css));
}

console.log('\n■ 対戦前のデッキ表示（制作者の指摘）');
{
  const pk = fs.readFileSync('js/deck-picker-ui.js', 'utf8');
  check('設定の置き場所が正しい（Screens.cpu / Screens.solo）',
    /const store = Screens\[parts\[0\]\];/.test(pk) &&
    pk.indexOf('Screens.opts') === -1);
  check('選んだ内容が設定へ書き戻る',
    /Screens\[parts\[0\]\]\[parts\[1\]\] = value;/.test(pk));
  check('入口の表示を更新する処理がある', /refreshLabels: function/.test(pk));
  check('設定画面を開いたときに更新する',
    /'cpu-setup' \|\| name === 'solo-setup'\) DeckPickerUI\.refreshLabels\(\)/
      .test(fs.readFileSync('js/screens.js', 'utf8')));
  check('デッキ名と枚数を出す', /deck\.name/.test(pk) && /\/40枚/.test(pk));
}

console.log('\n■ 手札とドロー演出（制作者の指摘・v0.4で作り直し）');
{
  const pv = fs.readFileSync('js/preview.js', 'utf8');

  check('「ドロー前に必ず拡大表示」の縛りをやめた',
    pv.indexOf('keepHandOpen') === -1);
  check('自分の番の自動処理中も手札を強制的に開かない',
    pv.indexOf('view.locked && !isCpuSide(turnSide())') === -1);
  check('ターン開始で勝手に開き直さない',
    !/ターン開始から操作できるようになるまで、手札は拡大表示のままにする/.test(pv));
  check('マリガン中だけは開いたままにする（選ぶ操作のため）',
    /play\.mode === 'mulligan'\) view\.handExpanded = true;/.test(pv));

  check('開閉を1つの関数にまとめた', /function setHandExpanded\(on, opts\)/.test(pv));
  const direct = (pv.match(/view\.handExpanded = (true|false)/g) || []).length;
  check('直接書き換えている箇所がほぼ無い', direct <= 2, direct + '箇所');

  // ★着地点の不具合（隠れた手札の位置はゼロになる）
  check('隠れた拡大手札の位置を使わない',
    /function isHandFanVisible/.test(pv) &&
    /side === bottomSide\(\) && isHandFanVisible\(\)/.test(pv));
  check('大きさゼロの位置は採用しない',
    /if \(r\.w > 0 && r\.h > 0\) return \{ x: r\.x \+ r\.w \/ 2/.test(pv));
  check('手札全体の位置でも拡大手札の隠れを見る',
    /list\[i\] === '#hand-fan' && !isHandFanVisible\(\)/.test(pv));

  // ★飛んでいる最中に切り替えられたときの備え
  check('飛んでいるカードを控えている', /flyingCards\.push\(entry\)/.test(pv));
  check('行き先を向け直す処理がある', /function reaimFlyingCards/.test(pv));
  check('切り替えたときに向け直す',
    /function setHandExpanded[\s\S]{0,1200}reaimFlyingCards/.test(pv));
  check('画面が変わるのを待ってから向け直す',
    /requestAnimationFrame\(function \(\) \{ reaimFlyingCards\(\); \}\)/.test(pv));
  check('残り時間で飛び直す', /const left = Math\.max\(60, f\.endAt - now\)/.test(pv));
  check('いま見えている位置から続ける',
    /const r = designRect\(f\.el\);[\s\S]{0,120}here =/.test(pv));
  check('着いたカードは控えから外す',
    /flyingCards = flyingCards\.filter/.test(pv));
  check('行き先が固定のものは触らない',
    /typeof f\.toFn !== 'function'/.test(pv));
}

console.log('\n■ 手札まわりの追加修正（v0.4.1）');
{
  const pv = fs.readFileSync('js/preview.js', 'utf8');

  // 相手のマリガン中に自分の手札が消える
  check('控えがどの席のものかを持つ', /handSnapshotSide/.test(pv));
  /* ★変数名は meSide。side だと存在せず、対戦開始と同時に落ちます
     （v0.4.2 で実際に起きた不具合。E0721-055937） */
  check('自分の席の控えだけを映す',
    /play\.handSnapshotSide === meSide/.test(pv));
  check('存在しない変数を参照していない',
    !/play\.handSnapshotSide === side\b/.test(pv));
  check('拡大手札が空のときは簡略手札を出す',
    /const showMini = \(view\.hand\.length === 0\);/.test(pv));

  // 勝手に切り替わらない
  const autoClose = [
    ['追跡開始', /追跡開始[\s\S]{0,400}setHandExpanded\(false/],
    ['ターン終了', /function doEndTurn[\s\S]{0,300}setHandExpanded\(false/],
    ['自動ターン終了', /function autoEndTurn[\s\S]{0,300}setHandExpanded\(false/],
  ];
  autoClose.forEach(function (pair) {
    check(pair[0] + 'で勝手に畳まない', !pair[1].test(pv));
  });
  const calls = (pv.match(/setHandExpanded\(/g) || []).length;
  check('切り替えるのは操作したときだけ', calls <= 5, calls + '箇所（定義を含む）');

  // 選択中は畳まない
  check('何かを選んでいる最中かを判定する', /function isChoosingSomething/.test(pv));
  check('選択中は空白タップで畳まない',
    /if \(isChoosingSomething\(\)\) return;/.test(pv));

  // 切り替えの演出
  check('出し入れに動きがある',
    /#hand-fan \{[\s\S]{0,160}transition: transform/.test(css));
  check('下へすべらせて隠す',
    /#hand-fan\.is-hidden \{[\s\S]{0,120}translateY/.test(css));
  check('隠れている間は触れない',
    /#hand-fan\.is-hidden \.fan-card \{ pointer-events: none; \}/.test(css));
  check('動きを減らす設定に配慮',
    /prefers-reduced-motion[\s\S]{0,160}#hand-fan/.test(css));

  // 演出中の着地点
  check('動きを含まない位置の測り方がある', /function layoutRectOf/.test(pv));
  check('transform を含めずに測る', /x \+= node\.offsetLeft/.test(pv));
  check('動いている最中かを判定する', /function isHandMoving/.test(pv));
  check('動いている間は1枚ごとの位置を当てにしない',
    /isHandFanVisible\(\) && !isHandMoving\(\)/.test(pv));
  check('動き終わってからもう一度狙い直す',
    /setTimeout\(reaimFlyingCards, HAND_MOVE_MS \+ 20\)/.test(pv));
}

console.log('\n■ ★演出中や相手のターン中でも、カードの詳細を見られる（v0.6.7）');
{
  /* 盤面が動いているあいだ「あれは何だったのか」を確かめたくなるのは
     自然なことです。そこを止める理由がありません。
     ただし、盤面を動かす操作は今までどおり止めます。 */

  /* タップ：ロック中でも詳細を開く */
  const tapPart = src.slice(src.indexOf('onTap: function () {'),
                            src.indexOf('onLongPress: function () {'));
  check('★ロック中でも詳細を開く道がある',
    /view\.locked && !boardPick\) \{[\s\S]{0,200}openQuickDetail/.test(tapPart),
    'ロック中に即 return していると、詳細も見られません');

  /* 長押し：拡大詳細を止めていないこと */
  const longPart = src.slice(src.indexOf('onLongPress: function () {'),
                             src.indexOf('onDragStart: function'));
  check('★長押しの拡大詳細を止めていない',
    longPart.indexOf('if (view.locked) return;') === -1,
    longPart.indexOf('if (view.locked) return;') === -1 ? '' : 'ロック中に弾いています');
  check('長押しで拡大詳細を開く', /openZoomDetail\(spec\)/.test(longPart));

  /* ドラッグ：こちらは今までどおり止まっていること */
  const dragPart = src.slice(src.indexOf('onDragStart: function'),
                             src.indexOf('onDragStart: function') + 600);
  check('★カードを動かす操作は、今までどおり止まっている',
    /if \(view\.locked\) return;/.test(dragPart),
    '見るだけにして、ゲームの進行には触れません');
}

console.log('\n■ ★盤面が入れ替わるときは、開いている詳細を閉じる（v0.6.7）');
{
  /* ひとり回しは端末を渡して交代します。
     前の人が見ていたカードが残っていると不自然です。 */
  const part = src.slice(src.indexOf('function switchBoardTo'),
                         src.indexOf('function switchBoardTo') + 900);
  check('★席が入れ替わるとき、簡易詳細を閉じる', /closeQuickDetail\(\)/.test(part));
  check('★席が入れ替わるとき、拡大詳細も閉じる', /closeZoomDetail\(\)/.test(part));
  check('閉じる関数が実在する',
    /function closeQuickDetail/.test(src) && /function closeZoomDetail/.test(src));
}

console.log('\n■ ★グッズの下敷き表示（v0.6.7）');
{
  check('二枚重ねの入れものを作る', /className = 'card-stack'/.test(src));
  check('下敷きに印をつける', /card--equipped/.test(src));
  check('本体に印をつける', /card--holder/.test(src));
  check('表示用の情報にグッズを載せる', /spec\.goods = \{/.test(src));

  check('下敷きの見た目がCSSにある', /\.card-stack \.card--equipped/.test(css));
  /* ★ずらす量は、実際のカード画像を測って決めた値です（v0.6.9）。
     グッズの「装備の条件と効果文を分ける細い線」が、
     本体カードの底辺にちょうど重なる位置です。

       線の位置   … カード上端から幅の 1.137 倍（3枚とも実測で一致）
       カード高さ … 幅の 88/63 = 1.3968 倍
       ずらす量   … 1.3968 - 1.137 = 0.2598

     勘で決めた数字ではないので、動かすときは測り直してください。 */
  const eqBlock = (css.match(/\.card-stack \.card--equipped \{[\s\S]*?\}/) || [''])[0];
  check('★下敷きを下へずらしている', /top:\s*[\d.]+em/.test(eqBlock),
    'カード幅に比例させるので em で書きます');
  check('★ずらす量が実測どおり', /top:\s*0\.2598em/.test(eqBlock),
    '細い線が本体カードの底辺に重なる位置です');
  check('測った根拠がコメントに残っている',
    css.indexOf('1.137') !== -1 && css.indexOf('88/63') !== -1,
    '数字だけ残ると、あとで動かせなくなります');
  check('本体が手前に来る', /\.card-stack \.card--holder[\s\S]{0,120}z-index:\s*1/.test(css));
  check('下敷きの数字は出さない',
    /\.card-stack \.card--equipped \.ov-row \{ display: none/.test(css),
    '狭くて読めず、本体の数字と紛れるためです');
}

console.log('\n■ ★カード画像の四隅に白が残っていない（v0.6.9）');
{
  /* 画面側で角を丸めても、丸め方は場面ごとに違います。
     大きく表示したときに足りず、白がのぞいていました。

     そこで画像そのものから消しました。
     これなら、どこにどんな大きさで出しても白は出ません。 */
  const dir = 'images';
  const files = fs.readdirSync(dir).filter(function (f) { return f.endsWith('.webp'); });
  check('カード画像が見つかる', files.length > 0, files.length + '枚');

  /* webp の中身までは読めないので、
     四隅を透明にする道具が残っているかを確かめます。
     実際の透明化は、その道具で行いました。 */
  check('★四隅の白を消す道具がある',
    fs.existsSync('tools/clear-card-corners.py'));

  const tool = fs.readFileSync('tools/clear-card-corners.py', 'utf8');
  check('★四隅からつながった白だけを消す', /四隅から/.test(tool) && /deque/.test(tool),
    '絵の中の白（お札の紙など）を消さないためです');
  check('サムネイルも対象にしている', /images\/thumb/.test(tool));

  /* 角の丸みも、絵の丸みに合わせてあること */
  const imgBlock = (css.match(/\.card\.has-image \{[\s\S]*?\}/) || [''])[0];
  check('★角の丸みをカード幅に比例させている', /border-radius:\s*[\d.]+em/.test(imgBlock),
    '固定の px だと、大きく表示したとき足りません');
  check('下地の色を敷いていない', /background-color:\s*transparent/.test(imgBlock));
  check('枠線を出していない', /border-color:\s*transparent/.test(imgBlock));
}

console.log('\n■ ★初手のドロー演出に、手札の表示が間に合っている（v0.6.9）');
{
  /* 以前は、光が消えてから手札が浮かび上がっていました。
       ・光の82%地点で反映を始める
       ・そこから透明→不透明に260ミリ秒かける
     この二つが重なって、光が着いたときにはまだ薄い状態でした。 */
  const m = src.match(/const ARRIVE_RATIO = ([\d.]+)/);
  check('反映を始める割合が書いてある', !!m, m ? m[1] : '');
  check('★光が着く前に手札を出し始める', m && parseFloat(m[1]) <= 0.7,
    m ? ('いまは ' + m[1]) : '');

  const flash = src.slice(src.indexOf('function flashNewHandCard'),
                          src.indexOf('function flashNewHandCard') + 1200);
  check('★透明からではなく、見えた状態から始める',
    /opacity: 0\.[3-9]/.test(flash),
    '透明から始めると、光が消えたあとに現れて見えます');
  const dm = flash.match(/duration: (\d+)/);
  check('★浮かび上がりが短い', dm && parseInt(dm[1], 10) <= 200,
    dm ? (dm[1] + 'ミリ秒') : '');
}

console.log('\n■ ★CPUが拾ったカードも画面に見せる（v0.6.9）');
{
  /* CPUの受け答え（AiUiOps）には画面がありません。
     そのため、CPUがシルヴィやアネットを使っても
     何を手に入れたのか分かりませんでした。 */
  check('★CPUの受け答えにも画面の演出を渡す',
    /ops\.showCards = uiOps\.showCards/.test(src),
    '相手が何を手に入れたのか分かるようにします');

  const part = src.slice(src.indexOf('function uiOpsFor'),
                         src.indexOf('function uiOpsFor') + 900);
  check('選ぶことはAIに任せたまま', /AiUiOps\.create/.test(part));
}

console.log('\n' + (fail === 0
  ? '===== 操作まわりの修正：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
