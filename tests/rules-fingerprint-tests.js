/* =====================================================================
   rules-fingerprint-tests.js
   ―― ルール処理が変わっていないことを、AIに左右されずに確かめる
   ---------------------------------------------------------------------
   これまでの回帰ハッシュ（battle-deck-tests）は、
   AIに40試合させてログを指紋にしていました。
   ルールが変わっていないことの保証としては強力ですが、
   ★AIを賢くしただけでも指紋が変わってしまいます。

   実際 v0.5.9 でAIを入れ替えたとき、
   ルールは一行も変えていないのに指紋が変わり、
   「ルールが壊れたのか、AIが変わっただけなのか」を
   その場で区別できませんでした。

   そこでこのファイルでは、AIをいっさい使いません。
   決め打ちの手順でカードを出し、襲撃させ、効果を解決させ、
   その結果を指紋にします。

   AIをどれだけ賢くしても、この指紋は変わりません。
   逆にここが変わったら、ルール処理が変わったということです。
   ===================================================================== */
const crypto = require('crypto');
const { loadGame } = require('./test-harness.js');
const G = loadGame('.');
const Game = G.Game;

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

/** 効果は、いつも同じ答え方で解決する（AIを使わない） */
function drainPending(useOptional) {
  let guard = 0;
  while (guard++ < 60) {
    const item = Game.takeNextPending();
    if (!item) break;
    const ops = {
      confirmYesNo: function (t, m, cb) { cb(!!useOptional); },
      // 選ぶときは「いつも先頭から」。ここに迷いを入れないのが大事です
      pickCards: function (o, cb) { cb((o.candidates || []).slice(0, o.count || 1)); },
      pickBoardTarget: function (o, cb) { cb((o.candidates || [])[0] || null); },
    };
    Game.runEffect(item, ops, function () {});
  }
}

/* =============================================================
   決め打ちの1試合
   -------------------------------------------------------------
   「手札の左から順に、出せるものを出す」だけの、
   迷いのない指し方をします。AIの賢さは一切関わりません。
   ============================================================= */
function playScripted(firstSide, seed, useField) {
  Game.start(firstSide, seed, {
    decks: { village: 'village', mansion: 'mansion' },
  });

  // マリガンはしない（迷いを入れない）
  Game.confirmMulligan('village', []);
  Game.confirmMulligan('mansion', []);

  let side = firstSide;
  let turns = 0;

  while (!Game.state.gameOver && turns++ < 60) {
    Game.beginTurn(side);

    const info = Game.prepareAttack(side);
    if (info) { Game.applyAttackDamage(info); Game.finishAttack(info); }
    if (Game.state.gameOver) break;

    drainPending(useField);
    if (Game.state.gameOver) break;

    Game.turnStartResources(side);
    drainPending(useField);
    if (Game.state.gameOver) break;

    // --- 手札の左から順に、出せるものを出す ---
    let guard = 0;
    let played = true;
    while (played && guard++ < 20) {
      played = false;
      const hand = Game.state.players[side].hand.slice();
      for (let i = 0; i < hand.length; i++) {
        const inst = hand[i];
        const m = inst.master;
        const can = Game.canPlay(side, inst);
        if (!can || !can.ok) continue;

        let r = null;
        if (m.type === 'human' || m.type === 'youkai') {
          r = Game.playUnit(side, inst);
        } else if (m.type === 'event') {
          r = Game.playEvent(side, inst);
        } else if (m.type === 'goods') {
          const targets = Game.getGoodsTargets ? Game.getGoodsTargets(side, inst) : [];
          if (targets.length === 0) continue;
          r = Game.playGoods(side, inst, targets[0]);
        }
        if (r && r.ok) { played = true; drainPending(useField); break; }
      }
      if (Game.state.gameOver) break;
    }
    if (Game.state.gameOver) break;

    Game.endMain();

    // --- 追跡は「自分の先頭の怪異が、相手の先頭の人間を狙う」 ---
    const me = Game.state.players[side];
    const opp = Game.state.players[side === 'village' ? 'mansion' : 'village'];
    if (me.youkai.length > 0 && opp.humans.length > 0) {
      Game.setTracking(side, me.youkai[0], opp.humans[0]);
    } else {
      Game.skipTracking(side);
    }

    Game.queueEndTurnEffects(side);
    drainPending(useField);
    if (Game.state.gameOver) break;

    Game.toEndPhase();
    side = Game.endTurn();
  }

  return {
    over: Game.state.gameOver || null,
    turns: Game.state.turnCount,
    log: Game.state.log.length,
  };
}

console.log('■ ★AIを使わない、ルール処理そのものの指紋');
{
  const parts = [];
  let finished = 0;

  for (let i = 0; i < 24; i++) {
    const first = (i % 2) ? 'village' : 'mansion';
    const useField = (i % 3 === 0);
    const r = playScripted(first, 'FP-' + i, useField);
    if (r.over) finished++;
    parts.push(
      (r.over ? r.over.winner + ':' + r.over.reason : 'none') +
      '/' + r.turns + '/' + r.log
    );
  }

  const hash = crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);

  check('決め打ちの24試合が最後まで進む', finished >= 20, finished + '/24 が決着');

  /* ★この値は「ルール処理の指紋」です。
     AIをどれだけ賢くしても変わりません。
     ここが変わったときは、ルール処理が変わったということです。 */
  /* この値は v0.3.3・v0.5.8（前のAI）・v0.5.9（新しいAI）の
     3つで実際に一致することを確かめてあります。
     つまり、AIをどれだけ入れ替えても動きません。 */
  const EXPECTED = process.env.MAYO_FINGERPRINT || '90b8f6dae89d6ece';
  check('★ルール処理の指紋が同じ', hash === EXPECTED,
    hash + (hash === EXPECTED ? '' : '（期待：' + EXPECTED + '）'));

  if (hash !== EXPECTED) {
    console.log('');
    console.log('    指紋が変わりました。次のどちらかです。');
    console.log('      ・ルール処理を意図して変えた → この値を新しい期待値にしてください');
    console.log('      ・変えたつもりがない → ルールが壊れています。調べてください');
    console.log('    新しい値： ' + hash);
  }
}

console.log('\n■ 決め打ちの手順そのものが安定している');
{
  // 同じシードなら、何度やっても同じ結果になること
  const a = playScripted('village', 'STABLE', false);
  const b = playScripted('village', 'STABLE', false);
  check('同じシードなら同じ結果', a.turns === b.turns && a.log === b.log,
    a.turns + 'ターン／' + a.log + '行');

  const c = playScripted('village', 'OTHER', false);
  check('シードが違えば結果も変わる', c.log !== a.log || c.turns !== a.turns);
}

console.log('\n' + (fail === 0
  ? '===== ルール処理の指紋：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
