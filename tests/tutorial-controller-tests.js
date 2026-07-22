/* =====================================================================
   tutorial-controller-tests.js
   ―― 進行管理の点検（画面を作らずに、台本を最後まで進める）
   ---------------------------------------------------------------------
   本物の画面のかわりに「言われたことを記録するだけの偽の画面」を
   差し込みます。こうすると、

     ・どの順で説明が出るか
     ・どこで操作待ちになるか
     ・許されない操作をちゃんと断るか
     ・警告を抑制できているか

   を、ブラウザなしで確かめられます。
   ===================================================================== */
const { TutorialController: TC } = require('../js/tutorial-controller.js');
const { TutorialBasicData: D, TUTORIAL_BASIC_CARDS: TB } =
  require('../js/tutorial-basic-data.js');

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

/** 言われたことを記録するだけの偽の画面 */
function makeFakeUI() {
  const log = [];
  return {
    log: log,
    pages: [], hints: [], guides: [],
    showPage: function (o) { log.push('page:' + o.title); this.pages.push(o); },
    showAction: function (o) { log.push('action:' + o.guide); this.guides.push(o); },
    showResult: function (o) { log.push('result:' + o.title); },
    showHint: function (t) { log.push('hint:' + t); this.hints.push(t); },
    showComplete: function () { log.push('complete'); },
    clear: function () { log.push('clear'); },
  };
}

console.log('■ 説明ページの送り');
{
  const ui = makeFakeUI();
  TC.begin(D, ui);
  check('チュートリアルが始まる', TC.active === true);
  check('最初のステップは basic_intro', TC.step().id === 'basic_intro', TC.step().id);
  check('説明中になっている', TC.phase === 'pages', TC.phase);
  check('1ページめが出た', ui.pages.length === 1, ui.pages[0].title);
  check('全3ページと伝えている', ui.pages[0].pageCount === 3, ui.pages[0].pageCount + 'ページ');
  check('1ページめでは戻れない', ui.pages[0].canBack === false);

  TC.nextPage();
  check('2ページめへ進んだ', TC.pageIndex === 1, ui.pages[1].title);
  check('2ページめでは戻れる', ui.pages[1].canBack === true);

  TC.prevPage();
  check('1ページめへ戻れる', TC.pageIndex === 0);

  TC.nextPage(); TC.nextPage(); TC.nextPage();
  check('最後まで送ると次のステップへ進む',
    TC.step().id === 'basic_mulligan_select', TC.step().id);
}

console.log('\n■ 進捗は章で見せる（内部のステップ数は見せない）');
{
  const ui = makeFakeUI();
  TC.begin(D, ui);
  check('章は全8つ', TC.chapterTotal() === 8, TC.chapterTotal() + '章');
  check('最初は1章め（マリガン）', TC.chapterNumber() === 1,
    TC.step().chapter + '＝' + TC.chapterNumber() + '章め');

  // 台本の全ステップの章が、章一覧に載っているか
  let allKnown = true;
  D.steps.forEach(function (s) {
    if (D.chapters.indexOf(s.chapter) === -1) allKnown = false;
  });
  check('全ステップの章が章一覧に載っている', allKnown);
}

console.log('\n■ ★許されない操作は断る');
{
  const ui = makeFakeUI();
  TC.begin(D, ui);
  // basic_intro の説明中
  check('説明中はカードを出せない', TC.allows('playCard', { cardId: TB.ichimatsu }) === false);
  check('説明中でも「次へ」は押せる', TC.allows('next') === true);

  // マリガン選択のステップまで進める
  TC.nextPage(); TC.nextPage(); TC.nextPage();   // basic_intro を抜ける
  TC.nextPage(); TC.nextPage(); TC.nextPage();   // basic_mulligan_select の説明を抜ける
  check('マリガン選択の操作待ちになった', TC.phase === 'action', TC.phase);
  check('案内文が出ている', ui.guides.length > 0, ui.guides[0] && ui.guides[0].guide);

  check('★指定のカードなら選べる（ヌシ様）',
    TC.allows('mulliganSelect', { cardId: TB.nushi }) === true);
  check('★指定のカードなら選べる（古いお札）',
    TC.allows('mulliganSelect', { cardId: TB.ofuda }) === true);
  check('★指定外のカードは選べない（市松人形）',
    TC.allows('mulliganSelect', { cardId: TB.ichimatsu }) === false);
  check('この場面ではカードを出せない',
    TC.allows('playCard', { cardId: TB.ichimatsu }) === false);
}

console.log('\n■ 誤操作のヒントは、続けて出しすぎない（仕様書 22.5）');
{
  const ui = makeFakeUI();
  TC.begin(D, ui);
  TC.nextPage(); TC.nextPage(); TC.nextPage();
  TC.nextPage(); TC.nextPage(); TC.nextPage();

  TC.reject();
  check('1回めのヒントが出る', ui.hints.length === 1, ui.hints[0]);
  TC.reject(); TC.reject(); TC.reject();
  check('★続けて呼んでも増えない', ui.hints.length === 1, ui.hints.length + '回');

  TC._lastHint = 0;   // 1.8秒経ったことにする
  TC.reject();
  check('時間が経てばまた出る', ui.hints.length === 2, ui.hints.length + '回');
}

console.log('\n■ 完了の合図');
{
  const ui = makeFakeUI();
  TC.begin(D, ui);
  TC.nextPage(); TC.nextPage(); TC.nextPage();
  TC.nextPage(); TC.nextPage(); TC.nextPage();

  check('違う合図では進まない', TC.notify('cardPlayed') === false);
  check('★指定の2枚を選べば進む',
    TC.notify('mulliganSelected', { cardIds: [TB.nushi, TB.ofuda] }) === true);
  check('次のステップへ移った',
    TC.step().id === 'basic_mulligan_confirm', TC.step().id);

  // 1枚だけでは進まないこと
  const ui2 = makeFakeUI();
  TC.begin(D, ui2);
  TC.nextPage(); TC.nextPage(); TC.nextPage();
  TC.nextPage(); TC.nextPage(); TC.nextPage();
  check('★1枚だけでは進まない',
    TC.notify('mulliganSelected', { cardIds: [TB.nushi] }) === false);
  check('★違うカードでは進まない',
    TC.notify('mulliganSelected', { cardIds: [TB.nushi, TB.ichimatsu] }) === false);
}

console.log('\n■ 通常警告の抑制（仕様書 24）');
{
  const ui = makeFakeUI();
  TC.begin(D, ui);
  check('既定では警告を抑制する', TC.showsWarning('playableCardWarning') === false);

  // 台本で hide と書いてある場面を探す
  const hideStep = D.steps.find(function (s) {
    return s.warnings && s.warnings.playableCardWarning === 'hide';
  });
  check('台本に抑制の指定がある', !!hideStep, hideStep && hideStep.id);

  // 基本編には show の指定が無いはず（仕様書 24：show は実践編だけ）
  const showStep = D.steps.find(function (s) {
    return s.warnings && (s.warnings.playableCardWarning === 'show' ||
                          s.warnings.noPursuitWarning === 'show');
  });
  check('★基本編には警告を出す場面が無い', !showStep, showStep ? showStep.id : 'なし');

  TC.quit();
  check('やめたあとは通常どおり警告が出る', TC.showsWarning('playableCardWarning') === true);
  check('やめたら操作制限もなくなる', TC.allows('playCard', { cardId: 'なんでも' }) === true);
}

console.log('\n■ CPU台本は1手ずつ取り出す（仕様書 20.4）');
{
  const ui = makeFakeUI();
  TC.begin(D, ui);
  // basic_cpu_turn_1 まで飛ばす
  TC.stepIndex = D.steps.findIndex(function (s) { return s.id === 'basic_cpu_turn_1'; });
  TC.enterStep();

  check('CPU台本のステップにいる', TC.step().id === 'basic_cpu_turn_1');
  check('台本は4手', TC.cpuScript().length === 4, TC.cpuScript().length + '手');
  check('まだ終わっていない', TC.cpuDone() === false);

  const a1 = TC.nextCpuAction();
  check('1手めはエマの登場', a1.action === 'play' && a1.cardId === TB.emma, a1.cardId);
  check('1手めに説明がついている', !!a1.say);

  const a2 = TC.nextCpuAction();
  check('2手めはキメラの登場', a2.action === 'play' && a2.cardId === TB.chimera, a2.cardId);

  const a3 = TC.nextCpuAction();
  check('3手めはスミレの追跡',
    a3.action === 'pursue' && a3.targetId === TB.sumire, a3.targetId);

  const a4 = TC.nextCpuAction();
  check('4手めは確定', a4.action === 'confirm', a4.action);
  check('★4手すべて終わった', TC.cpuDone() === true);
  check('それ以上は取り出せない', TC.nextCpuAction() === null);

  check('CPUの番はプレイヤーが操作できない',
    TC.allows('playCard', { cardId: TB.haruka }) === false);
}

console.log('\n■ ★台本を最初から最後まで進めきる');
{
  const ui = makeFakeUI();
  TC.begin(D, ui);

  /* 各ステップの done を、台本から読み取って順に送り込みます。
     これで「途中で進めなくなる箇所が無いか」が分かります。 */
  let guard = 0;
  const visited = [];

  while (!TC.finished && guard++ < 200) {
    const s = TC.step();
    if (!s) break;
    if (visited[visited.length - 1] !== s.id) visited.push(s.id);

    if (TC.phase === 'pages') { TC.nextPage(); continue; }
    if (TC.phase === 'result') { TC.finishStep(); continue; }

    if (TC.phase === 'action') {
      const payload = {};
      if (s.doneCards) payload.cardIds = s.doneCards.slice();
      if (s.doneCards && s.doneCards.length === 1) payload.cardId = s.doneCards[0];

      if (s.done === 'cpuScriptDone') {
        while (TC.nextCpuAction()) { /* 1手ずつ消化する */ }
      }
      // done は配列で書けます（どちらの答えでも進むステップがあります）
      const signal = Array.isArray(s.done) ? s.done[0] : s.done;
      const moved = TC.notify(signal, payload);
      if (!moved) {
        check('★' + s.id + ' で進めなくなった', false, '合図：' + signal);
        break;
      }
      continue;
    }
    break;
  }

  check('★最後まで到達した', TC.finished === true, TC.step() ? TC.step().id : '完了');
  check('全15ステップを通った', visited.length === D.steps.length,
    visited.length + '／' + D.steps.length);
  check('最後は basic_complete', visited[visited.length - 1] === 'basic_complete',
    visited[visited.length - 1]);
  check('クリア画面を出した', ui.log.indexOf('complete') !== -1);
  check('無限に回っていない', guard < 200, guard + '回');

  console.log('    通ったステップ：' + visited.join(' → '));
}

console.log('\n■ ★説明を読み終えるまで、盤面の進行を待たせる（v0.5.2）');
{
  /* 襲撃の説明を読んでいる裏で襲撃が終わってしまうと、
     読み終えた瞬間に結果だけが出ます。何が起きたのか分かりません。 */
  const ui = makeFakeUI();
  TC.begin(D, ui);

  let ran = false;
  TC.whenExplained(function () { ran = true; });
  check('★説明中は待たせる', ran === false, TC.phase);

  TC.nextPage(); TC.nextPage(); TC.nextPage();   // basic_intro を読み終える
  check('★読み終えたら動き出す', ran === true);

  /* 操作待ちの場面では、待たせずにその場で通します。
     襲撃のステップは、説明のあと操作待ちになります。 */
  TC.stepIndex = D.steps.findIndex(function (x) { return x.id === 'basic_assault_elise'; });
  TC.enterStep();
  TC.nextPage(); TC.nextPage();
  let ran2 = false;
  TC.whenExplained(function () { ran2 = true; });
  check('操作待ちの場面では待たせない', ran2 === true, TC.phase);

  // 止めても、待たせたままにしない
  const ui2 = makeFakeUI();
  TC.begin(D, ui2);
  let ran3 = false;
  TC.whenExplained(function () { ran3 = true; });
  TC.quit();
  check('★やめたときも待ちを解放する（盤面が止まらない）', ran3 === true);
}

console.log('\n■ ★襲撃のステップは、結果説明へ飛ばずに待つ（v0.5.2）');
{
  const ui = makeFakeUI();
  TC.begin(D, ui);
  TC.stepIndex = D.steps.findIndex(function (s) { return s.id === 'basic_assault_elise'; });
  TC.enterStep();

  check('説明から始まる', TC.phase === 'pages', TC.phase);
  TC.nextPage(); TC.nextPage();
  check('★読み終えても、いきなり結果を出さない', TC.phase === 'action', TC.phase);
  check('結果はまだ出ていない',
    ui.log.filter(function (l) { return l.indexOf('result:') === 0; }).length === 0);

  TC.notify('assaultDone', {});
  check('★襲撃が終わってから結果を出す', TC.phase === 'result', TC.phase);
  check('結果が出た',
    ui.log.filter(function (l) { return l.indexOf('result:') === 0; }).length === 1);
}

console.log('\n■ ★どちらを選んでも行き止まりにならない（v0.5.5）');
{
  /* フィールド効果は「発動する」「発動しない」のどちらを押しても
     先へ進まなければいけません。押し間違いで詰むのは論外です。 */
  ['basic_use_field', 'basic_skip_field'].forEach(function (id) {
    ['fieldUsed', 'fieldSkipped'].forEach(function (signal) {
      const ui = makeFakeUI();
      TC.begin(D, ui);
      TC.stepIndex = D.steps.findIndex(function (s) { return s.id === id; });
      TC.enterStep();
      while (TC.phase === 'pages') TC.nextPage();

      const before = TC.stepIndex;
      TC.notify(signal, {});
      check(id + ' で「' + signal + '」でも進む', TC.stepIndex > before,
        before + ' → ' + TC.stepIndex);
    });
  });

  // 台本の書き方そのものも確かめます
  D.steps.forEach(function (s) {
    if (!s.allow) return;
    const hasField = s.allow.indexOf('useField') !== -1 ||
                     s.allow.indexOf('skipField') !== -1;
    if (!hasField) return;
    check(s.id + '：両方の答えを受け付ける',
      Array.isArray(s.done) && s.done.length === 2, JSON.stringify(s.done));
    check(s.id + '：両方の操作を許している',
      s.allow.indexOf('useField') !== -1 && s.allow.indexOf('skipField') !== -1);
  });
}

console.log('\n■ 途中でやめられる');
{
  const ui = makeFakeUI();
  TC.begin(D, ui);
  TC.quit();
  check('止まっている', TC.active === false);
  check('画面を片づけた', ui.log.indexOf('clear') !== -1);
}

console.log('\n' + (fail === 0
  ? '===== チュートリアルの進行：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
