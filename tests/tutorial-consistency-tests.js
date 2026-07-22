/* =====================================================================
   tutorial-consistency-tests.js
   ―― 説明文と、実際の画面の食い違いを見つける
   ---------------------------------------------------------------------
   v0.5.1 の実機確認で、次の食い違いが出ました。

     ・「入れ替える」を押すと書いたが、実際のボタンは「交換を確定」
     ・「使う」「使わない」と書いたが、実際は「発動する」「発動しない」
     ・光らせる先に、存在しない id を指していた（3か所）
     ・敗北条件を「3人ロスト」と書いたが、実際はフィールドごとの上限

   どれも、説明文を書いた本人（私）が確かめずに書いたものです。
   人が読んで気づくのを待つのではなく、機械で突き合わせます。

   ここで見るのは「台本の文章」と「実際の画面・実際のカードデータ」の
   一致だけです。進行そのものは tutorial-controller-tests.js が見ます。
   ===================================================================== */
const fs = require('fs');
const { loadGame } = require('./test-harness.js');
const G = loadGame('.');
const { TutorialBasicData: D } = require('../js/tutorial-basic-data.js');

const html = fs.readFileSync('index.html', 'utf8');
const previewSrc = fs.readFileSync('js/preview.js', 'utf8');

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

/** 台本の文章を全部集める */
function allText() {
  const out = [];
  D.steps.forEach(function (s) {
    if (s.guide) out.push({ id: s.id, where: '案内', text: s.guide });
    if (s.hint) out.push({ id: s.id, where: 'ヒント', text: s.hint });
    (s.pages || []).forEach(function (p) {
      out.push({ id: s.id, where: '説明', text: p.title + '\n' + p.text });
    });
    if (s.result) {
      out.push({ id: s.id, where: '結果', text: s.result.title + '\n' + s.result.text });
    }
    (s.cpuScript || []).forEach(function (a) {
      if (a.say) out.push({ id: s.id, where: 'CPU', text: a.say });
    });
  });
  return out;
}

console.log('■ ★文章が名前で呼ぶボタンが、実際に存在する');
{
  /* 「◯◯」で囲んだ短い語のうち、押す対象らしきものを拾って
     実際の画面の文言と突き合わせます。 */
  const uiWords = new Set();
  allText().forEach(function (t) {
    const re = /「([^」]{1,12})」/g;
    let m;
    while ((m = re.exec(t.text))) {
      // 「押す」の対象になっているものだけを見ます
      const after = t.text.slice(m.index + m[0].length, m.index + m[0].length + 6);
      if (/を?押|ボタン/.test(after)) uiWords.add(m[1]);
    }
  });

  // 画面に出る文言の一覧（HTMLに書いてあるもの＋その場で作るもの）
  const labels = (html + previewSrc);

  check('押すよう指示するボタン名を拾えた', uiWords.size > 0,
    [...uiWords].map(function (w) { return '「' + w + '」'; }).join(' '));

  uiWords.forEach(function (w) {
    // 「交換を確定 2枚」のように枚数が付く場合があるので、前半で照合します
    const core = w.replace(/\s*\d+枚$/, '');
    check('「' + core + '」というボタンが実在する',
      labels.indexOf("'" + core) !== -1 || labels.indexOf('>' + core) !== -1 ||
      labels.indexOf(core) !== -1);
  });
}

console.log('\n■ ★光らせる先が実在する');
{
  const ids = new Set();
  html.replace(/id="([^"]+)"/g, function (m, i) { ids.add(i); return m; });

  D.steps.forEach(function (s) {
    const h = s.highlight;
    if (!h) return;
    if (h.button) {
      check(s.id + '：ボタン「' + h.button + '」が実在する', ids.has(h.button));
    }
    if (h.zone) {
      check(s.id + '：エリア「' + h.zone + '」が実在する', ids.has(h.zone));
    }
    if (h.dialog) {
      check(s.id + '：ダイアログの指定が正しい',
        h.dialog === 'primary' || h.dialog === 'secondary', h.dialog);
    }
  });
}

console.log('\n■ ★カード名が実在する');
{
  const M = Array.isArray(G.CARD_MASTER) ? G.CARD_MASTER : Object.values(G.CARD_MASTER);
  const names = new Set(M.map(function (c) { return c.name; }));

  const used = new Set();
  allText().forEach(function (t) {
    const re = /《([^》]+)》/g;
    let m;
    while ((m = re.exec(t.text))) used.add(m[1]);
  });

  check('カード名を拾えた', used.size > 0, used.size + '種');
  used.forEach(function (n) {
    if (names.has(n)) { check('《' + n + '》が実在する', true); return; }

    /* 一度フルネームを出したあとは《エリーゼ》のように略します。
       略称そのものは自然な書き方なので認めますが、
       どのカードを指すのか一意に決まることは確かめます。
       二人に当てはまる略称は、読み手が取り違えます。 */
    const hits = [...names].filter(function (full) {
      return full.indexOf(n) !== -1;
    });
    check('《' + n + '》は略称で、指す先が一つに決まる',
      hits.length === 1, hits.join('／') || '★どのカードにも当てはまらない');
  });
}

console.log('\n■ ★数字がカードデータと合っている');
{
  const M = Array.isArray(G.CARD_MASTER) ? G.CARD_MASTER : Object.values(G.CARD_MASTER);
  const byName = {};
  M.forEach(function (c) { byName[c.name] = c; });

  /* 「スピード3・体力2」のような書き方を拾い、実データと照合します。
     v0.5.1 では、ここが合っていても敗北条件の説明が間違っていました。
     数字の裏取りは、書いたときではなく毎回やる必要があります。 */
  const shortOf = function (n) {
    if (byName[n]) return byName[n];
    const hits = Object.keys(byName).filter(function (f) { return f.indexOf(n) !== -1; });
    return hits.length === 1 ? byName[hits[0]] : null;
  };

  const pairs = [];
  allText().forEach(function (t) {
    /* 「《◯◯》はスピード3。」「《◯◯》がいます。スピード2・体力3。」など、
       書き方はいろいろです。1つの文章に出てくるカードが1種類のときに限り、
       そのカードの数字として照合します。 */
    const cards = [];
    const cre = /《([^》]+)》/g;
    let cm;
    while ((cm = cre.exec(t.text))) if (cards.indexOf(cm[1]) === -1) cards.push(cm[1]);
    if (cards.length !== 1) return;

    const re = /スピード(\d+)・体力(\d+)/g;
    let m;
    while ((m = re.exec(t.text))) {
      pairs.push({ id: t.id, name: cards[0], sp: +m[1], hp: +m[2] });
    }
  });

  check('数字の書かれた説明を拾えた', pairs.length > 0, pairs.length + '件');
  pairs.forEach(function (p) {
    const c = shortOf(p.name);
    check(p.name + ' のスピードと体力が合っている',
      !!c && c.speed === p.sp && c.hp === p.hp,
      c ? ('台本 SP' + p.sp + '/HP' + p.hp + '、実データ SP' + c.speed + '/HP' + c.hp) : '未登録');
  });
}

console.log('\n■ ★ロスト上限の説明が実データと合っている（v0.5.1の誤り）');
{
  const M = Array.isArray(G.CARD_MASTER) ? G.CARD_MASTER : Object.values(G.CARD_MASTER);
  const village = M.find(function (c) { return c.id === 'field_village'; });
  const mansion = M.find(function (c) { return c.id === 'field_mansion'; });

  const text = allText().map(function (t) { return t.text; }).join('\n');

  check('ヨマモリ村の上限は5', village.lostLimit === 5, String(village.lostLimit));
  check('黒薔薇の館の上限は4', mansion.lostLimit === 4, String(mansion.lostLimit));

  /* 「3人ロスト」という記述は、どのフィールドにも当てはまりません。
     v0.5.1 ではこれを敗北条件として説明していました。 */
  check('★「3人ロスト」と書いていない', text.indexOf('3人ロスト') === -1);
  check('★上限が5だと説明している',
    text.indexOf('5') !== -1 && text.indexOf('ヨマモリ村') !== -1);

  if (text.indexOf('ロスト上限') !== -1 || text.indexOf('上限') !== -1) {
    check('上限がフィールドごとに違うと説明している',
      text.indexOf('フィールド') !== -1);
  }
}

console.log('\n■ ★進行不能にならない（v0.5.1で踏んだ不具合）');
{
  /* 追跡を選んだあと、説明の「次へ」を押すと追跡が解除され、
     「追跡を確定」ボタンごと消えて詰みました。
     原因は、空白タップの判定にチュートリアルの表示が
     入っていなかったことです。 */
  check('★空白タップの判定にチュートリアルの表示が入っている',
    /#tut-panel/.test(previewSrc) && /#tut-guide/.test(previewSrc),
    '入っていないと、説明を押した指が追跡を解除します');

  check('★チュートリアル中は追跡を勝手に解除しない',
    /TutorialController\.active[\s\S]{0,200}closeQuickDetail/.test(previewSrc));

  /* 追跡を確定する場面では、選び直しも許しておきます。
     万一外れても、もう一度つなげば進めます。 */
  const confirmStep = D.steps.find(function (s) { return s.id === 'basic_confirm_pursuit'; });
  check('★追跡の確定場面では、選び直しもできる',
    confirmStep.allow.indexOf('selectPursuit') !== -1,
    confirmStep.allow.join('、'));
  check('選び直しの相手が指定されている',
    !!confirmStep.allowCards && !!confirmStep.allowTargets);
}

console.log('\n■ ★対戦から抜けるときの後片づけ（v0.5.3の不具合）');
{
  /* チュートリアルを終えたとき、対戦の後片づけを省いていました。
     対戦が動いたままメニューが開くので、
     設定ボタンなどが二重に反応しておかしな挙動になります。 */
  const runner = fs.readFileSync('js/tutorial-runner.js', 'utf8');

  check('★通常の帰り道（backToSetupScreen）を通す',
    /backToSetupScreen\(null\)/.test(previewSrc));
  check('★チュートリアル専用の出口が用意されている',
    /exitTutorialToMenu/.test(previewSrc));
  check('やめるときに、その出口を使う',
    /exitTutorialToMenu/.test(runner));
  check('CPUの台本も止める',
    /TutorialCpuDriver\.stop\(\)/.test(runner));

  /* クリアの保存先。get/set は「設定」の欄しか見ないので使えません。 */
  check('★クリアの保存に get/set を使っていない',
    !/SaveManager\.get\('tutorial'\)/.test(runner) &&
    !/SaveManager\.set\('tutorial'/.test(runner),
    'get/set は設定の欄だけを読み書きします');
  check('チュートリアルの枠を直接見ている',
    /SaveManager\.data\.tutorial/.test(runner));

  /* 実践編は基本編クリアで解放されると分かるようにします（仕様書 19.2） */
  /* v0.6 で実践編の中身ができたので、
     解放されたら見た目が変わるだけでなく、本当に押せるようになります。 */
  check('★クリアすると実践編の見た目が変わる',
    /menu__card--soon['"]?,\s*!basicCleared/.test(runner));
  check('★クリアすると実践編を本当に押せる',
    /adv\.disabled\s*=\s*!basicCleared/.test(runner),
    '解放されても押せないままでは意味がありません');
  check('実践編を始める入口がある', /startAdvanced:\s*function/.test(runner));
  check('実践編は基本編クリアが条件',
    /startAdvanced[\s\S]{0,200}isBasicCleared\(\)/.test(runner));
  check('選択画面を開くたびに表示を作り直す',
    /is-open['"]\)\)\s*self\.refreshSelectScreen/.test(runner) ||
    /MutationObserver/.test(runner));
}

console.log('\n■ ★表示が残り続けない（v0.5.4）');
{
  /* リタイアしたあとも案内メッセージが残っていました。
     出口ごとに片づけを書くと、必ずどれかで書き忘れます。
     対戦から抜ける唯一の出口 backToSetupScreen で片づけます。 */
  const uiSrc = fs.readFileSync('js/tutorial-ui.js', 'utf8');
  const htmlSrc = html;

  const exitFn = (previewSrc.match(/function backToSetupScreen[\s\S]{0,900}/) || [''])[0];
  check('★対戦を離れるときチュートリアルを止める',
    /TutorialController\.quit\(\)/.test(exitFn));
  check('★そのとき表示も片づける', /TutorialUI\.clear\(\)/.test(exitFn));
  check('CPUの台本も止める', /TutorialCpuDriver\.stop\(\)/.test(exitFn));

  check('★盤面を描くたびに、残っていないか見張る',
    /TutorialUI\.audit\(\)/.test(previewSrc));
  check('見張りの仕組みがある', /audit:\s*function/.test(uiSrc));

  /* ★チュートリアルの表示を新しく足したら、
     片づけと見張りの両方に入れる必要があります。
     ここが自動で確かめられないと、また残り続けます。 */
  const panels = [];
  htmlSrc.replace(/id="(tut-[a-z-]+)"/g, function (m, id) {
    if (panels.indexOf(id) === -1) panels.push(id);
    return m;
  });
  // ボタンなど、出しっぱなしにならないものは除きます
  const shown = panels.filter(function (id) {
    return ['tut-back', 'tut-next', 'tut-say-next',
            'tut-pick-basic', 'tut-pick-advanced'].indexOf(id) === -1;
  });
  check('チュートリアルの表示を拾えた', shown.length > 0, shown.join('、'));

  const auditFn = (uiSrc.match(/audit:\s*function[\s\S]{0,600}/) || [''])[0];
  const clearFn = (uiSrc.match(/clear:\s*function[\s\S]{0,600}/) || [''])[0];
  shown.forEach(function (id) {
    check('★「' + id + '」が見張りの対象に入っている',
      auditFn.indexOf(id) !== -1);
    check('「' + id + '」が片づけの対象に入っている',
      clearFn.indexOf(id) !== -1 ||
      // hidePanel / hideGuide / setDim が受け持つものは、そちらで消えます
      ['tut-panel', 'tut-guide', 'tut-dim'].indexOf(id) !== -1);
  });
}

console.log('\n■ ★相手の行動は、演出が終わってから説明する（v0.5.4）');
{
  const drvSrc = fs.readFileSync('js/tutorial-cpu-driver.js', 'utf8');

  /* 動かした直後に説明を出すと、カードが出てくる様子が
     説明ウィンドウに隠れて見えません。 */
  check('★演出の完了を待ってから説明する',
    /done\s*=\s*function/.test(drvSrc) && /ops\.play\(side[^)]*done\)/.test(drvSrc));
  check('登場は通常の一時公開の演出に乗せる',
    /CpuDriver\.reveal/.test(previewSrc));
  check('効果の解決も待つ',
    /CpuDriver\.reveal[\s\S]{0,400}runPendingEffects/.test(previewSrc));
  check('★説明は画面の下に出す（盤面を隠さない）',
    /showTutorialSay/.test(previewSrc) && /tut-say/.test(html));
}

console.log('\n■ ★断ったときに、ゲームだけ進まない（v0.5.5の進行不能）');
{
  /* showDialog は押した瞬間に閉じます。
     そのため「押されてから断る」やり方だと、
     ダイアログは閉じ、ゲームは進み、チュートリアルだけが取り残されます。
     フィールド効果でこれが起き、進行不能になりました。 */
  const dlg = (previewSrc.match(/confirmYesNo: function[\s\S]{0,1400}/) || [''])[0];

  check('★ダイアログは説明を読み終えてから出す',
    /whenExplained/.test(dlg),
    '説明の裏で答えられると取り残されます');
  check('★押されてから断っていない',
    !/allow\('skipField'[\s\S]{0,80}cb\(false\); return;/.test(dlg) &&
    !/allow\('useField'[\s\S]{0,80}cb\(false\); return;/.test(dlg));
  check('どちらを押しても知らせる',
    /notify\('fieldSkipped'/.test(dlg) && /notify\('fieldUsed'/.test(dlg));

  /* 断るときは、ゲームの状態を変えずに戻ることが条件です。
     allow の直後が return か、盤面を戻すだけであることを見ます。 */
  const gates = previewSrc.match(
    /if \(!TutorialActions\.allow\([^)]*\)\)[\s\S]{0,120}?return;/g) || [];
  check('操作を断る箇所を拾えた', gates.length >= 5, gates.length + '箇所');
  gates.forEach(function (g, i) {
    /* 断ったあとにしてよいのは「画面を描き直す」ことだけです。
       ゲームの状態を触る呼び出しが混ざっていたら、それは断れていません。 */
    const body = g.slice(g.indexOf('))') + 2);
    const touchesGame = /Game\.[a-zA-Z]+\(/.test(body);
    check('断り方' + (i + 1) + '：ゲームの状態を変えずに戻る',
      !touchesGame, body.replace(/\s+/g, ' ').slice(0, 60) || '（すぐ return）');
  });
}

console.log('\n■ ★対戦中メニューがチュートリアルの裏に隠れない（v0.5.5）');
{
  /* 対戦中メニュー（設定）は重ね順 174。
     チュートリアルの表示は 186〜189 なので、そのままでは下に隠れ、
     「押したのに何も起きない」ように見えます。 */
  const uiSrc = fs.readFileSync('js/tutorial-ui.js', 'utf8');

  check('★開くときに引っこめる',
    /openGameMenu[\s\S]{0,700}TutorialUI\.suspend\(\)/.test(previewSrc));
  check('★閉じたら戻す',
    /closeGameMenu[\s\S]{0,300}TutorialUI\.resume\(\)/.test(previewSrc));
  check('引っこめる仕組みがある', /suspend:\s*function/.test(uiSrc));
  check('戻す仕組みがある', /resume:\s*function/.test(uiSrc));
  check('引っこめている最中は見張りを止める',
    /_suspended\)\s*return false/.test(uiSrc),
    '止めないと、引っこめた表示を「残っている」と誤解します');
}

console.log('\n■ すべてのステップに、詰まったときの逃げ道がある');
{
  D.steps.forEach(function (s) {
    // 操作を求めるステップには、必ずヒントを用意します
    const needsHint = s.allow && s.allow.length > 0 &&
                      s.allow.indexOf('next') === -1;
    if (needsHint) {
      check(s.id + '：間違えたときのヒントがある', !!s.hint, s.hint || '★無い');
      check(s.id + '：何をすべきかの案内がある', !!s.guide, s.guide || '★無い');
    }
  });
}

console.log('\n' + (fail === 0
  ? '===== 説明文と画面の一致：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
