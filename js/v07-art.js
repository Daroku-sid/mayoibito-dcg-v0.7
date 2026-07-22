/* =====================================================================
   v07-art.js ― 共通一枚絵レイヤー（Stage 2・第5部）
   ---------------------------------------------------------------------
   ・起動ごとにエリーゼ／スミレからランダム開始（5.1）
   ・10秒ごとに自動で次へ（5.4）
   ・中央タップで即切り替え＋10秒リセット（5.5）
   ・0.5秒クロスフェード（5.4）。演出中はタップを受け付けない（5.6）
   ・次の画像は事前読み込み。白飛び・空白を出さない（5.4）
   ・タイマーは V7Timers で二重生成しない（5.6 / 26.3）
   ・読み込み失敗のフォールバック（5.9）
   画像はまだ支給されていないため、失敗時は濃紺で成立させます。
   ===================================================================== */

'use strict';

const V7Art = {

  AUTO_MS: 10000,     // 10秒（5.4）
  FADE_MS: 500,       // 0.5秒クロスフェード（5.4）

  _list: [],          // enabled かつ 読み込み成功したものだけ
  _idx: 0,            // いま表示中の _list 内の位置
  _slotA: null,
  _slotB: null,
  _showingA: true,    // いまAとBどちらが前面か
  _fading: false,
  _paused: false,
  _failedNotified: false,

  init: function () {
    this._slotA = document.getElementById('v7-art-a');
    this._slotB = document.getElementById('v7-art-b');

    // 使う候補（enabled のみ）。読み込み可否はこのあと確かめる。
    const enabled = (typeof V7_HOME_ART !== 'undefined' ? V7_HOME_ART : [])
      .filter(function (a) { return a.enabled; });

    const self = this;
    this._preloadAll(enabled, function (okList, anyFailed) {
      self._list = okList;
      self._setupList(okList, anyFailed);
    });

    // 中央タップ（5.5）
    const tap = document.getElementById('v7-art-tap');
    if (tap) tap.addEventListener('click', function () { self.manualNext(); });
  },

  /* すべての候補を事前読み込みし、成功したものだけ渡す（5.4 / 5.9） */
  _preloadAll: function (list, done) {
    if (!list.length) { done([], false); return; }
    let remain = list.length;
    let anyFailed = false;
    const ok = [];
    list.forEach(function (art) {
      const img = new Image();
      img.onload = function () { ok.push(art); finish(); };
      img.onerror = function () { anyFailed = true; finish(); };
      img.src = art.imagePath;
    });
    function finish() {
      remain--;
      if (remain === 0) {
        // 元の並び順を保つ
        const ordered = list.filter(function (a) { return ok.indexOf(a) >= 0; });
        done(ordered, anyFailed);
      }
    }
  },

  _setupList: function (okList, anyFailed) {
    if (!okList.length) {
      // 2枚とも失敗（5.9）：濃紺のまま。ハブは使える。
      this._applyFallback(this._slotA);
      this._applyFallback(this._slotB);
      this._notifyFailedOnce();
      return;
    }
    // ランダム開始（5.1）
    this._idx = Math.floor(Math.random() * okList.length);
    this._paint(this._slotA, okList[this._idx]);
    this._slotA.classList.add('is-front');
    this._slotB.classList.remove('is-front');
    this._showingA = true;

    if (anyFailed) this._notifyFailedOnce();

    // 自動切り替え開始（2枚以上のときのみ意味がある）
    this.resume();
  },

  _paint: function (slot, art) {
    if (!slot) return;
    slot.style.backgroundImage = 'url("' + art.imagePath + '")';
    slot.dataset.artId = art.id;
  },

  _applyFallback: function (slot) {
    if (!slot) return;
    slot.style.backgroundImage = 'none';
    slot.dataset.artId = '';
  },

  _notifyFailedOnce: function () {
    if (this._failedNotified) return;
    this._failedNotified = true;
    // メインハブ表示後に上部へ1回だけ（5.9）
    if (typeof V7Toast !== 'undefined') {
      V7Toast.push('一部の画像を読み込めませんでした。');
    }
  },

  /* 自動切り替えのタイマーを張る（5.4 / 5.7） */
  resume: function () {
    this._paused = false;
    this._scheduleAuto();
  },

  pause: function () {
    this._paused = true;
    V7Timers.clear('art-auto');
  },

  _scheduleAuto: function () {
    V7Timers.clear('art-auto');                 // 二重生成しない（5.6）
    if (this._paused) return;
    if (this._list.length < 2) return;          // 1枚以下なら自動停止（5.9）
    const self = this;
    V7Timers.set('art-auto', function () { self._auto(); }, this.AUTO_MS);
  },

  _auto: function () {
    if (this._fading) return;                   // 演出中は重ねない（5.6）
    this._goToNext();
    this._scheduleAuto();
  },

  /* 中央タップの手動切り替え（5.5） */
  manualNext: function () {
    if (this._fading) return;                   // クロスフェード中は無視（5.6）
    if (this._list.length < 2) return;
    this._goToNext();
    this._scheduleAuto();                        // 手動後は10秒リセット（5.5）
  },

  _goToNext: function () {
    if (this._list.length < 2) return;
    const next = (this._idx + 1) % this._list.length;
    const from = this._showingA ? this._slotA : this._slotB;
    const to = this._showingA ? this._slotB : this._slotA;

    // 次の絵を背面スロットに用意（すでに事前読み込み済み）
    this._paint(to, this._list[next]);

    // クロスフェード（5.4）。前面/背面を入れ替える
    this._fading = true;
    void to.offsetWidth;
    to.classList.add('is-front');
    from.classList.remove('is-front');

    const self = this;
    V7Timers.set('art-fade', function () {
      self._fading = false;
      self._showingA = !self._showingA;
      self._idx = next;
    }, this.FADE_MS);
  },

  currentArtId: function () {
    const slot = this._showingA ? this._slotA : this._slotB;
    return slot ? (slot.dataset.artId || '') : '';
  },
};

/* Node（テスト）からも使えるように */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { V7Art: V7Art };
}
