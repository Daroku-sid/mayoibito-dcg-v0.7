/* =====================================================================
   release-metadata-tests.js
   ―― 版の表記が、どこを見ても同じかどうか
   ---------------------------------------------------------------------
   v0.6.9 まで、ブラウザのタブに出る題名が
   「マヨイビト v0.3」のまま取り残されていました。

   index.html に版を直接書いていたためです。
   版を上げるたびに手で直す決まりにしておくと、いつか必ず忘れます。

   いまは version.js の APP_VERSION から作るようにしました。
   ここでは、それが崩れていないかを見張ります。
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const version = require('../js/version.js');
const html = fs.readFileSync('index.html', 'utf8');
const versionSrc = fs.readFileSync('js/version.js', 'utf8');

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

const V = version.APP_VERSION;
const LABEL = version.APP_VERSION_LABEL;

console.log('■ アプリの版');
{
  check('APP_VERSION が読める', typeof V === 'string' && V.length > 0, V);
  check('★APP_VERSION が 0.7.0（v0.7 リリース版）', V === '0.7.0', V);
  check('表記は v を付けた形', LABEL === 'v' + V, LABEL);
  check('数字だけでできている', /^\d+\.\d+\.\d+$/.test(V), V);
}

console.log('\n■ ★ブラウザのタブに出る題名');
{
  /* 題名は version.js が起動時に入れます。
     HTML へ直接書くと、版を上げたとき取り残されます。 */
  check('★version.js が題名を入れている',
    /document\.title\s*=/.test(versionSrc),
    'HTMLに直接書くと、版を上げたとき取り残されます');

  check('題名に APP_VERSION を使っている',
    /document\.title[\s\S]{0,80}APP_VERSION_LABEL/.test(versionSrc));

  /* 実際に動かして、入る文字を確かめます */
  let got = '';
  const before = global.document;
  global.document = { get title() { return got; }, set title(v) { got = v; } };
  delete require.cache[require.resolve('../js/version.js')];
  require('../js/version.js');
  global.document = before;

  check('★入る題名が版と一致する', got === 'マヨイビト ' + LABEL, got);
}

console.log('\n■ ★古い版がHTMLに残っていない');
{
  const titleTags = html.match(/<title>([^<]*)<\/title>/g) || [];
  check('題名の指定は1つだけ', titleTags.length === 1, titleTags.join(' / '));

  const inside = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  check('★題名に版を直接書いていない',
    !/v?\d+\.\d+/.test(inside),
    '書いてある内容：「' + inside + '」');

  /* 過去に取り残された「v0.3」のような書き方が無いこと。
     ただし、読み込みに付ける ?v= の数字は別ものなので除きます。 */
  const withoutQuery = html.replace(/\?v=[\d.]+/g, '');
  const olds = withoutQuery.match(/マヨイビト\s*v\d+\.\d+/g) || [];
  check('★「マヨイビト v0.3」のような古い表記が残っていない',
    olds.length === 0, olds.join(' / '));
}

console.log('\n■ 読み込みに付ける ?v= が版とそろっている');
{
  /* 古いファイルを掴んだままにならないよう、
     読み込みごとに ?v= を付けています。 */
  /* v0.7 では 2系統が併存します。
       ?v=0.7.0  … v0.7 で新設した器のファイル＋v0.7 で中身を変えた既存ファイル
       ?v=0.6.10 … v0.7 で手を触れていない既存ファイル（据え置き）
     中身を変えたのに据え置くと、古いファイルを掴んだままになるため、
     変更したファイルは必ず 0.7.0 側に入っている必要があります。 */
  const OLD_VER = '0.6.10';
  const qs = [...new Set((html.match(/\?v=([\d.]+)/g) || []))];
  check('?v= が使われている', qs.length > 0, qs.join(' / '));
  const okQs = qs.every(q => q === '?v=' + V || q === '?v=' + OLD_VER);
  check('★?v= は現在の版か据え置き版のどちらか', okQs, qs.join(' / '));

  /* v0.7 で中身を変えた既存ファイルが、据え置きのままになっていないか */
  ['js/preview.js', 'css/layout.css', 'js/version.js'].forEach(function (f) {
    const m = html.match(new RegExp(f.replace(/[.\/]/g, '\\$&') + '\\?v=([\\d.]+)'));
    check('★' + f + ' は現在の版で読み込む（中身を変えたため）',
      !!m && m[1] === V, m ? '?v=' + m[1] : '見つからない');
  });
}

console.log('\n■ version.js が最初のほうで読み込まれる');
{
  /* 題名を入れるのは version.js なので、
     ほかの処理より前に読まれている必要はありませんが、
     読み込み自体は必ずされていること。 */
  check('index.html が version.js を読んでいる',
    html.indexOf('js/version.js') !== -1);
}

console.log('\n■ 説明書の版');
{
  const readme = fs.existsSync('README.md') ? fs.readFileSync('README.md', 'utf8') : '';
  check('README がある', readme.length > 0);
  check('★README の見出しが今の版', readme.indexOf(LABEL) !== -1,
    '見出しに ' + LABEL + ' が要ります');

  /* 古い版を「現在の版」として書いていないこと。
     更新履歴として過去の数字を書くのは構いません。 */
  const head = readme.split('\n').slice(0, 12).join('\n');
  const stale = (head.match(/v0\.[0-5]\b/g) || []);
  check('★冒頭に古い版が残っていない', stale.length === 0, stale.join(' / '));
}

console.log('\n' + (fail === 0
  ? '===== 版の表記：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
