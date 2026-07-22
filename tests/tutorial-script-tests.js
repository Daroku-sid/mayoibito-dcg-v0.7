/* =====================================================================
   tutorial-script-tests.js
   ―― 基本編の台本が、本当に最後まで通るかを確かめる
   ---------------------------------------------------------------------
   これがチュートリアルで最も重要な点検です。

   台本は「市松人形を出しましょう」と指示します。
   でも、そのとき気力が足りなければ出せません。
   「エリーゼを追跡しましょう」と言っても、
   エリーゼがすでにいなければ指定できません。

   説明文と盤面が食い違うと、プレイヤーはそこで詰みます。
   しかも、その食い違いは画面を作ってから触って初めて気づく——
   というのでは遅すぎます。

   そこで、画面をいっさい作らずに、本物のルール処理だけを使って
   台本の最初から最後までを実際に演じさせます。
   ここが通れば、あとは見た目の問題だけになります。
   ===================================================================== */
const { loadGame } = require('./test-harness.js');
const G = loadGame('.');
const { TutorialDeck } = require('../js/tutorial-deck.js');
const { TutorialBasicData: D, TUTORIAL_BASIC_CARDS: TB } =
  require('../js/tutorial-basic-data.js');
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
/* 保留中の効果を最後まで片づける。
   フィールド効果は「使いますか？」と聞いてくるので、
   ここで台本どおりの返事をします（useIt が答え）。 */
function drainPending(useIt) {
  let guard = 0;
  while (guard++ < 20) {
    const item = Game.takeNextPending();
    if (!item) break;
    const ops = {
      confirmYesNo: function (title, message, cb) { cb(useIt); },
      pickCards: function (options, cb) {
        cb((options.candidates || []).slice(0, options.count || 1));
      },
      pickBoardTarget: function (options, cb) {
        cb((options.candidates || [])[0] || null);
      },
    };
    Game.runEffect(item, ops, function () {});
  }
}

console.log('■ 台本を最初から最後まで実際に演じる');
console.log('   （画面は使わず、本物のルール処理だけで動かします）\n');

/* =============================================================
   準備：仕様書 19.3 の固定条件で開始する
   ============================================================= */
Game.start(D.fixed.firstSide, D.fixed.seed, {
  decks: { village: D.fixed.playerDeck, mansion: D.fixed.cpuDeck },
});
check('固定条件で対戦を開始できる', !!Game.state);
check('プレイヤーが先攻', Game.state.firstSide === 'village', Game.state.firstSide);

const censusBefore = JSON.stringify(TutorialDeck.census('village'));

/* 開始時の仕込み（仕様書 20.2） */
const okV = TutorialDeck.apply('village', D.openingPlan.village);
const okM = TutorialDeck.apply('mansion', D.openingPlan.mansion);
check('自分の初期手札を仕込める', okV === true);
check('相手の初期手札を仕込める', okM === true);
console.log('    初期手札：' + names(Game.state.players.village.hand));

/* =============================================================
   basic_mulligan_select / confirm
   ============================================================= */
console.log('\n― マリガン ―');
{
  const swap = ['nushi', 'ofuda'].map(function (k) { return inHand('village', TB[k]); });
  check('交換する2枚が手札にある', swap.every(Boolean),
    swap.filter(Boolean).map(function (c) { return c.master.name; }).join('、'));

  Game.confirmMulligan('village', swap.map(function (c) { return c.uid; }));
  // 相手は交換しない
  Game.confirmMulligan('mansion', []);

  // 交換すると山札が混ざるので、引き順を仕込み直す（仕様書 20.2）
  const ok = TutorialDeck.apply('village', D.afterMulliganPlan.village);
  check('交換後の手札を仕込める', ok === true);
  console.log('    交換後：' + names(Game.state.players.village.hand));

  check('ルナが手札に入った', !!inHand('village', TB.luna));
  check('境界線が手札に入った', !!inHand('village', TB.boundary));
  check('ヌシ様は手札から消えた', !inHand('village', TB.nushi));
}

/* =============================================================
   プレイヤー第1ターン
   ============================================================= */
console.log('\n― あなたの第1ターン ―');
{
  Game.beginTurn('village');
  Game.turnStartResources('village');

  const drew = Game.state.players.village.hand
    .find(function (c) { return c.cardId === TB.hand; });
  check('第1ドローは《引き戻す力》', !!drew, names(Game.state.players.village.hand));
  check('気力は1', Game.state.players.village.energy === 1,
    '気力' + Game.state.players.village.energy);

  /* basic_play_ichimatsu：市松人形を出す */
  const ichi = inHand('village', TB.ichimatsu);
  check('市松人形が手札にある', !!ichi);
  check('★市松人形を出せる（気力が足りている）',
    Game.canPlay('village', ichi).ok === true);
  Game.playUnit('village', ichi);
  check('市松人形が怪異エリアに出た', !!onBoard('village', TB.ichimatsu));
  check('気力を1使った', Game.state.players.village.energy === 0,
    '気力' + Game.state.players.village.energy);

  Game.endMain();

  /* basic_select_pursuit：エリーゼを追跡 */
  const elise = onBoard('mansion', TB.elise);
  check('相手の場にエリーゼがいる', !!elise, names(Game.state.players.mansion.humans));
  const youkai = onBoard('village', TB.ichimatsu);
  Game.setTracking('village', youkai, elise);
  check('★エリーゼを追跡できた', !!youkai.tracking || !!Game.state.tracking,
    '追跡先：' + (elise ? elise.master.name : '不明'));

  /* basic_use_field：ヨマモリ村の効果を使う */
  const deckTopBefore = Game.state.players.village.deck[0];
  check('山札の次は《狐のお面 コハク》', deckTopBefore.cardId === TB.kohaku,
    deckTopBefore.master.name);

  const trashBefore = Game.state.players.village.trash.length;
  Game.queueEndTurnEffects('village');
  drainPending(true);
  const trashAfter = Game.state.players.village.trash.length;
  check('フィールド効果でトラッシュが増えた', trashAfter > trashBefore,
    trashBefore + '枚 → ' + trashAfter + '枚');

  Game.toEndPhase();
  const next = Game.endTurn();
  check('次は相手の番', next === 'mansion', next);
}

/* =============================================================
   CPU第1ターン（仕様書 20.4 の台本どおりか）
   ============================================================= */
console.log('\n― 相手の第1ターン（台本どおりに動かす） ―');
{
  Game.beginTurn('mansion');
  const atk = Game.prepareAttack('mansion');
  check('この時点では襲撃が起きない', !atk);
  Game.turnStartResources('mansion');

  const script = D.steps.find(function (s) { return s.id === 'basic_cpu_turn_1'; }).cpuScript;
  check('CPU台本は4手（仕様書 20.4）', script.length === 4, script.length + '手');

  // 1. エマを出す
  const emma = inHand('mansion', TB.emma);
  check('エマが手札にある', !!emma);
  check('★エマを出せる', Game.canPlay('mansion', emma).ok === true);
  Game.playUnit('mansion', emma);
  check('エマが人間エリアに出た', !!onBoard('mansion', TB.emma));

  // 2. キメラを出す
  const chimera = inHand('mansion', TB.chimera);
  check('キメラが手札にある', !!chimera);
  check('★キメラを出せる（気力が残っている）',
    Game.canPlay('mansion', chimera).ok === true,
    '気力' + Game.state.players.mansion.energy);
  Game.playUnit('mansion', chimera);
  check('キメラが怪異エリアに出た', !!onBoard('mansion', TB.chimera));

  Game.endMain();

  // 3. スミレを追跡
  const sumire = onBoard('village', TB.sumire);
  check('自分の場にスミレがいる', !!sumire, names(Game.state.players.village.humans));
  Game.setTracking('mansion', onBoard('mansion', TB.chimera), sumire);
  check('★キメラがスミレを追跡できた', true);

  // 4. 確定してターン終了
  Game.queueEndTurnEffects('mansion');
  drainPending(false);
  Game.toEndPhase();
  const next = Game.endTurn();
  check('次は自分の番', next === 'village', next);
}

/* =============================================================
   プレイヤー第2ターン：襲撃1回目
   ============================================================= */
console.log('\n― あなたの第2ターン：市松人形 対 エリーゼ ―');
{
  Game.beginTurn('village');
  const info = Game.prepareAttack('village');
  check('★襲撃が発生する', !!info);

  if (info) {
    Game.applyAttackDamage(info);
    Game.finishAttack(info);
  }

  const mansionLost = Game.state.players.mansion.lost;
  check('★エリーゼがロストした',
    mansionLost.some(function (c) { return c.cardId === TB.elise; }),
    'ロスト：' + names(mansionLost));
  check('相手のロストは1人', mansionLost.length === 1, mansionLost.length + '人');

  const villageTrash = Game.state.players.village.trash;
  check('★市松人形がトラッシュへ行った',
    villageTrash.some(function (c) { return c.cardId === TB.ichimatsu; }),
    'トラッシュ：' + villageTrash.length + '枚');
  check('相手の場にはエマが残る', !!onBoard('mansion', TB.emma),
    names(Game.state.players.mansion.humans));

  Game.turnStartResources('village');
  const nushi = Game.state.players.village.hand
    .find(function (c) { return c.cardId === TB.nushi; });
  check('第2ドローは《山を守るヌシ様》（仕様書 20.2）', !!nushi,
    names(Game.state.players.village.hand));

  /* basic_play_haruka：ハルカを出して敗北を避ける */
  check('いま自分の人間はスミレだけ',
    Game.state.players.village.humans.length === 1,
    names(Game.state.players.village.humans));

  const haruka = inHand('village', TB.haruka);
  check('ハルカが手札にある', !!haruka);
  check('★ハルカを出せる（気力が足りている）',
    Game.canPlay('village', haruka).ok === true,
    '気力' + Game.state.players.village.energy);
  Game.playUnit('village', haruka);
  check('ハルカが人間エリアに出た', !!onBoard('village', TB.haruka));
  check('人間が2人になった', Game.state.players.village.humans.length === 2,
    names(Game.state.players.village.humans));

  Game.endMain();

  /* basic_end_turn：追跡せずに終える */
  check('★追跡できる怪異がいない（台本どおり）',
    Game.state.players.village.youkai.length === 0,
    names(Game.state.players.village.youkai));
  Game.skipTracking('village');

  /* basic_skip_field：フィールド効果を使わない */
  const trashBefore = Game.state.players.village.trash.length;
  Game.queueEndTurnEffects('village');
  drainPending(false);
  check('フィールド効果を使わなければトラッシュは増えない',
    Game.state.players.village.trash.length === trashBefore,
    trashBefore + '枚のまま');

  Game.toEndPhase();
  Game.endTurn();
}

/* =============================================================
   CPU第2ターン：襲撃2回目
   ============================================================= */
console.log('\n― 相手の第2ターン：キメラ 対 スミレ ―');
{
  Game.beginTurn('mansion');
  const info = Game.prepareAttack('mansion');
  check('★2回目の襲撃が発生する', !!info);

  if (info) {
    Game.applyAttackDamage(info);
    Game.finishAttack(info);
  }

  const villageLost = Game.state.players.village.lost;
  check('★スミレがロストした',
    villageLost.some(function (c) { return c.cardId === TB.sumire; }),
    'ロスト：' + names(villageLost));
  check('自分のロストは1人', villageLost.length === 1, villageLost.length + '人');

  const mansionTrash = Game.state.players.mansion.trash;
  check('★キメラがトラッシュへ行った',
    mansionTrash.some(function (c) { return c.cardId === TB.chimera; }));

  /* ここが基本編のいちばんの山場です。
     ハルカを出していなければ、この時点で人間が0人になり敗北します。 */
  check('★★自分の場に人間が残っている（敗北を回避できた）',
    Game.state.players.village.humans.length > 0,
    names(Game.state.players.village.humans));
  check('残っているのはハルカ', !!onBoard('village', TB.haruka));
  check('この時点で対戦は終わっていない', !Game.state.gameOver,
    Game.state.gameOver ? '★終了している' : '継続中');
}

/* =============================================================
   最後に、40枚の内訳が壊れていないか
   ============================================================= */
console.log('\n― 通し終えたあとの健全性 ―');
{
  const p = Game.state.players.village;
  const total = p.hand.length + p.deck.length + p.trash.length +
                p.lost.length + p.youkai.length + p.humans.length;
  check('★自分のカードは合計40枚のまま', total === 40,
    '手札' + p.hand.length + '＋山札' + p.deck.length +
    '＋トラッシュ' + p.trash.length + '＋ロスト' + p.lost.length +
    '＋怪異' + p.youkai.length + '＋人間' + p.humans.length + '＝' + total);

  const m = Game.state.players.mansion;
  const totalM = m.hand.length + m.deck.length + m.trash.length +
                 m.lost.length + m.youkai.length + m.humans.length;
  check('★相手のカードも合計40枚のまま', totalM === 40, totalM + '枚');

  const uids = p.hand.concat(p.deck, p.trash, p.lost, p.youkai, p.humans)
    .map(function (c) { return c.uid; });
  check('同じカードが二重に存在しない', new Set(uids).size === uids.length);
}

console.log('\n' + (fail === 0
  ? '===== 基本編の台本：' + pass + '/' + pass + ' 通過（最後まで通りました） ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
