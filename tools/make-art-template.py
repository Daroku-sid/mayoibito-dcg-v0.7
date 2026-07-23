#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一枚絵（ホームの共通アート）制作用テンプレートを作る。

v0.7 のメインハブは 1080×1920 を基準に組んであり、
一枚絵の上へ次の UI が重なる（css/v07.css の実装値と一致させている）。

  上部  プレイヤー情報 / 通貨
  中央  （タブによって）バナー・ミッション枠
  下部  タブ固有パネル / メインナビ

出力（assets/home-art/ へ）:
  _template-guide.png    … 描くときの下敷き。UI枠を線と塗りで示す
  _template-preview.png  … 仕上がり確認用。UIを濃いめに重ねる

使い方:
  python3 tools/make-art-template.py
"""

from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1080, 1920

# ---- css/v07.css の実装値（1080基準） -----------------------------
PROFILE   = (20, 20, 470, 240)     # 左, 上, 幅, 高（称号ふくむ）
NAMEPANEL = (130, 20, 360, 120)    # プレイヤー名パネル（アイコン右）
ICON      = (20, 20, 160, 160)     # 円形アイコン
CUR_W, CUR_H, CUR_GAP = 270, 70, 20
CUR_TOP, CUR_RIGHT = 20, 20

NAV_H     = 120                    # メインナビ
PANEL_GAP = 20                     # パネルとナビの間
PANELS_H  = 548                    # タブ固有パネル
PANELS_L  = 20

BANNER_TOP, BANNER_H = 0, 120      # ホームのバナー（パネル領域内の相対）
MISSION_TOP, MISSION_H = 140, 408  # ミッション枠（パネル領域内の相対）

PANELS_TOP = H - (NAV_H + PANEL_GAP + PANELS_H)   # = 1232
NAV_TOP    = H - NAV_H                            # = 1800

FONT_DIR = '/usr/share/fonts/opentype/noto'


def load_font(size, bold=False):
    for name in (['NotoSansCJK-Black.ttc', 'NotoSansCJK-Bold.ttc'] if bold
                 else ['NotoSansCJK-Regular.ttc', 'NotoSansCJK-Medium.ttc']):
        p = os.path.join(FONT_DIR, name)
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size, index=0)
            except Exception:
                pass
    for root, _, files in os.walk('/usr/share/fonts'):
        for f in files:
            if f.endswith(('.ttc', '.otf', '.ttf')) and 'CJK' in f:
                try:
                    return ImageFont.truetype(os.path.join(root, f), size, index=0)
                except Exception:
                    continue
    return ImageFont.load_default()


F_BIG   = load_font(46, bold=True)
F_MID   = load_font(34, bold=True)
F_SMALL = load_font(28)
F_TINY  = load_font(24)


def box(d, xy, outline, width=4, fill=None, dash=False):
    x, y, w, h = xy
    if fill:
        d.rectangle([x, y, x + w, y + h], fill=fill)
    if dash:
        step, on = 24, 14
        for px in range(x, x + w, step):
            d.line([px, y, min(px + on, x + w), y], fill=outline, width=width)
            d.line([px, y + h, min(px + on, x + w), y + h], fill=outline, width=width)
        for py in range(y, y + h, step):
            d.line([x, py, x, min(py + on, y + h)], fill=outline, width=width)
            d.line([x + w, py, x + w, min(py + on, y + h)], fill=outline, width=width)
    else:
        d.rectangle([x, y, x + w, y + h], outline=outline, width=width)


def label(d, x, y, text, font=F_SMALL, fill=(255, 255, 255), shadow=True):
    if shadow:
        d.text((x + 2, y + 2), text, font=font, fill=(0, 0, 0, 200))
    d.text((x, y), text, font=font, fill=fill)


def base_image(bg):
    img = Image.new('RGBA', (W, H), bg)
    d = ImageDraw.Draw(img, 'RGBA')
    return img, d


def draw_grid(d):
    """50px ごとの薄いマス目と、中心線。"""
    for x in range(0, W + 1, 50):
        c = (255, 255, 255, 46) if x % 250 else (255, 255, 255, 80)
        d.line([x, 0, x, H], fill=c, width=2)
    for y in range(0, H + 1, 50):
        c = (255, 255, 255, 46) if y % 250 else (255, 255, 255, 80)
        d.line([0, y, W, y], fill=c, width=2)
    d.line([W // 2, 0, W // 2, H], fill=(255, 255, 255, 110), width=3)


def draw_ui(d, strong):
    """UI の占有域を描く。strong=True なら塗りを濃くする（確認用）。"""
    a_fill = 150 if strong else 70
    a_line = 255 if strong else 200

    # ---- 上部：プレイヤー情報 ----
    box(d, PROFILE, (120, 200, 255, a_line), 4,
        fill=(40, 70, 140, a_fill))
    box(d, ICON, (150, 220, 255, a_line), 3)
    box(d, NAMEPANEL, (150, 220, 255, a_line), 3)
    label(d, PROFILE[0] + 12, PROFILE[1] + PROFILE[3] - 46,
          'プレイヤー情報（名前・称号・アイコン）', F_TINY)

    # ---- 上部：通貨 ----
    for i in range(2):
        x = W - CUR_RIGHT - CUR_W
        y = CUR_TOP + i * (CUR_H + CUR_GAP)
        box(d, (x, y, CUR_W, CUR_H), (255, 210, 120, a_line), 4,
            fill=(120, 90, 30, a_fill))
    label(d, W - CUR_RIGHT - CUR_W, CUR_TOP + 2 * (CUR_H + CUR_GAP) + 6,
          '通貨', F_TINY)

    # ---- 下部：タブ固有パネル ----
    box(d, (PANELS_L, PANELS_TOP, W - PANELS_L * 2, PANELS_H),
        (200, 160, 255, a_line), 4, fill=(70, 45, 120, a_fill))
    label(d, PANELS_L + 14, PANELS_TOP + 12,
          'タブ固有パネル（ホームではバナー＋ミッション）', F_SMALL)

    # ホームタブの内訳
    bx = PANELS_L + 20
    by = PANELS_TOP + BANNER_TOP + 40
    box(d, (bx, by, W - PANELS_L * 2 - 40, BANNER_H), (220, 200, 255, a_line), 3)
    label(d, bx + 10, by + 8, 'バナー', F_TINY)
    my = PANELS_TOP + MISSION_TOP + 40
    box(d, (bx, my, W - PANELS_L * 2 - 40, MISSION_H), (220, 200, 255, a_line), 3)
    label(d, bx + 10, my + 8, 'ミッション枠', F_TINY)

    # ---- 下部：メインナビ ----
    box(d, (0, NAV_TOP, W, NAV_H), (255, 255, 255, a_line), 4,
        fill=(20, 26, 44, min(255, a_fill + 60)))
    for i in range(1, 5):
        x = W * i // 5
        d.line([x, NAV_TOP, x, H], fill=(255, 255, 255, a_line), width=2)
    names = ['ホーム', 'カード', '対戦', 'ショップ', 'その他']
    for i, n in enumerate(names):
        cx = W * i // 5 + W // 10
        tw = d.textlength(n, font=F_TINY)
        label(d, cx - tw / 2, NAV_TOP + NAV_H // 2 - 14, n, F_TINY)


def draw_safe_zone(d):
    """顔・見せ場を置くとよい範囲。"""
    top, bottom = PROFILE[1] + PROFILE[3], PANELS_TOP
    # うっすら塗って、帯がひと目でわかるようにする
    d.rectangle([0, top, W, bottom], fill=(120, 255, 170, 26))
    box(d, (0, top, W, bottom - top), (120, 255, 170, 230), 5, dash=True)
    label(d, 24, top + 14,
          f'■ 安全範囲（UIに隠れない）  上{top}px 〜 下{bottom}px',
          F_MID, (150, 255, 200))
    label(d, 24, top + 60,
          'キャラクターの顔・見せ場はこの帯の中に。中央よりやや上が収まりよし',
          F_SMALL, (150, 255, 200))


def make_guide(path):
    img, d = base_image((16, 22, 40, 255))
    draw_grid(d)
    draw_ui(d, strong=False)
    draw_safe_zone(d)
    # 目盛り
    for y in (PROFILE[1] + PROFILE[3], PANELS_TOP, NAV_TOP):
        d.line([0, y, W, y], fill=(255, 120, 120, 220), width=3)
        label(d, W - 190, y + 8, f'y={y}', F_TINY, (255, 170, 170))
    label(d, 24, 24, '一枚絵テンプレート（下敷き用）', F_BIG)
    label(d, 24, 84, '1080×1920 / この画像の上に描く・書き出しは WebP', F_SMALL)
    # 帯のまん中に、いちばん伝えたいことを大きく置く
    cy = (PROFILE[1] + PROFILE[3] + PANELS_TOP) // 2
    t = 'ここに顔・見せ場'
    tw = d.textlength(t, font=F_BIG)
    label(d, (W - tw) / 2, cy - 30, t, F_BIG, (170, 255, 210))
    img.convert('RGB').save(path, 'PNG')
    return path


def make_preview(path):
    img, d = base_image((30, 36, 58, 255))
    draw_grid(d)
    draw_ui(d, strong=True)
    label(d, 24, 24, '仕上がり確認用（UIを濃く重ねたもの）', F_BIG)
    label(d, 24, 84, '描いた絵を下に敷いて、隠れ具合をたしかめる', F_SMALL)
    img.convert('RGB').save(path, 'PNG')
    return path


def main():
    out = os.path.join('assets', 'home-art')
    os.makedirs(out, exist_ok=True)
    g = make_guide(os.path.join(out, '_template-guide.png'))
    p = make_preview(os.path.join(out, '_template-preview.png'))
    print('作成:', g)
    print('作成:', p)
    print()
    print(f'安全範囲: 上 {PROFILE[1] + PROFILE[3]}px 〜 下 {PANELS_TOP}px'
          f'（高さ {PANELS_TOP - (PROFILE[1] + PROFILE[3])}px）')


if __name__ == '__main__':
    main()
