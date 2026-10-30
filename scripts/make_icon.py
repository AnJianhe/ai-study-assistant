# -*- coding: utf-8 -*-
"""生成应用图标 build/icon.ico（多尺寸）。"""
import os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "build", "icon.ico")
SIZE = 512

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def make_base():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    # 渐变底：紫蓝 -> 青蓝
    grad = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    px = grad.load()
    c1 = (91, 108, 255)
    c2 = (56, 199, 255)
    for y in range(SIZE):
        for x in range(SIZE):
            t = (x * 0.45 + y * 0.55) / (SIZE - 1)
            px[x, y] = lerp(c1, c2, t) + (255,)
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle([8, 8, SIZE - 9, SIZE - 9], radius=112, fill=255)
    img.paste(grad, (0, 0), mask)
    return img

def draw_book(draw):
    # 白色翻开的书
    white = (255, 255, 255, 255)
    # 左页
    draw.polygon([(108, 356), (108, 168), (240, 140), (240, 340)], fill=white)
    # 右页
    draw.polygon([(272, 340), (272, 140), (404, 168), (404, 356)], fill=white)
    # 书脊
    draw.rounded_rectangle([238, 132, 274, 352], radius=10, fill=(235, 240, 255, 255))
    # 书页线条（浅蓝）
    line = (150, 170, 255, 210)
    for i in range(4):
        y = 196 + i * 34
        draw.line([(132, y), (222, y - 12)], fill=line, width=7)
        draw.line([(290, y - 12), (380, y)], fill=line, width=7)

def draw_sparkle(draw):
    # 右上角的四角星
    star = (255, 255, 255, 255)
    cx, cy, r, w = 396, 118, 46, 14
    draw.polygon([(cx, cy - r), (cx + w, cy - w), (cx + r, cy), (cx + w, cy + w),
                  (cx, cy + r), (cx - w, cy + w), (cx - r, cy), (cx - w, cy - w)], fill=star)
    # 小星星
    cx2, cy2, r2, w2 = 452, 196, 20, 6
    draw.polygon([(cx2, cy2 - r2), (cx2 + w2, cy2 - w2), (cx2 + r2, cy2), (cx2 + w2, cy2 + w2),
                  (cx2, cy2 + r2), (cx2 - w2, cy2 + w2), (cx2 - r2, cy2), (cx2 - w2, cy2 - w2)], fill=star)

def main():
    img = make_base()
    # 柔和光晕
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([90, 90, 430, 430], fill=(255, 255, 255, 26))
    glow = glow.filter(ImageFilter.GaussianBlur(40))
    img = Image.alpha_composite(img, glow)
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw_book(draw)
    draw_sparkle(draw)
    img = Image.alpha_composite(img, layer)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (24, 24), (16, 16)]
    img.resize((256, 256), Image.LANCZOS).save(OUT, format="ICO", sizes=sizes)
    # 同时留一份 png 给窗口/文档使用
    png = os.path.join(os.path.dirname(OUT), "icon.png")
    img.resize((256, 256), Image.LANCZOS).save(png)
    print("icon written:", OUT, os.path.getsize(OUT), "bytes")

if __name__ == "__main__":
    main()
