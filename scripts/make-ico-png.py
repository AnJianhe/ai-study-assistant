# -*- coding: utf-8 -*-
"""生成兼容性最好的多尺寸 ICO（每层都用 PNG 编码，避免 BMP 层的颜色/透明度问题）。"""
import io
import os
import struct

from PIL import Image

SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "build", "icon.png")
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "build", "app-icon.ico")
SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def main():
    src = Image.open(SRC).convert("RGBA")
    frames = []
    for w, h in SIZES:
        im = src.resize((w, h), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        frames.append((w, h, buf.getvalue()))

    header = struct.pack("<HHH", 0, 1, len(frames))
    offset = 6 + 16 * len(frames)
    entries = b""
    data = b""
    for w, h, png in frames:
        bw = 0 if w >= 256 else w
        bh = 0 if h >= 256 else h
        entries += struct.pack("<BBBBHHII", bw, bh, 0, 0, 1, 32, len(png), offset)
        offset += len(png)
        data += png

    with open(OUT, "wb") as f:
        f.write(header + entries + data)
    print("written:", OUT, os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    main()
