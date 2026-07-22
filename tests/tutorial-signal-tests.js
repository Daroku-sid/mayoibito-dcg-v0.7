/* =====================================================================
   tutorial-signal-tests.js
   ―― 台本が待っている合図が、本当にその場面で届くか
   ---------------------------------------------------------------------
   v0.6.3 と v0.6.4 の進行不能は、どちらも同じ形でした。

     台本は「この合図が来たら次へ」と待っている。
     ところが、その合図は もっと前に出てしまっていた（v0.6.4）。
     あるいは そもそも出ない条件だった（v0.6.3）。

   どちらもエラーになりません。静かに止まるだけです。
   しかも通し検証は本物のルール処理を直接呼ぶので、
   画面まわりのこういう食い違いは通り抜けてしまいます。

   そこで、preview.js を「読んで」確かめます。
     ・台本が待つ合図が、本体のどこかで出ているか
     ・許可する操作が、本体のどこかで確認されているか
     ・合図が出る順番が、台本の並びと矛盾しないか
   ===================================================================== */
const fs = require('fs');

const previewSrc = fs.readFileSync('js/preview.js', 'utf8');
const actionsSrc = fs.readFileSync('js/tutorial-actions.js', 'utf8');
const ctrlSrc = fs.readFileSync('js/tutorial-controller.js', 'utf8');
const allSrc = previewSrc + actionsSrc + ctrlSrc;

const DATA = [
  ['基本編', require('../js/tutorial-basic-data.js').TutorialBasicData],
  ['実践編', require('../js/tutorial-advanced-data.js').TutorialAdvancedData],
];

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

/** 本体が出している合図を全部拾う */
function emittedSignals() {
  const out = new Set();
  const re = /TutorialActions\.notify\('([^']+)'/g;
  let m;
  while ((m = re.exec(allSrc))) out.add(m[1]);
  return out;
}

/** 本体が確認している操作を全部拾う */
function checkedActions() {
  const out = new Set();
  const re = /TutorialActions\.allow\('([^']+)'/g;
  let m;
  while ((m = re.exec(allSrc))) out.add(m[1]);
  return out;
}

console.log('■ ★台本が待つ合図を、本体が出している');
{
  const emitted = emittedSignals();
  /* 進行役が自分で面倒を見る合図（本体からは出ません） */
  const INTERNAL = ['pages', 'complete'];

  check('本体が出す合図を拾えた', emitted.size > 0,
    [...emitted].sort().join('、'));

  DATA.forEach(function (pair) {
    const label = pair[0];
    pair[1].steps.forEach(function (s) {
      [].concat(s.done || []).forEach(function (d) {
        if (INTERNAL.indexOf(d) !== -1) return;
        check(label + ' ' + s.id + '：合図「' + d + '」が出る',
          emitted.has(d), '出ない合図を待つと、そこで止まります');
      });
    });
  });
}

console.log('\n■ ★台本が許す操作を、本体が確認している');
{
  const checked = checkedActions();
  /* 進行役の中だけで判断する操作 */
  const INTERNAL = ['next', 'back'];

  /* ★わざと制御していない操作。
     フィールド効果の「発動する／発動しない」は、
     どちらを選んでも先へ進める作りです（行き止まりを作らないため）。
     台本の allow に書いてあるのは、何が起こりうるかを示すためです。 */
  const UNGATED = ['useField', 'skipField'];

  check('本体が確認する操作を拾えた', checked.size > 0,
    [...checked].sort().join('、'));

  DATA.forEach(function (pair) {
    const label = pair[0];
    pair[1].steps.forEach(function (s) {
      (s.allow || []).forEach(function (a) {
        if (INTERNAL.indexOf(a) !== -1) return;
        if (UNGATED.indexOf(a) !== -1) {
          check(label + ' ' + s.id + '：操作「' + a + '」はわざと制御しない',
            true, 'どちらを選んでも進めます');
          return;
        }
        check(label + ' ' + s.id + '：操作「' + a + '」を本体が見ている',
          checked.has(a), '見ていない操作は、許しても届きません');
      });
    });
  });
}

console.log('\n■ ★ターン終了の合図が、正しい場所で出る（v0.6.4の進行不能）');
{
  /* 「ターン終了」を押した瞬間に turnEnded を出していたため、
     確認ダイアログを待つステップが、先に出た合図を取り逃がしました。
     しかも確認で「戻る」を選んでも、終わったことにされていました。 */
  const i = previewSrc.indexOf('function endTurnFlow');
  const j = previewSrc.indexOf('function doEndTurn');
  const flow = previewSrc.slice(i, j);

  check('★押した瞬間に turnEnded を出していない',
    flow.indexOf("notify('turnEnded'") === -1,
    '確認で「戻る」を選べばターンは終わりません');

  const k = previewSrc.indexOf('function doEndTurn');
  const body = previewSrc.slice(k, k + 700);
  check('★実際に終わるところで turnEnded を出す',
    body.indexOf("notify('turnEnded'") !== -1);

  check('確認ダイアログの確定で confirmEndTurn が出る',
    /notify\('confirmEndTurn'[\s\S]{0,120}doEndTurn\(\)/.test(previewSrc));

  check('CPUの台本からは、あなたの操作の合図を出さない',
    /doEndTurn\(false\)/.test(previewSrc));
}

console.log('\n■ ★確認ダイアログを待つステップの組み立て');
{
  /* 警告を出すステップと、それを確定するステップは対になります。
     片方だけだと、そこで止まります。 */
  DATA.forEach(function (pair) {
    const label = pair[0];
    const steps = pair[1].steps;

    steps.forEach(function (s, i) {
      const dones = [].concat(s.done || []);
      if (dones.indexOf('endTurnWarning') === -1) return;

      const next = steps[i + 1];
      check(label + ' ' + s.id + '：警告のあとに確定のステップがある', !!next);
      if (!next) return;

      check(label + ' ' + next.id + '：確定の操作を許している',
        (next.allow || []).indexOf('confirmEndTurn') !== -1,
        (next.allow || []).join('、'));

      const nd = [].concat(next.done || []);
      check('★' + label + ' ' + next.id + '：確定のあとに届く合図を待っている',
        nd.indexOf('turnEnded') !== -1 || nd.indexOf('confirmEndTurn') !== -1,
        nd.join('、'));
    });
  });
}

console.log('\n■ ★説明を読み終えてから出すべきものが、そうなっている');
{
  /* 説明の裏で答えられると、ゲームだけ進んで
     チュートリアルが取り残されます（v0.5.5の教訓）。 */
  const gated = [
    ['ターン終了の確認', /notify\('endTurnWarning'[\s\S]{0,200}whenExplained/],
    ['カードを選ぶ画面', /pickCards:\s*function[\s\S]{0,300}whenExplained/],
  ];
  gated.forEach(function (g) {
    check('★' + g[0] + 'は、説明を読み終えてから出す', g[1].test(previewSrc));
  });
}

console.log('\n■ ★待っている合図を出せる操作が、ちゃんと許されている（v0.6.5）');
{
  /* v0.6.5 の進行不能は、追跡は選べるのに確定できない、というものでした。

     台本は「追跡が確定したら次へ」と待っているのに、
     許可した操作は「追跡を選ぶ」だけ。
     確定ボタンを押しても断られるので、永久に進めません。

     ここでは「その合図を出せる操作」を表にして、
     台本がそのどれかを許しているかを確かめます。 */
  const PRODUCED_BY = {
    pursuitSelected:  ['selectPursuit'],
    pursuitConfirmed: ['confirmPursuit'],
    cardPlayed:       ['playCard'],
    cardsPicked:      ['pickConfirm', 'pickCard'],
    endTurnWarning:   ['endTurn'],
    confirmEndTurn:   ['confirmEndTurn'],
    turnEnded:        ['endTurn', 'confirmEndTurn'],
    mulliganSelected: ['mulliganSelect'],
    mulliganDone:     ['mulliganConfirm'],
  };

  /* 相手の行動や演出で自然に出る合図。
     こちらの操作を待っているわけではありません。 */
  const AUTOMATIC = ['assaultDone', 'cpuScriptDone', 'gameOver',
                     'fieldUsed', 'fieldSkipped', 'pages', 'complete'];

  DATA.forEach(function (pair) {
    const label = pair[0];
    pair[1].steps.forEach(function (s) {
      [].concat(s.done || []).forEach(function (d) {
        if (AUTOMATIC.indexOf(d) !== -1) return;

        const producers = PRODUCED_BY[d];
        check(label + ' ' + s.id + '：合図「' + d + '」の出どころが分かっている',
          !!producers, producers ? '' : '★この表に足してください');
        if (!producers) return;

        const allow = s.allow || [];
        const canReach = producers.some(function (a) { return allow.indexOf(a) !== -1; });
        check('★' + label + ' ' + s.id + '：「' + d + '」を出せる操作を許している',
          canReach,
          canReach ? '' :
            '許しているのは ' + allow.join('、') + '／必要なのは ' + producers.join(' か '));
      });
    });
  });
}

console.log('\n' + (fail === 0
  ? '===== 合図の届き方：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
