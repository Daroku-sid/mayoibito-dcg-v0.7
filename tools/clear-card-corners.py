#!/usr/bin/env python3
"""
四隅の白を透明にする（v0.6.9）
---------------------------------------------------------------
カード画像は角が丸いのに、四隅に白が残っていました。
画面側で角を丸めても、丸め方が場面ごとに違うため、
大きく表示したときに白がはみ出します。

そこで画像そのものから消します。これなら、
どこにどんな大きさで出しても白は出ません。

【安全のための工夫】
絵の中の白（お札の紙、シルヴィのエプロンなど）を消さないよう、
「四隅から地続きにつながっている白」だけを塗りつぶします。
角から広がっていける範囲だけを見るので、絵の中は触りません。
"""
import os
import sys
from collections import deque
from PIL import Image

# 白とみなす明るさ。カードの枠は黒に近いので、これで十分に分かれます
WHITE = 236


def clear_corners(path):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    px = im.load()

    def is_white(x, y):
        r, g, b, a = px[x, y]
        return r >= WHITE and g >= WHITE and b >= WHITE

    # 四隅から、白がつながっている範囲だけを塗りつぶす
    seen = set()
    q = deque()
    for sx, sy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if is_white(sx, sy):
            q.append((sx, sy))
            seen.add((sx, sy))

    while q:
        x, y = q.popleft()
        px[x, y] = (255, 255, 255, 0)      # 透明にする
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and is_white(nx, ny):
                seen.add((nx, ny))
                q.append((nx, ny))

    if not seen:
        return 0
    im.save(path, 'WEBP', quality=92, method=6)
    return len(seen)


def main():
    total_files = 0
    total_px = 0
    for folder in ('images', 'images/thumb'):
        if not os.path.isdir(folder):
            continue
        for name in sorted(os.listdir(folder)):
            if not name.endswith('.webp'):
                continue
            path = os.path.join(folder, name)
            n = clear_corners(path)
            if n:
                total_files += 1
                total_px += n
    print('四隅の白を消した画像：%d 枚（%d ドット）' % (total_files, total_px))


if __name__ == '__main__':
    main()
