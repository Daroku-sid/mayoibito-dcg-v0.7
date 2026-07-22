/* =====================================================================
   battle-deck-tests.js ―― 自作デッキで対戦する（v0.4 Stage F・仕様書 17・30.6）
   ===================================================================== */
const fs = require('fs'), vm = require('vm');
const { loadGame } = require('./test-harness.js');
const G = loadGame('.');
const { playGameHeadless } = require('./headless-driver.js');

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

function boot() {
  const mem = {};
  const ctx = vm.createContext({
    window: { localStorage: {
      getItem: k => mem[k] === undefined ? null : mem[k],
      setItem: (k, v) => { mem[k] = String(v); } } },
    JSON, console, Date, Math, isFinite, String, Number, Array, Object,
    CARD_MASTER: G.CARD_MASTER, DECKS: G.DECKS, APP_VERSION: '0.4.0',
    RuntimeDecks: G.RuntimeDecks,
  });
  ['save-manager.js', 'collection.js', 'card-filter.js', 'deck-validator.js',
   'deck-manager.js'].forEach(f => vm.runInContext(fs.readFileSync('js/' + f, 'utf8'), ctx));
  const S = vm.runInContext('SaveManager', ctx);
  const C = vm.runInContext('Collection', ctx);
  S.load(); C.grantInitialIfNeeded();
  return { S, C, D: vm.runInContext('DeckManager', ctx), V: vm.runInContext('DeckValidator', ctx) };
}

/** 陣営混成の完成デッキを1つ作る */
function makeMixed(D) {
  const deck = D.copy(D.officialDecks()[0]).deck;
  deck.name = '混成テスト';
  deck.mainDeck.find(e => e.cardId === 'village_luna').count = 1;
  deck.mainDeck.find(e => e.cardId === 'village_kohaku').count = 1;
  deck.mainDeck.push({ cardId: 'mansion_chimera', count: 4 });
  deck.mainDeck.push({ cardId: 'mansion_armor', count: 2 });
  D.update(deck);
  return deck;
}

console.log('■ AIの指し手が変わっていない（v0.5.9でAIを入れ替えたので、その版の指紋）');
{
  /* ★この指紋は「AIの指し手」の指紋です。
     AIを賢くすると、ルールを変えていなくても変わります。

     ルール処理そのものが変わっていないことは、
     tests/rules-fingerprint-tests.js が
     AIを使わない決め打ちの手順で確かめています。
     役割が違うので、両方あることに意味があります。

       ここ            … AIの指し手が意図せず変わっていないか
       rules-fingerprint … ルール処理そのものが変わっていないか

     v0.3.3〜v0.5.8 は aa48cd79dfb51a7f でした。
     v0.5.9 で新しいAIに入れ替えたため、値が変わっています。
     このときルール処理の指紋は動いていません（＝ルールは無傷）。 */
  let sig = [];
  for (let i = 0; i < 40; i++) {
    const r = playGameHeadless(G, { firstSide: (i % 2) ? 'village' : 'mansion',
                                    seed: 'REG-' + i, difficulty: 'strong' });
    sig.push(r.over ? r.over.winner + ':' + r.over.turnCount : 'none');
    sig.push(G.Game.state.log.length);
  }
  const hash = require('crypto').createHash('sha1').update(sig.join('|')).digest('hex').slice(0, 16);
  check('AIの指し手の指紋が v0.5.9 と同じ', hash === 'df62b9286de43336', hash);
}

console.log('\n■ 自作デッキを対戦へ渡す（仕様書 17）');
{
  const { D, V } = boot();
  const mixed = makeMixed(D);
  check('混成デッキが40枚で使える', V.check(mixed).usable, V.check(mixed).problems.join('／'));

  const def = D.toBattleDef(mixed);
  check('対戦用の形に変換できる', !!def);
  check('40枚ぶんある', def.mainDeck.reduce((a, e) => a + e.count, 0) === 40);
  check('カードIDの名前が対戦側に合わせてある', def.mainDeck.every(e => 'id' in e && 'count' in e));
  check('主人公が設定される', def.initialHuman === 'village_sumire', def.initialHuman);
  check('フィールドが引き継がれる', def.fieldId === 'field_village');
  check('デッキ名が表示名になる', def.label === '混成テスト');

  const decks = D.prepareForBattle({ village: mixed.id, mansion: 'official_mansion' });
  check('自席は自作デッキのID', decks.village === mixed.id, decks.village);
  check('相手席は公式のキー', decks.mansion === 'mansion', decks.mansion);
  check('自作デッキが対戦側へ預けられる', !!G.RuntimeDecks.get(mixed.id));
  check('公式は decks.js のまま', G.RuntimeDecks.get('mansion') === G.DECKS.mansion);

  // 使えないデッキは既定へ戻す
  const broken = D.create(null, '作りかけ').deck;
  const d2 = D.prepareForBattle({ village: broken.id, mansion: 'official_mansion' });
  check('使えないデッキを選んでも落ちない', d2.village === 'village', d2.village);
}

console.log('\n■ 自作デッキで最後まで対戦できる（仕様書 30.6）');
{
  const { D } = boot();
  const mixed = makeMixed(D);
  let done = 0, wins = 0, turns = 0;
  for (let i = 0; i < 30; i++) {
    const decks = D.prepareForBattle({ village: mixed.id, mansion: 'official_mansion' });
    const r = playGameHeadless(G, { firstSide: (i % 2) ? 'village' : 'mansion',
      seed: 'MIX-' + i, difficulty: 'strong', decks: decks });
    if (r.over) { done++; turns += r.over.turnCount; if (r.over.winner === 'village') wins++; }
  }
  check('30戦すべてが決着する', done === 30, done + '/30');
  check('勝率が極端でない', wins > 3 && wins < 27, (wins / done * 100).toFixed(1) + '%');
  check('ターン数が妥当', turns / done > 4 && turns / done < 40, (turns / done).toFixed(1) + 'ターン');

  // 自作どうし（ひとり回し：仕様書 17.2）
  const other = D.copy(D.officialDecks()[1]).deck;
  other.name = '自作の洋館';
  D.update(other);
  let ok = 0;
  for (let i = 0; i < 10; i++) {
    const decks = D.prepareForBattle({ village: mixed.id, mansion: other.id });
    const r = playGameHeadless(G, { firstSide: 'village', seed: 'BOTH-' + i,
      difficulty: 'strong', decks: decks });
    if (r.over) ok++;
  }
  check('自作どうしでも対戦できる（仕様書 17.2）', ok === 10, ok + '/10');
}

console.log('\n■ 同じシードなら同じ対戦になる');
{
  const { D } = boot();
  const mixed = makeMixed(D);
  const run = function () {
    const decks = D.prepareForBattle({ village: mixed.id, mansion: 'official_mansion' });
    const r = playGameHeadless(G, { firstSide: 'village', seed: 'SAME', difficulty: 'strong', decks: decks });
    return (r.over ? r.over.winner + ':' + r.over.turnCount : 'none') + '/' + G.Game.state.log.length;
  };
  check('自作デッキでも再現する', run() === run(), run());
}

console.log('\n■ 選べる範囲（仕様書 17.1・17.3）');
{
  const { D } = boot();
  makeMixed(D);
  D.create(null, '作りかけ');

  const usable = D.usableDecks();
  check('使えるデッキだけを取り出せる', usable.every(d => true) && usable.length === 3,
    usable.map(d => d.name).join('、'));
  check('作りかけは含まれない', usable.every(d => d.name !== '作りかけ'));

  const cpu = D.cpuDecks();
  check('CPUは公式だけ（仕様書 17.1）', cpu.length === 2 && cpu.every(d => d.official),
    cpu.map(d => d.name).join('、'));
  check('CPUに自作は含まれない', cpu.every(d => d.name !== '混成テスト'));
}

console.log('\n■ 画面の作り（仕様書 17.5・30.6）');
{
  const html = fs.readFileSync('index.html', 'utf8');
  const css = fs.readFileSync('css/layout.css', 'utf8');
  const ui = fs.readFileSync('js/deck-picker-ui.js', 'utf8');
  const sc = fs.readFileSync('js/screens.js', 'utf8');

  check('デッキ選択の画面がある', html.indexOf('data-screen="deck-pick"') !== -1);
  check('CPU対戦でカード型から選ぶ（仕様書 17.5）',
    html.indexOf('data-pick="cpu.playerDeck"') !== -1 &&
    html.indexOf('data-pick="cpu.cpuDeck"') !== -1);
  check('ひとり回しも両方カード型', 
    html.indexOf('data-pick="solo.deck1"') !== -1 &&
    html.indexOf('data-pick="solo.deck2"') !== -1);
  check('文字だけの選択肢は残っていない',
    html.indexOf('data-opt="playerDeck"') === -1 &&
    html.indexOf('data-opt="deck1"') !== -1);   // 観戦は公式のみなので残す
  check('選んでいるデッキの絵が出る', /\.dpick__img/.test(css));

  check('CPUには自作を出さない', /target === 'cpu\.cpuDeck'/.test(ui) &&
    ui.indexOf('DeckManager.officialDecks()') !== -1);
  check('使えないデッキは押せない', ui.indexOf('is-locked') !== -1);
  check('押したときに理由を出す', ui.indexOf('DeckValidator.shortReason') !== -1);
  check('開始前に使えるか確かめる', /DeckPickerUI\.ensureUsable/.test(sc));
  check('CPU対戦で自作デッキを渡す', /DeckManager\.prepareForBattle\(\{ village: c\.playerDeck/.test(sc));
  check('ひとり回しでも渡す', /DeckManager\.prepareForBattle\(\{ village: s\.deck1/.test(sc));

  const as = fs.readFileSync('js/assets.js', 'utf8');
  check('自作デッキの画像も先読みする', as.indexOf('deckDefOf') !== -1);
}

console.log('\n' + (fail === 0
  ? '===== 自作デッキで対戦：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
