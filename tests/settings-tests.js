/* =====================================================================
   settings-tests.js ―― 設定・SE・保存（v0.3 Stage G）
   ===================================================================== */
const fs = require('fs'), vm = require('vm');

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

function makeStore(broken) {
  const mem = {};
  return {
    getItem: k => { if (broken) throw new Error('x'); return mem[k] === undefined ? null : mem[k]; },
    setItem: (k, v) => { if (broken) throw new Error('x'); mem[k] = String(v); },
    _mem: mem,
  };
}
function loadStorage(store) {
  const c = vm.createContext({ window: { localStorage: store }, JSON, console });
  // storage.js は save-manager.js の上の薄い層なので、両方を読み込む（v0.4 Stage A）
  return vm.runInContext(
    fs.readFileSync('js/save-manager.js', 'utf8') + '\n' +
    fs.readFileSync('js/storage.js', 'utf8') + '\n;Storage.save_ = SaveManager;\n;Storage', c);
}

console.log('■ 設定の保存と読み戻し（仕様書 24）');
{
  const store = makeStore();
  const S = loadStorage(store); S.load();
  check('既定はCPU標準・演出標準・SE ON・音量60',
    S.get('cpuActionSpeed') === 'normal' && S.get('animationSpeed') === 'normal' &&
    S.get('seEnabled') === true && S.get('seVolume') === 60);

  S.set('cpuActionSpeed', 'fast');
  S.set('seEnabled', false);
  S.set('seVolume', 25);

  const S2 = loadStorage(store); S2.load();
  check('再読み込み後も残っている',
    S2.get('cpuActionSpeed') === 'fast' && S2.get('seEnabled') === false && S2.get('seVolume') === 25);

  S2.remember({ cpuDifficulty: 'expert', playerDeck: 'mansion', seedMode: 'fixed' });
  const S3 = loadStorage(store); S3.load();
  check('前回のCPU設定も残る',
    S3.lastOf('cpuDifficulty') === 'expert' && S3.lastOf('playerDeck') === 'mansion',
    S3.lastOf('cpuDifficulty') + '/' + S3.lastOf('playerDeck'));

  S3.markGuideDone('hand');
  S3.resetSettings();
  check('設定の初期化で既定へ戻る',
    S3.get('cpuActionSpeed') === 'normal' && S3.get('seVolume') === 60);
  // 旧ガイドの記録は v0.4 で保存しなくなりました（仕様書 25.5）
  S3.save_.data.customDecks.push({ id: 'keep', name: '残るデッキ', mainDeck: [] });
  S3.save_.data.tutorial.basicCompleted = true;
  S3.resetSettings();
  check('設定の初期化は自作デッキやチュートリアル記録に触らない',
    S3.save_.data.customDecks.length === 1 && S3.save_.data.tutorial.basicCompleted === true);
}

console.log('\n■ おかしな値をしまわない');
{
  const store = makeStore();
  store.setItem('mayohibito.v03', JSON.stringify({
    storageSchemaVersion: 1,
    settings: { cpuActionSpeed: '超速', animationSpeed: 'fast', seVolume: 999, seEnabled: 'はい' },
  }));
  const S = loadStorage(store); S.load();
  check('知らない値は既定のまま', S.get('cpuActionSpeed') === 'normal');
  check('正しい値は取り込む', S.get('animationSpeed') === 'fast');
  check('範囲外の音量は無視', S.get('seVolume') === 60);
  check('型が違う値は無視', S.get('seEnabled') === true);
}

console.log('\n■ 効果音（仕様書 23）');
{
  const events = [];
  function node() {
    return {
      type: '', frequency: { setValueAtTime(){}, exponentialRampToValueAtTime(){} },
      gain: { setValueAtTime(){}, exponentialRampToValueAtTime(){} },
      connect(){}, start(){ events.push('start'); }, stop(){},
    };
  }
  let created = 0;
  const AC = function () {
    created++;
    return {
      state: 'running', currentTime: 0, destination: {},
      createOscillator: node, createGain: node, resume(){},
    };
  };
  const listeners = {};
  const c = vm.createContext({
    window: { AudioContext: AC },
    document: {
      addEventListener: (t, fn) => { listeners[t] = fn; },
      removeEventListener: () => {},
    },
    Date, Math, console,
  });
  const Se = vm.runInContext(fs.readFileSync('js/se.js', 'utf8') + '\n;Se', c);

  Se.setup();
  check('最初の操作より前に音を用意しない', created === 0);
  check('操作を待つ仕掛けがある', typeof listeners.pointerdown === 'function');

  listeners.pointerdown();
  check('最初の操作で用意される', created === 1 && Se.ready === true);

  events.length = 0;
  Se.play('attack');
  check('鳴らせる', events.length === 1);

  Se.play('attack');
  check('同じ音が続けて重ならない', events.length === 1, '連打しても1回');

  Se.play('damage');
  check('別の音は鳴る', events.length === 2);

  Se.enabled = false;
  events.length = 0;
  Se.play('win');
  check('OFFなら鳴らない', events.length === 0);
  Se.enabled = true;

  Se.volume = 0;
  events.length = 0;
  Se.play('lose');
  check('音量0でも鳴らない', events.length === 0);
  Se.volume = 0.6;

  check('推奨6種がそろっている',
    ['play','pursuit','attack','damage','win','lose'].every(k => !!Se.SOUNDS[k]),
    Object.keys(Se.SOUNDS).join('／'));
}

console.log('\n■ 音が使えない環境でも止まらない（仕様書 33-12）');
{
  const c = vm.createContext({
    window: {},   // AudioContext なし
    document: { addEventListener(){}, removeEventListener(){} },
    Date, Math, console,
  });
  const Se = vm.runInContext(fs.readFileSync('js/se.js', 'utf8') + '\n;Se', c);
  let err = null;
  try { Se.setup(); Se.unlock(); Se.play('attack'); Se.preview(); } catch (e) { err = e.message; }
  check('例外を投げずに進む', !err, err || '');
}

console.log('\n■ ★セーブデータの書き出し・読み込み（v0.6.10・仕様書26）');
{
  const fs2 = require('fs');
  const html2 = fs2.readFileSync('index.html', 'utf8');
  const sc = fs2.readFileSync('js/screens.js', 'utf8');
  const sm = fs2.readFileSync('js/save-manager.js', 'utf8');

  /* 仕組みは前からありましたが、画面から使えませんでした。
     ブラウザのデータが消えると取り返しがつかないので、
     設定画面から書き出せるようにしました。 */
  check('★書き出すボタンがある', html2.indexOf('id="opt-save-export"') !== -1);
  check('★読み込むボタンがある', html2.indexOf('id="opt-save-import"') !== -1);
  check('★すべて初期化のボタンがある', html2.indexOf('id="opt-save-reset"') !== -1);
  check('ファイルを選ぶ入れものがある', html2.indexOf('id="opt-save-file"') !== -1);
  check('JSONだけを選べるようにしている', /accept="application\/json/.test(html2));

  check('書き出しの中身がある', /exportText: function/.test(sm));
  check('読み込みの中身がある', /importText: function/.test(sm));
  check('ファイル名を作る仕組みがある', /exportFileName: function/.test(sm));

  check('★画面が書き出しを呼んでいる', /SaveManager\.exportText\(\)/.test(sc));
  check('★画面が読み込みを呼んでいる', /SaveManager\.importText\(/.test(sc));
  check('★画面が初期化を呼んでいる', /SaveManager\.reset\(\)/.test(sc));

  /* 上書きと初期化は、取り返しがつきません */
  const importPart = sc.slice(sc.indexOf("'opt-save-import'"),
                              sc.indexOf("'opt-save-reset'"));
  check('★読み込む前に、置き換わることを伝える',
    /置き換わります/.test(importPart),
    '選んだあとに知らせても遅いためです');

  const resetPart = sc.slice(sc.indexOf("'opt-save-reset'"));
  const confirms = (resetPart.match(/showDialog\(/g) || []).length;
  check('★初期化は二段階で確認する（仕様書26.3）', confirms >= 2,
    '確認は ' + confirms + ' 回');
  check('元に戻せないことを伝える', /元に戻せません/.test(resetPart));

  /* 読み込めなかったときに、黙って進まないこと */
  check('★読み込めなければ、いまのデータを残す',
    /いまのデータはそのまま/.test(sc));
  check('直した箇所があれば知らせる', /repairs/.test(sc));
}

console.log('\n' + (fail === 0
  ? '===== 設定・SE・保存：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
