/* =====================================================================
   tutorial-advanced-script-tests.js
   ―― 実践編の台本が、本当に最後まで通るかを確かめる
   ---------------------------------------------------------------------
   基本編の tutorial-script-tests.js と同じ考え方です。

   台本は「懐中電灯をハルカに付けましょう」と指示します。
   でも、そのとき気力が足りなければ付けられません。
   「シルヴィを追跡しましょう」と言っても、
   シルヴィがすでにいなければ指定できません。

   説明文と盤面が食い違うと、そこで詰みます。
   画面を作ってから触って気づくのでは遅すぎます。

   そこで、画面をいっさい作らずに、本物のルール処理だけを使って
   27ステップを最初から最後まで実際に演じさせます。

   ★実践編は対戦の途中から始まるので、まず盤面を組み立てます。
   ===================================================================== */
const { loadGame } = require('./test-harness.js');
const G = loadGame('.');
const { TutorialDeck } = require('../js/tutorial-deck.js');
const { TutorialAdvancedData: D, TUTORIAL_ADV_CARDS: TA } =
  require('../js/tutorial-advanced-data.js');
global.Game = G.Game;
const Game = G.Game;

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

/* --- 盤面から目当てのカードを探す小道具 --- */
function inHand(side, cardId) {
  return Game.state.players[side].hand.find(function (c) { return c.cardId === cardId; });
}
function onBoard(side, cardId) {
  const p = Game.state.players[side];
  return p.youkai.concat(p.humans).find(function (c) { return c.cardId === cardId; });
}
function names(list) {
  return list.map(function (c) { return c.master.name; }).join('、') || '（なし）';
}

/* 保留中の効果を片づける。
   選ぶ場面では、台本が指したカードを選びます。 */
function drainPending(pickIds) {
  const want = pickIds || [];
  let guard = 0;
  while (guard++ < 30) {
    const item = Game.takeNextPending();
    if (!item) break;
    const ops = {
      confirmYesNo: function (t, m, cb) { cb(false); },
      pickCards: function (o, cb) {
        const cands = o.candidates || o.cards || [];
        // 台本が指したカードがあれば、それを選びます
        const hit = cands.filter(function (c) { return want.indexOf(c.cardId) !== -1; });
        cb(hit.length ? hit.slice(0, o.count || 1) : cands.slice(0, o.count || 1));
      },
      pickBoardTarget: function (o, cb) { cb((o.candidates || [])[0] || null); },
    };
    let done = false;
    Game.runEffect(item, ops, function () { done = true; });
    if (!done) break;
  }
}

/** 山札のいちばん上に、指定のカードを積む */
function stackTop(side, cardIds) {
  return TutorialDeck.stackTop(side, cardIds);
}

/* ★相手の手札の用意は、台本の setup から取ります（v0.6.6）。
   テストが独自に用意していたため、
   「台本に書き忘れている」ことに気づけませんでした。
   実機は台本しか見ないので、テストも台本しか見ないようにします。 */
function applyStepSetup(stepId) {
  const step = D.steps.find(function (x) { return x.id === stepId; });
  if (!step) return null;
  const setup = step.setup;
  if (!setup) return step;

  if (setup.ensureHand) {
    Object.keys(setup.ensureHand).forEach(function (side) {
      TutorialDeck.setHand(side, setup.ensureHand[side]);
    });
  }
  if (setup.stackTop) {
    Object.keys(setup.stackTop).forEach(function (side) {
      TutorialDeck.stackTop(side, setup.stackTop[side]);
    });
  }
  return step;
}

console.log('■ ★開始時の盤面を組み立てる（仕様書 21.2）');
{
  const f = D.fixed;
  Game.start(f.firstSide, f.seed, {
    decks: { village: f.playerDeck, mansion: f.cpuDeck },
  });

  /* ★実機と同じ手順を踏みます（v0.6.2）。
       1. マリガンを飛ばす（実践編は試合の途中から）
       2. 盤面を作る（説明が始まる前に見えている必要があります）
       3. ターン開始の処理
       4. もう一度整える（気力とドローのぶんを戻す） */
  Game.confirmMulligan(Game.state.firstSide, []);
  Game.confirmMulligan(Game.state.secondSide, []);

  const snap = D.openingSnapshot;
  TutorialDeck.applySnapshot('village', snap.village);
  TutorialDeck.applySnapshot('mansion', snap.mansion);

  Game.beginTurn('village');
  Game.turnStartResources('village');
  check('あなたの盤面を作れた', TutorialDeck.applySnapshot('village', snap.village) === true);
  check('相手の盤面を作れた', TutorialDeck.applySnapshot('mansion', snap.mansion) === true);

  const t = snap.tracking;
  check('追跡の関係を作れた',
    TutorialDeck.setTracking(t.side, t.youkai, t.targetSide, t.human) === true);

  const problems = TutorialDeck.verifySnapshot('village', snap.village)
    .concat(TutorialDeck.verifySnapshot('mansion', snap.mansion));
  check('★仕様書21.2の盤面と完全に一致', problems.length === 0, problems.join(' / '));

  const p = Game.state.players.village;
  check('手札は5枚', p.hand.length === 5, names(p.hand));
  check('気力は2', p.energy === 2);
  check('ハルカが場にいる', !!onBoard('village', TA.haruka));
  check('キメラがハルカを追跡中',
    !!Game.state.tracking.mansion &&
    Game.state.tracking.mansion.human.cardId === TA.haruka);
}

console.log('\n■ ★第1章　グッズを使う');
{
  const p = Game.state.players.village;
  check('★気力はちょうど2（仕様書21.2）', p.energy === 2, '気力' + p.energy);
  check('★手札はちょうど5枚', p.hand.length === 5, p.hand.length + '枚');

  /* --- 懐中電灯をハルカへ --- */
  const fl = inHand('village', TA.flashlight);
  check('手札に懐中電灯がある', !!fl);

  const haruka = onBoard('village', TA.haruka);
  const targets = Game.getGoodsTargets('village', fl);
  check('★懐中電灯はハルカに付けられる', targets.indexOf(haruka) !== -1,
    '付けられる相手：' + names(targets));

  const r1 = Game.playGoods('village', fl, haruka);
  check('懐中電灯を装備できた', !!(r1 && r1.ok), r1 && r1.reasons ? r1.reasons.join('／') : '');
  check('ハルカに付いている',
    !!haruka.equippedGoods && haruka.equippedGoods.cardId === TA.flashlight);
  drainPending();

  /* --- 市松人形を出す --- */
  const ichi = inHand('village', TA.ichimatsu);
  check('手札に市松人形がある', !!ichi);
  const can = Game.canPlay('village', ichi);
  check('★市松人形を出せる', !!(can && can.ok),
    can && can.reasons ? can.reasons.join('／') : '気力' + Game.state.players.village.energy);

  const r2 = Game.playUnit('village', ichi);
  check('市松人形が場に出た', !!(r2 && r2.ok) && !!onBoard('village', TA.ichimatsu));
  drainPending();

  /* --- 古いお札を市松人形へ --- */
  const ofuda = inHand('village', TA.ofuda);
  check('手札に古いお札がある', !!ofuda);
  const ichiOnBoard = onBoard('village', TA.ichimatsu);
  const t2 = Game.getGoodsTargets('village', ofuda);
  check('★古いお札は市松人形に付けられる', t2.indexOf(ichiOnBoard) !== -1,
    '付けられる相手：' + names(t2));

  const r3 = Game.playGoods('village', ofuda, ichiOnBoard);
  check('古いお札を装備できた', !!(r3 && r3.ok), r3 && r3.reasons ? r3.reasons.join('／') : '');
  drainPending();

  check('★気力を使い切った（仕様書21.4）',
    Game.state.players.village.energy === 0,
    '気力' + Game.state.players.village.energy);
}

console.log('\n■ ★第2章　グッズで戦う');
{
  /* --- シルヴィを追跡 --- */
  Game.endMain();
  const ichi = onBoard('village', TA.ichimatsu);
  const sylvie = onBoard('mansion', TA.sylvie);
  check('シルヴィが相手の場にいる', !!sylvie);

  Game.setTracking('village', ichi, sylvie);
  check('市松人形がシルヴィを追跡した',
    Game.state.tracking.village.human.cardId === TA.sylvie);

  Game.queueEndTurnEffects('village');
  drainPending();
  Game.toEndPhase();
  const next = Game.endTurn();
  check('次は相手の番', next === 'mansion', next);

  /* --- 相手の番：キメラがハルカを襲う --- */
  Game.beginTurn('mansion');
  const atk = Game.prepareAttack('mansion');
  check('★キメラの襲撃が起こる', !!atk);

  if (atk) {
    Game.applyAttackDamage(atk);
    Game.finishAttack(atk);
  }
  drainPending();

  const haruka = onBoard('village', TA.haruka);
  check('★ハルカが生き残った（仕様書21.4）', !!haruka,
    haruka ? '生存' : '★ロストしてしまった');
  check('★キメラが倒れた', !onBoard('mansion', TA.chimera));

  Game.turnStartResources('mansion');
  drainPending();
  Game.endMain();
  Game.skipTracking('mansion');
  Game.queueEndTurnEffects('mansion');
  drainPending();
  Game.toEndPhase();
  Game.endTurn();

  /* --- あなたの番：市松人形がシルヴィを襲う --- */
  Game.beginTurn('village');
  const atk2 = Game.prepareAttack('village');
  check('★市松人形の襲撃が起こる', !!atk2);
  if (atk2) {
    Game.applyAttackDamage(atk2);
    Game.finishAttack(atk2);
  }
  drainPending();

  check('★シルヴィがロストした（仕様書21.4）', !onBoard('mansion', TA.sylvie));
  check('★市松人形も倒れた（相打ち）', !onBoard('village', TA.ichimatsu));

  const lost = Game.state.players.mansion.lost.length;
  check('相手のロストが1枚', lost === 1, lost + '枚');
}

console.log('\n■ ★第3章　イベントを使う');
{
  /* ★仕込みは台本から取ります（v0.6.2）。
     テストが独自の値を書くと、台本を直したときにここだけ古くなります。 */
  const assaultStep = D.steps.find(function (x) { return x.id === 'advanced_assault_sylvie'; });
  check('★襲撃のステップに仕込みが書いてある',
    !!(assaultStep.setup && assaultStep.setup.stackTop &&
       assaultStep.setup.stackTop.village), '仕様書21.5：引き戻す力を引く');
  stackTop('village', assaultStep.setup.stackTop.village);
  Game.turnStartResources('village');
  drainPending();

  const p = Game.state.players.village;
  check('★引き戻す力を引いた', !!inHand('village', TA.helping), names(p.hand));
  check('気力が2になった', p.energy === 2, '気力' + p.energy);
  check('手札は3枚', p.hand.length === 3, p.hand.length + '枚：' + names(p.hand));

  /* --- 境界線を使う。ヌシ様を捨てて2枚引く --- */
  const boundary = inHand('village', TA.boundary);
  check('手札に境界線がある', !!boundary);

  /* ★説明文が枚数の話をしていないか確かめます（v0.6.5）。
     境界線は「1枚捨てて2枚引く」ですが、境界線自身も手札から出ていくので、
     使う前と後で手札の枚数は変わりません。
     「1枚増えます」と書いていて、制作者に指摘されました。 */
  const handBefore = Game.state.players.village.hand.length;

  // 引く2枚も台本から取ります（仕様書21.5）
  const boundaryStep = D.steps.find(function (x) { return x.id === 'advanced_use_boundary'; });
  check('★境界線のステップに仕込みが書いてある',
    !!(boundaryStep.setup && boundaryStep.setup.stackTop &&
       boundaryStep.setup.stackTop.village), '仕様書21.5：市松人形とルナを引く');
  stackTop('village', boundaryStep.setup.stackTop.village);

  const r = Game.playEvent('village', boundary);
  check('境界線を使えた', !!(r && r.ok), r && r.reasons ? r.reasons.join('／') : '');

  // 捨てるのはヌシ様（台本の指示）
  drainPending([TA.nushi]);

  check('★ヌシ様がトラッシュへ行った',
    Game.state.players.village.trash.some(function (c) { return c.cardId === TA.nushi; }));
  check('★市松人形を引いた', !!inHand('village', TA.ichimatsu));
  check('★ルナを引いた', !!inHand('village', TA.luna));
  check('境界線もトラッシュへ',
    Game.state.players.village.trash.some(function (c) { return c.cardId === TA.boundary; }));
  check('★気力は2のまま（コスト0）',
    Game.state.players.village.energy === 2,
    '気力' + Game.state.players.village.energy);
  check('★境界線を使っても手札の枚数は変わらない',
    Game.state.players.village.hand.length === handBefore,
    handBefore + '枚 → ' + Game.state.players.village.hand.length + '枚');

  /* --- 引き戻す力でヌシ様を回収 --- */
  const helping = inHand('village', TA.helping);
  check('手札に引き戻す力がある', !!helping);

  const r2 = Game.playEvent('village', helping);
  check('引き戻す力を使えた', !!(r2 && r2.ok), r2 && r2.reasons ? r2.reasons.join('／') : '');
  drainPending([TA.nushi]);

  check('★ヌシ様が手札に戻った', !!inHand('village', TA.nushi));
  check('★気力は2のまま', Game.state.players.village.energy === 2);

  const hand = Game.state.players.village.hand;
  check('最終手札は3枚（仕様書21.5）', hand.length === 3, names(hand));

  /* 説明文に、枚数が増えるといった誤りが残っていないか */
  const bStep = D.steps.find(function (x) { return x.id === 'advanced_use_boundary'; });
  const bText = (bStep.pages || []).map(function (pg) { return pg.text; }).join('\n');
  check('★境界線の説明が「手札が増える」と言っていない',
    bText.indexOf('手札は 1 枚増え') === -1 && bText.indexOf('手札が増え') === -1,
    '実際は使う前と後で枚数は変わりません');
}

console.log('\n■ ★第4章　気力を持ち越す');
{
  const side = 'village';
  check('★まだ出せるカードがある（ルール側の判定）',
    Game.hasMeaningfulPlay(side) === true,
    '気力' + Game.state.players[side].energy);

  /* ★ルール側が「出せる」と言うだけでは足りません。
     台本が「この場面では警告を見せる」と指定していないと、
     警告が抑えられたままになり、ステップが完了しません。

     v0.6.2 の進行不能は、まさにここが繋がっていませんでした。
     台本の指定を、進行役と同じやり方で読んで確かめます。 */
  const saveStep = D.steps.find(function (x) { return x.id === 'advanced_save_morale'; });
  const shows = !!(saveStep.warnings &&
    saveStep.warnings.playableCardWarning === 'show');
  check('★台本が警告を見せる指定になっている', shows,
    shows ? '進行役と同じ読み方で確認' : JSON.stringify(saveStep.warnings));

  check('★この2つがそろって初めて警告が出る',
    Game.hasMeaningfulPlay(side) === true && shows,
    'ルール側の判定と、台本の指定の両方');

  Game.endMain();
  Game.skipTracking(side);
  Game.queueEndTurnEffects(side);
  drainPending();
  Game.toEndPhase();
  Game.endTurn();

  check('★気力2を持ち越した（仕様書21.6）',
    Game.state.players.village.energy === 2,
    '気力' + Game.state.players.village.energy);

  /* --- 相手の番：リリィを出す --- */
  Game.beginTurn('mansion');
  const atk = Game.prepareAttack('mansion');
  if (atk) { Game.applyAttackDamage(atk); Game.finishAttack(atk); }
  drainPending();
  Game.turnStartResources('mansion');
  drainPending();

  /* ★台本の仕込みを、そのまま使います */
  const lilyStep = applyStepSetup('advanced_cpu_play_lily');
  check('★台本にリリィの用意が書いてある',
    !!(lilyStep && lilyStep.setup && lilyStep.setup.ensureHand),
    '書いていないと、実機で相手がリリィを出せません');

  const lily = Game.state.players.mansion.hand.find(function (c) {
    return c.cardId === TA.lily;
  });
  check('★リリィが相手の手札にある', !!lily,
    names(Game.state.players.mansion.hand));
  const r = Game.playUnit('mansion', lily);
  check('★相手がリリィを出せた', !!(r && r.ok), r && r.reasons ? r.reasons.join('／') : '');
  drainPending();

  Game.endMain();
  Game.skipTracking('mansion');
  Game.queueEndTurnEffects('mansion');
  drainPending();
  Game.toEndPhase();
  Game.endTurn();
}

console.log('\n■ ★第5章　大きな怪異で攻める');
{
  Game.beginTurn('village');
  const atk = Game.prepareAttack('village');
  if (atk) { Game.applyAttackDamage(atk); Game.finishAttack(atk); }
  drainPending();

  Game.turnStartResources('village');
  drainPending();

  const p = Game.state.players.village;
  check('★気力が4になった（仕様書21.6）', p.energy === 4, '気力' + p.energy);

  const nushi = inHand('village', TA.nushi);
  check('手札にヌシ様がある', !!nushi, names(p.hand));

  const can = Game.canPlay('village', nushi);
  check('★ヌシ様を出せる', !!(can && can.ok),
    can && can.reasons ? can.reasons.join('／') : '');

  const r = Game.playUnit('village', nushi);
  check('ヌシ様が場に出た', !!(r && r.ok) && !!onBoard('village', TA.nushi));
  drainPending();
  check('★気力を使い切った', Game.state.players.village.energy === 0,
    '気力' + Game.state.players.village.energy);

  /* --- エマを追跡 --- */
  Game.endMain();
  const nushiOnBoard = onBoard('village', TA.nushi);
  const emma = onBoard('mansion', TA.emma);
  check('エマが相手の場にいる', !!emma);
  Game.setTracking('village', nushiOnBoard, emma);
  check('ヌシ様がエマを追跡した',
    Game.state.tracking.village.human.cardId === TA.emma);

  Game.queueEndTurnEffects('village');
  drainPending();
  Game.toEndPhase();
  Game.endTurn();

  /* --- 相手の番：エマ2枚目を出す --- */
  Game.beginTurn('mansion');
  const a2 = Game.prepareAttack('mansion');
  if (a2) { Game.applyAttackDamage(a2); Game.finishAttack(a2); }
  drainPending();
  Game.turnStartResources('mansion');
  drainPending();

  const emmaStep = applyStepSetup('advanced_cpu_play_emma_02');
  check('★台本に2枚目のエマの用意が書いてある',
    !!(emmaStep && emmaStep.setup && emmaStep.setup.ensureHand));

  const emma2 = Game.state.players.mansion.hand.find(function (c) {
    return c.cardId === TA.emma;
  });
  check('★2枚目のエマが相手の手札にある', !!emma2,
    names(Game.state.players.mansion.hand));
  const r2 = Game.playUnit('mansion', emma2);
  check('★相手が2枚目のエマを出せた', !!(r2 && r2.ok),
    r2 && r2.reasons ? r2.reasons.join('／') : '');
  drainPending();

  Game.endMain();
  Game.skipTracking('mansion');
  Game.queueEndTurnEffects('mansion');
  drainPending();
  Game.toEndPhase();
  Game.endTurn();

  /* --- あなたの番：ヌシ様がエマを襲う --- */
  Game.beginTurn('village');
  const a3 = Game.prepareAttack('village');
  check('★ヌシ様の襲撃が起こる', !!a3);
  if (a3) { Game.applyAttackDamage(a3); Game.finishAttack(a3); }
  drainPending();

  const nushiNow = onBoard('village', TA.nushi);
  check('★ヌシ様が生き残った', !!nushiNow);
  if (nushiNow) {
    const left = nushiNow.master.hp - nushiNow.accumulatedDamage;
    check('★ヌシ様の残り体力は4（仕様書21.7）', left === 4, '残り' + left);
  }
  const lost = Game.state.players.mansion.lost.length;
  check('★相手のロストが2枚', lost === 2, lost + '枚');
}

console.log('\n■ ★第6章　勝負を決める');
{
  /* --- リリィを追跡 --- */
  Game.turnStartResources('village');
  drainPending();
  Game.endMain();

  const nushi = onBoard('village', TA.nushi);
  const lily = onBoard('mansion', TA.lily);
  check('リリィが相手の場にいる', !!lily);
  if (nushi && lily) Game.setTracking('village', nushi, lily);

  Game.queueEndTurnEffects('village');
  drainPending();
  Game.toEndPhase();
  Game.endTurn();

  /* --- 相手の番：アネットを出す --- */
  Game.beginTurn('mansion');
  const a = Game.prepareAttack('mansion');
  if (a) { Game.applyAttackDamage(a); Game.finishAttack(a); }
  drainPending();
  Game.turnStartResources('mansion');
  drainPending();

  const annetteStep = applyStepSetup('advanced_cpu_play_annette');
  check('★台本にアネットの用意が書いてある',
    !!(annetteStep && annetteStep.setup && annetteStep.setup.ensureHand));

  const annette = Game.state.players.mansion.hand.find(function (c) {
    return c.cardId === TA.annette;
  });
  check('★アネットが相手の手札にある', !!annette,
    names(Game.state.players.mansion.hand));
  if (annette) {
    const r = Game.playUnit('mansion', annette);
    check('★相手がアネットを出せた', !!(r && r.ok),
      r && r.reasons ? r.reasons.join('／') : '');
  }
  drainPending();

  Game.endMain();
  Game.skipTracking('mansion');
  Game.queueEndTurnEffects('mansion');
  drainPending();
  Game.toEndPhase();
  Game.endTurn();

  /* --- あなたの番：ヌシ様がリリィを襲う --- */
  Game.beginTurn('village');
  const energyBefore = Game.state.players.mansion.energy;
  const a2 = Game.prepareAttack('village');
  check('★リリィへの襲撃が起こる', !!a2);
  if (a2) { Game.applyAttackDamage(a2); Game.finishAttack(a2); }
  drainPending();

  check('★リリィがロストした', !onBoard('mansion', TA.lily));
  const nushiNow = onBoard('village', TA.nushi);
  check('★ヌシ様がまだ生きている', !!nushiNow);
  if (nushiNow) {
    const left = nushiNow.master.hp - nushiNow.accumulatedDamage;
    check('★ヌシ様の残り体力は1（仕様書21.7）', left === 1, '残り' + left);
  }

  const lost = Game.state.players.mansion.lost;
  check('★相手のロストが3枚', lost.length === 3, lost.length + '枚');

  /* --- 黒薔薇の館のフィールド効果（仕様書21.7） --- */
  const allMansionTrait = lost.every(function (c) {
    return (c.master.traits || []).indexOf('洋館') !== -1;
  });
  check('★ロスト3枚すべてが〔洋館〕', allMansionTrait,
    lost.map(function (c) { return c.master.name; }).join('、'));
  check('★黒薔薇の館の効果で相手の気力が増えた',
    Game.state.players.mansion.energy > energyBefore,
    energyBefore + ' → ' + Game.state.players.mansion.energy);

  /* --- 最後：2枚目のエマを襲う --- */
  Game.turnStartResources('village');
  drainPending();
  Game.endMain();

  const nushi2 = onBoard('village', TA.nushi);
  const emma2 = onBoard('mansion', TA.emma);
  check('2枚目のエマが場にいる', !!emma2);
  if (nushi2 && emma2) Game.setTracking('village', nushi2, emma2);

  Game.queueEndTurnEffects('village');
  drainPending();
  Game.toEndPhase();
  Game.endTurn();

  // 相手の番をひととおり
  Game.beginTurn('mansion');
  const a3 = Game.prepareAttack('mansion');
  if (a3) { Game.applyAttackDamage(a3); Game.finishAttack(a3); }
  drainPending();
  if (!Game.state.gameOver) {
    Game.turnStartResources('mansion');
    drainPending();
    Game.endMain();
    Game.skipTracking('mansion');
    Game.queueEndTurnEffects('mansion');
    drainPending();
    Game.toEndPhase();
    Game.endTurn();
  }

  // 最後の襲撃
  if (!Game.state.gameOver) {
    Game.beginTurn('village');
    const a4 = Game.prepareAttack('village');
    check('★最後の襲撃が起こる', !!a4);
    if (a4) { Game.applyAttackDamage(a4); Game.finishAttack(a4); }
    drainPending();
  }

  check('★相手のロストが4枚に達した',
    Game.state.players.mansion.lost.length === 4,
    Game.state.players.mansion.lost.length + '枚');
  check('★ヌシ様も倒れた（相打ち）', !onBoard('village', TA.nushi));
  check('★相手の人間はまだ残っている（人間0敗北を同時成立させない・仕様書21.7）',
    Game.state.players.mansion.humans.length >= 1,
    names(Game.state.players.mansion.humans));

  check('★ゲームが終わった', !!Game.state.gameOver);
  if (Game.state.gameOver) {
    check('★あなたの勝ち', Game.state.gameOver.winner === 'village',
      Game.state.gameOver.winner + '／理由：' + (Game.state.gameOver.reason || ''));
  }
}

console.log('\n■ 40枚の内訳が変わっていない');
{
  ['village', 'mansion'].forEach(function (side) {
    const total = Object.values(TutorialDeck.census(side))
      .reduce(function (a, b) { return a + b; }, 0);
    check(side + ' の合計が40枚', total === 40, total + '枚');
  });
}

console.log('\n' + (fail === 0
  ? '===== 実践編の台本：' + pass + '/' + pass + ' 通過（最後まで通りました） ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
