/* =====================================================================
   ai-compare.js  ―― 新しいAIと、前のAIを直接戦わせて強さを測る
   ---------------------------------------------------------------------
   【なぜ直接戦わせるのか】
   両方を新しくしてから勝率を見ても、強くなったかは分かりません。
   おたがい強くなれば、勝率は元のままだからです。

   そこで、同じ対戦の中で
     片方の席は 新しい考え方、もう片方は 前の考え方
   で指させます。盤面もルールも共通なので、差がそのまま出ます。

   【やり方】
   新旧の ai-heuristic.js と ai-player.js を、名前を変えて
   ひとつの場に同居させます。前の版は ...Old という名前になります。

   前の版は ../oldai/js に置いてください。
   置いていなければ、この比較は飛ばします。

   使い方： node tests/ai-compare.js [1組あたりの対戦数]
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OLD_DIR = path.join(ROOT, '..', 'oldai', 'js');

if (!fs.existsSync(path.join(OLD_DIR, 'ai-heuristic.js'))) {
  console.log('前のAIが見つかりません（' + OLD_DIR + '）。比較を飛ばします。');
  process.exit(0);
}

const read = function (p) { return fs.readFileSync(p, 'utf8'); };
/** module.exports の行を外す（ブラウザ用の書き方だけ残す） */
const strip = function (src) {
  return src.replace(/if \(typeof module[\s\S]*$/, '');
};

/* --- 前の版を、名前を変えて同じ場に置きます --- */
/* 前の版の「その場かぎりの名前」を、ぜんぶ ..._OLD にずらします。
   同じ名前が2つあると読み込めないためです（AI_CARD など）。 */
function renameTopLevel(src, extra) {
  const names = [];
  src.replace(/^\s*const\s+([A-Za-z_$][\w$]*)/gm, function (m, n) {
    if (names.indexOf(n) === -1) names.push(n);
    return m;
  });
  (extra || []).forEach(function (n) {
    if (names.indexOf(n) === -1) names.push(n);
  });
  let out = src;
  names.forEach(function (n) {
    out = out.replace(new RegExp('\\b' + n + '\\b(?!_OLD)', 'g'), n + '_OLD');
  });
  return { src: out, names: names };
}

const h = renameTopLevel(strip(read(path.join(OLD_DIR, 'ai-heuristic.js'))));
const oldHeuristic = h.src;

const pl = renameTopLevel(
  strip(read(path.join(OLD_DIR, 'ai-player.js'))).replace(/\bAiHeuristic\b/g, 'AiHeuristic_OLD')
);
const oldPlayer = pl.src;

const files = ['events.js', 'cards.js', 'decks.js', 'random.js', 'effects.js',
               'game.js', 'ai-core.js', 'ai-heuristic.js', 'ai-deckstack.js',
               'ai-player.js', 'ai-uiops.js'];

const merged = files.map(function (f) { return read(path.join(ROOT, 'js', f)); })
  .join('\n;\n') +
  '\n;\n' + oldHeuristic + '\n;\n' + oldPlayer +
  '\n;\n({ Game: Game, AiPlayer: AiPlayer, AiPlayerOld: AiPlayer_OLD, ' +
  'AiUiOps: AiUiOps, AiDeckStack: AiDeckStack, CARD_MASTER: CARD_MASTER, ' +
  'DECKS: DECKS, RuntimeDecks: RuntimeDecks, GameEvents: GameEvents })';

const ctx = vm.createContext({ console: console, Math: Math, JSON: JSON, Date: Date });
let G;
try {
  G = vm.runInContext(merged, ctx, { filename: 'compare.js' });
} catch (e) {
  console.log('新旧を同居させられませんでした：' + e.message);
  process.exit(1);
}

const { playGameHeadless } = require('./headless-driver.js');

/* --- 対戦させる --- */
const N = Number(process.argv[2] || 80);

function duel(level, n) {
  let newWins = 0, done = 0, draws = 0;

  for (let i = 0; i < n; i++) {
    /* 席と先攻を入れ替えながら戦わせます。
       新しいAIが有利な側に固定されないようにするためです。 */
    const newIsVillage = (i % 2 === 0);
    const firstSide = (i % 4 < 2) ? 'village' : 'mansion';
    const seed = 'CMP-' + level + '-' + i;

    const mk = function (side, isNew) {
      const maker = isNew ? G.AiPlayer : G.AiPlayerOld;
      return maker.create(side, level, seed + ':' + side.charAt(0));
    };

    const ais = {
      village: mk('village', newIsVillage),
      mansion: mk('mansion', !newIsVillage),
    };

    let r;
    try {
      r = playGameHeadless(G, { firstSide: firstSide, seed: seed, ais: ais });
    } catch (e) {
      continue;
    }
    if (!r || !r.over) continue;

    done++;
    const newSide = newIsVillage ? 'village' : 'mansion';
    if (r.over.winner === newSide) newWins++;
    else if (!r.over.winner) draws++;
  }
  return { newWins: newWins, done: done, draws: draws };
}

console.log('新しいAI 対 前のAI（同じ難易度どうし・席と先攻を入れ替え）');
console.log('1組あたり ' + N + ' 戦\n');

let ran = false;
['weak', 'normal', 'strong', 'expert', 'unfair'].forEach(function (level) {
  const r = duel(level, N);
  if (r.done === 0) { console.log('  ' + level + '：対戦できませんでした'); return; }
  ran = true;
  const pct = Math.round(r.newWins / r.done * 100);
  const mark = pct > 55 ? '★新しいAIが強い'
             : (pct < 45 ? '★前のAIが強い' : '差は小さい');
  console.log('  ' + level.padEnd(7) + ' → 新しいAIの勝率 ' + String(pct).padStart(3) +
    '%  (' + r.newWins + '/' + r.done + ')  ' + mark);
});

if (!ran) {
  console.log('\n対戦を進められませんでした。仕組みの見直しが要ります。');
  process.exit(1);
}
console.log('\n50%なら互角、100%に近いほど新しいAIが強いという意味です。');
