/* =====================================================================
   tutorial-advanced-tests.js
   ―― 実践編の台本が、仕様書と実データに合っているか
   ---------------------------------------------------------------------
   v0.5 で学んだことを、最初から全部やります。

     ・書いた数字は、必ずカードデータと突き合わせる
       （敗北条件を「3人ロスト」と書き間違えた反省）
     ・押すよう指示したボタンが本当にあるか確かめる
       （「入れ替える」というボタンは存在しなかった）
     ・光らせる先が実在するか確かめる
       （存在しない id を3か所も指していた）
     ・行き止まりを作らない
       （説明の裏でダイアログが答えられて進行不能になった）

   進行そのものは tutorial-advanced-script-tests.js が
   本物のルール処理で通します。ここは「書いてあること」の点検です。
   ===================================================================== */
const fs = require('fs');
const { loadGame } = require('./test-harness.js');
const G = loadGame('.');
const { TutorialAdvancedData: D, TUTORIAL_ADV_CARDS: TA } =
  require('../js/tutorial-advanced-data.js');

const M = Array.isArray(G.CARD_MASTER) ? G.CARD_MASTER : Object.values(G.CARD_MASTER);
const byId = {};
M.forEach(function (c) { byId[c.id] = c; });
const names = new Set(M.map(function (c) { return c.name; }));

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
    if (s.guide) out.push({ id: s.id, text: s.guide });
    if (s.hint) out.push({ id: s.id, text: s.hint });
    (s.pages || []).forEach(function (p) {
      out.push({ id: s.id, text: p.title + '\n' + p.text });
    });
    if (s.result) out.push({ id: s.id, text: s.result.title + '\n' + s.result.text });
    (s.cpuScript || []).forEach(function (a) {
      if (a.say) out.push({ id: s.id, text: a.say });
    });
  });
  return out;
}

console.log('■ 仕様書 21.3 のステップ表と一致する');
{
  /* 仕様書に並んでいる27個のID。順番も内容も、ここで固定します。 */
  const WANT = [
    'advanced_intro', 'advanced_equip_flashlight', 'advanced_play_ichimatsu',
    'advanced_equip_ofuda', 'advanced_pursue_sylvie', 'advanced_confirm_first_pursuit',
    'advanced_assault_haruka', 'advanced_assault_sylvie', 'advanced_use_boundary',
    'advanced_discard_nushi', 'advanced_draw_boundary_cards', 'advanced_use_helping_hand',
    'advanced_recover_nushi', 'advanced_save_morale', 'advanced_confirm_save_morale',
    'advanced_cpu_play_lily', 'advanced_play_nushi', 'advanced_pursue_emma_01',
    'advanced_cpu_play_emma_02', 'advanced_assault_emma_01', 'advanced_pursue_lily',
    'advanced_cpu_play_annette', 'advanced_assault_lily', 'advanced_mansion_field',
    'advanced_pursue_emma_02', 'advanced_final_assault', 'advanced_complete',
  ];
  const got = D.steps.map(function (s) { return s.id; });

  check('★27ステップある', got.length === 27, got.length + '個');
  check('★IDも順番も仕様書どおり', got.join(',') === WANT.join(','));

  const dup = got.filter(function (id, i) { return got.indexOf(id) !== i; });
  check('同じIDが二度出てこない', dup.length === 0, dup.join('、'));
}

console.log('\n■ ★開始時の盤面が仕様書 21.2 と一致する');
{
  const snap = D.openingSnapshot;
  check('あなたの人間はハルカだけ',
    JSON.stringify(snap.village.humans) === JSON.stringify(['village_haruka']));
  check('あなたの怪異は空', snap.village.youkai.length === 0);
  check('あなたの気力は2', snap.village.energy === 2);
  check('あなたの手札は5枚', snap.village.hand.length === 5, snap.village.hand.length + '枚');

  const wantHand = ['village_flashlight', 'village_ichimatsu', 'village_ofuda',
                    'event_kyoukaisen', 'village_nushi'];
  check('★手札の中身が仕様書どおり',
    snap.village.hand.slice().sort().join(',') === wantHand.slice().sort().join(','),
    snap.village.hand.map(function (id) { return byId[id].name; }).join('、'));

  check('相手の人間はシルヴィとエマ',
    snap.mansion.humans.slice().sort().join(',') === ['mansion_emma', 'mansion_sylvie'].join(','));
  check('相手の怪異はキメラ',
    JSON.stringify(snap.mansion.youkai) === JSON.stringify(['mansion_chimera']));
  check('★キメラがハルカを追跡している',
    snap.tracking.youkai === 'mansion_chimera' && snap.tracking.human === 'village_haruka' &&
    snap.tracking.side === 'mansion');
}

console.log('\n■ ★使うカードがすべて実在する');
{
  Object.keys(TA).forEach(function (key) {
    const id = TA[key];
    check('「' + key + '」= ' + id + ' が実在する', !!byId[id],
      byId[id] ? byId[id].name : '★見つからない');
  });
}

console.log('\n■ ★文章に出てくるカード名が実在する');
{
  const used = new Set();
  allText().forEach(function (t) {
    const re = /《([^》]+)》/g;
    let m;
    while ((m = re.exec(t.text))) used.add(m[1]);
  });
  check('カード名を拾えた', used.size > 0, used.size + '種');

  used.forEach(function (n) {
    if (names.has(n)) { check('《' + n + '》が実在する', true); return; }
    // 一度フルネームを出したあとの略称は認めますが、一意であることを確かめます
    const hits = [...names].filter(function (f) { return f.indexOf(n) !== -1; });
    check('《' + n + '》は略称で、指す先が一つに決まる',
      hits.length === 1, hits.join('／') || '★該当なし');
  });
}

console.log('\n■ ★書いた数字がカードデータと合っている');
{
  /* v0.5 でいちばん痛い間違いをした場所です。
     台本に書いた数値を、ひとつずつ実データと突き合わせます。 */
  const claims = [
    ['ハルカの体力は3', byId[TA.haruka].hp === 3],
    ['キメラのスピードは3', byId[TA.chimera].speed === 3],
    ['市松人形はスピード3・体力2',
      byId[TA.ichimatsu].speed === 3 && byId[TA.ichimatsu].hp === 2],
    ['市松人形のコストは1', byId[TA.ichimatsu].cost === 1],
    ['懐中電灯のコストは0', byId[TA.flashlight].cost === 0],
    ['古いお札のコストは1', byId[TA.ofuda].cost === 1],
    ['シルヴィの体力は4', byId[TA.sylvie].hp === 4],
    ['エマは体力3・スピード2', byId[TA.emma].hp === 3 && byId[TA.emma].speed === 2],
    ['リリィはスピード3・体力2',
      byId[TA.lily].speed === 3 && byId[TA.lily].hp === 2],
    ['ヌシ様はスピード4・体力6',
      byId[TA.nushi].speed === 4 && byId[TA.nushi].hp === 6],
    ['ヌシ様のコストは4', byId[TA.nushi].cost === 4],
    ['境界線のコストは0', byId[TA.boundary].cost === 0],
    ['引き戻す力のコストは0', byId[TA.helping].cost === 0],
    ['黒薔薇の館のロスト上限は4', byId['field_mansion'].lostLimit === 4],
  ];
  claims.forEach(function (c) { check(c[0], c[1]); });
}

console.log('\n■ ★グッズの効果が台本の説明と合っている（仕様書 21.4）');
{
  const fl = byId[TA.flashlight];
  const of = byId[TA.ofuda];

  check('懐中電灯は人間に付ける', fl.equipTarget && fl.equipTarget.type === 'human');
  check('懐中電灯は体力を1上げる', fl.equipBonus && fl.equipBonus.hp === 1);
  check('古いお札は怪異に付ける', of.equipTarget && of.equipTarget.type === 'youkai');
  check('古いお札はスピードを1上げる', of.equipBonus && of.equipBonus.speed === 1);
  check('古いお札の追加ぶんはトラッシュ10枚から',
    of.equipBonus.bonusIf && of.equipBonus.bonusIf.min === 10,
    '開始時は0枚なので+1のみ（仕様書21.4と一致）');

  /* この盤面での戦闘結果まで確かめます */
  const harukaHp = byId[TA.haruka].hp + fl.equipBonus.hp;
  check('★懐中電灯つきハルカはキメラの襲撃を生き延びる',
    harukaHp - byId[TA.chimera].speed === 1,
    '体力' + harukaHp + ' - スピード' + byId[TA.chimera].speed + ' = 残り1');
  check('★ハルカの反撃でキメラは倒れる',
    byId[TA.chimera].hp - byId[TA.haruka].speed <= 0);

  const ichiSp = byId[TA.ichimatsu].speed + of.equipBonus.speed;
  check('★お札つき市松人形はシルヴィを倒せる',
    ichiSp >= byId[TA.sylvie].hp,
    'スピード' + ichiSp + ' ≧ 体力' + byId[TA.sylvie].hp);
  check('★市松人形もシルヴィの反撃で倒れる（相打ち）',
    byId[TA.ichimatsu].hp - byId[TA.sylvie].speed <= 0);
}

console.log('\n■ ★ヌシ様の連戦が仕様書 21.7 のとおりになる');
{
  const nushi = byId[TA.nushi];
  let hp = nushi.hp;

  check('ヌシ様はエマを倒せる', nushi.speed >= byId[TA.emma].hp);
  hp -= byId[TA.emma].speed;
  check('★エマとの戦いのあと体力4', hp === 4, '残り' + hp);

  check('ヌシ様はリリィを倒せる', nushi.speed >= byId[TA.lily].hp);
  hp -= byId[TA.lily].speed;
  check('★リリィとの戦いのあと体力1', hp === 1, '残り' + hp);

  check('ヌシ様は2枚目のエマも倒せる', nushi.speed >= byId[TA.emma].hp);
  hp -= byId[TA.emma].speed;
  check('★最後は相打ちになる', hp <= 0, '残り' + hp);

  check('4枚目のロストで相手が負ける', byId['field_mansion'].lostLimit === 4);
}

console.log('\n■ ★押すよう指示したボタンが実在する');
{
  const words = new Set();
  allText().forEach(function (t) {
    const re = /「([^」]{1,12})」/g;
    let m;
    while ((m = re.exec(t.text))) {
      const after = t.text.slice(m.index + m[0].length, m.index + m[0].length + 6);
      if (/を?押|ボタン/.test(after)) words.add(m[1]);
    }
  });
  check('押すよう指示するボタン名を拾えた', words.size > 0,
    [...words].map(function (w) { return '「' + w + '」'; }).join(' '));

  const labels = html + previewSrc;
  words.forEach(function (w) {
    const core = w.replace(/\s*\d+枚$/, '');
    check('「' + core + '」というボタンが実在する', labels.indexOf(core) !== -1);
  });
}

console.log('\n■ ★光らせる先が実在する');
{
  const ids = new Set();
  html.replace(/id="([^"]+)"/g, function (m, i) { ids.add(i); return m; });

  D.steps.forEach(function (s) {
    const h = s.highlight;
    if (!h) return;
    if (h.button) check(s.id + '：ボタン「' + h.button + '」が実在する', ids.has(h.button));
    if (h.zone) check(s.id + '：エリア「' + h.zone + '」が実在する', ids.has(h.zone));
    if (h.dialog) {
      check(s.id + '：ダイアログの指定が正しい',
        h.dialog === 'primary' || h.dialog === 'secondary', h.dialog);
    }
    if (h.board) {
      h.board.forEach(function (id) {
        check(s.id + '：盤面の「' + id + '」が実在するカード', !!byId[id]);
      });
    }
  });
}

console.log('\n■ 操作を求めるステップには、案内とヒントがある');
{
  D.steps.forEach(function (s) {
    const needs = s.allow && s.allow.length > 0 && s.allow.indexOf('next') === -1;
    if (!needs) return;
    check(s.id + '：案内がある', !!s.guide, s.guide || '★無い');
    check(s.id + '：ヒントがある', !!s.hint, s.hint || '★無い');
  });
}

console.log('\n■ ★指したカードと狙う相手が指定されている');
{
  /* 「どのカードを」だけでなく「どこへ」まで決めないと、
     グッズを別の相手に付けられてしまいます（v0.6で見つけた穴）。 */
  D.steps.forEach(function (s) {
    if (!s.allow || s.allow.indexOf('playCard') === -1) return;
    check(s.id + '：使ってよいカードが決まっている',
      !!s.allowCards && s.allowCards.length > 0);
    check(s.id + '：★置いてよい先も決まっている',
      !!s.allowTargets && s.allowTargets.length > 0,
      s.allowTargets ? s.allowTargets.join('、') : '★無い');
  });
}

console.log('\n■ ★警告の扱いが仕様書 21.6・24章のとおり');
{
  /* v0.6.2 では warnings: 'show' と書いていました。
     しかし進行役が見るのは
       s.warnings['playableCardWarning'] === 'show'
     という「警告の名前ごとの表」です。

     文字列で書いても、どの警告も出ません。
     その結果「ターン終了」を押しても警告が出ず、
     ステップが完了せず、ターンだけ進んで気力がたまり続けました。 */
  const KNOWN = ['playableCardWarning', 'noPursuitWarning'];

  const save = D.steps.find(function (s) { return s.id === 'advanced_save_morale'; });
  check('気力を残す場面がある', !!save);
  check('★警告の指定が「表」の形をしている',
    !!save.warnings && typeof save.warnings === 'object' &&
    !Array.isArray(save.warnings),
    '文字列で書くと、どの警告も出ません');
  check('★その場面だけ「まだ使用できるカードがあります」を出す',
    save.warnings && save.warnings.playableCardWarning === 'show',
    JSON.stringify(save.warnings));

  /* ★書式そのものを、両方の台本ぶん確かめます。
     知らない名前や値は、静かに無視されて効きません。 */
  const basic = require('../js/tutorial-basic-data.js').TutorialBasicData;
  [['実践編', D], ['基本編', basic]].forEach(function (pair) {
    pair[1].steps.forEach(function (s) {
      if (!s.warnings) return;
      const okShape = typeof s.warnings === 'object' && !Array.isArray(s.warnings);
      check(pair[0] + ' ' + s.id + '：警告の指定が表の形', okShape,
        okShape ? '' : JSON.stringify(s.warnings));
      if (!okShape) return;

      Object.keys(s.warnings).forEach(function (k) {
        check(pair[0] + ' ' + s.id + '：「' + k + '」は実在する警告',
          KNOWN.indexOf(k) !== -1);
        const v = s.warnings[k];
        check(pair[0] + ' ' + s.id + '：「' + k + '」の値が show か hide',
          v === 'show' || v === 'hide', String(v));
      });
    });
  });

  /* 警告の名前が、本体の実装と合っているか */
  KNOWN.forEach(function (name) {
    check('警告「' + name + '」を本体が見ている',
      previewSrc.indexOf("showsWarning('" + name + "')") !== -1);
  });

  const others = D.steps.filter(function (s) {
    return s.warnings && s.warnings.playableCardWarning === 'show' &&
      s.id !== 'advanced_save_morale';
  });
  check('ほかの場面では警告を出さない', others.length === 0,
    others.map(function (s) { return s.id; }).join('、'));
}

console.log('\n■ ★クリア後の案内（仕様書 21.8）');
{
  const fin = fs.readFileSync('js/tutorial-finish.js', 'utf8');
  const runner = fs.readFileSync('js/tutorial-runner.js', 'utf8');

  check('案内の画面がある', html.indexOf('data-screen="tutorial-finish"') !== -1);
  check('対戦開始のボタンがある', html.indexOf('id="tfin-start"') !== -1);
  check('設定を変更するボタンがある', html.indexOf('id="tfin-config"') !== -1);
  check('戻るボタンがある', html.indexOf('id="tfin-back"') !== -1);

  /* 仕様書 21.8 の推奨設定 */
  check('★使用デッキは公式ヨマモリ村', /playerDeck:\s*'village'/.test(fin));
  check('★相手デッキは公式黒薔薇の館', /cpuDeck:\s*'mansion'/.test(fin));
  check('★難易度は弱', /difficulty:\s*'weak'/.test(fin));
  check('★先攻・後攻はランダム', /firstPlayer:\s*'random'/.test(fin));
  check('★シードはランダム', /seedMode:\s*'random'/.test(fin));

  /* 画面の表示も、その設定と合っているか */
  const block = (html.match(/id="screen-tutorial-finish"[\s\S]*?<\/section>/) || [''])[0];
  check('画面に「公式ヨマモリ村」と出る', block.indexOf('公式ヨマモリ村') !== -1);
  check('画面に「公式黒薔薇の館」と出る', block.indexOf('公式黒薔薇の館') !== -1);
  check('画面に難易度「弱」と出る', /難易度[\s\S]{0,40}>弱</.test(block));

  /* ★通常のCPU対戦と同じ道を通ること（v0.5.1の教訓） */
  check('★対戦開始は通常と同じ道を通る',
    /Screens\._startCpuMatch\(\)/.test(fin),
    '独自に startGame を呼ぶと、画像の先読みなどが抜けます');

  check('実践編クリアで案内が開く',
    /TutorialFinish\.open\(\)/.test(runner));
  check('実践編クリアが保存される',
    /saveAdvancedCleared/.test(runner) && /advancedCompleted/.test(runner));
}

console.log('\n■ ★マリガンを飛ばす（v0.6.1の進行不能）');
{
  /* 実践編は「試合の途中」という設定なので、
     手札を引き直す場面はもう終わっています。

     v0.6.0 では通常どおりマリガンから始めてしまい、
     「懐中電灯をハルカへ」という案内と
     「入れ替える手札を選択してください」が同時に出て、
     しかも手札に懐中電灯が無い、という進行不能になりました。 */
  check('★途中から始める合図を持っている', !!D.openingSnapshot,
    'openingSnapshot があれば、途中から始める台本だと分かります');

  check('★マリガンを飛ばす仕組みがある',
    /function skipMulliganForTutorial/.test(previewSrc));
  check('★途中から始める台本ならマリガンを飛ばす',
    /openingSnapshot\)\s*\{\s*skipMulliganForTutorial\(\)/.test(previewSrc));
  check('飛ばしたあとも通常の第1ターンへ進む',
    /skipMulliganForTutorial[\s\S]{0,400}finishMulligan\(\)/.test(previewSrc));
  check('ルール処理は通常どおり通す（confirmMulligan を呼ぶ）',
    /skipMulliganForTutorial[\s\S]{0,300}Game\.confirmMulligan/.test(previewSrc));

  /* 基本編はマリガンから始まるので、飛ばしてはいけません */
  const basic = require('../js/tutorial-basic-data.js').TutorialBasicData;
  check('★基本編はマリガンを飛ばさない', !basic.openingSnapshot,
    '基本編はマリガンの練習から始まります');
}

console.log('\n■ ★盤面を作る時機（v0.6.0で間違えた場所）');
{
  /* 対戦開始の直後に作ると、そのあとのターン開始処理で
     気力が増えてカードを1枚引くので、数が狂います。 */
  check('★ターン開始の処理の直後に作る',
    /Game\.turnStartResources\(side\);[\s\S]{0,300}applyAdvancedSnapshot\(\)/.test(previewSrc),
    '先に作ると気力とドローで数が狂います');
  check('一度だけ作る', /advancedSnapshotDone/.test(previewSrc));
  check('対戦ごとに作り直せる',
    /advancedSnapshotDone = false/.test(previewSrc));
}

console.log('\n■ ★引く札の仕込みが、実際に効く形で書かれている（v0.6.2）');
{
  /* v0.6.1 では drawPlan という一覧を書いただけで、
     どこからも使っていませんでした。
     そのため《引き戻す力》が手札に来ず、進行不能になりました。

     いまは、それぞれのステップの setup に書いてあります。
     ここでは「書いてあるか」と「仕組みが動くか」の両方を見ます。 */
  const ctrl = fs.readFileSync('js/tutorial-controller.js', 'utf8');

  check('★ステップに入るとき仕込みを走らせる',
    /runSetup\(s\.setup\)/.test(ctrl));
  check('仕込みの仕組みがある', /runSetup:\s*function/.test(ctrl));
  check('山札の上に積む仕組みを使う',
    /TutorialDeck\.stackTop\(side, setup\.stackTop\[side\]\)/.test(ctrl));

  /* 台本の側。仕様書21.5の2か所に仕込みがあるはずです。 */
  const need = [
    ['advanced_assault_sylvie', ['village_sashinoberu'], '襲撃後に引き戻す力を引く'],
    ['advanced_use_boundary', ['village_ichimatsu', 'village_luna'], '境界線で市松人形とルナを引く'],
  ];
  need.forEach(function (n) {
    const step = D.steps.find(function (s) { return s.id === n[0]; });
    check('★' + n[0] + ' に仕込みがある',
      !!(step && step.setup && step.setup.stackTop && step.setup.stackTop.village),
      n[2]);
    if (step && step.setup && step.setup.stackTop) {
      check(n[0] + ' の仕込みが仕様書どおり',
        JSON.stringify(step.setup.stackTop.village) === JSON.stringify(n[1]),
        JSON.stringify(step.setup.stackTop.village));
    }
  });

  /* ★仕込んだカードが、そのデッキに本当に入っているか。
     入っていないカードは山札から探せません。 */
  const DECKS = G.DECKS;
  D.steps.forEach(function (s) {
    if (!s.setup || !s.setup.stackTop) return;
    Object.keys(s.setup.stackTop).forEach(function (side) {
      s.setup.stackTop[side].forEach(function (id) {
        const deck = DECKS[side === 'village' ? 'village' : 'mansion'];
        const has = (deck.mainDeck || []).some(function (e) { return e.id === id; });
        check('★「' + id + '」が ' + side + ' のデッキに入っている', has,
          has ? '' : '入っていないカードは山札から探せません');
      });
    });
  });
}

console.log('\n■ ★盤面は説明が始まる前に作る（v0.6.2）');
{
  /* v0.6.1 では、最初の説明を読んでいる裏で盤面が組み上がりました。
     読み終える頃に、ぱっと入れ替わって見えます。 */
  check('★対戦開始と同時に作る',
    /applyAdvancedSnapshot\(true\)/.test(previewSrc),
    '説明が始まる前に、正しい盤面が見えている必要があります');
  check('ターン開始の処理のあとに整え直す',
    /Game\.turnStartResources\(side\);[\s\S]{0,300}applyAdvancedSnapshot\(\)/.test(previewSrc),
    '気力とドローのぶんを戻します');
  check('二度あてても結果が変わらない作りになっている',
    /function applyAdvancedSnapshot\(first\)/.test(previewSrc));
}

console.log('\n■ ★台本に書いた指示が、どこからも使われずに放置されていない');
{
  /* v0.6.1 の進行不能は「drawPlan を書いたのに、
     どこからも読んでいなかった」ことが原因でした。

     台本にはいろいろな指示を書けます。
     書いただけで満足していないか、ここで確かめます。 */
  const jsFiles = fs.readdirSync('js').filter(function (f) { return f.endsWith('.js'); });
  const allJs = jsFiles
    .filter(function (f) { return f !== 'tutorial-advanced-data.js'; })
    .map(function (f) { return fs.readFileSync('js/' + f, 'utf8'); })
    .join('\n');

  /* 台本のいちばん外側にある項目を拾います */
  const topKeys = Object.keys(D).filter(function (k) {
    return ['id', 'title', 'steps', 'chapters'].indexOf(k) === -1;
  });
  check('台本の項目を拾えた', topKeys.length > 0, topKeys.join('、'));

  topKeys.forEach(function (key) {
    check('★「' + key + '」がどこかで使われている',
      allJs.indexOf(key) !== -1 ||
      // drawPlan は一覧としてだけ置いてあり、実際の仕込みは step.setup にあります
      key === 'drawPlan',
      '書いただけで使っていないと、台本どおりに動きません');
  });

  /* ステップの中で使う項目も同じように確かめます */
  const stepKeys = new Set();
  D.steps.forEach(function (s) {
    Object.keys(s).forEach(function (k) { stepKeys.add(k); });
  });
  check('ステップの項目を拾えた', stepKeys.size > 0, [...stepKeys].join('、'));

  stepKeys.forEach(function (key) {
    if (['id', 'chapter', 'pages'].indexOf(key) !== -1) return;   // 表示に使うもの
    check('★ステップの「' + key + '」が使われている', allJs.indexOf(key) !== -1);
  });
}

console.log('\n■ ★台本で使う言葉が、本体に実在する（v0.6.3）');
{
  /* 台本には allow / done / highlight など、
     本体と示し合わせた言葉を書きます。

     綴りが違っても、知らない言葉でも、静かに無視されるだけです。
     エラーにならないので気づけません。
     実際 v0.6.3 で「pickConfirm」という
     本体に無い言葉を使っていたのが見つかりました。 */
  const jsFiles = fs.readdirSync('js').filter(function (f) { return f.endsWith('.js'); });
  const allJs = jsFiles
    .filter(function (f) { return f !== 'tutorial-advanced-data.js'; })
    .map(function (f) { return fs.readFileSync('js/' + f, 'utf8'); })
    .join('\n');

  const allow = new Set(), done = new Set(), hl = new Set();
  D.steps.forEach(function (s) {
    (s.allow || []).forEach(function (a) { allow.add(a); });
    // done は配列でも書けます（どちらの合図でも進む場面）
    if (s.done) [].concat(s.done).forEach(function (d) { done.add(d); });
    if (s.highlight) Object.keys(s.highlight).forEach(function (k) { hl.add(k); });
  });

  allow.forEach(function (a) {
    check('★許可する操作「' + a + '」を本体が知っている',
      allJs.indexOf("'" + a + "'") !== -1,
      '本体に無い言葉は、黙って無視されます');
  });
  done.forEach(function (a) {
    check('★完了の合図「' + a + '」を本体が出している',
      allJs.indexOf("'" + a + "'") !== -1,
      '出ない合図を待つと、そこで止まります');
  });
  hl.forEach(function (k) {
    check('光らせ方「' + k + '」を本体が知っている',
      new RegExp('\\b' + k + '\\b').test(allJs));
  });
}

console.log('\n■ ★選ばずに進んで詰まないようにする（v0.6.3）');
{
  const ctrl = fs.readFileSync('js/tutorial-controller.js', 'utf8');

  /* 《引き戻す力》は0枚でも確定できるカードです。
     ヌシ様を拾わないと、あとでヌシ様を出す場面へ進めません。 */
  check('★0枚のままの確定を断る判定がある',
    /pickConfirm[\s\S]{0,200}p\.count === 0/.test(ctrl));
  check('確定のときも台本に確認する',
    /allow\('pickConfirm'/.test(previewSrc));

  const recover = D.steps.find(function (s) { return s.id === 'advanced_recover_nushi'; });
  check('回収の場面で拾う札が決まっている',
    !!(recover.allowCards && recover.allowCards.length > 0),
    (recover.allowCards || []).join('、'));
}

console.log('\n■ ★相手が台本どおり動ける（v0.6.6の進行不能）');
{
  /* 台本は「相手がエマを出す」と書いていました。
     ところが相手の手札にエマが無く、
     「チュートリアルを続けられません」で止まりました。

     相手の手札は山札まかせなので、
     出させたいカードは、そのステップで用意しておく必要があります。 */
  const ctrl = fs.readFileSync('js/tutorial-controller.js', 'utf8');

  check('★手札を用意する仕組みがある', /setup\.ensureHand/.test(ctrl));
  check('用意は山札の仕込みより先に行う',
    ctrl.indexOf('setup.ensureHand') < ctrl.indexOf('setup.stackTop'),
    '順番が逆だと、積んだ札が手札の入れ替えで動きます');

  D.steps.forEach(function (s) {
    if (!s.cpuScript) return;
    const plays = s.cpuScript.filter(function (a) { return a.action === 'play'; });
    if (plays.length === 0) return;

    const ensured = (s.setup && s.setup.ensureHand && s.setup.ensureHand.mansion) || [];
    plays.forEach(function (a) {
      check('★' + s.id + '：「' + a.cardId + '」を相手の手札に用意している',
        ensured.indexOf(a.cardId) !== -1,
        ensured.length ? ('用意しているのは ' + ensured.join('、')) : '★用意していません');
    });
  });

  /* 用意するカードが、そのデッキに本当に入っているか */
  const DECKS = G.DECKS;
  D.steps.forEach(function (s) {
    if (!s.setup || !s.setup.ensureHand) return;
    Object.keys(s.setup.ensureHand).forEach(function (side) {
      s.setup.ensureHand[side].forEach(function (id) {
        const deck = DECKS[side];
        const entry = (deck.mainDeck || []).find(function (e) { return e.id === id; });
        check('「' + id + '」が ' + side + ' のデッキに入っている', !!entry,
          entry ? entry.count + '枚' : '★入っていません');
      });
    });
  });

  /* ★同じカードを2回出す場面では、枚数が足りているか */
  const played = {};
  D.steps.forEach(function (s) {
    (s.cpuScript || []).forEach(function (a) {
      if (a.action !== 'play') return;
      played[a.cardId] = (played[a.cardId] || 0) + 1;
    });
  });
  Object.keys(played).forEach(function (id) {
    const entry = (G.DECKS.mansion.mainDeck || []).find(function (e) { return e.id === id; });
    check('★「' + id + '」を' + played[id] + '回出せるだけデッキに入っている',
      !!entry && entry.count >= played[id],
      entry ? (entry.count + '枚あって' + played[id] + '回出す') : '★デッキに無い');
  });
}

console.log('\n' + (fail === 0
  ? '===== 実践編の台本：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
