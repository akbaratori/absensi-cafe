#!/usr/bin/env python3
"""
Perbaiki ikon PWA yang isinya SVG tetapi bernama .png.

`manifest.json` mendeklarasikan `"type": "image/png"`, sementara berkas
`icon-192x192.png` / `icon-512x512.png` sebenarnya berisi teks SVG. Chrome
menolaknya dengan:
    Error while trying to use the following icon from the Manifest: ...
    (Download error or resource isn't a valid image)

Skrip ini menggambar ulang ikon ke PNG asli memakai modul `zlib` bawaan Python
(tanpa Pillow / ImageMagick) dengan gaya yang sama seperti SVG-nya: latar
gradien indigo dan huruf "A" berwarna putih sebagai logo.

Pemakaian (dari folder frontend/):
    python scripts/make-pwa-icons.py
"""

import math
import os
import struct
import zlib

# Warna gradien sama dengan public/icons/*.svg: #6c63ff -> #4f46e5
C_FROM = (0x6C, 0x63, 0xFF)
C_TO = (0x4F, 0x46, 0xE5)
WHITE = (0xFF, 0xFF, 0xFF)

# Tinggi huruf "A" dibanding sisi ikon.
GLYPH_RATIO = 0.52

# Huruf A: 4 batang (kiri, kanan, palang, dan kaki) dalam koordinat ternormalisasi.
# x 0..1 -> kiri..kanan, y 0..1 -> atas..bawah.
A_STROKES = [
    # kaki kiri (dari puncak ke kiri bawah), dinyatakan sebagai (x_at_y0, x_at_y1, y0, y1)
    (0.46, 0.12, 0.00, 1.00),
    # kaki kanan
    (0.54, 0.88, 0.00, 1.00),
    # palang tengah
    (0.24, 0.76, 0.62, 0.79),
]


def lerp(a, b, t):
    return a + (b - a) * t


def gradient(x, y, size):
    """Warna gradien diagonal, sama arah dengan SVG (0% 0% -> 100% 100%)."""
    t = (x + y) / (2.0 * (size - 1)) if size > 1 else 0.0
    return tuple(int(round(lerp(C_FROM[i], C_TO[i], t))) for i in range(3))


def coverage(px, py, size):
    """
    Perkiraan cakupan huruf A di titik (px, py) dengan supersampling 3x3
    supaya tepinya tidak bergerigi.
    """
    ss = 3
    hits = 0
    # Kotak pembatas huruf A.
    gx0 = (1.0 - GLYPH_RATIO) / 2.0 * size
    gy0 = (1.0 - GLYPH_RATIO) / 2.0 * size
    wan = 0.085 * size  # lebar batang
    gx1 = gx0 + GLYPH_RATIO * size
    gy1 = gy0 + GLYPH_RATIO * size

    for si in range(ss):
        for sj in range(ss):
            x = px + (si + 0.5) / ss
            y = py + (sj + 0.5) / ss
            if not (gx0 <= x <= gx1 and gy0 <= y <= gy1):
                continue
            # Koordinat ternormalisasi terhadap kotak huruf.
            u = (x - gx0) / (gx1 - gx0)
            v = (y - gy0) / (gy1 - gy0)
            inside = False
            for xa, xb, ya, yb in A_STROKES:
                if ya <= v <= yb:
                    t = (v - ya) / (yb - ya) if yb > ya else 0.0
                    cx = lerp(xa, xb, t)
                    # Batang melebar ke kanan mengikuti kemiringan kaki.
                    if abs(u - cx) <= (wan / 2.0) / (gx1 - gx0):
                        inside = True
                        break
            if inside:
                hits += 1
    return hits / (ss * ss)


def aa_ring(px, py, size):
    """
    Cincin hijau aksen (#10b981) di kanan bawah, plus centang putih —
    menirukan elemen dekoratif pada versi SVG.
    """
    d = size / 192.0
    cx, cy, r = 138 * d, 138 * d, 35 * d
    dist = math.hypot(px - cx, py - cy)
    if dist > r + 1:
        return None
    if dist > r:
        return (0x10, 0xB9, 0x81)
    # Centang: dua batang pendek.
    lw = 5 * d
    p1 = ((124 * d, 138 * d), (134 * d, 148 * d))
    p2 = ((134 * d, 148 * d), (152 * d, 130 * d))
    for (ax, ay), (bx, by) in (p1, p2):
        vx, vy = bx - ax, by - ay
        wx, wy = px - ax, py - ay
        seg = vx * vx + vy * vy
        t = 0.0 if seg == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / seg))
        if math.hypot(px - (ax + t * vx), py - (ay + t * vy)) <= lw:
            return WHITE
    return None


def make_icon(size):
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            r, g, b = gradient(x, y, size)
            cov = coverage(x, y, size)
            if cov > 0:
                r = int(round(lerp(r, WHITE[0], cov)))
                g = int(round(lerp(g, WHITE[1], cov)))
                b = int(round(lerp(b, WHITE[2], cov)))
            accent = aa_ring(x, y, size)
            if accent is not None and cov == 0:
                r, g, b = accent
            row += bytes((r, g, b))
        rows.append(row)
    return rows


def write_png(path, size, rows):
    """Tulis PNG 8-bit truecolor. Setiap baris didahului filter byte 0."""
    raw = bytearray()
    for row in rows:
        raw.append(0)
        raw += row

    def chunk(kind, payload):
        return (
            struct.pack('>I', len(payload))
            + kind
            + payload
            + struct.pack('>I', zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    png = (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', ihdr)
        + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
        + chunk(b'IEND', b'')
    )
    with open(path, 'wb') as fh:
        fh.write(png)
    return len(png)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    icons = os.path.normpath(os.path.join(here, '..', 'public', 'icons'))
    for size in (72, 192, 512):
        # badge-72x72 dan icon-72x72 memakai gambar yang sama.
        targets = [f'icon-{size}x{size}.png']
        if size == 72:
            targets.append('badge-72x72.png')
        rows = make_icon(size)
        for name in targets:
            path = os.path.join(icons, name)
            n = write_png(path, size, rows)
            print(f'{name}: {n} bytes ({size}x{size} RGBA->RGB PNG)')


if __name__ == '__main__':
    main()
