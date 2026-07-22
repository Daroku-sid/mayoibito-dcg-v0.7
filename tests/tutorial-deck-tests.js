/* =====================================================================
   tutorial-deck-tests.js
   ―― チュートリアル用の「手札と山札の仕込み」の点検
   ---------------------------------------------------------------------
   ここで守りたいのは2つです。

     1. 台本どおりの手札・山札を、毎回きっちり作れること
        （作れないと、説明文と盤面が食い違って行き詰まります）

     2. 40枚の内訳を1枚も変えないこと
        （増減すると、山札切れ敗北やトラッシュを数える効果が壊れます）
   ===================================================================== */
const { loadGame } = require('./test-harness.js');
const G = loadGame('.');
const { TutorialDeck } = require('../js/tutorial-deck.js');
global.Game = G.Game;

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

const DECKS = { decks: { village: 'village', mansion: 'mansion' } };

/** 枚数の表を「並び順によらない形」で文字にする */
function censusText(side) {
  const c = TutorialDeck.census(side);
  return Object.keys(c).sort().map(function (k) { return k + ':' + c[k]; }).join(',');
}
/** 場のカードの名前を並べる（表示用） */
function names(list) {
  return list.map(function (c) { return c.master.name; }).join('、') || '（なし）';
}

function totalOf(side) {
  const c = TutorialDeck.census(side);
  return Object.keys(c).reduce(function (n, k) { return n + c[k]; }, 0);
}

/* 基本編で使う仕込み（仕様書 20.2） */
const BASIC_VILLAGE = {
  hand: ['village_nushi', 'village_ofuda', 'village_ichimatsu',
         'village_haruka', 'village_flashlight'],
  top: ['village_luna', 'event_kyoukaisen'],
};
const BASIC_MANSION = {
  hand: ['mansion_emma', 'mansion_chimera'],
};

console.log('■ 台本どおりの手札を作れる');
{
  G.Game.start('village', 'TUTORIAL-BASIC', DECKS);
  const ok = TutorialDeck.apply('village', BASIC_VILLAGE);
  check('仕込みが成功する', ok === true);

  const problems = TutorialDeck.verify('village', BASIC_VILLAGE);
  check('手札も山札も指示どおり', problems.length === 0, problems.join(' / '));

  const hand = G.Game.state.players.village.hand.map(function (c) { return c.cardId; });
  BASIC_VILLAGE.hand.forEach(function (id) {
    check('手札に「' + id + '」がある', hand.indexOf(id) !== -1);
  });
  check('手札は5枚のまま', hand.length === 5, hand.length + '枚');

  const top = G.Game.state.players.village.deck.slice(0, 2)
    .map(function (c) { return c.cardId; });
  check('山札の1枚目はルナ', top[0] === 'village_luna', top[0]);
  check('山札の2枚目は境界線', top[1] === 'event_kyoukaisen', top[1]);
}

console.log('\n■ ★40枚の内訳を1枚も変えない');
{
  G.Game.start('village', 'TUTORIAL-BASIC', DECKS);
  const beforeV = censusText('village');
  const beforeM = censusText('mansion');
  const totalV = totalOf('village');

  TutorialDeck.apply('village', BASIC_VILLAGE);
  TutorialDeck.apply('mansion', BASIC_MANSION);

  check('自分側の内訳が変わらない', censusText('village') === beforeV);
  check('相手側の内訳が変わらない', censusText('mansion') === beforeM);
  check('合計枚数が変わらない', totalOf('village') === totalV, totalV + '枚');

  const p = G.Game.state.players.village;
  check('手札＋山札＋場＝40', p.hand.length + p.deck.length + p.humans.length === 40,
    p.hand.length + '＋' + p.deck.length + '＋' + p.humans.length);
  check('同じカードが二重に存在しない',
    new Set(p.hand.concat(p.deck).map(function (c) { return c.uid; })).size ===
    p.hand.length + p.deck.length);
}

console.log('\n■ 相手（CPU）側にも仕込める');
{
  G.Game.start('village', 'TUTORIAL-BASIC', DECKS);
  const ok = TutorialDeck.apply('mansion', BASIC_MANSION);
  check('仕込みが成功する', ok === true);
  const hand = G.Game.state.players.mansion.hand.map(function (c) { return c.cardId; });
  check('エマが手札にある', hand.indexOf('mansion_emma') !== -1);
  check('キメラが手札にある', hand.indexOf('mansion_chimera') !== -1);
  check('手札は5枚のまま', hand.length === 5, hand.length + '枚');
}

console.log('\n■ どのシードでも同じ結果になる');
{
  /* ここが肝心なところです。
     仕込みが効いていれば、シードが変わっても盤面は同じになります。
     逆に言うと、シード探しに頼らずに済みます。 */
  const seeds = ['A', 'B', 'C', 'ZZZ', 'MAYO-1234', ''];
  let same = true;
  let firstHand = null;

  seeds.forEach(function (seed) {
    G.Game.start('village', seed, DECKS);
    TutorialDeck.apply('village', BASIC_VILLAGE);
    const hand = G.Game.state.players.village.hand
      .map(function (c) { return c.cardId; }).sort().join(',');
    if (firstHand === null) firstHand = hand;
    else if (hand !== firstHand) same = false;
  });
  check('シードを変えても手札が同じ', same, firstHand);
}

console.log('\n■ マリガンのあとにも仕込み直せる');
{
  /* 基本編ではヌシ様と古いお札を交換します。
     交換すると山札が再シャッフルされるので、
     そのあとの引き順をもう一度仕込む必要があります（仕様書 20.2）。 */
  G.Game.start('village', 'TUTORIAL-BASIC', DECKS);
  TutorialDeck.apply('village', BASIC_VILLAGE);

  const p = G.Game.state.players.village;
  const swap = p.hand.filter(function (c) {
    return c.cardId === 'village_nushi' || c.cardId === 'village_ofuda';
  }).map(function (c) { return c.uid; });
  check('交換する2枚が手札にある', swap.length === 2);

  const before = censusText('village');
  G.Game.confirmMulligan('village', swap);
  check('マリガン後も内訳が変わらない', censusText('village') === before);

  // 交換後の手札（仕様書 20.2）
  const after = {
    hand: ['village_ichimatsu', 'village_haruka', 'village_flashlight',
           'village_luna', 'event_kyoukaisen'],
    top: ['village_sashinoberu'],
  };
  const ok = TutorialDeck.apply('village', after);
  check('交換後の手札も作れる', ok === true);
  check('指示どおりになっている',
    TutorialDeck.verify('village', after).length === 0,
    TutorialDeck.verify('village', after).join(' / '));

  const names = G.Game.state.players.village.hand
    .map(function (c) { return c.master.name; });
  check('ヌシ様が手札から消えている', names.indexOf('山を守るヌシ様') === -1);
  check('ルナが手札にある', names.indexOf('泣き虫転校生 ルナ') !== -1);
  check('境界線が手札にある', names.indexOf('境界線') !== -1);
  check('次に引くのは引き戻す力',
    G.Game.state.players.village.deck[0].cardId === 'village_sashinoberu');
  check('内訳はやはり変わらない', censusText('village') === before);
}

console.log('\n■ 仕様書どおりの襲撃結果になる（20.5）');
{
  const M = Array.isArray(G.CARD_MASTER) ? G.CARD_MASTER : Object.values(G.CARD_MASTER);
  const card = function (id) { return M.find(function (c) { return c.id === id; }); };

  /* 襲撃は「怪異のスピード」を人間へ、「人間のスピード」を怪異へ与えます。
     どちらも体力以上なら相打ちです。 */
  const cases = [
    ['寂しがる市松人形', 'village_ichimatsu', '屋敷の令嬢 エリーゼ', 'mansion_elise'],
    ['地下室に棲むキメラ', 'mansion_chimera', '放課後の帰り道 スミレ', 'village_sumire'],
  ];
  cases.forEach(function (row) {
    const a = card(row[1]), d = card(row[3]);
    check(row[0] + 'の攻撃で' + row[2] + 'がロストする',
      d.hp - a.speed <= 0, '体力' + d.hp + ' − スピード' + a.speed);
    check(row[0] + 'も反撃でトラッシュへ行く',
      a.hp - d.speed <= 0, '体力' + a.hp + ' − スピード' + d.speed);
  });
}

console.log('\n■ 無理な指示は、正直に失敗を返す');
{
  G.Game.start('village', 'TUTORIAL-BASIC', DECKS);
  const ok = TutorialDeck.apply('village', { hand: ['mansion_chimera'] });
  check('デッキに無いカードは作れない', ok === false);
  check('それでも枚数は壊れない',
    G.Game.state.players.village.hand.length === 5,
    G.Game.state.players.village.hand.length + '枚');

  const ok2 = TutorialDeck.stackTop('village', ['mansion_emma']);
  check('山札にも無ければ失敗を返す', ok2 === false);
}

console.log('\n■ ★対戦の途中の盤面を組み立てる（v0.6・仕様書 21.2）');
{
  /* 実践編は対戦のはじめからではなく、途中から始まります。
     その盤面を、ルール処理に触れずに外から作れるかを見ます。 */
  const V = {
    humans: ['village_haruka'],
    youkai: [],
    hand: ['village_flashlight', 'village_ichimatsu', 'village_ofuda',
           'event_kyoukaisen', 'village_nushi'],
    energy: 2,
  };
  const M = {
    humans: ['mansion_sylvie', 'mansion_emma'],
    youkai: ['mansion_chimera'],
  };

  G.Game.start('village', 'TUTORIAL-ADVANCED', DECKS);
  const beforeV = censusText('village');
  const beforeM = censusText('mansion');

  check('自分の盤面を作れる', TutorialDeck.applySnapshot('village', V) === true);
  check('相手の盤面を作れる', TutorialDeck.applySnapshot('mansion', M) === true);
  check('追跡の関係も作れる',
    TutorialDeck.setTracking('mansion', 'mansion_chimera', 'village', 'village_haruka') === true);

  const problems = TutorialDeck.verifySnapshot('village', V)
    .concat(TutorialDeck.verifySnapshot('mansion', M));
  check('★仕様書21.2の盤面と完全に一致', problems.length === 0, problems.join(' / '));

  const p = G.Game.state.players.village;
  const m = G.Game.state.players.mansion;

  check('あなたの人間はハルカだけ', p.humans.length === 1 &&
    p.humans[0].cardId === 'village_haruka', names(p.humans));
  check('★主人公スミレは場から外れている',
    !p.humans.some(function (c) { return c.cardId === 'village_sumire'; }),
    '仕様書21.2に載っていないため');
  check('★主人公エリーゼも場から外れている',
    !m.humans.some(function (c) { return c.cardId === 'mansion_elise'; }));
  check('あなたの怪異は空', p.youkai.length === 0);
  check('気力は2', p.energy === 2, String(p.energy));
  check('相手の怪異はキメラ', m.youkai.length === 1 &&
    m.youkai[0].cardId === 'mansion_chimera');

  const t = G.Game.state.tracking.mansion;
  check('キメラがハルカを追跡している',
    !!t && t.youkai.cardId === 'mansion_chimera' && t.human.cardId === 'village_haruka');
  check('追跡の印が両方に付いている', !!t && t.youkai.tracking && t.human.tracking);

  check('★あなたの40枚の内訳が変わらない', censusText('village') === beforeV);
  check('★相手の40枚の内訳が変わらない', censusText('mansion') === beforeM);
  check('あなたの合計が40枚', totalOf('village') === 40, totalOf('village') + '枚');
  check('相手の合計が40枚', totalOf('mansion') === 40, totalOf('mansion') + '枚');
}

console.log('\n■ グッズを付けた状態も作れる');
{
  G.Game.start('village', 'TUTORIAL-ADVANCED', DECKS);
  const V = {
    humans: ['village_haruka'],
    hand: ['village_ichimatsu', 'village_ofuda', 'event_kyoukaisen',
           'village_nushi', 'village_luna'],
    equip: [{ goods: 'village_flashlight', on: 'village_haruka' }],
    energy: 2,
  };
  check('グッズ付きの盤面を作れる', TutorialDeck.applySnapshot('village', V) === true);
  check('指示どおりになっている',
    TutorialDeck.verifySnapshot('village', V).length === 0,
    TutorialDeck.verifySnapshot('village', V).join(' / '));

  const haruka = G.Game.state.players.village.humans[0];
  check('ハルカに懐中電灯が付いている',
    !!haruka.equippedGoods && haruka.equippedGoods.cardId === 'village_flashlight');
  check('グッズ側も相手を覚えている',
    haruka.equippedGoods.equippedTo === haruka);
  check('★枚数は40枚のまま', totalOf('village') === 40, totalOf('village') + '枚');
}

console.log('\n' + (fail === 0
  ? '===== チュートリアルの仕込み：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
